/**
 * **WordPress.com の「MCP ツールが使えるか」を、取得した payload から述べる。**
 * (2026-09-12 · パス 177)
 *
 * ## 直す前に画面が言っていたこと
 *
 * `WordPressPage` の「MCP Access」の節は**固定文**だった:
 *
 * > すべてのサイトが free プラン（mcp_access: `wpcom_paid_plan_required`）。
 * > site 単位の MCP ツール (投稿作成・サイトエディタ等) を使うには
 * > WordPress.com 有料プランへのアップグレードが必要。
 *
 * ところが同じ画面の上の一覧は、**サイトごとに `paid` / `free` のバッジを刷っている** ——
 * `paidPlan` は live クライアントが `plan.is_free` / `product_slug` から判定して返す欄である
 * (`main/clients/wordpress.ts` の `isPaidPlan`)。つまり有料プランを持つ利用者の画面には
 * **`paid` のバッジと「すべてのサイトが free プラン」が同時に出る**。
 * しかも「アップグレードが必要」と、既に払っている人に言う。
 *
 * パス 119 が直した形と同じ ——**payload を読まない固定文が、同じ画面の数字と矛盾する**。
 * (あちらは「AI 改善提案」が見本の数字を利用者の物件として語っていた。)
 *
 * ## 判定と文面をここに置く理由
 *
 * 画面の JSX に条件分岐で書くと、次に触る人が枝を 1 つ落としても誰も気付かない。
 * 純粋関数にすれば標本で留められる (`__tests__/wordpressMcpAccess.test.ts`)。
 *
 * ## 「分からない」を「free」に倒さない
 *
 * サイトが 0 件 (未設定・取得失敗・本当に 0 件) のときは**プランについて何も言わない** ——
 * パス 88 / 120 / 121 が繰り返し直してきた「読めなかったを既定値に倒す」を作らない。
 *
 * ## この app が `mcp_access` を読んでいないことも言う
 *
 * 元の固定文は `mcp_access: wpcom_paid_plan_required` という API の欄を引用していたが、
 * **この app はその欄を取得していない** (`/me/sites` の `fields` に入っていない)。
 * 判定はプラン (`plan`) からの推定なので、そう書く —— 測っていない物を測ったように言わない。
 */

/** 判定に要るのはこの 2 欄だけ (payload の型に縛られない)。 */
export interface McpAccessSite {
  readonly name: string;
  readonly paidPlan: boolean;
}

export type McpAccessKind = 'unknown' | 'all-free' | 'mixed' | 'all-paid';

export interface McpAccessNote {
  readonly kind: McpAccessKind;
  /** 画面に出す 1 段落。 */
  readonly text: string;
  readonly paidNames: readonly string[];
  readonly freeNames: readonly string[];
}

/** 名前の列挙は 3 件まで + 「ほか N 件」(1 行に収める)。 */
function listNames(names: readonly string[]): string {
  if (names.length <= 3) return names.join('・');
  return `${names.slice(0, 3).join('・')} ほか ${names.length - 3} 件`;
}

const TOOLS = 'site 単位の MCP ツール (投稿作成・サイトエディタ等)';
/** プランからの推定であることを毎回添える (`mcp_access` の欄は取得していない)。 */
const BASIS = 'この判定は各サイトのプラン (plan) からの推定で、API の mcp_access 欄は取得していません。';

export function mcpAccessNote(sites: readonly McpAccessSite[]): McpAccessNote {
  const paidNames = sites.filter((s) => s.paidPlan).map((s) => s.name);
  const freeNames = sites.filter((s) => !s.paidPlan).map((s) => s.name);
  if (sites.length === 0) {
    return {
      kind: 'unknown',
      text:
        'サイトを取得できていないため、'
        + `${TOOLS} が使えるかは判定できません (トークンを設定して更新してください)。`,
      paidNames,
      freeNames,
    };
  }
  if (paidNames.length === 0) {
    return {
      kind: 'all-free',
      text:
        `所有サイト ${sites.length} 件はすべて free プランです。`
        + `${TOOLS} を使うには WordPress.com 有料プランへのアップグレードが必要です。${BASIS}`,
      paidNames,
      freeNames,
    };
  }
  if (freeNames.length === 0) {
    return {
      kind: 'all-paid',
      text:
        `所有サイト ${sites.length} 件はすべて有料プランです (${listNames(paidNames)})。`
        + `${TOOLS} の前提 (有料プラン) は満たしています。${BASIS}`,
      paidNames,
      freeNames,
    };
  }
  return {
    kind: 'mixed',
    text:
      `有料プラン ${paidNames.length} 件 (${listNames(paidNames)}) は ${TOOLS} の前提を満たしています。`
      + `free プラン ${freeNames.length} 件 (${listNames(freeNames)}) で使うにはアップグレードが必要です。`
      + BASIS,
    paidNames,
    freeNames,
  };
}
