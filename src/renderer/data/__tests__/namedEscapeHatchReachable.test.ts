/**
 * **名指しした逃げ口は、対象をそこに持っていなければならない** (2026-09-23 · パス 425)。
 *
 * このアプリは、落とした行・重複した行について「どこで消せるか」を文で指さす
 * (法則 `escape-hatch-stays-open`)。指さすこと自体は 2026-09 の 6 パスで整えられたが、
 * **指さした先にその行が在るかを測る物が 1 つも無かった。**
 *
 * ## 実測 (2026-09-23 · 直す前)
 *
 * | collection | 標本 | 形の表 | 名指しされた逃げ口 | そこに在るか |
 * | --- | --- | --- | --- | --- |
 * | `sales-entries` | `date: '2026-02-31'` | `calendarDate` —— 断る | 設定の点検パネル | **在る** ✅ |
 * | `kpi-actuals` | `period: 'bad'` | **`str`** —— 通す | 設定の点検パネル | **無い** ❌ |
 *
 * KPI の文は隣の売上の文からの写しで、**売上では正しかった**。点検パネルが見るのは
 * *形*であって暦ではないので、`period: 'bad'` は形として正しく `malformed = 0` になる。
 * jsdom で通しで測ると、画面は「…（設定の「形式の合わない記録」から消せます）。」と言い、
 * 着いた先は「調べた 2 件に形式の合わないレコードはありません。」と答えた ——
 * **2 つの画面が、問題が在るかどうかについて互いに矛盾していた。** そして本物の逃げ口は
 * その人が今見ている一覧の × だった (KPI の一覧は `records.map` で選別せずに描く)。
 *
 * ## 2 つ目 —— 指さす画面の名前が実在しなかった
 *
 * 経営サマリーの 2 文は「「KPI 実績」の画面」と書いていたが、**サイドバーの 76 の
 * ラベルにその綴りは無い** (実物は `KPI / BEP`)。探せない綴りで指さしても、
 * 指さしたことにはならない。
 *
 * ## だからこの検査は 2 つを見る
 *
 * 1. 逃げ口を名指しする文の**母集団を走査で導き**、台帳と**両方向**に突き合わせる。
 * 2. 種類ごとに**振る舞いで**確かめる ——
 *    `audit-panel` は実物の `auditRecordShapes` がその標本を見つけること、
 *    `list-x` は標本が形の表を**通る**こと (通らなければ復元で捨てられ、一覧に出ない)。
 * 3. 「「X」の画面」の X は `SERVICES` のラベルであること (走査・台帳なし)。
 */
import { describe, expect, it } from 'vitest';
import { readOriginalDirEntries, readOriginalSource } from '../../../shared/__tests__/originalSource';
import { SERVICES } from '../../services';
import { hasCollectionShape } from '../collectionShapes';
import { auditRecordShapes } from '../recordShapeAudit';
import { MEMBERS_COLLECTION } from '../members';
import { SALES_COLLECTION } from '../sales';
import { KPI_ACTUALS_COLLECTION } from '../kpiActuals';
import { BALANCE_SHEET_COLLECTION } from '../balanceSheet';
import { PROPERTIES_COLLECTION } from '../investments';

/** 設定の点検パネルを名指しする綴り (**実物のパネルの見出しと同じ語** —— パス 426 で「記録」から直した)。 */
const AUDIT_PANEL = '形式の合わないレコード';
/** 一覧の削除ボタンを名指しする綴り。 */
const LIST_X = '一覧の ×';
/** 別の画面を名指しする綴り (`「X」の画面`)。 */
const SCREEN_RE = /「([^」]{1,20})」の画面/g;

/** 理由の欄に置いてはいけない省略形 (何について同じなのかを次に読む人が確かめ直すことになる)。 */
const SHORTHAND = /^同上[。）)]?$/;

type Kind = 'audit-panel' | 'list-x' | 'other-screen';

