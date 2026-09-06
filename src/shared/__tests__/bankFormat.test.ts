/**
 * 金融機関等提出用の数値書式 — 決算書の読み方 (千円未満切捨て・△・和暦) を固定する。
 * 「四捨五入」は 0 から遠いほうへ (Math.round は負数で逆へ丸まる) — 対照を置く。
 */
import { describe, expect, it } from 'vitest';
import {
  AMOUNT_UNITS,
  BANK_FORMAT_DEFAULT,
  BLANK,
  ERA_LABEL,
  ERA_STYLES,
  NEGATIVE_LABEL,
  NEGATIVE_MARK,
  NEGATIVE_STYLES,
  ROUNDING_LABEL,
  ROUNDING_MODES,
  UNIT_DIVISOR,
  UNIT_LABEL,
  formatAmount,
  formatCount,
  formatDate,
  formatFiscalPeriod,
  formatPercent,
  formatPeriodRange,
  formatRatio,
  formatScaled,
  parseBankFormat,
  parseIsoDate,
  roundingCaption,
  scaleAmount,
  toWareki,
  unitCaption,
  type BankFormat,
} from '../bankFormat';

const D = BANK_FORMAT_DEFAULT;
const yen: BankFormat = { ...D, unit: 'yen' };
const million: BankFormat = { ...D, unit: 'million' };
const round: BankFormat = { ...D, rounding: 'round' };
const seireki: BankFormat = { ...D, era: 'seireki' };

describe('bankFormat — 既定と表', () => {
  it('既定は千円・切捨て・△・和暦', () => {
    expect(D).toEqual({ unit: 'thousand', negative: 'triangle', rounding: 'truncate', era: 'wareki' });
  });
  it('選択肢の表は選択肢の配列を全部覆う (足したのに表示名が無い、を止める)', () => {
    for (const u of AMOUNT_UNITS) {
      expect(UNIT_LABEL[u]).toBeTruthy();
      expect(UNIT_DIVISOR[u]).toBeGreaterThan(0);
    }
    for (const n of NEGATIVE_STYLES) {
      expect(NEGATIVE_MARK[n]).toBeTruthy();
      expect(NEGATIVE_LABEL[n]).toContain(NEGATIVE_MARK[n]);
    }
    for (const r of ROUNDING_MODES) expect(ROUNDING_LABEL[r]).toBeTruthy();
    for (const e of ERA_STYLES) expect(ERA_LABEL[e]).toBeTruthy();
    expect(UNIT_DIVISOR).toEqual({ yen: 1, thousand: 1000, million: 1_000_000 });
    expect(NEGATIVE_MARK).toEqual({ triangle: '△', solid: '▲', minus: '-' });
  });
  it('表頭と注記の文言', () => {
    expect(unitCaption(D)).toBe('（単位：千円）');
    expect(unitCaption(yen)).toBe('（単位：円）');
    expect(unitCaption(million)).toBe('（単位：百万円）');
    expect(roundingCaption(D)).toBe('千円未満切捨て');
    expect(roundingCaption(round)).toBe('千円未満四捨五入');
    expect(roundingCaption(yen)).toBe('円未満切捨て');
  });
});

