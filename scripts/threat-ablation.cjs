#!/usr/bin/env node
/*
 * **台帳の穴を、もう一度開けてみる。** (2026-10-30 · パス 565 · threat: T-226)
 *
 * 脅威台帳 (`security/threat-ledger.json`) の 224 件は、どれも「回帰検査」を名指しする
 * (`regression.file` / `regression.test`)。台帳の検査 (`threatLedger.test.ts`) が見ているのは
 * **その検査が在ること** —— ファイルが在り、題名が綴りどおりに書かれていること —— だけで、
 * **その検査が本当にその穴を見つけるか**は 1 度も測っていなかった。名前が在ることと、
 * 鳴ることは別である (法則 `mention-vs-declaration`)。
 *
 * この道具は、台帳の穴を 1 つずつ**実際に開け直す** —— 守りを直す前の形へ戻す書き換え
 * (`security/threat-ablations.json` の 1 行 = 1 つの「穴を開ける」) を原文へ当て、名指しされた
 * 回帰検査**だけ**を走らせ、その検査が落ちるかを見る。攻撃者が守りを 1 つ外した世界を、
 * 検査の側から再生する —— 実戦の側で言えば「守りが外れたことに、門は気付くか」である。
 *
 * ## 判定 (4 つを分ける —— 「非 0 で終わった」を「捕まえた」と読まない)
 *
 * - `caught`     名指しされた検査 (題名の `%s` は it.each の展開を許す) のどれかが **assertion で落ちた**
 * - `missed`     名指しされた検査が全部**通った** —— 穴が開いているのに鳴らない。**本物の報せ**
 * - `unmatched`  名指しされた題名の検査が 1 件も走らなかった (題名の綴り違い・skip) —— 道具の誤り
 * - `load-error` 検査ファイルが読み込めなかった (書き換えが構文を壊した) —— 道具の誤り
 *
 * `verify-survivors.cjs` は 2026-09-23 まで「非 0 終了 = 殺された」と読み、**壊れた書き換えを
 * 78 / 78 件『殺された』と報告していた** (パス 430)。同じ誤りをしないため、vitest の JSON 報告を
 * 読み、**名指しした題名の検査の状態**だけで判定する。走らせる前に**書き換えない原文**でも 1 度
 * 走らせ、その検査が通ることを確かめる (原文で落ちる検査は何も測れない —— `baseline-failed`)。
 *
 * ## 使い方
 *
 *   node scripts/threat-ablation.cjs check            # 静的な検め (書き換えは 1 回きり当たるか・台帳と一致するか)
 *   node scripts/threat-ablation.cjs run [--only T-052,T-089] [--json out.json]
 *
 * `run` は原文を書き換えるので CI の門には載せない (判定の時間も掛かる —— 1 件 5〜60 秒)。
 * 書き換えは必ず `finally` で戻し、**内容で照合**して戻ったことを確かめる (戻らなければ exit 2)。
 * 毎日の dependency-audit は `run` の結果を報告に載せる (落ちた物は要対応)。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const ABLATIONS = path.join(ROOT, 'security', 'threat-ablations.json');
const LEDGER = path.join(ROOT, 'security', 'threat-ledger.json');

/**
 * 書き換えて検査を走らせる木。既定は **git worktree** (今の変更を重ねた写し) で、利用者の作業ツリーには
 * 1 字も触れない —— 作業ツリーで当てると、測っている間は守りを外したファイルが「変更」に見え、
 * 誤ってコミットすると穴の開いたコードが branch に載る (2026-10-30 · パス 565 の 1 回目がそうだった)。
 * `--in-place` で作業ツリーを使う (git の無い所だけ)。
 */
let WORK = ROOT;

