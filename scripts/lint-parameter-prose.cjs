#!/usr/bin/env node
'use strict';

/*
 * 画面の文言が、計算に使っていない数字を名乗るのを止める (`npm run lint:parameter-prose`)。
 *
 * ## なぜ要るのか
 *
 * `src/shared/parameters.ts` の台帳に載せた値は、利用者が設定で上書きできる。
 * 計算は `useParameters()` の有効値を受け取るが、**説明文や警告文がモジュールの
 * 既定定数を直接刷っている**と、上書きした瞬間に**画面が自分の計算と違う数字を
 * 名乗る**。「設定できるのに効かない」の裏返しで、こちらは**効いているのに
 * 画面が古い数字で説明する**。
 *
 * 2026-09-06 の 1 日で 5 件見つかった:
 *
 *   - 経営分析の消費税 card: 免税・簡易課税の境目を注記が固定値で刷っていた (2 件)
 *   - 税務ページ ⑩: 「令和8年分まで」を書き写していた (これは日付・別ゲート)
 *   - 税務ページ ⑩-3: 全額控除の要件 (課税売上割合 95% 以上・課税売上高 5 億円以下) を
 *     3 か所で固定値から刷っており、**判定は上書きされた値で行っていた**。
 *     割合の境目を 90% にした利用者には、**⚠ 警告が「割合 95% 未満」と嘘を言う**
 *     (警告そのものは 90% で発火している)
 *
 * 文言を直すだけでは次に足す人が同じ穴に落ちるので、**使用そのものを台帳にする**。
 *
 * ## 規則
 *
 *   1. 走査が生きている (台帳の裏づけ定数・走査ファイルが床以上)
 *   2. renderer で台帳の裏づけ定数を**直接**使う箇所は、すべて `ALLOWED` に在る
 *   3. `ALLOWED` の行はすべて実在する (直したのに登録が残らない)
 *   4. どの行にも理由が書いてある
 *
 * **既定への倒し込みは規則の外**。`?? CONST`、`|| CONST`、既定引数 `x: T = CONST`、
 * 「上書きされているか」を見る `=== CONST` / `!== CONST` は、いずれも
 * **既定そのものについての式**なので画面が嘘をつく形にならない。
 *
 * ## 評価は純関数
 *
 * `evaluate({ files, names, allowed })` は読み込み済みの `[{ path, text }]` だけを見る。
 * self-test が合成ソースを流し込めるようにするためで、「注入できないから試せない枝」を
 * 作らないという `lint:storage` と同じ置き方。
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const LEDGER = path.join(REPO_ROOT, 'src/shared/parameters.ts');
const SCAN_DIR = path.join(REPO_ROOT, 'src/renderer');

/** 走査が死んで 0 件になったのを「違反なし」と読まないための床。 */
const MIN_NAMES = 90;
const MIN_FILES = 200;

/**
 * 直接使ってよい箇所の台帳。`file` は repo 相対、`name` は定数、`why` は理由。
 *
 * ここに載るのは「既定への倒し込みでもないのに直接使う」箇所だけである。
 * 倒し込み (`??` など) は規則の外なので登録しない —— 登録すると台帳が
 * 200 行になり、**読まれなくなる**。
 */
const ALLOWED = [
  {
    file: 'src/renderer/data/financialRatios.ts',
    name: 'RADAR_AXIS_BANDS',
    why: '上書きされた帯が退化 (good === bad) しているときの倒し込み。三項なので ?? の形に書けない',
  },
];

/** 台帳が import している定数名 = 利用者が上書きできる値の裏づけ。 */
function ledgerNames(ledgerText) {
  const names = new Set();
  for (const m of ledgerText.matchAll(/import \{([\s\S]*?)\} from '[^']+';/g)) {
    for (const raw of m[1].split(',')) {
      const id = raw.trim().replace(/^type\s+/, '');
      if (/^[A-Z][A-Z0-9_]*$/.test(id)) names.add(id);
    }
  }
  return names;
}

