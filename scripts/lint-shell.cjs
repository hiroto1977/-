#!/usr/bin/env node
/**
 * Shell script quality gate.
 *
 * scripts/*.sh are part of the automated developer workflow
 * (setup-linux.sh / migrate.sh / assemble-appimage.sh). A syntax error
 * or a missing safety header would only be discovered on a fresh
 * machine mid-migration — the worst possible moment. This gate fails
 * CI instead:
 *
 *   1. `bash -n <script>` must pass (syntax).
 *   2. The script must enable strict mode: `set -euo pipefail`.
 *   3. The script must start with a bash shebang.
 *
 * Run via:  node scripts/lint-shell.cjs
 *           npm run lint:shell
 *
 * Exits 1 on any violation.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPTS_DIR = path.resolve(__dirname);

function main() {
  const files = fs
    .readdirSync(SCRIPTS_DIR)
    .filter((f) => f.endsWith('.sh'))
    .sort();

  const failures = [];
  for (const f of files) {
    const full = path.join(SCRIPTS_DIR, f);
    const src = fs.readFileSync(full, 'utf8');

    if (!/^#!\/usr\/bin\/env bash\n/.test(src) && !/^#!\/bin\/bash\n/.test(src)) {
      failures.push(`${f}: missing bash shebang on line 1`);
    }
    if (!/^set -euo pipefail$/m.test(src)) {
      failures.push(`${f}: missing strict mode (set -euo pipefail)`);
    }
    const res = spawnSync('bash', ['-n', full], { encoding: 'utf8' });
    if (res.status !== 0) {
      failures.push(`${f}: bash -n failed\n${(res.stderr || '').trim()}`);
    }
  }

  console.log(`Checked ${files.length} shell script(s) in scripts/`);
  if (failures.length === 0) {
    console.log('✅ all shell scripts pass syntax + strict-mode checks');
    return 0;
  }
  console.error(`❌ ${failures.length} shell script violation(s):`);
  for (const f of failures) console.error(`  ${f}`);
  return 1;
}

process.exit(main());
