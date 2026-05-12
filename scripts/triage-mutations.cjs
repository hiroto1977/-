#!/usr/bin/env node
/*
 * Read Stryker's JSON report and surface the survived mutants most worth
 * killing next. Groups by file → mutator type and skips low-signal kinds
 * (string-literal mutations on URL/scope constants, which would force us
 * to test the contents of configuration data — diminishing returns).
 *
 *   npm run mutate:triage              # top 20, all files
 *   npm run mutate:triage -- --top 50  # top 50
 *   npm run mutate:triage -- --file=src/main/clients/security.ts
 *   npm run mutate:triage -- --include-string-literals
 *
 * Output is Markdown so it can be pasted straight into a PR description.
 */

const fs = require('node:fs');
const path = require('node:path');

const REPORT = path.join(__dirname, '..', 'reports', 'mutation', 'mutation.json');
const args = process.argv.slice(2);
const TOP = Number(args.find((a) => a.startsWith('--top='))?.slice('--top='.length) ?? '20') || 20;
const FILE_FILTER = args.find((a) => a.startsWith('--file='))?.slice('--file='.length);
const INCLUDE_STRINGS = args.includes('--include-string-literals');

// Higher score = higher-leverage to test. String literals + array
// declarations on data-only constants are intentionally last because
// killing them tests data, not logic.
const SCORES = {
  ConditionalExpression: 10,
  LogicalOperator: 10,
  OptionalChaining: 9,
  EqualityOperator: 9,
  ArithmeticOperator: 9,
  UpdateOperator: 8,
  UnaryOperator: 8,
  BlockStatement: 7,
  MethodExpression: 7,
  ArrowFunction: 6,
  Regex: 5,
  ObjectLiteral: 4,
  ArrayDeclaration: 3,
  StringLiteral: 2,
  BooleanLiteral: 5,
  NullishCoalescing: 9,
};

function fail(msg) {
  console.error(`triage-mutations: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(REPORT)) {
  fail(`report not found at ${REPORT}. Run \`npm run mutate\` first.`);
}

const data = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
const rows = [];

for (const [file, info] of Object.entries(data.files ?? {})) {
  if (FILE_FILTER && !file.includes(FILE_FILTER)) continue;
  for (const m of info.mutants ?? []) {
    if (m.status !== 'Survived') continue;
    const mutator = m.mutatorName ?? '?';
    if (!INCLUDE_STRINGS && mutator === 'StringLiteral') continue;
    rows.push({
      file: file.replace(process.cwd() + '/', ''),
      line: m.location?.start?.line ?? 0,
      column: m.location?.start?.column ?? 0,
      mutator,
      score: SCORES[mutator] ?? 1,
      original: (m.replacement || '').slice(0, 60).replace(/\n/g, '\\n'),
      replacement: (m.replacement || '').slice(0, 60).replace(/\n/g, '\\n'),
    });
  }
}

rows.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line);

console.log(`# Stryker triage — top ${Math.min(TOP, rows.length)} of ${rows.length} survived mutants`);
console.log('');
console.log(
  '_Higher rows are more likely to be real logic gaps. StringLiteral mutants are excluded by default (run with `--include-string-literals` to see them all)._',
);
console.log('');

if (rows.length === 0) {
  console.log('✨ No actionable mutants surviving. Either everything is killed, or pass `--include-string-literals` for the long tail.');
  process.exit(0);
}

console.log('| score | file | line | mutator | replacement |');
console.log('|------:|------|-----:|---------|-------------|');
for (const r of rows.slice(0, TOP)) {
  const fileShort = r.file.replace(/^src\/main\/clients\//, '').replace(/^src\/main\//, '');
  const escaped = '`' + r.replacement.replace(/`/g, '\\`') + '`';
  console.log(`| ${r.score} | ${fileShort} | ${r.line} | ${r.mutator} | ${escaped} |`);
}

console.log('');
console.log('## Distribution');
const dist = {};
for (const r of rows) dist[r.mutator] = (dist[r.mutator] || 0) + 1;
const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
for (const [m, n] of sorted) console.log(`- ${n.toString().padStart(4)} ${m}`);
