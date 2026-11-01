/**
 * **`isoDate` の 2 つの端を値で留める** (2026-09-30 · パス 502)。
 *
 * 全掃引 #179 の生存 3 件:
 *   - `isoMonthOf` の年の 0 埋め (`padStart(4, '0')`) —— 見本の年はどれも 4 桁だったので、
 *     埋め字を空にしても答えが変わらなかった。`parseIsoDate` は `\d{4}` を受けるので
 *     `0999` のような**先頭が 0 の年**は実在し、月キーが `999-12` になると並べ替え (綴りの
 *     大小) が壊れる。
 *   - `isoDaysBetween` の「日まで在る 2 つだけ」の見張り —— `YYYY-MM` だけの側・読めない側が
 *     単独で `null` を返すこと。両方が読めない標本しか無く、片側だけの形を誰も見ていなかった
 *     (`b` が読めないとき `b.day` を引くと投げる)。
 */
import { describe, expect, it } from 'vitest';
import { isoDaysBetween, isoMonthOf } from '../isoDate';

describe('isoMonthOf — 年は 4 桁に 0 で揃える', () => {
  it.each([
    ['0999-12-31', '0999-12'],
    ['0099-07-15', '0099-07'],
    ['0001-01', '0001-01'],
    ['2026-09-04', '2026-09'],
    ['2026-09', '2026-09'],
  ])('★ %s → %s', (input, month) => {
    expect(isoMonthOf(input)).toBe(month);
  });
});

describe('isoDaysBetween — 日まで読める 2 つだけを引く (片側でも読めなければ null)', () => {
  it.each([
    ['from が年月だけ', '2026-01', '2026-01-10'],
    ['to が年月だけ', '2026-01-10', '2026-01'],
    ['to が読めない (from は読める)', '2026-01-10', 'bad'],
    ['from が読めない (to は読める)', 'bad', '2026-01-10'],
    ['to が undefined (from は読める)', '2026-01-10', undefined],
    ['from が undefined (to は読める)', undefined, '2026-01-10'],
    ['from が暦に無い日', '2026-02-30', '2026-03-01'],
    ['to が暦に無い日', '2026-03-01', '2026-02-30'],
  ])('★ %s は null', (_label, from, to) => {
    expect(isoDaysBetween(from, to)).toBeNull();
  });

  it('対照: 日まで読める 2 つは日数差 (符号つき・同じ日は 0)', () => {
    expect(isoDaysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(isoDaysBetween('2026-01-31', '2026-01-01')).toBe(-30);
    expect(isoDaysBetween('2026-05-05', '2026-05-05')).toBe(0);
  });
});
