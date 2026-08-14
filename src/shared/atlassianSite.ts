/**
 * 利用者が入れた Atlassian の site URL を検証して正規化する — 1 か所だけ持つ。
 *
 * **baseUrl は利用者入力なので、そのまま連結すると社内ホストへ向けさせられる**
 * (SSRF)。Atlassian Cloud は必ず `*.atlassian.net` の https なので、そこまで
 * 絞ってから使う。
 *
 * この検証は main (`clients/atlassian.ts`) と shared (`api/atlassian.ts`) の
 * 両方に写経されており、**片方の説明文が「同じ防御を張っている」と書いていたが
 * 事実ではなかった**。main 側は元の文字列から末尾の `/` を落とすだけで、
 * パス・クエリ・フラグメント・ポート・userinfo をそのまま残していた。
 *
 * 実際に試した範囲では、その差から資格情報を外部へ逃がす経路は作れなかった
 * (CR/LF は `new URL` が弾き、タブはホスト名を壊して許可判定で落ちる。
 * `https://evil.com@x.atlassian.net` は userinfo なので接続先は
 * x.atlassian.net のまま)。**穴ではなく、説明が嘘だったのと、
 * 貼り付け事故が壊れた要求になるという話**。
 * 例: `https://x.atlassian.net/wiki` を貼ると main 側は
 * `/wiki/rest/api/3/search` を叩いて 404 になり、原因が分からない。
 *
 * 例外を投げずに結果で返すのは、呼び出し側 2 つが**別のエラー型**
 * (`FetchError` と `ApiError`) と別の文言を持っているため。ここで投げると
 * どちらかに型を寄せることになり、寄せた側の呼び出し規約が変わる。
 */

export type AtlassianSiteFailure = 'control-char' | 'not-a-url' | 'not-https' | 'not-atlassian';

export type AtlassianSiteResult =
  | { readonly ok: true; readonly site: string }
  | { readonly ok: false; readonly reason: AtlassianSiteFailure };

/**
 * 制御文字を含むか。
 *
 * 正規表現の文字クラスで書くと eslint の no-control-regex に当たる。
 * ルールを黙らせるより、走査で同じことをする方が読み手にも明確。
 */
function hasControlChar(s: string): boolean {
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

export function normalizeAtlassianSiteResult(raw: string): AtlassianSiteResult {
  // `typeof raw !== 'string'` は置かない。呼び出し側 2 つとも、ここへ渡す前に
  // 文字列であることを確かめている (main は `typeof obj.site !== 'string'`、
  // shared は `String(...)`)。置いても殺せない変異体が増えるだけで、
  // 守るものが無い。
  if (hasControlChar(raw)) return { ok: false, reason: 'control-char' };
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: 'not-a-url' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, reason: 'not-https' };
  if (!parsed.hostname.endsWith('.atlassian.net')) return { ok: false, reason: 'not-atlassian' };
  // **hostname だけを使って組み直す。** 元の文字列を使い回すと、パス・クエリ・
  // フラグメント・ポート・userinfo が後段の URL 連結に混ざる。
  return { ok: true, site: `https://${parsed.hostname}` };
}
