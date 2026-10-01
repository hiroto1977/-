'use strict';

/**
 * 確証済み知識ベース ⇄ AIオーケストレーション の橋渡し (共有モジュール)。
 *
 * リポジトリ内の「確証済み (出典つき) 知識」データセットすべてを、TypeScript を
 * トランスパイルして安全にロードし、共通のノートモデルへ正規化する。これにより
 * 学術概念だけでなく、法務・税務・労務 / 補助金・助成金 / 相談窓口 / 経済史 を
 * 横断して Obsidian ヴォルト化し、AIオーケストレーションの各役員ロールへ
 * コンテキストとして注入できる。
 *
 * 取り込むコレクション (= 単一の真実源):
 *   academic      src/renderer/data/academicKnowledge.ts   VERIFIED_CONCEPTS
 *   compliance    src/renderer/data/complianceKnowledge.ts VERIFIED_COMPLIANCE
 *   subsidy       src/renderer/data/subsidyKnowledge.ts    VERIFIED_SUBSIDIES
 *   support       src/renderer/data/counselorKnowledge.ts  VERIFIED_SUPPORT_RESOURCES
 *   econ-history  src/renderer/data/economicHistoryKnowledge.ts ECONOMIC_HISTORY
 *
 * 利用側: scripts/build-knowledge-vault.cjs / scripts/orchestrate-context.cjs /
 *         scripts/orchestrate.cjs (dispatch)。
 *
 * 設計: TS の型を transpileModule で除去して評価するため、配列リテラルの整形や
 * モジュール内の相互参照 (const 参照) に依存しない。型のみ import は消える。
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const REPO_ROOT = path.resolve(__dirname, '..');
const DATA = path.join(REPO_ROOT, 'src/renderer/data');
const KNOWLEDGE_MAP = path.join(REPO_ROOT, 'orchestration/knowledge-map.json');
const REGISTRY = path.join(REPO_ROOT, 'orchestration/registry.json');

/**
 * TS データモジュールを型除去して評価し、export を取り出す。
 *
 * ## なぜ評価するのか (正規表現で読まない理由)
 *
 * 出典配列は `MHLW_MAMOROU` のようなモジュール内の const を参照している。
 * `type: '…'` を数える読み方では取りこぼすので、型だけ落として素直に実行する。
 *
 * ## なぜ `new Function` を許しているのか
 *
 * これは不変条件 #9 (eval / new Function 禁止) に対する**明示的な例外**で、
 * `lint:forbidden` の台帳に理由つきで載せてある。成り立つ根拠は 1 つだけ:
 *
 *   **評価するのは常に `src/renderer/data/` 配下の追跡済みソース**であること。
 *
 * ビルド時にしか走らず (出荷物には入らない)、そこを書き換えられる人は
 * `npm test` でも同じことができるので、実質 `require()` と同じ強さしかない。
 *
 * 根拠が本当かは**呼び出し口を読んで確かめる**しかない状態だった。それでは
 * いつか崩れるので、関数側で封じ込める —— データ由来のパスが渡された時点で
 * 例外にする。ここを緩めることは「任意のファイルを実行できる」に等しい。
 */
