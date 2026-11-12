/**
 * **認可サーバのトークン端点の応答を、読むところで検証する** (2026-09-14 ・ パス 260)。
 *
 * ## 同じ規則が 2 か所に在り、片方だけが見ていた
 *
 * ブラウザ版 (`renderer/oauth/pkce.ts`) は昔から見ていた ——
 * `access_token` は非空の文字列でなければ投げ、`expires_in` は
 * `Number.isFinite` を通し、`refresh_token` は**文字列のときだけ**載せる。
 *
 * デスクトップ版 (`main/oauth.ts`) は `JSON.parse(…) as TokenResponse` **だけ**
 * だった。`as` は型を名乗るだけで 1 つも確かめない。同じ規則を 2 か所に書けば
 * 片方だけ緩い日が来る、という形 (パス 245 / 246 と同じ) がここにも在った。
 *
 * ## 実測した帰結 (2026-09-14・main 側)
 *
 * 1. **`refresh_token` が非文字列だと、働いていた更新トークンが消える。**
 *    `tokenResponseToSet` は `raw.refresh_token ?? fallbackRefresh` なので、
 *    `{"refresh_token":{"a":1}}` は `??` に掛からず**手元の値を置き換える**。
 *    保存の関門 (パス 259) は `accessToken` と**文字列**欄の制御文字しか見ない
 *    ので通り、読み戻しの `isTokenSet` も `accessToken` しか見ないので通る。
 *    次の更新が送るのは `refresh_token=%5Bobject+Object%5D` (実測) ——
 *    必ず失敗し、`getValidToken` の `catch` が黙って**古いアクセストークン**へ
 *    落ちる。以後そのサービスは 401 のままで、画面は「設定済み」と出す。
 *    **出口は登録し直しだけで、そうとは誰も言わない。**
 * 2. **`expires_in: 1e308` は有限だが、期限は無限になる。**
 *    `Date.now() + 1e308 * 1000` は `Infinity` で、`JSON.stringify` はそれを
 *    **`null`** にする。読み戻すと `typeof … === 'number'` が false なので
 *    「期限が記録されていない」扱いになり、**1 度も更新しない**。
 *    パス 98 は*読む*側で `±Infinity` を塞いだが、*書く*側がまだ作っていた。
 *    だから入口の型 (`expires_in`) を見るだけでは足りない ——
 *    **計算した量 (`expiresAt`) を、その場で見る**必要がある (パス 57 の形:
 *    関門が値と別の量で規則を再導出してはいけない)。
 * 3. **本文が `null` だと TypeError になる。**
 *    `Cannot read properties of null (reading 'expires_in')` が
 *    `safeErrorMessage` を通って画面に出る —— 認可サーバのことを何も言わない。
 * 4. **素の `JSON.parse` の SyntaxError は本文の窓を引用する。**
 *    実測: `{"access_token":ya29.a0AfB…}` (値の引用符が無い応答) →
 *    `Unexpected token 'y', ...\"ss_token\":ya29.a0AfB\"... is not valid JSON`。
 *    トークンの**先頭 10 字**が文面に入る。`redact.ts` の `ya29.` 規則は
 *    続きを 10 文字以上要求するのでこの切れ端には当たらない。10 字では使えない
 *    ので害は小さいが、`!res.ok` の側は `redactForMessage` を通しているのに
 *    成功側は素通し、という非対称だった。**ここでは本文を引用しない。**
 *
 * ## 何をしないか
 *
 * 大きさは見ない。`access_token` が 1.2 MB の**文字列**なら型は正しいので
 * ここは通し、保存の天井 (パス 259 の `checkTokenSetForStorage`) が断る。
 * 層を重ねているのであって、置き換えてはいない。
 */

/** 型が確かめられたトークン端点の応答。宣言の無い欄は**落ちている**。 */
export interface TokenResponseFields {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly expires_in?: number;
  readonly scope?: string;
  readonly token_type?: string;
}

export type TokenResponseRejectReason = 'not-json' | 'not-object' | 'no-access-token';

export type TokenResponseParse =
  | { readonly ok: true; readonly value: TokenResponseFields }
  | { readonly ok: false; readonly reason: TokenResponseRejectReason; readonly message: string };

/** 文字列の欄。型が合わなければ**落とす** (既定値を作らない)。 */
function str(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key];
  return typeof v === 'string' ? v : undefined;
}

/**
 * `expires_in` の秒数。**非有限は落とす** —— `Number.isFinite` は NaN /
 * ±Infinity / 非数値をすべて false にする (パス 98 の規準)。
 *
 * **数字の文字列も受ける。** RFC 6749 §5.1 は JSON の数値と述べるが、
 * 文字列で返す実装は実在する。そして**直す前のデスクトップ版はそれを受けて
 * いた** —— `"3600" > 0` は true、`"3600" * 1000` は 3600000 になるからで、
 * 型検査を足すだけだとこの経路を黙って落とす。落とすと `expiresAt` が
 * 付かず、`getValidToken` は期限が無い物を更新しないので、**先回りの更新が
 * まるごと消える**。それは直しではなく振る舞いの変更なので、受けたままにする。
 *
 * `''` / `' '` は `Number` が 0 にするので、空白だけの欄は先に落とす。
 */
function seconds(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string' || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * トークン端点の応答本文を読む。**断るときも本文を引用しない。**
 *
 * 通ったときに返るのは、宣言した 5 欄のうち**型の合ったものだけ**である。
 * 認可サーバが足した欄は落ちるので、応答の大きさがそのまま保存へ流れない。
 */
export function parseTokenResponse(raw: string): TokenResponseParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 例外の文面は捨てる —— V8 は本文の窓を引用する (上の実測 4)。
    return { ok: false, reason: 'not-json', message: 'トークン端点の応答が JSON ではありません' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      reason: 'not-object',
      message: 'トークン端点の応答が JSON のオブジェクトではありません',
    };
  }
  const o = parsed as Record<string, unknown>;
  const accessToken = str(o, 'access_token');
  if (accessToken === undefined || accessToken === '') {
    return {
      ok: false,
      reason: 'no-access-token',
      message: 'トークン端点の応答に access_token (非空の文字列) がありません',
    };
  }
  return {
    ok: true,
    value: {
      access_token: accessToken,
      refresh_token: str(o, 'refresh_token'),
      expires_in: seconds(o['expires_in']),
      scope: str(o, 'scope'),
      token_type: str(o, 'token_type'),
    },
  };
}
