/**
 * **飾りを置いてよい位置 (`NUMBER_SHAPE`) を、読み直したモジュールに当てる。**
 *
 * この表はモジュール直下の定数なので、静的 import で読むテストからは
 * **変異体を殺せない** —— Stryker は「覆われている static 変異体」を実行するが、
 * モジュールは変異体が有効になる前に読み込まれてしまう (SESSION_HANDOFF の罠・
 * `stryker.config.json` の `_commentIgnoreStatic`)。実測 (2026-09-06) でも
 * `NUMBER_SHAPE` の変異体 9 件が生存していた。ここは毎テストで
 * `vi.resetModules()` + 動的 import して**表そのもの**を測る。
 *
 * 何を守っているかは `readNumeric.ts` の注記のとおり —— 飾り (通貨記号・単位・
 * 桁区切り) を落とす**位置**を見ないと、数字の間の飾りで桁がつながって
 * **別の数**になる (`100m2` → 1002)。下の表はその 1 文字ずつが効いていることを
 * 見るためにある。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Mod = typeof import('../readNumeric');

async function fresh(): Promise<Mod> {
  vi.resetModules();
  return import('../readNumeric');
}

beforeEach(() => {
  vi.resetModules();
});

/** 読める形 (飾りが正しい位置にある)。 */
const READS: [string, number][] = [
  ['42', 42],
  ['0', 0],
  ['3.5', 3.5],
  // 小数は 2 桁以上も読む (`\.\d+` の `+` が効いていること)
  ['3.25', 3.25],
  ['1,000.55', 1000.55],
  ['-8', -8],
  ['+5', 5],
  ['30,000', 30_000],
  ['12,000', 12_000],
  ['123,000', 123_000],
  // 3 桁組が 2 つ以上 (`(?:,\d{3})+` の `+` が効いていること)
  ['1,234,567', 1_234_567],
  ['¥1,200,000', 1_200_000],
  // 記号と単位の間に空白があってよい (`\s*` が 2 か所で効いていること)
  ['¥ 1,000 円', 1000],
  ['300 ㎡', 300],
  [' 42 ', 42],
  ['500円', 500],
  ['5%', 5],
  ['12日', 12],
  ['-¥500', -500],
  ['¥-500', -500],
  ['１２３４５', 12_345],
  ['１，０００', 1_000],
];

/** 読まない形。**なぜ読まないか**を第 2 欄に書く (どの門の話か)。 */
const REFUSES: [string, string][] = [
  ['1,23', '桁区切りの位置が違う (3 桁組でない)'],
  ['1,2345', '同上 (4 桁組)'],
  ['1234,567', '同上 (先頭が 4 桁)'],
  ['1,000,00', '同上 (末尾が 2 桁)'],
  [',000', '区切りで始まる'],
  ['1,', '区切りで終わる'],
  ['100m2', '単位が数字の間にある'],
  ['0.5m3', '同上 (小数が壊れる)'],
  ['2024年12月31日', '同上 (日付)'],
  ['30 000', '空白区切りは「2 つの数」と区別できない'],
  ['12%3', '記号が数字の間にある'],
  ['円-5', '単位が数字より先に来ている'],
  ['¥¥5', '通貨記号が 2 つ'],
  ['1e3', '指数'],
  ['0x10', '16 進'],
  ['abc', '数字でない'],
  ['5.', '小数点の後が無い'],
  ['.5', '整数部が無い'],
  ['', '空'],
  ['   ', '空白だけ'],
];

describe('NUMBER_SHAPE — 読み直した表に当てる', () => {
  it.each(READS)('★ 「%s」は %d と読む', async (raw, value) => {
    const m = await fresh();
    expect(m.readNumeric(raw)).toBe(value);
    // 読めた入力は「位置の話」ではない
    expect(m.hasInteriorNoise(raw)).toBe(false);
  });

  it.each(REFUSES)('★ 「%s」は読まない (%s)', async (raw) => {
    const m = await fresh();
    expect(m.readNumeric(raw)).toBeNull();
  });

  it('★ 桁があふれる入力は読まない (形は通るが有限でない)', async () => {
    const m = await fresh();
    expect(m.readNumeric('9'.repeat(309))).toBeNull();
    expect(m.readNumeric('1'.repeat(15))).toBe(111_111_111_111_111);
  });
});

describe('hasUnitWord / hasInteriorNoise の切り分け', () => {
  it('★ 単位語は「位置」ではない —— 飾りとして読めてしまう `5m` を含む', async () => {
    const m = await fresh();
    for (const raw of ['1万', '4200万', '1億', '3兆', '4千', '5k', '5 K', '5m', '5M', '7b']) {
      expect(m.hasUnitWord(raw), raw).toBe(true);
      // `5m` は飾り (m) を落とせば 5 と読めるが、**単位語の門が先に立つ**。
      // ここが崩れると「万・億」の文面と「位置」の文面が入れ替わる。
      expect(m.hasInteriorNoise(raw), raw).toBe(false);
    }
  });

  it('★ 数字の間に飾りがある入力は noise (符号付きも)', async () => {
    const m = await fresh();
    for (const raw of ['1,23', '100m2', '3年6月', '-1,2', '+1,2', ' 1,2 ']) {
      expect(m.hasInteriorNoise(raw), raw).toBe(true);
    }
  });

  it('★ 元から数値でない入力は noise ではない', async () => {
    const m = await fresh();
    for (const raw of ['abc', '未定', '1/2', '1_000', '1e3', '0x10', '-', '', '   ']) {
      expect(m.hasInteriorNoise(raw), raw).toBe(false);
    }
  });

  it('対照: 前後の空白は読み取りを妨げない (符号の前でも)', async () => {
    const m = await fresh();
    expect(m.readNumeric(' -5 ')).toBe(-5);
    expect(m.hasInteriorNoise(' -5 ')).toBe(false);
  });
});
