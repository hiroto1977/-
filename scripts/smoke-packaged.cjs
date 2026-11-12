#!/usr/bin/env node
/**
 * smoke:packaged — **梱包した実物 (app.asar + fuse 適用済みのバイナリ) を起動して、窓に UI が出ることを確かめる。**
 *
 * ## なぜ要るのか (2026-10-23 実測 · threat: T-165)
 *
 * `smoke:app` は `electron .` で**梱包していない** `dist-electron/main.js` を起動する。ところが利用者に
 * 届くのは `electron-builder` が `app.asar` に固めて **fuse を焼き込んだバイナリ**で、そこは誰も起動していなかった。
 * 出荷設定の fuse `grantFileProtocolExtraPrivileges=false` は、梱包版では asar 内の `file://` の読み込みを
 * `ERR_FILE_NOT_FOUND` にし、**窓が白くなる** (`chrome-error://chromewebdata/`)。Electron 45.0.0 の
 * `electron-builder --dir` で実測し、同じバイナリの fuse だけ `true` にすると起動して UI が出た。
 * `smoke:app` は `electron .` (fuse が既定) を起動するので、この設定の誤りは構造的に映らない。
 *
 * ## 何を見るか (4. resources/app に置いた外のコードが実行されない = onlyLoadAppFromAsar · T-166)
 *
 *   1. 梱包物の fuse が `electron-builder.json` の `electronFuses` と一致する (焼き込まれた値を読む)
 *   2. 窓が `app.asar` の `index.html` を読み込み、UI が出る (url が chrome-error でない・本文が空でない・bridge が在る)
 *   3. レンダラーから `fetch('file:///etc/passwd')` が通らない (fuse が true でも T-140 の門が閉じている)
 *   4. app.asar を 1 byte 改竄すると起動時の自己検算 (T-218 · `selfAttestation.ts`) が理由を stderr に刷って窓を作らない
 *      —— ★ Linux では fuse `enableEmbeddedAsarIntegrityValidation` が何も照合しない (実測 2026-10-29) ので、この段が唯一の検算
 *   5. app.asar を消して resources/app に置いた外のコードが実行されない (onlyLoadAppFromAsar · T-166)
 *
 * Linux 専用 (`electron-builder --dir` の unpacked を起動する)。macOS / Windows のインストーラは測らない。
 *
 * 使い方:
 *   npm run build:renderer && xvfb-run -a node scripts/smoke-packaged.cjs
 *   node scripts/smoke-packaged.cjs --self-test
 */
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MAIN = path.join(REPO_ROOT, 'dist-electron/main.js');
const RENDERER = path.join(REPO_ROOT, 'dist/index.html');
const DEBUG_PORT = 9333;
const ALIVE_MS = 7000;

/** `@electron/fuses read` の出力 (`  RunAsNode is Disabled`) を { RunAsNode: false, … } へ。 */
function parseFuseReport(text) {
  const out = {};
  for (const line of String(text).split('\n')) {
    const m = /^\s*(\w+) is (Enabled|Disabled)\s*$/.exec(line);
    if (m !== null) out[m[1]] = m[2] === 'Enabled';
  }
  return out;
}

/** electron-builder.json の鍵 (`runAsNode`) と、焼き込まれた fuse の名前 (`RunAsNode`) は先頭の大小だけ違う。 */
function fuseProblems(configFuses, packedFuses) {
  const problems = [];
  const names = Object.keys(configFuses);
  if (names.length === 0) problems.push('electron-builder.json に electronFuses が無い');
  for (const key of names) {
    const packedName = key[0].toUpperCase() + key.slice(1);
    const want = configFuses[key];
    const got = packedFuses[packedName];
    if (got === undefined) problems.push(`${packedName}: 梱包物の fuse の読み取りに無い`);
    else if (got !== want) problems.push(`${packedName}: 設定は ${want} なのに梱包物は ${got}`);
  }
  return problems;
}

