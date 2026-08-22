#!/usr/bin/env node
'use strict';

/**
 * Integrity Chain — リポジトリ向けの「ブロックチェーン型」改竄検知台帳。
 *
 * セキュリティ上重要なファイル群（保護対象 = PROTECTED）の内容を SHA-256 で
 * ハッシュ化し、Merkle ルートに畳み込み、各ブロックが直前ブロックのハッシュを
 * 参照する**追記専用のハッシュ連鎖**として security/integrity-chain.json に残す。
 * Git（= それ自体が Merkle DAG）にコミットすることで、履歴は改竄不能な分散台帳と
 * なり、CI（chain:verify）が連鎖の連続性と現状の一致を「合意検証」する。
 *
 * 7本の柱を束ねる防御ライヤ（詳細は docs/SECURITY_CHAIN.md）:
 *   GitHub      … コミット＝Merkle DAG。台帳を追記コミットしてブロックを「採掘」
 *   Linux       … ファイル内容ハッシュ＋POSIX権限を起点に決定論的に再計算
 *   クラウド     … 台帳 JSON を外部ストレージへ複製（可用性・冗長）
 *   Obsidian    … security/INTEGRITY_CHAIN.md として人間可読の台帳ノートを生成
 *   Docker      … 再現可能なコンテナで chain:verify を実行＝検証の再現性
 *   サンドボックス … Electron contextIsolation/sandbox・ブラウザ Vault 隔離
 *   生体認証     … WebAuthn/パスキー（src/renderer/security/webauthn.ts）で解錠を門番
 *
 * 使い方:
 *   node scripts/integrity-chain.cjs verify   連鎖と現状の整合を検証 (CI 用, 失敗で exit 1)
 *   node scripts/integrity-chain.cjs append    保護対象が変化していれば新ブロックを追記
 *   node scripts/integrity-chain.cjs show      台帳の要約を表示
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO_ROOT = path.resolve(__dirname, '..');
const CHAIN_PATH = path.join(REPO_ROOT, 'security', 'integrity-chain.json');
const NOTE_PATH = path.join(REPO_ROOT, 'security', 'INTEGRITY_CHAIN.md');
const ZERO_HASH = '0'.repeat(64);
const ALGORITHM = 'sha256';

/**
 * 保護対象ファイル（セキュリティ機構＋ガバナンスの安定資産）。
 * 学術ループ等で頻繁に変わるデータは含めない — 変更は意図的な「採掘」を要する。
 */
const PROTECTED = [
  'scripts/integrity-chain.cjs',
  'src/renderer/security/vault.ts',
  'src/renderer/security/dataCrypto.ts',
  'src/renderer/security/autoLock.ts',
  'src/renderer/security/mnemonic.ts',
  'src/renderer/security/webauthn.ts',
  'src/renderer/security/LockScreen.tsx',
  'src/main/secrets.ts',
  'src/main/oauth.ts',
  'src/preload/preload.ts',
  // レンダラーが渡してくる書き出し先を検査する唯一の関門。business /
  // stocks / templates / teamradar の書き出しは全部ここを通る。ここが
  // ゆるむと、乗っ取られたレンダラーがホーム配下へ任意のファイルを
  // 置けるようになる (2026-07 監査で 4 つの複製をここへ集約した)。
  // 保護対象に漏れていたのに気付いたのは 2026-08-18 — 同じファイルが
  // 変異検査の対象一覧からも漏れていた。
  'src/main/clients/exportPaths.ts',
  // 書き出し側 (exportPaths.ts) の対になる、**開く側**の唯一の関門。
  // `shell.openPath` は OS の「開く」動詞をそのまま使うので、Windows では
  // 拡張子の関連付け次第でそのまま実行される。ここがゆるむと、乗っ取られた
  // レンダラーがホーム配下の任意のファイルを起動できる。
  // 2026-08-22 まで main.ts の中の非公開関数で、テストも変異検査も無かった。
  'src/main/shellOpenGate.ts',
  'scripts/setup-linux.sh',
  'scripts/setup-obsidian-docker.sh',
  'scripts/security-audit.sh',
  '.github/workflows/ci.yml',
  'docs/SECURITY_CHAIN.md',
  // Service Worker は公開版のオリジンで**全てのページ読み込みに介入**する。
  // 一度登録されると、書き換えられた sw.js は以後そのオリジンで任意の
  // 応答を返せる。保護対象として最も効く部類なのに漏れていた。
  'assets/sw.js',
];

