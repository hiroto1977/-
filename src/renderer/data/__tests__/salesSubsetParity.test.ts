/**
 * **分子と分母を同じ部分集合から取る —— 売上の側** (2026-09-22 · パス 400)。
 *
 * ## 見つけた物 (実測)
 *
 * `summarizeSales` は**合計を全行から**取りながら `period` だけを `salesPeriod`
 * (= 暦に在る日だけ) で絞っていた。同じ器の中に、選別前の分子と選別後の分母が
 * 並んでいた —— `kpiActuals.ts` の `readablePeriodRows` が **パス 225** で KPI に
 * ついて直した当の形で、売上の側だけが残っていた。
 *
 * 実測 (2026-09-22 · 直す前・100 万 × 2 件 + 日付 `2026-02-31` の 1 件 9,900 万):
 *
 * | 面 | 値 |
 * | --- | ---: |
 * | **金融機関等提出用の書面 §2「売上高（販売記録）」** | **101,000 千円** |
 * | 同じ §2 の但し書き | 「販売記録の**令和8年1月〜令和8年2月・2 か月分**の累計です」 |
 * | 同じデータの月別合計 (`monthlyTotals`) | **2,000,000** |
 * | 受注件数 / 平均受注単価 | **1,019件 / 99,116円** (読める 2 件なら 20件 / 100,000円) |
 * | 紙が「読めない行を落とした」と述べるか | **述べない** |
 *
 * ★ **紙の合計が、紙が名乗る月の合計の 50.5 倍**になり、「上記のとおり相違ありません。」と
 * 代表者名つきで署名する紙がそれを刷っていた。
 *
 * ## この検査の要点 —— **母集団を宣言から導く**
 *
 * 個々の欄を並べて当てると、6 つ目の集計欄が足された日に黙る。そこで
 * `SalesSummary` の宣言を走査して欄名を取り、**「読めない行を 1 件足しても、
 * 落とした件数以外は 1 つも動かない」**を全欄に掛ける。新しい欄が `entries` から
 * 直に計算されていれば、その欄で落ちる。
 *
 * ## 対照 (2026-09-22 実測 · 8 方向のうち 7 方向鳴る)
 *
 * | 対照 | 結果 |
 * | --- | --- |
 * | A `summarizeSales` を全行へ戻す (**元の欠陥そのもの**) | ❌3 |
 * | C 紙が落とした件数を述べるのをやめる | ❌1 (書面) |
 * | D 画面が述べるのをやめる | ❌1 (経営サマリー) |
 * | E `hasData` を素の件数で測る | ❌1 |
 * | F 重複を全行から数える | ❌1 |
 * | G 原因を常に「未入力」にする | ❌1 |
 * | H 広い理由が在っても狭い方も言う | ❌1 |
 * | **B `period: salesPeriod(entries)` へ戻す** | **鳴らない** |
 *
 * ★ **B が鳴らないのは、それが等価変異だから** —— `salesPeriod` は中で
 * `isCalendarDate` で絞るので、絞った行を渡しても全行を渡しても同じ答えになる。
 * `rows` を渡すのは**読みやすさ**のためで、振る舞いは変わらない (製品側にそう書いた)。
 * **「鳴らない対照は合格ではなく、その検査についての報せ」**であり、この報せは
 * 「そこに主張は無い」である —— 元の欠陥は*分子が絞られていないこと*で、
 * そちらは A が 3 件で殺す。パス 399 で学んだ区分 (偽の生存 / 等価 / 本物の穴) の
 * **等価**にあたる。
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import {
  blankSalesCause,
  droppedSalesRowsNote,
  droppedSalesRowsSheetNote,
  monthlyTotals,
  noSalesRecordsNote,
  noSalesRecordsSheetNote,
  readableSalesRows,
  summarizeSales,
  unreadableSalesDateNote,
  unreadableSalesDateSheetNote,
  type SalesEntry,
  type SalesSummary,
} from '../sales';
import { buildBusinessOverview } from '../overview';

const REPO = join(__dirname, '..', '..', '..', '..');
const SALES_TS = join(REPO, 'src/renderer/data/sales.ts');

const A: SalesEntry = { date: '2026-01-15', channel: 'shopify', amount: 1_000_000, orders: 10, note: 'A' };
const B: SalesEntry = { date: '2026-02-15', channel: 'shopify', amount: 1_000_000, orders: 10, note: 'B' };
/** 暦に無い日 (2 月 31 日)。`isCalendarDate` が読めないと言う値。 */
const BAD: SalesEntry = { date: '2026-02-31', channel: 'base', amount: 99_000_000, orders: 999, note: 'C' };

