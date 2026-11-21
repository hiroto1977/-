#!/usr/bin/env node
/**
 * Python ソースの静的検査 (bandit の高信頼な部分集合)。
 *
 * local-ai/orchestrator に .py が入った日、言語の網羅 (T-187) は
 * 「起動子 (uvx) だけの網はソースを見ない」で落ちた。足す守りは
 * ファイルを ci.yml で見ること。依存の定義ファイルはまだ無いので、
 * PyPI を OSV に引く段は定義ファイルが入った日に回す。
 *
 * 見るのは、文字列をコードとして走らせる形と、シェル経由の実行と、
 * 復元時に任意コードが走る形。偽陽性の多い「高エントロピー」や
 * スタイルは入れない。
 *
 * Run: node scripts/lint-python.cjs
 *      node scripts/lint-python.cjs --self-test
 *      npm run lint:python
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { gitLsFilesOrNull } = require('./lib/tracked-cross-check.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');

/** 走査が 0 件で「問題なし」と読まない。ソースが消えたら言語の網羅側で直す。 */
const MIN_PY_FILES = 1;

/**
 * 行のコード部分。文字列リテラルと `#` 以降は見ない
 * (説明文に書いた呼び出しを違反にしない)。三重引用は見ない —— 今日の .py は使っていない。
 */
function codePortion(line) {
  let out = '';
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote !== '') {
      if (c === '\\') {
        i += 1;
        continue;
      }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '#') break;
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    out += c;
  }
  return out;
}

const RULES = [
  { id: 'eval', re: /(?<![\w.])eval\s*\(/, what: 'eval は文字列をコードとして走らせる' },
  { id: 'exec', re: /(?<![\w.])exec\s*\(/, what: 'exec は文字列をコードとして走らせる' },
  { id: 'os-system', re: /\bos\.(?:system|popen)\s*\(/, what: 'os.system / os.popen はシェル経由で実行する' },
  { id: 'shell-true', re: /\bshell\s*=\s*True\b/, what: 'shell=True はシェル経由で実行する' },
  { id: 'pickle', re: /\bpickle\.(?:loads?|Unpickler)\s*\(/, what: 'pickle の復元は任意コードを走らせうる' },
  { id: 'yaml-load', re: /\byaml\.load\s*\(/, what: 'yaml.load は SafeLoader が無いと任意オブジェクトを作る' },
  { id: 'dunder-import', re: /(?<![\w.])__import__\s*\(/, what: '__import__ は名前を実行時に決めて読み込む' },
];

function scanText(text) {
  const hits = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const code = codePortion(lines[i]);
    for (const rule of RULES) {
      if (rule.id === 'yaml-load' && /SafeLoader/.test(code)) continue;
      if (rule.re.test(code)) hits.push({ line: i + 1, id: rule.id, what: rule.what });
    }
  }
  return hits;
}

function pyFiles() {
  const listed = gitLsFilesOrNull(REPO_ROOT, ['--', '*.py']);
  if (listed === null) return null;
  return listed.filter((f) => f.endsWith('.py')).sort();
}

function selfTest() {
  const cases = [
    ['素の関数呼び出しは鳴らない', 'def f():\n    return 1\n', 0],
    ['re.compile は鳴らない', 'import re\nre.compile(r"a")\n', 0],
    ['注釈の eval は鳴らない', '# ev' + 'al("1")\n', 0],
    ['文字列の中の exec は鳴らない', 'x = "exec(bad)"\n', 0],
    ['eval は鳴る', 'ev' + 'al("1")\n', 1],
    ['exec は鳴る', 'exec("1")\n', 1],
    ['os.system は鳴る', 'os.system("ls")\n', 1],
    ['os.popen は鳴る', 'os.popen("ls")\n', 1],
    ['shell=True は鳴る', 'subprocess.run(cmd, shell=True)\n', 1],
    ['pickle.loads は鳴る', 'pickle.loads(b"")\n', 1],
    ['yaml.load は鳴る', 'yaml.load(s)\n', 1],
    ['SafeLoader 付きの yaml.load は鳴らない', 'yaml.load(s, Loader=yaml.SafeLoader)\n', 0],
    ['__import__ は鳴る', '__import__("os")\n', 1],
  ];
  let bad = 0;
  for (const [label, src, expected] of cases) {
    const n = scanText(src).length;
    const ok = n === expected;
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${n} 件 (期待 ${expected})`);
  }
  if (bad > 0) {
    console.error(`❌ self-test ${bad} 件失敗`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const files = pyFiles();
  if (files === null) {
    console.error('❌ git ls-files が読めませんでした (fail closed)');
    return 1;
  }
  if (files.length < MIN_PY_FILES) {
    console.error(`❌ .py を ${files.length} 本しか拾えませんでした (${MIN_PY_FILES} 本以上を期待)。走査が壊れています。`);
    return 1;
  }
  const failures = [];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    for (const hit of scanText(text)) {
      failures.push(`${rel}:${hit.line}: ${hit.id} — ${hit.what}`);
    }
  }
  if (failures.length > 0) {
    console.error(`❌ Python の静的検査 ${failures.length} 件:`);
    for (const f of failures) console.error(`  ${f}`);
    return 1;
  }
  console.log(`✅ Python ${files.length} 本: 任意コード・シェル経由の実行は見当たらない`);
  return 0;
}

module.exports = { scanText, codePortion, RULES, MIN_PY_FILES };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
