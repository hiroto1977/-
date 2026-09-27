/**
 * **採点した水準が利用者の保存値ではなく既定であることを、採点する面が言う。**
 * (2026-09-14 · パス 227)
 *
 * パス 222 は「0 点 / 100 点の水準が等しい帯 (`good === bad`) を `axisBand` が
 * 黙って既定へ倒す」ことを見つけ、**設定画面**に断りを付けた —— 保存を断り
 * (`PARAMETER_DISTINCT`)、すでに保存されている組を上部で名指しする。
 *
 * **だが採点する画面の側は何も言わなかった。** 診断カードは「自己資本比率 60 点」と
 * 刷り、その 60 点が利用者の保存した水準ではなく**既定の水準で付いた**ことを示さない。
 * パス 222 の実測そのまま: `equityRatioBad = equityRatioGood = 50` で
 * **スコアは上書きあり 60 / 上書きなし 60 で完全に同じ**なので、
 * **画面に差が出ない = 利用者には区別できない。**
 *
 * 倒し込み自体は正しい防御 (幅 0 の帯では 0 除算) だが、
 * **黙って倒す防御は、倒したことを誰かが言わなければ嘘になる** (パス 219 / 222 / 225 / 226)。
 * 設定画面が言うのは「その組は効きません」で、診断画面が言うべきは
 * 「この点数は既定の水準で付いています」—— **別の面には別の文が要る。**
 */
import { describe, expect, it } from 'vitest';
import {
  computeFinancialRatios,
  radarAxes,
  axisBand,
  defaultBandAxes,
  defaultBandNote,
} from '../financialRatios';
import { RADAR_AXIS_BANDS, RADAR_AXIS_KEYS, type RadarBands } from '../../../shared/financialHealthBands';

/** 自己資本比率 50% ちょうどの会社 (パス 222 の実測と同じ条件を作る)。 */
const FIN = {
  revenue: 10_000_000, cogs: 4_000_000, laborCost: 2_000_000, operatingProfit: 1_000_000,
  ordinaryProfit: 1_000_000, netProfit: 700_000,
  totalAssets: 10_000_000, equity: 5_000_000,
  currentAssets: 4_000_000, currentLiabilities: 2_000_000, fixedAssets: 6_000_000,
  fixedLiabilities: 3_000_000, interestBearingDebt: 2_000_000, cash: 1_000_000,
  accountsReceivable: 1_000_000, inventory: 1_000_000, accountsPayable: 500_000,
  depreciation: 200_000, advertising: 100_000, sga: 3_000_000,
} as Parameters<typeof computeFinancialRatios>[0];

/** 1 軸だけ幅 0 にした帯。 */
function collapsed(...keys: readonly (typeof RADAR_AXIS_KEYS)[number][]): RadarBands {
  const out = { ...RADAR_AXIS_BANDS } as Record<string, { bad: number; good: number }>;
  for (const k of keys) out[k] = { bad: 50, good: 50 };
  return out as RadarBands;
}

describe('defaultBandAxes — 既定へ倒した軸を数える', () => {
  it('既定の帯では 0 件 (断りを出さない)', () => {
    const axes = radarAxes(computeFinancialRatios(FIN));
    expect(defaultBandAxes(axes, RADAR_AXIS_BANDS)).toEqual([]);
    expect(defaultBandNote(defaultBandAxes(axes, RADAR_AXIS_BANDS))).toBeNull();
    // 既定を渡さない呼び出しも同じ (省略時は既定)
    expect(defaultBandAxes(axes)).toEqual([]);
  });

  it('★ 幅 0 の帯の軸だけを拾い、ラベルと件数を言う', () => {
    const axes = radarAxes(computeFinancialRatios(FIN), collapsed('equityRatio'));
    const hit = defaultBandAxes(axes, collapsed('equityRatio'));
    expect(hit.map((a) => a.key)).toEqual(['equityRatio']);
    const note = defaultBandNote(hit);
    expect(note).not.toBeNull();
    expect(note).toContain('自己資本比率');
    expect(note).toContain('1 軸');
    expect(note).toContain('既定の水準で採点しています');
  });

  it('★ パス 222 の実測 — 幅 0 の上書きはスコアを 1 点も動かさないので、断りだけが差になる', () => {
    const ratios = computeFinancialRatios(FIN);
    const bands = collapsed('equityRatio');
    const withOverride = radarAxes(ratios, bands).find((a) => a.key === 'equityRatio');
    const withDefault = radarAxes(ratios, RADAR_AXIS_BANDS).find((a) => a.key === 'equityRatio');
    // 同じ点数 —— これが「利用者には区別できない」の意味
    expect(withOverride?.score).toBe(withDefault?.score);
    // `axisBand` は既定へ倒している (倒し込みは残す・0 除算を作らない)
    expect(axisBand('equityRatio', bands)).toEqual(RADAR_AXIS_BANDS.equityRatio);
    // 差になるのは断りだけ
    expect(defaultBandNote(defaultBandAxes(radarAxes(ratios, bands), bands))).not.toBeNull();
    expect(defaultBandNote(defaultBandAxes(radarAxes(ratios), RADAR_AXIS_BANDS))).toBeNull();
  });

  it('複数の軸は台帳 (RADAR_AXIS_KEYS) の順で並ぶ — 画面の軸の並びと一致する', () => {
    const bands = collapsed('roe', 'equityRatio', 'laborShare');
    const hit = defaultBandAxes(radarAxes(computeFinancialRatios(FIN), bands), bands);
    expect(hit.map((a) => a.key)).toEqual(
      RADAR_AXIS_KEYS.filter((k) => k === 'equityRatio' || k === 'laborShare' || k === 'roe'),
    );
    expect(defaultBandNote(hit)).toContain('3 軸');
  });

  it('15 軸すべてを幅 0 にすると 15 軸を名指しする (取りこぼしが無い)', () => {
    const bands = collapsed(...RADAR_AXIS_KEYS);
    const hit = defaultBandAxes(radarAxes(computeFinancialRatios(FIN), bands), bands);
    expect(hit).toHaveLength(RADAR_AXIS_KEYS.length);
    expect(defaultBandNote(hit)).toContain(`${RADAR_AXIS_KEYS.length} 軸`);
  });

  it('軸の一覧に無い鍵は無視する (台帳の側から回しているので、知らない鍵は拾わない)', () => {
    const bands = collapsed('equityRatio');
    // 合成鍵だけの一覧 → 幅 0 の軸が一覧に無いので 0 件
    expect(defaultBandAxes([{ key: 'zzz', label: 'X', unit: '', raw: 1, score: 1 }], bands)).toEqual([]);
  });
});
