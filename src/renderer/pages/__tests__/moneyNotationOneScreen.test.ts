/**
 * **1 つの画面が、金額を 2 通りに刷らない。** (2026-09-08 · パス 99)
 *
 * `BusinessPage.tsx` は 2026-09-08 まで**同じ画面で 2 つの書式**を使っていた ——
 * 横断 KPI の 5 タイルは `shared/formatters` の `jpy`、他の 11 か所は自前の
 * `Intl.NumberFormat`。実測で **3 つずれていた**:
 *
 * | 値 | `jpy` | `Intl` (`style: 'currency'`) |
 * | --- | --- | --- |
 * | 1,234,567 | `¥1,234,567` (**U+00A5**) | `￥1,234,567` (**U+FFE5**) |
 * | −1,234,567 | **`¥-1,234,567`** (符号が記号の後) | **`-￥1,234,567`** (符号が前) |
 * | 1,234.56 | `¥1,234.56` (小数を出す) | `￥1,235` (円単位に丸める) |
 *
 * 「月次 CF (不動産)」は赤字になりうる (パス 58 の逆レバレッジ分析はそこが主題) ので、
 * **同じ画面で負の額が 2 通りに刷られていた**。
 *
 * 直しは多数側 (11 対 5) に寄せた —— 見える変化がいちばん小さく、`-￥` は
 * 日本語の慣行に沿う (`¥-` は沿わない)。
 *
 * **この検査は「1 画面 1 流儀」だけを見る。** どの流儀が正しいかは決めない ——
 * リポジトリ全体では 4 つの綴りが在り (下の表)、そのうち 2 つは**相手に渡る
 * 書面**の書式なので、統一は記録済みの判断を跨ぐ。範囲は
 * `docs/REMAINING_WORK.md` のパス 99 の節に測って置いた。
 *
 * | 綴り | 出る所 | 1,234,567 が |
 * | --- | --- | --- |
 * | `Intl` `style:'currency'` | 画面 7 ファイル | `￥1,234,567` |
 * | `shared/formatters` `jpy` | 画面 7 ファイル | `¥1,234,567` |
 * | `managementReport` の私的 `yen` | **経営レポート** (役員会・銀行・税理士) | `¥1,234,567` |
 * | `bankFormat` の `formatAmount` + 「円」 | **金融機関提出書面** | `1,234,567円` |
 */
import { readOriginalDirEntries, readOriginalSource } from '../../../shared/__tests__/originalSource';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** 半角の円記号 (U+00A5) と全角の円記号 (U+FFE5)。 */
const YEN_HALF = '¥';
const YEN_FULL = '￥';

const PAGES_ROOT = path.resolve(__dirname, '..');

/**
 * 金額を刷る書式を、**呼び出しの字面**で数える。
 *
 * - `jpy(` → `shared/formatters` の `¥` 書式 (U+00A5・符号が後・小数を出す)
 * - `yen.format(` / `YEN_FMT.format(` → `Intl` の `￥` 書式 (U+FFE5・符号が前・丸める)
 *
 * **コメント行は数えない。** この本の冒頭の表は両方の綴りを説明として書いているので、
 * 数えると自分自身を欠陥として報告する (パス 98 で 1 度やった)。
 */
const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/;

