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

/**
 * **保存された Atlassian の資格情報 JSON を読む — 1 か所だけ持つ** (2026-09-15 · パス 284)。
 *
 * この関数が在る前、同じ 3 段の検査 (JSON として読めるか → 3 欄が在って天井の内か →
 * email / token に制御文字が無いか) が **main (`clients/atlassian.ts`) と
 * ブラウザ版 (`data/saasWriteWeb.ts`) に 1 つずつ**在り、**3 つの文面が
 * 両方で違っていた** (どちらも日本語なのに言い回しが違う —— つまり
 * 「言語の非対称」ではなく「同じ条件に文が 2 つ」の一族である。
 * パス 167 / 250 / 252 / 269 / 273 / 282 が 1 件ずつ閉じてきた形)。
 *
 * ★ **そのうえ両方に同じ欠陥が在った。** 保存値が JSON リテラルの `null` だと
 * `JSON.parse` は成功して `null` を返し、次の `typeof obj.email` が
 * `TypeError: Cannot read properties of null (reading 'email')` を投げる ——
 * **書くつもりだった断りは 1 度も出ない**。`null` は 4 文字の普通の文字列なので
 * `checkTokenInput` の関門 (パス 244) も通り、利用者が Atlassian のトークン欄に
 * `null` と打つだけで再現した (2026-09-15 に両ビルドの実物で実測)。
 *
 * ★★ **両方が同じように壊れていたので、パリティ検査は通っていた。**
 * 「両ビルドが一致している」は「正しい」ではない —— この 2 つは別の性質である。
 *
 * `typeof null === 'object'` の罠で、この repo は同じ形を何度も塞いでいる
 * (`emotionsShape.asRecord` / `persistedShape.isRecord`)。ここも同じ約束にする ——
 * **記録でない値 (`null` / 配列 / 数 / 文字列 / 真偽) は欄が無い物として扱う**。
 * `{}` と同じ経路になるので、`null` 以外の 4 形の断り文は**1 文字も変わらない**。
 *
 * 例外を投げずに結果で返すのは `normalizeAtlassianSiteResult` と同じ理由 ——
 * 呼び出し側 2 つが別のエラー型 (`FetchError` / `Error`) を持つため。
 */
export type AtlassianCredsFailure = 'not-json' | 'fields' | 'control-char';

export type AtlassianCredsResult =
  | { readonly ok: true; readonly email: string; readonly token: string; readonly site: string }
  | { readonly ok: false; readonly reason: AtlassianCredsFailure };

/** 断りの文面 —— **両ビルドがここを読む** (文を写さない)。 */
export const ATLASSIAN_CREDS_MESSAGES: Readonly<Record<AtlassianCredsFailure, string>> = {
  'not-json': 'Atlassian トークンは { "email", "token", "site" } 形式の JSON で保存してください',
  fields: 'Atlassian トークンの email / token / site が欠けているか不正です',
  'control-char': 'Atlassian の email / token に制御文字を含めることはできません',
};

export function readAtlassianCredentials(raw: string): AtlassianCredsResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  /*
   * **記録でなければ欄が無い物として扱う** (上の docblock の `null` の件)。
   * `typeof parsed === 'object'` だけでは `null` と配列が通ってしまうので、
   * 3 つ揃えて初めて記録と呼ぶ。
   */
  const obj: Record<string, unknown> =
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  const { email, token, site } = obj;
  if (
    typeof email !== 'string' || email.length === 0 || email.length > MAX_ATLASSIAN_EMAIL ||
    typeof token !== 'string' || token.length === 0 || token.length > MAX_ATLASSIAN_TOKEN ||
    typeof site !== 'string' || site.length === 0 || site.length > MAX_ATLASSIAN_SITE
  ) {
    return { ok: false, reason: 'fields' };
  }
  /*
   * email / token は `btoa(`${email}:${token}`)` に入る (Basic 認証)。base64 の
   * 中では CR/LF は無害だが、この 2 つは失敗時の文面やログ行に現れうるので
   * そこで行を割られない形にしておく (main 側の元の注記と同じ判断)。
   */
  if (hasControlChar(email) || hasControlChar(token)) {
    return { ok: false, reason: 'control-char' };
  }
  return { ok: true, email, token, site };
}