interface Row {
  /** 文を返す export された関数の名前。 */
  readonly fn: string;
  /** 宣言の在るファイル (リポジトリ相対)。 */
  readonly file: string;
  /** その文が指さす逃げ口。文が 2 つ名指しするなら 2 つ書く。 */
  readonly kinds: readonly Kind[];
  /**
   * その文を出させる記録の collection。**記録から生まれない文は持たない**
   * (2026-09-24 · パス 449) —— 端末内のモデルが答えなかったときの断りは
   * 保管した行についての文ではないので、点検パネルにも一覧にも標本が無い。
   * 持たない行は `other-screen` だけを名乗れる (下の検査が両方向で留める)。
   */
  readonly collection?: string;
  /** その文を出させる記録そのもの (実物の関門に食わせる)。 */
  readonly sample?: Record<string, unknown>;
  readonly why: string;
}

const SALES_BAD_DATE = { date: '2026-02-31', channel: 'shopify', amount: 1000, orders: 1 };
const SALES_OK = { date: '2026-04-01', channel: 'shopify', amount: 1000, orders: 1 };
// 日付は読めるが金額が数でない —— 形の表 (`amount: num`) が断る側 (パス 442)。
const SALES_BAD_AMOUNT = { date: '2026-04-01', channel: 'shopify', amount: null, orders: 1 };
const KPI_BAD_PERIOD = { period: 'bad', unit: 'A', revenue: 1, cogs: 0, advertising: 0, sga: 0, depreciation: 0 };
// 期は読めるが金額が数でない —— 形の表 (`revenue: num`) が断る側 (パス 443)。
const KPI_BAD_AMOUNT = { period: '2026-04', unit: 'A', revenue: null, cogs: 0, advertising: 0, sga: 0, depreciation: 0 };
const KPI_OK = { period: '2026-04', unit: 'A', revenue: 1, cogs: 0, advertising: 0, sga: 0, depreciation: 0 };
const MEMBER_OK = { name: '山田', email: 'a@example.com', role: 'member' };
// 貸借対照表の欄が数でない —— 形の表 (`currentAssets: num`) が断る側 (パス 444)。
// **内数 ≦ 親項目** (`recordRelations.ts`) も同時に満たす必要があるので、
// 壊す欄以外は 0 にしておく (親を壊すと内数との関係でも落ち、原因が 2 つになる)。
const BS_BAD_AMOUNT = {
  asOf: '2026-03-31',
  currentAssets: null,
  cash: 0,
  inventory: 0,
  accountsReceivable: 0,
  fixedAssets: 0,
  currentLiabilities: 0,
  accountsPayable: 0,
  fixedLiabilities: 0,
  interestBearingDebt: 0,
  netIncome: 0,
};
// 物件の金額の欄が数でない —— 形の表 (`monthlyExpenses: opt(num)` ほか) が断る側 (パス 446)。
const PROPERTY_BAD_AMOUNT = {
  name: '一棟目',
  type: 'アパート',
  monthlyRent: 100_000,
  purchasePrice: 20_000_000,
  occupied: true,
  monthlyExpenses: '20000',
  monthlyLoan: 10_000,
};

/**
 * **今日の全量。** 走査が見つけた関数と 1 件ずつ対応する (両方向)。
 *
 * `why` は「なぜその逃げ口で正しいか」—— 次に文を写す人が、写し元と写し先で
 * **形の表の答えが同じか**を確かめる手がかりになる (それを確かめなかったのがパス 425)。
 */
