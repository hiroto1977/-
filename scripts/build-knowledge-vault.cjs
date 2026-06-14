#!/usr/bin/env node
'use strict';

/**
 * Obsidian 知識ヴォルト・ジェネレータ（全コレクション対応）。
 *
 * リポジトリ内の確証済み知識データセットすべて（学術概念 / 法務・税務・労務 /
 * 補助金・助成金 / 相談窓口 / 経済史）を単一の真実源とし、Obsidian で開ける
 * マークダウン・ヴォルト (knowledge-vault/) を決定論的に生成する。これにより、
 * これまで蓄積した全情報を frontmatter・[[wikilink]]・#tag 付きノートとして残し、
 * AIオーケストレーションのコンテキストとして再利用できる。
 *
 * 生成物 (knowledge-vault/):
 *   Home.md                            ヴォルト入口（コレクション索引・方法論・連携）
 *   MOC/<コレクション>.md              コレクション別 Map of Content（区分→概念一覧）
 *   notes/<collection>/<category>/<id>.md  1エントリ=1ノート
 *   methodology/*.md                   方法論ノート（確証ディシプリン・運用ループ・出典衛生）
 *   AI_ORCHESTRATION_CONTEXT.md        役員ロールごとの知識ブリーフ索引
 *
 * 使い方:
 *   node scripts/build-knowledge-vault.cjs            knowledge-vault/ を再生成
 *   node scripts/build-knowledge-vault.cjs --check    再生成して committed と差分検証 (CI用)
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const kc = require('../orchestration/knowledge-context.cjs');

const VAULT_DIR = path.join(kc.REPO_ROOT, 'knowledge-vault');
const EXEC_ORDER = ['coo', 'cso', 'cfo', 'chro', 'cio', 'cqo'];
const EXEC_TITLES = {
  coo: 'COO（最高執行責任者・オーケストレーター）',
  cso: 'CSO（最高戦略責任者）',
  cfo: 'CFO（最高財務責任者）',
  chro: 'CHRO（最高人事責任者）',
  cio: 'CIO（最高投資責任者）',
  cqo: 'CQO（最高品質責任者）',
};

const GENERATED_NOTE =
  '*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*';

function yamlStr(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// ---------------------------------------------------------------------------
// ノート本文
// ---------------------------------------------------------------------------
function entryNote(e) {
  const fm = ['---', `collection: ${e.collection}`, `id: ${e.id}`, `category: ${yamlStr(e.category)}`, `category_ja: ${yamlStr(e.categoryLabel)}`, `title: ${yamlStr(e.title)}`];
  if (e.asOf) fm.push(`as_of: ${yamlStr(e.asOf)}`);
  fm.push(`source_count: ${e.sources.length}`, `authoritative: ${e.authoritative}`, 'tags:', `  - collection/${e.collection}`, `  - ${e.collection}/${e.category}`, '  - knowledge/verified', 'aliases:', `  - ${yamlStr(e.title)}`, '---');

  const info = `> [!info] コレクション: [[${e.collectionLabel}]] ・ 区分: ${e.categoryLabel}${e.asOf ? ` ・ asOf: ${e.asOf}` : ''} ・ 出典: ${e.sources.length}件${e.authoritative ? '（うち権威ある出典 ✓）' : ''}`;
  const sources = e.sources.map((s) => `- [${s.label}](${s.url}) \`${kc.SOURCE_TYPE_LABEL[s.type] || s.type}\``).join('\n');

  const parts = [fm.join('\n'), '', `# ${e.title}`, '', info, '', '## 概要', e.summary, ''];
  for (const m of e.meta) parts.push(`## ${m.label}`, m.value, '');
  parts.push('## 出典', sources, '', '## 関連', `- コレクション: [[${e.collectionLabel}]]`, '- ヴォルト入口: [[Home]]', '- オーケストレーション連携: [[AI_ORCHESTRATION_CONTEXT]]', '', '---', GENERATED_NOTE, '');
  return parts.join('\n');
}

/** カテゴリ昇順（key 文字列）でグルーピング。 */
function groupByCategory(entries) {
  const groups = new Map();
  for (const e of entries) {
    if (!groups.has(e.category)) groups.set(e.category, { category: e.category, label: e.categoryLabel, items: [] });
    groups.get(e.category).items.push(e);
  }
  return [...groups.values()].sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
}