function countStyles(text: string): { jpy: number; intl: number } {
  const lines = text.split('\n');
  let jpy = 0;
  let intl = 0;
  for (const line of lines) {
    if (COMMENT_LINE.test(line)) continue;
    jpy += (line.match(/\bjpy\(/g) ?? []).length;
    intl += (line.match(/\b(?:yen|YEN_FMT)\.format\(/g) ?? []).length;
  }
  return { jpy, intl };
}

describe('機構 — 2 つの書式は実際にずれている', () => {
  const jpy = (n: number): string => `${YEN_HALF}${n.toLocaleString('ja-JP')}`;
  const intl = new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  });

  it('★ 円記号が違う (U+00A5 と U+FFE5)', () => {
    expect(jpy(1_234_567).startsWith(YEN_HALF)).toBe(true);
    expect(intl.format(1_234_567).startsWith(YEN_FULL)).toBe(true);
    expect(YEN_HALF).not.toBe(YEN_FULL);
  });

  it('★ 負の額で符号の位置が違う —— 赤字の月に出る差', () => {
    expect(jpy(-1_234_567)).toBe(`${YEN_HALF}-1,234,567`);
    expect(intl.format(-1_234_567)).toBe(`-${YEN_FULL}1,234,567`);
  });

  it('★ 小数の扱いが違う (同じ額が 2 通りの桁で出る)', () => {
    expect(jpy(1234.56)).toBe(`${YEN_HALF}1,234.56`);
    expect(intl.format(1234.56)).toBe(`${YEN_FULL}1,235`);
  });
});

describe('BusinessPage — 金額の書式が 1 つ', () => {
  const file = path.join(PAGES_ROOT, 'BusinessPage.tsx');

  it('★ 走査が実物に当たっている (空振りしていない)', () => {
    // **不在を主張する前に、走査が金額の呼び出しを見つけていることを確かめる。**
    const { jpy, intl } = countStyles(readOriginalSource(file));
    expect(intl, 'この画面は金額を刷っているはず').toBeGreaterThan(5);
    // 直した後なので jpy 側は 0 —— ただし「0 だから通った」ではなく、
    // 上の行で intl 側が確かに数えられていることを確かめてから言う。
    expect(jpy).toBe(0);
  });

  it('★ 走査規則が両側の標本に当たる (どの入力でも通る形になっていない)', () => {
    // 規則そのものを標本に当てる。
    const sample = [
      '        <Stat label="a" value={jpy(x)} />',
      '        <div>{yen.format(y)}</div>',
      '  // jpy(z) と yen.format(z) の違いを説明する散文 (数えない)',
      '   * jpy(w)',
    ].join('\n');
    // **一時ファイルを置かない。** 綴りを数えるのは本文であって道ではないので、
    // 標本は文字列のまま当てる (`countStyles` は本文を受け取る)。
    expect(countStyles(sample)).toEqual({ jpy: 1, intl: 1 });
  });

  it('★ 半角の円記号を字面で持っていない (書式を戻したら鳴る)', () => {
    const src = readOriginalSource(file)
      .split('\n')
      .filter((l) => !COMMENT_LINE.test(l))
      .join('\n');
    expect(src.includes(YEN_HALF), 'コード側に U+00A5 の円記号が入っている').toBe(false);
    // 対照: 全角側は説明ではなく実物の書式から出るので、字面には無くてよい。
    // ここで「無いこと」だけを見ると空の検査になるので、**書式の本数**を上の
    // 検査で数えている。
  });
});

describe('画面ごとに書式が混ざっていない (全ページ走査)', () => {
  function pageFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readOriginalDirEntries(dir)) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__') walk(p);
          continue;
        }
        if (/\.tsx?$/.test(e.name)) out.push(p);
      }
    };
    walk(PAGES_ROOT);
    return out;
  }

  it('★ 1 つのファイルが 2 つの書式を同時に使っていない', () => {
    const mixed: string[] = [];
    let anyMoney = 0;
    for (const f of pageFiles()) {
      const { jpy, intl } = countStyles(readOriginalSource(f));
      if (jpy > 0 || intl > 0) anyMoney += 1;
      if (jpy > 0 && intl > 0) {
        mixed.push(`${path.relative(PAGES_ROOT, f)}  jpy=${jpy} intl=${intl}`);
      }
    }
    // **標本が空でないこと** —— 金額を刷るページが 0 件なら何も検査していない。
    expect(anyMoney, '金額を刷るページが 1 つも見つからない (走査が壊れている)').toBeGreaterThan(3);
    expect(
      mixed,
      '同じ画面が 2 つの金額書式を使っている。円記号・負の符号の位置・小数の扱いが' +
        'その画面の中でずれる:\n' + mixed.join('\n'),
    ).toEqual([]);
  });
});
