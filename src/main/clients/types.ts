export type FetchFn = typeof fetch;

export interface FetchContext {
  token: string;
  fetch?: FetchFn;
}

/** Per-invocation context for a write-side action. `payload` is whatever
 *  the caller passes through `serviceHub.invoke()`. */
export interface ActionContext {
  token: string;
  fetch?: FetchFn;
  payload: Record<string, unknown>;
}

export type ServiceAction = (ctx: ActionContext) => Promise<unknown>;
export type ActionMap = Record<string, ServiceAction>;

/** Re-export from `src/shared/advisorTypes.ts` so existing
 *  `import { ServiceAdvisorResponse } from './types'` callers continue
 *  to work, while the renderer pulls the same type from `shared/`. */
export type { ServiceAdvisorResponse } from '../../shared/advisorTypes';

export class FetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly serviceId: string,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

// Single source of truth lives in `src/shared/redact.ts` (used by both main
// and the renderer's BYO-proxy). Imported for local use in `jsonFetch` and
// re-exported so existing `import { redactSecrets } from './types'` callers
// are unaffected.
import {
  DEFAULT_HTTP_TIMEOUT_MS,
  MAX_HTTP_RESPONSE_BYTES,
  declaredLengthExceeds,
  egressInit,
  isRedirectResponse,
  readBodyWithCap,
  readFailureBody,
  redirectRefusal,
  withTimeout,
} from '../../shared/httpLimits';
import {
  redactSecrets,
  redactForMessage,
  safeErrorMessage,
  MAX_RESPONSE_BODY_IN_MESSAGE,
  MAX_WARNING_BODY_CHARS,
  MAX_MALFORMED_JSON_ECHO_CHARS,
} from '../../shared/redact';
/* 天井は `shared/redact.ts` の梯子が 1 つだけ持つ (パス 273)。main 側のクライアントは
 * `./types` 経由でしか redact に触れないので、ここから再輸出する —— 数を写さない。 */
export {
  redactSecrets,
  redactForMessage,
  safeErrorMessage,
  MAX_RESPONSE_BODY_IN_MESSAGE,
  MAX_WARNING_BODY_CHARS,
  MAX_MALFORMED_JSON_ECHO_CHARS,
};

/**
 * 全 SaaS クライアントが通る 1 本の口。**打ち切りと応答サイズの上限もここ。**
 *
 * 2026-08-22 まではどちらも無く、応答しない相手では `await` が返らず
 * (画面は「読込中…」のまま)、巨大な応答はそのままメモリに載っていた。
 * 74 クライアントが同じ関数を通るので、ここ 1 か所で全部に効く ——
 * 裏を返せば、1 か所抜けていたので全部抜けていた。
 *
 * 相手は TLS 検証済みの既知ホストが大半だが、守るのは攻撃より**事故**である。
 * 障害中のサービスが接続だけ受けて応答しない、プロキシが巨大なエラーページを
 * 返す —— どちらも利用者から見た症状は同じになる。
 */
export interface LimitedFetchCtx {
  fetch?: FetchFn;
  serviceId: string;
  timeoutMs?: number;
  maxBytes?: number;
}

/**
 * **打ち切りだけを掛けて `Response` をそのまま返す口。**
 *
 * ## なぜ `jsonFetch` と別に要るか
 *
 * `jsonFetch` は必ず本文を読んで `JSON.parse` する。だが相手が JSON を
 * 返さない経路が実際に在る:
 *
 * ```
 *   microsoft-365 sendMail   202 Accepted・本文なし
 *   shopify postExpectOk     Discord webhook の 204
 *   security  HIBP           404 が「侵害なし」という正常応答
 *   business / stocks advise 応答は JSON だが失敗本文も自前で扱う
 * ```
 *
 * これらは 2026-08-23 まで **`ctx.fetch ?? fetch` を直に呼んでいた** ——
 * つまり `jsonFetch` に入れた打ち切りも応答サイズの上限も**掛かっていなかった**。
 * `httpLimits.ts` に「74 クライアント全部がここを通る」と書いたのは
 * *snapshot の経路*の話で、**action の一部は通っていなかった**。
 * 実測 (`__tests__/fetchTimeouts.test.ts`) で `signal: null` を確認している。
 *
 * 「JSON を返さないから素の fetch」で正しいのは**本文の扱い**だけで、
 * **打ち切りは形に関係なく要る**。そこをこの関数で分ける。
 *
 * ## なぜ `Response` を返さず callback を取るのか (2026-08-28)
 *
 * 最初は `Promise<Response>` を返していた。**それだと打ち切りが本文に
 * 掛からない** —— `fetch` はヘッダで解決するので、`withTimeout` の
 * `finally` が唯一の abort 源を落とした後に呼び出し側が本文を読むことになる。
 *
 * 実測: ヘッダを flush して本文を途中で止めるサーバに `timeoutMs: 1000` で
 * 当てると、4000ms を超えても返らなかった。既存の検査 (`fetchTimeouts.test.ts`)
 * は**要求時点で `init.signal` が非 null か**しか見ないので、全部通っていた。
 *
 * 使い終えるところまで `consume` の中へ入れることで、締切が本文にも掛かる。
 * `withTimeout` 自身も `Response` を返されたら大声で落とすようにした。
 */
