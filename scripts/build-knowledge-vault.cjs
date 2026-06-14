#!/usr/bin/env node
'use strict';

/**
 * Obsidian 知識ヴォルト・ジェネレータ。
 *
 * src/renderer/data/academicKnowledge.ts の VERIFIED_CONCEPTS と
 * orchestration/knowledge-map.json から、Obsidian で開けるマークダウン・ヴォルト
 * (knowledge-vault/) を決定論的に生成する。これにより、これまで蓄積した検証済み
 * 学術知識すべてを、frontmatter・[[wikilink]]・#tag 付きのノート群として残し、
 * AIオーケストレーションのコンテキストとして再利用できる。
 *
 * 生成物 (knowledge-vault/):
 *   Home.md                          ヴォルト入口 (分野MOC・方法論・連携への索引)
 *   MOC/<分野>.md                    分野ごとの Map of Content (概念一覧)
 *   concepts/<discipline>/<id>.md    概念1件 = 1ノート (frontmatter + 本文 + 出典 + 関連)
 *   methodology/*.md                 方法論ノート (研究ディシプリン・運用ループ・出典衛生)
 *   AI_ORCHESTRATION_CONTEXT.md      役員ロールごとの知識ブリーフ索引
 *
 * 使い方:
 *   node scripts/build-knowledge-vault.cjs            knowledge-vault/ を再生成
 *   node scripts/build-knowledge-vault.cjs --check    再生成して committed と差分検証 (CI用)
 *
 * 設計: 出力は wall-clock を含めず完全に決定論的。--check は一時ディレクトリへ生成し、
 * knowledge-vault/ とファイル集合・バイト内容を突合する (生成物のドリフト検出)。
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const kc = require('../orchestration/knowledge-context.cjs');

const REPO_ROOT = kc.REPO_ROOT;
const VAULT_DIR = path.join(REPO_ROOT, 'knowledge-vault');

const DISCIPLINE_ORDER = ['economics', 'management', 'human-science', 'business-law', 'information-sociology'];
const EXEC_TITLES = {
  coo: 'COO（最高執行責任者・オーケストレーター）',
  cso: 'CSO（最高戦略責任者）',
  cfo: 'CFO（最高財務責任者）',
  chro: 'CHRO（最高人事責任者）',
  cio: 'CIO（最高投資責任者）',
  cqo: 'CQO（最高品質責任者）',
};
const EXEC_ORDER = ['coo', 'cso', 'cfo', 'chro', 'cio', 'cqo'];

const GENERATED_NOTE =
  '*このノートは `src/renderer/data/academicKnowledge.ts` の `VERIFIED_CONCEPTS` から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*';

/** YAML スカラを二重引用符で安全に表現する。 */
function yamlStr(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const TYPE_LABEL = { academic: '学術', reference: 'リファレンス', government: '公的', media: 'メディア' };

// ---------------------------------------------------------------------------
// ノート本文ビルダー
// ---------------------------------------------------------------------------

function conceptNote(c, labels) {
  const label = labels[c.discipline] || c.discipline;
  const authoritative = c.sources.some((s) => s.type === 'academic' || s.type === 'reference' || s.type === 'government');
  const fm = [
    '---',
    `id: ${c.id}`,
    `discipline: ${c.discipline}`,
    `discipline_ja: ${label}`,
    `title: ${yamlStr(c.title)}`,
    `key_figures: ${yamlStr(c.keyFigures)}`,
    `as_of: ${yamlStr(c.asOf)}`,
    `source_count: ${c.sources.length}`,
    `authoritative: ${authoritative}`,
    'tags:',
    `  - discipline/${c.discipline}`,
    '  - knowledge/verified',
    'aliases:',
    `  - ${yamlStr(c.title)}`,
    '---',
  ].join('\n');

  const sources = c.sources
    .map((s) => `- [${s.label}](${s.url}) \`${TYPE_LABEL[s.type] || s.type}\``)
    .join('\n');

  return [
    fm,
    '',
    `# ${c.title}`,
    '',
    `> [!info] 分野: [[${label}]] ・ asOf: ${c.asOf} ・ 出典: ${c.sources.length}件${authoritative ? '（うち権威ある出典 ✓）' : ''}`,
    '',
    '## 概要',
    c.statement,
    '',
    '## 提唱者・初出',
    c.keyFigures,
    '',
    '## 出典',
    sources,
    '',
    '## 関連',
    `- 分野MOC: [[${label}]]`,
    '- ヴォルト入口: [[Home]]',
    '- オーケストレーション連携: [[AI_ORCHESTRATION_CONTEXT]]',
    '',
    '---',
    GENERATED_NOTE,
    '',
  ].join('\n');
}

function mocNote(discipline, label, list) {
  const fm = [
    '---',
    `title: ${yamlStr(label)}`,
    'type: MOC',
    `discipline: ${discipline}`,
    `concept_count: ${list.length}`,
    'tags:',
    `  - discipline/${discipline}`,
    '  - MOC',
    '---',
  ].join('\n');
  const items = list.map((c) => `- [[${c.id}|${c.title}]] — ${kc.oneLiner(c.statement, 60)}`).join('\n');
  return [
    fm,
    '',
    `# ${label}（${discipline}） — 分野MOC`,
    '',
    `検証済み概念 **${list.length}件** の地図（Map of Content）。各概念は独立2出典以上・うち1件以上は権威ある出典で確認済み。`,
    '',
    '## 概念一覧',
    items,
    '',
    '## 関連',
    '- [[Home]]',
    '- [[AI_ORCHESTRATION_CONTEXT]]',
    '',
    '---',
    GENERATED_NOTE,
    '',
  ].join('\n');
}

function homeNote(concepts, labels) {
  const total = concepts.length;
  const counts = {};
  for (const c of concepts) counts[c.discipline] = (counts[c.discipline] || 0) + 1;
  const mocLines = DISCIPLINE_ORDER.map((d) => `- [[${labels[d]}]] — ${counts[d] || 0}件`).join('\n');
  const fm = [
    '---',
    'title: Home',
    'type: home',
    `total_concepts: ${total}`,
    'tags:',
    '  - home',
    '  - MOC',
    '---',
  ].join('\n');
  return [
    fm,
    '',
    '# 学術知識ヴォルト — Home',
    '',
    `検証済み学術概念 **${total}件**（経済学・経営学・人間科学・ビジネス法務・情報社会学）。`,
    'いずれも独立2出典以上・うち1件以上は権威ある出典（大学／学会／査読論文／公的機関／百科事典級リファレンス）で確認済み。',
    '本ヴォルトは `src/renderer/data/academicKnowledge.ts` の `VERIFIED_CONCEPTS` から `npm run vault:build` で生成される。',
    '',
    '## 分野別MOC',
    mocLines,
    '',
    '## AIオーケストレーション連携',
    '- [[AI_ORCHESTRATION_CONTEXT]] — 各役員ロール（COO/CSO/CFO/CHRO/CIO/CQO）への知識ブリーフ索引',
    '- 実行時取得: `npm run orchestrate:context -- --role <execId>`（dispatch に自動注入）',
    '',
    '## 方法論（蓄積した運用知）',
    '- [[research-discipline|研究ディシプリン（出典検証の規律）]]',
    '- [[orchestration-loop|並列オーケストレーション・ループ]]',
    '- [[source-hygiene|出典衛生（正規化ルール）]]',
    '',
    '---',
    GENERATED_NOTE,
    '',
  ].join('\n');
}

function orchestrationContextNote(concepts, map) {
  const labels = map.disciplineLabels || {};
  const fm = [
    '---',
    'title: AI_ORCHESTRATION_CONTEXT',
    'type: orchestration-context',
    'tags:',
    '  - orchestration',
    '  - context',
    '---',
  ].join('\n');
  const parts = [
    fm,
    '',
    '# AIオーケストレーション知識コンテキスト',
    '',
    '`orchestration/registry.json` の組織（CEO→COO→役員→管理職→一般職）の各**役員ロール**へ、',
    '`orchestration/knowledge-map.json` に基づき関連ディシプリンの検証済み概念を対応づけたブリーフ。',
    'ディスパッチ（`npm run orchestrate:dispatch`）はこの対応を用いて各役職へ知識を注入し、',
    '`npm run orchestrate:context -- --role <execId>` で実行時に同じブリーフを取得できる。',
    '',
  ];
  const PER_DISC_CAP = 15;
  for (const execId of EXEC_ORDER) {
    const entry = (map.executiveDisciplines || {})[execId];
    if (!entry) continue;
    parts.push(`## ${EXEC_TITLES[execId] || execId}`);
    parts.push('');
    parts.push(`担当ディシプリン: ${entry.disciplines.map((d) => `[[${labels[d] || d}]]`).join(' / ')}`);
    parts.push('');
    parts.push(`> ${entry.rationale}`);
    parts.push('');
    for (const d of entry.disciplines) {
      const list = kc.conceptsForDiscipline(concepts, d);
      parts.push(`### ${labels[d] || d}（${list.length}件）`);
      for (const c of list.slice(0, PER_DISC_CAP)) {
        parts.push(`- [[${c.id}|${c.title}]] — ${kc.oneLiner(c.statement, 70)}`);
      }
      if (list.length > PER_DISC_CAP) parts.push(`- …ほか ${list.length - PER_DISC_CAP} 件は [[${labels[d] || d}]] を参照`);
      parts.push('');
    }
  }
  parts.push('---');
  parts.push(GENERATED_NOTE);
  parts.push('');
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// 方法論ノート (蓄積した運用知 — 静的テンプレート)
// ---------------------------------------------------------------------------

const METHODOLOGY = {
  'research-discipline': `---
title: 研究ディシプリン（出典検証の規律）
type: methodology
tags:
  - methodology
  - verification
---

# 研究ディシプリン（出典検証の規律）

本ヴォルトの全概念が従う採録規律。**確認できない情報は採録せず、捏造しない。**

## 採録基準
- 独立した **2 出典以上** で突合し、うち **1 件以上は権威ある出典**（大学・学会・査読論文・公的機関・原典/一次資料・百科事典級リファレンス）であること。
- 制度のような「年度で変動する数値」ではなく、確立した概念・理論・古典を対象とする。
- 学説には批判・異説がありうるため、必要に応じて statement に **限界・批判** も併記して中立性を保つ。
- 提唱者・初出（年・文献）を keyFigures に明示し、トレーサビリティを確保する。
- 検証できない事項は採録しない（推測で埋めない）。

## 出典タイプの分類（AcademicSourceType）
- \`academic\` — 査読論文・大学・学会（例: JSTOR, SAGE, Springer, 大学リポジトリ, NBER, PMC）
- \`reference\` — 百科事典級リファレンス（例: Britannica, Stanford Encyclopedia of Philosophy, Wikipedia, EBSCO, Oxford Reference）
- \`government\` — 公的機関・一次法令（例: e-Gov 法令検索, 各省庁, NobelPrize.org, EUR-Lex, WHO）
- \`media\` — 解説記事・実務メディア（例: HBR, 法律事務所コラム, 専門メディア）

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

## バッチ手順（1バッチ＝6概念）
1. 既存タイトルを grep し、重複しない概念を 5 ディシプリン横断で選定（dedup）。
2. **6 並列の調査エージェント**を起動（各概念1体）。各エージェントは独立に出典を突合し、確認できた事実のみを返す。
3. 全6件の確認が揃うまで保留（partial で書かない）。
4. \`VERIFIED_CONCEPTS\` へ追記（出典タイプを4値へ正規化、URL を正規形へ）。docs の一覧表も更新。
5. 全ゲート（typecheck / verify:all / lint / build:web / vault:check）green を確認。
6. コミット → push → ドラフト PR を作成。
7. CI green を確認後マージ → main 同期 → 次バッチへ。

## 役割分担（registry.json の組織）
- CEO（人間）→ COO（Claude 本体・オーケストレーター）→ 役員（CFO/CHRO/CSO/CIO/CQO）→ 秘書室 → 管理職 → 一般職（並列 Agent）。
- 調査・設計は **read-only の並列 Agent**、実装は COO が直列で、品質ゲートは CQO 配下が担う（役割分離）。

## 関連
- [[Home]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[research-discipline|研究ディシプリン]]
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
- e-Gov 法令検索は正準形 \`https://laws.e-gov.go.jp/law/<LAWID>\` を用いる（API 形式・旧 elaws 形式・hourei.net 等は使わない）。
  - 例: 民法 \`129AC0000000089\`／会社法 \`417AC0000000086\`／不正競争防止法 \`405AC0000000047\`／著作権法 \`345AC0000000048\`／特定商取引法 \`351AC0000000057\`／意匠法 \`334AC0000000125\`。
- 低品質なアグリゲータ（例: 引用転載のみのサイト）は採用しない。原典・一次資料・権威ある二次資料を優先。

## 出典タイプの正規化（4値へ）
調査エージェントの自由記述ラベルを \`academic | reference | government | media\` のいずれかへ写像する。
- 査読・大学・学会 → \`academic\`／百科事典・Wikipedia・Britannica・EBSCO → \`reference\`／公的機関・一次法令・NobelPrize.org・EUR-Lex → \`government\`／HBR・法律事務所・解説記事 → \`media\`。

## 自己修正の尊重
- エージェントの自己修正（年・条番号・版の訂正）はそのまま反映する（捏造しない）。
- 異常な URL・撤回された主張は落とす／注記する。

## 関連
- [[Home]]
- [[research-discipline|研究ディシプリン]]
`,
};

// ---------------------------------------------------------------------------
// 生成
// ---------------------------------------------------------------------------

/** outDir 配下に { 相対パス: 内容 } を全て書き出す。 */
function buildFiles() {
  const concepts = kc.loadConcepts();
  const map = kc.loadKnowledgeMap();
  const labels = map.disciplineLabels || {};

  // 重複 id ガード: 同一 id の二重登録は 1 ノートへ上書き衝突し知識を失う。
  // CI (vault:check) で確実に弾くため、ここで停止する（dedupe-academic-knowledge.cjs で解消）。
  const counts = {};
  for (const c of concepts) counts[c.id] = (counts[c.id] || 0) + 1;
  const dups = Object.entries(counts).filter(([, n]) => n > 1);
  if (dups.length) {
    throw new Error(
      `VERIFIED_CONCEPTS に重複 id が ${dups.length} 件あります。` +
        '`node scripts/dedupe-academic-knowledge.cjs --apply` で統合してください: ' +
        dups.map(([id, n]) => `${id}(x${n})`).join(', '),
    );
  }

  const files = {};

  files['Home.md'] = homeNote(concepts, labels);
  files['AI_ORCHESTRATION_CONTEXT.md'] = orchestrationContextNote(concepts, map);

  for (const d of DISCIPLINE_ORDER) {
    const list = kc.conceptsForDiscipline(concepts, d);
    files[path.join('MOC', `${labels[d] || d}.md`)] = mocNote(d, labels[d] || d, list);
    for (const c of list) {
      files[path.join('concepts', d, `${c.id}.md`)] = conceptNote(c, labels);
    }
  }

  for (const [name, content] of Object.entries(METHODOLOGY)) {
    files[path.join('methodology', `${name}.md`)] = content;
  }

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
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, base, acc);
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
    for (const f of want) if (!haveSet.has(f)) problems.push(`欠落 (生成されるべき): ${f}`);
    for (const f of have) if (!wantSet.has(f)) problems.push(`余分 (削除されるべき): ${f}`);
    for (const f of want) {
      if (!haveSet.has(f)) continue;
      const a = fs.readFileSync(path.join(tmp, f), 'utf8');
      const b = fs.readFileSync(path.join(VAULT_DIR, f), 'utf8');
      if (a !== b) problems.push(`内容差分: ${f}`);
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
