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
  readBodyWithCap,
  withTimeout,
} from '../../shared/httpLimits';
import { redactSecrets, redactForMessage, safeErrorMessage } from '../../shared/redact';
export { redactSecrets, redactForMessage, safeErrorMessage };

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
 */
export async function limitedFetch(
  url: string,
  init: RequestInit,
  ctx: LimitedFetchCtx,
): Promise<Response> {
  const f = ctx.fetch ?? fetch;
  const maxBytes = ctx.maxBytes ?? MAX_HTTP_RESPONSE_BYTES;
  const res = await withTimeout(
    ctx.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS,
    init.signal,
    async (signal) => {
      try {
        return await f(url, { ...init, signal });
      } catch (e) {
        if (signal.aborted) {
          throw new FetchError(`${ctx.serviceId} が時間内に応答しませんでした`, 0, ctx.serviceId);
        }
        throw e;
      }
    },
  );

  // 宣言された長さが上限を超えていれば、本文を読む前に落とす (先手の門)。
  const declared = declaredLengthExceeds(res, maxBytes);
  if (declared !== null) {
    throw new FetchError(
      `${ctx.serviceId} response too large (${declared} > ${maxBytes} bytes)`,
      res.status,
      ctx.serviceId,
    );
  }
  return res;
}

/** `limitedFetch` と同じ上限で本文を読む (呼び出し側が本文を自分で扱う場合)。 */
export function readCapped(res: Response, ctx: LimitedFetchCtx): Promise<string> {
  return readBodyWithCap(res, ctx.maxBytes ?? MAX_HTTP_RESPONSE_BYTES, ctx.serviceId);
}

export async function jsonFetch<T>(
  url: string,
  init: RequestInit,
  ctx: LimitedFetchCtx,
): Promise<T> {
  const maxBytes = ctx.maxBytes ?? MAX_HTTP_RESPONSE_BYTES;
  const res = await limitedFetch(url, init, ctx);

  if (!res.ok) {
    // 失敗の本文も上限つきで読む。落ちている相手ほど大きなものを返しうる。
    const body = await readBodyWithCap(res, maxBytes, ctx.serviceId).catch(() => '');
    throw new FetchError(
      `${ctx.serviceId} ${res.status}: ${redactForMessage(body, 200)}`,
      res.status,
      ctx.serviceId,
    );
  }

  const text = await readBodyWithCap(res, maxBytes, ctx.serviceId);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new FetchError(`${ctx.serviceId} の応答が JSON ではありません`, res.status, ctx.serviceId);
  }
}
