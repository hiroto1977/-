#!/usr/bin/env node
/**
 * build-integrity-manifest — **出荷する全ファイルの sha256 を `dist-electron/integrity.json` に書く**
 * (2026-10-29 · パス 553 · threat: T-218)。
 *
 * `npm run build` の `vite build` と `electron-builder` の**間**で走る (package.json)。梱包版の主プロセスは
 * 起動時に `src/main/selfAttestation.ts` の `verifyShippedFiles` でこの表と突き合わせ、1 byte でも違えば
 * 起動しない。歩く範囲・算法・表の形は `.ts` と**同じ 1 つ**で、`.cjs` は `.ts` を require できないので写し ——
 * 同じ標本で 1 字も違わないことは `src/main/__tests__/selfAttestationParity.test.ts` が留める
 * (法則 `copy-pinned-by-parity`)。**ここを直したら `.ts` も直す** (パリティ検査が鳴る)。
 *
 * 使い方:
 *   node scripts/build-integrity-manifest.cjs                # リポジトリの根の出荷物を歩いて書く
 *   node scripts/build-integrity-manifest.cjs --root <dir>   # 別の根 (検査の写しの木) を歩いて書く
 *   node scripts/build-integrity-manifest.cjs --self-test    # 一時の木で 書く → 読む → 1 件変える → 鳴る
 *
 * 失敗の向き: 出荷物に 1 件も無ければ **書かずに exit 1** (空の表を出荷すると、検算が「出荷物が 0 件」を
 * 正として通す —— 法則 `count-has-floor`)。天井を超えるファイルも exit 1。
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

/** `src/main/selfAttestation.ts` と同じ値。 */
const MANIFEST_FILE = 'dist-electron/integrity.json';
const MANIFEST_VERSION = 1;
const HASH_ALGORITHM = 'sha256';
const SHIPPED_DIRS = ['dist', 'dist-electron'];
const SHIPPED_FILES = ['build/icon.png']; // package.json は electron-builder が梱包時に書き換えるので表に載せない (`.ts` の docblock)
const MAX_SHIPPED_FILE_BYTES = 16 * 1024 * 1024;
const MAX_SHIPPED_FILES = 10_000;

function sha256Hex(bytes) {
  return crypto.createHash(HASH_ALGORITHM).update(bytes).digest('hex');
}

function manifestRoot(files) {
  const lines = Object.keys(files)
    .sort()
    .map((p) => `${p}\n${files[p]}\n`)
    .join('');
  return sha256Hex(Buffer.from(lines, 'utf8'));
}

function toPosix(rel) {
  return rel.split(path.sep).join('/');
}

/** 出荷物の全ファイル (根からの相対・posix・昇順)。manifest 自身は外す。 */
function listShippedFiles(appRoot) {
  const out = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const abs = path.join(dir, name);
      const st = fs.statSync(abs);
      if (st.isDirectory()) walk(abs);
      else if (st.isFile()) {
        out.push(toPosix(path.relative(appRoot, abs)));
        if (out.length > MAX_SHIPPED_FILES) throw new Error(`出荷物が ${MAX_SHIPPED_FILES} 件を超えている`);
      }
    }
  };
  for (const d of SHIPPED_DIRS) {
    const abs = path.join(appRoot, d);
    if (fs.existsSync(abs)) walk(abs);
  }
  for (const f of SHIPPED_FILES) {
    if (fs.existsSync(path.join(appRoot, f))) out.push(f);
  }
  return out.filter((p) => p !== MANIFEST_FILE).sort();
}

function buildManifest(appRoot) {
  const files = {};
  for (const rel of listShippedFiles(appRoot)) {
    const abs = path.join(appRoot, rel);
    const size = fs.statSync(abs).size;
    if (size > MAX_SHIPPED_FILE_BYTES) throw new Error(`${rel} は ${size} byte で天井 ${MAX_SHIPPED_FILE_BYTES} を超えている`);
    files[rel] = sha256Hex(fs.readFileSync(abs));
  }
  return { version: MANIFEST_VERSION, algorithm: HASH_ALGORITHM, files, root: manifestRoot(files) };
}

