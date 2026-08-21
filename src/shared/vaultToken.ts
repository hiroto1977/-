/**
 * 保存された資格情報から `Authorization` ヘッダへ載せる文字列を取り出す —
 * アプリ全体で 1 つだけ持つ。
 *
 * ## 保存されている値は 2 種類ある
 *
 * - **生の文字列** — PAT / API キーを貼り付けたもの (`ghp_…` / `sk-ant-…`)
 * - **TokenSet の JSON** — OAuth の結果 (`{accessToken, refreshToken, expiresAt, …}`)
 *
 * どちらも同じ 1 本の口 (`vault.getToken` / `secrets.getToken`) から出てくるので、
 * 呼び出し側は区別できない。ここが区別する。
 *
 * ## なぜ「壊れた TokenSet」を raw に落としてはいけないか
 *
 * 2026-08-20 の監査で、レンダラ側 (`web-shim.ts` の `bearerFromVaultToken`) が
 * **JSON として読めたのに `accessToken` が無い場合、その JSON 丸ごとを Bearer と
 * して送っていた**。TokenSet には `refreshToken` が入る。つまり:
 *
 * - **アクセストークンより強い refresh token が、それを渡す必要のない相手へ出る。**
 *   ブラウザ版では利用者のプロキシ (第三者のホスト) も経由するので、
 *   そこにも写る。
 * - しかも JSON の塊は Bearer として通らないので、**認証は必ず失敗する** —
 *   漏らす代償だけ払って得るものが無い。
 *
 * 主プロセス側 (`secrets.ts` の `getOAuthTokens`) は同じ状況で **null** を返して
 * いた。**同じ規則を 2 か所に書いて片方だけ緩い**、という形だったので、規則を
 * ここへ 1 つにまとめて両方から呼ぶ。
 *
 * ## 判定
 *
 * | 保存された値 | 返す |
 * |---|---|
 * | JSON として読めない (`ghp_abc`) | その文字列 (生のトークン) |
 * | JSON だがオブジェクトでない (`12345`) | その文字列 (数字だけの API キー) |
 * | オブジェクトで `accessToken` が非空文字列 | その `accessToken` |
 * | オブジェクトだが使える `accessToken` が無い | **null** (壊れた TokenSet) |
 */

/**
 * TokenSet として使える形か。**規則はここだけ**に置く。
 *
 * 配列も `typeof === 'object'` なので通ってしまうが、`accessToken` を持たない
 * 以上どのみち false になる。わざわざ配列を弾く分岐を足すと、結果の変わらない
 * 枝が 1 つ増えるだけになる。
 */
export function hasUsableAccessToken(parsed: unknown): parsed is { accessToken: string } {
  if (parsed === null || typeof parsed !== 'object') return false;
  const token = (parsed as { accessToken?: unknown }).accessToken;
  // 空文字は「あるが使えない」。Bearer に載せても相手は必ず 401 を返すので、
  // 未設定として扱うほうが利用者に正しく伝わる。
  return typeof token === 'string' && token !== '';
}

/**
 * 保存された値から Bearer 文字列を取り出す。取り出せなければ null。
 *
 * null は「登録し直しが要る」を意味する。呼び出し側は**送らずに**そう伝えること。
 */
export function bearerFromStoredToken(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    // **ここで return しない。** JSON ですらない値は `parsed` が undefined の
    // まま下へ落ち、「オブジェクトでない」の枝と合流する。同じ答えを返す枝を
    // 2 つ書くと、catch の中身を空にしても結果が変わらない = 確かめようのない
    // 変異体が 1 つ残る (実測で残った)。
  }
  // JSON として読めても、オブジェクトでなければ TokenSet ではない。
  // 数字だけの API キー (`"12345"` は JSON の数値として読める) と、
  // 上の「JSON ですらない」がここで合流する。
  if (parsed === null || typeof parsed !== 'object') return raw;
  return hasUsableAccessToken(parsed) ? parsed.accessToken : null;
}