describe('formatAmount — 金額', () => {
  it('千円単位・3 桁区切り・切捨て', () => {
    expect(formatAmount(1_234_567, D)).toBe('1,234');
    expect(formatAmount(1_234_999, D)).toBe('1,234');
    expect(formatAmount(999, D)).toBe('0');
    expect(formatAmount(0, D)).toBe('0');
  });
  it('負数は △ (既定)・▲・- を選べる。切捨ては 0 に向かう', () => {
    expect(formatAmount(-1_234_567, D)).toBe('△1,234');
    expect(formatAmount(-1_234_567, { ...D, negative: 'solid' })).toBe('▲1,234');
    expect(formatAmount(-1_234_567, { ...D, negative: 'minus' })).toBe('-1,234');
  });
  it('単位未満の負数は「0」— 「-0」も「△0」も出さない (Intl は -0 を「-0」と出す)', () => {
    expect(formatAmount(-400, D)).toBe('0');
    expect(formatAmount(-400, round)).toBe('0');
    expect(Object.is(scaleAmount(-400, D), 0)).toBe(true);
    expect(Object.is(scaleAmount(-400, round), 0)).toBe(true);
  });
  it('四捨五入は 0 から遠いほうへ (負数の 500 は 1 上がる — Math.round だと下がる)', () => {
    expect(formatAmount(1_234_500, round)).toBe('1,235');
    expect(formatAmount(1_234_499, round)).toBe('1,234');
    expect(formatAmount(-1_234_500, round)).toBe('△1,235');
    expect(formatAmount(999, round)).toBe('1');
    expect(Math.round(-1234.5)).toBe(-1234); // 対照: 素の Math.round は逆へ丸まる
  });
  it('円・百万円', () => {
    expect(formatAmount(1_234_567, yen)).toBe('1,234,567');
    expect(formatAmount(-1_234_567, yen)).toBe('△1,234,567');
    expect(formatAmount(123_456_789, million)).toBe('123');
    expect(formatAmount(123_456_789, { ...million, rounding: 'round' })).toBe('123');
    expect(formatAmount(123_500_000, { ...million, rounding: 'round' })).toBe('124');
  });
  it('無い値・非数・∞ は「―」(0 と区別する)', () => {
    expect(formatAmount(null, D)).toBe(BLANK);
    expect(formatAmount(undefined, D)).toBe(BLANK);
    expect(formatAmount(Number.NaN, D)).toBe(BLANK);
    expect(formatAmount(Number.POSITIVE_INFINITY, D)).toBe(BLANK);
    expect(formatAmount(Number.NEGATIVE_INFINITY, D)).toBe(BLANK);
    expect(BLANK).toBe('―');
  });
  it('大きな額も区切る', () => {
    expect(formatAmount(98_765_432_100, D)).toBe('98,765,432');
  });
});

describe('formatPercent / formatRatio / formatCount', () => {
  it('比率は小数第 1 位・四捨五入・% 付き。2 進の誤差で 12.35 が 12.3 に落ちない', () => {
    expect(formatPercent(12.345, D)).toBe('12.3%');
    expect(formatPercent(12.35, D)).toBe('12.4%');
    expect(formatPercent(0.05, D)).toBe('0.1%');
    expect(formatPercent(100, D)).toBe('100.0%');
    expect(formatPercent(12.345, D, 0)).toBe('12%');
    expect(formatPercent(12.345, D, 2)).toBe('12.35%');
  });
  it('負の比率は △、-0.04 は「0.0%」', () => {
    expect(formatPercent(-12.34, D)).toBe('△12.3%');
    expect(formatPercent(-12.34, { ...D, negative: 'minus' })).toBe('-12.3%');
    expect(formatPercent(-0.04, D)).toBe('0.0%');
    expect(formatPercent(null, D)).toBe(BLANK);
    expect(formatPercent(Number.NaN, D)).toBe(BLANK);
  });
  it('倍率・日数などは単位語つき', () => {
    expect(formatRatio(1.234, D, '倍', 2)).toBe('1.23倍');
    expect(formatRatio(1.235, D, '倍', 2)).toBe('1.24倍');
    expect(formatRatio(45.25, D, '日')).toBe('45.3日');
    expect(formatRatio(-1.2, D, '倍', 2)).toBe('△1.20倍');
    expect(formatRatio(null, D, '倍')).toBe(BLANK);
    expect(formatRatio(Number.POSITIVE_INFINITY, D, '倍')).toBe(BLANK);
  });
  it('件数・人数は 1 の位まで (表示単位の影響を受けない)、端数処理は書式に従う、単位語つき', () => {
    expect(formatCount(1234.6, D, '名')).toBe('1,234名');
    expect(formatCount(1234.6, round, '名')).toBe('1,235名');
    expect(formatCount(1234.6, million, '名')).toBe('1,234名');
    expect(formatCount(0, D, '件')).toBe('0件');
    expect(formatCount(7, D)).toBe('7');
    expect(formatCount(-3, D, '件')).toBe('△3件');
    expect(formatCount(null, D, '件')).toBe(BLANK);
    expect(formatCount(Number.NaN, D, '件')).toBe(BLANK);
  });
  it('倍率の 0 と −0.04 は「0.0」(△ を付けない)', () => {
    expect(formatRatio(0, D, '日')).toBe('0.0日');
    expect(formatRatio(-0.04, D, '日')).toBe('0.0日');
    expect(formatRatio(0.05, D, '日')).toBe('0.1日');
  });
});

