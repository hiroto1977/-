#!/usr/bin/env node
/**
 * smoke:app — **実物のデスクトップアプリを起動する。**
 *
 * ## なぜ要るのか (2026-08-26 実測)
 *
 * この日まで、**誰も実物を起動していなかった**:
 *
 *   smoke        `scripts/screenshot.cjs` を主プロセスにして自前で窓を作る
 *                → `dist-electron/main.js` を一度も通らない
 *   e2e          ブラウザ版の HTML を読む → 主プロセスが無い
 *   release.yml  インストーラを作るが起動はしない
 *   lint:imports `import` 文だけを読む → `require()` は視界の外
 *
 * その結果こうなっていた:
 *
 *     electron .  ->  App threw an error during load
 *                     Cannot find module '../../shared/serviceId'
 *
 * `src/main/clients/index.ts` の実行時 `require()` がバンドル後も相対パスの
 * まま残り、`dist-electron/` から解決できなかった。2026-08-12 から入っていて、
 * 300 以上のコミットと全 CI が緑のまま通っている。
 *
 * `lint:imports` に検査を足して**その形**は止めた。この道具が止めるのは
 * 「形は違うが起動しない」全部である —— 綴りを名指しする規則は、名指しした
 * 綴りしか止められない。
 *
 * ## 何を見るか
 *
 * 実物を起動して、**一定時間 生きていること**と、致命的な出力が無いこと。
 * 窓の中までは見ない (それは smoke / e2e の仕事)。ここは「立ち上がるか」だけ。
 *
 * 使い方:
 *   npm run build:renderer && xvfb-run -a node scripts/smoke-app.cjs
 *   node scripts/smoke-app.cjs --self-test
 */
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MAIN = path.join(REPO_ROOT, 'dist-electron/main.js');
const RENDERER = path.join(REPO_ROOT, 'dist/index.html');

/** 起動を待つ時間 (ms)。短すぎると落ちる前に打ち切る。 */
const ALIVE_MS = 8000;

/**
 * 「立ち上がらなかった」と判断する出力。
 *
 * **綴りは実測から取った。** 2026-08-26 に実際に出た文面がそのまま標本
 * (`FATAL_SAMPLES`) に入っていて、self-test がここへ当てる。
 * 文面を書き換えても、標本に当たらなくなれば鳴る。
 */
const FATAL = [
  /App threw an error during load/i,
  /Cannot find module/i,
  /A JavaScript error occurred in the main process/i,
  /Failed to load URL/i,
  /Unhandled Rejection/i,
  /Uncaught Exception/i,
];

/** 容器の都合で出るだけの雑音。致命ではない。 */
const NOISE = [
  /ERROR:dbus/i,
  /Failed to connect to the bus/i,
  /GpuControl|ContextResult|libva|vaapi|gbm|MESA|Fontconfig/i,
  /NameHasOwner/i,
];

/** self-test の標本 —— 実測で出た文面と、雑音の実例。 */
const FATAL_SAMPLES = [
  "App threw an error during load",
  "Error: Cannot find module '../../shared/serviceId'",
  '[1m[47m[31mA JavaScript error occurred in the main process',
  "electron: Failed to load URL: file:///home/user/-/dist/index.html with error: ERR_FILE_NOT_FOUND",
];
const NOISE_SAMPLES = [
  '[14215:0826/061013.223789:ERROR:dbus/bus.cc:405] Failed to connect to the bus: Failed to connect to socket',
  '[14432:0826/061102.482214:ERROR:gpu/ipc/client/command_buffer_proxy_impl.cc:285] ContextResult::kTransientFailure',
  'Fontconfig error: Cannot load default config file',
];

/** 行が致命か。雑音は先に除く。 */
function isFatalLine(line) {
  if (NOISE.some((re) => re.test(line))) return false;
  return FATAL.some((re) => re.test(line));
}

/**
 * **梱包後に解決できる require だけが残っているか。**
 *
 * `electron-builder.json` の `files` は `dist/**` `dist-electron/**`
 * `build/icon.png` `package.json` だけ。出来上がった `dist-electron/*.js` に
 * それ以外を指す `require()` が残っていると、**梱包したときだけ落ちる**。
 *
 * 2026-08-26 の不具合はまさにこれで、`require("../../shared/serviceId")` が
 * バンドル後も残っていた。`lint:imports` に足した検査は「src の相対 require」を
 * 名指しで止めるが、**綴りを名指しする規則は名指しした綴りしか止められない**。
 * こちらは出来上がった物を見るので、形が違っても捕まえる。
 *
 * 許すのは `electron` と `node:` 組み込みだけ —— 本番依存は 5 件で、
 * どれも主プロセスからは呼ばれない (呼ぶなら台帳を足す判断が要る)。
 */
const ALLOWED_BUNDLE_REQUIRES = new Set(['electron']);

function bundleRequireProblems(text, label) {
  const problems = [];
  const re = /require\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const spec = m[1];
    if (spec.startsWith('node:')) continue;
    if (ALLOWED_BUNDLE_REQUIRES.has(spec)) continue;
    problems.push(`${label}: require(${JSON.stringify(spec)}) —— 梱包後に解決できません`);
  }
  return problems;
}