const LEDGER: readonly Row[] = [
  {
    fn: 'unreadableSalesDateNote',
    file: 'src/renderer/data/sales.ts',
    kinds: ['audit-panel'],
    collection: SALES_COLLECTION,
    sample: SALES_BAD_DATE,
    why: '日付が読めない売上は形の表 (`date: calendarDate`) が断るので、点検パネルが見つけて消せる。',
  },
  {
    fn: 'unreadableSalesAmountNote',
    file: 'src/renderer/data/sales.ts',
    kinds: ['audit-panel'],
    collection: SALES_COLLECTION,
    sample: SALES_BAD_AMOUNT,
    why: '金額が数でない売上は形の表 (`amount: num`) が断るので、点検パネルが見つけて消せる (パス 442)。',
  },
  {
    fn: 'noSalesRecordsNote',
    file: 'src/renderer/data/sales.ts',
    kinds: ['audit-panel', 'other-screen'],
    collection: SALES_COLLECTION,
    sample: SALES_BAD_DATE,
    why: '同じ判定 (`date: calendarDate`) —— 全件が読めないときの文で、同じ逃げ口を指さす。',
  },
  {
    fn: 'duplicateOrderMessage',
    file: 'src/renderer/data/sales.ts',
    kinds: ['list-x'],
    collection: SALES_COLLECTION,
    sample: SALES_OK,
    why: '重複した注文の行そのものは正しい形なので、売上集計の一覧に出ていて × で消せる。',
  },
  {
    fn: 'duplicateOrdersNote',
    file: 'src/renderer/data/sales.ts',
    kinds: ['list-x'],
    collection: SALES_COLLECTION,
    sample: SALES_OK,
    why: '同上 —— 一覧の上に出る警告なので、指さす先は同じ画面の一覧である。',
  },
  {
    fn: 'duplicateOrdersOverviewNote',
    file: 'src/renderer/data/sales.ts',
    kinds: ['other-screen'],
    collection: SALES_COLLECTION,
    sample: SALES_OK,
    why: '経営サマリーには一覧が無いので「売上集計」の画面を名乗る (画面名は下の走査が SERVICES と照合する)。',
  },
  {
    fn: 'unreadablePeriodNote',
    file: 'src/renderer/data/kpiActuals.ts',
    kinds: ['list-x'],
    collection: KPI_ACTUALS_COLLECTION,
    sample: KPI_BAD_PERIOD,
    why: '**形の表は `period: str` なので通る** —— 復元でも捨てられず、KPI の一覧 (`records.map`・選別なし) に出る。点検パネルは形しか見ないので見つけられない。',
  },
  {
    fn: 'unreadablePeriodOverviewNote',
    file: 'src/renderer/data/kpiActuals.ts',
    kinds: ['list-x', 'other-screen'],
    collection: KPI_ACTUALS_COLLECTION,
    sample: KPI_BAD_PERIOD,
    why: '同じ行を、一覧を持たない経営サマリーから指さす —— 画面名つき。',
  },
  {
    fn: 'unreadableNumberNote',
    file: 'src/renderer/data/kpiActuals.ts',
    kinds: ['audit-panel'],
    collection: KPI_ACTUALS_COLLECTION,
    sample: KPI_BAD_AMOUNT,
    why: '**金額が数でない実績は形の表 (`revenue: num`) が断る**ので、点検パネルが見つけて消せる (パス 443)。期が崩れた行 (`period: str` で通る) と逃げ口が違うのはそのため —— 同じ画面の 2 つの文が別の逃げ口を名乗るのは、行の届き方が違うからである。',
  },
  {
    fn: 'duplicateActualMessage',
    file: 'src/renderer/data/kpiActuals.ts',
    kinds: ['list-x'],
    collection: KPI_ACTUALS_COLLECTION,
    sample: KPI_OK,
    why: '重複した実績の行は正しい形なので一覧に出ていて × で消せる。',
  },
  {
    fn: 'duplicateActualsNote',
    file: 'src/renderer/data/kpiActuals.ts',
    kinds: ['list-x'],
    collection: KPI_ACTUALS_COLLECTION,
    sample: KPI_OK,
    why: '同上 —— 一覧の上に出る警告。',
  },
  {
    fn: 'duplicateActualsOverviewNote',
    file: 'src/renderer/data/kpiActuals.ts',
    kinds: ['other-screen'],
    collection: KPI_ACTUALS_COLLECTION,
    sample: KPI_OK,
    why: '経営サマリーには一覧が無いので KPI の画面を名乗る (2026-09-23 まで実在しない綴りだった)。',
  },
  {
    fn: 'CHATBOT_OLLAMA_ESCAPE',
    file: 'src/renderer/data/chatbotOllama.ts',
    kinds: ['other-screen'],
    why: '**記録ではなくモデルについての文** —— AI コンシェルジュに行き先を選ぶ口が無いので、導入済みの一覧が出る「Ollama」の画面を名乗る (パス 449)。',
  },
  {
    fn: 'duplicateMemberMessage',
    file: 'src/renderer/data/members.ts',
    kinds: ['list-x'],
    collection: MEMBERS_COLLECTION,
    sample: MEMBER_OK,
    why: '重複したメンバーの行は正しい形なのでチーム管理の一覧に出ていて × で消せる。',
  },
  {
    fn: 'duplicateMembersNote',
    file: 'src/renderer/data/members.ts',
    kinds: ['list-x'],
    collection: MEMBERS_COLLECTION,
    sample: MEMBER_OK,
    why: '同上 —— 一覧の上に出る警告。',
  },
  {
    fn: 'unreadableBalanceSheetNote',
    file: 'src/renderer/data/balanceSheet.ts',
    kinds: ['audit-panel'],
    collection: BALANCE_SHEET_COLLECTION,
    sample: BS_BAD_AMOUNT,
    why: '**数でない欄は形の表 (`currentAssets: num` ほか) が断る**ので、点検パネルが見つけて消せる (パス 444)。貸借対照表は一覧に × を持たない —— 画面から行ごと消す口はこのパネルだけなので、ここを名指しするほかに逃げ口は無い。',
  },
  {
    fn: 'netDebtUnavailableNote',
    file: 'src/renderer/data/balanceSheet.ts',
    kinds: ['audit-panel'],
    collection: BALANCE_SHEET_COLLECTION,
    sample: BS_BAD_AMOUNT,
    why: '同じ逃げ口を、KPI ページの貸借対照表パネルから名指しする (パス 445)。**「読めない」側の文だけが名指しする** —— 本当に未入力の人には「0 と入力してください」と言い、点検パネルへは送らない (そこには消す物が無い)。',
  },
  {
    fn: 'buildManagementHighlights',
    file: 'src/renderer/data/managementHighlights.ts',
    kinds: ['audit-panel'],
    collection: BALANCE_SHEET_COLLECTION,
    sample: BS_BAD_AMOUNT,
    why: '同じ名簿を読む所見 (パス 444)。**未入力の所見とは別の文**で、こちらは「入力してください」と言わない —— 打ち込んだ値が読めないだけの人に入力を促すと直す手ごと誤らせる (パス 388)。',
  },
  {
    fn: 'unreadableCostNote',
    file: 'src/renderer/data/investments.ts',
    kinds: ['audit-panel'],
    collection: PROPERTIES_COLLECTION,
    sample: PROPERTY_BAD_AMOUNT,
    why: '**数でない金額の欄は形の表 (`monthlyExpenses: opt(num)` ほか) が断る**ので、点検パネルが見つけて消せる (パス 446)。物件の一覧には × が在るが、それは**行ごと**消す口である —— 経費が読めないだけの物件を行ごと消すと家賃も入居率も一緒に消えるので、ここが正しい逃げ口になる。',
  },
  {
    fn: 'yieldScopeNote',
    file: 'src/renderer/data/investments.ts',
    kinds: ['audit-panel'],
    collection: PROPERTIES_COLLECTION,
    sample: PROPERTY_BAD_AMOUNT,
    why: '同じ逃げ口を、**家賃が読めない側の文だけ**が名指しする (パス 446)。取得価格が読めない側は「0% として平均すると全体が下がります」と述べるだけで点検パネルへは送らない —— 欄そのものが無い控えでもそこへ来るので、消す物が無い人を送ってはいけない。',
  },
  {
    fn: 'occupiedWithoutRentNote',
    file: 'src/renderer/data/investments.ts',
    kinds: ['audit-panel'],
    collection: PROPERTIES_COLLECTION,
    sample: PROPERTY_BAD_AMOUNT,
    why: '同上 —— **「読めない」側の文だけ**が名指しする。家賃 0 円の人には「空室でないなら家賃を入力してください」と言い、点検パネルへは送らない (そこには消す物が無い · パス 445 と同じ判断)。',
  },
];

