import { describe, expect, it } from 'vitest';
import {
  accruedSoFar,
  clampRemaining,
  clampYearRatio,
  annualizedPace,
  formatElapsed,
  perSecond,
  remainingDays,
  remainingInYearMs,
  yearProgress,
} from '../realtimeProjection';

/*
 * **「毎秒動く」と言うなら、動くことを測る。**
 *
 * 秒単位の更新を素朴に作ると、同じ計算を 1 秒ごとに回して同じ数字を
 * 描き直すだけになる —— 画面は動いている風に見えて、値は 1 つも
 * 変わっていない。ここで留めるのは「時刻が 1 秒進んだら値も進むこと」
 * そのものである。
 */

/** ローカル時刻で組む (実装がローカルの元日を基準にするため)。 */
const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s);

describe('yearProgress', () => {
  it('元日 0 時ちょうどは 0', () => {
    expect(yearProgress(at(2026, 1, 1))).toBe(0);
  });

  it('★ 1 秒進めば必ず増える (これが「毎秒動く」の中身)', () => {
    const a = yearProgress(at(2026, 6, 15, 12, 0, 0));
    const b = yearProgress(at(2026, 6, 15, 12, 0, 1));
    expect(b).toBeGreaterThan(a);
  });

  it('うるう年は 1 年の長さが違う (2024 は 366 日)', () => {
    // 3/1 0:00 時点の経過割合。うるう年のほうが分母が大きく、
    // かつ 2 月が 1 日長いので分子も大きい。同じ値にはならない。
    const leap = yearProgress(at(2024, 3, 1));
    const common = yearProgress(at(2026, 3, 1));
    expect(leap).not.toBe(common);
    expect(Math.abs(leap - common)).toBeLessThan(0.01); // でも近い
  });

  it('大晦日の直前でも 1 を超えない', () => {
    expect(yearProgress(at(2026, 12, 31, 23, 59, 59))).toBeLessThanOrEqual(1);
    expect(yearProgress(at(2026, 12, 31, 23, 59, 59))).toBeGreaterThan(0.999);
  });

  it('渡した Date の「その年」の中で測る (翌年の日付なら翌年の割合)', () => {
    // getFullYear() を基準にするので、Date 経由では溢れが作れない。
    // だから留める側は下の clampYearRatio で直に測る。
    expect(yearProgress(at(2027, 6, 1))).toBeGreaterThan(0.4);
    expect(yearProgress(at(2027, 6, 1))).toBeLessThan(0.5);
  });
});

/*
 * **留める側を直に測る。** `yearProgress` 経由では `Date` の年が必ず一致
 * するので溢れが作れず、この枝はどのテストからも到達しない。到達しない
 * 守りは消しても誰も気付かないので、入口を分けて標本を当てる。
 *
 * 溢れは現実に起きる —— 年の長さは UTC で、経過はローカルの元日から
 * 計っているので、**秋に時計が 1 時間戻る地域**では年末の経過が年の長さを
 * 上回る。
 */
describe('clampYearRatio (溢れと不足を留める)', () => {
  const YEAR = 365 * 86_400_000;
  it.each([
    ['ちょうど半分', YEAR / 2, YEAR, 0.5],
    ['0 は 0', 0, YEAR, 0],
    ['ちょうど 1', YEAR, YEAR, 1],
    ['★ 1 時間ぶん溢れても 1 (時計が戻る地域の年末)', YEAR + 3_600_000, YEAR, 1],
    ['★ 負の経過は 0 (時計が進む地域の元日)', -3_600_000, YEAR, 0],
    ['年の長さが 0 なら 0 (0 除算を Infinity にしない)', 100, 0, 0],
    ['年の長さが負なら 0', 100, -1, 0],
    ['NaN は 0', Number.NaN, YEAR, 0],
    ['Infinity は 0', Number.POSITIVE_INFINITY, YEAR, 0],
  ])('%s', (_label, elapsed, span, expected) => {
    expect(clampYearRatio(elapsed, span)).toBe(expected);
  });
});

describe('clampRemaining (残りが負にならない)', () => {
  it.each([
    ['ふつうの残り', 1000, 400, 600],
    ['ちょうど 0', 1000, 1000, 0],
    ['★ 超過しても 0 (時計が戻る地域の年末)', 1000, 1400, 0],
    ['NaN は 0', Number.NaN, 400, 0],
  ])('%s', (_label, span, elapsed, expected) => {
    expect(clampRemaining(span, elapsed)).toBe(expected);
  });
});

