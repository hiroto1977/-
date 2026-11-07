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
 *   npm run mutate:triage -- --list    # 生存 + 未到達の全件を 1 行ずつ (下記)
 *   npm run mutate:triage -- --summary # ファイルごとの件数 1 行 (docs/QUALITY.md をログから作り直す要約・下記)
 *   npm run mutate:triage -- --report=<path>   # 既定は reports/mutation/mutation.json
 *
 * Output is Markdown so it can be pasted straight into a PR description.
 *
 * ## --list (2026-09-30 · パス 502)
 *
 * 上の表は `Survived` だけを `--top` 件で切り、元のソースを出さない (列も出さない)。
 * 閉じるべき生存が 660 件・92 ファイルに散っているときに要るのは、**全件を位置つきで 1 本の
 * ログに**出すことなので、`--list` は `Survived` と `NoCoverage` (どちらも「殺されていない」)
 * を全部、ファイルごと・位置順に 1 行ずつ出す:
 *
 *   L45:12 S StringLiteral "abc" ⇒ ""
 *   L60:3 N (static) BlockStatement { … } ⇒ {}
 *
 * `S` = Survived・`N` = NoCoverage・`(static)` = モジュール直下の値の変異体 (走査の前に
 * 評価される形 —— 読み直して測る検査が無いと「生存」に見える・法則 109)。元の綴りは報告が
 * 持つ `source` から位置で切り出す (Stryker の位置は行も列も 1 始まり・end は排他)。
 * `mutation.yml` の merge-full が併合した報告へこれを当て、GitHub のログ 1 本で全件が読める。
 *
 * **生存の行の末尾に、その行を通した検査のファイルを付ける** (`← a×3, b +2`・多い順に 3 つまで・
 * 残りは `+N`) —— 報告の `coveredBy` (検査の id) と `testFiles` (id → ファイル) を引く。
 * 生存した変異体は「通したのに誰も主張していない」ので、**足すべき主張の置き場はその検査**であり、
 * `(static)` の生存は**覆った検査がそのモジュールを検査の中で初めて評価した検査**そのもの
 * (法則 109 の直し方を当てる先 —— ローカルで Stryker を回して `coveredBy` を読まなくて済む)。
 * 未到達 (N) はどの検査も通っていないので付かない。
 *
 * ## --summary (2026-09-30 · パス 502)
 *
 * 全掃引の併合報告 (artifact) は、環境によっては取れない (blob の host が塞がれている)。
 * `docs/QUALITY.md` は報告から作るので、取れなければ頁が古いままになる —— 頁に要るのは
 * **ファイルごとの件数と run の `mutate`** だけなので、それを CI のログへ 1 行ずつ出す。
 * `quality-report.cjs --from-summary` がこの形を読んで報告を組み直す (ログの貼り付けの
 * 行頭のタイムスタンプは読み手が落とす)。行の種類:
 *
 *   RUN <run id> <sha>                 CI の実行 (GITHUB_RUN_ID / GITHUB_SHA・無ければ `-`)
 *   MERGED_AT <iso>                    併合した時刻 (報告の `mergedAt`・無ければ `-`)
 *   MUTATE a,b,c                       run の `config.mutate` (1 行 6 本)
 *   F <path> K=12 S=1 N=0 I=3 E=0      K = Killed + Timeout・S = Survived・N = NoCoverage・
 *                                      I = Ignored・E = RuntimeError + CompileError
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_REPORT = path.join(__dirname, '..', 'reports', 'mutation', 'mutation.json');

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

/** 1 行に収める。空白の並びを 1 つにして、長ければ `…` で切る。 */
function compact(text, max = 70) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Stryker の位置 (行も列も 1 始まり・end は排他) で元のソースを切り出す。
 * 位置が報告の `source` に収まらなければ空文字 (呼び手は `?` と書く)。
 */
function sliceSource(source, loc) {
  if (typeof source !== 'string' || !loc || !loc.start || !loc.end) return '';
  const lines = source.split('\n');
  const { start, end } = loc;
  if (start.line < 1 || end.line > lines.length || end.line < start.line) return '';
  if (start.line === end.line) return lines[start.line - 1].slice(start.column - 1, end.column - 1);
  const parts = [lines[start.line - 1].slice(start.column - 1)];
  for (let l = start.line + 1; l < end.line; l += 1) parts.push(lines[l - 1]);
  parts.push(lines[end.line - 1].slice(0, end.column - 1));
  return parts.join('\n');
}

/** 検査の id → 検査ファイルの短い名前 (`…/__tests__/foo.test.ts` → `foo`)。 */
function testFileIndex(report) {
  const byId = new Map();
  for (const [p, tf] of Object.entries((report && report.testFiles) || {})) {
    const short = path.basename(p).replace(/\.(test|audit)\.[cm]?[jt]sx?$/, '');
    for (const t of (tf && tf.tests) || []) byId.set(String(t.id), short);
  }
  return byId;
}