/** 窓の状態の判定。chrome-error は「読み込みに失敗した」画面で、利用者には白画面に見える。 */
function windowProblems(w) {
  const problems = [];
  if (typeof w.url !== 'string' || w.url === '' || w.url.startsWith('chrome-error:')) {
    problems.push(`窓が UI を読み込めていない (url=${JSON.stringify(w.url)}) —— 梱包版が白画面`);
  } else if (!/app\.asar/.test(w.url)) {
    problems.push(`窓が app.asar から読み込まれていない (url=${w.url}) —— 梱包物を見ていない`);
  }
  if (!(w.bodyChars > 100)) problems.push(`本文が空に近い (${w.bodyChars} 字)`);
  if (w.bridge !== 'object') problems.push(`window.serviceHub が無い (${w.bridge})`);
  if (!/^blocked/.test(String(w.fileFetch))) problems.push(`file:// の任意読み取りが通った (${w.fileFetch}) —— T-140 の門が効いていない`);
  return problems;
}

function resolvePlaywright() {
  const candidates = [undefined, { paths: ['/opt/node22/lib/node_modules'] }];
  for (const opt of candidates) {
    try {
      return require(opt ? require.resolve('playwright', opt) : 'playwright');
    } catch {
      /* try next */
    }
  }
  return null;
}

