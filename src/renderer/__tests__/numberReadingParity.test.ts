/**
 * **同じ文字列は、どこで読んでも同じ数** —— 読み取りが 1 つであることの検査。
 *
 * 画面の入力欄 (`inputGuards.readNumber`) と、共有の入力検査
 * (`hydroponicCrops.parseCropNumber` —— 養液 EC / pH / 株数 / 収穫重量) は
 * 2026-09-06 まで**別のパーサ**だった。食い違いは実測で:
 *
 * ```
 *   '1,2'   画面: 読まない (区切りの位置が違う)   品目: 12
 *   '2,4'   画面: 読まない                        品目: 24  (整数欄で 2.4 の指摘が出ない)
 *   '0x10'  画面: 読まない                        品目: 16
 *   '1e3'   画面: 読まない                        品目: 1000
 *   '5日'   画面: 5                               品目: NaN
 * ```
 *
 * 今はどちらも `shared/readNumeric.ts` を通る。**この検査は、また 2 本目の
 * パーサが生えたときに鳴る**ためにある (片方だけ直した / 片方だけ緩めた)。
 */
import { describe, expect, it } from 'vitest';
import { readNumber } from '../data/inputGuards';
import { parseCropNumber } from '../../shared/hydroponicCrops';
import { parseBusinessUnit } from '../data/businessUnits';
import { parsePropertyEntry } from '../data/investments';

/** 読み取りが割れやすい形をひととおり。 */
const CORPUS: readonly string[] = [
  // 素の数
  '0', '12', '3.5', '-8', '+5', '1200000', '5.0',
  // 飾りが正しい位置にある
  '30,000', '1,000.5', '¥1,200,000', '500円', '5%', '300 ㎡', ' 42 ', '12日', '3人',
  '１２３４５', '１，０００', '３．５',
  // 飾りが数字の間にある (2026-09-06 まで別の数として読めていた)
  '1,2', '2,4', '1,5', '1,23', '12,3456', '1,000,00', '100m2', '0.5m3', '3年6月',
  '2024年12月31日', '30 000', '1 2 3', '12%3', '¥1,2',
  // 数値に見えて数値でない
  '', '   ', 'abc', '未定', '1e3', '0x10', 'Infinity', 'NaN', '1..2', '++5', '-', '1/2', '1_000',
  // 単位語 (解釈しない)
  '1万', '4200万', '1億', '3千', '5k', '5M',
  // 桁があふれる
  '9'.repeat(309),
];

describe('数字の読み取りは 1 つ (画面 ↔ 品目の入力検査)', () => {
  it.each(CORPUS)('★ 「%s」の読みが一致する', (raw) => {
    const screen = readNumber(raw);
    const crop = parseCropNumber(raw);
    if (screen === null) {
      // 品目側は「読めない」を NaN で表す (0 に倒さない契約)。
      expect(Number.isNaN(crop), `crop=${crop}`).toBe(true);
    } else {
      expect(crop).toBe(screen);
    }
  });

  it('対照: 台帳の中に「読める形」と「読めない形」が両方入っている', () => {
    // どちらかに寄っていると、上の it.each は片側しか見ていない。
    const readable = CORPUS.filter((r) => readNumber(r) !== null);
    const refused = CORPUS.filter((r) => readNumber(r) === null);
    expect(readable.length).toBeGreaterThanOrEqual(15);
    expect(refused.length).toBeGreaterThanOrEqual(20);
  });

  it('対照: 0 に倒していない (読めない入力は NaN のまま品目検査へ渡る)', () => {
    // ここが 0 になると EC 0 / pH 0 が「入力した値」として通る。
    expect(Number.isNaN(parseCropNumber('abc'))).toBe(true);
    expect(Number.isNaN(parseCropNumber(''))).toBe(true);
    expect(parseCropNumber('0')).toBe(0);
  });
});

/**
 * **入力欄の文字列を数にする口の台帳。**
 *
 * 画面の番人 (`guardNumber`) が ⛔ を出しても、保存する側が別の読み方を
 * していれば**別の数が保存される** —— 2026-09-06 まで実際にそうだった
 * (`investments.toAmount` は `1,5` を 15 として保存し、全角は逆に断っていた)。
 *
 * ここでは「非負・範囲内の文字列」に限って、**読める / 読めないが番人と
 * 一致する**ことを口ごとに見る。範囲や符号の断り方は口ごとに違ってよい
 * (家賃は 0 を許し、事業の金額は上限を持つ) が、**読めるかどうかは 1 つ**。
 */
const ENTRANCES: [string, (raw: string) => number | null][] = [
  [
    '事業の金額 (businessUnits)',
    (raw) => {
      const r = parseBusinessUnit({ name: 'x', revenue: raw });
      return r.ok ? (r.entry.revenue ?? null) : null;
    },
  ],
  [
    '物件の家賃 (investments)',
    (raw) => {
      try {
        return parsePropertyEntry({ name: 'x', type: '一棟', monthlyRent: raw, purchasePrice: '1000' })
          .monthlyRent;
      } catch {
        return null;
      }
    },
  ],
  ['品目の数値 (hydroponicCrops)', (raw) => (Number.isNaN(parseCropNumber(raw)) ? null : parseCropNumber(raw))],
];

/** 非負・範囲内に収まる標本だけ (符号と上限の断り方は口ごとに違ってよい)。 */
const SAFE: readonly string[] = [
  '0', '12', '3.5', '1,200', '1,200.5', '300', '１２３', '５００', ' 42 ', '12日',
  '1,2', '1,23', '12,3456', '100m2', '0.5m3', '30 000', '1 2', '12%3', 'abc', '1e3', '0x10', '1万',
];

describe.each(ENTRANCES)('%s — 読めるかどうかは番人と一致する', (_label, read) => {
  it.each(SAFE)('★ 「%s」', (raw) => {
    const expected = readNumber(raw);
    if (expected === null) {
      expect(read(raw), '番人は読めないと言っているのに、保存側は読んでいる').toBeNull();
    } else {
      expect(read(raw)).toBe(expected);
    }
  });
});

describe('台帳の対照', () => {
  it('標本に「読める形」と「読めない形」が両方入っている', () => {
    expect(SAFE.filter((r) => readNumber(r) !== null).length).toBeGreaterThanOrEqual(8);
    expect(SAFE.filter((r) => readNumber(r) === null).length).toBeGreaterThanOrEqual(10);
  });
});