function mocNote(col, entries) {
  const groups = groupByCategory(entries);
  const fm = ['---', `title: ${yamlStr(col.label)}`, 'type: MOC', `collection: ${col.key}`, `entry_count: ${entries.length}`, 'tags:', `  - collection/${col.key}`, '  - MOC', '---'];
  const parts = [fm.join('\n'), '', `# ${col.label} — コレクションMOC`, '', `確証済みエントリ **${entries.length}件**（独立2出典以上・うち1件以上は権威ある出典で確認）。`, ''];
  for (const g of groups) {
    parts.push(`## ${g.label}（${g.items.length}件）`);
    for (const e of g.items) parts.push(`- [[${e.id}|${e.title}]] — ${kc.oneLiner(e.summary, 60)}`);
    parts.push('');
  }
  parts.push('## 関連', '- [[Home]]', '- [[AI_ORCHESTRATION_CONTEXT]]', '', '---', GENERATED_NOTE, '');
  return parts.join('\n');
}

function homeNote(byCollection, total) {
  const fm = ['---', 'title: Home', 'type: home', `total_entries: ${total}`, 'tags:', '  - home', '  - MOC', '---'];
  const lines = kc.COLLECTIONS.map((c) => `- [[${c.label}]] — ${(byCollection.get(c.key) || []).length}件`).join('\n');
  return [
    fm.join('\n'),
    '',
    '# 確証済み知識ヴォルト — Home',
    '',
    `リポジトリの確証済み知識データすべてを横断する **${total}件** のノート。`,
    'いずれも独立2出典以上・うち1件以上は権威ある出典（大学／学会／査読論文／公的機関・自治体／百科事典級リファレンス）で確認済み。',
    '`src/renderer/data/*Knowledge.ts` ほかを真実源として `npm run vault:build` で生成。',
    '',
    '## コレクション別MOC',
    lines,
    '',
    '## AIオーケストレーション連携',
    '- [[AI_ORCHESTRATION_CONTEXT]] — 各役員ロール（COO/CSO/CFO/CHRO/CIO/CQO）への知識ブリーフ索引',
    '- 実行時取得: `npm run orchestrate:context -- --role <execId>`（dispatch に自動注入）',
    '',
    '## 方法論（蓄積した運用知）',
    '- [[research-discipline|確証ディシプリン（出典検証の規律）]]',
    '- [[orchestration-loop|並列オーケストレーション・ループ]]',
    '- [[source-hygiene|出典衛生（正規化ルール）]]',
    '',
    '---',
    GENERATED_NOTE,
    '',
  ].join('\n');
}

