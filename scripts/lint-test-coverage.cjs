#!/usr/bin/env node
 
/**
 * Test-coverage discipline checker.
 *
 * Codifies two invariants that aren't enforced by line/branch coverage:
 *
 *   - **Every service in SERVICE_IDS has a `<id>.test.ts` file** in
 *     src/main/clients/__tests__/. Otherwise the service may have
 *     zero tests and coverage stays high because the file simply
 *     doesn't get scanned.
 *
 *   - **Every action key in each ACTIONS map appears as a quoted
 *     string in the matching test file**. Catches "I added a new
 *     action but didn't add a test for it".
 *
 * Run via:  node scripts/lint-test-coverage.cjs
 *           npm run lint:test-coverage
 *
 * Exits 1 on any missing test file or untested action.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

function read(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function serviceIds() {
  const src = read(path.join(REPO_ROOT, 'src/shared/serviceId.ts'));
  const m = src.match(/SERVICE_IDS = \[([\s\S]*?)\]/);
  return m ? [...m[1].matchAll(/'([a-z][a-z0-9-]*)'/g)].map((x) => x[1]) : [];
}

function actionsOf(serviceId) {
  const src = read(path.join(REPO_ROOT, 'src/main/clients', `${serviceId}.ts`));
  if (!src) return [];
  const m = src.match(/export const ACTIONS[\s\S]*?\{([\s\S]*?)\n\};/);
  if (!m) return [];
  return [...m[1].matchAll(/['"]([a-z][a-z0-9-]*)['"]\s*:/gi)].map((x) => x[1]);
}

// ---------------------------------------------------------------------------
// jsdom を宣言しているのに DOM を使っていないテストを検出する
// ---------------------------------------------------------------------------

/*
 * `@vitest-environment jsdom` は 1 ファイルあたり約 0.65 秒の環境生成コストを払う。
 * `pool: 'forks'` + `isolate: true` なのでファイルごとに毎回かかる。
 *
 * ところが `.render.test.ts` の多くは `renderToStaticMarkup` で文字列を作るだけで
 * DOM を一切触らない。実測すると 28 ファイル中 11 ファイルが該当し、外すだけで
 * `npm test` が 57.5 秒 → 49.5 秒（環境生成 19.0 秒 → 11.3 秒）になった。
 *
 * 新しいレンダーテストは既存ファイルをコピーして作られるので、この pragma も一緒に
 * 写経される。放っておくと必ず戻るため機械で見張る。DOM を使っているなら宣言は正しい。
 */
const DOM_GLOBALS = /\b(document|window|localStorage|sessionStorage|indexedDB|navigator|location|HTMLElement|Element|Node|MutationObserver|IntersectionObserver|requestAnimationFrame|createRoot|fireEvent|screen)\b/;

/** 行コメント・ブロックコメント・文字列リテラルを落として実コードだけ残す。 */
function stripNonCode(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

function walkTests(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkTests(full, out);
    else if (/\.test\.ts$/.test(e.name)) out.push(full);
  }
  return out;
}

function checkJsdomNeed(failures) {
  const files = walkTests(path.join(REPO_ROOT, 'src'), []);
  let checked = 0;
  for (const file of files) {
    const text = read(file);
    if (!/@vitest-environment\s+jsdom/.test(text)) continue;
    checked++;
    if (DOM_GLOBALS.test(stripNonCode(text))) continue;
    failures.push({
      kind: 'needless-jsdom',
      service: path.relative(REPO_ROOT, file),
      reason:
        'declares `@vitest-environment jsdom` but never touches a DOM global. '
        + 'jsdom costs ~0.65s of environment setup per file (forks + isolate). '
        + 'Drop the pragma, or stub the bridge on `globalThis` instead of `window`.',
    });
  }
  return checked;
}

function main() {
  const failures = [];
  const ids = serviceIds();

  for (const id of ids) {
    const testFile = path.join(
      REPO_ROOT,
      'src/main/clients/__tests__',
      `${id}.test.ts`,
    );
    if (!fs.existsSync(testFile)) {
      failures.push({
        kind: 'missing-test-file',
        service: id,
        reason: `no test file at src/main/clients/__tests__/${id}.test.ts`,
      });
      continue;
    }

    const testText = read(testFile);
    const actions = actionsOf(id);
    for (const action of actions) {
      // Each action must appear at least once in the test file as a
      // string literal. Looking for quoted form because tests invoke
      // it via `ACTIONS['<action>']` or describe('ACTIONS["<action>"]')`.
      const escaped = action.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const re = new RegExp(`['"\`]${escaped}['"\`]`);
      if (!re.test(testText)) {
        failures.push({
          kind: 'untested-action',
          service: id,
          action,
          reason: `action "${action}" never appears as a quoted string in ${id}.test.ts`,
        });
      }
    }
  }

  const jsdomChecked = checkJsdomNeed(failures);

  console.log(
    `Checked ${ids.length} services for test files + action coverage`
      + `, and ${jsdomChecked} jsdom test file(s) for actual DOM use`,
  );
  if (failures.length === 0) {
    console.log('✅ every service has a test file and every action is exercised');
    return 0;
  }
  console.error(`❌ ${failures.length} coverage gap(s):`);
  for (const f of failures) {
    console.error(`  [${f.kind}] ${f.service}${f.action ? ' / ' + f.action : ''} — ${f.reason}`);
  }
  return 1;
}

process.exit(main());
