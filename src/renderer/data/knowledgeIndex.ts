/**
 * 確証済みナレッジ索引 — 全 5 コレクションを並列処理で正規化・検索する純ロジック核。
 *
 * 単一の真実源:
 *   - academicKnowledge.ts      VERIFIED_CONCEPTS
 *   - complianceKnowledge.ts    VERIFIED_COMPLIANCE
 *   - subsidyKnowledge.ts       VERIFIED_SUBSIDIES
 *   - counselorKnowledge.ts     VERIFIED_SUPPORT_RESOURCES
 *   - economicHistoryKnowledge.ts ECONOMIC_HISTORY
 *
 * コーパス構築はコレクション単位で `Promise.all` により並列化し、検索もチャンク分割 +
 * 並列スコアリングで大規模コーパス (1,400+ 件) を扱う。外部依存・IO なし。
 *
 * 利用側: assistantContext (Claude RAG) / chatbot (オフライン回答) / ChatbotWidget (Ollama 文脈)。
 */

import { VERIFIED_CONCEPTS } from './academicKnowledge';
import { VERIFIED_COMPLIANCE } from './complianceKnowledge';
import { VERIFIED_SUBSIDIES } from './subsidyKnowledge';
import { VERIFIED_SUPPORT_RESOURCES } from './counselorKnowledge';
import { ECONOMIC_HISTORY } from './economicHistoryKnowledge';

/** 検索対象の正規化済みドキュメント 1 件。 */
export interface KnowledgeDoc {
  readonly id: string;
  /** 分類ラベル (出典の種別表示用)。 */
  readonly kind: KnowledgeKind;
  readonly title: string;
  readonly body: string;
}

export type KnowledgeKind =
  | '学術概念'
  | 'コンプライアンス'
  | '補助金・助成金'
  | '相談窓口'
  | '経済史';

const BODY_CAP = 320;

function cap(text: string, n: number): string {
  return text.length > n ? text.slice(0, n) + '…' : text;
}

/** コレクション別アダプタ (並列ビルドの単位)。 */
interface CollectionAdapter {
  readonly key: string;
  readonly adapt: () => KnowledgeDoc[];
}

const COLLECTION_ADAPTERS: readonly CollectionAdapter[] = [
  {
    key: 'academic',
    adapt: () =>
      VERIFIED_CONCEPTS.map((c) => ({
        id: `academic:${c.id}`,
        kind: '学術概念' as const,
        title: c.title,
        body: cap(`${c.statement}（${c.keyFigures}）`, BODY_CAP),
      })),
  },
  {
    key: 'compliance',
    adapt: () =>
      VERIFIED_COMPLIANCE.map((c) => {
        const v = c.value;
        return {
          id: `compliance:${v.id}`,
          kind: 'コンプライアンス' as const,
          title: v.title,
          body: cap(`${v.statement}（所管: ${v.authority}／${v.asOf} 時点）`, BODY_CAP),
        };
      }),
  },
  {
    key: 'subsidy',
    adapt: () =>
      VERIFIED_SUBSIDIES.map((s) => ({
        id: `subsidy:${s.id}`,
        kind: '補助金・助成金' as const,
        title: s.name,
        body: cap(`${s.statement} 申請: ${s.application}（所管: ${s.authority}）`, BODY_CAP),
      })),
  },
  {
    key: 'support',
    adapt: () =>
      VERIFIED_SUPPORT_RESOURCES.map((r) => {
        const v = r.value;
        return {
          id: `support:${v.label}`,
          kind: '相談窓口' as const,
          title: v.label,
          body: cap(v.detail, BODY_CAP),
        };
      }),
  },
  {
    key: 'econ-history',
    adapt: () =>
      ECONOMIC_HISTORY.map((y) => ({
        id: `econ-history:${y.year}`,
        kind: '経済史' as const,
        title: `${y.year}年（${y.era}）`,
        body: cap(
          `【世界】${y.world}\n【日本】${y.japan}` +
            (y.keyEvents.length > 0 ? `\n主な出来事: ${y.keyEvents.slice(0, 3).join('／')}` : ''),
          BODY_CAP,
        ),
      })),
  },
];

/** 並列度 (検索チャンク数)。 */
export const PARALLEL_CHUNKS = 4;

