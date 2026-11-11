'use strict';
/*
 * Mamori の対戦場 (arena) —— 審判の本体 (2026-11-08 · 対戦)。
 *
 * 目的: 言語 (Mamori) のコンパイラが保証する守りを、**守る側と攻める側を実際に戦わせて**測る。
 * 静的な電池 (mamoriBattery) は「生成物に穴の形が無いか」を見るが、ここは**実行する**:
 * 守る側が仮想データを持つ箱 (Mamori のモジュール) を作り、攻める側が Mamori のモジュールでその箱から
 * 仮想データを奪う・壊す。コンパイラが断れば守る側の勝ち、通って実行されても奪えなければ守る側の勝ち、
 * 奪えたら攻める側の勝ち。
 *
 * 規則は 1 つ: **お互い同じ箱に入り、その箱から出ない。**
 *   外側の箱 = `unshare -rn node --permission` の子プロセス (ファイル・子プロセス・ワーカー・ネットワークが全部閉じる・
 *              環境変数は空・仮想データ以外の物は何も無い)
 *   内側の箱 = その中の vm の文脈 (守る側のモジュールが仮想データを持ち、攻める側が同じ文脈へ読み込まれる)
 * 箱の外の物 (host の canary・本物の組み込み・process) に届いたら `escaped` —— 最も重い攻撃側の得点。
 *
 * ここで出た攻防はすべて `security/mamori-arena/corpus.json` に残し、言語の学習 (回帰検査・台帳・次の周の標本) に使う。
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BOX_JS = path.join(__dirname, 'mamori-arena-box.cjs');

function mulberry32(a) {
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1 試合ぶんの仮想データ。種から決まる (同じ種は同じ値) が、攻める側は種を知らない。 */
function virtualData(seed) {
  const r = mulberry32(seed >>> 0);
  const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join('');
  return {
    SECRET: 'sec_' + hex(24),
    REC_A: 'rec-a-' + hex(10),
    REC_B: 'rec-b-' + hex(10),
    REC_C: 'rec-c-' + hex(10),
    HOST: 'HOSTCANARY-' + hex(16),
  };
}

function substitute(text, data) {
  return text
    .split('@@SECRET@@').join(data.SECRET)
    .split('@@REC_A@@').join(data.REC_A)
    .split('@@REC_B@@').join(data.REC_B)
    .split('@@REC_C@@').join(data.REC_C);
}

/** esbuild で型を剥がして Mamori のコンパイラと TypeScript を読む (scripts/mamori.cjs と同じ形)。 */
function loadCompiler(repoRoot = REPO_ROOT) {
  const entry = path.join(repoRoot, 'src', 'shared', 'mamori', 'compile.ts');
  const esbuild = require('esbuild');
  const Module = require('node:module');
  const previous = Module._extensions['.ts'];
  Module._extensions['.ts'] = (module, filename) => {
    const { code } = esbuild.transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs', target: 'node20', sourcefile: filename });
    module._compile(code, filename);
  };
  try {
    const mod = createRequire(entry)(entry);
    return { compileProject: mod.compileProject, formatDiagnostic: mod.formatDiagnostic, ts: require('typescript') };
  } finally {
    if (previous) Module._extensions['.ts'] = previous;
    else delete Module._extensions['.ts'];
  }
}

let strongCache = null;
function strongAvailable() {
  if (strongCache !== null) return strongCache;
  const r = spawnSync('/usr/bin/unshare', ['-rn', process.execPath, '--permission', '-e', '0'], { env: {}, encoding: 'utf8', timeout: 8000 });
  strongCache = r.status === 0;
  return strongCache;
}

function runBox(payload, level) {
  const runner = fs.readFileSync(BOX_JS, 'utf8');
  let cmd;
  let args;
  if (level === 'strong') {
    if (!strongAvailable()) return { verdict: 'unavailable', detail: 'unshare -rn (ネットワークを閉じた箱) が使えない' };
    cmd = '/usr/bin/unshare';
    args = ['-rn', process.execPath, '--permission', '--max-old-space-size=256', '-e', runner];
  } else {
    cmd = process.execPath;
    args = ['--permission', '--max-old-space-size=256', '-e', runner];
  }
  const r = spawnSync(cmd, args, { input: JSON.stringify(payload), env: {}, encoding: 'utf8', timeout: 15000, maxBuffer: 8 << 20 });
  if (r.error && r.error.code === 'ETIMEDOUT') return { verdict: 'hang', detail: '箱が時間内に終わらなかった (外側で打ち切った)' };
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { verdict: 'error', detail: 'box output unreadable: ' + String(r.stderr || r.stdout || r.status).slice(0, 300) };
  }
}