function orchestrationContextNote(entries, map) {
  const fm = ['---', 'title: AI_ORCHESTRATION_CONTEXT', 'type: orchestration-context', 'tags:', '  - orchestration', '  - context', '---'];
  const parts = [
    fm.join('\n'),
    '',
    '# AIオーケストレーション知識コンテキスト',
    '',
    '`orchestration/registry.json` の組織（CEO→COO→役員→管理職→一般職）の各**役員ロール**へ、',
    '`orchestration/knowledge-map.json` に基づき全コレクション横断で確証済み知識を対応づけたブリーフ。',
    'ディスパッチ（`npm run orchestrate:dispatch`）はこの対応で各役職へ知識を注入し、',
    '`npm run orchestrate:context -- --role <execId>` で実行時に同じブリーフを取得できる。',
    '',
  ];
  const CAP = 10;
  for (const execId of EXEC_ORDER) {
    const spec = (map.executiveKnowledge || {})[execId];
    if (!spec) continue;
    const brief = kc.briefForExecutive(execId, { entries, map, limit: CAP });
    parts.push(`## ${EXEC_TITLES[execId] || execId}`);
    if (spec._rationale) parts.push('', `> ${spec._rationale}`);
    parts.push('');
    for (const g of brief.groups) {
      parts.push(`### ${g.collectionLabel} / ${g.categoryLabel}（${g.count}件）`);
      for (const it of g.items) parts.push(`- [[${it.id}|${it.title}]] — ${kc.oneLiner(it.oneLiner, 60)}`);
      if (g.count > g.items.length) parts.push(`- …ほか ${g.count - g.items.length} 件は [[${g.collectionLabel}]] を参照`);
      parts.push('');
    }
  }
  parts.push('---', GENERATED_NOTE, '');
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// 方法論ノート（蓄積した運用知 — 静的テンプレート）
// ---------------------------------------------------------------------------
const METHODOLOGY = {
  'research-discipline': `---
title: 確証ディシプリン（出典検証の規律）
type: methodology
tags:
  - methodology
  - verification
---

# 確証ディシプリン（出典検証の規律）

本ヴォルトの全コレクション（学術概念 / 法務・税務・労務 / 補助金・助成金 / 相談窓口 / 経済史）が
共通して従う採録規律。**確認できない情報は採録せず、捏造しない。**

## 採録基準
- 独立した **2 出典以上** で突合し、うち **1 件以上は権威ある出典**（大学・学会・査読論文・公的機関・
  自治体・原典/一次資料・百科事典級リファレンス）であること。安全クリティカルな情報（相談窓口等）は
  特に公的出典を要する。
- 制度・補助金のように「年度で変動する数値（金額・率・締切）」は固定値として断定せず、
  「最新の公募要領・支給要領で要確認」と明記する。
- 学説には批判・異説がありうるため、必要に応じて要旨に限界・批判を併記して中立性を保つ。
- 提唱者・初出・所管・確認時点を明示し、トレーサビリティを確保する。
- 検証できない事項は採録しない（推測で埋めない）。収集は人が行い、取り込みは PR レビューを通す。

## 出典タイプ
- \`academic\` 査読・大学・学会 / \`reference\` 百科事典級 / \`government\` 公的機関・一次法令 /
  \`municipality\` 自治体 / \`operator\` 運営団体 / \`media\` 解説・報道。

## 関連
- [[Home]]
- [[source-hygiene|出典衛生]]
- [[orchestration-loop|並列オーケストレーション・ループ]]
`,
  'orchestration-loop': `---
title: 並列オーケストレーション・ループ
type: methodology
tags:
  - methodology
  - orchestration
---

# 並列オーケストレーション・ループ

知識ベースを拡張する際に確立した、並列調査 → 検証 → 反映の運用ループ。

## バッチ手順
1. 既存 id／タイトルを照合し、重複しない項目を選定（dedup）。
2. **並列の調査エージェント**を起動し、各項目を独立に出典突合。確認できた事実のみ返す。
3. 全件の確認が揃うまで保留（partial で書かない）。
4. データへ追記（出典タイプを正規化、URL を正準形へ）。
5. 全ゲート（typecheck / verify:all / lint / build:web / vault:check）green を確認。
6. コミット → push → ドラフト PR → CI green 後マージ → 次バッチ。

## 役割分担（registry.json の組織）
- CEO（人間）→ COO（Claude本体・オーケストレーター）→ 役員（CFO/CHRO/CSO/CIO/CQO）→ 秘書室 → 管理職 → 一般職（並列Agent）。
- 調査・設計は read-only の並列 Agent、実装は COO が直列、品質ゲートは CQO 配下（役割分離）。
- 各役職には [[AI_ORCHESTRATION_CONTEXT]] の知識ブリーフが注入される。

## 関連
- [[Home]]
- [[research-discipline|確証ディシプリン]]
`,
  'source-hygiene': `---
title: 出典衛生（正規化ルール）
type: methodology
tags:
  - methodology
  - sources
---

# 出典衛生（正規化ルール）

出典の品質と再現性を保つために適用している正規化ルール。

## URL 正規化
- e-Gov 法令検索は正準形 \`https://laws.e-gov.go.jp/law/<LAWID>\` を用いる（API 形式・旧 elaws 形式は使わない）。
- 補助金・制度は \`.go.jp\` / 公式実施機関を優先。低品質なアグリゲータは採用しない。

## 出典タイプの正規化
- 自由記述ラベルを \`academic | reference | government | municipality | operator | media | other\` のいずれかへ写像する。

## 自己修正の尊重
- エージェントの自己修正（年・条番号・版の訂正）はそのまま反映する（捏造しない）。
- 異常な URL・撤回された主張は落とす／注記する。

## 関連
- [[Home]]
- [[research-discipline|確証ディシプリン]]
`,
};

// ---------------------------------------------------------------------------
// 生成
// ---------------------------------------------------------------------------
function buildFiles() {
  const entries = kc.loadEntries();

  // id の全域一意ガード（ノート basename = id。wikilink 解決と上書き衝突防止のため）。
  const seen = new Map();
  const dups = [];
  for (const e of entries) {
    if (seen.has(e.id)) dups.push(`${e.id} (${seen.get(e.id)} / ${e.collection})`);
    else seen.set(e.id, e.collection);
  }
  if (dups.length) {
    throw new Error(`ノート id が重複しています（${dups.length} 件）。データ側で解消してください: ${dups.slice(0, 20).join(', ')}`);
  }

  const byCollection = new Map();
  for (const e of entries) {
    if (!byCollection.has(e.collection)) byCollection.set(e.collection, []);
    byCollection.get(e.collection).push(e);
  }

  const files = {};
  files['Home.md'] = homeNote(byCollection, entries.length);
  files['AI_ORCHESTRATION_CONTEXT.md'] = orchestrationContextNote(entries, kc.loadKnowledgeMap());

  for (const col of kc.COLLECTIONS) {
    const list = byCollection.get(col.key) || [];
    files[path.join('MOC', `${col.label}.md`)] = mocNote(col, list);
    for (const e of list) files[path.join('notes', e.collection, e.category, `${e.id}.md`)] = entryNote(e);
  }

  for (const [name, content] of Object.entries(METHODOLOGY)) files[path.join('methodology', `${name}.md`)] = content;

  return files;
}

function writeVault(outDir, files) {
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

function walk(dir, base = dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, base, acc);
    else acc.push(path.relative(base, full));
  }
  return acc;
}

