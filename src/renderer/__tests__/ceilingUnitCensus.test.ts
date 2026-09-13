/**
 * **`MAX_*_CHARS` は「字」である。数える所・切る所を母集団から総当たりする。**
 * (2026-09-13 · パス 195)
 *
 * ## 何を留めているか
 *
 * 定数の名前が `_CHARS` なら単位は**文字**であり、画面もそう刷る (「2000 字まで」)。
 * ところが 2026-09-13 まで、その天井に突き合わせる側・切る側はすべて
 * `String.length` (UTF-16 コード単位) だった。**名前と実装の単位が違っていた。**
 *
 * 実測した害 (`'a' + '😀'.repeat(1000)` = 2001 コード単位 / 1001 文字・天井 2000):
 *
 * - 断りが「1 字超えていた」と言う —— 実際は **999 字下回っている**
 * - 画面の clamp `raw.slice(0, 2000)` がサロゲート対を割り、**孤立サロゲート**が
 *   入力欄と payload に残る (UTF-8 を往復すると `�` に化ける)
 * - main の検証 `note.length > 2000` は 2000 なので**通す** —— 壊れた文字列が保存側へ
 *
 * 実測 47 件 / 20 ファイルが `length` か `slice` で `_CHARS` を扱っていた。
 * 直した後は **0 件**。
 *
 * ## なぜ台帳ではなく走査か
 *
 * 母集団は「`MAX_*_CHARS` を使う所」で、**新しい欄が増えるたびに増える**。
 * 手で並べると足した人が気付かない (パス 107 で母集団を手書きして 3 画面落とした形)。
 * 名前の規則から導けるので、走査で総当たりする。
 *
 * ## 例外の扱い
 *
 * **例外は無い。** `_CHARS` と名乗る定数はすべて人が読み書きする文字列に掛かり、
 * どれも文字で数えるのが正しい (バイト数や符号単位が要る天井は `_BYTES` /
 * `_ITEMS` など別の名前を持つ)。例外が要る日が来たら、この走査が落ちるので
 * **理由つきで台帳を作ることになる** —— 黙って混ざる道は無い。
 *
 * ## この走査が見えない所 (対照で実測した死角)
 *
 * **名前で拾う走査は、名前が消えた所を拾えない。** 定数を引数や台帳の欄に
 * 渡し替えた 2 か所は、この走査の外に在る:
 *
 * | 場所 | なぜ見えないか | 代わりに留めている物 |
 * | --- | --- | --- |
 * | `shared/writeFieldLimits.ts` の `checkWriteField` | 天井が `rule.max` (台帳の欄) | `writeFieldLimits.test.ts` の絵文字の境界 (★) |
 * | `components/serviceActionUtils.ts` の `sanitizeNote` | 天井が `maxLen` (引数) | `serviceActionUtils.test.ts` の絵文字の境界 (★) |
 *
 * どちらも**対照を回して実測した** —— `countChars` / `clampToCeiling` を
 * `length` / `slice` に戻しても、この走査は 0 件のまま緑だった。
 * `.length > max` のような形まで拾うと、文字列でない物の件数比較を大量に
 * 誤検知するので、走査は名前で拾うままにし、**2 か所は振る舞いで留めた**
 * (書き方に依らないので、どう書き換えても鳴る)。
 * **走査の死角は、書いておかないと次の人には見えない。**
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';

const SRC = path.resolve(__dirname, '../..');

/** 走査対象 (test は除く —— 検査の中の標本は意図して壊した文字列を持つ)。 */
function sourceFiles(dir: string, out: string[] = []): string[] {
  // 一覧も原文から取る (sandbox の中でも同じ木を歩く)。
  for (const e of readOriginalDirEntries(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__') sourceFiles(p, out);
      continue;
    }
    if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** コメントを空白に潰す (行番号は保つ)。 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');
}

/** 単位を取り違えている形。 */
const WRONG: readonly (readonly [RegExp, string])[] = [
  [/\.length\s*(?:>=|<=|>|<|===|!==)\s*(MAX_[A-Z0-9_]*_CHARS)/, 'length で _CHARS と突き合わせている'],
  [/(MAX_[A-Z0-9_]*_CHARS)\s*(?:>=|<=|>|<|===|!==)\s*[A-Za-z0-9_.$[\]']*\.length/, '_CHARS と length を突き合わせている'],
  [/\.(?:slice|substring|substr)\s*\(\s*0\s*,\s*(MAX_[A-Z0-9_]*_CHARS)/, 'コード単位で _CHARS まで切っている'],
];

/** 正しい形 (走査が死んでいないことの床に使う)。 */
const RIGHT = /\b(?:countChars|clampToCeiling|charsOverCeiling)\s*\(/;

interface Hit {
  readonly where: string;
  readonly why: string;
  readonly line: string;
}

function scan(): { wrong: Hit[]; right: number; filesWithChars: number } {
  const wrong: Hit[] = [];
  let right = 0;
  let filesWithChars = 0;
  for (const f of sourceFiles(SRC)) {
    // **原文を読む** —— `mutate` 台帳のファイルは変異検査の sandbox で書き換わるので、
    // 生の `readFileSync` だと走査が 0 件になり空の検査になる (`originalSource.ts`)。
    const src = stripComments(readOriginalSource(f));
    if (/MAX_[A-Z0-9_]*_CHARS/.test(src)) filesWithChars++;
    src.split('\n').forEach((line, i) => {
      for (const [re, why] of WRONG) {
        if (re.test(line)) {
          wrong.push({ where: `${path.relative(SRC, f)}:${i + 1}`, why, line: line.trim() });
        }
      }
      if (RIGHT.test(line)) right++;
    });
  }
  return { wrong, right, filesWithChars };
}

describe('天井の単位 — `MAX_*_CHARS` は文字で数え、文字で切る', () => {
  const { wrong, right, filesWithChars } = scan();

  it('走査が実物に届いている (空撃ちでない)', () => {
    // `_CHARS` を使うファイルが十分ある / 正しい呼び出しも十分ある。
    // **床を実測より高くすると落ちる** (2026-09-13 実測: 44 ファイル / 111 行)。
    expect(filesWithChars, '_CHARS を使うファイルが見つからない — 走査が死んでいる').toBeGreaterThan(25);
    expect(right, 'countChars / clampToCeiling / charsOverCeiling が 1 つも無い').toBeGreaterThan(60);
  });

  it('★ コード単位で `_CHARS` を数える・切る箇所は 0 件', () => {
    const report = wrong.map((h) => `  ${h.where}  ${h.why}\n    ${h.line}`).join('\n');
    expect(
      wrong,
      `天井の単位が「字」でない箇所があります (countChars / clampToCeiling を使ってください):\n${report}`,
    ).toEqual([]);
  });

  it('★ 対照: 走査は取り違えた形を拾う (綴り違いで黙っていない)', () => {
    // 標本 —— 直す前に実在した 3 つの形。どれも 1 行ごとに当たる。
    const samples = [
      "  if (typeof p.note !== 'string' || p.note.length > MAX_RECORD_NOTE_CHARS) {",
      '  if (MAX_MEMBER_NOTE_CHARS < text.length) return null;',
      '      setNote(raw.slice(0, MAX_RECORD_NOTE_CHARS));',
    ];
    for (const s of samples) {
      expect(
        WRONG.some(([re]) => re.test(s)),
        s,
      ).toBe(true);
    }
    // 対照の対照 —— 直した形は拾わない。
    const fixed = [
      "  if (typeof p.note !== 'string' || countChars(p.note) > MAX_RECORD_NOTE_CHARS) {",
      '      setNote(clampToCeiling(raw, MAX_RECORD_NOTE_CHARS));',
      '  const over = charsOverCeiling(raw, MAX_RECORD_NOTE_CHARS);',
      '  const bytes = buf.length > MAX_RESPONSE_BYTES;', // `_CHARS` でない天井は対象外
    ];
    for (const s of fixed) {
      expect(
        WRONG.some(([re]) => re.test(s)),
        s,
      ).toBe(false);
    }
  });
});