describe('和暦', () => {
  it('元号の境目', () => {
    expect(toWareki(2019, 5, 1)).toEqual({ era: '令和', year: 1 });
    expect(toWareki(2019, 4, 30)).toEqual({ era: '平成', year: 31 });
    expect(toWareki(1989, 1, 8)).toEqual({ era: '平成', year: 1 });
    expect(toWareki(1989, 1, 7)).toEqual({ era: '昭和', year: 64 });
    expect(toWareki(1926, 12, 25)).toEqual({ era: '昭和', year: 1 });
    expect(toWareki(1926, 12, 24)).toBeNull();
    expect(toWareki(2026, 9, 4)).toEqual({ era: '令和', year: 8 });
  });
  it('年月日の表記 (元年は「元」)', () => {
    expect(formatDate('2026-09-04', D)).toBe('令和8年9月4日');
    expect(formatDate('2026-09-04', seireki)).toBe('2026年9月4日');
    expect(formatDate('2019-05-01', D)).toBe('令和元年5月1日');
    expect(formatDate('2019-05', D)).toBe('令和元年5月');
    expect(formatDate('2019-04', D)).toBe('平成31年4月');
    expect(formatDate('2026-03', seireki)).toBe('2026年3月');
  });
  it('昭和より前は西暦へ倒す。読めない日付は「―」', () => {
    expect(formatDate('1900-01-01', D)).toBe('1900年1月1日');
    expect(formatDate('2026-02-30', D)).toBe(BLANK);
    expect(formatDate('2026-13', D)).toBe(BLANK);
    expect(formatDate('2026-00-10', D)).toBe(BLANK);
    expect(formatDate('2026-04-00', D)).toBe(BLANK);
    expect(formatDate('abc', D)).toBe(BLANK);
    expect(formatDate('', D)).toBe(BLANK);
    expect(formatDate(null, D)).toBe(BLANK);
    expect(formatDate(undefined, D)).toBe(BLANK);
    expect(formatDate('2026-9-4', D)).toBe(BLANK);
    expect(formatDate('x2026-09-04', D)).toBe(BLANK);
    expect(formatDate('2026-09-04x', D)).toBe(BLANK);
    expect(formatDate('2026-09-041', D)).toBe(BLANK);
    expect(formatDate('2026-00', D)).toBe(BLANK);
    expect(formatDate('2026-01-32', D)).toBe(BLANK);
  });
  it('12 月と月末は読める (境目)', () => {
    expect(formatDate('2026-12-31', D)).toBe('令和8年12月31日');
    expect(formatDate('2026-12', D)).toBe('令和8年12月');
    expect(formatDate('2026-01-01', seireki)).toBe('2026年1月1日');
    expect(formatDate('2024-02-29', seireki)).toBe('2024年2月29日');
  });
  it('parseIsoDate', () => {
    expect(parseIsoDate('2026-09-04')).toEqual({ year: 2026, month: 9, day: 4 });
    expect(parseIsoDate('2026-09')).toEqual({ year: 2026, month: 9, day: null });
    expect(parseIsoDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseIsoDate('2026-02-29')).toBeNull();
    expect(parseIsoDate('2026-04-31')).toBeNull();
    expect(parseIsoDate('2026-04-00')).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
    expect(parseIsoDate(undefined)).toBeNull();
  });
  it('決算期と対象期間', () => {
    expect(formatFiscalPeriod('2026-03', D)).toBe('令和8年3月期');
    expect(formatFiscalPeriod('2026-03', seireki)).toBe('2026年3月期');
    expect(formatFiscalPeriod('', D)).toBe(BLANK);
    expect(formatFiscalPeriod(null, D)).toBe(BLANK);
    expect(formatPeriodRange('2026-01', '2026-09', D)).toBe('令和8年1月〜令和8年9月');
    expect(formatPeriodRange('2025-10', '2026-09', seireki)).toBe('2025年10月〜2026年9月');
    expect(formatPeriodRange('2026-09', '2026-09', D)).toBe('令和8年9月');
    expect(formatPeriodRange(null, '2026-09', D)).toBe(BLANK);
    expect(formatPeriodRange('2026-01', 'x', D)).toBe(BLANK);
  });
});

