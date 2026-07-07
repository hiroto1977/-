'use strict';

/**
 * knowledge-graph — 検証済み知識 4,200+ 項目を結ぶ知識グラフの純計算コア。
 *
 * 入力は knowledge-context.cjs の共通ノートモデル（{id,title,category,summary,
 * meta,sources,collection,categoryLabel}）の配列。出力は決定論的な
 * {nodes, edges}。IO なし・時刻/乱数なし・スコアは整数（round(metric*10000)）で、
 * 同じ入力からは常に byte 一致の成果物が得られる（verify:graph が強制）。
 *
 * エッジ 5 型（無向・正準 a<b・ノードごと上位 KEEP_PER_NODE 保持）:
 *   - term-overlap       IDF 重み付き語集合の Jaccard ≥ 0.12
 *   - discipline-bridge  分野横断（コレクション or 学術分野が異なる）かつ Jaccard ≥ 0.18
 *   - shares-thinker     正規化した提唱者「姓」を 1 つ以上共有
 *   - shares-source      希少な出典ホスト（df ≤ RARE_HOST_DF）を共有
 *   - same-category      同一カテゴリ内の近傍（term-overlap 閾値未満でも上位 2 件）
 *
 * 語抽出は src/renderer/data/assistantContext.ts の extractWeightedTerms と同じ
 * 仕様の移植（TS はモジュール読込時にコーパスを構築するため require 再利用不可）:
 * 英数語 + CJK バイグラム、ひらがなのみバイグラムは重み 0.2、単独漢字は 0.5。
 */

// ---------------------------------------------------------------------------
// 語抽出（assistantContext.ts の移植・仕様同一）
// ---------------------------------------------------------------------------
const GLUE_WEIGHT = 0.2;

function isCjk(ch) {
  return /[぀-ヿ㐀-鿿豈-﫿]/.test(ch);
}
function isHiraganaOnly(s) {
  return /^[぀-ゟー]+$/.test(s);
}

/** クエリ → 重み付きユニーク語（小文字化・NFKC 済み）。 */
function extractWeightedTerms(query) {
  const norm = String(query || '').normalize('NFKC').toLowerCase();
  const seen = new Map();
  const add = (t, w) => {
    const prev = seen.get(t);
    if (prev === undefined || w > prev) seen.set(t, w);
  };
  for (const m of norm.matchAll(/[a-z0-9][a-z0-9.+_-]{1,}/g)) add(m[0], 1);
  let run = '';
  const flush = () => {
    if (run.length === 1) {
      if (/[㐀-鿿豈-﫿]/.test(run)) add(run, 0.5);
    } else {
      for (let i = 0; i < run.length - 1; i++) {
        const bg = run.slice(i, i + 2);
        add(bg, isHiraganaOnly(bg) ? GLUE_WEIGHT : 1);
      }
    }
    run = '';
  };
  for (const ch of norm) {
    if (isCjk(ch)) run += ch;
    else flush();
  }
  flush();
  return [...seen.entries()].map(([t, w]) => ({ t, w }));
}

// ---------------------------------------------------------------------------
// 著者姓・出典ホスト・初出年の正規化
// ---------------------------------------------------------------------------
/** 著者情報から除外する語（機関・出版・一般語）。 */
const AUTHOR_STOPWORDS = new Set([
  'university', 'press', 'journal', 'review', 'oxford', 'cambridge', 'harvard', 'mit',
  'wiley', 'elsevier', 'springer', 'routledge', 'sage', 'palgrave', 'norton', 'penguin',
  'the', 'of', 'and', 'et', 'al', 'eds', 'ed', 'vol', 'no', 'pp', 'doi', 'isbn',
  'national', 'average', 'index', 'bank', 'fund', 'report', 'working', 'paper', 'series',
  'djia', 'gdp', 'oecd', 'imf', 'nber', 'ssrn', 'hbr', 'inc', 'llc', 'school', 'business',
  'prefecture', 'ministry', 'agency', 'bureau', 'office', 'city', 'japan', 'tokyo',
  '教授', '大学', '学派', '研究', '理論', '模型', 'モデル', '概念', '初出', '提唱', '共著',
  'ノーベル', 'ランキング', 'ジャーナル', 'レビュー', 'プレス', 'ブックス', 'サイエンス',
  'リサーチ', 'レポート', 'インデックス', 'センター', 'スクール', 'カレッジ', 'アプローチ',
  'シリーズ', 'エコノミクス', 'マネジメント', 'ビジネス', 'オンライン', 'データ',
]);

