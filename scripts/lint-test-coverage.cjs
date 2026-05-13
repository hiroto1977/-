#!/usr/bin/env node
/* eslint-disable */
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
  return m ? [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]) : [];
}

function actionsOf(serviceId) {
  const src = read(path.join(REPO_ROOT, 'src/main/clients', `${serviceId}.ts`));
  if (!src) return [];
  const m = src.match(/export const ACTIONS[\s\S]*?\{([\s\S]*?)\n\};/);
  if (!m) return [];
  return [...m[1].matchAll(/['"]([a-z][a-z-]*)['"]\s*:/gi)].map((x) => x[1]);
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

  console.log(
    `Checked ${ids.length} services for test files + action coverage`,
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
