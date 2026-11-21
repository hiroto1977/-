#!/usr/bin/env node
/*
 * 言語の網羅 (language coverage) —— 新しい言語・依存の生態系が入っても、検査の網が追随しない状態を
 * 作らない (2026-10-25 · threat: T-187)。
 *
 * 発想: 『すべての言語の脆弱性を先回りして探す』ことは、誰にもできない (言語は無数にあり、
 * このアプリが使わない言語の弱点は、このアプリの弱点ではない)。できて、しかも意味があるのは次の 2 つ。
 *   ① 今このリポジトリに**在る**言語と、実際に走る起動子 (MCP の npx / uvx ほか) と、依存の
 *      生態系 (npm ほか) を、**追跡している実物から導き**、それぞれを見張る強制物を台帳に載せる
 *   ② 新しい言語・生態系が**入った瞬間に落ちる** (網が無いまま増えない)。落ちる文は、その言語で
 *      足すべき守り (`ifAdded` の一覧) を名指しする —— 検知と対策の入口が同時に出る。
 *
 * この関数が確かめるのは次の 7 つ (純関数・網にも AI にも触れない):
 *  1. 追跡している実物の拡張子を言語へ引き、台帳に載っていない言語が 1 件でも在れば要対応 (tripwire)
 *  2. 台帳の `present` の言語が実物に 1 件も無ければ古い (双方向)
 *  3. `present` の言語は、実在する強制物 (scanners) を 1 つ以上持つ
 *  4. 依存の定義ファイル (package-lock.json / requirements.txt / go.mod / Cargo.lock ほか) が追跡されて
 *     いれば、その生態系の台帳 (`ecosystems`) が実在する強制物を持つ
 *  5. MCP / hook の起動子 (npx → node / uvx → python ほか) の言語が台帳に在る
 *     (起動子は『その時の最新』を取って走らせるので、言語としては実行時に入ってくる)
 *     (起動子だけで入っている言語 `launcherOnly` は、リポジトリ内にソースが入ったら落ちる)
 *  6. 台帳の `ifAdded` (まだ無い言語に足すべき守り) が空でない
 *  7. 台帳が読めない・空なら『読めない』と言う (0 件で通さない)
 *
 * 限界 (正直に): 拡張子と起動子から言語を引くので、拡張子の無いファイル・自前の判定で言語を
 * 偽る入口は見えない (Dockerfile は名前で引く)。台帳が『守りが在る』と言うことは確かめるが、
 * その守りが十分に強いかは確かめない (狩りと回帰検査の仕事)。実物の弱点を見つける・直すのは
 * 人と AI の仕事で、この仕組みは『見張りが無い言語を作らない』ところまでを自動にする。
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

/** 拡張子 (小文字・ドット無し) → 言語 id。プログラミング言語・実行される設定の言語だけ。 */
const EXTENSION_LANGUAGE = {
  ts: 'javascript-family', tsx: 'javascript-family', js: 'javascript-family', jsx: 'javascript-family',
  cjs: 'javascript-family', mjs: 'javascript-family', cts: 'javascript-family', mts: 'javascript-family',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  yml: 'github-actions-yaml', yaml: 'github-actions-yaml',
  py: 'python', pyw: 'python',
  go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', kts: 'kotlin', scala: 'scala',
  rb: 'ruby', php: 'php', pl: 'perl', lua: 'lua', r: 'r',
  c: 'c-cpp', h: 'c-cpp', cc: 'c-cpp', cpp: 'c-cpp', cxx: 'c-cpp', hpp: 'c-cpp',
  cs: 'csharp', fs: 'fsharp', vb: 'visual-basic', swift: 'swift', m: 'objective-c', dart: 'dart',
  ps1: 'powershell', psm1: 'powershell', bat: 'windows-batch', cmd: 'windows-batch',
  sql: 'sql', ex: 'elixir', exs: 'elixir', erl: 'erlang', hs: 'haskell', clj: 'clojure',
  wasm: 'webassembly', wat: 'webassembly', sol: 'solidity',
};

/** ファイル名 → 言語 id (拡張子が無い・名前で決まる物)。 */
const NAME_LANGUAGE = {
  Dockerfile: 'dockerfile', Makefile: 'make', Gemfile: 'ruby', Rakefile: 'ruby', Jenkinsfile: 'groovy',
};

