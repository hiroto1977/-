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
const kg = require('../orchestration/knowledge-graph.cjs');

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
/** エッジ型 → ノートに表示する日本語ラベル。 */
const EDGE_TYPE_LABEL = {
  'term-overlap': '語彙が近い',
  'discipline-bridge': '分野横断',
  'shares-thinker': '同じ思想家',
  'shares-source': '出典を共有',
  'same-category': '同分野の近傍',
};

/**
 * 知識グラフからノートごとの「関連概念」上位 relatedTop 件を導出する。
 * 決定論の一点ルール: 委託 NDJSON を読み戻さず、同一純関数 computeGraph(entries) から
 * その場導出する（NDJSON との一致は verify:graph が別途保証）。
 */
function buildRelatedMap(entries, relatedTop = 10) {
  const { edges } = kg.computeGraph(entries);
  const titleOf = new Map(entries.map((e) => [e.id, e.title]));
  const incident = new Map();
  for (const e of edges) {
    (incident.get(e.a) || incident.set(e.a, []).get(e.a)).push({ other: e.b, type: e.type, score: e.score });
    (incident.get(e.b) || incident.set(e.b, []).get(e.b)).push({ other: e.a, type: e.type, score: e.score });
  }
  const related = new Map();
  for (const [id, arr] of incident) {
    arr.sort(
      (x, y) =>
        kg.TYPE_PRIORITY[x.type] - kg.TYPE_PRIORITY[y.type] ||
        y.score - x.score ||
        (x.other < y.other ? -1 : x.other > y.other ? 1 : 0),
    );
    // 同一相手は最優先の 1 本だけ見せる（term-overlap と shares-thinker の重複列挙を防ぐ）。
    const seen = new Set();
    const top = [];
    for (const x of arr) {
      if (seen.has(x.other)) continue;
      seen.add(x.other);
      top.push({ id: x.other, title: titleOf.get(x.other) || x.other, typeLabel: EDGE_TYPE_LABEL[x.type] || x.type });
      if (top.length >= relatedTop) break;
    }
    related.set(id, top);
  }
  return related;
}

