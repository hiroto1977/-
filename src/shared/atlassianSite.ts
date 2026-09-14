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

import { hasControlChar } from './controlChars';

/**
 * Atlassian の資格情報 JSON の各欄の長さの天井 —— **両ビルドが同じ値を読む。**
 *
 * 2026-09-14 まで、この 3 つは main (`clients/atlassian.ts`) だけが持っていた
 * (`MAX_EMAIL` 254 / `MAX_TOKEN` 1024 / `MAX_SITE` 256)。**理由もそこに書かれていた**
 * —— 「Length caps prevent multi-MB strings from OOMing the basicAuth Buffer
 * allocation」。ブラウザ版 (`data/saasWriteWeb.ts`) は email だけ 254 を**手で写し**、
 * token と site には天井が無く、同じ `btoa(\`${'${email}'}:${'${token}'}\`)` を通していた。
 *
 * つまり `normalizeAtlassianSiteResult` (下) を共有した時点で**述語は 1 つになったが、
 * その周りの欄の検査は片方だけ**だった —— パス 246 / 247 が数えている形そのもの。
 * 値は main が持っていた物をそのまま動かさずに移し、両方がここを読む。
 *
 * これは**安全上限**なので `parameters.ts` の台帳には載せない (CLAUDE.md の規約)。
 */
export const MAX_ATLASSIAN_EMAIL = 254;
export const MAX_ATLASSIAN_TOKEN = 1024;
export const MAX_ATLASSIAN_SITE = 256;

export type AtlassianSiteFailure = 'control-char' | 'not-a-url' | 'not-https' | 'not-atlassian';

export type AtlassianSiteResult =
  | { readonly ok: true; readonly site: string }
  | { readonly ok: false; readonly reason: AtlassianSiteFailure };

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