/**
 * 注記を落として**コードだけ**にする (**行番号は保つ**)。
 *
 * **文字列は落とさない** —— ここで数えたいのは*利用者が読む文*そのものなので、
 * `stripNonCode` (文字列も落とす) は使えない。落とすのは注記だけである。
 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => (/^\s*(\/\/|\*)/.test(line) ? '' : line))
    .join('\n');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readOriginalDirEntries(dir)) {
    const full = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== '__tests__') walk(full, out);
    } else if (e.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

interface Hit {
  readonly file: string;
  readonly fn: string;
  readonly kind: Kind;
}

/** 逃げ口を名指しする文を持つ export された関数を、走査で導く。 */
function scanHits(): Hit[] {
  const hits: Hit[] = [];
  for (const file of walk('src/renderer/data')) {
    let fn = '(top)';
    for (const line of codeOnly(readOriginalSource(file)).split('\n')) {
      const decl = /^export (?:async )?(?:function|const) ([A-Za-z0-9_]+)/.exec(line);
      if (decl) fn = decl[1]!;
      const kinds: Kind[] = [];
      if (line.includes(AUDIT_PANEL)) kinds.push('audit-panel');
      if (line.includes(LIST_X)) kinds.push('list-x');
      if (new RegExp(SCREEN_RE.source).test(line)) kinds.push('other-screen');
      for (const kind of kinds) {
        if (!hits.some((h) => h.file === file && h.fn === fn && h.kind === kind)) hits.push({ file, fn, kind });
      }
    }
  }
  return hits;
}

