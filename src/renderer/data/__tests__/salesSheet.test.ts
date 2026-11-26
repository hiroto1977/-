/**
 * `planSalesSheet` —— 売上の記録をスプレッドシートの表にする (2026-11-22)。
 *
 * 行の部分集合は合計・月別の集計と同じ (`readableSalesRows`)。読めない行は落として件数を返し、
 * 天井を超えるときは切らずに断る。
 */
import { describe, expect, it } from 'vitest';
import { SALES_SHEET_COLUMNS, droppedFromSheetNote, planSalesSheet, tooManyForSheetNote } from '../salesSheet';
import { readableSalesRows, type SalesEntry } from '../sales';
import { MAX_SHEET_ROWS, checkSheetTable } from '../../../shared/writeFieldLimits';
import { SALES_CSV_COLUMNS } from '../salesCsv';

const e = (over: Record<string, unknown> = {}): SalesEntry =>
  ({ date: '2026-11-01', channel: 'amazon', amount: 1000, orders: 2, ...over }) as SalesEntry;

describe('planSalesSheet', () => {
  it('★ 見出しは CSV の書き出しと同じ欄を、同じ順に日本語で持つ', () => {
    expect(SALES_SHEET_COLUMNS).toHaveLength(SALES_CSV_COLUMNS.length);
    expect([...SALES_SHEET_COLUMNS]).toStrictEqual(['日付', '販売先', '金額', '注文の数', 'メモ']);
  });

  it('★ 読める行だけを日付の古い順に・販売先は画面の名前で・空のメモは空のセルで', () => {
    const plan = planSalesSheet(
      [
        e({ date: '2026-11-05', channel: 'rakuten', note: '  返品あり  ' }),
        e({ date: '2026-11-02', note: '   ' }),
        e({ date: '2026-02-31' }), // 暦に無い日
        e({ date: '2026-11-03', amount: '1000' }), // 金額が数でない
      ],
      '2026-11-22',
    );
    expect(plan).toStrictEqual({
      kind: 'ready',
      dropped: 2,
      payload: {
        title: '売上の記録 (2026-11-22)',
        columns: SALES_SHEET_COLUMNS,
        rows: [
          ['2026-11-02', 'Amazon', 1000, 2, null],
          ['2026-11-05', '楽天市場', 1000, 2, '返品あり'],
        ],
      },
    });
  });

  it('★ 落とす件数は合計・月別の集計と同じ部分集合から数える', () => {
    const rows = [e(), e({ date: 'bad' }), e({ orders: null })];
    const plan = planSalesSheet(rows, '2026-11-22');
    expect(plan.dropped).toBe(readableSalesRows(rows).dropped);
  });

  it('★ 知らない販売先は表示の天井を通した文字にし、物は空にする', () => {
    const plan = planSalesSheet([e({ channel: 'yahoo' }), e({ channel: { a: 1 } })], 'd');
    expect(plan.kind === 'ready' && plan.payload.rows.map((r) => r[1])).toStrictEqual(['yahoo', '']);
  });

  it('★ 組んだ表は共有の関門 (checkSheetTable) を通る', () => {
    const plan = planSalesSheet([e(), e({ note: 'メモ' })], 'd');
    expect(plan.kind).toBe('ready');
    if (plan.kind === 'ready') expect(checkSheetTable(plan.payload.columns, plan.payload.rows)).toBeNull();
  });

  it('★ 読める行が無ければ empty、天井を超えれば too-many (切らない)', () => {
    expect(planSalesSheet([], 'd')).toStrictEqual({ kind: 'empty', dropped: 0 });
    expect(planSalesSheet([e({ date: 'x' })], 'd')).toStrictEqual({ kind: 'empty', dropped: 1 });
    const exact = Array.from({ length: MAX_SHEET_ROWS }, () => e());
    expect(planSalesSheet(exact, 'd').kind).toBe('ready');
    expect(planSalesSheet([...exact, e(), e({ date: 'x' })], 'd')).toStrictEqual({
      kind: 'too-many',
      count: MAX_SHEET_ROWS + 1,
      dropped: 1,
    });
  });
});

describe('文', () => {
  it('落とした件数が 0 なら何も言わない', () => {
    expect(droppedFromSheetNote(0)).toBeNull();
    expect(droppedFromSheetNote(Number.NaN)).toBeNull();
    expect(droppedFromSheetNote(Number.POSITIVE_INFINITY)).toBeNull();
    expect(droppedFromSheetNote(1.5)).toBeNull();
    expect(droppedFromSheetNote(3)).toBe('日付・金額・注文の数が読めない 3 件は書き出しません。');
  });

  it('天井を超えたときは件数と CSV の書き出しを名指しする', () => {
    expect(tooManyForSheetNote(600)).toBe(
      `スプレッドシートへ一度に書き出せるのは ${MAX_SHEET_ROWS} 件までです (いま 600 件)。すべてを書き出すときは「表のファイル (CSV) に書き出す」を使ってください。`,
    );
  });
});