/** 依存の定義ファイル (basename) → 生態系 id。 */
const MANIFEST_ECOSYSTEM = {
  'package-lock.json': 'npm', 'npm-shrinkwrap.json': 'npm', 'yarn.lock': 'npm', 'pnpm-lock.yaml': 'npm',
  'requirements.txt': 'pypi', 'Pipfile.lock': 'pypi', 'poetry.lock': 'pypi', 'pyproject.toml': 'pypi', 'uv.lock': 'pypi',
  'go.mod': 'go', 'go.sum': 'go', 'Cargo.lock': 'crates-io', 'Cargo.toml': 'crates-io',
  'pom.xml': 'maven', 'build.gradle': 'maven', 'build.gradle.kts': 'maven', 'gradle.lockfile': 'maven',
  'Gemfile.lock': 'rubygems', 'composer.lock': 'packagist', 'packages.lock.json': 'nuget',
  'Package.resolved': 'swift', 'pubspec.lock': 'pub', 'mix.lock': 'hex',
};

/** 起動子 (MCP / hook の command) → 言語 id。『その時の最新』を取って走らせる口。 */
const LAUNCHER_LANGUAGE = { npx: 'javascript-family', node: 'javascript-family', uvx: 'python', python: 'python', python3: 'python', pipx: 'python', bunx: 'javascript-family', deno: 'javascript-family' };

function baseOf(file) {
  const i = file.lastIndexOf('/');
  return i < 0 ? file : file.slice(i + 1);
}

/** 追跡している実物から、言語ごとの件数・生態系・起動子の言語を導く。純関数。 */
function observe(files, launchers) {
  const languages = new Map();
  const manifests = new Map();
  for (const f of files) {
    const base = baseOf(f);
    const dot = base.lastIndexOf('.');
    const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
    const lang = NAME_LANGUAGE[base] ?? (ext ? EXTENSION_LANGUAGE[ext] : undefined);
    if (lang !== undefined) languages.set(lang, (languages.get(lang) ?? 0) + 1);
    // Dockerfile.foo / foo.Dockerfile
    if (/(^|\.)Dockerfile(\.|$)/.test(base) && lang === undefined) languages.set('dockerfile', (languages.get('dockerfile') ?? 0) + 1);
    const eco = MANIFEST_ECOSYSTEM[base];
    if (eco !== undefined) manifests.set(eco, [...(manifests.get(eco) ?? []), f]);
  }
  const launched = new Set();
  for (const l of launchers) {
    const lang = LAUNCHER_LANGUAGE[baseOf(String(l))];
    if (lang !== undefined) launched.add(lang);
  }
  return { languages, manifests, launched };
}