const libCache = new Map();
/**
 * 本物の出荷の道と同じに、変換後の TypeScript を型検査する (strict・noUncheckedIndexedAccess)。
 * Mamori が見るのは来歴だけで、null の絞り込みや型の正しさは `tsc` の仕事 (docs/MAMORI.md) —— ここを飛ばすと
 * 「本物の道なら tsc が止める」攻撃を赤の得点に数えてしまう (実測: Token | null を印の引数へ渡す形)。
 */
function typecheck(ts, outputs) {
  const virtual = new Map();
  for (const [p, text] of outputs) virtual.set('/arena/' + path.basename(p), text);
  const options = { target: ts.ScriptTarget.ES2022, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, noUncheckedIndexedAccess: true, skipLibCheck: true, noEmit: true, types: [] };
  const libDir = path.dirname(ts.getDefaultLibFilePath(options));
  const host = {
    getSourceFile: (f, lang) => {
      if (virtual.has(f)) return ts.createSourceFile(f, virtual.get(f), lang, true);
      const real = f.startsWith('/arena/') ? null : f;
      if (real === null) return undefined;
      if (!libCache.has(real)) libCache.set(real, fs.existsSync(real) ? ts.createSourceFile(real, fs.readFileSync(real, 'utf8'), lang, true) : undefined);
      return libCache.get(real);
    },
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    getDefaultLibLocation: () => libDir,
    writeFile: () => {},
    getCurrentDirectory: () => '/arena',
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (f) => virtual.has(f) || (!f.startsWith('/arena/') && fs.existsSync(f)),
    readFile: (f) => (virtual.has(f) ? virtual.get(f) : fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : undefined),
    directoryExists: (d) => d === '/arena' || fs.existsSync(d),
    getDirectories: () => [],
  };
  const program = ts.createProgram([...virtual.keys()], options, host);
  const diags = ts.getPreEmitDiagnostics(program).filter((d) => d.file && virtual.has(d.file.fileName));
  return diags.map((d) => ({ file: path.basename(d.file.fileName), message: ts.flattenDiagnosticMessageText(d.messageText, ' ').slice(0, 160) }));
}

function toJs(ts, tsSource, name) {
  return ts.transpileModule(tsSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: name + '.ts' }).outputText;
}

/**
 * 1 試合。`box = { name, source, spec: { contract: [...] } }`・`attackSrc` は Mamori の元。
 * 返す: { verdict, detail, rules?, side } —— side = 'blue' (守る側の得点) | 'red' (攻める側の得点) | 'void' (採点しない)。
 */
function play({ compiler, box, attackSrc, seed = 1, level = 'strong' }) {
  const { compileProject, formatDiagnostic, ts } = compiler;
  const data = virtualData(seed);
  const defSrc = substitute(box.source, data);
  const files = [
    { path: 'arena/defender.mamori', source: defSrc },
    { path: 'arena/attack.mamori', source: attackSrc },
  ];
  const alone = compileProject([files[0]]);
  if (!alone.ok) return { verdict: 'bad-box', side: 'void', detail: alone.diagnostics.map(formatDiagnostic).slice(0, 3).join(' / ') };
  const both = compileProject(files);
  if (!both.ok) {
    const mine = both.diagnostics.filter((d) => d.file === 'arena/attack.mamori');
    const shown = (mine.length > 0 ? mine : both.diagnostics);
    // 相手の箱が export していない名前を引いただけの攻撃は、その箱への攻撃になっていない (採点しない)
    if (shown.every((d) => /export していません/.test(d.message))) return { verdict: 'n/a', side: 'void', detail: 'この箱には無い名前を引く攻撃 (採点外): ' + formatDiagnostic(shown[0]).slice(0, 120) };
    return { verdict: 'refused', side: 'blue', rules: [...new Set(shown.map((d) => d.rule))], detail: formatDiagnostic(shown[0]) };
  }
  const tsc = typecheck(ts, both.outputs);
  // 守る側の箱自身が型を通らないなら箱の欠陥 (採点しない)。攻撃の側が型を通らないなら、本物の道では tsc が止める (青の得点)
  const boxErr = tsc.find((d) => d.file === 'defender.ts');
  if (boxErr) return { verdict: 'bad-box', side: 'void', detail: 'tsc (box): ' + boxErr.message };
  if (tsc.length > 0) return { verdict: 'refused', side: 'blue', rules: ['tsc'], detail: 'tsc: ' + tsc[0].message };
  const contract = JSON.parse(substitute(JSON.stringify(box.spec.contract), data));
  const payload = {
    modules: [
      { name: 'defender', js: toJs(ts, both.outputs.get('arena/defender.ts'), 'defender') },
      { name: 'attack', js: toJs(ts, both.outputs.get('arena/attack.ts'), 'attack') },
    ],
    contract,
    secrets: [['SECRET', data.SECRET]],
    hostCanary: data.HOST,
    attackFn: 'attack',
    timeoutMs: 2500,
  };
  const out = runBox(payload, level);
  const red = out.verdict === 'stolen' || out.verdict === 'destroyed' || out.verdict === 'escaped';
  const side = red ? 'red' : out.verdict === 'held' ? 'blue' : 'void';
  return { verdict: out.verdict, side, detail: String(out.detail || '').replace(new RegExp(data.SECRET, 'g'), '<SECRET>'), emitted: both.outputs.get('arena/attack.ts') };
}

