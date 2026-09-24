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

/**
 * 行コメント・ブロックコメント・文字列リテラルを落として実コードだけ残す。
 *
 * **`${…}` は文字列ではなく式なので残す** (2026-09-23 · パス 418)。
 * **正規表現のリテラルも落とす** (2026-09-24 · パス 451) —— 引用符を含む正規表現
 * (`["']` ほか) を見ると文字列へ入り、**次の同じ引用符までを飲んでいた** (実測:
 * `src` の 63 本 / コード 5,226 行が走査から消えていた)。理由と失敗の向きの選び方は
 * `src/shared/__tests__/stripNonCode.ts` の docblock に在る。
 *
 * これは `src/shared/__tests__/stripNonCode.ts` と**同じ算法の写し**である ——
 * `.cjs` からは `.ts` を require できないので写しは避けられない (前例:
 * `scripts/inject-pwa.cjs` の色の正規表現・パス 363)。**3 つが黙って割れないよう、
 * `src/shared/__tests__/stripNonCodeParity.test.ts` が同じ標本を 3 つに通して
 * 出力が 1 字も違わないことを見る** (台帳は両方向)。
 *
 * 補間を落とす形だと、このリポジトリが利用者に見せる文を組む場所 ——
 * つまり最も危ない式が並ぶ所 —— がどの走査にも映らない (パス 417 の実測)。
 */
function stripNonCode(src, opts = {}) {
  let out = '';
  let i = 0;
  let mode = 'code';
  /** 戻り先と、そのとき保留にした `{}` の深さ (入れ子のテンプレートに耐えるため)。 */
  const stack = [];
  /** 今の code フレームの `{}` の深さ。0 で `}` を見たら補間の終わり。 */
  let depth = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (mode === 'code') {
      if (two === '//') { mode = 'line'; i += 2; continue; }
      if (two === '/*') { mode = 'block'; i += 2; continue; }
      if (src[i] === "'") { stack.push({ mode, depth }); mode = 'sq'; i += 1; continue; }
      if (src[i] === '"') { stack.push({ mode, depth }); mode = 'dq'; i += 1; continue; }
      if (src[i] === '`') { stack.push({ mode, depth }); mode = 'tpl'; i += 1; continue; }
      if (src[i] === '/' && startsRegex(out)) {
        const end = skipRegex(src, i);
        if (end > i) {
          // 正規表現のリテラル —— 中身は落とし、区切りの空白だけ出す (パス 451)。
          out += ' ';
          i = end;
          continue;
        }
      }
      if (src[i] === '{') { depth += 1; out += '{'; i += 1; continue; }
      if (src[i] === '}') {
        const frame = depth === 0 ? stack.pop() : undefined;
        if (frame !== undefined) {
          out += ' ';
          mode = frame.mode;
          depth = frame.depth;
        } else {
          if (depth > 0) depth -= 1;
          out += '}';
        }
        i += 1;
        continue;
      }
      out += src[i];
      i += 1;
      continue;
    }
    if (mode === 'line') {
      if (src[i] === '\n') { mode = 'code'; out += '\n'; }
      i += 1;
      continue;
    }
    if (mode === 'block') {
      if (two === '*/') { mode = 'code'; i += 2; continue; }
      if (src[i] === '\n') out += '\n';
      i += 1;
      continue;
    }
    // 文字列の中: 改行だけ残して行番号を保つ。エスケープは 1 文字飛ばす。
    if (src[i] === '\\') { i += 2; continue; }
    if (mode === 'tpl' && two === '${') {
      // **補間は式** —— code として出す (区切りの空白つき)。
      out += ' ';
      stack.push({ mode, depth });
      mode = 'code';
      depth = 0;
      i += 2;
      continue;
    }
    if ((mode === 'sq' && src[i] === "'") || (mode === 'dq' && src[i] === '"') || (mode === 'tpl' && src[i] === '`')) {
      if (opts.keepQuoteChars === true) out += `${src[i]}${src[i]}`;
      const frame = stack.pop();
      mode = frame === undefined ? 'code' : frame.mode;
      if (frame !== undefined) depth = frame.depth;
    } else if (src[i] === '\n') {
      out += '\n';
    }
    i += 1;
  }
  return out;
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

/**
 * `/` が正規表現の始まりか。**直前の意味のある字**で決める (パス 451)。
 * 読み違えた場合は「割り算」へ倒れ、今までと同じ振る舞いになる。
 */
function startsRegex(emitted) {
  let j = emitted.length - 1;
  while (j >= 0 && /\s/.test(emitted[j])) j -= 1;
  if (j < 0) return true;
  const c = emitted[j];
  if (c === ')' || c === ']') return false;
  if (/[\w$]/.test(c)) {
    let k = j;
    while (k >= 0 && /[\w$]/.test(emitted[k])) k -= 1;
    return isRegexPrecedingKeyword(emitted.slice(k + 1, j + 1));
  }
  return true;
}

/**
 * この語の直後の `/` は正規表現である。**`const` の集合にはしない** ——
 * この本は読み込みの時点で `main()` を走らせるので、末尾の `const` は TDZ で落ちる
 * (2026-09-24 · パス 451 で実際に落ちた)。関数宣言は巻き上げられる。
 */
function isRegexPrecedingKeyword(word) {
  switch (word) {
    case 'return': case 'typeof': case 'case': case 'in': case 'of':
    case 'instanceof': case 'new': case 'delete': case 'void':
    case 'do': case 'else': case 'yield': case 'await':
      return true;
    default:
      return false;
  }
}

/** 正規表現のリテラルを読み飛ばす。行内で閉じなければ `start` を返す。 */
function skipRegex(src, start) {
  let j = start + 1;
  let inClass = false;
  while (j < src.length) {
    const c = src[j];
    if (c === '\n') return start;
    if (c === '\\') { j += 2; continue; }
    if (inClass) {
      if (c === ']') inClass = false;
    } else if (c === '[') {
      inClass = true;
    } else if (c === '/') {
      j += 1;
      while (j < src.length && /[a-z]/.test(src[j])) j += 1;
      return j;
    }
    j += 1;
  }
  return start;
}