/** 実物の `auditRecordShapes` に 1 件だけ食わせる (点検パネルが呼ぶのと同じ関数)。 */
function storeWith(collection: string, data: Record<string, unknown>) {
  return { list: async (c: string) => (c === collection ? [{ id: 'x', data }] : []) };
}

describe('名指しした逃げ口は、対象をそこに持っている (パス 425)', () => {
  const hits = scanHits();

  it('走査が空虚でない (針が死んでいれば鳴る)', () => {
    expect(hits.length).toBeGreaterThanOrEqual(12);
    expect(hits.filter((h) => h.kind === 'audit-panel').length).toBeGreaterThanOrEqual(2);
    expect(hits.filter((h) => h.kind === 'list-x').length).toBeGreaterThanOrEqual(7);
    expect(hits.filter((h) => h.kind === 'other-screen').length).toBeGreaterThanOrEqual(4);
  });

  it('★ 針は実物の文に当たり、注記の中の言及には当たらない (mention-vs-declaration)', () => {
    const line = "  return `…（設定の「形式の合わないレコード」から消せます）。`;";
    expect(codeOnly(line).includes(AUDIT_PANEL)).toBe(true);
    expect(codeOnly(' * 逃げ口 (設定の「形式の合わないレコード」) はこの文が').includes(AUDIT_PANEL)).toBe(false);
    expect(codeOnly('/* 一覧の × で消せます */').includes(LIST_X)).toBe(false);
    // 行番号を保つ (掴んだ位置をそのまま実物の行として報せられる)
    expect(codeOnly('a\n/* x\ny */\nb').split('\n')).toHaveLength(4);
  });

  it('★ 走査が見つけた文は全部台帳に在る', () => {
    const missing = hits.filter((h) => !LEDGER.some((r) => r.fn === h.fn && r.kinds.includes(h.kind)));
    expect(missing.map((h) => `${h.file}:${h.fn} [${h.kind}]`)).toEqual([]);
  });

  it('★ 台帳の行は全部走査で見つかる (消えた文が台帳に残らない)', () => {
    const stale = LEDGER.filter((r) => !r.kinds.every((k) => hits.some((h) => h.fn === r.fn && h.kind === k)));
    expect(stale.map((r) => `${r.fn} [${r.kinds.join(',')}]`)).toEqual([]);
  });

  it('台帳の宣言は実在し、理由は省略形でない', () => {
    // **不在の主張に標本を添える** (CLAUDE.md の規約) —— 綴りが 1 つ違えば黙る針なので、
    // その針が禁じたい文面に**実際に当たる**ことを同じ it の中で示す。
    expect(SHORTHAND.test('同上。')).toBe(true);
    expect(SHORTHAND.test('同上')).toBe(true);
    expect(SHORTHAND.test('同上）')).toBe(true);
    expect(SHORTHAND.test('同じ判定 (`date: calendarDate`) —— 全件が読めないときの文。')).toBe(false);
    for (const r of LEDGER) {
      const src = readOriginalSource(r.file);
      expect(
        src.includes(`export function ${r.fn}(`) || src.includes(`export const ${r.fn} `),
        `${r.fn} の宣言が ${r.file} に無い`,
      ).toBe(true);
      expect(r.why.length, `${r.fn} の理由が短すぎる`).toBeGreaterThanOrEqual(15);
      expect(r.why, `${r.fn} の理由が省略形`).not.toMatch(SHORTHAND);
    }
  });

  it('★ 標本を持たない行は other-screen だけを名乗る (パス 449)', () => {
    // 記録から生まれない文 (モデルが答えなかった等) は、点検パネルにも
    // 一覧にも「その行」が無い —— **そこを名乗ったら消す物が無い所へ送る**。
    const noSample = LEDGER.filter((r) => r.sample === undefined);
    expect(noSample.length, '標本を持たない行が 1 つも無ければ、この規則は空虚').toBeGreaterThanOrEqual(1);
    for (const r of noSample) {
      expect(r.collection, `${r.fn}: 標本が無いのに collection を名乗っている`).toBeUndefined();
      expect(r.kinds, `${r.fn}: 標本が無い行は other-screen だけ`).toEqual(['other-screen']);
    }
    // 逆向き: 標本を持つ行は必ず collection も持つ
    for (const r of LEDGER.filter((x) => x.sample !== undefined)) {
      expect(r.collection, `${r.fn}: 標本は在るのに collection が無い`).toBeDefined();
    }
  });

  it('★ audit-panel を名指しする文の標本は、実物の点検パネルが見つける', async () => {
    const rows = LEDGER.filter((r) => r.kinds.includes('audit-panel'));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const r of rows) {
      expect(r.sample, `${r.fn}: 点検パネルを名乗る行には標本が要る`).toBeDefined();
      const res = await auditRecordShapes(storeWith(r.collection!, r.sample!));
      expect(res.checked, `${r.fn}: 標本が判定されていない`).toBe(1);
      expect(
        res.malformed.map((m) => m.collection),
        `${r.fn} は設定の点検パネルを名指しするが、その標本をパネルは見つけない (行った先が「ありません」と答える)`,
      ).toEqual([r.collection]);
    }
  });

  it('★ list-x を名指しする文の標本は、形の表を通る (通らなければ復元で捨てられ一覧に出ない)', () => {
    const rows = LEDGER.filter((r) => r.kinds.includes('list-x'));
    expect(rows.length).toBeGreaterThanOrEqual(7);
    for (const r of rows) {
      expect(r.sample, `${r.fn}: 一覧の × を名乗る行には標本が要る`).toBeDefined();
      expect(
        hasCollectionShape(r.collection!, r.sample!),
        `${r.fn} は一覧の × を名指しするが、その標本は形の表が断る (復元で捨てられ一覧に出ない)`,
      ).toBe(true);
    }
  });

  it('★ KPI の期が読めない行は、パネルではなく一覧に在る (この欠陥そのものの回帰)', async () => {
    const res = await auditRecordShapes(storeWith(KPI_ACTUALS_COLLECTION, KPI_BAD_PERIOD));
    expect(res.malformed, '点検パネルは形しか見ないので、この行は見つからない').toEqual([]);
    expect(hasCollectionShape(KPI_ACTUALS_COLLECTION, KPI_BAD_PERIOD), '形としては正しいので一覧に残る').toBe(true);
    // 対照の非対称 —— 売上は逆 (形が断るのでパネルに出る)
    expect(hasCollectionShape(SALES_COLLECTION, SALES_BAD_DATE)).toBe(false);
  });
});

