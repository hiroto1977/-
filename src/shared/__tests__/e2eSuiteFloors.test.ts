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
 * 31 suite が全部載っている・床は 1 以上で実測以下 (実測より大きい床は
 * 「必ず落ちる検査」になり、誰かが床を消す)・名前の一覧は表から導く・
 * 合計の床は suite の床の和を下回らない側に置かない (合計だけが緩い形にしない)。
 */
import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { readOriginalSource } from './originalSource';

const REPO_ROOT = path.resolve(__dirname, '../../..');
/** 原文 (表の `// 実測 N` はコメントなので、表の読み取りだけはこちら)。 */
const src = readOriginalSource(path.join(REPO_ROOT, 'scripts/e2e/core.cjs'));
/**
 * 構造の主張 (一覧を表から導く・ループ・合計の床) はコメントを落とした原文に当てる ——
 * `// const SUITES = SUITE_TABLE.map(…)` という**言及**で満たされないように
 * (パス 297 / 298 / 302 の家系。最初の版は原文のままだった)。
 */
const { stripComments } = createRequire(__filename)(path.join(REPO_ROOT, 'scripts/shared-judgement-census.cjs')) as {
  stripComments: (s: string) => string;
};
const code = stripComments(src);

/** 表の 1 行: `['name', fn, floor], // 実測 N` */
const ROW = /^\s*\['(\w+)', (\w+), (\d+)\], \/\/ 実測 (\d+)$/gm;
const rows = [...src.matchAll(ROW)].map((m) => ({ name: m[1]!, fn: m[2]!, floor: Number(m[3]), measured: Number(m[4]) }));

describe('e2e の suite ごとの床 (パス 303)', () => {
  it('針の標本 — 表の行に当たり、呼び出し行には当たらない', () => {
    expect("    ['tablet', tabletSuite, 1], // 実測 2").toMatch(new RegExp(ROW.source));
    expect("  if (run('tablet')) await tabletSuite(browser);").not.toMatch(new RegExp(ROW.source));
  });

  it('★ 31 suite が全部載っている (名前は一意)', () => {
    expect(rows.length).toBe(31);
    expect(new Set(rows.map((r) => r.name)).size).toBe(31);
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
    expect(code).toMatch(/for \(const \[name, suite, floor\] of SUITE_TABLE\)/);
    // 針の標本: 言及だけの形は落ちる
    expect(stripComments('// const SUITES = SUITE_TABLE.map(([name]) => name);\nconst SUITES = [\'desktop\'];')).not.toMatch(
      /const SUITES = SUITE_TABLE\.map/,
    );
  });

  it('★ 合計の床は suite の床の和より緩くない', () => {
    const m = /const MIN_TOTAL_CHECKS = (\d+);/.exec(code);
    expect(m).not.toBeNull();
    const total = Number(m![1]);
    const sumFloors = rows.reduce((a, r) => a + r.floor, 0);
    const sumMeasured = rows.reduce((a, r) => a + r.measured, 0);
    expect(total).toBeGreaterThanOrEqual(sumFloors);
    expect(total).toBeLessThanOrEqual(sumMeasured);
    // 実測の合計は 2026-09-17 の 395 (FULL / LITE とも) + 2026-09-18 (パス 317) の theme suite 12 = 407
    expect(sumMeasured).toBe(407);
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
  const lines = src.split('\n');
  const sites = lines.map((l, i) => (l.includes('ok(true,') ? i : -1)).filter((i) => i >= 0);

  /**
   * `ok(true,` の直前の `await` 文 (空行・コメントは飛ばし、複数行の呼び出しは
   * `await` の行まで戻る)。`try { … } catch` で包まれていれば投げないので空を返す。
   * 2 度目の版 —— 最初は「文の頭」を `{` / `}` でも切っていて、引数の
   * `{ timeout: 15000 },` の行で止まり、原文の 13 件を誤って挙げた。
   */
  function precedingStatement(i: number): string {
    let end = i - 1;
    while (end >= 0 && /^\s*(\/\/|$)/.test(lines[end]!)) end -= 1;
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