/** 同期: 全コレクションを直列で写像 (モジュール初期化用)。 */
export function buildCorpus(): KnowledgeDoc[] {
  const docs: KnowledgeDoc[] = [];
  for (const col of COLLECTION_ADAPTERS) docs.push(...col.adapt());
  return docs;
}

/**
 * 非同期: コレクション単位で Promise.all により並列ビルド。
 * 各アダプタは microtask で実行され、イベントループ上で並列化される。
 */
export async function buildCorpusParallel(): Promise<KnowledgeDoc[]> {
  const chunks = await Promise.all(
    COLLECTION_ADAPTERS.map(
      (col) =>
        new Promise<KnowledgeDoc[]>((resolve) => {
          queueMicrotask(() => resolve(col.adapt()));
        }),
    ),
  );
  return chunks.flat();
}

/** モジュール読込時に 1 度だけ構築する既定コーパス。 */
export const KNOWLEDGE_CORPUS: readonly KnowledgeDoc[] = buildCorpus();

/** CJK 文字か (ひらがな・カタカナ・漢字)。 */
function isCjk(ch: string): boolean {
  return /[぀-ヿ㐀-鿿豈-﫿]/.test(ch);
}

/**
 * クエリから検索語を抽出する。
 *   - 英数字の語 (長さ 2 以上) はそのまま 1 語
 *   - 連続する CJK 文字列からは 2 文字シングル (バイグラム) を生成
 */
export function extractTerms(query: string): string[] {
  const norm = query.normalize('NFKC').toLowerCase();
  const terms = new Set<string>();
  for (const m of norm.matchAll(/[a-z0-9][a-z0-9.+_-]{1,}/g)) terms.add(m[0]);
  let run = '';
  const flush = () => {
    if (run.length === 1) terms.add(run);
    else {
      for (let i = 0; i < run.length - 1; i++) terms.add(run.slice(i, i + 2));
    }
    run = '';
  };
  for (const ch of norm) {
    if (isCjk(ch)) run += ch;
    else flush();
  }
  flush();
  return [...terms];
}

/** 文字列中に needle が現れる回数 (重なりは数えない)。 */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    count++;
    from = idx + needle.length;
  }
  return count;
}

export interface ScoredDoc {
  readonly doc: KnowledgeDoc;
  readonly score: number;
}

/** ドキュメント 1 件のスコアを計算 (terms が空なら 0)。 */
export function scoreDoc(doc: KnowledgeDoc, terms: readonly string[]): number {
  if (terms.length === 0) return 0;
  const title = doc.title.normalize('NFKC').toLowerCase();
  const body = doc.body.normalize('NFKC').toLowerCase();
  let score = 0;
  for (const t of terms) {
    score += countOccurrences(title, t) * 3 + countOccurrences(body, t);
  }
  return score;
}

/** コーパスをチャンク分割 (並列検索用)。 */
export function chunkCorpus(
  corpus: readonly KnowledgeDoc[],
  chunks = PARALLEL_CHUNKS,
): readonly (readonly KnowledgeDoc[])[] {
  if (corpus.length === 0) return [];
  const size = Math.max(1, Math.ceil(corpus.length / chunks));
  const out: KnowledgeDoc[][] = [];
  for (let i = 0; i < corpus.length; i += size) out.push(corpus.slice(i, i + size));
  return out;
}

/** チャンクをスコアリング (同期)。 */
function scoreChunk(chunk: readonly KnowledgeDoc[], terms: readonly string[]): ScoredDoc[] {
  const scored: ScoredDoc[] = [];
  for (const doc of chunk) {
    const score = scoreDoc(doc, terms);
    if (score > 0) scored.push({ doc, score });
  }
  return scored;
}

/** スコア付き結果をマージして上位 k 件返す (安定ソート)。 */
export function topKScored(all: readonly ScoredDoc[], k: number): ScoredDoc[] {
  const sorted = [...all].sort((a, b) => b.score - a.score);
  return sorted.slice(0, k);
}

/**
 * クエリに関連するドキュメントを上位 k 件返す (同期)。
 * スコア = Σ 語ごとの (タイトル一致 × 3 + 本文一致)。一致ゼロは除外。
 */
