/**
 * `src/shared/api/*` の HTTP コア。
 *
 * `src/main/clients/types.ts` の `jsonFetch` と**同じ振る舞い**を意図的に
 * 揃えている（失敗時は本文を 200 字に切って `redactSecrets` で伏せ、
 * status と serviceId を持った例外にする）。実装を共有していないのは
 * import 境界のため — `src/shared/**` は `shared` からしか import できず、
 * `src/main/**` に依存できない（`scripts/check-import-boundaries.cjs`）。
 * 秘密の伏せ方だけは `shared/redact.ts` が単一の真実源なので共有している。
 *
 * `fetch` は注入できる。ネットワーク無しで単体テストするためで、
 * `src/main/clients/*` と同じ作法（`vi.fn<typeof fetch>()`）で書ける。
 */

import { redactForMessage } from '../redact';
import {
  DEFAULT_HTTP_TIMEOUT_MS,
  MAX_HTTP_RESPONSE_BYTES,
  readBodyWithCap,
  withTimeout,
} from '../httpLimits';

export type FetchFn = typeof fetch;

/** 応答が 2xx でなかったときの例外。status と serviceId を残す。 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly serviceId: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * 実装していない機能を**黙って成功に見せない**ための例外。
 *
 * 元のスタブは `[]` や `{ ok: true }` を返しており、呼び出し側からは
 * 「成功した」と区別が付かなかった。書き込み系でこれをやると、
 * 実際には何も起きていないのに成功として扱われる。分からないものは
 * 分からないと落とす。
 */
export class NotImplementedError extends Error {
  constructor(serviceId: string, method: string, reason: string) {
    super(`${serviceId}.${method}() は未実装です: ${reason}`);
    this.name = 'NotImplementedError';
  }
}

export interface RequestContext {
  readonly fetch?: FetchFn;
  readonly serviceId: string;
  /**
   * 1 要求に許す時間 (既定 `DEFAULT_HTTP_TIMEOUT_MS` = 30 秒)。
   * **本文を読み終えるまで**を含む —— `fetch` はヘッダで解決するので、
   * 締切を本文に掛けるには読み出しごと同じ signal の下に置く必要がある。
   */
  readonly timeoutMs?: number;
  /** 応答本文の上限 (既定 `MAX_HTTP_RESPONSE_BYTES` = 10MiB)。超えたら読むのをやめて投げる。 */
  readonly maxBytes?: number;
}

/** `Authorization: Bearer` を組み立てる。追加ヘッダを重ねられる。 */
export function bearer(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${token}`, ...extra };
}

/** JSON 本文を送るときのヘッダ。 */
export function jsonBody(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return bearer(token, { 'Content-Type': 'application/json', ...extra });
}

/**
 * JSON を取得する。2xx 以外は `ApiError`。
 *
 * 本文をそのまま例外に載せない: 上流が資格情報を反射して返すことがあり、
 * ログや画面に出た時点で漏れる。`redactSecrets` を通し 200 字で切る。
 *
 * ## 上限と締切 (2026-08-31)
 *
 * ここは長らく `f(url, init)` → `res.json()` の素のままで、
 * **本文の大きさにも時間にも上限が無かった**。ファイル冒頭が「`jsonFetch` と
 * 同じ振る舞いを意図的に揃えている」と書いているのに、main 側だけが
 * 2026-08-28〜29 に締切と上限を得て、こちらは置き去りになっていた ——
 * **同じと書いてあるものが同じでなくなるのが、いちばん見つけにくい**。
 *
 * `src/shared/api/*` のクライアント 8 種は今どちらの実行対象からも
 * 呼ばれていない (実測: 参照 0)。だから今日の穴ではないが、
 * `CLAUDE.md` はこの層を「フレームワーク非依存のクライアント層」として
 * 案内している —— 誰かが繋いだ瞬間に、上限も締切も無い経路が生きる。
 *
 * `jsonFetch` と同じ 3 点に揃える:
 *   1. 締切は**本文を読み終えるまで**に掛ける (`withTimeout` の中で読む)。
 *      `fetch` はヘッダで解決するので、`Response` を外へ返した時点で
 *      締切は本文に届かない。
 *   2. 成功・失敗どちらの本文も `readBodyWithCap` で読む。
 *   3. JSON にならない応答は `SyntaxError` を素通しせず `ApiError` にする
 *      (status を残す)。
 *
 * 読み残しの本文を捨てる `discardBody` は要らない —— ここは成功でも失敗でも
 * **必ず本文を読む**ので、未消費の応答が残る経路が無い。
 */
export async function apiFetch<T>(url: string, init: RequestInit, ctx: RequestContext): Promise<T> {
  const f = ctx.fetch ?? fetch;
  const maxBytes = ctx.maxBytes ?? MAX_HTTP_RESPONSE_BYTES;
  return withTimeout(ctx.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS, init.signal, async (signal) => {
    const res = await f(url, { ...init, signal });
    if (!res.ok) {
      // 失敗の本文も上限つきで読む。落ちている相手ほど大きなものを返しうる。
      const body = await readBodyWithCap(res, maxBytes, ctx.serviceId).catch(() => '');
      throw new ApiError(
        `${ctx.serviceId} ${res.status}: ${redactForMessage(body, 200)}`,
        res.status,
        ctx.serviceId,
      );
    }
    const text = await readBodyWithCap(res, maxBytes, ctx.serviceId);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(`${ctx.serviceId} の応答が JSON ではありません`, res.status, ctx.serviceId);
    }
  });
}

/**
 * Slack のように **HTTP 200 のまま `{ ok: false, error }` で失敗を返す** API 用。
 *
 * 2xx だからと成功扱いにすると、送れていないメッセージを送れたことに
 * してしまう。`ok` を見て落とす。
 */
export async function apiFetchOkFlag<T>(
  url: string,
  init: RequestInit,
  ctx: RequestContext,
): Promise<T> {
  const body = await apiFetch<T & { ok?: boolean; error?: string }>(url, init, ctx);
  if (body.ok === false) {
    throw new ApiError(`${ctx.serviceId}: ${body.error ?? 'unknown error'}`, 200, ctx.serviceId);
  }
  return body;
}

/** クエリ文字列を組み立てる（undefined の項目は落とす）。 */
export function withQuery(base: string, params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const s = qs.toString();
  return s === '' ? base : `${base}?${s}`;
}
