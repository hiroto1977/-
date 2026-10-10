#!/usr/bin/env node
/**
 * リリース成果物の完全性ゲート。
 *
 * ## なぜ要るのか (2026-08-24 の実測)
 *
 * `release.yml` は 3 OS の matrix を `fail-fast: false` で回し、
 * `softprops/action-gh-release` に `fail_on_unmatched_files: false` を
 * 渡している。この 2 つが噛み合うと **1 プラットフォームぶん丸ごと欠けた
 * リリースが、全ジョブ緑のまま公開される**。しかもこの `false` だけは、
 * 隅々まで注釈のあるこのワークフローの中で**理由が書かれていない**。
 *
 * `fail_on_unmatched_files: true` へ倒すだけでは足りず、かつ危ない:
 *
 *   - 危ない: `files:` には `release/*.dmg.blockmap` も並んでいる。blockmap は
 *     electron-builder が必ず出すとは限らないので、`true` は**正しい
 *     リリースを赤にしうる**。
 *   - 足りない: `electron-builder.json` は dmg を `arch: ["x64","arm64"]` で
 *     宣言している。arm64 だけ出て x64 が出なくても `release/*.dmg` は
 *     マッチするので、`true` にしても**気付けない**。
 *
 * そこで「宣言した数だけ出たか」を `electron-builder.json` から導いて確かめる。
 * 一覧を手で持たないので、target や arch を足した日に自動で追随する。
 *
 * ## これが見張れないこと (正直に書く)
 *
 * v0.1.0 で実際に起きたのは**別の失敗**だった。2026-07-27 07:56 の最初のランが
 * `Service-Hub-0.1.0.AppImage` を上げ、その 16 時間後 23:55 の 2 回目のランが
 * `Service.Hub-0.1.0.AppImage` を上げ、**最初のぶんが消されないまま今も
 * 公開されている**。同じ版の AppImage が 2 つ並び、チェックサムも無いので、
 * どちらが正規のビルドか利用者には判定できない。
 *
 * このスクリプトはランの中で「今回のビルドが何を出したか」しか見ないので、
 * **前のランの残骸は検出できない**。公開済み資産の削除は GitHub の API を
 * 持たないと出来ず、持ち主の判断でもあるので、そちらは docs/REMAINING_WORK.md
 * に残してある。
 *
 * ただし「どちらが正規か判定できない」ほうは 2026-08-28 に塞いだ ——
 * `scripts/checksum-release.cjs` が**同じランの中で** SHA-256 を書き、
 * `release.yml` がそれも一緒に公開する。以後は並んだ資産のどちらを取るかが
 * 決まる。**これは改竄検知ではない** (署名の無いチェックサムが見つけられるのは
 * 破損と取り違えまで) —— その区別は checksum-release.cjs の冒頭に書いた。
 *
 * Run via:  RUNNER_OS=Linux node scripts/verify-release-artifacts.cjs
 *           node scripts/verify-release-artifacts.cjs --self-test
 *
 * Exits 1 on any violation.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(REPO_ROOT, 'electron-builder.json');

/**
 * electron-builder の target 名 → 出てくる主要インストーラの拡張子。
 *
 * `perArch` は「arch を 1 つ足すとファイルが 1 つ増えるか」。dmg / AppImage /
 * deb は arch ごとに別ファイルだが、**nsis は既定で全 arch を 1 本の
 * インストーラに収める**ので増えない。ここを一律 true にすると、
 * win を multi-arch にした日に**正しいリリースが赤になる**。
 *
 * blockmap や latest.yml は入れない —— 出ないことがあり、
 * 「出ていないと赤」にする根拠が無い。
 */
const TARGET_ARTIFACTS = {
  dmg: { ext: '.dmg', perArch: true },
  nsis: { ext: '.exe', perArch: false },
  appimage: { ext: '.appimage', perArch: true },
  deb: { ext: '.deb', perArch: true },
  rpm: { ext: '.rpm', perArch: true },
  zip: { ext: '.zip', perArch: true },
  msi: { ext: '.msi', perArch: false },
};

/** RUNNER_OS などの表記を electron-builder.json のキーへ寄せる。 */
function osKeyOf(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'linux') return 'linux';
  if (v === 'macos' || v === 'mac' || v === 'darwin') return 'mac';
  if (v === 'windows' || v === 'win' || v === 'win32') return 'win';
  return null;
}

/**
 * 宣言から「拡張子ごとに最低何本要るか」を出す。
 * 知らない target は**黙って飛ばさず投げる** —— 見張りの穴になるので。
 */
function requiredCounts(config, osKey) {
  const section = config[osKey];
  if (!section || !section.target) {
    throw new Error(`electron-builder.json に ${osKey}.target がありません`);
  }
  const targets = Array.isArray(section.target) ? section.target : [section.target];
  const required = new Map();
  for (const t of targets) {
    const name = typeof t === 'string' ? t : t && t.target;
    if (typeof name !== 'string') {
      throw new Error(`${osKey}.target に名前の読めない項目があります: ${JSON.stringify(t)}`);
    }
    const spec = TARGET_ARTIFACTS[name.toLowerCase()];
    if (spec === undefined) {
      throw new Error(
        `target "${name}" の成果物の形を知りません。scripts/verify-release-artifacts.cjs の ` +
          'TARGET_ARTIFACTS に足してください (拡張子と perArch)。',
      );
    }
    const archs = typeof t === 'object' && t !== null && Array.isArray(t.arch) ? t.arch.length : 1;
    const need = spec.perArch ? archs : 1;
    required.set(spec.ext, (required.get(spec.ext) || 0) + need);
  }
  return required;
}