export function retrieveScored(
  query: string,
  k = 6,
  corpus: readonly KnowledgeDoc[] = KNOWLEDGE_CORPUS,
): ScoredDoc[] {
  const terms = extractTerms(query);
  if (terms.length === 0) return [];
  const scored = scoreChunk(corpus, terms);
  return topKScored(scored, k);
}

export function retrieve(
  query: string,
  k = 6,
  corpus: readonly KnowledgeDoc[] = KNOWLEDGE_CORPUS,
): KnowledgeDoc[] {
  return retrieveScored(query, k, corpus).map((s) => s.doc);
}

/**
 * コーパスをチャンク並列でスコアリングし上位 k 件返す。
 * 大規模コーパス (1,400+ 件) でも UI をブロックしにくい。
 */
export async function retrieveParallel(
  query: string,
  k = 6,
  corpus: readonly KnowledgeDoc[] = KNOWLEDGE_CORPUS,
  chunks = PARALLEL_CHUNKS,
): Promise<ScoredDoc[]> {
  const terms = extractTerms(query);
  if (terms.length === 0) return [];
  const parts = chunkCorpus(corpus, chunks);
  const scoredChunks = await Promise.all(
    parts.map(
      (part) =>
        new Promise<ScoredDoc[]>((resolve) => {
          queueMicrotask(() => resolve(scoreChunk(part, terms)));
        }),
    ),
  );
  return topKScored(scoredChunks.flat(), k);
}

/** ナレッジ検索の最小スコア (これ未満は「該当なし」扱い)。 */
export const KNOWLEDGE_MIN_SCORE = 3;

/** ナレッジ質問を示すマーカー (辞書は表現データ)。 */
// Stryker disable all
export const KNOWLEDGE_QUERY_MARKERS: readonly string[] = [
  '教えて',
  'とは',
  'について',
  '意味',
  '制度',
  '補助金',
  '助成金',
  '税法',
  '労働法',
  '経済史',
  'いつ',
  '何年',
  'どういう',
  'explain',
  'what is',
];
// Stryker restore all

/** ナレッジ質問らしい入力か (マーカーまたは検索スコアで判定)。 */
export function looksLikeKnowledgeQuery(
  query: string,
  topScore: number,
  minScore = KNOWLEDGE_MIN_SCORE,
): boolean {
  if (topScore < minScore) return false;
  const norm = query.normalize('NFKC').toLowerCase();
  for (const m of KNOWLEDGE_QUERY_MARKERS) {
    if (norm.includes(m)) return true;
  }
  // スコアが十分高ければマーカーなしでもナレッジ回答する (例: 「インボイス」)。
  return topScore >= minScore * 2;
}

/** 参考ナレッジ節 (Claude system プロンプト用)。 */
export function formatKnowledgeSection(docs: readonly KnowledgeDoc[]): string {
  if (docs.length === 0) return '';
  const lines = docs.map((d) => `- [${d.kind}] ${d.title}: ${d.body}`);
  return ['', '## 参考ナレッジ（確証済み・出典あり）', ...lines].join('\n');
}

/** チャット UI 向け: 検索結果をユーザー可読な本文へ整形。 */
export function formatKnowledgeAnswer(docs: readonly KnowledgeDoc[], hitCount?: number): string {
  if (docs.length === 0) return '';
  const total = hitCount ?? docs.length;
  const lines: string[] = [
    `📚 確証済みナレッジから ${total} 件見つけました:`,
    '',
  ];
  for (const d of docs) {
    lines.push(`**[${d.kind}] ${d.title}**`);
    lines.push(d.body);
    lines.push('');
  }
  lines.push(
    '※ 一般的な情報であり、税務・法務・労務・投資の専門助言ではありません。' +
      '最新の制度・個別判断は専門家と一次情報でご確認ください。',
  );
  return lines.join('\n');
}

/** コーパスの統計 (UI 表示・テスト用)。 */
export function corpusStats(corpus: readonly KnowledgeDoc[] = KNOWLEDGE_CORPUS): {
  total: number;
  byKind: Record<KnowledgeKind, number>;
} {
  const byKind: Record<KnowledgeKind, number> = {
    学術概念: 0,
    コンプライアンス: 0,
    '補助金・助成金': 0,
    相談窓口: 0,
    経済史: 0,
  };
  for (const d of corpus) byKind[d.kind]++;
  return { total: corpus.length, byKind };
}
