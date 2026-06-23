/**
 * 確証済みナレッジコーパス — 全 5 コレクションの単一の真実源 (renderer 向け)。
 *
 * 学術概念 / コンプライアンス / 補助金 / 相談窓口 / 経済史 を共通スキーマへ正規化し、
 * RAG 検索・チャットボット・Assistant ページが同じコーパスを参照する。
 * Node 側の `orchestration/knowledge-context.cjs` と同じ 5 コレクションをカバーする。
 *
 * `buildCorpusParallel()` はコレクション単位 + 大規模コレクション内チャンクの
 * 二段並列でナレッジ化する (Promise.all)。同期版 `buildCorpus()` はモジュール初期化用。
 */

import { VERIFIED_CONCEPTS } from './academicKnowledge';
import { VERIFIED_COMPLIANCE } from './complianceKnowledge';
import { VERIFIED_SUBSIDIES } from './subsidyKnowledge';
import { VERIFIED_SUPPORT_RESOURCES } from './counselorKnowledge';
import { ECONOMIC_HISTORY } from './economicHistoryKnowledge';

/** ナレッジの分類ラベル (5 コレクション)。 */
export type KnowledgeKind =
  | '学術概念'
  | 'コンプライアンス'
  | '補助金・助成金'
  | '相談窓口'
  | '経済史';

/** 検索対象の正規化済みドキュメント 1 件。 */
export interface KnowledgeDoc {
  readonly id: string;
  readonly kind: KnowledgeKind;
  readonly title: string;
  readonly body: string;
  /** サブカテゴリ (discipline / domain / decade 等)。 */
  readonly category: string;
}

/** チャットが案内できるサービス 1 件。 */
export interface AssistantService {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

export interface ScoredDoc {
  readonly doc: KnowledgeDoc;
  readonly score: number;
}

export interface CorpusStats {
  readonly total: number;
  readonly byKind: Readonly<Record<KnowledgeKind, number>>;
}

const BODY_CAP = 320;
/** 大規模コレクション内の並列チャンクサイズ。 */
const CHUNK_SIZE = 200;

function cap(text: string, n: number): string {
  return text.length > n ? text.slice(0, n) + '…' : text;
}

function adaptAcademicEntry(c: (typeof VERIFIED_CONCEPTS)[number]): KnowledgeDoc {
  return {
    id: `academic:${c.id}`,
    kind: '学術概念',
    title: c.title,
    category: c.discipline,
    body: cap(`${c.statement}（${c.keyFigures}）`, BODY_CAP),
  };
}

function adaptComplianceEntry(claim: (typeof VERIFIED_COMPLIANCE)[number]): KnowledgeDoc {
  const v = claim.value;
  return {
    id: `compliance:${v.id}`,
    kind: 'コンプライアンス',
    title: v.title,
    category: v.domain,
    body: cap(`${v.statement}（所管: ${v.authority}／${v.asOf} 時点）`, BODY_CAP),
  };
}

function adaptSubsidyEntry(s: (typeof VERIFIED_SUBSIDIES)[number]): KnowledgeDoc {
  return {
    id: `subsidy:${s.id}`,
    kind: '補助金・助成金',
    title: s.name,
    category: s.domain,
    body: cap(`${s.statement} 申請: ${s.application}（所管: ${s.authority}）`, BODY_CAP),
  };
}

function adaptSupportEntry(claim: (typeof VERIFIED_SUPPORT_RESOURCES)[number]): KnowledgeDoc {
  const v = claim.value;
  return {
    id: `support:${v.label}`,
    kind: '相談窓口',
    title: v.label,
    category: 'resource',
    body: cap(v.detail, BODY_CAP),
  };
}

function decade(year: number): string {
  return `${Math.floor(year / 10) * 10}年代`;
}

function adaptEconHistoryEntry(y: (typeof ECONOMIC_HISTORY)[number]): KnowledgeDoc {
  return {
    id: `econ:${y.year}`,
    kind: '経済史',
    title: `${y.year}年（${y.era}）`,
    category: decade(y.year),
    body: cap(`【世界】${y.world}\n\n【日本】${y.japan}`, BODY_CAP),
  };
}

/** 配列をチャンクに分割して Promise.all で並列マップ (マイクロタスク並列)。 */
async function mapParallelChunks<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => R,
): Promise<R[]> {
  if (items.length === 0) return [];
  const chunks: { start: number; slice: readonly T[] }[] = [];
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    chunks.push({ start: i, slice: items.slice(i, i + CHUNK_SIZE) });
  }
  const chunkResults = await Promise.all(
    chunks.map(({ start, slice }) =>
      Promise.resolve(slice.map((item, j) => fn(item, start + j))),
    ),
  );
  return chunkResults.flat();
}

function adaptAcademicSync(): KnowledgeDoc[] {
  return VERIFIED_CONCEPTS.map(adaptAcademicEntry);
}

function adaptComplianceSync(): KnowledgeDoc[] {
  return VERIFIED_COMPLIANCE.map(adaptComplianceEntry);
}