function serializeManifest(m) {
  const files = {};
  for (const k of Object.keys(m.files).sort()) files[k] = m.files[k];
  return `${JSON.stringify({ version: m.version, algorithm: m.algorithm, files, root: m.root }, null, 2)}\n`;
}

/** 歩いて書く。出荷物が 0 件なら書かない。書いた件数を返す。 */
function writeManifest(appRoot) {
  const m = buildManifest(appRoot);
  const n = Object.keys(m.files).length;
  if (n === 0) throw new Error(`出荷物が 0 件 (${SHIPPED_DIRS.join(', ')} が無い) —— 先に npm run build:renderer`);
  const out = path.join(appRoot, MANIFEST_FILE);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, serializeManifest(m));
  return n;
}

function selfTest() {
  let bad = 0;
  const check = (label, ok) => {
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  };
  console.log('self-test:');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'integrity-manifest-'));
  try {
    fs.mkdirSync(path.join(tmp, 'dist', 'assets'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'dist-electron'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'dist', 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(tmp, 'dist', 'assets', 'a.js'), 'x');
    fs.writeFileSync(path.join(tmp, 'dist-electron', 'main.js'), 'main');
    fs.writeFileSync(path.join(tmp, 'package.json'), '{}');
    fs.mkdirSync(path.join(tmp, 'build'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'build', 'icon.png'), 'png');
    const n = writeManifest(tmp);
    check('出荷物 4 件を書く (package.json は載らない)', n === 4 && !('package.json' in JSON.parse(fs.readFileSync(path.join(tmp, MANIFEST_FILE), 'utf8')).files));
    const m = JSON.parse(fs.readFileSync(path.join(tmp, MANIFEST_FILE), 'utf8'));
    check('鍵は昇順の posix 相対パス', JSON.stringify(Object.keys(m.files)) === JSON.stringify(['build/icon.png', 'dist-electron/main.js', 'dist/assets/a.js', 'dist/index.html']));
    check('manifest 自身は表に載らない', !(MANIFEST_FILE in m.files));
    check('root は files から導いた値', m.root === manifestRoot(m.files));
    check('2 度書いても 1 字も変わらない (決定的)', serializeManifest(buildManifest(tmp)) === fs.readFileSync(path.join(tmp, MANIFEST_FILE), 'utf8'));
    fs.writeFileSync(path.join(tmp, 'dist', 'assets', 'a.js'), 'y');
    check('1 件変えると hash が変わる', buildManifest(tmp).files['dist/assets/a.js'] !== m.files['dist/assets/a.js']);
    check('1 件変えると root も変わる', buildManifest(tmp).root !== m.root);
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'integrity-manifest-empty-'));
    try {
      let threw = false;
      try { writeManifest(empty); } catch { threw = true; }
      check('出荷物が 0 件なら書かずに投げる', threw && !fs.existsSync(path.join(empty, MANIFEST_FILE)));
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(bad === 0 ? '✅ self-test 全件一致' : `❌ self-test ${bad} 件不一致`);
  return bad === 0 ? 0 : 1;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const i = argv.indexOf('--root');
  const appRoot = i >= 0 && argv[i + 1] !== undefined ? path.resolve(argv[i + 1]) : REPO_ROOT;
  try {
    const n = writeManifest(appRoot);
    console.log(`✅ ${MANIFEST_FILE}: 出荷物 ${n} 件の ${HASH_ALGORITHM} を書きました`);
    return 0;
  } catch (e) {
    console.error(`❌ 検算表を書けません: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

module.exports = { MANIFEST_FILE, listShippedFiles, buildManifest, serializeManifest, manifestRoot, writeManifest, selfTest };

if (require.main === module) process.exit(main(process.argv.slice(2)));