/**
 * `SalesSummary` の欄名を**宣言から**取る。
 *
 * 手で並べると 6 つ目の集計欄が足された日に黙る (パス 398 の
 * `dosingNumericFields` と同じ形)。注記の中の綴りは拾わない。
 */
function summaryFields(source: string): string[] {
  const m = /export interface SalesSummary \{([\s\S]*?)\n\}/.exec(source);
  if (m === null) throw new Error('SalesSummary の宣言が見つからない (針が実物に当たっていない)');
  const body = m[1] ?? '';
  const out: string[] = [];
  for (const line of body.split('\n')) {
    const f = /^\s*readonly ([A-Za-z][A-Za-z0-9]*)\??:/.exec(line);
    if (f !== null && f[1] !== undefined) out.push(f[1]);
  }
  return out;
}

describe('★ 販売の集計は 1 つの部分集合から出る (パス 400)', () => {
  it('★ 読めない行を足しても、落とした件数以外は 1 つも動かない (母集団は宣言から)', () => {
    const fields = summaryFields(readOriginalSource(SALES_TS));
    // 走査が空虚でない床 —— 実物の欄を実際に取れている。
    expect(fields, '走査が実物に当たっていない').toContain('totalAmount');
    expect(fields).toContain('period');
    expect(fields).toContain('unreadableDates');
    expect(fields.length, '欄が少なすぎる (走査が痩せた)').toBeGreaterThanOrEqual(6);

    const clean = summarizeSales([A, B]) as unknown as Record<string, unknown>;
    const dirty = summarizeSales([A, B, BAD]) as unknown as Record<string, unknown>;
    for (const f of fields) {
      if (f === 'unreadableDates') continue;
      expect(JSON.stringify(dirty[f]), `${f} が読めない行を含んでいる`).toBe(JSON.stringify(clean[f]));
    }
    expect(dirty['unreadableDates'], '落とした件数').toBe(1);
    expect(clean['unreadableDates'], '落とす物が無ければ 0').toBe(0);
  });

  it('★ 合計は「名乗る月の合計」と一致する (紙の 50.5 倍が出ない)', () => {
    for (const rows of [[A, B], [A, B, BAD], [BAD], [], [A, BAD, BAD]]) {
      const s: SalesSummary = summarizeSales(rows);
      const byMonth = monthlyTotals(rows).reduce((acc, m) => acc + m.amount, 0);
      expect(s.totalAmount, `${rows.length} 件: 合計と月別の和が食い違う`).toBe(byMonth);
    }
    // 走査が空虚でない床 —— 読めない行が実際に効いている標本が在る。
    expect(summarizeSales([A, B, BAD]).totalAmount).toBe(2_000_000);
    expect(summarizeSales([A, B, BAD]).totalOrders).toBe(20);
    expect(summarizeSales([A, B, BAD]).aov).toBe(100_000);
  });

  it('★ 期間の月数と、合計に入った月の数が同じ', () => {
    const s = summarizeSales([A, B, BAD]);
    expect(s.period?.months).toBe(monthlyTotals([A, B, BAD]).length);
  });

  it('★ 経営サマリーの hasData / 重複も同じ部分集合から測る', () => {
    const ov = (rows: readonly SalesEntry[]) =>
      buildBusinessOverview({ plan: 'pro', sales: [...rows], kpiActuals: [], members: [] }).sales;
    expect(ov([A, B, BAD]).hasData, '読める行が在る').toBe(true);
    expect(ov([A, B, BAD]).unreadableDates).toBe(1);
    // 全部読めなければ「集計できる記録は無い」 —— 理由の無い 0 を紙に出さないため。
    expect(ov([BAD]).hasData, '読める行が 1 件も無い').toBe(false);
    expect(ov([BAD]).totalAmount).toBe(0);
    // 重複は合計に入った行からだけ数える (入っていない行を「2 度数えた」と言えない)。
    const dupOutside: SalesEntry[] = [
      A,
      { ...BAD, note: 'Shopify #1001' },
      { ...BAD, date: '2026-04-31', note: 'Shopify #1001' },
    ];
    expect(ov(dupOutside).duplicateOrders, '合計に入っていない行の重複を数えている').toEqual([]);
  });
});