/**
 * 宣言と実物を突き合わせる。**純関数** —— ファイル名の配列を受けるので
 * self-test に一時ディレクトリが要らない。
 */
function check(config, osRaw, fileNames) {
  const osKey = osKeyOf(osRaw);
  if (osKey === null) return [`OS を判定できません: ${JSON.stringify(osRaw)}`];

  const required = requiredCounts(config, osKey);
  const problems = [];
  for (const [ext, need] of required) {
    const hits = fileNames.filter((f) => f.toLowerCase().endsWith(ext));
    if (hits.length < need) {
      problems.push(
        `${osKey}: ${ext} が ${need} 本必要なのに ${hits.length} 本しかありません` +
          (hits.length > 0 ? ` (${hits.join(', ')})` : ''),
      );
    }
  }
  return problems;
}

function selfTest() {
  const cfg = {
    mac: { target: [{ target: 'dmg', arch: ['x64', 'arm64'] }] },
    win: { target: [{ target: 'nsis', arch: ['x64'] }] },
    linux: { target: [{ target: 'AppImage', arch: ['x64'] }, { target: 'deb', arch: ['x64'] }] },
  };
  // v0.1.0 時点の書き方 (arch 無しの素の文字列) も読めること
  const cfgOld = { mac: { target: 'dmg' }, win: { target: 'nsis' }, linux: { target: ['AppImage', 'deb'] } };

  const cases = [
    ['linux 正常', cfg, 'Linux', ['Service Hub-0.1.0.AppImage', 'service-hub_0.1.0_amd64.deb'], 0],
    ['linux: deb が無い', cfg, 'Linux', ['Service Hub-0.1.0.AppImage'], 1],
    ['linux: 空', cfg, 'Linux', [], 2],
    ['mac 正常 (x64+arm64)', cfg, 'macOS', ['a-x64.dmg', 'a-arm64.dmg'], 0],
    ['mac: arm64 だけ = 宣言の半分', cfg, 'macOS', ['a-arm64.dmg'], 1],
    ['mac: blockmap は dmg に数えない', cfg, 'macOS', ['a-arm64.dmg', 'a-arm64.dmg.blockmap'], 1],
    ['win 正常', cfg, 'Windows', ['Service Hub Setup 0.1.0.exe'], 0],
    ['win: blockmap しか無い', cfg, 'Windows', ['Service Hub Setup 0.1.0.exe.blockmap'], 1],
    ['win: 中間物だけ', cfg, 'Windows', ['builder-effective-config.yaml', 'latest.yml'], 1],
    ['旧記法 (arch 無し) の mac は 1 本で足りる', cfgOld, 'macOS', ['a-arm64.dmg'], 0],
    ['旧記法 linux は 2 本要る', cfgOld, 'Linux', ['a.AppImage'], 1],
    ['大文字小文字を問わない', cfg, 'Linux', ['a.appimage', 'b.DEB'], 0],
    ['OS 不明は落とす', cfg, 'Plan9', ['a.dmg'], 1],
  ];

  let bad = 0;
  for (const [label, config, osRaw, files, want] of cases) {
    let got;
    try {
      got = check(config, osRaw, files).length;
    } catch (e) {
      console.error(`  ❌ ${label}: 例外 ${e.message}`);
      bad += 1;
      continue;
    }
    if (got !== want) {
      console.error(`  ❌ ${label}: 期待 ${want} 件 / 実際 ${got} 件`);
      bad += 1;
    }
  }

  // 知らない target は投げること (黙って通ると見張りの穴になる)
  try {
    requiredCounts({ linux: { target: ['snap'] } }, 'linux');
    console.error('  ❌ 未知の target "snap" が素通りしました');
    bad += 1;
  } catch {
    /* 期待どおり */
  }

  // 本物の electron-builder.json が 3 OS とも読めること (設定が動いたら気付く)
  const real = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  for (const k of ['linux', 'mac', 'win']) {
    const counts = requiredCounts(real, k);
    if (counts.size === 0) {
      console.error(`  ❌ 実物の ${k} から必要本数が 1 つも出ませんでした`);
      bad += 1;
    }
  }

  if (bad > 0) {
    console.error(`❌ self-test ${bad} 件不一致`);
    return 1;
  }
  console.log(`✅ self-test 全件一致 (${cases.length + 4} 件)`);
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();

  const dirArg = argv.indexOf('--dir');
  // resolve であって join ではない —— join は絶対パスを渡されると REPO_ROOT に
  // 継ぎ足してしまい、存在しない場所を「0 件」と報告する (自己テストで露見)。
  const dir = path.resolve(REPO_ROOT, dirArg >= 0 ? argv[dirArg + 1] : 'release');
  const osRaw = process.env.RUNNER_OS || process.platform;

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];

  const problems = check(config, osRaw, files);
  console.log(`${osRaw}: ${dir} に ${files.length} 個のファイル`);
  for (const f of files) console.log(`  ${f}`);

  if (problems.length === 0) {
    console.log('✅ 宣言どおりの配布物が揃っています');
    return 0;
  }
  console.error(`❌ 配布物が宣言と合いません (${problems.length} 件):`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('electron-builder.json の target/arch と release/ の中身を突き合わせてください。');
  return 1;
}

module.exports = { check, requiredCounts, osKeyOf, TARGET_ARTIFACTS };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
