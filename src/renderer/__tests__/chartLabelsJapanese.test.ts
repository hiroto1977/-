/**
 * グラフと図の中の名前は日本語で書く (2026-11-20 · 日本語表記の 2 回目)。
 *
 * 利用者の依頼は「写真やイラスト内の文字も含め全てを日本語表記で」。1 回目 (画面の名前と印) の後、
 * 図の中に残っていた英字を実機で数えると (LITE・77 画面)、経営サマリーの図だけに残っていた:
 * 財務の略語 4 つ (レーダーの軸) と、事業の名前に入った英字 5 語 (事業ごとの図に 13 回ずつ)。
 *
 * 直した後は、図へ出る名前の出どころ 4 つ —— レーダーの軸・事業ごとの指標・手で置ける欄・
 * 事業の名前 —— に英字が 1 つも無い。ここはそれを留める (略語を足した日に鳴る)。
 *
 * 見ているのは**名前の一覧**であって描いた図ではない (描いた図は実機で撮って確かめた)。
 * 金融機関等提出用の書面は「総資産利益率（略語）」の形で略語を併記しており、ここの対象ではない
 * (`docs/REMAINING_WORK.md`)。
 */
import { describe, expect, it } from 'vitest';
import { INDICATORS } from '../data/businessAxonometric';
import { computeFinancialRatios, radarAxes, type FinancialInputs } from '../data/financialRatios';
import { OVERRIDABLE_FIELDS } from '../data/overviewOverrides';
import { SNAPSHOT } from '../data/snapshot';

const LATIN = /[A-Za-z]/;
const withLatin = (names: readonly string[]): string[] => names.filter((n) => LATIN.test(n));

const SAMPLE: FinancialInputs = {
  revenue: 12_000,
  cogs: 6_000,
  operatingProfit: 1_200,
  ordinaryProfit: 1_100,
  netProfit: 800,
  depreciation: 300,
  laborCost: 3_000,
  totalAssets: 10_000,
  equity: 4_000,
  currentAssets: 5_000,
  currentLiabilities: 2_500,
  fixedAssets: 5_000,
  fixedLiabilities: 3_000,
  accountsReceivable: 2_000,
  inventory: 1_000,
  accountsPayable: 1_500,
  interestBearingDebt: 4_000,
};

describe('グラフと図の中の名前は日本語', () => {
  it('針が的に当たる: 直す前の名前 (略語) は英字として拾う', () => {
    expect(withLatin(['自己資本比率', 'ROE', 'EBITDAマージン', '現金化日数'])).toEqual(['ROE', 'EBITDAマージン']);
  });

  it('★ レーダーの 15 軸の名前に英字が無い', () => {
    const labels = radarAxes(computeFinancialRatios(SAMPLE)).map((a) => a.label);
    expect(labels).toHaveLength(15);
    expect(withLatin(labels)).toEqual([]);
  });

  it('★ 事業ごとの図の指標 (17) の名前に英字が無い', () => {
    const labels = INDICATORS.map((i) => i.label);
    expect(labels).toHaveLength(17);
    expect(withLatin(labels)).toEqual([]);
  });

  it('★ 手で置ける欄の名前に英字が無い (一覧は図の隣に並ぶ)', () => {
    const labels = OVERRIDABLE_FIELDS.map((f) => f.label);
    expect(labels.length).toBeGreaterThanOrEqual(40);
    expect(withLatin(labels)).toEqual([]);
  });

  it('★ 事業の名前 (同梱の 10 事業) に英字が無い', () => {
    const labels = SNAPSHOT.business.units.map((u) => u.label);
    expect(labels).toHaveLength(10);
    expect(withLatin(labels)).toEqual([]);
  });

  it('同じ指標は同じ名前で呼ぶ (レーダーの軸と事業ごとの図)', () => {
    const radar = new Map(radarAxes(computeFinancialRatios(SAMPLE)).map((a) => [a.key, a.label]));
    for (const i of INDICATORS) {
      const r = radar.get(i.key);
      if (r !== undefined) expect(i.label, i.key).toBe(r);
    }
    // 走査が空でないこと (鍵が 1 つも重ならなければ上の主張は何も見ていない)
    expect(INDICATORS.filter((i) => radar.has(i.key)).length).toBeGreaterThanOrEqual(10);
  });
});