/**
 * 生の TypeScript の呼び手による 1 試合 (周回 9)。攻めは Mamori を通らない素の TS —— 生成物 (`defender.ts`) を import して使う
 * TypeScript の側の呼び手を表す。Mamori の攻めは**攻める側のコンパイルの時点で言語が書き込みを断る**ので、実行時の凍結
 * (`Object.freeze`) が本当に働いているかは見えない。ここは言語の規則を通さずに、箱が公開した物へ直接書き込めるかを測る。
 * 型検査は掛けない (JavaScript の呼び手・`as any` の呼び手は型に止められない)。
 */
function playRaw({ compiler, box, attackTs, seed = 1, level = 'strong' }) {
  const { compileProject, formatDiagnostic, ts } = compiler;
  const data = virtualData(seed);
  const defSrc = substitute(box.source, data);
  const alone = compileProject([{ path: 'arena/defender.mamori', source: defSrc }]);
  if (!alone.ok) return { verdict: 'bad-box', side: 'void', detail: alone.diagnostics.map(formatDiagnostic).slice(0, 3).join(' / ') };
  const contract = JSON.parse(substitute(JSON.stringify(box.spec.contract), data));
  const payload = {
    modules: [
      { name: 'defender', js: toJs(ts, alone.outputs.get('arena/defender.ts'), 'defender') },
      { name: 'attack', js: toJs(ts, attackTs, 'attack') },
    ],
    contract,
    secrets: [['SECRET', data.SECRET]],
    hostCanary: data.HOST,
    attackFn: 'attack',
    timeoutMs: 2500,
  };
  const out = runBox(payload, level);
  const red = out.verdict === 'stolen' || out.verdict === 'destroyed' || out.verdict === 'escaped';
  const side = red ? 'red' : out.verdict === 'held' ? 'blue' : 'void';
  return { verdict: out.verdict, side, detail: String(out.detail || '').replace(new RegExp(data.SECRET, 'g'), '<SECRET>') };
}

function loadBoxes(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.box.mamori')).sort().map((f) => {
    const base = f.slice(0, -'.box.mamori'.length);
    const spec = JSON.parse(fs.readFileSync(path.join(dir, base + '.box.json'), 'utf8'));
    return { name: base, source: fs.readFileSync(path.join(dir, f), 'utf8'), spec };
  });
}

/** 攻撃の先頭の `// target: a,b` (箱の名前・`*` は全部) —— 無ければ全部の箱が相手。 */
function targetsOf(source) {
  const m = /\/\/\s*target:\s*([^\n]+)/m.exec(source.split('\n').slice(0, 6).join('\n'));
  return m ? m[1].split(',').map((x) => x.trim()).filter(Boolean) : ['*'];
}

function loadAttacks(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.attack.mamori')).sort().map((f) => {
    const source = fs.readFileSync(path.join(dir, f), 'utf8');
    return { name: f.slice(0, -'.attack.mamori'.length), source, targets: targetsOf(source) };
  });
}

/** 総当たり。boxes × attacks。各試合は種を変える (攻める側が値を覚えられない)。 */
function tournament({ compiler, boxes, attacks, seed = 1, level = 'strong', onRound }) {
  const rounds = [];
  let k = 0;
  for (const box of boxes) {
    for (const atk of attacks) {
      const t = atk.targets || targetsOf(atk.source);
      if (!t.includes('*') && !t.includes(box.name)) continue;
      k++;
      const res = play({ compiler, box, attackSrc: atk.source, seed: seed * 1000 + k, level });
      const row = { box: box.name, attack: atk.name, seed: seed * 1000 + k, verdict: res.verdict, side: res.side, rules: res.rules || [], detail: res.detail };
      rounds.push(row);
      if (onRound) onRound(row);
    }
  }
  const count = (side) => rounds.filter((r) => r.side === side).length;
  const byVerdict = {};
  for (const r of rounds) byVerdict[r.verdict] = (byVerdict[r.verdict] || 0) + 1;
  return { rounds, red: count('red'), blue: count('blue'), void: count('void'), byVerdict };
}

module.exports = { typecheck, targetsOf, REPO_ROOT, virtualData, substitute, loadCompiler, play, playRaw, tournament, loadBoxes, loadAttacks, strongAvailable, runBox };
