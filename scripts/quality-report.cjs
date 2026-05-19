#!/usr/bin/env node
/*
 * One-shot quality dashboard. Runs the pieces that take less than a few
 * seconds (typecheck, vitest, coverage) and aggregates the most recent
 * mutation report (Stryker) if it exists. Writes the result to
 * `docs/QUALITY.md` so each commit captures a snapshot.
 *
 *   npm run quality:report
 *   npm run quality:report -- --no-coverage  # skip the slow path
 *
 * The mutation section is OPT-OUT-by-skip: if `reports/mutation/
 * mutation.json` is older than 24h or missing, the section says so.
 * Running `npm run mutate` separately refreshes it.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const SKIP_COVERAGE = args.includes('--no-coverage');

function run(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    return (err.stdout ?? '') + (err.stderr ?? '');
  }
}

console.error('quality: typecheck...');
const tc = run('npm run typecheck');
const tcOk = !/error TS\d/.test(tc);

console.error('quality: tests...');
const testOut = run('npm test');
const testMatch = testOut.match(/Tests +(\d+) passed/);
const passed = testMatch ? Number(testMatch[1]) : 0;
const failed = (testOut.match(/Tests +\d+ passed.*\((\d+)\)/)?.[1] && Number(testOut.match(/(\d+) failed/)?.[1] ?? 0)) || 0;
const testFiles = Number(testOut.match(/Test Files +(\d+) passed/)?.[1] ?? 0);

let lineCov = null, branchCov = null, funcCov = null, stmtCov = null;
if (!SKIP_COVERAGE) {
  console.error('quality: coverage...');
  run('npx vitest run --coverage --coverage.reporter=json-summary --coverage.include=src/main/**');
  const summaryPath = path.join(ROOT, 'coverage', 'coverage-summary.json');
  if (fs.existsSync(summaryPath)) {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    const total = summary.total ?? {};
    lineCov = total.lines?.pct ?? null;
    branchCov = total.branches?.pct ?? null;
    funcCov = total.functions?.pct ?? null;
    stmtCov = total.statements?.pct ?? null;
  }
}

// Mutation report — use whatever is already on disk.
const mutPath = path.join(ROOT, 'reports', 'mutation', 'mutation.json');
let mutSection = '_no mutation report found — run `npm run mutate`._';
let mutTotal = null;
if (fs.existsSync(mutPath)) {
  const stat = fs.statSync(mutPath);
  const ageH = (Date.now() - stat.mtimeMs) / 3.6e6;
  const mut = JSON.parse(fs.readFileSync(mutPath, 'utf8'));
  const perFile = [];
  let killed = 0, survived = 0, noCov = 0, total = 0;
  for (const [file, info] of Object.entries(mut.files ?? {})) {
    let fk = 0, fs2 = 0, fnc = 0, ftot = 0;
    for (const m of info.mutants ?? []) {
      total += 1; ftot += 1;
      if (m.status === 'Killed' || m.status === 'Timeout') { killed += 1; fk += 1; }
      else if (m.status === 'Survived') { survived += 1; fs2 += 1; }
      else if (m.status === 'NoCoverage') { noCov += 1; fnc += 1; }
    }
    perFile.push({
      file: file.replace(ROOT + '/', ''),
      killed: fk, survived: fs2, noCov: fnc, total: ftot,
      pct: ftot > 0 ? (100 * fk / ftot).toFixed(2) : '0.00',
      covered: (ftot - fnc) > 0 ? (100 * fk / (ftot - fnc)).toFixed(2) : '0.00',
    });
  }
  perFile.sort((a, b) => a.file.localeCompare(b.file));
  mutTotal = { killed, survived, noCov, total };
  const totalPct = total > 0 ? (100 * killed / total).toFixed(2) : '0.00';
  const coveredPct = (total - noCov) > 0 ? (100 * killed / (total - noCov)).toFixed(2) : '0.00';
  mutSection = '';
  mutSection += `_Report age: ${ageH.toFixed(1)}h._\n\n`;
  mutSection += `**Overall: ${totalPct}% total / ${coveredPct}% covered** (${killed} killed / ${survived} survived / ${noCov} no-cov)\n\n`;
  mutSection += '| file | score | covered | killed | survived | no-cov |\n';
  mutSection += '|------|------:|--------:|-------:|---------:|-------:|\n';
  for (const r of perFile) {
    mutSection += `| ${r.file} | ${r.pct} | ${r.covered} | ${r.killed} | ${r.survived} | ${r.noCov} |\n`;
  }
}

const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
const md = `# Quality dashboard

最終更新: ${now}

> 自動生成: \`npm run quality:report\`。コミット前に再生成して差分をレビューに含めるのが推奨。

## Summary

| 指標 | 値 |
|---|---|
| TypeScript 型チェック | ${tcOk ? '✅ pass' : '❌ FAIL'} |
| ユニットテスト | ${passed} passing${failed ? ` / ${failed} FAILING` : ''} (${testFiles} files) |
${lineCov !== null ? `| Coverage — lines | ${lineCov.toFixed(2)}% |\n| Coverage — statements | ${stmtCov.toFixed(2)}% |\n| Coverage — branches | ${branchCov.toFixed(2)}% |\n| Coverage — functions | ${funcCov.toFixed(2)}% |\n` : '| Coverage | _skipped_ |\n'}${mutTotal ? `| Mutation score (total / covered) | ${(100 * mutTotal.killed / mutTotal.total).toFixed(2)}% / ${(100 * mutTotal.killed / (mutTotal.total - mutTotal.noCov)).toFixed(2)}% |\n| Mutants killed | ${mutTotal.killed} |\n| Mutants survived | ${mutTotal.survived} |\n` : ''}

## Mutation testing (Stryker)

${mutSection}

## How to drill down

\`\`\`bash
# Re-run mutation testing (takes ~2 min)
npm run mutate

# See the top 20 survived mutants ranked by potential impact
npm run mutate:triage

# Filter to one file
npm run mutate:triage -- --file=src/main/clients/security.ts

# Full coverage HTML report
npx vitest run --coverage --coverage.reporter=html
open coverage/index.html
\`\`\`

詳しい運用ルールは \`docs/QUALITY_WORKFLOW.md\` を参照。
`;

const out = path.join(ROOT, 'docs', 'QUALITY.md');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, md);
console.error(`quality: wrote ${path.relative(ROOT, out)}`);
console.log(md);
