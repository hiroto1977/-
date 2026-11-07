/**
 * 計算書類に併記する参考明細の組み立て (2026-09-20 · パス 329)。
 *
 * ここで守るのは 3 つ: **合計は保有から導く** (どこかに書いた数字を写さない)・
 * **貸借対照表の簿価と並べる** (突き合わせができる)・**断りが 3 つとも出る**
 * (計算書類でない / 数字の出所 / 基準の違い)。
 */
import { describe, expect, it } from 'vitest';
import {
  ANNEX_BASIS_NOTE,
  ANNEX_NOT_STATUTORY,
  annexOriginNote,
  buildPortfolioAnnex,
} from '../portfolioAnnex';
import type { Amounts } from '../statementAccounts';

const FUNDS = [
  { name: 'eMAXIS Slim 米国株式', valuation: 3_000_000 },
  { name: 'ひふみプラス', valuation: 1_000_000 },
];
const PROPS = [
  { name: '渋谷区マンション', purchasePrice: 42_000_000 },
  { name: '横浜市戸建て', purchasePrice: 45_000_000 },
];
const BOOKS: Amounts = { investments: '2_500_000'.replace(/_/g, ''), land: '30000000', buildings: '20000000' };

function amountOfRow(rows: readonly { label: string; amount: number }[], label: string): number {
  const r = rows.find((x) => x.label === label);
  if (!r) throw new Error(`行が無い: ${label}`);
  return r.amount;
}

describe('buildPortfolioAnnex', () => {
  it('合計は保有から導く (写さない)', () => {
    const a = buildPortfolioAnnex(FUNDS, PROPS, BOOKS);
    expect(a.fundsTotal).toBe(4_000_000);
    expect(a.propertiesTotal).toBe(87_000_000);
    expect(amountOfRow(a.rows, '評価額 合計')).toBe(4_000_000);
    expect(amountOfRow(a.rows, '取得価額 合計')).toBe(87_000_000);
    expect(a.empty).toBe(false);
  });

  it('★ 貸借対照表の簿価と並べ、差は「引き算の事実」として出す', () => {
    const a = buildPortfolioAnnex(FUNDS, PROPS, BOOKS);
    expect(amountOfRow(a.rows, '貸借対照表 投資有価証券（簿価）')).toBe(2_500_000);
    expect(amountOfRow(a.rows, '差（評価額 − 簿価）')).toBe(4_000_000 - 2_500_000);
    // 土地 + 建物
    expect(amountOfRow(a.rows, '貸借対照表 土地 + 建物（簿価）')).toBe(50_000_000);
    expect(amountOfRow(a.rows, '差（取得価額 − 簿価）')).toBe(87_000_000 - 50_000_000);
  });

  it('簿価が未記入なら 0 として扱い、差は保有の合計そのものになる', () => {
    const a = buildPortfolioAnnex(FUNDS, PROPS, {});
    expect(amountOfRow(a.rows, '貸借対照表 投資有価証券（簿価）')).toBe(0);
    expect(amountOfRow(a.rows, '差（評価額 − 簿価）')).toBe(4_000_000);
  });

  it('★ 読めない金額 (NaN / Infinity / 文字列 / 欠落) は 0 に倒し、合計を壊さない', () => {
    const broken = [
      { name: '壊れた 1', valuation: Number.NaN },
      { name: '壊れた 2', valuation: Number.POSITIVE_INFINITY },
      { name: '壊れた 3', valuation: '100' as unknown as number },
      { name: '正しい', valuation: 500 },
    ];
    const a = buildPortfolioAnnex(broken, [], {});
    expect(a.fundsTotal).toBe(500);
    expect(Number.isFinite(amountOfRow(a.rows, '評価額 合計'))).toBe(true);
    expect(amountOfRow(a.rows, '壊れた 3')).toBe(0);
  });

  it('保有が 0 件なら empty (画面は「明細がありません」と言う)', () => {
    const a = buildPortfolioAnnex([], [], BOOKS);
    expect(a.empty).toBe(true);
    expect(a.fundsTotal).toBe(0);
    expect(a.propertiesTotal).toBe(0);
    // 片方だけでも empty ではない
    expect(buildPortfolioAnnex(FUNDS, [], BOOKS).empty).toBe(false);
    expect(buildPortfolioAnnex([], PROPS, BOOKS).empty).toBe(false);
  });

  it('行の並びは 投資信託 → 不動産 で、見出しと小計と突き合わせを持つ', () => {
    const a = buildPortfolioAnnex(FUNDS, PROPS, BOOKS);
    const kinds = a.rows.map((r) => r.kind);
    expect(kinds[0]).toBe('section');
    expect(a.rows.filter((r) => r.kind === 'subtotal')).toHaveLength(2);
    expect(a.rows.filter((r) => r.kind === 'compare')).toHaveLength(4);
    expect(a.rows.findIndex((r) => r.label === '投資信託の保有（評価額・時価）'))
      .toBeLessThan(a.rows.findIndex((r) => r.label === '不動産の保有（取得価額）'));
  });
});

describe('断りの文面', () => {
  it('★ 計算書類でないことを、条文と 4 点の名前つきで言う', () => {
    expect(ANNEX_NOT_STATUTORY).toContain('会社法435条2項');
    expect(ANNEX_NOT_STATUTORY).toContain('含まれません');
    for (const name of ['貸借対照表', '損益計算書', '株主資本等変動計算書', '個別注記表']) {
      expect(ANNEX_NOT_STATUTORY, name).toContain(name);
    }
  });

  it('★ 出所が見本なら「実データではない・転記しない」と言い、実データなら原本照合を促す', () => {
    const sample = annexOriginNote('sample');
    expect(sample).toContain('見本データです');
    expect(sample).toContain('実際の保有ではありません');
    expect(sample).toContain('転記しないでください');
    const live = annexOriginNote('remote');
    expect(live).not.toContain('見本データです');
    expect(live).toContain('原本と突き合わせて');
    // 標本: 「見本データです」の綴りは sample 側に実際に在る (不在の主張が空にならない)
    expect(sample).toContain('見本データです');
    expect(annexOriginNote('local')).toContain('原本と突き合わせて');
  });

  it('基準の違いを言い、差額を評価損益と呼ばない', () => {
    expect(ANNEX_BASIS_NOTE).toContain('時価');
    expect(ANNEX_BASIS_NOTE).toContain('取得価額');
    expect(ANNEX_BASIS_NOTE).toContain('簿価');
    expect(ANNEX_BASIS_NOTE).toContain('差が出るのが通常');
    expect(ANNEX_BASIS_NOTE).toContain('評価損益でも誤りでもありません');
  });
});
