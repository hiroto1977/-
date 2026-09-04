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
//
// **点数の定義は Stryker に合わせる。** Stryker は分母から 2 種類を外す:
//   - `Ignored`   … `Stryker disable` で意図的に測らないと宣言した変異
//   - `RuntimeError` / `CompileError` … 変異体が壊れて**評価そのものが成立しなかった**もの
// 残り (Killed + Timeout + Survived + NoCoverage) だけが「有効な変異」で、
// 分子は Killed + Timeout。以前ここは `Ignored` も分母に入れていたので、
// Stryker が 100.00% と言っている同じ報告書から 77.16% を出していた
// (35,359 のうち 8,071 が Ignored)。同じ数字を 2 か所で作らないよう、
// 表と要約は下の `mutTotal` が持つ**同一の文字列**を読む。
const mutPath = path.join(ROOT, 'reports', 'mutation', 'mutation.json');
let mutSection = '_no mutation report found — run `npm run mutate`._';
let mutTotal = null;
const DETECTED = new Set(['Killed', 'Timeout']);
const INVALID = new Set(['RuntimeError', 'CompileError']);
function scorePct(detected, denom) {
  return denom > 0 ? (100 * detected / denom).toFixed(2) : '0.00';
}
if (fs.existsSync(mutPath)) {
  const stat = fs.statSync(mutPath);
  const ageH = (Date.now() - stat.mtimeMs) / 3.6e6;
  const mut = JSON.parse(fs.readFileSync(mutPath, 'utf8'));
  const perFile = [];
  let detected = 0, survived = 0, noCov = 0, ignored = 0, invalid = 0;
  const invalidFiles = [];
  for (const [file, info] of Object.entries(mut.files ?? {})) {
    let fd = 0, fs2 = 0, fnc = 0, fig = 0, fiv = 0;
    for (const m of info.mutants ?? []) {
      if (DETECTED.has(m.status)) { detected += 1; fd += 1; }
      else if (m.status === 'Survived') { survived += 1; fs2 += 1; }
      else if (m.status === 'NoCoverage') { noCov += 1; fnc += 1; }
      else if (m.status === 'Ignored') { ignored += 1; fig += 1; }
      else if (INVALID.has(m.status)) { invalid += 1; fiv += 1; }
    }
    if (fiv > 0) invalidFiles.push({ file: file.replace(ROOT + '/', ''), invalid: fiv });
    const fValid = fd + fs2 + fnc;
    perFile.push({
      file: file.replace(ROOT + '/', ''),
      killed: fd, survived: fs2, noCov: fnc, ignored: fig, invalid: fiv, total: fValid,
      pct: scorePct(fd, fValid),
      covered: scorePct(fd, fd + fs2),
    });
  }
  perFile.sort((a, b) => a.file.localeCompare(b.file));
  const valid = detected + survived + noCov;
  mutTotal = {
    killed: detected, survived, noCov, ignored, invalid, valid,
    totalPct: scorePct(detected, valid),
    coveredPct: scorePct(detected, detected + survived),
  };
  mutSection = '';
  mutSection += `_Report age: ${ageH.toFixed(1)}h._\n\n`;
  mutSection += `**Overall: ${mutTotal.totalPct}% total / ${mutTotal.coveredPct}% covered** `;
  mutSection += `(${detected} killed / ${survived} survived / ${noCov} no-cov / ${valid} valid)\n\n`;
  mutSection += `分母から外れたもの: \`Ignored\` ${ignored} (\`Stryker disable\` で測らないと宣言した分 — `;
  mutSection += `範囲は \`npm run lint:mutation-scope\` が台帳で押さえている) / `;
  mutSection += `\`RuntimeError\`+\`CompileError\` ${invalid} (**評価が成立しなかった分。0 でないなら盲点**`;
  mutSection += invalidFiles.length > 0
    ? `: ${invalidFiles.map((f) => `\`${f.file}\` ${f.invalid}`).join(', ')})\n\n`
    : ')\n\n';
  mutSection += '| file | score | covered | killed | survived | no-cov | ignored | invalid |\n';
  mutSection += '|------|------:|--------:|-------:|---------:|-------:|--------:|--------:|\n';
  for (const r of perFile) {
    mutSection += `| ${r.file} | ${r.pct} | ${r.covered} | ${r.killed} | ${r.survived} | ${r.noCov} | ${r.ignored} | ${r.invalid} |\n`;
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
${lineCov !== null ? `| Coverage — lines | ${lineCov.toFixed(2)}% |\n| Coverage — statements | ${stmtCov.toFixed(2)}% |\n| Coverage — branches | ${branchCov.toFixed(2)}% |\n| Coverage — functions | ${funcCov.toFixed(2)}% |\n` : '| Coverage | _skipped_ |\n'}${mutTotal ? `| Mutation score (total / covered) | ${mutTotal.totalPct}% / ${mutTotal.coveredPct}% |\n| Mutants killed | ${mutTotal.killed} |\n| Mutants survived | ${mutTotal.survived} |\n| Mutants 有効 (分母) | ${mutTotal.valid} |\n| Mutants ignored (Stryker disable 宣言) | ${mutTotal.ignored} |\n| Mutants invalid (評価不成立) | ${mutTotal.invalid} |\n` : ''}

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
