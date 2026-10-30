#!/usr/bin/env node
'use strict';
/**
 * Mamori (守り) のコンパイラの CLI (2026-10-30 · パス 560 · threat: T-221)。言語の仕様は `docs/MAMORI.md`。
 *
 *   npm run mamori:build     src/ の .mamori を全部コンパイルし、隣の .ts を書き直す
 *   npm run mamori:check     書かずに、コンパイルの誤りと「生成物が古い」を報せる (exit 1)
 *
 * 母集団は `src/` の下の `.mamori` 全部 (走査で導く —— 手で並べると 1 本足したときに黙る)。
 * コンパイラは `src/shared/mamori/compile.ts` で、ここは esbuild で型を剥がして Node に読ませるだけ
 * (`scripts/build-ontology-md.cjs` と同じ形)。同じ判定を `mamoriGenerated.test.ts` が npm test で行う。
 */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const REPO_ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(REPO_ROOT, 'src', 'shared', 'mamori', 'compile.ts');

function loadCompiler() {
  const esbuild = require('esbuild');
  const Module = require('node:module');
  const previous = Module._extensions['.ts'];
  Module._extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const { code } = esbuild.transformSync(source, { loader: 'ts', format: 'cjs', target: 'node20', sourcefile: filename });
    module._compile(code, filename);
  };
  try {
    return createRequire(ENTRY)(ENTRY);
  } finally {
    if (previous) Module._extensions['.ts'] = previous;
    else delete Module._extensions['.ts'];
  }
}

/** `src/` の下の .mamori を道の順に (リポジトリからの相対・`/` 区切り)。 */
function sources(root = path.join(REPO_ROOT, 'src')) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.mamori')) out.push(path.relative(REPO_ROOT, full).split(path.sep).join('/'));
    }
  };
  walk(root);
  return out.sort();
}

function main(argv) {
  const check = argv.includes('--check');
  const { compileProject, formatDiagnostic } = loadCompiler();
  const files = sources().map((p) => ({ path: p, source: fs.readFileSync(path.join(REPO_ROOT, p), 'utf8') }));
  if (files.length === 0) {
    console.error('❌ .mamori が 1 本も見つかりません (走査が死んでいる)');
    return 1;
  }
  const result = compileProject(files);
  if (!result.ok) {
    console.error(`❌ Mamori のコンパイルが ${result.diagnostics.length} 件の誤りで止まりました:`);
    for (const d of result.diagnostics) console.error(`  ${formatDiagnostic(d)}`);
    return 1;
  }
  const stale = [];
  for (const [out, text] of result.outputs) {
    const abs = path.join(REPO_ROOT, out);
    const committed = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    if (committed === text) continue;
    if (check) stale.push(out);
    else fs.writeFileSync(abs, text);
  }
  if (check && stale.length > 0) {
    console.error(`❌ 生成物が .mamori と食い違います (${stale.length} 本): ${stale.join(', ')} —— npm run mamori:build で組み直してください (生成物を手で直さない)`);
    return 1;
  }
  console.log(`✅ Mamori: ${files.length} 本をコンパイルしました${check ? ' (生成物は最新)' : ''}`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { sources, loadCompiler };