function analyzeLanguageCoverage(registry, files, launchers, exists) {
  const problems = [];
  const rows = [];
  if (!registry || typeof registry !== 'object' || !Array.isArray(registry.languages) || registry.languages.length === 0) {
    return { rows, problems: ['言語の網羅の台帳を読めない (languages が配列でない・空)'], actionable: 1, observed: { languages: [], ecosystems: [], launched: [] } };
  }
  const ifAdded = registry.ifAdded && typeof registry.ifAdded === 'object' ? registry.ifAdded : {};
  const obs = observe(files, launchers);
  const ledger = new Map();
  for (const e of registry.languages) {
    if (e && typeof e.id === 'string') ledger.set(e.id, e);
  }
  const hint = (lang) => {
    const h = ifAdded[lang];
    return typeof h === 'string' && h.trim() !== '' ? ` —— 足す守り: ${h}` : ' —— 足す守りが ifAdded に無い (台帳に書く)';
  };
  // 1 + 2 + 3
  for (const [lang, n] of obs.languages) {
    const e = ledger.get(lang);
    if (e === undefined) {
      problems.push(`${lang}: 追跡している実物に ${n} 件在るが、言語の網羅の台帳に載っていない (網が無いまま言語が増えた)${hint(lang)}`);
    }
  }
  for (const [id, e] of ledger) {
    const n = obs.languages.get(id) ?? 0;
    const viaLauncher = obs.launched.has(id);
    const scanners = Array.isArray(e.scanners) ? e.scanners.filter((x) => typeof x === 'string') : [];
    if (e.status === 'present') {
      if (n === 0 && !viaLauncher) problems.push(`${id}: 台帳は present と言うが、実物にも起動子にも無い (古い行)`);
      if (typeof e.what !== 'string' || e.what.trim() === '') problems.push(`${id}: 説明 (what) が空`);
      if (scanners.length === 0) problems.push(`${id}: 見張る強制物 (scanners) が無い`);
      // 起動子だけで入っている言語 (launcherOnly) は、リポジトリ内にソースが入った瞬間に網が足りなくなる
      // (起動子の網は『何を取って走らせるか』を見るだけで、そのソースは見ない)。
      if (e.launcherOnly === true && n > 0) problems.push(`${id}: 起動子だけの網で足りていた言語のソースが ${n} 件入った (起動子の網はソースを見ない)${hint(id)}`);
      for (const s of scanners) if (!exists(s)) problems.push(`${id}: 強制物が実在しない: ${s}`);
    } else {
      problems.push(`${id}: status が present でない (${String(e.status)}) —— 載せるのは今在る言語だけ。まだ無い言語は ifAdded へ`);
    }
    rows.push({ id, files: n, viaLauncher, scanners: scanners.length, covered: e.status === 'present' && scanners.length > 0 && scanners.every(exists) });
  }
  // 4
  const eco = Array.isArray(registry.ecosystems) ? registry.ecosystems : [];
  const ecoById = new Map(eco.filter((x) => x && typeof x.id === 'string').map((x) => [x.id, x]));
  for (const [id, mf] of obs.manifests) {
    const e = ecoById.get(id);
    if (e === undefined) {
      problems.push(`依存の生態系 ${id}: 定義ファイル (${mf.slice(0, 3).join(', ')}) が追跡されているが、台帳の ecosystems に載っていない${hint(id)}`);
      continue;
    }
    const sc = Array.isArray(e.scanners) ? e.scanners.filter((x) => typeof x === 'string') : [];
    if (sc.length === 0) problems.push(`依存の生態系 ${id}: 勧告を見張る強制物 (scanners) が無い`);
    for (const s of sc) if (!exists(s)) problems.push(`依存の生態系 ${id}: 強制物が実在しない: ${s}`);
  }
  for (const id of ecoById.keys()) {
    if (!obs.manifests.has(id)) problems.push(`依存の生態系 ${id}: 台帳に在るが定義ファイルが追跡されていない (古い行)`);
  }
  // 5
  for (const lang of obs.launched) {
    if (!ledger.has(lang)) problems.push(`起動子の言語 ${lang}: MCP / hook の起動子で『その時の最新』が走るが、台帳に載っていない${hint(lang)}`);
  }
  // 6
  if (Object.keys(ifAdded).length === 0) problems.push('ifAdded (まだ無い言語に足すべき守り) が空 —— 新しい言語が入ったとき何を足すかを名指しできない');
  for (const [k, v] of Object.entries(ifAdded)) {
    if (typeof v !== 'string' || v.trim() === '') problems.push(`ifAdded.${k} が空`);
  }
  return {
    rows,
    problems,
    actionable: problems.length,
    observed: { languages: [...obs.languages.keys()].sort(), ecosystems: [...obs.manifests.keys()].sort(), launched: [...obs.launched].sort() },
  };
}

function renderLanguageCoverage(r) {
  const lines = ['### 言語の網羅 (見張りが無い言語を作らない)', '', '| 言語 | 追跡ファイル | 起動子 | 強制物 | 状態 |', '| --- | ---: | :---: | ---: | --- |'];
  for (const x of r.rows) lines.push(`| ${x.id} | ${x.files} | ${x.viaLauncher ? '○' : '—'} | ${x.scanners} | ${x.covered ? '見張りあり' : '要対応'} |`);
  lines.push('', `生態系: ${r.observed.ecosystems.length ? r.observed.ecosystems.join(', ') : '(なし)'}`);
  if (r.problems.length) lines.push('', '**要対応:**', ...r.problems.map((p) => `- ${p}`));
  lines.push('', '_今在る言語・起動子・依存の生態系を実物から導いて台帳と突き合わせる。新しい物が入ると落ち、足す守りを名指しする。弱点そのものを見つけて直すのは狩りと回帰検査の仕事。_');
  return lines.join('\n');
}

/** 追跡している実物の一覧。git が使えなければ null (呼ぶ側が『測れなかった』と言う)。 */
function trackedFiles(root) {
  const { gitLsFilesOrNull } = require('./lib/tracked-cross-check.cjs');
  return gitLsFilesOrNull(root);
}

/** `.claude/settings.json` の MCP / hook の起動子 (command の先頭の語)。 */
function launchersOf(root) {
  const j = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'));
  const out = [];
  for (const s of Object.values(j.mcpServers ?? {})) if (s && typeof s.command === 'string') out.push(s.command.trim().split(/\s+/)[0]);
  for (const arr of Object.values(j.hooks ?? {})) {
    for (const h of Array.isArray(arr) ? arr : []) {
      for (const hh of Array.isArray(h && h.hooks) ? h.hooks : []) {
        if (hh && typeof hh.command === 'string') out.push(hh.command.trim().split(/\s+/)[0]);
      }
    }
  }
  return out;
}