/**
 * コメントと import / export の `{ }` の中を落として、コードの行だけ返す。
 *
 * import の一覧を数えてしまうと**全部が違反になる**ので、ここを外すのが要点。
 * 複数行の import があるため、`}` まで読み飛ばす状態を持つ。
 */
function codeLines(text) {
  const out = [];
  let inBraceList = false;
  let inBlockComment = false;
  text.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (inBlockComment) {
      if (t.includes('*/')) inBlockComment = false;
      return;
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) inBlockComment = true;
      return;
    }
    if (t.startsWith('//') || t.startsWith('*')) return;
    if (inBraceList) {
      if (t.includes('}')) inBraceList = false;
      return;
    }
    if (/^(import|export)\s*\{/.test(t)) {
      if (!t.includes('}')) inBraceList = true;
      return;
    }
    if (/^(import|export)\b/.test(t)) return;
    out.push({ line: i + 1, text: line });
  });
  return out;
}

/**
 * 既定への倒し込み・既定との比較か (規則の外)。
 *
 * 許すのは `?? CONST` / `|| CONST` / 既定引数 `x: T = CONST` / `=== CONST` / `!== CONST` の
 * 5 形だけで、**三項 (`cond ? CONST : x`) は許さない** —— JSX の中で
 * `{cond ? CONST : other}` と書けば刷れてしまい、倒し込みと見分けが付かないため。
 * 三項で倒し込むなら台帳に理由を書く。
 *
 * さらに **その行に定数が 2 回以上出れば許さない**。`effective === CONST ? '既定' : CONST`
 * のように、許される形の隣で刷る抜け道を塞ぐ (行単位の検査なので、ここを見ないと
 * 1 つ目の形だけで行全体が通ってしまう)。
 */
function isDefaultUse(line, name) {
  const occurrences = (line.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length;
  if (occurrences !== 1) return false;
  const allowed = [
    `\\?\\?\\s*${name}\\b`,
    `\\|\\|\\s*${name}\\b`,
    `:\\s*[A-Za-z<>\\[\\]]+\\s*=\\s*${name}\\b`,
    `[=!]==\\s*${name}\\b`,
    `\\b${name}\\b\\s*[=!]==`,
  ];
  return allowed.some((re) => new RegExp(re).test(line));
}

/** その定数を import している名前の集合 (同名の別物を掴まないため)。 */
function importedNames(text) {
  const set = new Set();
  for (const m of text.matchAll(/import \{([\s\S]*?)\} from '[^']*'/g)) {
    for (const raw of m[1].split(',')) set.add(raw.trim().replace(/^type\s+/, ''));
  }
  return set;
}

function scan({ files, names }) {
  const direct = [];
  for (const f of files) {
    const imported = importedNames(f.text);
    for (const { line, text } of codeLines(f.text)) {
      for (const name of names) {
        if (!imported.has(name)) continue;
        if (!new RegExp(`\\b${name}\\b`).test(text)) continue;
        if (isDefaultUse(text, name)) continue;
        direct.push({ file: f.path, line, name, text: text.trim() });
      }
    }
  }
  return direct;
}

function evaluate(input) {
  const names = input.names ?? new Set();
  const files = input.files ?? [];
  const allowed = input.allowed ?? ALLOWED;
  const problems = [];

  if (names.size < MIN_NAMES) {
    problems.push(
      `台帳の裏づけ定数が ${names.size} 件しか取れていません (床 ${MIN_NAMES})。` +
        'parameters.ts の import の書き方が変わって走査が死んでいる可能性があります',
    );
  }
  if (files.length < MIN_FILES) {
    problems.push(`走査したファイルが ${files.length} 件しかありません (床 ${MIN_FILES})。走査が死んでいます`);
  }

  const direct = scan({ files, names });
  const key = (r) => `${r.file} :: ${r.name}`;
  const allowedKeys = new Set(allowed.map(key));
  const seen = new Set();

  for (const r of direct) {
    seen.add(key(r));
    if (allowedKeys.has(key(r))) continue;
    problems.push(
      `${r.file}:${r.line} が ${r.name} を直接使っています。` +
        '設定で上書きできる値なので、画面は有効値 (useParameters() 由来) を読んでください。' +
        `既定への倒し込みなら ?? か既定引数の形に書き、それ以外の理由があるなら ALLOWED に理由つきで登録してください — ${r.text.slice(0, 90)}`,
    );
  }
  for (const a of allowed) {
    if (!seen.has(key(a))) {
      problems.push(`ALLOWED の登録が実在しません (直したあとの置き忘れ): ${a.file} :: ${a.name}`);
    }
    if (typeof a.why !== 'string' || a.why.trim().length < 15) {
      problems.push(`ALLOWED の理由が短すぎます: ${a.file} :: ${a.name}`);
    }
  }
  return problems;
}

function readSources(dir = SCAN_DIR) {
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__') walk(p);
      } else if (/\.tsx?$/.test(e.name)) {
        files.push({ path: path.relative(REPO_ROOT, p), text: fs.readFileSync(p, 'utf8') });
      }
    }
  })(dir);
  return files;
}

