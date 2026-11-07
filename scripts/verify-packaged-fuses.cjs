#!/usr/bin/env node
/**
 * verify-packaged-fuses — **release.yml の build job で、梱包物に焼き込まれた fuse を
 * electron-builder.json の `electronFuses` と照合する。**
 *
 * ## なぜ要るのか (2026-10-28 · threat: T-209)
 *
 * fuse (RunAsNode の無効化・onlyLoadAppFromAsar ほか) は crown-jewels の「主プロセスでのコード実行」を
 * 防ぐ層だが、それが**実際に焼き込まれたか**を見ていたのは `smoke:packaged` だけで、それは e2e.yml の
 * 手動実行・`run-e2e` ラベルでしか走らない。配布物を作って公開する release.yml は `--check-bundle` と
 * `verify-release-artifacts` しか通さず、fuse を 1 度も読まずに署名して公開していた。electron-builder が
 * fuse の焼き込みを黙って飛ばす形 (設定の鍵の綴り違い・版の差し替え) は、設定 JSON を読む検査
 * (`electronFuses.test.ts`) には構造的に映らない —— **焼き込まれた値は梱包物から読むしかない**。
 *
 * ## 何をするか
 *
 * `release/` (electron-builder の `directories.output`) に残る unpacked の app を OS ごとの置き場所で探し、
 * `@electron/fuses read --app` で焼き込まれた値を読み、`smoke-packaged.cjs` と同じ `fuseProblems` で照合する。
 * **1 つも見つからなければ落とす** (fail closed —— 「読む物が無かった」を「食い違いが無かった」と混ぜない)。
 *
 * 使い方:
 *   npm run verify:packaged-fuses                           # self-test → release/ を見る (release.yml の build job)
 *   node scripts/verify-packaged-fuses.cjs --release-dir X # 置き場所を替える (検査・手元の実測)
 *   node scripts/verify-packaged-fuses.cjs --self-test
 */
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { parseFuseReport, fuseProblems } = require('./smoke-packaged.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * electron-builder が unpacked の app を置く場所 (インストーラの隣に残る)。
 *   linux:   <out>/linux-unpacked/<name>            (name = package.json の name)
 *   windows: <out>/win-unpacked/<productName>.exe
 *   macOS:   <out>/mac または mac-<arch>/<productName>.app (arch ごとに分かれる)
 * 置き場所は electron-builder の規約で、設定で動かしていない (electron-builder.json に executableName は無い)。
 */
function locatePackagedApps(releaseDir, { platform, productName, packageName }) {
  const found = [];
  if (!fs.existsSync(releaseDir)) return found;
  const entries = fs.readdirSync(releaseDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  if (platform === 'linux') {
    for (const d of entries.filter((n) => /^linux(-[\w-]+)?-unpacked$/.test(n))) {
      const bin = path.join(releaseDir, d, packageName);
      if (fs.existsSync(bin)) found.push(bin);
    }
  } else if (platform === 'win32') {
    for (const d of entries.filter((n) => /^win(-[\w-]+)?-unpacked$/.test(n))) {
      const exe = path.join(releaseDir, d, `${productName}.exe`);
      if (fs.existsSync(exe)) found.push(exe);
    }
  } else if (platform === 'darwin') {
    for (const d of entries.filter((n) => /^mac(-[\w-]+)?$/.test(n))) {
      const app = path.join(releaseDir, d, `${productName}.app`);
      if (fs.existsSync(app)) found.push(app);
    }
  }
  return found.sort();
}

/** 読み取りの結果を照合して、人が読む行にする。`readFuses` は差し替え可能 (検査は梱包物を作らない)。 */
function verifyFuses(apps, configFuses, readFuses) {
  const problems = [];
  if (apps.length === 0) problems.push('梱包した app が 1 つも見つからない (electron-builder の出力先か、置き場所の規約が変わった)');
  for (const app of apps) {
    const report = readFuses(app);
    if (report === null) {
      problems.push(`${app}: fuse を読めなかった`);
      continue;
    }
    for (const p of fuseProblems(configFuses, parseFuseReport(report))) problems.push(`${app}: ${p}`);
  }
  return problems;
}

function readFusesWithCli(app) {
  const r = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, 'node_modules/@electron/fuses/dist/bin.js'), 'read', '--app', app],
    { encoding: 'utf8' },
  );
  return r.status === 0 ? r.stdout : null;
}

