/**
 * **Atlassian (Jira) の画面リンクを 1 か所で組む** (2026-09-12 · パス 181)。
 *
 * ## 直す前に在った 3 つの組み立て
 *
 * | どこ | 形 |
 * |---|---|
 * | `main/clients/atlassian.ts` (作成した課題) | `${site}/browse/${key}` |
 * | `renderer/data/saasWriteWeb.ts` (同・ブラウザ版) | `${site}/browse/${key}` |
 * | `renderer/pages/AtlassianPage.tsx` (プロジェクト一覧) | `${site}/jira/projects/${key}` |
 *
 * **同じサービスの同じサイトに対して 2 通りの形が在り、3 つめは他のどこにも無い形。**
 * 前 2 つは互いの写しで (パス 111 / 116 / 167 / 174 / 179 が繰り返し直してきた家系)、
 * 3 つめだけが利用者が**一覧から押すリンク**である。
 *
 * ## `/browse/` に寄せた理由
 *
 * `/browse/<key>` は Jira が課題キーとプロジェクトキーの**両方**に対して持つ入口で、
 * この app が既に出荷している形である (上の 2 つ)。
 * 製品ごとの経路 (`/jira/software/projects/<key>/boards`) のほうが具体的だが、
 * `projectTypeKey` と `style` で枝分かれするので**形が増える**。
 *
 * **この選択は内部の一致に基づく** —— どちらの URL が実際に開けるかは
 * 確かめていない (この環境から atlassian.net へ出られない)。言えるのは
 * 「出荷済みの形に揃えた」までで、「404 だったのを直した」とは言えない。
 *
 * ## 動的部分は必ず encodeURIComponent
 *
 * 3 か所とも API が返した値を**生のまま**URL に挿していた。キーは通常
 * `[A-Z][A-Z0-9]*(-\d+)?` なので実害は出にくいが、
 * 開く先は OS のブラウザ (橋の `app:openExternal`) であり、ARCHITECTURE §8 が
 * 「URL 動的部分は `encodeURIComponent`」と定めている。
 *
 * (この注記は元々「開く先は <主プロセスの外部ブラウザ呼び>」と**関数名を書いて**いたが、
 *  `lint:forbidden` の規則 #5 は**字面で**当たるので散文でも違反として鳴った。
 *  規則が字面を見るなら、散文もその字面を避ける —— 正しい鳴り方である。)
 * 応答が想定外の値を返したときに**開く URL が変わる**経路を残さない。
 */

/**
 * Jira の `/browse/<key>` リンク。課題キー・プロジェクトキーの両方に使う。
 *
 * `site` は `normalizeAtlassianSiteResult` を通った `https://<host>` で、
 * 末尾に `/` もパスも付かない (あちらが hostname だけで組み直している)。
 * ここでは連結の形だけを持つ —— site の検証はしない (1 つの規則を 2 か所に置かない)。
 */
export function jiraBrowseUrl(site: string, key: string): string {
  return `${site}/browse/${encodeURIComponent(key)}`;
}
