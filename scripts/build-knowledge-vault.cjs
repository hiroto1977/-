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
const safeWrite = require('./safe-vault-write.cjs');
const kc = require('../orchestration/knowledge-context.cjs');
const kg = require('../orchestration/knowledge-graph.cjs');
const edu = require('../orchestration/education.cjs');

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

/**
 * YAML の二重引用符スカラー。**制御文字も逃がす**。
 *
 * 逆斜線と引用符だけを逃がしていた。改行はそのまま通る —— frontmatter は
 * 「`---` の行から次の `---` の行まで」なので、値の中の改行のあとに `---` が
 * 来ると **frontmatter がそこで終わる**。以降はノート本文になり、残りの
 * キーは本文の文字列に化ける。
 *
 * 今の本体データで frontmatter に載る欄 (title / category / asOf / aliases)
 * に改行は無い。だが summary には 86 件ある —— 同じデータ、同じ編集の手で
 * ある。「今は無い」は守りではないので、綴りの側で塞ぐ。
 *
 * YAML 1.2 の二重引用符スカラーは `\n` `\r` `\t` を escape として解する
 * (JSON と同じ)。文字を捨てずに 1 行へ収められる。
 */
function yamlStr(s) {
  return `"${String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')}"`;
}

/**
 * この文字列を Markdown のインライン文脈へ置いても、リンクを**作らず・壊さない**か。
 *
 * CommonMark のリンクは入れ子にできない。リンク文字列の中に `](` があると
 * 内側がリンクとして成立し、外側は成立しない。角括弧が釣り合わない場合も同じ。
 * 判定は文法から出るもので、描画器には依らない。
 */
