/**
 * e2eSuiteFloors — 実機 E2E (`scripts/e2e/core.cjs`) の **suite ごとの床**の形を留める。
 *
 * ## なぜ (2026-09-17 · パス 303)
 *
 * e2e の床は「合計 0 件なら落とす」だけだった。suite の中の `ok()` は `for` の中や
 * `if (frame) { … }` の中に在るので、対象の一覧が空になる・分岐が閉じるだけで
 * **その suite の検査が黙って減り、合計は緑のまま**になる。2026-09-05 の
 * 「知らない suite 名で 0 件走って PASSED」の 1 段下の同じ穴。
 *
 * 床そのものは実機でしか効かない (ブラウザが要る)。ここで留めるのは**表の形**:
 * 32 suite が全部載っている・床は 1 以上で実測以下 (実測より大きい床は
 * 「必ず落ちる検査」になり、誰かが床を消す)・名前の一覧は表から導く・
 * 合計の床は suite の床の和を下回らない側に置かない (合計だけが緩い形にしない)。
 */
import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';

const REPO_ROOT = path.resolve(__dirname, '../../..');
/** 原文 (表の `// 実測 N` はコメントなので、表の読み取りだけはこちら)。 */
const src = readOriginalSource(path.join(REPO_ROOT, 'scripts/e2e/core.cjs'));
/**
 * 構造の主張 (一覧を表から導く・ループ・合計の床) はコメントを落とした原文に当てる ——
 * `// const SUITES = SUITE_TABLE.map(…)` という**言及**で満たされないように
 * (パス 297 / 298 / 302 の家系。最初の版は原文のままだった)。
 *
 * ★ **2026-09-25 (パス 463) まで、これは `scripts/shared-judgement-census.cjs` の
 * 手書きの字句解析器を `createRequire` で借りていた** —— つまり**3 つ目の実装**で、
 * `stripNonCodeParity` の台帳 (走査の針は `function stripNonCode(`) にも
 * `commentStripperCensus` の針 (正規表現の綴り) にも映らなかった。
 * 共有の 1 つへ寄せた。
 */
const code = stripComments(src);

/**
 * 表の 1 行: `['name', fn, 実測]` (2026-09-20 · パス 346 から **3 列**)。
 *
 * それまでは `['name', fn, 床], // 実測 N` の **4 つの数を 2 か所に手書き**で
 * 持っていた。全 suite を回して突き合わせたら 3 つの文がずれていた:
 *
 * ```
 *   suite            表の注記  実物  床   床/実物
 *   paperAccount           10    13    8    62%   ← 5 件減っても鳴らない
 *   theme                  14    14   10    71%   ← 規則どおりなら 11
 *   (他 30 suite は注記も床も正確だった)
 *
 *   MIN_TOTAL_CHECKS 384  = 注記合計 452 の 85.0%   ← 数そのものは正しい
 *   core.cjs「実測 (合計 395 件) の 85%」            ← 根拠の数が二重に偽
 *   CLAUDE.md「床 377 … → 381 = 実測 449 の 85%」    ← 両方とも古い
 * ```
 *
 * **数は保たれていたのに、その数が何の 85% なのかを述べた文だけが古びていた。**
 * この検査は `sumMeasured` を 452 に留めていたが、**それは表の注記の合計**であって
 * 実物ではない —— ブラウザを起こさないと実物は数えられないので、ここでは分からない。
 * だから実物とのずれは runner 自身が走り終えたあとに印字する。
 */
const ROW = /^\s*\['(\w+)', (\w+), (\d+)\],$/gm;
/** 床 = 実測の 85% (切り捨て・最低 1)。**規則は core.cjs の `floorOf` と同じ 1 つ。** */
const floorOf = (measured: number): number => Math.max(1, Math.floor(measured * 0.85));
const rows = [...src.matchAll(ROW)].map((m) => ({
  name: m[1]!,
  fn: m[2]!,
  measured: Number(m[3]),
  floor: floorOf(Number(m[3])),
}));