/**
 * 読まなかった本文を捨てる。
 *
 * 未消費の応答本文を放置すると undici (Electron main / Node) はソケットを
 * プールへ返さず、GC の finalization まで借りたままにする。対になる
 * `readBodyWithCap` は上限超過で `reader.cancel()` してから投げるのに、
 * `limitedFetch` の先手の門と「本文を読まない応答」だけが非対称だった
 * (2026-08-28 のレビューで発見)。
 *
 * **判定を try で包まない。** 最初は `if (!res.bodyUsed && res.body &&
 * !res.body.locked)` を丸ごと try の中に置いていたが、変異検査で 4 件が生き
 * 残った —— どのガードを潰しても catch が同じように差を飲むので、**外から
 * 観測できない**。防御が厚いのではなく、**効いているかどうか誰にも分からない**
 * 形だった (2026-08-29)。
 *
 * 早期 return にすると、どのガードを潰しても観測できる:
 *   - 条件を `true` へ → 捨てなくなる      → 「本文を捨てる」検査が落ちる
 *   - `locked` を `false` へ → 掴まれた stream に cancel して**同期で投げる**
 *     (`.catch` は同期の throw を拾わない) → 呼び出し側まで漏れて落ちる
 *   - `body === null` を `false` へ → `null.locked` で投げる
 *     → 本文なし (204) の検査が落ちる
 */
async function discardBody(res: Response): Promise<void> {
  const body = res.body;
  // `body` が無いのは 204/304 と、**本文を持たない素朴な fetch モック**。
  // 後者を許すのはこの repo の既定の方針で、`readBodyWithCap` が
  // 「`res.body` が無い実行環境 (テストの素朴な fetch モック) では `text()` に
  //  落とす」と明記している。最初 `=== null` で書いて 7 件落とした ——
  // **片方の関数だけ厳しくしても、モックが変わるわけではない。**
  // 読み終えていれば stream は reader に掴まれたままなので、捨てるものも無い。
  if (!body || body.locked) return;
  await body.cancel().catch(() => {});
}

export async function limitedFetch<T>(
  url: string,
  init: RequestInit,
  ctx: LimitedFetchCtx,
  consume: (res: Response) => Promise<T>,
): Promise<T> {
  const f = ctx.fetch ?? fetch;
  const maxBytes = ctx.maxBytes ?? MAX_HTTP_RESPONSE_BYTES;
  return withTimeout(
    ctx.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS,
    init.signal,
    async (signal) => {
      let res: Response;
      try {
        res = await f(url, egressInit({ ...init, signal }));
      } catch (e) {
        if (signal.aborted) {
          throw new FetchError(`${ctx.serviceId} が時間内に応答しませんでした`, 0, ctx.serviceId);
        }
        throw e;
      }

      // 転送には追随しない (`httpLimits.ts` の規則)。送り先の関門は 1 ホップ目にしか無い。
      if (isRedirectResponse(res)) {
        await discardBody(res);
        throw new FetchError(redirectRefusal(res, url, ctx.serviceId), res.status, ctx.serviceId);
      }

      // 宣言された長さが上限を超えていれば、本文を読む前に落とす (先手の門)。
      const declared = declaredLengthExceeds(res, maxBytes);
      if (declared !== null) {
        await discardBody(res);
        throw new FetchError(
          `${ctx.serviceId} response too large (${declared} > ${maxBytes} bytes)`,
          res.status,
          ctx.serviceId,
        );
      }

      try {
        return await consume(res);
      } catch (e) {
        // 締切で切られたなら、本文の読み取り途中でも「時間内に応答しなかった」
        // と言う。ここを素通しにすると `AbortError` がそのまま画面へ出る。
        if (signal.aborted && !(e instanceof FetchError)) {
          throw new FetchError(
            `${ctx.serviceId} が時間内に応答しませんでした`,
            res.status,
            ctx.serviceId,
          );
        }
        throw e;
      } finally {
        // `consume` が本文を読まなかったら捨てる (202 Accepted / 204 / HIBP の 404)。
        await discardBody(res);
      }
    },
  );
}

