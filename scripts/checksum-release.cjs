#!/usr/bin/env node
/**
 * 公開する配布物の SHA-256 を、**同じランの中で**書き出す。
 *
 * ## なぜ要るのか (v0.1.0 で実際に起きたこと)
 *
 * 2026-07-27 07:56 の最初のランが `Service-Hub-0.1.0.AppImage` を上げ、
 * その 16 時間後 23:55 の 2 回目のランが `Service.Hub-0.1.0.AppImage` を
 * 上げた。**最初のぶんは消されないまま今も公開されている。**
 * 同じ版の AppImage が 2 つ並び、サイズも 36 バイトしか違わない
 * (131,952,302 / 131,952,338)。**どちらが正規のビルドか、利用者には
 * 判定する材料が無かった。**
 *
 * チェックサムを同じランで出しておけば、少なくとも
 * 「この SHA256SUMS を出したランは、この AppImage を出した」
 * が言える。並んだ 2 つのどちらを取るかが決まる。
 *
 * ## これが**言えないこと** (正直に書く)
 *
 * **これは改竄検知ではない。** 署名の無いチェックサムが見つけられるのは
 * 転送中の破損と、上のような取り違えまでである。リリース資産を書き換え
 * られる者は、隣に置いてある SHA256SUMS も同じ手で書き換えられる。
 * この repo は同じ誤りを一度している —— 平文バックアップの SHA-256 を
 * 「改ざん検知」と 4 か所 (UI 含む) で称していた (本 PR の #19)。
 * 同じ言葉をここで繰り返さない。
 *
 * 本当の改竄耐性は署名であり、それには証明書 (`CSC_LINK` ほかの secrets) が
 * 要る。`release.yml` は**入っていれば効く**形で既に配線してあるが、
 * 用意できるのは持ち主だけなので、ここでは触れない。
 *
 * Run via:  RUNNER_OS=Linux node scripts/checksum-release.cjs
 *           node scripts/checksum-release.cjs --self-test
 *
 * Exits 1 on any violation.
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { TARGET_ARTIFACTS, osKeyOf } = require('./verify-release-artifacts.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * 配る物の拡張子。`TARGET_ARTIFACTS` から採るので、target を足した日に
 * **自動で追随する** —— ここに一覧を手で持つと、必ず片方だけ更新される。
 *
 * `.blockmap` は electron-builder が差分更新に使う副産物で、これも公開される
 * (`release.yml` の glob に入っている) ので数える。
 */
function shippableExtensions() {
  const exts = new Set(Object.values(TARGET_ARTIFACTS).map((s) => s.ext));
  exts.add('.blockmap');
  return exts;
}

/**
 * 書き出す先の名前。**1 か所で決める** —— 書く側と「拾わない側」が
 * 別々に綴りを持つと、片方だけ直した日に自分自身を巻き込む。
 */
function sumsFileName(osKey) {
  return `SHA256SUMS-${osKey}.txt`;
}

/**
 * 名前の一覧から「チェックサムを取るべき物」を選ぶ。**純関数**なので
 * self-test に一時ディレクトリが要らない。
 *
 * 中間物 (`latest-linux.yml` / `builder-effective-config.yaml`) と
 * 出力自身を除く仕組みは**拡張子の許可制だけ**である。最初は
 * `INTERMEDIATE` という名前の除外規則も併せて書いたが、実測すると
 * **一度も発火しなかった** —— そこに挙げた綴りはすべて許可制の側で
 * 既に落ちていた。**発火しない規則は守りではなく飾り**なので消した。
 * 代わりに、効いている当の不変条件 (`.txt` は配布物ではない) を
 * self-test で名指しして留める。ここが破れた日に鳴る。
 *
 * 出力は**名前で整列**する。整列しないと `readdir` の順に依存して、
 * 同じビルドから違う SHA256SUMS が出る (再現性の主張が崩れる)。
 */