function adaptSubsidySync(): KnowledgeDoc[] {
  return VERIFIED_SUBSIDIES.map(adaptSubsidyEntry);
}

function adaptSupportSync(): KnowledgeDoc[] {
  return VERIFIED_SUPPORT_RESOURCES.map(adaptSupportEntry);
}

function adaptEconHistorySync(): KnowledgeDoc[] {
  return ECONOMIC_HISTORY.map(adaptEconHistoryEntry);
}

/** 全コレクションを同期で正規化 (モジュール初期化用)。 */
export function buildCorpus(): KnowledgeDoc[] {
  return [
    ...adaptAcademicSync(),
    ...adaptComplianceSync(),
    ...adaptSubsidySync(),
    ...adaptSupportSync(),
    ...adaptEconHistorySync(),
  ];
}

/**
 * 全コレクションを並列でナレッジ化する。
 * 5 コレクションを Promise.all で同時処理し、大規模コレクションはチャンク並列。
 */
export async function buildCorpusParallel(): Promise<KnowledgeDoc[]> {
  const [academic, compliance, subsidy, support, econ] = await Promise.all([
    mapParallelChunks(VERIFIED_CONCEPTS, adaptAcademicEntry),
    mapParallelChunks(VERIFIED_COMPLIANCE, adaptComplianceEntry),
    mapParallelChunks(VERIFIED_SUBSIDIES, adaptSubsidyEntry),
    mapParallelChunks(VERIFIED_SUPPORT_RESOURCES, adaptSupportEntry),
    mapParallelChunks(ECONOMIC_HISTORY, adaptEconHistoryEntry),
  ]);
  return [...academic, ...compliance, ...subsidy, ...support, ...econ];
}

/** モジュール読込時に 1 度だけ構築する既定コーパス。 */
export const KNOWLEDGE_CORPUS: readonly KnowledgeDoc[] = buildCorpus();

/** コーパスの件数・種別内訳。 */
export function corpusStats(corpus: readonly KnowledgeDoc[] = KNOWLEDGE_CORPUS): CorpusStats {
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
    if (run.length === 1) {
      terms.add(run);
    } else {
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

/**
 * クエリに関連するドキュメントをスコア付きで返す (降順)。
 * スコア = Σ 語ごとの (タイトル一致 × 3 + 本文一致 + カテゴリ一致 × 2)。
 */
export function retrieveScored(
  query: string,
  k = 6,
  corpus: readonly KnowledgeDoc[] = KNOWLEDGE_CORPUS,
): ScoredDoc[] {
  const terms = extractTerms(query);
  if (terms.length === 0) return [];
  const scored: ScoredDoc[] = [];
  for (const doc of corpus) {
    const title = doc.title.normalize('NFKC').toLowerCase();
    const body = doc.body.normalize('NFKC').toLowerCase();
    const category = doc.category.normalize('NFKC').toLowerCase();
    let score = 0;
    for (const t of terms) {
      score += countOccurrences(title, t) * 3 + countOccurrences(body, t) + countOccurrences(category, t) * 2;
    }
    if (score > 0) scored.push({ doc, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

/** 上位 k 件のドキュメントのみ返す (Assistant / チャット共通)。 */
export function retrieve(
  query: string,
  k = 6,
  corpus: readonly KnowledgeDoc[] = KNOWLEDGE_CORPUS,
): KnowledgeDoc[] {
  return retrieveScored(query, k, corpus).map((s) => s.doc);
}

/** クエリに関連するサービスを上位 k 件返す (label/description を検索)。 */
export function retrieveServices(
  query: string,
  services: readonly AssistantService[],
  k = 4,
): AssistantService[] {
  const terms = extractTerms(query);
  if (terms.length === 0) return [];
  const scored = services
    .map((svc) => {
      const label = svc.label.normalize('NFKC').toLowerCase();
      const desc = svc.description.normalize('NFKC').toLowerCase();
      let score = 0;
      for (const t of terms) score += countOccurrences(label, t) * 3 + countOccurrences(desc, t);
      return { svc, score };
    })
    .filter((s) => s.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.svc);
}

/** 参考ナレッジ節を組み立てる (なければ空文字)。 */
export function formatKnowledgeSection(docs: readonly KnowledgeDoc[]): string {
  if (docs.length === 0) return '';
  const lines = docs.map((d) => `- [${d.kind}] ${d.title}: ${d.body}`);
  return ['', '## 参考ナレッジ（確証済み・出典あり）', ...lines].join('\n');
}

/** サービスカタログ節を組み立てる。 */
export function formatServiceSection(services: readonly AssistantService[]): string {
  if (services.length === 0) return '';
  const lines = services.map((s) => `- ${s.label}（id: ${s.id}）: ${s.description}`);
  return [
    '',
    '## 関連サービス（このアプリ内で開ける機能）',
    'ユーザーの目的に合うものがあれば、回答末尾で「『◯◯』を開くと…ができます」と案内する。',
    ...lines,
  ].join('\n');
}
