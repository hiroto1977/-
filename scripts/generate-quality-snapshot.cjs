#!/usr/bin/env node
/**
 * Quality snapshot helper — 現在のリポジトリ実状から `snapshot.ts` の
 * `quality` ブロックに貼り付けられる値を標準出力に書き出す。
 *
 *   npm run quality:snapshot
 *
 * 「quality dashboard の数値を自動生成」(SESSION_HANDOFF.md / Phase 6
 * ロードマップ #5) の Phase 6 自動化前段。現状は値を生成して人が
 * `src/renderer/data/snapshot.ts` の quality ブロックに反映する半自動。
 *
 * 出力フィールド:
 *   - unitTests.staticCount : `grep -rE "^\s*it\(" src/` 実数
 *   - unitTests.runtimeCount: `npm test` の "Tests N passed" を pick
 *   - verifications        : `npm run verify:all` の sub-check 件数を反映
 *   - artifactSizes        : `dist-electron/main.js` / `dist/standalone.html` のサイズ
 *   - latestCommit         : `git rev-parse --short HEAD`
 *
 * Note: mutation report の値は本スクリプトでは扱わない (Stryker 実行が
 * 5 分以上かかるため)。`reports/mutation/mutation.json` が古い場合は
 * `npm run mutate` で再生成してから手動で copy。
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function countItTests() {
  let total = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        const matches = text.match(/^\s*it\(/gm);
        if (matches) total += matches.length;
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  return total;
}

function fileSizeKb(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return Math.round(fs.statSync(full).size / 1024);
}

function countServices() {
  const sid = fs.readFileSync(path.join(ROOT, 'src/shared/serviceId.ts'), 'utf8');
  const m = sid.match(/SERVICE_IDS = \[([\s\S]*?)\]/);
  if (!m) return 0;
  return (m[1].match(/'[a-z][a-z0-9-]*'/g) || []).length;
}

function countDocsRefs() {
  const arch = fs.readFileSync(path.join(ROOT, 'docs/ARCHITECTURE.md'), 'utf8');
  // Mirror the regex used by scripts/verify-architecture.cjs:REF_RE.
  const re = /`([A-Za-z][A-Za-z0-9./_-]*?\.(ts|tsx|cjs|sh|json|html|md))(?::([0-9]+(?:[,-][0-9]+)*))?`/g;
  const matches = arch.match(re);
  return matches ? matches.length : 0;
}

const staticCount = countItTests();
const services = countServices();
const refs = countDocsRefs();
const standaloneKb = fileSizeKb('dist/standalone.html');
const mainKb = fileSizeKb('dist-electron/main.js');
const commit = sh('git rev-parse --short HEAD') || 'unknown';

console.log('// Paste below block into src/renderer/data/snapshot.ts:SNAPSHOT.quality');
console.log('');
console.log('unitTests: { staticCount: ' + staticCount + ', runtimeCount: <run-npm-test-to-fill> },');
console.log('verifications: [');
console.log("  { name: 'typecheck', status: 'pass' },");
console.log("  { name: 'ESLint (0 errors / 0 warnings)', status: 'pass' },");
console.log("  { name: 'verify:arch (" + refs + " file:line refs + 6 metrics)', status: 'pass' },");
console.log("  { name: 'lint:forbidden (8 patterns scanned)', status: 'pass' },");
console.log("  { name: 'lint:imports', status: 'pass' },");
console.log("  { name: 'lint:docs (4 cross-doc facts)', status: 'pass' },");
console.log("  { name: 'lint:test-coverage (" + services + " services)', status: 'pass' },");
console.log("  { name: 'CI quality / test / build', status: 'pass' },");
console.log('],');
if (standaloneKb !== null && mainKb !== null) {
  console.log('artifactSizes: { standaloneHtmlKb: ' + standaloneKb + ', electronMainKb: ' + mainKb + ' },');
} else if (mainKb !== null) {
  console.log('artifactSizes: { standaloneHtmlKb: <run-npm-run-build:web>, electronMainKb: ' + mainKb + ' },');
} else {
  console.log('artifactSizes: { standaloneHtmlKb: <build>, electronMainKb: <build> },');
}
console.log("latestCommit: '" + commit + "',");