function linkSafe(s) {
  const t = String(s);
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    // 逃がされた括弧はただの字。ここを見落とすと `linkSafe(mdInline(x))` が
    // 永久に false になり、「逃がせば安全になる」という肯定形の主張が立たない。
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '[') depth++;
    else if (c === ']') {
      if (t[i + 1] === '(') return false;
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

/**
 * 本体データ由来の文字列を Markdown のインライン文脈へ綴じ込む。
 *
 * **壊すときだけ逃がす。** 判例の中立引用は `[1978] ECR 207` のように角括弧を
 * 正しく含み、CommonMark はこれを読める。無条件に逃がすと数百のノートが
 * `\[1978\]` になり、直っていない物まで書き換わる。
 *
 * 実際に壊れていたのは 1 件だけだった —— mgmt-bass-diffusion-model の出典
 * ラベルが数式 `dF/dt=[p+qF](1−F)` を持っており、これは字面がそのまま
 * Markdown のリンク記法である。生成済みの
 * `knowledge-vault/notes/academic/management/mgmt-bass-diffusion-model.md`
 * に壊れた行が出荷されていた。
 */
function mdInline(s) {
  const t = String(s);
  return linkSafe(t) ? t : t.replace(/[[\]]/g, (c) => `\\${c}`);
}

/**
 * `[[id|別名]]` の別名として綴じ込めるか。`]]` はリンクを閉じ、`|` は欄を割る。
 *
 * こちらは逃がさず**落とす**。今の本体データに該当は無く、出たときは
 * 見出しそのものを直すべき性質の壊れ方だから (逃がすと字面が変わる)。
 */
function assertWikiAliasSafe(s, what) {
  const t = String(s);
  if (t.includes(']]') || t.includes('|')) {
    throw new Error(`vault:build: ${what} が wikilink の別名に置けない字面を含む: ${JSON.stringify(t)}`);
  }
  return t;
}

/**
 * 引用符を付けずに YAML へ書く値 (id / collection) が、素のスカラーとして
 * 安全か。付ければ 7,543 ノート全部の frontmatter が変わるので、**変えずに
 * 確かめる**ほうを採る。
 */
function assertBareYamlScalar(v, what) {
  const t = String(v);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(t)) {
    throw new Error(`vault:build: ${what} が素の YAML スカラーとして安全でない: ${JSON.stringify(t)}`);
  }
  return t;
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
function buildRelatedMap(graph, entries, relatedTop = 10) {
  const { edges } = graph;
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
  const fm = ['---', `collection: ${assertBareYamlScalar(e.collection, 'collection')}`, `id: ${assertBareYamlScalar(e.id, 'id')}`, `category: ${yamlStr(e.category)}`, `category_ja: ${yamlStr(e.categoryLabel)}`, `title: ${yamlStr(e.title)}`];
  if (e.asOf) fm.push(`as_of: ${yamlStr(e.asOf)}`);
  fm.push(`source_count: ${e.sources.length}`, `authoritative: ${e.authoritative}`, 'tags:', `  - collection/${e.collection}`, `  - ${e.collection}/${e.category}`, '  - knowledge/verified', 'aliases:', `  - ${yamlStr(e.title)}`, '---');

  const info = `> [!info] コレクション: [[${e.collectionLabel}]] ・ 区分: ${e.categoryLabel}${e.asOf ? ` ・ asOf: ${e.asOf}` : ''} ・ 出典: ${e.sources.length}件${e.authoritative ? '（うち権威ある出典 ✓）' : ''}`;
  const sources = e.sources
    .map((s) => `- [${mdInline(s.label)}](${s.url}) \`${kc.SOURCE_TYPE_LABEL[s.type] || s.type}\``)
    .join('\n');

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

// ---------------------------------------------------------------------------
// 人物ページ・出典ドメインページ（柱 B Phase 2）
// ---------------------------------------------------------------------------
/** 人物キー / ホスト名 → ファイル slug（衝突時は昇順で -2, -3 を付す）。 */
function makeSlugger(prefix) {
  const used = new Map();
  return (raw) => {
    const base = `${prefix}-${String(raw).replace(/[|.]/g, '-').replace(/-+/g, '-').replace(/-+$/, '')}`;
    const n = used.get(base) || 0;
    used.set(base, n + 1);
    return n === 0 ? base : `${base}-${n + 1}`;
  };
}

/**
 * 人物ごとに関連概念を束ねる（2 概念以上の人物のみページ化 — 1 件のみの
 * 人物ページはナビゲーション価値が薄くスタブを 5,000 枚生むため）。
 * display は最長の表記を代表とする（情報量最大・決定論）。
 */
function collectThinkers(entries) {
  const byKey = new Map(); // key → {displays:Set, items:[entry]}
  for (const e of entries) {
    const metaText = (e.meta || []).map((m) => m.value).join('／');
    for (const { key, display } of kg.extractAuthorNames(metaText)) {
      if (!byKey.has(key)) byKey.set(key, { displays: [], items: [] });
      const t = byKey.get(key);
      t.displays.push(display);
      t.items.push(e);
    }
  }
  const thinkers = [];
  for (const [key, t] of byKey) {
    if (t.items.length < 2) continue;
    const display = [...t.displays].sort((a, b) => b.length - a.length || (a < b ? -1 : 1))[0];
    t.items.sort((a, b) => (a.id < b.id ? -1 : 1));
    thinkers.push({ key, display, items: t.items });
  }
  thinkers.sort((a, b) => (a.key < b.key ? -1 : 1));
  return thinkers;
}

function thinkerNote(t) {
  const fm = ['---', `title: ${yamlStr(t.display)}`, 'type: thinker', `person_key: ${yamlStr(t.key)}`, `concept_count: ${t.items.length}`, 'tags:', '  - person', '  - index', '---'];
  const parts = [fm.join('\n'), '', `# ${t.display}`, '', `> [!info] 人物索引 ・ 関連する検証済み概念 **${t.items.length} 件**（確証ゲート: 出典 2 件以上・権威 1 件以上）`, ''];
  const groups = new Map();
  for (const e of t.items) {
    const g = groups.get(e.collectionLabel) || [];
    g.push(e);
    groups.set(e.collectionLabel, g);
  }
  for (const [label, items] of [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    parts.push(`## ${label}（${items.length}件）`);
    for (const e of items)
      parts.push(`- [[${e.id}|${assertWikiAliasSafe(e.title, 'title')}]] — ${mdInline(kc.oneLiner(e.summary, 60))}`);
    parts.push('');
  }
  parts.push('## 関連', '- 索引: [[人物索引]]', '- ヴォルト入口: [[Home]]', '', '---', GENERATED_NOTE, '');
  return parts.join('\n');
}

/** ホストごとに引用元の概念を束ねる（全ホスト）。 */
function collectSourceDomains(entries) {
  const byHost = new Map(); // host → {items:[{entry, label, type}]}
  for (const e of entries) {
    for (const s of e.sources || []) {
      const h = kg.hostOf(s.url);
      if (!h) continue;
      if (!byHost.has(h)) byHost.set(h, []);
      byHost.get(h).push({ entry: e, label: s.label, type: s.type });
    }
  }
  const hosts = [];
  for (const [host, items] of byHost) {
    items.sort((a, b) => (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : a.label < b.label ? -1 : 1));
    hosts.push({ host, items });
  }
  hosts.sort((a, b) => (a.host < b.host ? -1 : 1));
  return hosts;
}

function sourceDomainNote(d) {
  const typeCount = new Map();
  for (const it of d.items) typeCount.set(it.type, (typeCount.get(it.type) || 0) + 1);
  const typeLine = [...typeCount.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([t, n]) => `${kc.SOURCE_TYPE_LABEL[t] || t} ${n}`)
    .join(' ・ ');
  const fm = ['---', `title: ${yamlStr(d.host)}`, 'type: source-domain', `host: ${yamlStr(d.host)}`, `cite_count: ${d.items.length}`, 'tags:', '  - source-domain', '  - index', '---'];
  const parts = [fm.join('\n'), '', `# ${d.host}`, '', `> [!info] 出典ドメイン索引 ・ 引用 **${d.items.length} 件**（${typeLine}）`, '', '## このドメインを出典とする項目', ''];
  for (const it of d.items)
    parts.push(
      `- [[${it.entry.id}|${assertWikiAliasSafe(it.entry.title, 'title')}]] — ${mdInline(kc.oneLiner(it.label, 70))}`,
    );
  parts.push('', '## 関連', '- 索引: [[出典ドメイン索引]]', '- ヴォルト入口: [[Home]]', '', '---', GENERATED_NOTE, '');
  return parts.join('\n');
}

function thinkerIndexNote(thinkers, slugOf) {
  const fm = ['---', 'title: 人物索引', 'type: MOC', `person_count: ${thinkers.length}`, 'tags:', '  - MOC', '  - person', '---'];
  const parts = [fm.join('\n'), '', '# 人物索引 — 思想家・研究者から概念を辿る', '', `検証済み知識に 2 概念以上で登場する人物 **${thinkers.length} 名**。関連概念数の降順。`, ''];
  const sorted = [...thinkers].sort((a, b) => b.items.length - a.items.length || (a.key < b.key ? -1 : 1));
  for (const t of sorted) parts.push(`- [[${slugOf.get(t.key)}|${t.display}]]（${t.items.length}件）`);
  parts.push('', '## 関連', '- [[Home]]', '', '---', GENERATED_NOTE, '');
  return parts.join('\n');
}

function sourceDomainIndexNote(domains, slugOf) {
  const fm = ['---', 'title: 出典ドメイン索引', 'type: MOC', `domain_count: ${domains.length}`, 'tags:', '  - MOC', '  - source-domain', '---'];
  const parts = [fm.join('\n'), '', '# 出典ドメイン索引 — 引用元から概念を辿る', '', `全出典 URL のドメイン **${domains.length} 件**。引用数の降順。`, ''];
  const sorted = [...domains].sort((a, b) => b.items.length - a.items.length || (a.host < b.host ? -1 : 1));
  for (const d of sorted) parts.push(`- [[${slugOf.get(d.host)}|${d.host}]]（${d.items.length}件）`);
  parts.push('', '## 関連', '- [[Home]]', '', '---', GENERATED_NOTE, '');
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// 年表・学習パス・教育 MOC（柱 B Phase 3）
// ---------------------------------------------------------------------------
/** 年表: 初出年ごとの year-<YYYY>.md と decade-<YYYY>s.md（グラフノードの year を使用）。 */
function timelinePages(entries, yearOf) {
  const byYear = new Map();
  for (const e of entries) {
    const y = yearOf.get(e.id);
    if (!y) continue;
    (byYear.get(y) || byYear.set(y, []).get(y)).push(e);
  }
  const files = {};
  const years = [...byYear.keys()].sort((a, b) => a - b);
  for (const y of years) {
    const items = byYear.get(y).sort((a, b) => (a.id < b.id ? -1 : 1));
    const fm = ['---', `title: "${y}年の概念・制度"`, 'type: timeline-year', `year: ${y}`, `entry_count: ${items.length}`, 'tags:', '  - timeline', '---'];
    const parts = [fm.join('\n'), '', `# ${y}年 — 初出・提唱・成立`, '', `> [!info] 年表索引 ・ この年に紐づく検証済み項目 **${items.length} 件**（提唱・初出・制定等の最初期年）`, ''];
    for (const e of items) parts.push(`- [[${e.id}|${e.title}]]（${e.collectionLabel}）`);
    parts.push('', '## 関連', `- 年代: [[decade-${Math.floor(y / 10) * 10}s]]`, '- 索引: [[年表索引]]', '', '---', GENERATED_NOTE, '');
    files[path.join('timeline', `year-${y}.md`)] = parts.join('\n');
  }
  // decade ページ
  const byDecade = new Map();
  for (const y of years) {
    const d = Math.floor(y / 10) * 10;
    (byDecade.get(d) || byDecade.set(d, []).get(d)).push(y);
  }
  for (const [d, ys] of [...byDecade.entries()].sort((a, b) => a[0] - b[0])) {
    const total = ys.reduce((n, y) => n + byYear.get(y).length, 0);
    const fm = ['---', `title: "${d}年代"`, 'type: timeline-decade', `decade: ${d}`, `entry_count: ${total}`, 'tags:', '  - timeline', '---'];
    const parts = [fm.join('\n'), '', `# ${d}年代 — ${total} 件`, ''];
    for (const y of ys) parts.push(`- [[year-${y}|${y}年]]（${byYear.get(y).length}件）`);
    parts.push('', '## 関連', '- 索引: [[年表索引]]', '', '---', GENERATED_NOTE, '');
    files[path.join('timeline', `decade-${d}s.md`)] = parts.join('\n');
  }
  return { files, years, byYear, byDecade };
}

function timelineIndexNote(byDecade, byYear) {
  const fm = ['---', 'title: 年表索引', 'type: MOC', 'tags:', '  - MOC', '  - timeline', '---'];
  const parts = [fm.join('\n'), '', '# 年表索引 — 概念・制度を初出年から辿る', '', '各項目の「最初期に言及された年」（提唱・初出・制定）に基づく決定論的な年表。', ''];
  for (const [d, ys] of [...byDecade.entries()].sort((a, b) => a[0] - b[0])) {
    const total = ys.reduce((n, y) => n + byYear.get(y).length, 0);
    parts.push(`- [[decade-${d}s|${d}年代]]（${total}件・${ys.length}年）`);
  }
  parts.push('', '## 関連', '- [[Home]]', '', '---', GENERATED_NOTE, '');
  return parts.join('\n');
}

/** 学習パス: カテゴリごとに「中心概念 → 年代順 → 年代不明」の決定論カリキュラム。 */
function pathPages(entries, yearOf, degreeOf) {
  const files = {};
  const groups = new Map();
  for (const e of entries) {
    const k = `${e.collection}-${e.category}`;
    (groups.get(k) || groups.set(k, { label: `${e.collectionLabel}／${e.categoryLabel}`, items: [] }).get(k)).items.push(e);
  }
  const keys = [...groups.keys()].sort();
  for (const k of keys) {
    const g = groups.get(k);
    const items = g.items.sort((a, b) => (a.id < b.id ? -1 : 1));
    const central = [...items]
      .sort((a, b) => (degreeOf.get(b.id) || 0) - (degreeOf.get(a.id) || 0) || (a.id < b.id ? -1 : 1))
      .slice(0, Math.min(15, items.length));
    const centralIds = new Set(central.map((e) => e.id));
    const dated = items.filter((e) => !centralIds.has(e.id) && yearOf.get(e.id)).sort((a, b) => yearOf.get(a.id) - yearOf.get(b.id) || (a.id < b.id ? -1 : 1));
    const undated = items.filter((e) => !centralIds.has(e.id) && !yearOf.get(e.id));
    const fm = ['---', `title: ${yamlStr(`学習パス: ${g.label}`)}`, 'type: learning-path', `path_key: ${yamlStr(k)}`, `entry_count: ${items.length}`, 'tags:', '  - MOC', '  - learning-path', '---'];
    const parts = [fm.join('\n'), '', `# 学習パス — ${g.label}（${items.length}件）`, '', '> [!info] 決定論カリキュラム: ①グラフ次数の高い中心概念で土台を作り ②年代順に発展を追い ③年代情報のない項目で仕上げる。', '', `## 第 1 部 — 中心概念（グラフ接続数 上位 ${central.length}）`];
    for (const e of central) parts.push(`- [[${e.id}|${e.title}]]（接続 ${degreeOf.get(e.id) || 0}）`);
    if (dated.length > 0) {
      parts.push('', '## 第 2 部 — 年代順の展開');
      for (const e of dated) parts.push(`- ${yearOf.get(e.id)}年: [[${e.id}|${e.title}]]`);
    }
    if (undated.length > 0) {
      parts.push('', '## 第 3 部 — 年代情報のない項目');
      for (const e of undated) parts.push(`- [[${e.id}|${e.title}]]`);
    }
    parts.push('', '## 関連', '- 索引: [[学習パス索引]]', `- フラッシュカード: [[deck-${k}]]`, `- クイズ: [[quiz-${k}]]`, '', '---', GENERATED_NOTE, '');
    files[path.join('paths', `path-${k}.md`)] = parts.join('\n');
  }
  return { files, keys, groups };
}

/** 教育 MOC: education.cjs のカード/クイズをカテゴリ別 md に展開（幻覚ゼロのまま）。 */
function educationPages(entries) {
  const files = {};
  const cards = edu.buildFlashcards(entries);
  const quiz = edu.buildQuiz(entries);
  const groupOf = (x) => `${x.collection}-${x.category}`;
  const labelOf = new Map(entries.map((e) => [`${e.collection}-${e.category}`, `${e.collectionLabel}／${e.categoryLabel}`]));

  const cardGroups = new Map();
  for (const c of cards) (cardGroups.get(groupOf(c)) || cardGroups.set(groupOf(c), []).get(groupOf(c))).push(c);
  for (const [k, list] of [...cardGroups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const fm = ['---', `title: ${yamlStr(`フラッシュカード: ${labelOf.get(k)}`)}`, 'type: flashcard-deck', `deck_key: ${yamlStr(k)}`, `card_count: ${list.length}`, 'tags:', '  - education', '  - flashcards', '---'];
    const parts = [fm.join('\n'), '', `# フラッシュカード — ${labelOf.get(k)}（${list.length}枚）`, '', '> [!info] 表=概念名 / 裏=検証済み定義の先頭文。`knowledge-graph/education/flashcards.ndjson` と同一の純関数から生成。', ''];
    for (const c of list) {
      parts.push(`- **Q:** ${c.front}`);
      parts.push(`  - **A:** ${c.back}（→ [[${c.ref}]]）`);
    }
    parts.push('', '## 関連', '- 索引: [[教育素材索引]]', `- 学習パス: [[path-${k}]]`, '', '---', GENERATED_NOTE, '');
    files[path.join('education', `deck-${k}.md`)] = parts.join('\n');
  }

  const quizGroups = new Map();
  for (const q of quiz) (quizGroups.get(groupOf(q)) || quizGroups.set(groupOf(q), []).get(groupOf(q))).push(q);
  const OPT = ['A', 'B', 'C', 'D'];
  for (const [k, list] of [...quizGroups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const fm = ['---', `title: ${yamlStr(`クイズ: ${labelOf.get(k)}`)}`, 'type: quiz', `quiz_key: ${yamlStr(k)}`, `question_count: ${list.length}`, 'tags:', '  - education', '  - quiz', '---'];
    const parts = [fm.join('\n'), '', `# 4 択クイズ — ${labelOf.get(k)}（${list.length}問）`, '', '> [!info] 誤答選択肢も実在する概念タイトルのみ（幻覚ゼロ）。`knowledge-graph/education/quiz.ndjson` と同一の純関数から生成。', ''];
    list.forEach((q, i) => {
      parts.push(`### 第 ${i + 1} 問`, q.question);
      q.options.forEach((o, j) => parts.push(`- ${OPT[j]}. ${o}`));
      parts.push(`> [!success]- 答え`, `> ${OPT[q.answer]}. ${q.options[q.answer]}（→ [[${q.ref}]]）`, '');
    });
    parts.push('## 関連', '- 索引: [[教育素材索引]]', `- 学習パス: [[path-${k}]]`, '', '---', GENERATED_NOTE, '');
    files[path.join('education', `quiz-${k}.md`)] = parts.join('\n');
  }
  return { files, deckKeys: [...cardGroups.keys()].sort(), quizKeys: [...quizGroups.keys()].sort(), labelOf };
}

function pathIndexNote(keys, groups) {
  const fm = ['---', 'title: 学習パス索引', 'type: MOC', 'tags:', '  - MOC', '  - learning-path', '---'];
  const parts = [fm.join('\n'), '', '# 学習パス索引 — 分野別カリキュラム', ''];
  for (const k of keys) parts.push(`- [[path-${k}|${groups.get(k).label}]]（${groups.get(k).items.length}件）`);
  parts.push('', '## 関連', '- [[Home]]', '', '---', GENERATED_NOTE, '');
  return parts.join('\n');
}

function educationIndexNote(deckKeys, quizKeys, labelOf) {
  const fm = ['---', 'title: 教育素材索引', 'type: MOC', 'tags:', '  - MOC', '  - education', '---'];
  const parts = [fm.join('\n'), '', '# 教育素材索引 — フラッシュカードとクイズ', '', '全て検証済みフィールドのコピー・切詰め・並べ替えのみで生成（新規散文ゼロ=幻覚ゼロ）。', '', '## フラッシュカード'];
  for (const k of deckKeys) parts.push(`- [[deck-${k}|${labelOf.get(k)}]]`);
  parts.push('', '## 4 択クイズ');
  for (const k of quizKeys) parts.push(`- [[quiz-${k}|${labelOf.get(k)}]]`);
  parts.push('', '## 関連', '- [[Home]]', '', '---', GENERATED_NOTE, '');
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
    for (const e of g.items)
      parts.push(`- [[${e.id}|${assertWikiAliasSafe(e.title, 'title')}]] — ${mdInline(kc.oneLiner(e.summary, 60))}`);
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
    '## 横断索引（柱 B）',
    '- [[人物索引]] — 思想家・研究者から概念を辿る（2 概念以上で登場する人物）',
    '- [[出典ドメイン索引]] — 引用元ドメインから概念を辿る',
    '- [[年表索引]] — 初出・提唱・制定の年から辿る',
    '- [[学習パス索引]] — 分野別カリキュラム（中心概念→年代順）',
    '- [[教育素材索引]] — フラッシュカード・4 択クイズ（幻覚ゼロ）',
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
      for (const it of g.items)
        parts.push(`- [[${it.id}|${assertWikiAliasSafe(it.title, 'title')}]] — ${mdInline(kc.oneLiner(it.oneLiner, 60))}`);
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

  // 知識グラフは 1 回だけ計算し、関連概念・年表・学習パスで共有（読み戻しなし・同一純関数から）。
  const graph = kg.computeGraph(entries);
  const related = buildRelatedMap(graph, entries);
  const yearOf = new Map(graph.nodes.map((n) => [n.id, n.year]));
  const degreeOf = new Map(graph.nodes.map((n) => [n.id, n.degree]));

  for (const col of kc.COLLECTIONS) {
    const list = byCollection.get(col.key) || [];
    files[path.join('MOC', `${col.label}.md`)] = mocNote(col, list);
    for (const e of list)
      files[path.join('notes', e.collection, e.category, `${e.id}.md`)] = entryNote(e, related.get(e.id) || []);
  }

  // 柱 B Phase 2: 人物ページ（2 概念以上の人物）と出典ドメインページ（全ホスト）+ 索引 MOC。
  const thinkers = collectThinkers(entries);
  const thinkerSlug = makeSlugger('thinker');
  const thinkerSlugOf = new Map();
  for (const t of thinkers) thinkerSlugOf.set(t.key, thinkerSlug(t.key));
  for (const t of thinkers) files[path.join('people', `${thinkerSlugOf.get(t.key)}.md`)] = thinkerNote(t);
  files[path.join('MOC', '人物索引.md')] = thinkerIndexNote(thinkers, thinkerSlugOf);

  const domains = collectSourceDomains(entries);
  const domainSlug = makeSlugger('source');
  const domainSlugOf = new Map();
  for (const d of domains) domainSlugOf.set(d.host, domainSlug(d.host));
  for (const d of domains) files[path.join('sources', `${domainSlugOf.get(d.host)}.md`)] = sourceDomainNote(d);
  files[path.join('MOC', '出典ドメイン索引.md')] = sourceDomainIndexNote(domains, domainSlugOf);

  // 柱 B Phase 3: 年表・学習パス・教育 MOC。
  const tl = timelinePages(entries, yearOf);
  Object.assign(files, tl.files);
  files[path.join('MOC', '年表索引.md')] = timelineIndexNote(tl.byDecade, tl.byYear);
  const lp = pathPages(entries, yearOf, degreeOf);
  Object.assign(files, lp.files);
  files[path.join('MOC', '学習パス索引.md')] = pathIndexNote(lp.keys, lp.groups);
  const ed = educationPages(entries);
  Object.assign(files, ed.files);
  files[path.join('MOC', '教育素材索引.md')] = educationIndexNote(ed.deckKeys, ed.quizKeys, ed.labelOf);

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

  /*
   * 網羅 — 本体データの全項目にノートが在ること (2026-08-22 に足した)。
   *
   * `--check` は「再生成した内容 == committed」を見る。ドリフト (committed が
   * 古い) は捕まえるが、**生成そのものが壊れた場合は捕まえられない** ——
   * 誰かが `vault:build` を回せば committed も一緒に縮み、差分が消えて通る。
   * 出力の「7543 ファイル」は本体の 4140 項目と突き合わせていなかった。
   *
   * 同じ形を `verify:graph` でも見つけて直した (あちらは対照実験で、
   * 成果物を再生成すると byte 一致が通ってしまうことを確認済み)。
   *
   * ノートのパスは `notes/<collection>/<category>/<id>.md` で決まるので、
   * 部分一致ではなくパスそのもので確かめる。
   */
  const missingNotes = entries.filter(
    (e) => !(path.join('notes', e.collection, e.category, `${e.id}.md`) in files),
  );
  if (missingNotes.length) {
    throw new Error(
      `ノートが生成されなかった項目が ${missingNotes.length} 件あります`
        + ` (例: ${missingNotes.slice(0, 5).map((e) => e.id).join(', ')})。`
        + ' 本体データの全項目に notes/<collection>/<category>/<id>.md が要ります。',
    );
  }

  return files;
}

function writeVault(outDir, files) {
  // ノート名はデータ由来 (id / collection / category)。`..` が 1 つ混ざると
  // 書き出し先の外へ出る。関門は `scripts/safe-vault-write.cjs` に 1 つだけ。
  //
  // **消す前に確かめる。** 先に rmSync すると、名前がおかしいときに
  // 「既存の vault を消してから書くのを拒む」ことになり、7500 件が失われた
  // 状態で止まる (この順序の誤りは、関門を入れた直後の実地試験で踏んだ)。
  safeWrite.assertAllInside(outDir, files);
  fs.rmSync(outDir, { recursive: true, force: true });
  safeWrite.writeFilesInto(outDir, files);
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

// 読み込むだけで生成が走り、しかも process.exit で落ちていた。外から証人を
// 立てられない構造そのものだったので、CLI として呼ばれたときだけ走らせる。
module.exports = { yamlStr, linkSafe, mdInline, assertWikiAliasSafe, assertBareYamlScalar, buildFiles };

if (require.main === module) process.exit(main());