/** `limitedFetch` と同じ上限で本文を読む (呼び出し側が本文を自分で扱う場合)。 */
export function readCapped(res: Response, ctx: LimitedFetchCtx): Promise<string> {
  return readBodyWithCap(res, ctx.maxBytes ?? MAX_HTTP_RESPONSE_BYTES, ctx.serviceId);
}

/**
 * `!ok` を断り、本文を上限つきで読んで `JSON.parse` するところまで。
 * **封筒の形はここでは見ない** (見る版と見ない版で分かれる直前)。
 */
async function readJsonBody(res: Response, ctx: LimitedFetchCtx, maxBytes: number): Promise<unknown> {
  if (!res.ok) {
    // 失敗の本文も上限つきで読む。落ちている相手ほど大きなものを返しうる (規則は readFailureBody)。
    const body = await readFailureBody(res, ctx.serviceId, maxBytes);
    throw new FetchError(
      `${ctx.serviceId} ${res.status}: ${redactForMessage(body, MAX_RESPONSE_BODY_IN_MESSAGE)}`,
      res.status,
      ctx.serviceId,
    );
  }
  const text = await readBodyWithCap(res, maxBytes, ctx.serviceId);
  try {
    return JSON.parse(text);
  } catch {
    throw new FetchError(`${ctx.serviceId} の応答が JSON ではありません`, res.status, ctx.serviceId);
  }
}

/**
 * **封筒を確かめず、読めた JSON をそのまま返す口** (2026-09-14 ・ パス 262)。
 *
 * `jsonFetch<T>` は「先頭は JSON のオブジェクト」を要求する。だが
 * **呼び出し側が全部の形を自分で見る**経路が 1 つ在る: `cursor` は
 * `CursorJsonFetch = (url, init) => Promise<unknown>` を契約として宣言し、
 * 3 つの応答を `normalizeMembers` / `normalizeUsage` / `normalizeSpend` で
 * 自分で正規化する (配列を直接返す形も、包んだ形も読む)。ここに
 * オブジェクトの要求を掛けると、**その正規化が正しく扱える応答を断って**
 * しまう。
 *
 * ブラウザ版も同じモジュールへ素の JSON を渡す (`web-shim` の
 * `getProxyJsonFetch`) ので、この口を使うことで**両ビルドが同じ物を見る**。
 *
 * 新しい呼び出しを足すなら `jsonFetch<T>` が既定 ——
 * こちらは「読む側が `unknown` を宣言している」ことが条件で、
 * `__tests__/malformedResponseCensus.test.ts` が呼び出し元を数えている。
 */
export async function jsonFetchAny(
  url: string,
  init: RequestInit,
  ctx: LimitedFetchCtx,
): Promise<unknown> {
  const maxBytes = ctx.maxBytes ?? MAX_HTTP_RESPONSE_BYTES;
  return limitedFetch(url, init, ctx, (res) => readJsonBody(res, ctx, maxBytes));
}

export async function jsonFetch<T>(
  url: string,
  init: RequestInit,
  ctx: LimitedFetchCtx,
): Promise<T> {
  const maxBytes = ctx.maxBytes ?? MAX_HTTP_RESPONSE_BYTES;
  return limitedFetch(url, init, ctx, async (res) => {
    const parsed = await readJsonBody(res, ctx, maxBytes);
    /*
     * **封筒だけはここで確かめる** (2026-09-14 ・ パス 262)。
     *
     * `as T` は 1 つも確かめないので、`null` の本文は呼び出し側の
     * `data.files ?? []` へそのまま渡り、`??` に届く前に
     * `Cannot read properties of null (reading 'files')` で落ちていた ——
     * **欄は守っているのに封筒を仮定していた**形で、14 のネットワーク
     * クライアントのうち 12 がこれだった (実測)。文面は相手先も理由も
     * 言わないので、画面には V8 の英語の型エラーがそのまま出る。
     *
     * 全呼び出しの型引数を数えた: `jsonFetch<T>` の T はどれもオブジェクト型で、
     * **先頭が配列やスカラーの応答を待っている呼び出しは 1 つも無い**
     * (`CfWrap<CfZone[]>` も封筒はオブジェクト)。唯一の例外 `cursor` は
     * `unknown` を宣言して自分で正規化するので `jsonFetchAny` を使う ——
     * 最初この分岐を作らずに全部へ掛け、cursor の既存の検査 3 件が
     * **正しく落ちた** (包み方に依存しない読み手を断っていた)。
     *
     * **欄の中身はここでは見ない。** それはクライアントごとに違うので、
     * 画面へ出る数字を作る所 (github の user・freee の companies) で
     * 別に要求する。
     */
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new FetchError(
        `${ctx.serviceId} の応答が JSON のオブジェクトではありません`,
        res.status,
        ctx.serviceId,
      );
    }
    return parsed as T;
  });
}