describe('e2e の suite ごとの床 (パス 303 · 346)', () => {
  it('針の標本 — 表の行に当たり、呼び出し行には当たらない', () => {
    expect("    ['tablet', tabletSuite, 2],").toMatch(new RegExp(ROW.source, 'm'));
    expect("  if (run('tablet')) await tabletSuite(browser);").not.toMatch(new RegExp(ROW.source, 'm'));
    // 旧い 4 列の形はもう当たらない (列を戻したら rows が空になり、下の床が鳴る)。
    expect("    ['tablet', tabletSuite, 1], // 実測 2").not.toMatch(new RegExp(ROW.source, 'm'));
  });

  it('★ 床は手書きではなく導出 (数を 2 か所に書かない)', () => {
    expect(code).toContain('const floorOf = (measured) => Math.max(1, Math.floor(measured * 0.85));');
    expect(code).toContain('const floor = floorOf(measured);');
    // 4 列の表・`// 実測 N` の注記・直書きの合計の床は、どれも戻っていない。
    const fourColumns = /\['\w+', \w+, \d+, \d+\]/;
    const noteColumn = /\], \/\/ 実測 \d+/;
    const literalTotal = /const MIN_TOTAL_CHECKS = \d+;/;
    expect(fourColumns.test("['desktop', desktopSuite, 51, 60]")).toBe(true); // 針の標本
    expect(noteColumn.test("    ['desktop', desktopSuite, 51], // 実測 60")).toBe(true);
    expect(literalTotal.test('  const MIN_TOTAL_CHECKS = 384;')).toBe(true);
    expect(code).not.toMatch(fourColumns);
    expect(src).not.toMatch(noteColumn);
    expect(code).not.toMatch(literalTotal);
  });

  it('★ 2026-09-20 に緩んでいた 2 つが、導出で規則どおりに戻る', () => {
    const by = new Map(rows.map((r) => [r.name, r]));
    // paperAccount は注記 10 / 実物 13 で、旧い床 8 は実物の 62% だった。
    expect(by.get('paperAccount')?.measured).toBe(13);
    expect(by.get('paperAccount')?.floor).toBe(11);
    expect(8 / 13).toBeLessThan(0.85); // 旧い床が規則を割っていたことの標本
    // theme は注記 14 に対し床 10 (71%) だった。
    expect(by.get('theme')?.measured).toBe(14);
    expect(by.get('theme')?.floor).toBe(11);
  });

  it('★ 表の実測値が実物とずれたら runner が言う (落とさずに印字する)', () => {
    expect(code).toContain('if (ran !== measured) stale.push(');
    expect(src).toContain('SUITE_TABLE の実測値が古い suite が');
    // 落とす側ではないことを同じ検査で留める (失敗に積んでいない)。
    const staleFails = /stale\.length > 0[\s\S]{0,160}?failures\.push/;
    expect(staleFails.test('if (stale.length > 0) { failures.push("x"); }')).toBe(true); // 針の標本
    expect(code).not.toMatch(staleFails);
  });

  it('★ 32 suite が全部載っている (名前は一意)', () => {
    expect(rows.length).toBe(32);
    expect(new Set(rows.map((r) => r.name)).size).toBe(32);
    for (const r of rows) expect(r.fn, r.name).toMatch(/Suite$/);
  });

  it('★ 床は 1 以上で実測以下 (実測より大きい床は「必ず落ちる検査」になる)', () => {
    for (const r of rows) {
      expect(r.floor, r.name).toBeGreaterThanOrEqual(1);
      expect(r.floor, r.name).toBeLessThanOrEqual(r.measured);
    }
  });

  it('★ 名前の一覧は表から導く (表に無い suite は呼べない) —— コメントの言及では満たされない', () => {
    expect(code).toMatch(/const SUITES = SUITE_TABLE\.map\(\(\[name\]\) => name\);/);
    expect(code).toMatch(/for \(const \[name, suite, measured\] of SUITE_TABLE\)/);
    // 針の標本: 言及だけの形は落ちる
    expect(stripComments('// const SUITES = SUITE_TABLE.map(([name]) => name);\nconst SUITES = [\'desktop\'];')).not.toMatch(
      /const SUITES = SUITE_TABLE\.map/,
    );
  });

  it('★ 合計の床は suite の床の和より緩くない (導出値で確かめる)', () => {
    expect(code).toMatch(/const MIN_TOTAL_CHECKS = floorOf\(SUITE_TABLE\.reduce\(/);
    const total = floorOf(rows.reduce((a, r) => a + r.measured, 0));
    const sumFloors = rows.reduce((a, r) => a + r.floor, 0);
    const sumMeasured = rows.reduce((a, r) => a + r.measured, 0);
    expect(total).toBeGreaterThanOrEqual(sumFloors);
    expect(total).toBeLessThanOrEqual(sumMeasured);
    // 実測の合計は 2026-09-17 の 395 (FULL / LITE とも) + 2026-09-18 (パス 317) の theme suite 12 + パス 318 の 2
    // + 2026-09-19 (パス 322) の shell suite 27 = 436 + パス 323 の kessanTax +7 (1 点 1 枚・cascade・PDF のページ数と縮めた対照) = 443
    // + パス 328 の kessanTax +1 (まとめてに決算公告の要旨が入らない) = 444
    // + パス 329 の kessanTax +5 (参考の別紙・法定は 4 枚のまま・出所・突き合わせ) = 449
    // + 2026-09-20 (パス 335) の teamRadar +3 (見本が端末の編集内容を上書きしない・
    //   注記が「残した物を残した」と言う・下書きが在るのに「見本を表示しています」と言わない) = 452
    // + 2026-09-20 (パス 346) に paperAccount の注記 10 が**実物 13 と 3 件ずれていた**のを
    //   実測で直した = 455 (今日の `e2e` / `e2e:lite` の実測とも一致する)
    expect(sumMeasured).toBe(455);
  });
});

/*
 * ## `ok(true, …)` は検査ではなく記録である —— 直前の wait が投げることで成り立つ (パス 303)
 *
 * 実測 32 か所。どれも `await page.waitForFunction(…)` / `waitForSelector(…)` の直後で、
 * wait が締切で投げれば FATAL → exit 1 になるので、`ok(true)` は「待てた」という記録に
 * すぎない。ただしそれは**慣習**で、誰かが wait を消す・`try` で包むと `ok(true)` は
 * 緑のまま残る。慣習を規則にする: `ok(true,` の**直前の文**が投げる wait であること。
 *
 * ★ 最初の版は「直前 12 行以内に wait が在ればよい」だった。対照 (wait を消す) が
 * **鳴らなかった** —— 12 行前の別の wait (前の段の `waitForSelector`) で満たされていた。
 * 窓ではなく**直前の文**を見る。
 */
describe('e2e の ok(true, …) は投げる wait の直後にしか置けない (パス 303)', () => {
  const THROWING_WAIT = /waitForFunction\(|waitForSelector\(|\.waitFor\(|waitForURL\(|waitForEvent\(/;
  // 注記は共有の字句解析器で落とす (行番号は保たれる)。行頭が `//` かで見ると
  // `await w(); // ok(true, …)` のような**行末の注記**が呼び出しとして数えられ、
  // 逆に直前の文を遡る所では注記行を飛ばせなかった (パス 463)。
  const lines = stripComments(src).split('\n');
  const sites = lines.map((l, i) => (l.includes('ok(true,') ? i : -1)).filter((i) => i >= 0);

  /**
   * `ok(true,` の直前の `await` 文 (空行・コメントは飛ばし、複数行の呼び出しは
   * `await` の行まで戻る)。`try { … } catch` で包まれていれば投げないので空を返す。
   * 2 度目の版 —— 最初は「文の頭」を `{` / `}` でも切っていて、引数の
   * `{ timeout: 15000 },` の行で止まり、原文の 13 件を誤って挙げた。
   */
  function precedingStatement(i: number): string {
    let end = i - 1;
    while (end >= 0 && /^\s*$/.test(lines[end]!)) end -= 1;
    let start = end;
    while (start >= 0 && !/^\s*await /.test(lines[start]!)) start -= 1;
    if (start < 0) return '';
    const block = lines.slice(start, end + 1).join('\n');
    return /\bcatch\b/.test(block) ? '' : block;
  }

  it('針の標本 — 投げる wait には当たり、押すだけ・待つだけ (タイマー) には当たらない', () => {
    expect("  await page.waitForFunction(() => document.body.textContent.includes('393,000'));").toMatch(THROWING_WAIT);
    expect("  await page.waitForSelector('text=E2E物件', { timeout: 15000 });").toMatch(THROWING_WAIT);
    expect("  await page.getByRole('button', { name: '保存' }).click();").not.toMatch(THROWING_WAIT);
    expect('  await page.waitForTimeout(3000);').not.toMatch(THROWING_WAIT);
  });

  it('★ 走査が生きている (実測 32 か所・床 20)', () => {
    expect(sites.length).toBeGreaterThanOrEqual(20);
  });

  it('★ どの ok(true, …) も、直前の文が投げる wait である', () => {
    const orphans = sites.filter((i) => !THROWING_WAIT.test(precedingStatement(i)));
    expect(
      orphans.map((i) => `${i + 1}: ${lines[i]!.trim().slice(0, 80)}`),
      'ok(true) の直前の文が投げる wait ではない —— 条件を ok() に入れるか、wait を戻す',
    ).toEqual([]);
  });
});
