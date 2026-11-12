/**
 * 返済余力 (DSCR) の判定が**測れない入力**のとき「判定なし」を返すことを、値ごと (`toEqual`) 留める (パス 502)。
 *
 * `calcDscr` は NOI 側・返済額側のどちらにも有限を要求する。返済額側は `!(x > 0)` でも NaN を落とせるが、
 * **`+Infinity` は落とさない** —— `1e6 / Infinity` は 0 になり、`{ dscr: 0, band: 'danger' }`
 * (測れない返済額から「返済余力なし」という**判定**) が出ていた。`finiteOrNull` の枝がその 1 点を
 * 受け持つのに、既存の検査は NaN の組しか値で見ておらず、この枝を `false` にしても緑だった
 * (`nonFiniteEntryPoints.test.ts` は有限値の判定を返さないことだけを見る)。
 *
 * 返すのは `{ dscr: null, band: null }` —— 0 や 'danger' という**値**を作らない (法則 `blank-states-its-reason`)。
 */
import { describe, expect, it } from 'vitest';
import { calcDscr } from '../realEstateMetrics';

const UNJUDGED = { dscr: null, band: null };

describe('calcDscr — 測れない入力からは判定を作らない', () => {
  it('返済額が +Infinity なら判定なし (1e6 / Infinity = 0 を「返済余力なし」にしない)', () => {
    expect(calcDscr(1_000_000, Number.POSITIVE_INFINITY)).toEqual(UNJUDGED);
  });

  it('返済額が NaN・-Infinity・0・負でも判定なし', () => {
    for (const ads of [Number.NaN, Number.NEGATIVE_INFINITY, 0, -1]) {
      expect(calcDscr(1_000_000, ads), String(ads)).toEqual(UNJUDGED);
    }
  });

  it('NOI が NaN・±Infinity でも判定なし (NaN < しきい値 が偽で「安全」へ滑り落ちない)', () => {
    for (const noi of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(calcDscr(noi, 1_000_000), String(noi)).toEqual(UNJUDGED);
    }
  });

  it('対照: 両方が有限で返済額が正なら判定が出る (この検査は空虚ではない)', () => {
    // 既定のしきい値は 危険 < 1.0 ≦ 注意 < 1.2 ≦ 健全。
    expect(calcDscr(1_100_000, 1_000_000)).toEqual({ dscr: 1.1, band: 'caution' });
    expect(calcDscr(1_200_000, 1_000_000)).toEqual({ dscr: 1.2, band: 'healthy' });
  });
});
