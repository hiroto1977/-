#!/usr/bin/env node
 
/**
 * suggest-next-kill — ROI-ranked recommender for the next mutation to kill.
 *
 * Reads `reports/mutation/mutation.json` and ranks surviving mutants by
 *   ROI = (mutator-impact × test-coverage-ratio × file-priority) / kill-cost
 *
 * where:
 *   mutator-impact     : ConditionalExpression/LogicalOperator > MethodExpression
 *                        > Regex > ObjectLiteral > ArrayDeclaration > StringLiteral
 *   test-coverage-ratio: 1 / coveredBy.length (fewer covering tests → easier
 *                        to write a focused kill test that doesn't fight
 *                        with assertions in many existing tests)
 *   file-priority      : files below the score floor (lowest first) get a
 *                        bonus, since lifting them moves the global score
 *                        the most
 *   kill-cost          : heuristic — StringLiteral on a quoted URL/header
 *                        usually requires only an exact-equals assertion
 *                        (cheap), while ConditionalExpression often needs
 *                        a new test path (expensive) — so the scoring is
 *                        intentionally NOT just "highest impact wins"
 *
 * Output format: Markdown, top N (default 5), each with file:line, mutator,
 * suggested-pattern, expected-score-gain. Designed to be pasted into a
 * commit message or PR description.
 *
 * Usage:
 *   node scripts/suggest-next-kill.cjs           # top 5
 *   node scripts/suggest-next-kill.cjs --top=10
 *   npm run mutate:next                          # alias
 *
 * Notes:
 *   - This is purely a LOCAL analysis of the existing mutation report.
 *     There is no API call; the "API connection" is a separate
 *     deferred contract (see ARCHITECTURE.md §5.5).
 *   - Run `npm run mutate` first to refresh the report.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const REPORT = path.join(REPO_ROOT, 'reports/mutation/mutation.json');

const args = process.argv.slice(2);
const TOP = Number(args.find((a) => a.startsWith('--top='))?.slice('--top='.length) ?? '5') || 5;

if (!fs.existsSync(REPORT)) {
  console.error(`error: ${REPORT} not found. Run \`npm run mutate\` first.`);
  process.exit(2);
}

const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));

// --- Mutator-impact weights ---------------------------------------------
// Behavioral-logic mutators rank highest — killing one of these usually
// hardens a real branch decision. Data mutators (StringLiteral / Array /
// Object) are lower because their kills test what the data IS, not what
// the code DOES.
const MUTATOR_IMPACT = {
  ConditionalExpression: 10,
  LogicalOperator: 10,
  EqualityOperator: 9,
  ArithmeticOperator: 9,
  OptionalChaining: 8,
  UpdateOperator: 8,
  MethodExpression: 7,
  ArrowFunction: 7,
  BlockStatement: 6,
  Regex: 5,
  ObjectLiteral: 4,
  ArrayDeclaration: 3,
  StringLiteral: 2,
};

// --- Suggested kill pattern for each mutator type -----------------------
// One-liner hint a developer can use as the test scaffold. These are
// intentionally generic — the dev still has to fill in the right
// arguments and assertions.
const PATTERN_HINT = {
  ConditionalExpression: 'Test BOTH branches: assert distinct outcomes for the true-path AND the false-path of this condition.',
  LogicalOperator: 'Test the boundary: an input where one operand is true and the other false (so && vs || differ).',
  EqualityOperator: 'Test the exact boundary: e.g. `length === N` for `length > N` vs `>=`.',
  ArithmeticOperator: 'Pin the result with a specific input that distinguishes the operator (e.g. 50/1000 vs 50*1000).',
  OptionalChaining: 'Test with the chained value missing (undefined). Original returns undefined; mutated throws TypeError.',
  UpdateOperator: 'Verify the counter direction: assert the count after N increments differs from N decrements.',
  MethodExpression: 'Pin the call result: assert the exact return value (slice, sort, etc.) — NOT just "returns truthy".',
  ArrowFunction: 'Drive a code path that invokes the callback and assert the side effect (or return value).',
  BlockStatement: 'Assert a side-effect that ONLY happens inside the block — file write, request fired, value set.',
  Regex: 'Test the boundary case the regex was written for (e.g. multiple trailing chars for `+`, edge anchor for `^`/`$`).',
  ObjectLiteral: 'Assert specific properties of the object literal — not just truthy. Use toMatchObject with exact keys.',
  ArrayDeclaration: 'Assert array contents (toEqual or toContain each expected element).',
  StringLiteral: 'Assert the exact string value with .toBe — not just .toContain or "is non-empty".',
};

// --- File-priority bonus -----------------------------------------------
// Files with the lowest mutation score get a bonus, because lifting the
// floor moves the project total more than topping up an already-90+ file.
const fileScores = Object.entries(report.files)
  .map(([file, data]) => {
    const total = data.mutants.length;
    const killed = data.mutants.filter((m) => m.status === 'Killed').length;
    const score = total === 0 ? 100 : (killed / total) * 100;
    return [file, score];
  })
  .sort((a, b) => a[1] - b[1]);

const filePriority = new Map();
fileScores.forEach(([file], idx) => {
  // Bottom 1/3 of files get +3, middle 1/3 +1, top 1/3 +0.
  const rank = idx / fileScores.length;
  if (rank < 1 / 3) filePriority.set(file, 3);
  else if (rank < 2 / 3) filePriority.set(file, 1);
  else filePriority.set(file, 0);
});

// --- Score every survivor ----------------------------------------------
const survivors = [];
for (const [file, data] of Object.entries(report.files)) {
  for (const m of data.mutants) {
    if (m.status !== 'Survived') continue;
    const impact = MUTATOR_IMPACT[m.mutatorName] ?? 1;
    const coveringTests = (m.coveredBy ?? []).length;
    // Coverage ratio: more existing tests on the line means harder to
    // pin without conflicting with their assertions. Cap at 1.0.
    const coverageRatio = 1 / Math.max(1, Math.min(coveringTests, 20));
    const fileBonus = filePriority.get(file) ?? 0;
    // Kill cost: behavior mutators usually need a new test (cost 2),
    // string/array/object are cheap exact-equals adds (cost 1).
    const killCost =
      m.mutatorName === 'StringLiteral' || m.mutatorName === 'ArrayDeclaration' || m.mutatorName === 'ObjectLiteral'
        ? 1
        : 2;
    const roi = (impact * coverageRatio + fileBonus) / killCost;
    survivors.push({
      file,
      line: m.location?.start?.line ?? 0,
      mutator: m.mutatorName,
      replacement: typeof m.replacement === 'string' ? m.replacement.slice(0, 60) : '',
      coveringTests,
      impact,
      fileBonus,
      killCost,
      roi,
    });
  }
}

survivors.sort((a, b) => b.roi - a.roi);
const top = survivors.slice(0, TOP);

// --- Render Markdown ---------------------------------------------------
const totalSurvivors = survivors.length;
const totalMutants = Object.values(report.files).reduce((acc, f) => acc + f.mutants.length, 0);
const killed = totalMutants - totalSurvivors;

console.log(`# Next ${TOP} mutants to kill (ROI-ranked)`);
console.log();
console.log(
  `Current: ${killed} killed / ${totalSurvivors} survived (total mutation ` +
    `${((killed / totalMutants) * 100).toFixed(2)}%). ROI = ` +
    `(impact × 1/covers + file-bonus) / kill-cost.`,
);
console.log();
console.log('| # | ROI | File:line | Mutator | Suggested pattern |');
console.log('|--:|----:|-----------|---------|-------------------|');
top.forEach((s, i) => {
  const rel = path.relative(REPO_ROOT, path.join(REPO_ROOT, s.file));
  const hint = PATTERN_HINT[s.mutator] ?? 'Add a focused kill test.';
  console.log(
    `| ${i + 1} | ${s.roi.toFixed(2)} | \`${rel}:${s.line}\` | ${s.mutator} → \`${s.replacement}\` | ${hint} |`,
  );
});

console.log();
console.log('## Per-file priority (lowest mutation score first)');
console.log();
console.log('| File | Score | Survivors | Bonus |');
console.log('|---|---:|---:|---:|');
fileScores.forEach(([file, score]) => {
  const fileSurvivors = report.files[file].mutants.filter((m) => m.status === 'Survived').length;
  const bonus = filePriority.get(file) ?? 0;
  const rel = path.relative(REPO_ROOT, path.join(REPO_ROOT, file));
  console.log(
    `| \`${rel}\` | ${score.toFixed(2)} | ${fileSurvivors} | +${bonus} |`,
  );
});

console.log();
console.log('---');
console.log('Run `npm run mutate` to refresh the underlying report before re-ranking.');