/**
 * **補間で画面名が入る所の台帳** (2026-09-25 · パス 455)。
 *
 * この走査は綴りしか見られないので、`「${x}」の画面` のように**実行時に値が入る**形は
 * ラベルと突き合わせられない。黙って外すと `「${'でたらめ'}」の画面` まで通るので、
 * **1 件ずつ「入る値は何か」と「それを誰が確かめるか」を書かせる** (両方向)。
 */
const INTERPOLATED: readonly { readonly at: string; readonly heldBy: string; readonly why: string }[] = [
  {
    at: 'src/shared/buildDestinations.ts',
    heldBy: 'src/renderer/pages/__tests__/credentialSlotBuildGate.test.ts',
    why:
      '資格情報スロットの行き先 (`CredentialSlot.desktopScreen` の 8 つ)。'
      + '入る値が `SERVICES` のラベルであることと、その画面に働く資格情報欄が在ることを'
      + '`heldBy` が両方向で持つ —— この走査は綴りしか見られない。',
  },
];

describe('「X」の画面 の X は実在するラベル (パス 425)', () => {
  const LABELS = new Set(SERVICES.map((s) => s.label));

  it('走査が空虚でない', () => {
    expect(LABELS.size).toBeGreaterThanOrEqual(70);
  });

  it('★ 補間の台帳は、理由と「誰が確かめるか」を持ち、その検査が実在する', () => {
    for (const r of INTERPOLATED) {
      expect(r.why.length, r.at).toBeGreaterThanOrEqual(30);
      expect(() => readOriginalSource(r.heldBy), `${r.heldBy} が無い`).not.toThrow();
      // その検査が実際にラベルと突き合わせていること (名前だけ書いて終わらせない)。
      expect(readOriginalSource(r.heldBy), `${r.heldBy} が SERVICES を読んでいない`).toContain('SERVICES');
    }
  });

  it('★ 利用者へ出す文が名指しする画面名は、サイドバーの綴りと一致する', () => {
    const bad: string[] = [];
    const interpolated: string[] = [];
    let seen = 0;
    for (const dir of ['src/renderer/data', 'src/renderer/pages', 'src/shared']) {
      for (const file of walk(dir)) {
        const code = codeOnly(readOriginalSource(file));
        code.split('\n').forEach((line, i) => {
          for (const m of line.matchAll(SCREEN_RE)) {
            seen += 1;
            // 補間は綴りではない —— 台帳に在れば飛ばし、無ければ下の ★ が鳴らす。
            if (m[1]!.includes('${')) {
              interpolated.push(file);
              continue;
            }
            if (!LABELS.has(m[1]!)) bad.push(`${file}:${i + 1} 「${m[1]}」`);
          }
        });
      }
    }
    expect(seen, '走査が 1 件も見つけていない (針が死んでいる)').toBeGreaterThanOrEqual(4);
    expect(bad, 'サイドバーに無い綴りで画面を指さしている').toEqual([]);
    // **両方向** —— 補間の在るファイルは台帳に在り、台帳の行は実物に在る。
    const known = new Set(INTERPOLATED.map((r) => r.at));
    expect([...new Set(interpolated)].filter((f) => !known.has(f)), '補間で画面を指さすのに台帳に無い').toEqual([]);
    expect(INTERPOLATED.filter((r) => !interpolated.includes(r.at)).map((r) => r.at), '台帳に在るのに走査に無い').toEqual([]);
  });

  it('★ 針は標本に当たる (綴り違いで黙る検査でないこと)', () => {
    const grab = (s: string) => [...s.matchAll(SCREEN_RE)].map((m) => m[1]);
    expect(grab('「KPI / BEP」の画面の一覧に出ています')).toEqual(['KPI / BEP']);
    expect(grab('「売上集計」の画面で記録を追加すると')).toEqual(['売上集計']);
    expect(LABELS.has('KPI 実績'), '2026-09-23 まで名指ししていた綴り —— 実在しない').toBe(false);
    expect(LABELS.has('KPI / BEP')).toBe(true);
  });
});