function checkBundle() {
  const targets = ['dist-electron/main.js', 'dist-electron/preload.js'];
  const problems = [];
  let scanned = 0;
  for (const rel of targets) {
    const full = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(full)) {
      console.error(`❌ ${rel} がありません。先に npm run build:renderer を通してください`);
      return 1;
    }
    scanned += 1;
    problems.push(...bundleRequireProblems(fs.readFileSync(full, 'utf8'), rel));
  }
  console.log(`ビルド成果物 ${scanned} 本の require を検査 (許可: node: 組み込み / ${[...ALLOWED_BUNDLE_REQUIRES].join(', ')})`);
  if (problems.length > 0) {
    console.error(`❌ ${problems.length} 件:`);
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  console.log('✅ 梱包後も解決できる require だけです');
  return 0;
}

function electronBinary() {
  // `require('electron')` は実行ファイルのパスを返す (Node から読んだとき)。
  try {
    const p = require('electron');
    if (typeof p === 'string' && fs.existsSync(p)) return p;
  } catch {
    /* fall through */
  }
  const guess = path.join(REPO_ROOT, 'node_modules/electron/dist/electron');
  return fs.existsSync(guess) ? guess : null;
}

async function run() {
  for (const [label, f] of [['dist-electron/main.js', MAIN], ['dist/index.html', RENDERER]]) {
    if (!fs.existsSync(f)) {
      console.error(`❌ ${label} がありません。先に npm run build:renderer を通してください`);
      return 1;
    }
  }
  // 静的な検査を先に通す —— 起動する前に分かることは、起動せずに言う。
  if (checkBundle() !== 0) return 1;

  const bin = electronBinary();
  if (bin === null) {
    console.error('❌ electron の実行ファイルが見つかりません (npm ci を通してください)');
    return 2;
  }
  if (process.env.DISPLAY === undefined || process.env.DISPLAY === '') {
    console.error('❌ DISPLAY がありません。xvfb-run -a node scripts/smoke-app.cjs で実行してください');
    return 2;
  }

  const child = spawn(bin, ['.', '--no-sandbox'], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = [];
  let exited = null;
  child.stdout.on('data', (d) => lines.push(...String(d).split('\n')));
  child.stderr.on('data', (d) => lines.push(...String(d).split('\n')));
  child.on('exit', (code, signal) => {
    exited = { code, signal };
  });

  await new Promise((res) => setTimeout(res, ALIVE_MS));
  const stillAlive = exited === null;
  if (stillAlive) child.kill('SIGTERM');
  await new Promise((res) => setTimeout(res, 500));

  const fatals = lines.filter((l) => l.trim() !== '' && isFatalLine(l));
  console.log(`起動を ${ALIVE_MS / 1000} 秒観察 — 出力 ${lines.length} 行 / 致命 ${fatals.length} 件`);
  if (!stillAlive) {
    console.error(`❌ 起動が続かなかった (exit ${JSON.stringify(exited)})`);
    for (const f of fatals.slice(0, 5)) console.error(`   ${f}`);
    return 1;
  }
  if (fatals.length > 0) {
    console.error('❌ 主プロセスが致命的な出力を出しました:');
    for (const f of fatals.slice(0, 5)) console.error(`   ${f}`);
    return 1;
  }
  console.log('✅ 実物のデスクトップアプリが起動し、生き続けた');
  return 0;
}

function selfTest() {
  let bad = 0;
  console.log('self-test:');
  for (const s of FATAL_SAMPLES) {
    const ok = isFatalLine(s);
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} 致命と判定: ${s.slice(0, 62)}`);
  }
  for (const s of NOISE_SAMPLES) {
    const ok = !isFatalLine(s);
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} 雑音と判定: ${s.slice(0, 62)}`);
  }
  // 梱包後の require の検査。**実際に残っていた綴り**を標本に置く。
  for (const [label, text, expected] of [
    ['実際に残っていた相対 require を捕まえる', 'const x=require("../../shared/serviceId");', 1],
    ['electron は許す', 'const $=require("electron");', 0],
    ['node: 組み込みは許す', 'const v=require("node:path"),S=require("node:fs");', 0],
    ['npm パッケージも捕まえる (主プロセスは持ち込まない前提)', 'const z=require("lodash");', 1],
    ['複数あれば全部挙げる', 'require("./a");require("../b");', 2],
  ]) {
    const n = bundleRequireProblems(text, 'x').length;
    const ok = n === expected;
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} 梱包 require: ${label}: ${n} 件 (期待 ${expected})`);
  }

  // 走査の的が空でないこと。
  if (FATAL.length < 4 || FATAL_SAMPLES.length < 3) {
    bad += 1;
    console.log('  ✗ 規則か標本が痩せています');
  } else {
    console.log(`  ✓ 規則 ${FATAL.length} 件 / 標本 ${FATAL_SAMPLES.length} + ${NOISE_SAMPLES.length} 件`);
  }
  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) process.exit(selfTest());
  // 静的な検査だけ (Electron も画面も要らない。release.yml から呼べる)。
  if (process.argv.includes('--check-bundle')) process.exit(checkBundle());
  run().then((c) => process.exit(c)).catch((e) => {
    console.error('❌', e && e.message);
    process.exit(1);
  });
}

module.exports = { isFatalLine, bundleRequireProblems, checkBundle, FATAL, NOISE, FATAL_SAMPLES, NOISE_SAMPLES };