async function run() {
  if (process.platform !== 'linux') {
    console.error('❌ smoke:packaged は Linux 専用です (electron-builder --dir の unpacked を起動します)');
    return 2;
  }
  for (const [label, f] of [['dist-electron/main.js', MAIN], ['dist/index.html', RENDERER]]) {
    if (!fs.existsSync(f)) {
      console.error(`❌ ${label} がありません。先に npm run build:renderer を通してください`);
      return 1;
    }
  }
  require('./lib/artifact-freshness.cjs').assertFreshArtifacts([MAIN, RENDERER], {
    srcDir: path.join(REPO_ROOT, 'src'),
    repoRoot: REPO_ROOT,
    tool: 'smoke:packaged',
    allowEnv: 'SERVICE_HUB_SMOKE_ALLOW_STALE',
  });
  const pw = resolvePlaywright();
  if (pw === null) {
    console.error('❌ playwright が見つかりません (グローバル導入環境で実行してください)');
    return 2;
  }
  if (process.env.DISPLAY === undefined || process.env.DISPLAY === '') {
    console.error('❌ DISPLAY がありません。xvfb-run -a node scripts/smoke-packaged.cjs で実行してください');
    return 2;
  }

  // 梱包の前に検算表を書く (npm run build と同じ順序 —— 表の無い梱包物は起動時の自己検算が断る)
  const manifest = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'build-integrity-manifest.cjs')], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (manifest.status !== 0) {
    console.error('❌ 検算表を書けません');
    console.error(String(manifest.stderr || manifest.stdout).trim());
    return 1;
  }
  console.log(String(manifest.stdout).trim());

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-packaged-'));
  let child = null;
  try {
    const out = path.join(tmp, 'pkg');
    const build = spawnSync(
      process.execPath,
      [
        path.join(REPO_ROOT, 'node_modules/electron-builder/cli.js'),
        '--config', 'electron-builder.json', '--linux', 'dir', '--x64', '--publish', 'never',
        `-c.directories.output=${out}`, `-c.electronDist=${path.join(REPO_ROOT, 'node_modules/electron/dist')}`,
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
    const bin = path.join(out, 'linux-unpacked', 'service-hub-desktop');
    if (build.status !== 0 || !fs.existsSync(bin)) {
      console.error(`❌ 梱包に失敗しました (exit ${build.status})`);
      console.error(String(build.stderr || build.stdout).split('\n').slice(-12).join('\n'));
      return 1;
    }
    console.log('梱包: app.asar + fuse 適用済みのバイナリを作りました');

    const fuseRead = spawnSync(
      process.execPath,
      [path.join(REPO_ROOT, 'node_modules/@electron/fuses/dist/bin.js'), 'read', '--app', bin],
      { encoding: 'utf8' },
    );
    const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'electron-builder.json'), 'utf8'));
    const fp = fuseProblems(config.electronFuses ?? {}, parseFuseReport(fuseRead.stdout));
    if (fp.length > 0) {
      console.error(`❌ 梱包物の fuse が設定と食い違う ${fp.length} 件:`);
      for (const p of fp) console.error(`  ${p}`);
      return 1;
    }
    console.log(`fuse: 設定の ${Object.keys(config.electronFuses).length} 件が梱包物に焼き込まれている`);

    child = spawn(bin, ['--no-sandbox', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${path.join(tmp, 'ud')}`], {
      stdio: 'ignore',
    });
    await new Promise((res) => setTimeout(res, ALIVE_MS));
    const browser = await pw.chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
    const page = browser.contexts()[0].pages()[0];
    await page.waitForTimeout(1500);
    const w = {
      url: page.url(),
      bodyChars: await page.evaluate(() => document.body.innerText.length),
      bridge: await page.evaluate(() => typeof window.serviceHub),
      fileFetch: await page.evaluate(async () => {
        try {
          const r = await fetch('file:///etc/passwd');
          return `resolved ${r.status}`;
        } catch (e) {
          return `blocked: ${e.message}`;
        }
      }),
    };
    await browser.close();
    const wp = windowProblems(w);
    if (wp.length > 0) {
      console.error(`❌ 梱包版の窓に ${wp.length} 件:`);
      for (const p of wp) console.error(`  ${p}`);
      return 1;
    }
    console.log(`窓: ${w.url.replace(/^file:\/\/.*?(app\.asar)/, 'file://…/$1')} · 本文 ${w.bodyChars} 字 · bridge あり · file:// の任意読み取りは止まる`);
    // 4. 起動時の自己検算 (T-218): app.asar の中の 1 ファイルを 1 byte 変えると、主プロセスは窓を作らず
    //    理由を stderr に刷って止まる。★ Linux では fuse の asar integrity は何も照合しない (実測: 自己検算の
    //    無い束で同じ改竄をすると起動して UI が出た) —— だからこの段を fuse の有無に依らず見る。
    child.kill('SIGTERM');
    await new Promise((res) => setTimeout(res, 1500));
    const asarPath = path.join(out, 'linux-unpacked', 'resources', 'app.asar');
    const tampered = await tamperedAsarStderr(asarPath, path.join(tmp, 'tamper'), bin, path.join(tmp, 'ud-tamper'));
    if (!tampered.stderr.includes('[self-attestation] hash-mismatch: dist/index.html')) {
      console.error('❌ app.asar を 1 byte 改竄しても自己検算が鳴らない (T-218) —— stderr:');
      console.error(tampered.stderr.split('\n').slice(-6).join('\n'));
      return 1;
    }
    if (tampered.pages.some((u) => u.includes('app.asar'))) {
      console.error(`❌ 改竄した app.asar で窓が開いた: ${tampered.pages.join(' | ')}`);
      return 1;
    }
    console.log('改竄: app.asar の dist/index.html を 1 byte 変えると、自己検算が理由を刷って窓を作らない (T-218)');

    // 5. onlyLoadAppFromAsar: resources/app/ に置いた別のコードを Electron が先に読まないこと (T-166)。
    //    Electron は app.asar → app/ の順に探す (実測: app.asar が在れば app/ は読まれない)。fuse が無いと
    //    app.asar を消して app/ を置くだけで、梱包物の外から差し替えたコードが走る。fuse はその落とし先を塞ぐ。
    const marker = path.join(tmp, 'planted-code-ran');
    const planted = path.join(out, 'linux-unpacked', 'resources', 'app');
    fs.rmSync(path.join(out, 'linux-unpacked', 'resources', 'app.asar'), { force: true });
    fs.mkdirSync(planted, { recursive: true });
    fs.writeFileSync(path.join(planted, 'package.json'), JSON.stringify({ name: 'planted', main: 'main.js' }));
    fs.writeFileSync(path.join(planted, 'main.js'), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran'); require('electron').app.quit();`);
    child = spawn(bin, ['--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud2')}`], { stdio: 'ignore' });
    await new Promise((res) => setTimeout(res, ALIVE_MS));
    if (fs.existsSync(marker)) {
      console.error('❌ app.asar を消して resources/app に置いた外のコードが実行された —— onlyLoadAppFromAsar が効いていない (T-166)');
      return 1;
    }
    console.log('差し替え: app.asar を消して resources/app に置いた外のコードは実行されない (onlyLoadAppFromAsar)');
    console.log('✅ 梱包した実物が起動し、UI が出た');
    return 0;
  } finally {
    if (child !== null) child.kill('SIGTERM');
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * app.asar を展開して `dist/index.html` に 1 byte 足し、固め直して起動する。stderr と (CDP で見える) 頁の URL を返す。
 * 起動した子は必ず止める。`@electron/asar` は electron-builder の依存なので同梱されている。
 */
async function tamperedAsarStderr(asarPath, workDir, bin, userData) {
  const asar = require('@electron/asar');
  asar.extractAll(asarPath, workDir);
  fs.appendFileSync(path.join(workDir, 'dist', 'index.html'), ' ');
  await asar.createPackage(workDir, asarPath);
  const port = DEBUG_PORT + 1;
  const child = spawn(bin, ['--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += String(d); });
  try {
    await new Promise((res) => setTimeout(res, ALIVE_MS));
    let pages = [];
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) })).json();
      pages = list.map((p) => String(p.url));
    } catch {
      pages = []; // 止まっていれば CDP も開かない (開いていても modal の裏で答えなければ 3 秒で諦める)
    }
    return { stderr, pages };
  } finally {
    // 断った主プロセスは `dialog.showErrorBox` (同期・modal) の中で止まっており SIGTERM を受け取らない (実測) —— SIGKILL
    child.kill('SIGKILL');
  }
}

function selfTest() {
  let bad = 0;
  const check = (label, ok) => {
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  };
  console.log('self-test:');
  const report = ['Analyzing app: x', 'Fuse Version: v1', '  RunAsNode is Disabled', '  EnableCookieEncryption is Enabled', '  undefined is Enabled'].join('\n');
  const parsed = parseFuseReport(report);
  check('fuse の読み取り: Enabled / Disabled を真偽へ', parsed.RunAsNode === false && parsed.EnableCookieEncryption === true);
  check('fuse の食い違い: 設定 true / 梱包物 false を捕まえる', fuseProblems({ grantFileProtocolExtraPrivileges: true }, { GrantFileProtocolExtraPrivileges: false }).length === 1);
  check('fuse の一致: 食い違いが無ければ空', fuseProblems({ runAsNode: false, enableCookieEncryption: true }, parsed).length === 0);
  check('fuse の欠落: 梱包物の読み取りに無い名前を捕まえる', fuseProblems({ runAsNode: false }, {}).length === 1);
  check('fuse 設定が空なら落とす (走査が空虚でない)', fuseProblems({}, parsed).length === 1);
  const good = { url: 'file:///x/resources/app.asar/dist/index.html#home', bodyChars: 2760, bridge: 'object', fileFetch: 'blocked: Failed to fetch' };
  check('窓: 正常は問題なし', windowProblems(good).length === 0);
  check('窓: 実測した白画面 (chrome-error) を捕まえる', windowProblems({ ...good, url: 'chrome-error://chromewebdata/', bodyChars: 0 }).length >= 2);
  check('窓: app.asar でない url を捕まえる (梱包物を見ていない)', windowProblems({ ...good, url: 'file:///x/dist/index.html' }).length === 1);
  check('窓: bridge が無いのを捕まえる', windowProblems({ ...good, bridge: 'undefined' }).length === 1);
  check('窓: file:// の任意読み取りが通ったのを捕まえる', windowProblems({ ...good, fileFetch: 'resolved 200' }).length === 1);
  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) process.exit(selfTest());
  run().then((code) => process.exit(code), (e) => {
    console.error(`❌ ${e && e.stack ? e.stack : e}`);
    process.exit(1);
  });
}

module.exports = { parseFuseReport, fuseProblems, windowProblems };