/** worktree を作り、作業ツリーの未コミットの変更 (追跡外も) を重ね、node_modules を繋ぐ。 */
function prepareWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablation-work-'));
  const tree = path.join(dir, 'tree');
  const git = (argv) => spawnSync('git', argv, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const add = git(['worktree', 'add', '--detach', '--quiet', tree, 'HEAD']);
  if (add.status !== 0) throw new Error(`git worktree add に失敗: ${String(add.stderr).trim()}`);
  const st = git(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const parts = String(st.stdout).split('\0').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i].slice(0, 2);
    const rel = parts[i].slice(3);
    if (code.startsWith('R') || code.startsWith('C')) i++; // 改名は次の欄が元の名前
    const from = path.join(ROOT, rel);
    const to = path.join(tree, rel);
    if (code.includes('D') || !fs.existsSync(from)) {
      fs.rmSync(to, { force: true });
      continue;
    }
    if (fs.statSync(from).isDirectory()) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tree, 'node_modules'), 'dir');
  return {
    root: tree,
    cleanup() {
      git(['worktree', 'remove', '--force', tree]);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** 1 回の vitest に許す時間。名指しのファイル 1 本だけを走らせるので、これを超えるのは固まったとき。 */
const RUN_TIMEOUT_MS = 10 * 60 * 1000;

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** 文字列 `hay` の中に `needle` が何回現れるか (重なりは数えない)。 */
function occurrences(hay, needle) {
  if (needle.length === 0) return 0;
  let n = 0;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) n++;
  return n;
}

/**
 * it / it.each の題名を、走った検査の題名に当てる正規表現にする。
 * `%s` `%d` `%i` `%j` `%o` `%#` `%%` `$name` は it.each が値で置き換えるので「何か」に当てる。
 */
function titlePattern(title) {
  const parts = String(title).split(/%[sdifjoO#%]|\$[A-Za-z_][A-Za-z0-9_.]*/);
  return parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+?');
}

/**
 * 台帳の名指しは**題名の一部**でよい (`threatLedger.test.ts` は `body.includes(test)` で確かめる —— 先頭の `★ ` や
 * 末尾の `(threat: T-xxx)` を省いて書く行が在る)。だから照合も部分一致にする。最初の版は題名全体の完全一致で、
 * 原文でも走る検査を「1 件も走らなかった」(baseline-unmatched) と 10 件誤って言った (2026-10-30 · パス 565)。
 */
function titleMatcher(title) {
  return new RegExp(titlePattern(title), 'u');
}

/** 1 行の書き換えの束。`find` / `replace` の 1 組でも、同じファイルへの `edits` の列でもよい。 */
function editsOf(a) {
  if (Array.isArray(a.edits)) return a.edits;
  return [{ find: a.find, replace: a.replace }];
}

/**
 * 静的な検め。CI の npm test (`threatAblationLedger.test.ts`) も同じ関数を通す。
 * @returns {string[]} 問題の文 (空なら健全)
 */
function staticProblems(ablations, ledger, readFile) {
  const problems = [];
  const threats = new Map((ledger.threats || []).map((t) => [t.id, t]));
  const ids = new Set();
  for (const a of ablations) {
    const where = `${a.id ?? '(id なし)'} (${a.threat ?? '?'})`;
    if (typeof a.id !== 'string' || !/^A-\d{3}$/.test(a.id)) problems.push(`${where}: id は A-000 の形`);
    if (ids.has(a.id)) problems.push(`${where}: id が重複`);
    ids.add(a.id);
    const t = threats.get(a.threat);
    if (t === undefined) {
      problems.push(`${where}: 台帳に無い脅威`);
      continue;
    }
    const regs = regressionsOf(t);
    if (regs.length === 0 || regs.some((r) => typeof r.file !== 'string' || typeof r.test !== 'string')) {
      problems.push(`${where}: 台帳の行が回帰検査を名指ししていない`);
    }
    if (typeof a.why !== 'string' || a.why.trim().length < 20) problems.push(`${where}: why (何を外すのか) が短い`);
    let text;
    try {
      text = readFile(a.file);
    } catch {
      problems.push(`${where}: ${a.file} が読めない`);
      continue;
    }
    const edits = editsOf(a);
    if (edits.length === 0) problems.push(`${where}: 書き換えが 1 つも無い`);
    for (const [i, e] of edits.entries()) {
      if (typeof e.find !== 'string' || typeof e.replace !== 'string') {
        problems.push(`${where}: 書き換え ${i + 1} の find / replace は文字列`);
        continue;
      }
      if (e.find === e.replace) problems.push(`${where}: 書き換え ${i + 1} の find と replace が同じ (何も外さない)`);
      const n = occurrences(text, e.find);
      if (n !== 1) {
        problems.push(`${where}: ${a.file} に書き換え ${i + 1} の find が ${n} 回現れる (ちょうど 1 回のはず —— 守りの形が変わったら書き換えも直す)`);
      }
    }
  }
  return problems;
}

/** 追跡している検査ファイルのうち、本文に `name` を持つ物 (WORK からの相対パス)。 */
function testFilesMentioning(name) {
  const ls = spawnSync('git', ['ls-files', '-z', '--', '*.test.ts', '*.test.tsx'], { cwd: WORK, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return String(ls.stdout)
    .split('\0')
    .filter(Boolean)
    .filter((rel) => {
      try {
        return fs.readFileSync(path.join(WORK, rel), 'utf8').includes(name);
      } catch {
        return false;
      }
    });
}

/**
 * 名指しの検査が鳴らなかった (missed) 書き換えについて、**ほかに鳴る検査が在るか**を探す。
 * 書き換えた状態で `vitest related <書き換えたファイル>` を走らせ、落ちた検査の場所と題名を出す。
 * 鳴る検査が在ればそれを台帳の alsoRegressions に名指す。無ければ検査を足す —— その穴は今、何にも見られていない。
 */
function triage(ablations, ledger, args) {
  const chosen = ablations.filter((a) => args.only !== null && (args.only.has(a.threat) || args.only.has(a.id)));
  if (chosen.length === 0) {
    console.error('triage は --only で書き換えを名指す');
    return 2;
  }
  const threats = new Map(ledger.threats.map((t) => [t.id, t]));
  const found = [];
  for (const a of chosen) {
    const abs = path.join(WORK, a.file);
    const original = fs.readFileSync(abs, 'utf8');
    let failed = [];
    let scope = 'sibling';
    try {
      fs.writeFileSync(abs, applyEdits(original, editsOf(a)));
      // 1 段目: 名指しの検査ファイルを丸ごと (隣の検査) —— 名指しが同じファイルの別の it を指し損ねている形が多い。
      const files = [...new Set(regressionsOf(threats.get(a.threat)).map((r) => r.file))];
      failed = failedTests(['vitest', 'run', ...files]);
      // 2 段目: 鳴らなければ、そのファイルに繋がる検査と、名前を本文に持つ検査へ広げる。
      // (`vitest related` は import の繋がりしか辿らない —— fs で読まれる YAML / JSON / SVG は名前で探す)
      if (failed !== null && failed.length === 0) {
        scope = 'related';
        failed = failedTests(['vitest', 'related', a.file, ...testFilesMentioning(path.basename(a.file)), '--run']);
      }
    } finally {
      fs.writeFileSync(abs, original);
    }
    if (fs.readFileSync(abs, 'utf8') !== original) {
      console.error(`✗✗ ${a.file} を元へ戻せなかった —— 手で戻すこと`);
      return 2;
    }
    found.push({ id: a.id, threat: a.threat, scope, measured: failed !== null, failed: failed ?? [] });
    console.log(`${a.id} ${a.threat}: ${failed === null ? '測れなかった' : `${scope === 'sibling' ? '名指しのファイルの中で' : '関係する検査全体で'}落ちた検査 ${failed.length} 件`}`);
    for (const f of (failed ?? []).slice(0, 8)) console.log(`   - ${f.file} :: ${f.test}`);
  }
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(found, null, 2) + '\n');
  return 0;
}

/** vitest を走らせ、落ちた検査 (場所と題名) を返す。報告が読めなければ null。 */
function failedTests(argv) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ablation-triage-')), 'report.json');
  spawnSync('npx', [...argv, '--reporter=json', `--outputFile=${out}`], {
    cwd: WORK,
    env: { ...process.env, CI: '' },
    encoding: 'utf8',
    timeout: RUN_TIMEOUT_MS * 3,
    maxBuffer: 64 * 1024 * 1024,
  });
  let report = null;
  try {
    report = JSON.parse(fs.readFileSync(out, 'utf8'));
  } catch {
    report = null;
  }
  fs.rmSync(path.dirname(out), { recursive: true, force: true });
  if (report === null) return null;
  const failed = [];
  for (const file of report.testResults ?? []) {
    for (const r of file.assertionResults ?? []) {
      if (r.status === 'failed') failed.push({ file: path.relative(WORK, file.name), test: r.title });
    }
  }
  return failed;
}

/** 書き換えを順に当てる (どれも 1 回きり当たることは staticProblems が先に確かめている)。 */
function applyEdits(text, edits) {
  let out = text;
  for (const e of edits) out = out.replace(e.find, () => e.replace);
  return out;
}

/** vitest を名指しの 1 ファイル・名指しの題名だけで走らせ、JSON 報告を返す。 */
function runVitest(file, title) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ablation-')), 'report.json');
  const res = spawnSync(
    'npx',
    ['vitest', 'run', file, '-t', titlePattern(title), '--reporter=json', `--outputFile=${out}`],
    // CI を空にする: vitest.config.ts は CI のとき失敗した検査を 2 回やり直すので、
    // 1 回目で状態を消費する検査が「通った」に化ける (パス 501 の実測)。
    { cwd: WORK, env: { ...process.env, CI: '' }, encoding: 'utf8', timeout: RUN_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
  );
  let report = null;
  try {
    report = JSON.parse(fs.readFileSync(out, 'utf8'));
  } catch {
    report = null;
  }
  fs.rmSync(path.dirname(out), { recursive: true, force: true });
  return { status: res.status, signal: res.signal, report, stderr: String(res.stderr || '').slice(-2000) };
}

/**
 * vitest の JSON 報告から判定を出す (純関数 —— 検査が標本で留める)。
 * @returns {{verdict: 'caught'|'missed'|'unmatched'|'load-error', matched: number, failed: number, message?: string}}
 */
function verdictOf(report, title) {
  if (report === null || !Array.isArray(report.testResults)) {
    return { verdict: 'load-error', matched: 0, failed: 0, message: 'vitest の報告が読めない' };
  }
  const re = titleMatcher(title);
  let matched = 0;
  let failed = 0;
  let loadMessage;
  for (const file of report.testResults) {
    const results = Array.isArray(file.assertionResults) ? file.assertionResults : [];
    if (file.status === 'failed' && results.length === 0) loadMessage = String(file.message || '').slice(0, 400);
    for (const r of results) {
      // 名指しは it の題名でも、それを囲む describe の題名でもよい (describe なら中の検査を全部数える)。
      const ancestors = Array.isArray(r.ancestorTitles) ? r.ancestorTitles.map(String) : [];
      if (!re.test(String(r.title)) && !ancestors.some((t) => re.test(t))) continue;
      if (r.status === 'skipped' || r.status === 'pending' || r.status === 'todo') continue;
      matched++;
      if (r.status === 'failed') failed++;
    }
  }
  if (loadMessage !== undefined && matched === 0) return { verdict: 'load-error', matched, failed, message: loadMessage };
  if (matched === 0) return { verdict: 'unmatched', matched, failed };
  return { verdict: failed > 0 ? 'caught' : 'missed', matched, failed };
}

/** 台帳の行が名指す回帰検査すべて (主の 1 つ + 残りの層 `alsoRegressions`)。 */
function regressionsOf(threat) {
  if (!threat || !threat.regression) return [];
  return [threat.regression, ...(Array.isArray(threat.alsoRegressions) ? threat.alsoRegressions : [])];
}

/**
 * 名指しの回帰検査が複数在るときの判定 (純関数)。どれか 1 つが落ちれば捕まえた ——
 * 穴を開けた層を見ている検査が 1 つ在れば、その穴は鳴る。どれも落ちなければ、
 * 道具の誤り (load-error / unmatched) を missed より先に言う (測れていない物を「鳴らない」と言わない)。
 */
function combineVerdicts(list) {
  const matched = list.reduce((n, v) => n + v.matched, 0);
  const failed = list.reduce((n, v) => n + v.failed, 0);
  if (list.some((v) => v.verdict === 'caught')) return { verdict: 'caught', matched, failed };
  const broken = list.find((v) => v.verdict === 'load-error' || v.verdict === 'unmatched');
  if (broken !== undefined) return { verdict: broken.verdict, matched, failed, ...(broken.message ? { message: broken.message } : {}) };
  return { verdict: 'missed', matched, failed };
}

function parseArgs(argv) {
  const out = { cmd: argv[0] ?? 'check', only: null, json: null, report: false, inPlace: false };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--only') out.only = new Set(String(argv[++i] ?? '').split(',').filter(Boolean));
    else if (argv[i] === '--json') out.json = argv[++i] ?? null;
    // 毎日の報告から走らせる形: 捕まえ損ねは報告 (Issue) が言うので exit 0。道具の誤りだけ非 0。
    else if (argv[i] === '--report') out.report = true;
    else if (argv[i] === '--in-place') out.inPlace = true;
  }
  return out;
}

/**
 * 毎日の報告に載せる状態 (純関数)。`summary` は `run --json` の出力、読めなければ null。
 * 要対応: 捕まえ損ね (missed) と道具の誤り (unmatched / load-error / baseline-*) の 1 件ずつ・
 * 測れなかったこと・書き換えが古びたこと (staticProblems)。
 */
function ablationStatus(summary, ablations, ledger, staticList) {
  const threatsTotal = (ledger.threats || []).filter((t) => t.status !== 'accepted').length;
  const ablated = new Set(ablations.map((a) => a.threat)).size;
  const problems = [...staticList];
  if (summary === null || !Array.isArray(summary.rows)) {
    problems.push('台帳の穴の開け直しを測れなかった (`npm run audit:threat-ablation` の結果が無い・読めない)');
    return { measured: false, caught: 0, total: 0, notCaught: [], ablated, threatsTotal, problems, actionable: problems.length };
  }
  const notCaught = summary.rows.filter((r) => r.verdict !== 'caught');
  if (summary.rows.length < ablations.length) {
    problems.push(`開け直したのは ${summary.rows.length} 件で、台帳の ${ablations.length} 件に足りない (途中で止まった)`);
  }
  return {
    measured: true,
    caught: summary.rows.length - notCaught.length,
    total: summary.rows.length,
    notCaught,
    ablated,
    threatsTotal,
    problems,
    actionable: notCaught.length + problems.length,
  };
}

function renderAblation(st) {
  const lines = ['### 台帳の穴を開け直す (回帰検査の精度)', ''];
  if (st.measured) {
    lines.push(`- ${st.notCaught.length === 0 ? '✅' : '❌'} 開け直した ${st.total} 件のうち、名指しの回帰検査が捕まえたのは **${st.caught} 件**`);
  }
  lines.push(`- 開け直す書き換えを持つ脅威 ${st.ablated} / 台帳の ${st.threatsTotal} 件`);
  for (const r of st.notCaught) lines.push(`- ❌ \`${r.id}\` ${r.threat}: **${r.verdict}** —— 穴を開けても名指しの検査が${r.verdict === 'missed' ? '鳴らない (検査を強めるか、その層を見る検査を alsoRegressions に名指す)' : '測れていない (道具か書き換えの誤り)'}`);
  for (const p of st.problems) lines.push(`- ❌ ${p}`);
  lines.push('', '_書き換えは `security/threat-ablations.json`。1 行 = 守りを直す前の形へ戻す 1 つの穴 (threat: T-226)。_');
  return lines.join('\n');
}

function main(argv) {
  const args = parseArgs(argv);
  const { ablations } = readJson(ABLATIONS);
  const ledger = readJson(LEDGER);
  const readFile = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const problems = staticProblems(ablations, ledger, readFile);
  if (problems.length > 0) {
    for (const p of problems) console.error(`✗ ${p}`);
    return 1;
  }
  if (args.cmd === 'check') {
    console.log(`✓ 穴を開ける書き換え ${ablations.length} 件 (脅威 ${new Set(ablations.map((a) => a.threat)).size} 件) はどれも 1 回きり当たる`);
    return 0;
  }
  if (args.cmd !== 'run' && args.cmd !== 'triage') {
    console.error(`知らない命令: ${args.cmd} (check | run | triage)`);
    return 2;
  }
  const ws = args.inPlace ? null : prepareWorkspace();
  if (ws !== null) WORK = ws.root;
  try {
    return args.cmd === 'triage' ? triage(ablations, ledger, args) : runAll(ablations, ledger, args);
  } finally {
    if (ws !== null) ws.cleanup();
    WORK = ROOT;
  }
}

function runAll(ablations, ledger, args) {
  const threats = new Map(ledger.threats.map((t) => [t.id, t]));
  const chosen = ablations.filter((a) => args.only === null || args.only.has(a.threat) || args.only.has(a.id));
  const baselines = new Map();
  const rows = [];
  for (const a of chosen) {
    const regs = regressionsOf(threats.get(a.threat));
    const bases = regs.map((reg) => {
      const key = `${reg.file}\u0000${reg.test}`;
      if (!baselines.has(key)) {
        const b = verdictOf(runVitest(reg.file, reg.test).report, reg.test);
        // 原文では検査が「通る」= missed の形でなければならない。
        baselines.set(key, b.verdict === 'missed' ? 'ok' : `baseline-${b.verdict === 'caught' ? 'failed' : b.verdict}`);
      }
      return baselines.get(key);
    });
    const base = bases.find((b) => b !== 'ok');
    if (base !== undefined) {
      rows.push({ id: a.id, threat: a.threat, verdict: base, file: a.file });
      console.log(`… ${a.id} ${a.threat}: ${base}`);
      continue;
    }
    const abs = path.join(WORK, a.file);
    const original = fs.readFileSync(abs, 'utf8');
    let result;
    try {
      fs.writeFileSync(abs, applyEdits(original, editsOf(a)));
      result = combineVerdicts(regs.map((reg) => ({ test: reg.test, ...verdictOf(runVitest(reg.file, reg.test).report, reg.test) })));
    } finally {
      fs.writeFileSync(abs, original);
    }
    if (fs.readFileSync(abs, 'utf8') !== original) {
      console.error(`✗✗ ${a.file} を元へ戻せなかった —— 手で戻すこと`);
      return 2;
    }
    rows.push({ id: a.id, threat: a.threat, file: a.file, ...result });
    console.log(`${result.verdict === 'caught' ? '✓' : '✗'} ${a.id} ${a.threat}: ${result.verdict} (名指しの検査 ${result.matched} 件のうち ${result.failed} 件が落ちた)${result.message ? ` —— ${result.message}` : ''}`);
  }
  const bad = rows.filter((r) => r.verdict !== 'caught');
  const summary = {
    measuredAt: new Date().toISOString(),
    total: rows.length,
    caught: rows.length - bad.length,
    notCaught: bad.map((r) => ({ id: r.id, threat: r.threat, verdict: r.verdict })),
    rows,
  };
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(summary, null, 2) + '\n');
  console.log(`\n穴を開け直した ${rows.length} 件のうち、名指しの回帰検査が捕まえたのは ${summary.caught} 件`);
  if (args.report) return 0;
  return bad.length === 0 ? 0 : 1;
}

module.exports = { ablationStatus, renderAblation, regressionsOf, combineVerdicts, editsOf, applyEdits, occurrences, titlePattern, titleMatcher, staticProblems, verdictOf, parseArgs, RUN_TIMEOUT_MS };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
