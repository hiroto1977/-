/**
 * **登録した事業を比較グラフ用の行にするとき、数でない値・非有限の値をどう読むか。** (パス 502)
 *
 * `financialUnitsFromBusinessUnits` は売上を入れた事業だけを行にし、**売上が数として読めない事業は
 * 行ごと出さない** (未入力を 0 として並べると「利益率 0% の事業」に見える)。費用 (変動費・固定費) は
 * 読めなければ 0 として扱う (売上が在れば行は残す)。「読める」は**有限な数**で、文字列の数字
 * (`'1000000'`) や `NaN` / `±Infinity` / 物・配列は読めない値である。
 *
 * 判定は 3 欄とも `isFiniteNumber` 1 つ (型の絞り込みのためだけに在った `typeof` の写しを消した)。
 * 消した後も答えが同じことを、読めない値の標本を値ごとに並べて示す。
 */
import { describe, expect, it } from 'vitest';
import { financialUnitsFromBusinessUnits } from '../businessUnits';
import type { BusinessUnitRecord } from '../businessUnits';

const unit = (data: Record<string, unknown>, id = 'u1'): BusinessUnitRecord =>
  ({ id, data: { name: 'A', ...data } as never }) as BusinessUnitRecord;

/** 数として読めない値。`typeof` が 'number' になる非有限と、そもそも数でない物の両方。 */
const UNREADABLE: readonly [string, unknown][] = [
  ['NaN', Number.NaN],
  ['+Infinity', Number.POSITIVE_INFINITY],
  ['-Infinity', Number.NEGATIVE_INFINITY],
  ['数字の文字列', '1000000'],
  ['空文字', ''],
  ['null', null],
  ['undefined', undefined],
  ['真偽値', true],
  ['物', { v: 1 }],
  ['配列', [1000000]],
];

describe('financialUnitsFromBusinessUnits — 売上が読めない事業は行ごと出さない (パス 502)', () => {
  for (const [name, bad] of UNREADABLE) {
    it(`★ 売上が ${name} の事業は行にならない (費用が読めても)`, () => {
      expect(financialUnitsFromBusinessUnits([unit({ revenue: bad, variableCost: 100, fixedCost: 200 })])).toEqual([]);
    });
  }

  it('★ 対照: 売上が 0 の事業は「入力した 0」として行になる (未入力とは違う)', () => {
    const out = financialUnitsFromBusinessUnits([unit({ revenue: 0, variableCost: 100, fixedCost: 200 })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.current).toEqual({ revenue: 0, variableCost: 100, fixedCost: 200, profit: -300, profitMargin: 0 });
  });

  it('★ 読める売上の行は、id・名前・当月の内訳・空の履歴を持つ', () => {
    const out = financialUnitsFromBusinessUnits([unit({ revenue: 1_000_000, variableCost: 300_000, fixedCost: 200_000 }, 'x9')]);
    expect(out).toEqual([
      {
        id: 'x9',
        label: 'A',
        current: { revenue: 1_000_000, variableCost: 300_000, fixedCost: 200_000, profit: 500_000, profitMargin: 50 },
        history: [],
      },
    ]);
  });
});

describe('financialUnitsFromBusinessUnits — 費用が読めなければ 0 (行は残す) (パス 502)', () => {
  for (const [name, bad] of UNREADABLE) {
    it(`★ 変動費が ${name} のときは 0 として扱い、固定費はそのまま`, () => {
      const out = financialUnitsFromBusinessUnits([unit({ revenue: 1_000_000, variableCost: bad, fixedCost: 200_000 })]);
      expect(out).toHaveLength(1);
      expect(out[0]!.current).toEqual({ revenue: 1_000_000, variableCost: 0, fixedCost: 200_000, profit: 800_000, profitMargin: 80 });
    });

    it(`★ 固定費が ${name} のときは 0 として扱い、変動費はそのまま`, () => {
      const out = financialUnitsFromBusinessUnits([unit({ revenue: 1_000_000, variableCost: 300_000, fixedCost: bad })]);
      expect(out).toHaveLength(1);
      expect(out[0]!.current).toEqual({ revenue: 1_000_000, variableCost: 300_000, fixedCost: 0, profit: 700_000, profitMargin: 70 });
    });
  }

  it('★ 対照: 読める費用 (0 と負を含む) はそのまま使う', () => {
    const out = financialUnitsFromBusinessUnits([unit({ revenue: 1_000_000, variableCost: 0, fixedCost: -50_000 })]);
    expect(out[0]!.current).toEqual({ revenue: 1_000_000, variableCost: 0, fixedCost: -50_000, profit: 1_050_000, profitMargin: 105 });
  });
});