function selfTest() {
  const names = new Set(['RATIO_LIMIT', 'SALES_LIMIT']);
  const pad = (n) => Array.from({ length: n }, (_, i) => ({ path: `pad/${i}.ts`, text: '' }));
  const base = (text) => [{ path: 'src/renderer/pages/P.tsx', text }].concat(pad(MIN_FILES));
  const bigNames = new Set([...names, ...Array.from({ length: MIN_NAMES }, (_, i) => `N${i}`)]);
  const run = (text, allowed = []) =>
    evaluate({ files: base(text), names: bigNames, allowed }).filter((p) => p.includes('RATIO_LIMIT') || p.includes('SALES_LIMIT'));

  const cases = [
    [
      '★ 文言が既定定数を刷っていれば鳴る',
      "import { RATIO_LIMIT } from '../../shared/x';\nconst el = <b>割合 {RATIO_LIMIT * 100}% 以上</b>;\n",
      1,
    ],
    [
      '★ 警告文の中でも鳴る (2 つ在れば 2 件)',
      "import { RATIO_LIMIT, SALES_LIMIT } from '../../shared/x';\nconst w = `割合 ${RATIO_LIMIT}% 未満、売上 ${SALES_LIMIT} 超`;\n",
      2,
    ],
    [
      '対照: ?? の倒し込みは鳴らない',
      "import { RATIO_LIMIT } from '../../shared/x';\nconst limit = p?.ratio ?? RATIO_LIMIT;\n",
      0,
    ],
    [
      '対照: || の倒し込みも鳴らない',
      "import { RATIO_LIMIT } from '../../shared/x';\nconst limit = p.ratio || RATIO_LIMIT;\n",
      0,
    ],
    [
      '対照: 既定引数は鳴らない',
      "import { RATIO_LIMIT } from '../../shared/x';\nexport function f(ratio: number = RATIO_LIMIT): number { return ratio; }\n",
      0,
    ],
    [
      '対照: 「既定のままか」の比較は鳴らない',
      "import { RATIO_LIMIT } from '../../shared/x';\nconst isDefault = effective === RATIO_LIMIT;\n",
      0,
    ],
    [
      '対照: import の一覧は鳴らない (複数行でも)',
      "import {\n  RATIO_LIMIT,\n  SALES_LIMIT,\n} from '../../shared/x';\nconst n = 1;\n",
      0,
    ],
    [
      '対照: 注記の中で名前に触れても鳴らない',
      "import { RATIO_LIMIT } from '../../shared/x';\n/** 既定は RATIO_LIMIT。 */\n// RATIO_LIMIT を刷らない\nconst n = 1;\n",
      0,
    ],
    [
      '対照: import していない同名の語は鳴らない',
      'const RATIO_LIMIT_TEXT = "割合";\nconst el = RATIO_LIMIT_TEXT;\n',
      0,
    ],
    [
      '★ 許される形の隣で刷っていれば鳴る (行に 2 回出る)',
      "import { RATIO_LIMIT } from '../../shared/x';\nconst s = effective === RATIO_LIMIT ? '既定' : String(RATIO_LIMIT);\n",
      1,
    ],
    [
      '★ 三項の倒し込みは台帳が要る (JSX で刷るのと見分けが付かない)',
      "import { RATIO_LIMIT } from '../../shared/x';\nconst b = degenerate ? RATIO_LIMIT : band;\n",
      1,
    ],
    [
      '台帳に登録すれば通る',
      "import { RATIO_LIMIT } from '../../shared/x';\nconst el = <b>{RATIO_LIMIT}</b>;\n",
      0,
      [{ file: 'src/renderer/pages/P.tsx', name: 'RATIO_LIMIT', why: '既定そのものを見せる欄なので直接でよい' }],
    ],
  ];

  let bad = 0;
  for (const [label, text, expected, allowed] of cases) {
    const got = run(text, allowed ?? []).length;
    const ok = got === expected;
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${expected})`);
  }

  // 台帳の置き忘れ・理由の短さ・床。
  const extra = [
    [
      '★ ALLOWED に実在しない登録が残っていれば鳴る',
      () =>
        evaluate({
          files: base('const n = 1;\n'),
          names: bigNames,
          allowed: [{ file: 'src/renderer/pages/Gone.tsx', name: 'RATIO_LIMIT', why: '消したのに登録が残っている例' }],
        }).filter((p) => p.includes('実在しません')).length,
      1,
    ],
    [
      '★ ALLOWED の理由が短ければ鳴る',
      () =>
        evaluate({
          files: base("import { RATIO_LIMIT } from '../../shared/x';\nconst el = <b>{RATIO_LIMIT}</b>;\n"),
          names: bigNames,
          allowed: [{ file: 'src/renderer/pages/P.tsx', name: 'RATIO_LIMIT', why: '短い' }],
        }).filter((p) => p.includes('理由が短')).length,
      1,
    ],
    [
      '★ 定数が取れなければ鳴る (走査の死)',
      () => evaluate({ files: base('const n = 1;\n'), names: new Set(['RATIO_LIMIT']), allowed: [] }).filter((p) => p.includes('裏づけ定数')).length,
      1,
    ],
    [
      '★ ファイルが少なすぎれば鳴る (走査の死)',
      () => evaluate({ files: [{ path: 'a.ts', text: '' }], names: bigNames, allowed: [] }).filter((p) => p.includes('走査したファイル')).length,
      1,
    ],
    [
      '実物の parameters.ts から 90 件以上の定数が取れる',
      () => (ledgerNames(fs.readFileSync(LEDGER, 'utf8')).size >= MIN_NAMES ? 1 : 0),
      1,
    ],
    [
      '実物の renderer では違反 0 件',
      () => evaluate({ files: readSources(), names: ledgerNames(fs.readFileSync(LEDGER, 'utf8')) }).length,
      0,
    ],
  ];
  for (const [label, fn, expected] of extra) {
    const got = fn();
    const ok = got === expected;
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${expected})`);
  }

  if (bad > 0) {
    console.error(`❌ self-test ${bad} 件が期待と違います`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const names = ledgerNames(fs.readFileSync(LEDGER, 'utf8'));
  const files = readSources();
  const problems = evaluate({ files, names });
  console.log(
    `Scanned ${files.length} renderer file(s) for ${names.size} ledger-backed constant(s) — ` +
      `台帳 (直接使用の許可) ${ALLOWED.length} 件`,
  );
  if (problems.length === 0) {
    console.log('✅ 画面が刷る数字は、計算に使う有効値と同じ出所です');
    return 0;
  }
  console.error(`❌ ${problems.length} 件:`);
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { evaluate, scan, codeLines, ledgerNames, isDefaultUse, ALLOWED, MIN_NAMES, MIN_FILES };