describe('parseBankFormat — 保存した書式を読む', () => {
  it('正しい値はそのまま', () => {
    expect(parseBankFormat({ unit: 'yen', negative: 'minus', rounding: 'round', era: 'seireki' })).toEqual({
      unit: 'yen', negative: 'minus', rounding: 'round', era: 'seireki',
    });
    expect(parseBankFormat({ unit: 'million', negative: 'solid', rounding: 'truncate', era: 'wareki' })).toEqual({
      unit: 'million', negative: 'solid', rounding: 'truncate', era: 'wareki',
    });
  });
  it('知らない値・欠け・壊れた入力は項目ごとに既定へ', () => {
    expect(parseBankFormat({})).toEqual(D);
    expect(parseBankFormat(null)).toEqual(D);
    expect(parseBankFormat('yen')).toEqual(D);
    expect(parseBankFormat({ unit: 'dollar', negative: 1, rounding: null, era: ['seireki'] })).toEqual(D);
    expect(parseBankFormat({ unit: 'yen', era: 'nope' })).toEqual({ ...D, unit: 'yen' });
  });
});

/**
 * `formatScaled` —— **表示単位の整数**をそのまま書式化する。
 *
 * 円から行ごとに丸めると、書面の中で「純資産 = 総資産 − 負債合計」が
 * 印刷した数字では成り立たない (実測 2026-09-06: 40 通りのうち 21 通り)。
 * 丸めた後の値で計算した結果を書くための口で、`formatAmount` は
 * 「円を丸めてから」これを呼ぶ (書式は 1 か所)。
 */
describe('formatScaled — 表示単位の整数を書式化する', () => {
  const f = BANK_FORMAT_DEFAULT;

  it('★ 単位変換をしない (6,001 は 6,001 千円として出る)', () => {
    expect(formatScaled(6001, f)).toBe('6,001');
    // 同じ数を円として渡すと 6 千円に潰れる = 単位変換の有無が観測できる
    expect(formatAmount(6001, f)).toBe('6');
  });

  it('★ 3 桁区切りと負数の記号は formatAmount と同じ', () => {
    expect(formatScaled(1_234_567, f)).toBe('1,234,567');
    expect(formatScaled(-6001, f)).toBe('△6,001');
    expect(formatScaled(-6001, { ...f, negative: 'solid' })).toBe('▲6,001');
    expect(formatScaled(-6001, { ...f, negative: 'minus' })).toBe('-6,001');
  });

  it('★ 0 と -0 はどちらも「0」(Intl の「-0」を出さない)', () => {
    expect(formatScaled(0, f)).toBe('0');
    expect(formatScaled(-0, f)).toBe('0');
  });

  it('★ null / undefined / NaN / ±∞ は「―」', () => {
    expect(formatScaled(null, f)).toBe(BLANK);
    expect(formatScaled(undefined, f)).toBe(BLANK);
    expect(formatScaled(Number.NaN, f)).toBe(BLANK);
    expect(formatScaled(Number.POSITIVE_INFINITY, f)).toBe(BLANK);
    expect(formatScaled(Number.NEGATIVE_INFINITY, f)).toBe(BLANK);
  });

  it('対照: 端数を持つ値はそのまま書く (ここでは丸めない — 丸めるのは scaleAmount)', () => {
    // 呼び出し側が丸めた整数を渡す約束。小数が来たら Intl の既定 (整数へ丸め) に従う。
    expect(formatScaled(6000.4, f)).toBe('6,000');
  });

  it('対照: formatAmount は「円 → 丸め → formatScaled」で通っている', () => {
    for (const yen of [0, 1, 999, 1000, 1_499_999, -1_499_999, 12_345_678]) {
      expect(formatAmount(yen, f), String(yen)).toBe(formatScaled(scaleAmount(yen, f), f));
    }
  });
});