describe('★ 空欄の原因は 1 つだけ、しかも正しい方 (パス 400)', () => {
  const state = (rows: readonly SalesEntry[]) => {
    const r = readableSalesRows(rows);
    return { hasData: r.rows.length > 0, unreadableDates: r.unreadableDates, unreadableAmounts: r.unreadableAmounts };
  };

  it('★ 3 状態がそれぞれ別の原因を返す', () => {
    expect(blankSalesCause(state([])), '0 件').toBe('no-records');
    expect(blankSalesCause(state([A, B, BAD])), '一部だけ読めない').toBeNull();
    expect(blankSalesCause(state([BAD])), '全部読めない').toBe('all-unreadable');
  });

  it('★ 記録が入っているのに「未入力」と言わない (パス 388 の売上側)', () => {
    const sheet = noSalesRecordsSheetNote(state([BAD])) ?? '';
    const screen = noSalesRecordsNote(state([BAD])) ?? '';
    expect(sheet).not.toContain('未入力');
    expect(screen).not.toContain('1 件も入力されていない');
    // そのかわり「読める記録が無い」と言い、件数を出す。
    expect(sheet).toContain('読める記録が 1 件も無い');
    expect(sheet).toContain('1 件');
    expect(screen).toContain('読める記録が 1 件も無い');
    // 標本: 本当に 0 件のときは「未入力」と言う (上の not が空の検査でないこと)。
    expect(noSalesRecordsSheetNote(state([]))).toContain('未入力');
  });

  it('★ 同じ事実を 2 度言わない (広い理由が在れば落とした件数は別に述べない)', () => {
    // 全部読めない = 節が丸ごと空欄。広い理由が件数まで述べるので、狭い方は出さない。
    expect(droppedSalesRowsSheetNote(state([BAD])), '紙').toBeNull();
    expect(droppedSalesRowsNote(state([BAD])), '画面').toBeNull();
    // 一部だけ読めない = 値は在る。そのときだけ落とした件数を述べる。
    expect(droppedSalesRowsSheetNote(state([A, B, BAD]))).toContain('1 件は集計から除いています');
    expect(droppedSalesRowsNote(state([A, B, BAD]))).toContain('集計・期間のすべてから除いています');
    // 落とす物が無ければどちらも黙る。
    expect(droppedSalesRowsSheetNote(state([A, B]))).toBeNull();
    expect(droppedSalesRowsNote(state([A, B]))).toBeNull();
  });

  it('非有限・未定義の件数は「言うことが無い」と同じ扱い (肯定形で書く)', () => {
    for (const n of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined as unknown as number]) {
      expect(unreadableSalesDateNote(n), `画面: ${String(n)}`).toBeNull();
      expect(unreadableSalesDateSheetNote(n), `紙: ${String(n)}`).toBeNull();
    }
  });

  it('★ 画面と紙は別の文 —— 紙は画面の操作を指示しない', () => {
    const sheet = unreadableSalesDateSheetNote(1) ?? '';
    const screen = unreadableSalesDateNote(1) ?? '';
    expect(screen).toContain('形式の合わないレコード');
    expect(sheet, '紙が画面の逃げ口を名指ししている').not.toContain('形式の合わない');
    expect(sheet).not.toBe(screen);
  });
});