function run(argv) {
  const i = argv.indexOf('--release-dir');
  const releaseDir = i >= 0 && argv[i + 1] !== undefined ? path.resolve(argv[i + 1]) : path.join(REPO_ROOT, 'release');
  const builder = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'electron-builder.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const apps = locatePackagedApps(releaseDir, { platform: process.platform, productName: builder.productName, packageName: pkg.name });
  const problems = verifyFuses(apps, builder.electronFuses ?? {}, readFusesWithCli);
  if (problems.length > 0) {
    console.error(`❌ 梱包物の fuse の照合で ${problems.length} 件:`);
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  console.log(`✅ 梱包物 ${apps.length} 件の fuse が electron-builder.json の ${Object.keys(builder.electronFuses).length} 件と一致`);
  for (const a of apps) console.log(`  ${path.relative(REPO_ROOT, a)}`);
  return 0;
}

function selfTest() {
  const os = require('node:os');
  let bad = 0;
  const check = (label, ok) => {
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  };
  console.log('self-test:');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vpf-'));
  const names = { productName: 'Service Hub', packageName: 'service-hub-desktop' };
  try {
    const mk = (...p) => { fs.mkdirSync(path.join(tmp, ...p.slice(0, -1)), { recursive: true }); fs.writeFileSync(path.join(tmp, ...p), ''); };
    mk('linux-unpacked', 'service-hub-desktop');
    mk('win-unpacked', 'Service Hub.exe');
    mk('mac', 'Service Hub.app', 'Contents', 'Info.plist');
    mk('mac-arm64', 'Service Hub.app', 'Contents', 'Info.plist');
    mk('linux-unpacked', 'other-binary');
    check('linux: linux-unpacked/<package name> を 1 件', locatePackagedApps(tmp, { platform: 'linux', ...names }).length === 1);
    check('windows: win-unpacked/<productName>.exe を 1 件', locatePackagedApps(tmp, { platform: 'win32', ...names }).length === 1);
    check('macOS: mac と mac-arm64 の <productName>.app を 2 件', locatePackagedApps(tmp, { platform: 'darwin', ...names }).length === 2);
    check('名前が違う物は拾わない', locatePackagedApps(tmp, { platform: 'linux', productName: 'X', packageName: 'nope' }).length === 0);
    check('出力先が無ければ 0 件 (投げない)', locatePackagedApps(path.join(tmp, 'none'), { platform: 'linux', ...names }).length === 0);
    const good = '  RunAsNode is Disabled\n  EnableCookieEncryption is Enabled\n';
    const cfg = { runAsNode: false, enableCookieEncryption: true };
    check('0 件は落ちる (fail closed)', verifyFuses([], cfg, () => good).length === 1);
    check('一致は問題なし', verifyFuses(['a'], cfg, () => good).length === 0);
    check('食い違いは app 名つきで鳴る', verifyFuses(['a'], cfg, () => '  RunAsNode is Enabled\n  EnableCookieEncryption is Enabled\n').some((p) => p.startsWith('a: RunAsNode')));
    check('読めなかった app は鳴る', verifyFuses(['a'], cfg, () => null).length === 1);
    check('設定が空なら鳴る (走査が空虚でない)', verifyFuses(['a'], {}, () => good).length === 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

if (require.main === module) {
  process.exit(process.argv.includes('--self-test') ? selfTest() : run(process.argv.slice(2)));
}

module.exports = { locatePackagedApps, verifyFuses };