function loadModuleExports(file) {
  let resolved = path.resolve(file);
  if (resolved !== path.normalize(file) && !path.isAbsolute(file)) {
    // 相対指定は呼び出し口の作業ディレクトリに依存する。受け付けない。
    throw new Error(`loadModuleExports: 絶対パスで渡してください (${file})`);
  }
  /*
   * **閉じ込めを見る前に symlink を実体まで辿る。**
   *
   * `path.resolve` は `..` を畳むが **symlink は辿らない**。2026-08-27 の実測:
   *
   * ```
   *   src/renderer/data/x.ts -> ../../../payload.ts      (どちらも PR で足せる)
   *   loadModuleExports('<repo>/src/renderer/data/x.ts')
   *     → 字面の閉じ込めは通り、readFileSync が link を辿り、
   *       transpile して new Function で **payload.ts が実行される**
   * ```
   *
   * この関数の下の注記は「外を許すと**任意コード実行になります**」と書いている。
   * その当のことが symlink 一本で起きていた。`ci.yml` は `pull_request` で
   * `verify:orchestration` を走らせるので、**fork からの PR が CI で任意コードを
   * 実行できる**経路だった (`contents: read` なので被害範囲は限られるが、
   * runner とネットワークには届く)。
   *
   * 兄弟の `exportPaths.assertExportTargetContained` を 2026-08-26 に同じ理由で
   * 直している —— **字面の閉じ込めは symlink を見ない**。
   *
   * 存在しないパスは realpath が投げるので、そのときは字面のまま進める
   * (後段の `readFileSync` が ENOENT で落ちる)。
   */
  try {
    resolved = fs.realpathSync(resolved);
  } catch {
    /* 実体が無い — 下の readFileSync が落ちる。閉じ込めは字面で見る。 */
  }
  if (resolved !== DATA && !resolved.startsWith(DATA + path.sep)) {
    throw new Error(
      `loadModuleExports: ${DATA} の外は評価しません (${resolved})。`
      + ' この関数は型を落として実行するので、外を許すと任意コード実行になります。',
    );
  }
  if (!resolved.endsWith('.ts')) {
    throw new Error(`loadModuleExports: .ts 以外は評価しません (${resolved})`);
  }
  const src = fs.readFileSync(resolved, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = { exports: {} };
  // 型のみ import は transpile で消える。万一の require は無害なスタブへ。
  // Stryker disable next-line all: 不変条件 #9 の明示的な例外 (上の説明を参照)
  new Function('module', 'exports', 'require', js)(m, m.exports, () => ({}));
  return m.exports;
}

const DISCIPLINE_LABELS = {
  economics: '経済学',
  management: '経営学',
  'human-science': '人間科学',
  'business-law': 'ビジネス法務',
  'information-sociology': '情報社会学',
};
const COMPLIANCE_LABELS = { tax: '税務', labor: '労務', legal: '法務' };
const SUBSIDY_LABELS = { employment: '雇用', business: '事業', welfare: '福祉', 'tax-incentive': '税制優遇' };

const decade = (year) => `${Math.floor(year / 10) * 10}年代`;
const clean = (s) => String(s == null ? '' : s).trim();

// 各コレクションの設定。adapt は生エントリ → 共通ノートモデルへ正規化する。
// 共通ノートモデル: { id, title, category, summary, meta:[{label,value}], sources:[{url,type,label}], asOf }
const COLLECTIONS = [
  {
    key: 'academic',
    label: '学術概念',
    file: path.join(DATA, 'academicKnowledge.ts'),
    exportName: 'VERIFIED_CONCEPTS',
    categoryLabel: (c) => DISCIPLINE_LABELS[c] || c,
    adapt: (c) => ({
      id: c.id,
      title: c.title,
      category: c.discipline,
      summary: c.statement,
      meta: [{ label: '提唱者・初出', value: c.keyFigures }],
      sources: c.sources,
      asOf: c.asOf || '',
    }),
  },
  {
    key: 'compliance',
    label: '法務・税務・労務',
    file: path.join(DATA, 'complianceKnowledge.ts'),
    exportName: 'VERIFIED_COMPLIANCE',
    categoryLabel: (c) => COMPLIANCE_LABELS[c] || c,
    adapt: (claim) => {
      const v = claim.value;
      return {
        id: v.id,
        title: v.title,
        category: v.domain,
        summary: v.statement,
        meta: [{ label: '所管・根拠', value: v.authority }],
        sources: claim.sources,
        asOf: v.asOf || '',
      };
    },
  },
  {
    key: 'subsidy',
    label: '補助金・助成金',
    file: path.join(DATA, 'subsidyKnowledge.ts'),
    exportName: 'VERIFIED_SUBSIDIES',
    categoryLabel: (c) => SUBSIDY_LABELS[c] || c,
    adapt: (s) => ({
      id: s.id,
      title: s.name,
      category: s.domain,
      summary: s.statement,
      meta: [
        { label: '所管・実施機関', value: s.authority },
        { label: '申請', value: s.application },
        { label: '区分', value: s.level },
      ],
      sources: s.sources,
      asOf: s.asOf || '',
    }),
  },
  {
    key: 'support',
    label: '相談窓口',
    file: path.join(DATA, 'counselorKnowledge.ts'),
    exportName: 'VERIFIED_SUPPORT_RESOURCES',
    categoryLabel: () => '相談窓口',
    adapt: (claim, i) => ({
      id: `support-${String(i + 1).padStart(2, '0')}`,
      title: claim.value.label,
      category: 'resource',
      summary: claim.value.detail,
      meta: [],
      sources: claim.sources,
      asOf: '2026-06',
    }),
  },
  {
    key: 'econ-history',
    label: '経済史',
    file: path.join(DATA, 'economicHistoryKnowledge.ts'),
    exportName: 'ECONOMIC_HISTORY',
    categoryLabel: (c) => c,
    adapt: (y, _i, mod) => ({
      id: `eh-${y.year}`,
      title: `${y.year}年（${y.era}）`,
      category: decade(y.year),
      summary: `【世界】${clean(y.world)}\n\n【日本】${clean(y.japan)}`,
      meta: [
        { label: '主な出来事', value: (y.keyEvents || []).join('／') },
        { label: '伸長セクター', value: (y.risingSectors || []).join('・') },
        { label: '縮小セクター', value: (y.decliningSectors || []).join('・') },
        { label: '留意', value: clean(y.caveats) },
      ],
      sources: y.sources || [],
      // 年表は一括確証のため、データ側の検証基準月（ECONOMIC_HISTORY_AS_OF）を全項目に適用。
      asOf: mod.ECONOMIC_HISTORY_AS_OF || '',
    }),
  },
];

const COLLECTION_BY_KEY = Object.fromEntries(COLLECTIONS.map((c) => [c.key, c]));

const AUTHORITATIVE_TYPES = new Set(['academic', 'reference', 'government', 'municipality']);
const SOURCE_TYPE_LABEL = {
  academic: '学術',
  reference: 'リファレンス',
  government: '公的',
  municipality: '自治体',
  operator: '運営団体',
  media: 'メディア',
  other: 'その他',
};

/** 全コレクションを共通ノートモデルへ正規化してロードする。 */
function loadEntries() {
  const out = [];
  for (const col of COLLECTIONS) {
    const mod = loadModuleExports(col.file);
    const raw = mod[col.exportName];
    if (!Array.isArray(raw)) throw new Error(`${col.exportName} が配列ではありません (${col.file})`);
    raw.forEach((r, i) => {
      const n = col.adapt(r, i, mod);
      n.collection = col.key;
      n.collectionLabel = col.label;
      n.categoryLabel = col.categoryLabel(n.category);
      n.sources = (n.sources || []).map((s) => ({ url: s.url, type: s.type, label: s.label }));
      n.authoritative = n.sources.some((s) => AUTHORITATIVE_TYPES.has(s.type));
      n.meta = (n.meta || []).filter((m) => clean(m.value).length > 0);
      out.push(n);
    });
  }
  // id 昇順で安定ソート (コレクション内で決定論的)。
  out.sort((a, b) => (a.collection < b.collection ? -1 : a.collection > b.collection ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

function loadKnowledgeMap() {
  return JSON.parse(fs.readFileSync(KNOWLEDGE_MAP, 'utf8'));
}
function loadRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
}

function oneLiner(text, max = 120) {
  const flat = String(text || '').replace(/\s+/g, '');
  const dot = flat.indexOf('。');
  let s = dot >= 0 ? flat.slice(0, dot + 1) : flat;
  if (s.length > max) s = `${s.slice(0, max - 1)}…`;
  return s;
}

/** 役員ロールの知識指定 { collection: '*' | [categories] } に entry が該当するか。 */
function execWants(spec, entry) {
  if (!spec) return false;
  const sel = spec[entry.collection];
  if (sel === undefined) return false;
  if (sel === '*' || sel === true) return true;
  return Array.isArray(sel) && sel.includes(entry.category);
}

/**
 * 役員ロールへの知識ブリーフ。コレクション→区分でグルーピングして返す。
 */
function briefForExecutive(execId, opts = {}) {
  const entries = opts.entries || loadEntries();
  const map = opts.map || loadKnowledgeMap();
  const limit = Number.isFinite(opts.limit) ? opts.limit : Infinity;
  const spec = (map.executiveKnowledge || {})[execId];
  const groups = new Map(); // key: `${collection}␟${category}` -> {collection,collectionLabel,category,categoryLabel,items:[]}
  for (const e of entries) {
    if (!execWants(spec, e)) continue;
    const gk = `${e.collection}␟${e.category}`;
    if (!groups.has(gk)) groups.set(gk, { collection: e.collection, collectionLabel: e.collectionLabel, category: e.category, categoryLabel: e.categoryLabel, items: [] });
    groups.get(gk).items.push(e);
  }
  const result = [...groups.values()].map((g) => ({
    collection: g.collection,
    collectionLabel: g.collectionLabel,
    category: g.category,
    categoryLabel: g.categoryLabel,
    count: g.items.length,
    items: g.items.slice(0, limit).map((c) => ({ id: c.id, title: c.title, oneLiner: oneLiner(c.summary) })),
  }));
  return { executive: execId, groups: result };
}

module.exports = {
  REPO_ROOT,
  COLLECTIONS,
  COLLECTION_BY_KEY,
  SOURCE_TYPE_LABEL,
  AUTHORITATIVE_TYPES,
  loadModuleExports,
  loadEntries,
  loadKnowledgeMap,
  loadRegistry,
  oneLiner,
  execWants,
  briefForExecutive,
};