const sha256 = (buf) => crypto.createHash(ALGORITHM).update(buf).digest('hex');

/** 保護対象を読み、{ path: sha256 } のマニフェストを決定論的（path 昇順）に返す。 */
function buildManifest() {
  const manifest = {};
  const missing = [];
  for (const rel of [...PROTECTED].sort()) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    manifest[rel] = sha256(fs.readFileSync(abs));
  }
  if (missing.length) {
    throw new Error(`保護対象ファイルが見つかりません:\n  - ${missing.join('\n  - ')}`);
  }
  return manifest;
}

/** マニフェストから二分 Merkle ルートを計算（葉=sha256(path\0filehash)、奇数は末尾を複製）。 */
function merkleRoot(manifest) {
  let level = Object.keys(manifest)
    .sort()
    .map((p) => sha256(`${p}\0${manifest[p]}`));
  if (level.length === 0) return sha256('');
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      next.push(sha256(left + right));
    }
    level = next;
  }
  return level[0];
}

/** ブロックのハッシュ（index・prevHash・merkleRoot・leafCount・note を連結）。 */
function blockHash(b) {
  return sha256(`${b.index}\n${b.prevHash}\n${b.merkleRoot}\n${b.leafCount}\n${b.note}`);
}

function loadChain() {
  if (!fs.existsSync(CHAIN_PATH)) return null;
  return JSON.parse(fs.readFileSync(CHAIN_PATH, 'utf8'));
}

/** 人間可読の Obsidian ノート本文を台帳から決定論的に生成。 */
function renderNote(chain) {
  const tip = chain.blocks[chain.blocks.length - 1];
  const lines = [
    '# 完全性チェーン（Integrity Chain）',
    '',
    '> 自動生成物。直接編集しない（`npm run chain:append` で再生成）。',
    '> 仕組みの全体像は [[SECURITY_CHAIN]] / `docs/SECURITY_CHAIN.md` を参照。',
    '',
    `- アルゴリズム: \`${chain.algorithm}\``,
    `- ブロック数: ${chain.blocks.length}`,
    `- 先頭(genesis)ハッシュ: \`${chain.genesisHash}\``,
    `- 末尾(tip)ハッシュ: \`${tip.hash}\``,
    `- 保護対象: ${chain.protected.length} ファイル`,
    '',
    '## ブロック',
    '',
    '| # | merkleRoot (先頭16) | prevHash (先頭16) | hash (先頭16) | note |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const b of chain.blocks) {
    lines.push(
      `| ${b.index} | \`${b.merkleRoot.slice(0, 16)}\` | \`${b.prevHash.slice(0, 16)}\` | \`${b.hash.slice(0, 16)}\` | ${b.note} |`,
    );
  }
  lines.push('', '## 保護対象ファイル', '');
  for (const p of [...chain.protected].sort()) lines.push(`- \`${p}\``);
  lines.push('');
  return lines.join('\n');
}

function cmdAppend() {
  const manifest = buildManifest();
  const root = merkleRoot(manifest);
  let chain = loadChain();

  if (!chain) {
    const genesis = { index: 0, prevHash: ZERO_HASH, merkleRoot: root, leafCount: Object.keys(manifest).length, note: 'genesis' };
    genesis.hash = blockHash(genesis);
    chain = { algorithm: ALGORITHM, genesisHash: genesis.hash, protected: [...PROTECTED].sort(), blocks: [genesis], tipManifest: manifest };
    writeChain(chain);
    console.log(`✅ genesis ブロックを作成しました（${genesis.leafCount} ファイル, hash ${genesis.hash.slice(0, 16)}…）。`);
    return;
  }

  const tip = chain.blocks[chain.blocks.length - 1];
  if (tip.merkleRoot === root) {
    console.log('ℹ️  保護対象に変化はありません（追記不要）。');
    // ノート/manifest だけ再生成して同期（古い形式の取り込み）
    chain.protected = [...PROTECTED].sort();
    chain.tipManifest = manifest;
    writeChain(chain);
    return;
  }
  const block = { index: tip.index + 1, prevHash: tip.hash, merkleRoot: root, leafCount: Object.keys(manifest).length, note: `update ${block_note_changed(chain.tipManifest, manifest)}` };
  block.hash = blockHash(block);
  chain.blocks.push(block);
  chain.protected = [...PROTECTED].sort();
  chain.tipManifest = manifest;
  writeChain(chain);
  console.log(`✅ ブロック #${block.index} を採掘しました（prev ${block.prevHash.slice(0, 16)}… → hash ${block.hash.slice(0, 16)}…）。`);
}