/** その変異体を通した検査を、ファイルごとの件数で (多い順・3 ファイルまで・残りは `+N`)。 */
function coveringFiles(m, byId) {
  const count = new Map();
  for (const id of m.coveredBy || []) {
    const f = byId.get(String(id));
    if (f !== undefined) count.set(f, (count.get(f) || 0) + 1);
  }
  if (count.size === 0) return '';
  const top = [...count.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const shown = top.slice(0, 3).map(([f, n]) => (n > 1 ? `${f}×${n}` : f));
  const rest = top.length - shown.length;
  return ` ← ${shown.join(', ')}${rest > 0 ? ` +${rest}` : ''}`;
}

/** 殺されていない変異体 (Survived / NoCoverage) を、ファイルごと・位置順に 1 行ずつ。 */
function listNonKilled(report, fileFilter) {
  const lines = [];
  let survived = 0;
  let noCoverage = 0;
  let files = 0;
  const byId = testFileIndex(report);
  for (const [file, info] of Object.entries((report && report.files) || {})) {
    if (fileFilter && !file.includes(fileFilter)) continue;
    const rows = ((info && info.mutants) || [])
      .filter((m) => m.status === 'Survived' || m.status === 'NoCoverage')
      .map((m) => ({ m, line: (m.location && m.location.start && m.location.start.line) || 0, col: (m.location && m.location.start && m.location.start.column) || 0 }))
      .sort((a, b) => a.line - b.line || a.col - b.col);
    if (rows.length === 0) continue;
    files += 1;
    lines.push('', `## ${file.replace(`${process.cwd()}/`, '')} (${rows.length})`);
    for (const { m, line, col } of rows) {
      const isNone = m.status === 'NoCoverage';
      if (isNone) noCoverage += 1;
      else survived += 1;
      const orig = compact(sliceSource(info.source, m.location)) || '?';
      const repl = compact(m.replacement || '') || '(空)';
      lines.push(`L${line}:${col} ${isNone ? 'N' : 'S'} ${m.mutatorName || '?'}${m.static ? ' (static)' : ''} ${orig} ⇒ ${repl}${isNone ? '' : coveringFiles(m, byId)}`);
    }
  }
  return { lines, survived, noCoverage, files };
}

const DETECTED = new Set(['Killed', 'Timeout']);
const INVALID = new Set(['RuntimeError', 'CompileError']);
const MUTATE_PER_LINE = 6;

/** 併合した報告を、ファイルごとの件数 1 行へ畳む (`--summary`)。 */
function summarizeFiles(report, env = process.env) {
  const lines = [];
  const mutate = report && report.config && Array.isArray(report.config.mutate) ? report.config.mutate.filter((m) => typeof m === 'string') : [];
  lines.push(`RUN ${env.GITHUB_RUN_ID || '-'} ${env.GITHUB_SHA || '-'}`);
  lines.push(`MERGED_AT ${report && typeof report.mergedAt === 'string' ? report.mergedAt : '-'}`);
  for (let i = 0; i < mutate.length; i += MUTATE_PER_LINE) lines.push(`MUTATE ${mutate.slice(i, i + MUTATE_PER_LINE).join(',')}`);
  let mutants = 0;
  let files = 0;
  for (const [file, info] of Object.entries((report && report.files) || {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const c = { K: 0, S: 0, N: 0, I: 0, E: 0 };
    for (const m of (info && info.mutants) || []) {
      if (DETECTED.has(m.status)) c.K += 1;
      else if (m.status === 'Survived') c.S += 1;
      else if (m.status === 'NoCoverage') c.N += 1;
      else if (m.status === 'Ignored') c.I += 1;
      else if (INVALID.has(m.status)) c.E += 1;
    }
    mutants += c.K + c.S + c.N + c.I + c.E;
    files += 1;
    lines.push(`F ${file.replace(`${process.cwd()}/`, '')} K=${c.K} S=${c.S} N=${c.N} I=${c.I} E=${c.E}`);
  }
  return { lines, files, mutants };
}

function fail(msg) {
  console.error(`triage-mutations: ${msg}`);
  process.exit(1);
}

function main(argv) {
  const TOP = Number(argv.find((a) => a.startsWith('--top='))?.slice('--top='.length) ?? '20') || 20;
  const FILE_FILTER = argv.find((a) => a.startsWith('--file='))?.slice('--file='.length);
  const INCLUDE_STRINGS = argv.includes('--include-string-literals');
  const LIST = argv.includes('--list');
  const SUMMARY = argv.includes('--summary');
  const REPORT = argv.find((a) => a.startsWith('--report='))?.slice('--report='.length) ?? DEFAULT_REPORT;

  if (!fs.existsSync(REPORT)) {
    fail(`report not found at ${REPORT}. Run \`npm run mutate\` first.`);
  }

  const data = JSON.parse(fs.readFileSync(REPORT, 'utf8'));

  if (SUMMARY) {
    const r = summarizeFiles(data);
    console.log(`# 変異検査の要約 — ファイル ${r.files} 本・変異体 ${r.mutants} 件 (Killed+Timeout / Survived / NoCoverage / Ignored / Error)`);
    for (const l of r.lines) console.log(l);
    return;
  }

  if (LIST) {
    const r = listNonKilled(data, FILE_FILTER);
    console.log(`# 殺されていない変異体 — 生存 ${r.survived} 件 / 未到達 ${r.noCoverage} 件 (${r.files} ファイル)`);
    for (const l of r.lines) console.log(l);
    return;
  }

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
        original: compact(sliceSource(info.source, m.location), 60),
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
    return;
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
}

module.exports = { compact, sliceSource, listNonKilled, summarizeFiles, main };

if (require.main === module) main(process.argv.slice(2));
