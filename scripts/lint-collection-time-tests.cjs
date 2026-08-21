#!/usr/bin/env node
'use strict';

/**
 * 「`mutate` に載っているのに 1 件も測られない」を止めるゲート。
 *
 * ## なぜ要るか
 *
 * 2026-08-21 に `src/shared/welfareDocs.ts` が**変異検査の対象に載っているのに
 * 変異体を 1 件も測っていない**状態で見つかった。45 件すべてが
 * "Static mutant (and ignoreStatic was enabled)" として無視され、スコアは n/a。
 *
 * 原因は検査の書き方 (罠 2-c-3)。
 *
 *     describe('welfareRegulationMarkdown', () => {
 *       const md = welfareRegulationMarkdown(input);   // ← 収集時に確定する
 *       it('…', () => { expect(md).toContain('…'); });
 *     });
 *
 * Stryker は「テストファイルの読み込み中に実行される変異体」を static と
 * 判定する。`ignoreStatic: true` の下では、どのテストにも覆われていない
 * static 変異体は**黙って無視される**。つまり対象を `describe` 直下で
 * 呼ぶだけの検査は、変異体が有効になる前の値を見ているうえ、その事実が
 * スコアにも現れない。
 *
 * ファイル冒頭には「block-level `Stryker disable all`」と書いてあったが、
 * その指示はどこにも書かれておらず、**別の理由で偶然どこも測られていなかった**。
 * 説明が実態と食い違ったまま 1 年近く残っていたことになる。
 *
 * ## 何を見るか
 *
 * `mutate` に載っているモジュールについて、それを import しているテストが
 * **`it(...)` の中で 1 度も呼んでいない**場合に落とす。1 度でも中で呼ばれて
 * いれば変異体は覆われるので、静かに消えることはない。
 *
 * 直し方はサンク化 —— `const md = () => welfareRegulationMarkdown(input);`
 * にして各 `it` の中で `md()` を評価する。検査の中身は変えなくてよい。
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

/** 行コメント・ブロックコメント・文字列リテラルを潰す (誤検出を避ける)。 */
function stripNonCode(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/`(?:[^`\\]|\\.)*`/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/'(?:[^'\\\n]|\\.)*'/g, (m) => ' '.repeat(m.length))
    .replace(/"(?:[^"\\\n]|\\.)*"/g, (m) => ' '.repeat(m.length));
}

function walkTests(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') walkTests(p, out);
    } else if (/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function mutateList() {
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'stryker.config.json'), 'utf8'));
  return Array.isArray(cfg.mutate) ? cfg.mutate : [];
}

/**
 * テスト 1 本を読み、対象モジュールごとに「it の中で呼ばれた / 収集時に呼ばれた」を数える。
 *
 * 波括弧の深さで `it(...)` のコールバック内かを判定する。厳密なパーサではないが、
 * **見落とし側に倒れる** (中で呼ばれていると誤って判定する) ことはあっても、
 * 呼ばれているものを呼ばれていないと言うことはない書き方にしてある。
 */
function scanTest(file, mutateSet) {
  const raw = fs.readFileSync(file, 'utf8');
  const code = stripNonCode(raw);
  const owner = new Map();
  const importRe = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  let im;
  while ((im = importRe.exec(raw)) !== null) {
    if (!im[2].startsWith('.')) continue;
    const base = path.resolve(path.dirname(file), im[2]);
    const target = [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]
      .map((c) => path.relative(REPO_ROOT, c))
      .find((c) => mutateSet.has(c));
    if (target === undefined) continue;
    for (const n of im[1].split(',')) {
      const name = n.replace(/\btype\b/g, '').split(' as ').pop().trim();
      if (name !== '') owner.set(name, target);
    }
  }
  const seen = new Map();
  if (owner.size === 0) return seen;

  let depth = 0;
  let testDepth = null;
  for (const line of code.split('\n')) {
    const entersTest = /\b(?:it|test)(?:\.\w+)*\s*\(/.test(line) && testDepth === null;
    for (const ch of line) {
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (testDepth !== null && depth < testDepth) testDepth = null;
      }
    }
    if (entersTest) testDepth = depth;

    for (const [name, target] of owner) {
      if (!new RegExp(`\\b${name}\\s*\\(`).test(line)) continue;
      // `=> fn(` はサンク越し。呼ばれるのは it の中なので収集時ではない。
      const deferred = new RegExp(`=>\\s*\\{?\\s*${name}\\s*\\(`).test(line);
      if (!seen.has(target)) seen.set(target, { inTest: 0, atCollection: 0 });
      const st = seen.get(target);
      if (testDepth !== null || deferred) st.inTest += 1;
      else st.atCollection += 1;
    }
  }
  return seen;
}

function analyze() {
  const mutate = mutateList();
  const mutateSet = new Set(mutate);
  const status = new Map();
  for (const file of walkTests(path.join(REPO_ROOT, 'src'))) {
    for (const [target, st] of scanTest(file, mutateSet)) {
      if (!status.has(target)) status.set(target, { inTest: 0, atCollection: 0, tests: new Set() });
      const cur = status.get(target);
      cur.inTest += st.inTest;
      cur.atCollection += st.atCollection;
      cur.tests.add(path.relative(REPO_ROOT, file));
    }
  }
  return [...status.entries()]
    .filter(([, st]) => st.inTest === 0 && st.atCollection > 0)
    .map(([target, st]) => ({ target, ...st, tests: [...st.tests] }));
}

/** 対照実験 — 規則が本当に鳴るか。鳴らないゲートは緑を配るだけになる。 */
function selfTest() {
  const cases = [
    [
      'describe 直下で呼ぶだけなら鳴る',
      "import { f } from '../a';\ndescribe('x', () => {\n  const v = f(1);\n  it('y', () => { expect(v).toBe(1); });\n});",
      true,
    ],
    [
      'it の中で呼んでいれば鳴らない',
      "import { f } from '../a';\ndescribe('x', () => {\n  it('y', () => { expect(f(1)).toBe(1); });\n});",
      false,
    ],
    [
      'サンクにしてあれば鳴らない',
      "import { f } from '../a';\ndescribe('x', () => {\n  const v = () => f(1);\n  it('y', () => { expect(v()).toBe(1); });\n});",
      false,
    ],
    [
      'コメント内の呼び出しは数えない',
      "import { f } from '../a';\ndescribe('x', () => {\n  // かつては const v = f(1); と書いていた\n  it('y', () => { expect(f(1)).toBe(1); });\n});",
      false,
    ],
  ];
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'ctt-'));
  const mutateSet = new Set(['a.ts']);
  let failed = 0;
  console.log('self-test:');
  for (const [label, src, want] of cases) {
    const dir = path.join(tmp, '__tests__');
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, 'x.test.ts');
    fs.writeFileSync(f, src);
    // a.ts は __tests__ の 1 つ上に居る想定。相対解決を合わせるため差し替える。
    const seen = scanTest(f, new Set([path.relative(REPO_ROOT, path.join(tmp, 'a.ts'))]));
    const st = seen.get(path.relative(REPO_ROOT, path.join(tmp, 'a.ts')));
    const rings = st !== undefined && st.inTest === 0 && st.atCollection > 0;
    const ok = rings === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${rings ? '鳴った' : '鳴らない'} (期待 ${want ? '鳴る' : '鳴らない'})`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  if (failed > 0) {
    console.error(`❌ self-test ${failed} 件失敗 — 規則が壊れています`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const bad = analyze();
  console.log(`Scanned ${mutateList().length} mutate-listed file(s)`);
  if (bad.length === 0) {
    console.log('✅ 対象を収集時にしか呼んでいない検査はありません');
    return 0;
  }
  console.error(`❌ ${bad.length} 件:`);
  for (const b of bad) {
    console.error(`  ${b.target}: it(...) の中で 1 度も呼ばれていません (収集時 ${b.atCollection} 回)`);
    console.error(`      検査: ${b.tests.join(', ')}`);
    console.error(
      '      → `const x = fn(...)` を `const x = () => fn(...)` にして各 it の中で評価してください。' +
        'このままだと変異体が static 扱いになり、ignoreStatic の下で 1 件も測られません',
    );
  }
  return 1;
}

module.exports = { analyze, scanTest, stripNonCode };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