function check(files) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kvault-'));
  try {
    writeVault(tmp, files);
    const want = walk(tmp).sort();
    const have = walk(VAULT_DIR).sort();
    const problems = [];
    const wantSet = new Set(want);
    const haveSet = new Set(have);
    for (const f of want) if (!haveSet.has(f)) problems.push(`欠落: ${f}`);
    for (const f of have) if (!wantSet.has(f)) problems.push(`余分: ${f}`);
    for (const f of want) {
      if (!haveSet.has(f)) continue;
      if (fs.readFileSync(path.join(tmp, f), 'utf8') !== fs.readFileSync(path.join(VAULT_DIR, f), 'utf8')) problems.push(`内容差分: ${f}`);
    }
    return problems;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  const isCheck = process.argv.includes('--check');
  const files = buildFiles();
  const count = Object.keys(files).length;
  if (isCheck) {
    const problems = check(files);
    if (problems.length === 0) {
      console.log(`✅ knowledge-vault は本体データと同期しています（${count} ファイル）。`);
      return 0;
    }
    console.error(`❌ knowledge-vault がドリフトしています（${problems.length} 件）。\`npm run vault:build\` で再生成してください:`);
    for (const p of problems.slice(0, 40)) console.error(`  - ${p}`);
    if (problems.length > 40) console.error(`  …ほか ${problems.length - 40} 件`);
    return 1;
  }
  writeVault(VAULT_DIR, files);
  console.log(`✅ knowledge-vault/ を生成しました（${count} ファイル）。`);
  return 0;
}

process.exit(main());