describe('accruedSoFar', () => {
  it('元日は 0、年末は年額に限りなく近い', () => {
    expect(accruedSoFar(1_200_000, at(2026, 1, 1))).toBe(0);
    expect(accruedSoFar(1_200_000, at(2026, 12, 31, 23, 59, 59))).toBeGreaterThan(1_199_000);
  });

  it('★ 1 秒進めば増える', () => {
    const a = accruedSoFar(31_536_000, at(2026, 7, 1, 0, 0, 0));
    const b = accruedSoFar(31_536_000, at(2026, 7, 1, 0, 0, 1));
    expect(b).toBeGreaterThan(a);
  });

  it('年額が数でなければ 0 (NaN を画面へ流さない)', () => {
    expect(accruedSoFar(Number.NaN, at(2026, 7, 1))).toBe(0);
    expect(accruedSoFar(Number.POSITIVE_INFINITY, at(2026, 7, 1))).toBe(0);
  });

  it('年額を超えない', () => {
    expect(accruedSoFar(1000, at(2026, 12, 31, 23, 59, 59))).toBeLessThanOrEqual(1000);
  });
});

describe('perSecond', () => {
  it('平年は 1 年 = 31,536,000 秒', () => {
    expect(perSecond(31_536_000, at(2026, 5, 1))).toBeCloseTo(1, 6);
  });

  it('うるう年は 1 日ぶん薄まる', () => {
    expect(perSecond(31_536_000, at(2024, 5, 1))).toBeLessThan(1);
  });

  it('数でなければ 0', () => {
    expect(perSecond(Number.NaN, at(2026, 5, 1))).toBe(0);
  });
});

describe('annualizedPace', () => {
  it('半分過ぎて 500 なら年換算は約 1000', () => {
    const p = annualizedPace(500, at(2026, 7, 2, 12));
    expect(p).not.toBeNull();
    expect(p as number).toBeGreaterThan(950);
    expect(p as number).toBeLessThan(1050);
  });

  it('★ 経過が小さすぎるうちは出さない (0 除算で Infinity を流さない)', () => {
    expect(annualizedPace(500, at(2026, 1, 1, 0, 0, 30))).toBeNull();
    expect(annualizedPace(500, at(2026, 1, 1))).toBeNull();
  });

  it('下限は呼び出し側が決められる', () => {
    // 1/2 の時点で経過は約 0.0027。既定 (0.01) では出ないが、下限を下げれば出る。
    expect(annualizedPace(500, at(2026, 1, 2))).toBeNull();
    expect(annualizedPace(500, at(2026, 1, 2), 0.001)).not.toBeNull();
  });

  it('実績が数でなければ null', () => {
    expect(annualizedPace(Number.NaN, at(2026, 7, 1))).toBeNull();
  });
});

describe('remainingInYearMs / remainingDays', () => {
  it('元日は 1 年ぶん、年末はごくわずか', () => {
    expect(remainingInYearMs(at(2026, 1, 1))).toBe(365 * 86_400_000);
    expect(remainingInYearMs(at(2026, 12, 31, 23, 59, 59))).toBeLessThan(2000);
  });

  it('うるう年は 366 日', () => {
    expect(remainingInYearMs(at(2024, 1, 1))).toBe(366 * 86_400_000);
  });

  it('翌年の日付なら、その年の残りを返す (Date 経由では負にならない)', () => {
    expect(remainingInYearMs(at(2027, 6, 1))).toBeGreaterThan(0);
    expect(remainingDays(at(2027, 6, 1))).toBeGreaterThan(200);
  });

  it('★ 1 秒進めば減る', () => {
    const a = remainingInYearMs(at(2026, 6, 1, 0, 0, 0));
    const b = remainingInYearMs(at(2026, 6, 1, 0, 0, 1));
    expect(b).toBeLessThan(a);
  });
});

describe('formatElapsed', () => {
  it.each([
    [0, '0:00:00'],
    [1000, '0:00:01'],
    [61_000, '0:01:01'],
    [3_600_000, '1:00:00'],
    [45_296_000, '12:34:56'],
    [360_000_000, '100:00:00'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatElapsed(ms)).toBe(expected);
  });

  it('負の値は 0 に丸める', () => {
    expect(formatElapsed(-5000)).toBe('0:00:00');
  });

  it('★ 秒の桁は 2 桁で詰める (1 桁だと幅が跳ねて読めない)', () => {
    expect(formatElapsed(9000)).toBe('0:00:09');
    expect(formatElapsed(540_000)).toBe('0:09:00');
  });
});