/**
 * 「提唱者・初出」等の文字列から正規化済みの姓集合を作る。
 *   - ラテン姓: "Kahan, Dan M." → "kahan"（カンマ前 or 単語列の末尾語）
 *   - カタカナ姓: 「ジョン・メイナード・ケインズ」→「ケインズ」
 *     （氏名は中黒区切りの**最後**のカタカナトークン。3 文字以上のみ採用）
 *   - 年号・イニシャル・機関語（stopword）は除去
 */
function extractAuthorSurnames(text) {
  const out = new Set();
  const s = String(text || '').normalize('NFKC');
  if (!s) return out;
  // 氏名リストの区切り（／ ; ＆）。カンマは "Surname, First" 形式の内部区切り、
  // 中黒 ・ はカタカナ氏名の内部区切りなので、ここでは割らない。
  for (const part of s.split(/[／/;；]|(?:\s*[＆&]\s*)/)) {
    const p = part.trim();
    if (!p) continue;
    const beforeParen = p.split(/[（(]/)[0].trim();
    // ラテン: "Surname, First" はカンマ前を姓とする。カンマ無しは末尾語（"Milton Friedman"→friedman）。
    const commaMatch = beforeParen.match(/^([A-Za-z'’-]{3,})\s*,/);
    if (commaMatch) {
      const surname = commaMatch[1].toLowerCase();
      if (!AUTHOR_STOPWORDS.has(surname)) out.add(surname);
    } else {
      const words = beforeParen.match(/[A-Za-z'’-]{3,}/g) || [];
      if (words.length > 0) {
        const surname = words[words.length - 1].toLowerCase();
        if (!AUTHOR_STOPWORDS.has(surname) && !/^\d+$/.test(surname)) out.add(surname);
      }
    }
    // カタカナ氏名: 中黒で区切られた連なりの最後のトークンが姓
    for (const nameRun of beforeParen.matchAll(/[ァ-ヴー]{2,}(?:[・][ァ-ヴー]{1,})*/g)) {
      const toks = nameRun[0].split('・').filter(Boolean);
      const last = toks[toks.length - 1];
      if (last && last.length >= 3 && !AUTHOR_STOPWORDS.has(last)) out.add(last);
    }
  }
  return out;
}

/** URL → ホスト名（www. は剥がす）。不正 URL は null。 */
function hostOf(url) {
  const m = String(url || '').match(/^https?:\/\/([^/]+)/i);
  if (!m) return null;
  return m[1].toLowerCase().replace(/^www\./, '');
}

/** テキスト中の最初期の年（1500–2099）を返す。無ければ null。 */
function firstYear(text) {
  let min = null;
  for (const m of String(text || '').matchAll(/\b(1[5-9]\d\d|20\d\d)\b/g)) {
    const y = Number(m[1]);
    if (min === null || y < min) min = y;
  }
  return min;
}

// ---------------------------------------------------------------------------
// グラフ計算
// ---------------------------------------------------------------------------
const DEFAULTS = {
  topTerms: 24, // ノード署名に使う上位 IDF 語数
  termJaccardMin: 0.12, // term-overlap 閾値
  bridgeJaccardMin: 0.18, // discipline-bridge 閾値
  keepPerNode: 10, // ノードごとに保持するエッジ上限
  maxTermBucket: 60, // これより大きい語バケットは一般語とみなし候補生成に使わない
  maxAuthorBucket: 30,
  rareHostDf: 25, // 希少ホストの df 上限
  sameCategoryTop: 2, // same-category で保証する近傍数
};

const TYPE_PRIORITY = {
  'term-overlap': 0,
  'discipline-bridge': 1,
  'shares-thinker': 2,
  'shares-source': 3,
  'same-category': 4,
};

function byIdAsc(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 知識グラフを計算する（決定論）。
 * @param {Array} entries knowledge-context.cjs 互換の共通ノートモデル配列
 * @param {Object} [opts] DEFAULTS の上書き
 * @returns {{nodes: Array, edges: Array, stats: Object}}
 */
function computeGraph(entries, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const list = [...entries].sort((x, y) => byIdAsc(x.id, y.id));
  const n = list.length;

  // --- ノード特徴の前計算 -------------------------------------------------
  const feat = new Map(); // id → {terms:Map(t→w), authors:Set, hosts:Set, year, discipline}
  const df = new Map(); // term → document frequency
  for (const e of list) {
    const terms = new Map();
    for (const { t, w } of extractWeightedTerms(`${e.title} ${e.summary || ''}`)) {
      if (w >= 1) terms.set(t, w); // 署名は内容語のみ（膠着語・単独漢字は除外）
    }
    for (const t of terms.keys()) df.set(t, (df.get(t) || 0) + 1);
    const metaText = (e.meta || []).map((m) => m.value).join('／');
    const hosts = new Set();
    for (const s of e.sources || []) {
      const h = hostOf(s.url);
      if (h) hosts.add(h);
    }
    feat.set(e.id, {
      terms,
      authors: extractAuthorSurnames(metaText),
      hosts,
      year: firstYear(`${metaText} ${e.title}`),
      discipline: `${e.collection}:${e.category}`,
    });
  }
  const idf = (t) => Math.log(1 + n / (1 + (df.get(t) || 0)));

  // 署名 = 上位 topTerms 語（idf 降順・語昇順で決定論）
  const hostDf = new Map();
  for (const f of feat.values()) for (const h of f.hosts) hostDf.set(h, (hostDf.get(h) || 0) + 1);
  const sig = new Map(); // id → Map(term→idf)
  for (const [id, f] of feat) {
    const ranked = [...f.terms.keys()]
      .map((t) => [t, idf(t)])
      .sort((a, b) => b[1] - a[1] || byIdAsc(a[0], b[0]))
      .slice(0, cfg.topTerms);
    sig.set(id, new Map(ranked));
  }

  // --- 候補生成（転置索引・バケット） -------------------------------------
  const candidates = new Set(); // "a|b" (a<b)
  const addCand = (x, y) => {
    if (x === y) return;
    candidates.add(x < y ? `${x}|${y}` : `${y}|${x}`);
  };
  const termBucket = new Map();
  for (const [id, s] of sig) {
    for (const t of s.keys()) {
      const arr = termBucket.get(t) || [];
      arr.push(id);
      termBucket.set(t, arr);
    }
  }
  for (const arr of termBucket.values()) {
    if (arr.length < 2 || arr.length > cfg.maxTermBucket) continue;
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) addCand(arr[i], arr[j]);
  }
  const authorBucket = new Map();
  for (const [id, f] of feat) {
    for (const a of f.authors) {
      const arr = authorBucket.get(a) || [];
      arr.push(id);
      authorBucket.set(a, arr);
    }
  }
  for (const arr of authorBucket.values()) {
    if (arr.length < 2 || arr.length > cfg.maxAuthorBucket) continue;
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) addCand(arr[i], arr[j]);
  }
  const hostBucket = new Map();
  for (const [id, f] of feat) {
    for (const h of f.hosts) {
      if ((hostDf.get(h) || 0) > cfg.rareHostDf) continue;
      const arr = hostBucket.get(h) || [];
      arr.push(id);
      hostBucket.set(h, arr);
    }
  }
  for (const arr of hostBucket.values()) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) addCand(arr[i], arr[j]);
  }

  // --- ペア採点 -----------------------------------------------------------
  // IDF 重み付き包含度 = Σidf(∩) / min(ΣidfA, ΣidfB)。Jaccard（/∪）だと署名長の
  // 非対称で関連対まで落ちるため、短い側にどれだけ含まれるかで測る（無関連対では
  // 依然ほぼ 0 — 決定論サンプリング 6,078 対中 0.12 超は 3 対のみを実測確認済み）。
  const weightedJaccard = (A, B) => {
    let inter = 0;
    let sumA = 0;
    let sumB = 0;
    for (const [t, v] of A) {
      if (B.has(t)) inter += v;
      sumA += v;
    }
    for (const [, v] of B) sumB += v;
    const denom = Math.min(sumA, sumB);
    return denom > 0 ? inter / denom : 0;
  };
  const setOverlapScore = (A, B) => {
    let shared = 0;
    for (const x of A) if (B.has(x)) shared++;
    if (shared === 0) return 0;
    return Math.round((10000 * shared) / Math.max(1, Math.min(A.size, B.size)));
  };

  const scored = []; // {a,b,type,score}
  const overlapByPair = new Map(); // 同一カテゴリ近傍用に再利用
  for (const key of [...candidates].sort()) {
    const [a, b] = key.split('|');
    const fa = feat.get(a);
    const fb = feat.get(b);
    const j = weightedJaccard(sig.get(a), sig.get(b));
    overlapByPair.set(key, j);
    const cross = fa.discipline !== fb.discipline;
    if (j >= cfg.bridgeJaccardMin && cross) {
      scored.push({ a, b, type: 'discipline-bridge', score: Math.round(j * 10000) });
    } else if (j >= cfg.termJaccardMin) {
      scored.push({ a, b, type: 'term-overlap', score: Math.round(j * 10000) });
    }
    const thinker = setOverlapScore(fa.authors, fb.authors);
    if (thinker > 0) scored.push({ a, b, type: 'shares-thinker', score: thinker });
    // shares-source は希少ホストのみで評価
    let sharedRare = 0;
    const rare = (h) => (hostDf.get(h) || 0) <= cfg.rareHostDf;
    const ra = [...fa.hosts].filter(rare);
    const rb = new Set([...fb.hosts].filter(rare));
    for (const h of ra) {
      if (rb.has(h)) sharedRare++;
    }
    const unionRare = new Set([...ra, ...rb]).size;
    if (sharedRare > 0) scored.push({ a, b, type: 'shares-source', score: Math.round((10000 * sharedRare) / Math.max(1, unionRare)) });
  }

  // --- 同一カテゴリ近傍（各ノード上位 sameCategoryTop を保証） --------------
  const byCategory = new Map();
  for (const e of list) {
    const k = `${e.collection}:${e.category}`;
    const arr = byCategory.get(k) || [];
    arr.push(e.id);
    byCategory.set(k, arr);
  }
  for (const ids of byCategory.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const neigh = [];
      for (const other of ids) {
        if (other === id) continue;
        const key = id < other ? `${id}|${other}` : `${other}|${id}`;
        let j = overlapByPair.get(key);
        if (j === undefined) {
          j = weightedJaccard(sig.get(id), sig.get(other));
          overlapByPair.set(key, j);
        }
        neigh.push([other, j]);
      }
      neigh.sort((x, y) => y[1] - x[1] || byIdAsc(x[0], y[0]));
      for (const [other, j] of neigh.slice(0, cfg.sameCategoryTop)) {
        scored.push({
          a: id < other ? id : other,
          b: id < other ? other : id,
          type: 'same-category',
          score: Math.max(1, Math.round(j * 10000)),
        });
      }
    }
  }

  // --- 重複（同ペア同型）排除 → ノード上位 keepPerNode 選抜 → 対称確定 ------
  const uniq = new Map(); // "a|b|type" → edge（スコアは最大値）
  for (const e of scored) {
    const k = `${e.a}|${e.b}|${e.type}`;
    const prev = uniq.get(k);
    if (!prev || e.score > prev.score) uniq.set(k, e);
  }
  const perNode = new Map(); // id → edge[]
  for (const e of uniq.values()) {
    for (const end of [e.a, e.b]) {
      const arr = perNode.get(end) || [];
      arr.push(e);
      perNode.set(end, arr);
    }
  }
  const edgeOrder = (x, y) =>
    TYPE_PRIORITY[x.type] - TYPE_PRIORITY[y.type] || y.score - x.score || byIdAsc(x.a, y.a) || byIdAsc(x.b, y.b);
  const kept = new Set(); // "a|b|type"
  for (const [, arr] of [...perNode.entries()].sort((x, y) => byIdAsc(x[0], y[0]))) {
    arr.sort(edgeOrder);
    for (const e of arr.slice(0, cfg.keepPerNode)) kept.add(`${e.a}|${e.b}|${e.type}`);
  }
  const edges = [...kept]
    .map((k) => uniq.get(k))
    .sort((x, y) => byIdAsc(x.a, y.a) || byIdAsc(x.b, y.b) || TYPE_PRIORITY[x.type] - TYPE_PRIORITY[y.type]);

  // --- ノード出力 ----------------------------------------------------------
  const degree = new Map();
  for (const e of edges) {
    degree.set(e.a, (degree.get(e.a) || 0) + 1);
    degree.set(e.b, (degree.get(e.b) || 0) + 1);
  }
  const nodes = list.map((e) => {
    const f = feat.get(e.id);
    return {
      id: e.id,
      collection: e.collection,
      category: e.category,
      categoryLabel: e.categoryLabel,
      title: e.title,
      year: f.year,
      authors: [...f.authors].sort(),
      degree: degree.get(e.id) || 0,
    };
  });

  const stats = {
    nodes: nodes.length,
    edges: edges.length,
    byType: Object.fromEntries(
      Object.keys(TYPE_PRIORITY).map((t) => [t, edges.filter((e) => e.type === t).length]),
    ),
    candidates: candidates.size,
  };
  return { nodes, edges, stats };
}

module.exports = {
  computeGraph,
  extractWeightedTerms,
  extractAuthorSurnames,
  hostOf,
  firstYear,
  DEFAULTS,
  TYPE_PRIORITY,
};