function realExists(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return (e) => (e.startsWith('npm:') ? Boolean(pkg.scripts && pkg.scripts[e.slice(4)]) : fs.existsSync(path.join(root, e)));
}

function selfTest() {
  const reg = () => ({
    languages: [
      { id: 'javascript-family', status: 'present', what: 'js', scanners: ['s1'] },
      { id: 'shell', status: 'present', what: 'sh', scanners: ['s2'] },
    ],
    ecosystems: [{ id: 'npm', scanners: ['s1'] }],
    ifAdded: { python: 'bandit / pip-audit', go: 'govulncheck', pypi: 'pip-audit' },
  });
  const files = ['a.ts', 'b.sh', 'package-lock.json'];
  const exists = (e) => e !== 'gone';
  const run = (r, f = files, l = []) => analyzeLanguageCoverage(r, f, l, exists).problems.length;
  const cases = [
    ['揃っていれば 0 件', run(reg()), 0],
    ['新しい言語 (py) が入ると落ちる', run(reg(), [...files, 'x/tool.py']), 1],
    ['新しい言語 (go) が入ると落ち、足す守りを名指しする', analyzeLanguageCoverage(reg(), [...files, 'm.go'], [], exists).problems.some((p) => p.includes('govulncheck')) ? 1 : 0, 1],
    ['新しい生態系 (go.mod) が入ると落ちる', run(reg(), [...files, 'go.mod']), 1],
    ['uvx の起動子は python を要求する', run(reg(), files, ['uvx']), 1],
    ['npx の起動子は javascript-family で足りる', run(reg(), files, ['npx']), 0],
    ['実物に無い present の行は古い', (() => { const r = reg(); r.languages.push({ id: 'ruby', status: 'present', what: 'rb', scanners: ['s1'] }); return run(r); })(), 1],
    ['実在しない強制物を落とす', (() => { const r = reg(); r.languages[0].scanners = ['gone']; return run(r); })(), 1],
    ['起動子だけの言語 (launcherOnly) のソースが入ると落ちる', (() => { const r = reg(); r.languages.push({ id: 'python', status: 'present', what: 'uvx', scanners: ['s1'], launcherOnly: true }); return run(r, [...files, 't.py'], ['uvx']); })(), 1],
    ['launcherOnly でもソースが無ければ落ちない', (() => { const r = reg(); r.languages.push({ id: 'python', status: 'present', what: 'uvx', scanners: ['s1'], launcherOnly: true }); return run(r, files, ['uvx']); })(), 0],
    ['強制物が空だと落ちる', (() => { const r = reg(); r.languages[1].scanners = []; return run(r); })(), 1],
    ['定義ファイルの無い生態系の行は古い', (() => { const r = reg(); r.ecosystems.push({ id: 'pypi', scanners: ['s1'] }); return run(r); })(), 1],
    ['ifAdded が空だと落ちる', (() => { const r = reg(); r.ifAdded = {}; return run(r); })(), 1],
    ['Dockerfile は名前で言語に引く', run(reg(), [...files, 'docker/Dockerfile']), 1],
    ['台帳が空なら読めないと言う', run({ languages: [] }), 1],
  ];
  let bad = 0;
  for (const [label, n, expected] of cases) {
    const ok = n === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${n} 件 (期待 ${expected})`);
  }
  if (bad) { console.error(`❌ self-test 不一致 ${bad} 件`); return 1; }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const root = path.join(__dirname, '..');
  const files = trackedFiles(root);
  if (files === null) { console.error('❌ 追跡している実物の一覧を取れない (git が使えない) —— 測れなかった'); return 2; }
  const reg = JSON.parse(fs.readFileSync(path.join(root, 'security', 'language-coverage.json'), 'utf8'));
  const r = analyzeLanguageCoverage(reg, files, launchersOf(root), realExists(root));
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else console.log(renderLanguageCoverage(r));
  return r.problems.length === 0 ? 0 : 1;
}

if (require.main === module) process.exit(main());
module.exports = { analyzeLanguageCoverage, renderLanguageCoverage, observe, launchersOf, trackedFiles, realExists, EXTENSION_LANGUAGE, MANIFEST_ECOSYSTEM, LAUNCHER_LANGUAGE, NAME_LANGUAGE };