function shippableFiles(names) {
  const exts = shippableExtensions();
  return names
    .filter((n) => {
      const lower = n.toLowerCase();
      for (const e of exts) if (lower.endsWith(e)) return true;
      return false;
    })
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * `sha256sum` と同じ書式 (`<hex>  <name>`) で本文を組む。
 * 空白 2 つはバイナリモードの印で、`sha256sum -c` がそう読む。
 */
function sumsBody(entries) {
  return entries.map(([name, hex]) => `${hex}  ${name}`).join('\n') + '\n';
}

/** ファイル 1 つの SHA-256。大きい (130MB) ので一括読みはしない。 */
function hashFile(absPath) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(absPath, 'r');
  try {
    const buf = Buffer.alloc(1024 * 1024);
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (n === 0) break;
      h.update(buf.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}

/**
 * 1 ラン分のチェックサムを組む。`hash` を差せるので単体で試せる。
 * 対象が 0 件なら**問題として返す** —— 空の SHA256SUMS を静かに公開すると
 * 「チェックサムはあります」が嘘になる。
 */
function buildSums(dir, names, hash = hashFile) {
  const targets = shippableFiles(names);
  if (targets.length === 0) {
    return { problems: ['チェックサムを取る対象が 1 件もありません'], body: null, targets };
  }
  const entries = targets.map((n) => [n, hash(path.join(dir, n))]);
  return { problems: [], body: sumsBody(entries), targets };
}

function selfTest() {
  const fake = (p) => 'x'.repeat(64 - String(p).length % 64).slice(0, 64);
  let bad = 0;
  const eq = (label, got, want) => {
    const g = JSON.stringify(got);
    const w = JSON.stringify(want);
    if (g !== w) {
      console.error(`  ❌ ${label}: 期待 ${w} / 実際 ${g}`);
      bad += 1;
    } else {
      console.log(`  ✓ ${label}`);
    }
  };

  eq(
    'インストーラを拾う',
    shippableFiles(['Service Hub-0.1.0.AppImage', 'app_0.1.0_amd64.deb']),
    ['Service Hub-0.1.0.AppImage', 'app_0.1.0_amd64.deb'],
  );
  eq('blockmap も配るので拾う', shippableFiles(['a.exe.blockmap']), ['a.exe.blockmap']);
  eq('中間物は拾わない (latest.yml)', shippableFiles(['latest-linux.yml']), []);
  eq('中間物は拾わない (builder-effective-config)', shippableFiles(['builder-effective-config.yaml']), []);
  eq('関係ない物は拾わない', shippableFiles(['linux-unpacked', 'README.md']), []);

  // ★ 自分自身を拾わない**理由**を留める。
  //
  // 「`shippableFiles(['SHA256SUMS-linux.txt'])` が空である」だけを書くと、
  // 除外規則を丸ごと消しても通ってしまう (実際に対照で確かめた —— 消しても
  // 鳴らなかった)。効いているのは**許可制のほうで `.txt` が配布物でない**
  // ことなので、その不変条件を直接名指しする。`.txt` を出す target が
  // 増えた日に、ここが鳴って再帰の危険を知らせる。
  eq('★ 出力の拡張子が配布物の許可に入っていない (再帰しない理由)',
    [...shippableExtensions()].some((e) => sumsFileName('linux').toLowerCase().endsWith(e)), false);
  eq('★ 出力の名前は 1 か所で決まる', sumsFileName('mac'), 'SHA256SUMS-mac.txt');
  eq('その結果として自分自身は拾われない', shippableFiles([sumsFileName('linux')]), []);
  eq('大文字小文字を問わない', shippableFiles(['A.APPIMAGE']), ['A.APPIMAGE']);
  eq(
    '★ 名前で整列する (readdir の順に依らない)',
    shippableFiles(['z.deb', 'a.deb', 'm.AppImage']),
    ['a.deb', 'm.AppImage', 'z.deb'],
  );

  // 書式: sha256sum -c が読める形か (空白 2 つ)
  eq('書式は `<hex>  <name>`', sumsBody([['a.deb', 'ff']]), 'ff  a.deb\n');
  eq('複数行は改行で連なり、末尾にも改行が付く', sumsBody([['a', '1'], ['b', '2']]), '1  a\n2  b\n');

  // 0 件は静かに通さない
  const empty = buildSums('/nowhere', ['latest.yml'], fake);
  eq('★ 対象 0 件は問題として返す', empty.problems.length, 1);
  eq('★ 対象 0 件のとき本文を作らない', empty.body, null);

  // hash を差して一巡させる (実ファイル不要)
  const built = buildSums('/nowhere', ['b.deb', 'a.AppImage'], () => 'a'.repeat(64));
  eq('一巡: 問題なし', built.problems.length, 0);
  eq('一巡: 整列された 2 行', built.body, `${'a'.repeat(64)}  a.AppImage\n${'a'.repeat(64)}  b.deb\n`);

  // 実物の hashFile が動くこと (標本を置いて既知の値と比べる)
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'cksum-'));
  try {
    const p = path.join(tmp, 'sample.bin');
    fs.writeFileSync(p, 'abc');
    // sha256("abc") は公表値。ここが合わないなら実装ではなく環境を疑う。
    eq(
      '★ hashFile が既知の値を出す (sha256 "abc")',
      hashFile(p),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    // 1MB 境界をまたぐ読み込みで取りこぼさないこと
    const big = Buffer.alloc(1024 * 1024 + 7, 0x41);
    const q = path.join(tmp, 'big.bin');
    fs.writeFileSync(q, big);
    eq(
      '★ 1MB を超えても全部読む (分割読みの取りこぼし)',
      hashFile(q),
      crypto.createHash('sha256').update(big).digest('hex'),
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // 拡張子表は verify-release-artifacts と同じ物を見ていること
  eq('★ 拡張子は TARGET_ARTIFACTS から採っている', shippableExtensions().has('.dmg'), true);

  if (bad > 0) {
    console.error(`❌ self-test ${bad} 件不一致`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();

  const dirArg = argv.indexOf('--dir');
  const dir = path.resolve(REPO_ROOT, dirArg >= 0 ? argv[dirArg + 1] : 'release');
  const osRaw = process.env.RUNNER_OS || process.platform;
  const osKey = osKeyOf(osRaw);
  if (osKey === null) {
    console.error(`❌ OS を判定できません: ${JSON.stringify(osRaw)}`);
    return 1;
  }

  const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const { problems, body, targets } = buildSums(dir, names, hashFile);
  if (problems.length > 0) {
    console.error(`❌ ${problems.join(' / ')}`);
    console.error(`  ${dir} にあったもの: ${names.join(', ') || '(空)'}`);
    return 1;
  }

  const out = path.join(dir, sumsFileName(osKey));
  fs.writeFileSync(out, body);
  console.log(`✅ ${targets.length} 件のチェックサムを ${path.basename(out)} に書きました`);
  for (const line of body.trimEnd().split('\n')) console.log(`  ${line}`);
  return 0;
}

module.exports = { shippableFiles, sumsBody, buildSums, hashFile, shippableExtensions, sumsFileName };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