/** 直前 tip からの差分ファイルを短い note 文字列にする。 */
function block_note_changed(prevManifest, manifest) {
  const prev = prevManifest || {};
  const changed = [];
  for (const p of Object.keys(manifest)) if (prev[p] !== manifest[p]) changed.push(path.basename(p));
  for (const p of Object.keys(prev)) if (!(p in manifest)) changed.push(`-${path.basename(p)}`);
  return changed.length ? changed.slice(0, 6).join(',') : 'no-op';
}

function writeChain(chain) {
  fs.mkdirSync(path.dirname(CHAIN_PATH), { recursive: true });
  fs.writeFileSync(CHAIN_PATH, JSON.stringify(chain, null, 2) + '\n');
  fs.writeFileSync(NOTE_PATH, renderNote(chain));
}

function cmdVerify() {
  const chain = loadChain();
  const fail = (msg) => {
    console.error(`❌ integrity-chain 検証失敗: ${msg}`);
    process.exit(1);
  };
  if (!chain) fail(`台帳がありません（${path.relative(REPO_ROOT, CHAIN_PATH)}）。'npm run chain:append' で作成してください。`);
  if (!Array.isArray(chain.blocks) || chain.blocks.length === 0) fail('ブロックが空です。');

  // 1. 連鎖の内部整合: 各ブロックのハッシュ再計算＋直前ハッシュの連結
  for (let i = 0; i < chain.blocks.length; i += 1) {
    const b = chain.blocks[i];
    if (blockHash(b) !== b.hash) fail(`ブロック #${b.index} のハッシュが一致しません（改竄の疑い）。`);
    const expectedPrev = i === 0 ? ZERO_HASH : chain.blocks[i - 1].hash;
    if (b.prevHash !== expectedPrev) fail(`ブロック #${b.index} の prevHash が連鎖していません（履歴の改竄）。`);
  }
  if (chain.genesisHash !== chain.blocks[0].hash) fail('genesisHash が先頭ブロックと一致しません。');

  // 2. 現状の一致: ディスク上の保護対象から Merkle ルートを再計算 → tip と突合
  const manifest = buildManifest();
  const root = merkleRoot(manifest);
  const tip = chain.blocks[chain.blocks.length - 1];
  if (root !== tip.merkleRoot) {
    const changed = block_note_changed(chain.tipManifest, manifest);
    fail(`保護対象が tip ブロックと一致しません（変更: ${changed}）。意図的変更なら 'npm run chain:append' で新ブロックを採掘してください。`);
  }

  // 3. 派生ノート（Obsidian）の同期
  if (!fs.existsSync(NOTE_PATH) || fs.readFileSync(NOTE_PATH, 'utf8') !== renderNote(chain)) {
    fail(`${path.relative(REPO_ROOT, NOTE_PATH)} が台帳と同期していません。'npm run chain:append' で再生成してください。`);
  }

  console.log(`✅ integrity-chain OK — ブロック ${chain.blocks.length} 連結・保護対象 ${chain.protected.length} ファイルが tip と一致（tip ${tip.hash.slice(0, 16)}…）。`);
}

function cmdShow() {
  const chain = loadChain();
  if (!chain) {
    console.log('台帳は未作成です。');
    return;
  }
  const tip = chain.blocks[chain.blocks.length - 1];
  console.log(`integrity-chain: ${chain.blocks.length} ブロック / ${chain.protected.length} 保護対象 / tip #${tip.index} ${tip.hash.slice(0, 16)}…`);
  for (const b of chain.blocks) console.log(`  #${b.index}  ${b.hash.slice(0, 12)}…  prev ${b.prevHash.slice(0, 12)}…  ${b.note}`);
}

const cmd = process.argv[2] || 'verify';
if (cmd === 'verify') cmdVerify();
else if (cmd === 'append') cmdAppend();
else if (cmd === 'show') cmdShow();
else {
  console.error(`不明なコマンド: ${cmd}（verify | append | show）`);
  process.exit(2);
}