function entryNote(e, related = []) {
  const fm = ['---', `collection: ${e.collection}`, `id: ${e.id}`, `category: ${yamlStr(e.category)}`, `category_ja: ${yamlStr(e.categoryLabel)}`, `title: ${yamlStr(e.title)}`];
  if (e.asOf) fm.push(`as_of: ${yamlStr(e.asOf)}`);
  fm.push(`source_count: ${e.sources.length}`, `authoritative: ${e.authoritative}`, 'tags:', `  - collection/${e.collection}`, `  - ${e.collection}/${e.category}`, '  - knowledge/verified', 'aliases:', `  - ${yamlStr(e.title)}`, '---');

  const info = `> [!info] コレクション: [[${e.collectionLabel}]] ・ 区分: ${e.categoryLabel}${e.asOf ? ` ・ asOf: ${e.asOf}` : ''} ・ 出典: ${e.sources.length}件${e.authoritative ? '（うち権威ある出典 ✓）' : ''}`;
  const sources = e.sources.map((s) => `- [${s.label}](${s.url}) \`${kc.SOURCE_TYPE_LABEL[s.type] || s.type}\``).join('\n');

  const parts = [fm.join('\n'), '', `# ${e.title}`, '', info, '', '## 概要', e.summary, ''];
  for (const m of e.meta) parts.push(`## ${m.label}`, m.value, '');
  parts.push('## 出典', sources, '');
  if (related.length > 0) {
    parts.push('## 関連概念');
    for (const r of related) parts.push(`- [[${r.id}|${r.title}]] — ${r.typeLabel}`);
    parts.push('');
  }
  parts.push('## 関連', `- コレクション: [[${e.collectionLabel}]]`, '- ヴォルト入口: [[Home]]', '- オーケストレーション連携: [[AI_ORCHESTRATION_CONTEXT]]', '', '---', GENERATED_NOTE, '');
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
    '- [[Organization]] — 組織図（CEO→COO→役員→秘書室／管理職→一般職）とサイクル。各役員ノートに知識ブリーフを相互リンク',
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
    parts.push('', `組織ノート: [[${execId}|${EXEC_TITLES[execId] || execId}]]`);
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
// 組織ノート（registry.json の AIオーケストレーション組織を vault 化し、知識と相互リンク）
// ---------------------------------------------------------------------------
function execKnowledgeSection(execId, entries, map) {
  const brief = kc.briefForExecutive(execId, { entries, map, limit: 6 });
  if (!brief.groups.length) return [];
  const out = ['## 参照する確証済み知識（knowledge-map）', ''];
  for (const g of brief.groups) {
    out.push(`### ${g.collectionLabel} / ${g.categoryLabel}（全${g.count}件）`);
    for (const it of g.items) out.push(`- [[${it.id}|${it.title}]]`);
    if (g.count > g.items.length) out.push(`- …ほか ${g.count - g.items.length} 件 → [[${g.collectionLabel}]]`);
    out.push('');
  }
  return out;
}

function orgRoleFrontmatter(orgId, layer, title) {
  return ['---', `org_id: ${orgId}`, 'type: org-role', `layer: ${layer}`, `title: ${yamlStr(title)}`, 'tags:', `  - org/${layer}`, '  - orchestration', 'aliases:', `  - ${yamlStr(title)}`, '---'].join('\n');
}

function buildOrgFiles(registry, map, entries) {
  const org = registry.org;
  const files = {};
  const execById = Object.fromEntries(org.executives.map((e) => [e.id, e]));
  const secByExec = Object.fromEntries(org.secretaries.map((s) => [s.supports, s]));
  const mgrById = Object.fromEntries(org.managers.map((m) => [m.id, m]));
  const teamsByMgr = {};
  for (const t of registry.teams) (teamsByMgr[t.manager] = teamsByMgr[t.manager] || []).push(t);

  const tail = ['', '## 関連', '- [[Organization]]', '- [[AI_ORCHESTRATION_CONTEXT]]', '- [[Home]]', '', '---', GENERATED_NOTE, ''];

  // CEO / COO
  files[path.join('org', 'roles', 'ceo.md')] = [
    orgRoleFrontmatter('ceo', 'ceo', org.ceo.title), '', `# ${org.ceo.title}`, '',
    `- 役割: ${org.ceo.title}（人間・最終意思決定者）`, '- 配下: [[coo|COO]]', ...tail,
  ].join('\n');
  files[path.join('org', 'roles', 'coo.md')] = [
    orgRoleFrontmatter('coo', 'coo', org.coo.title), '', `# ${org.coo.title}`, '',
    '- 役割: オーケストレーター（Claude本体）。役員を統括し並列Agentを起動する。', '- 上位: [[ceo|CEO]]',
    `- 統括する役員: ${org.executives.map((e) => `[[${e.id}|${e.title}]]`).join(' / ')}`, '',
    ...execKnowledgeSection('coo', entries, map), ...tail,
  ].join('\n');

  // 役員
  for (const e of org.executives) {
    const sec = secByExec[e.id];
    files[path.join('org', 'roles', `${e.id}.md`)] = [
      orgRoleFrontmatter(e.id, 'executive', e.title), '', `# ${e.title}`, '',
      `- ドメイン: ${e.domain || ''}`, '- 上位: [[coo|COO]]',
      sec ? `- 支援: [[${sec.id}|${sec.title}]]` : '- 支援: （なし）',
      `- 配下の管理職: ${(e.owns || []).map((m) => `[[${m}|${(mgrById[m] || {}).title || m}]]`).join(' / ')}`, '',
      ...execKnowledgeSection(e.id, entries, map), ...tail,
    ].join('\n');
  }

  // 秘書室
  for (const s of org.secretaries) {
    files[path.join('org', 'roles', `${s.id}.md`)] = [
      orgRoleFrontmatter(s.id, 'secretariat', s.title), '', `# ${s.title}`, '',
      `- 支援先: [[${s.supports}|${(execById[s.supports] || {}).title || s.supports}]]`,
      `- 構成: AI ${s.members} 体`, s.role ? `- 役割: ${s.role}` : '', ...tail,
    ].filter((l) => l !== '').join('\n');
  }

  // 管理職
  for (const m of org.managers) {
    const ts = teamsByMgr[m.id] || [];
    files[path.join('org', 'roles', `${m.id}.md`)] = [
      orgRoleFrontmatter(m.id, 'manager', m.title), '', `# ${m.title}`, '',
      `- 上位: [[${m.reportsTo}|${(execById[m.reportsTo] || {}).title || m.reportsTo}]]`,
      `- 担当チーム: ${ts.length} 件`,
      ...ts.map((t) => `  - [[team-${t.id}|${t.domain}]]`), ...tail,
    ].join('\n');
  }

  // 一般職（チーム）
  for (const t of registry.teams) {
    const mgr = mgrById[t.manager];
    const exec = mgr ? execById[mgr.reportsTo] : null;
    files[path.join('org', 'teams', `team-${t.id}.md`)] = [
      ['---', `team_id: ${t.id}`, 'type: org-team', `manager: ${t.manager || ''}`, `title: ${yamlStr(t.domain)}`, 'tags:', '  - org/team', '  - orchestration', 'aliases:', `  - ${yamlStr(t.domain)}`, '---'].join('\n'),
      '', `# ${t.domain}`, '',
      `- 焦点: ${t.focus}`, t.role ? `- 役割: ${t.role}` : '- 役割: research',
      `- 指揮系統: [[ceo|CEO]] → [[coo|COO]]${exec ? ` → [[${exec.id}|${exec.title}]]` : ''}${mgr ? ` → [[${mgr.id}|${mgr.title}]]` : ''} → 本チーム（並列Agent）`,
      exec ? `- 担当役員の知識ブリーフ: [[${exec.id}|${exec.title}]] 参照` : '', ...tail,
    ].filter((l) => l !== '').join('\n');
  }

  // サイクル
  for (const [name, stages] of Object.entries(registry.policy.cycles)) {
    if (name === 'description' || !Array.isArray(stages)) continue;
    const lines = [['---', `cycle: ${name}`, 'type: org-cycle', `title: ${yamlStr(name.toUpperCase() + ' サイクル')}`, 'tags:', '  - org/cycle', '  - orchestration', '---'].join('\n'), '', `# ${name.toUpperCase()} サイクル`, ''];
    stages.forEach((s, i) => { lines.push(`${i + 1}. **[${s.stage}]** owner=${s.owner} ${s.parallel ? '（並列）' : '（直列）'}`, `   - ${s.desc}`); });
    lines.push(...tail);
    files[path.join('org', 'cycles', `${name}.md`)] = lines.join('\n');
  }

  // 組織MOC
  const orgMoc = [
    ['---', 'title: Organization', 'type: org-moc', 'tags:', '  - org', '  - MOC', '---'].join('\n'),
    '', '# AIオーケストレーション組織 — MOC', '',
    'registry.json に定義された組織（CEO→COO→役員→秘書室／管理職→一般職）と PDCA/OODA サイクル。',
    '各役員ノートには [[AI_ORCHESTRATION_CONTEXT]] と同じ知識ブリーフが相互リンクされている。', '',
    '## 階層', '- [[ceo|CEO]]', '  - [[coo|COO]]',
    ...org.executives.map((e) => `    - [[${e.id}|${e.title}]]${secByExec[e.id] ? `（支援: [[${secByExec[e.id].id}|秘書室]]）` : ''}`),
    '', '## 管理職', ...org.managers.map((m) => `- [[${m.id}|${m.title}]]（${(teamsByMgr[m.id] || []).length}チーム）`),
    '', `## 一般職（${registry.teams.length}チーム）`, '各チームは `org/teams/` に格納。担当管理職ノートから辿れる。',
    '', '## サイクル', ...Object.keys(registry.policy.cycles).filter((k) => k !== 'description').map((k) => `- [[${k}|${k.toUpperCase()} サイクル]]`),
    '', '## 関連', '- [[Home]]', '- [[AI_ORCHESTRATION_CONTEXT]]', '', '---', GENERATED_NOTE, '',
  ].join('\n');
  files['Organization.md'] = orgMoc;

  return files;
}

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

  const map = kc.loadKnowledgeMap();
  const files = {};
  files['Home.md'] = homeNote(byCollection, entries.length);
  files['AI_ORCHESTRATION_CONTEXT.md'] = orchestrationContextNote(entries, map);

  // 知識グラフから「関連概念」を導出（読み戻しなし・同一純関数から）。
  const related = buildRelatedMap(entries);

  for (const col of kc.COLLECTIONS) {
    const list = byCollection.get(col.key) || [];
    files[path.join('MOC', `${col.label}.md`)] = mocNote(col, list);
    for (const e of list)
      files[path.join('notes', e.collection, e.category, `${e.id}.md`)] = entryNote(e, related.get(e.id) || []);
  }

  for (const [name, content] of Object.entries(METHODOLOGY)) files[path.join('methodology', `${name}.md`)] = content;

  // AIオーケストレーション組織を vault 化（知識と相互リンク）。
  Object.assign(files, buildOrgFiles(kc.loadRegistry(), map, entries));

  // 全ノート basename の全域一意ガード（[[wikilink]] 解決の保証）。
  const baseSeen = new Map();
  const baseDups = [];
  for (const rel of Object.keys(files)) {
    const base = path.basename(rel, '.md');
    if (baseSeen.has(base)) baseDups.push(`${base} (${baseSeen.get(base)} / ${rel})`);
    else baseSeen.set(base, rel);
  }
  if (baseDups.length) {
    throw new Error(`ノート basename が重複しています（${baseDups.length} 件）。wikilink が曖昧になります: ${baseDups.slice(0, 20).join(', ')}`);
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
