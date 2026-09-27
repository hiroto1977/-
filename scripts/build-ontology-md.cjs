#!/usr/bin/env node
/**
 * ontology:md — `docs/ONTOLOGY.md` を `src/shared/ontology/` と実物から生成する。
 *
 *   node scripts/build-ontology-md.cjs              生成して書き戻す
 *   node scripts/build-ontology-md.cjs --check      再生成が committed と一致するか (exit 1 で不一致)
 *   node scripts/build-ontology-md.cjs --self-test  検査そのものの対照
 *
 * 組み立ては TypeScript (`src/__tests__/ontologyMain.ts` → `renderCurrent()`) に 1 つ在り、
 * ここは esbuild で型を剥がして Node に読ませるだけ。同じ関数を `ontologyDoc.test.ts` が直接呼ぶので、
 * CLI と検査が別々の文書を組むことは無い (規則は 1 つ)。
 *
 * 入口は定数 (`ENTRY`)。引数で別のファイルを渡せる形にはしない —— 読み込んだ物を
 * 実行するので、入口が可変なら任意コード実行の口になる
 * (`orchestration/knowledge-context.cjs` の `loadModuleExports` が同じ理由で
 * 評価先を閉じ込めている)。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const REPO_ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(REPO_ROOT, 'src', '__tests__', 'ontologyMain.ts');
const OUT = path.join(REPO_ROOT, 'docs', 'ONTOLOGY.md');

/**
 * TypeScript の入口を読み込んで `renderCurrent` を返す。
 *
 * 束ねて `new Function` で走らせる形は取らない —— `lint:forbidden` (不変条件 #9) が
 * 禁じており、唯一の例外は `orchestration/knowledge-context.cjs` だけである。
 * 代わりに **Node の require に `.ts` の読み手を一時的に登録**する (tsx / ts-node と
 * 同じ形): 1 ファイルずつ esbuild で型を剥がし、Node 自身の module loader に
 * 渡す。相対 import は Node の解決に任せるので束ねる必要が無い。読み終えたら
 * 登録を外す (このプロセスの他の require に影響を残さない)。
 */
function loadRenderer(entry = ENTRY) {
  const esbuild = require('esbuild');
  const Module = require('node:module');
  const previous = Module._extensions['.ts'];
  Module._extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const { code } = esbuild.transformSync(source, {
      loader: 'ts',
      format: 'cjs',
      target: 'node20',
      sourcefile: filename,
    });
    module._compile(code, filename);
  };
  try {
    // 入口は定数 (ENTRY)。冒頭の注記を参照。
    const req = createRequire(entry);
    const mod = req(entry);
    if (typeof mod.renderCurrent !== 'function') {
      throw new Error('ontologyMain.ts が renderCurrent を export していません');
    }
    return mod.renderCurrent;
  } finally {
    if (previous) Module._extensions['.ts'] = previous;
    else delete Module._extensions['.ts'];
  }
}

function render() {
  return loadRenderer()();
}

/** committed と再生成の差を報告する。一致なら null。 */
function checkAgainst(committed, generated) {
  if (committed === null) return 'docs/ONTOLOGY.md が無い (npm run ontology:md で生成)';
  if (committed === generated) return null;
  const a = committed.split('\n');
  const b = generated.split('\n');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return `docs/ONTOLOGY.md が古い (最初の差は ${i + 1} 行目)。npm run ontology:md で再生成してください`;
}

function selfTest() {
  const failures = [];
  const check = (name, cond) => {
    console.log(`  ${cond ? '✓' : '✗'} ${name}`);
    if (!cond) failures.push(name);
  };
  const doc = '# a\n\nb\n';
  check('一致なら null', checkAgainst(doc, doc) === null);
  check('無ければ鳴る', typeof checkAgainst(null, doc) === 'string');
  check('差が在れば行番号つきで鳴る', /3 行目/.test(checkAgainst(doc, '# a\n\nc\n') || ''));
  // 実物: 生成物は空でなく、両方の網羅の芯 (法則の表・facet 行列) を持つ。
  const generated = render();
  check('生成物が空でない', generated.length > 20_000);
  check('facet 行列を持つ', generated.includes('## 3. サービスの facet 行列'));
  check('法則の表を持つ', generated.includes('## 5. 法則と執行者'));
  if (failures.length > 0) {
    console.error(`❌ self-test: ${failures.length} 件`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const generated = render();
  if (argv.includes('--check')) {
    const committed = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
    const problem = checkAgainst(committed, generated);
    if (problem) {
      console.error(`❌ ${problem}`);
      return 1;
    }
    console.log('✅ docs/ONTOLOGY.md は最新');
    return 0;
  }
  fs.writeFileSync(OUT, generated);
  console.log(`✅ ${path.relative(REPO_ROOT, OUT)} を生成 (${generated.length} 文字)`);
  return 0;
}

module.exports = { render, checkAgainst, loadRenderer, selfTest };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
