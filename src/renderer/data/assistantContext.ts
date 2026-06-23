/**
 * Assistant RAG 文脈ビルダー — 純ロジック・IO なし。
 *
 * 確証済みナレッジ (学術概念 / 税務労務法務コンプライアンス / 補助金 / 相談窓口 /
 * 経済史) とサービスカタログを横断検索し、ユーザーの問いに関連する根拠資料を抽出して
 * Claude へ渡す system プロンプトを組み立てる。**単一の真実源**から導出するため、
 * ナレッジやサービスが増えれば自動で文脈に反映される。
 *
 * 検索は外部依存ゼロの軽量スコアリング (語トークン + CJK バイグラム一致) を
 * 転置インデックス (`knowledgeIndex.ts`) 経由で行う。形態素解析器を持たない代わりに、
 * 2 文字シングルで日本語にも素直に当たる。約 2,000 件のコーパスでも索引により高速。
 */

import { VERIFIED_CONCEPTS } from './academicKnowledge';
import { VERIFIED_COMPLIANCE } from './complianceKnowledge';
import { VERIFIED_SUBSIDIES } from './subsidyKnowledge';
import { VERIFIED_SUPPORT_RESOURCES } from './counselorKnowledge';
import { ECONOMIC_HISTORY } from './economicHistoryKnowledge';
import {
  buildInvertedIndex,
  indexedRetrieve,
  retrieveScored,
  type InvertedIndex,
  type KnowledgeDoc,
} from './knowledgeIndex';

// 後方互換: 索引エンジンの共通型を従来どおり本モジュールからも公開する。
export type { KnowledgeDoc };

/** チャットが案内できるサービス 1 件。 */
export interface AssistantService {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

const BODY_CAP = 320; // 1 ドキュメントあたりの本文上限 (プロンプト肥大を防ぐ)

function cap(text: string, n: number): string {
  return text.length > n ? text.slice(0, n) + '…' : text;
}

/** すべての確証済みデータを共通スキーマへ写像する (モジュール読込時に 1 度)。 */
export function buildCorpus(): KnowledgeDoc[] {
  const docs: KnowledgeDoc[] = [];
  for (const c of VERIFIED_CONCEPTS) {
    docs.push({
      id: `academic:${c.id}`,
      kind: '学術概念',
      title: c.title,
      body: cap(`${c.statement}（${c.keyFigures}）`, BODY_CAP),
    });
  }
  for (const c of VERIFIED_COMPLIANCE) {
    const v = c.value;
    docs.push({
      id: `compliance:${v.id}`,
      kind: 'コンプライアンス',
      title: v.title,
      body: cap(`${v.statement}（所管: ${v.authority}／${v.asOf} 時点）`, BODY_CAP),
    });
  }
  for (const s of VERIFIED_SUBSIDIES) {
    docs.push({
      id: `subsidy:${s.id}`,
      kind: '補助金・助成金',
      title: s.name,
      body: cap(`${s.statement} 申請: ${s.application}（所管: ${s.authority}）`, BODY_CAP),
    });
  }
  for (const r of VERIFIED_SUPPORT_RESOURCES) {
    const v = r.value;
    docs.push({
      id: `support:${v.label}`,
      kind: '相談窓口',
      title: v.label,
      body: cap(v.detail, BODY_CAP),
    });
  }
  for (const y of ECONOMIC_HISTORY) {
    const events = y.keyEvents.join('／');
    docs.push({
      id: `econ:${y.year}`,
      kind: '経済史',
      title: `${y.year}年（${y.era}）`,
      body: cap(`【世界】${y.world} 【日本】${y.japan} 主な出来事: ${events}`, BODY_CAP),
    });
  }
  return docs;
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
 * 返すのは小文字化済みのユニーク語。
 */
export function extractTerms(query: string): string[] {
  const norm = query.normalize('NFKC').toLowerCase();
  const terms = new Set<string>();
  // 英数語
  for (const m of norm.matchAll(/[a-z0-9][a-z0-9.+_-]{1,}/g)) terms.add(m[0]);
  // CJK バイグラム
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

export interface ScoredDoc {
  readonly doc: KnowledgeDoc;
  readonly score: number;
}

/**
 * 既定コーパスの転置インデックス (初回利用時に 1 度だけ構築)。
 * 約 2,000 件のコーパスをクエリ毎に線形走査せず、語に該当する postings だけを辿る。
 */
let DEFAULT_INDEX: InvertedIndex | null = null;
export function knowledgeIndex(): InvertedIndex {
  if (DEFAULT_INDEX === null) DEFAULT_INDEX = buildInvertedIndex(KNOWLEDGE_CORPUS);
  return DEFAULT_INDEX;
}

/**
 * クエリに関連するドキュメントを上位 k 件返す。
 * スコア = Σ 語ごとの (タイトル一致 × 3 + 本文一致)。一致ゼロは除外。決定論的。
 *
 * 既定コーパスに対しては構築済みの転置インデックスを使う (高速)。テスト等で
 * 任意の `corpus` を渡した場合はその場で索引を組み立てる (挙動は同一)。
 */
export function retrieve(
  query: string,
  k = 6,
  corpus: readonly KnowledgeDoc[] = KNOWLEDGE_CORPUS,
): KnowledgeDoc[] {
  const index = corpus === KNOWLEDGE_CORPUS ? knowledgeIndex() : buildInvertedIndex(corpus);
  return indexedRetrieve(query, k, index);
}

/** チャットボット等が確証済みナレッジを引くための最低スコア (雑音抑制)。 */
export const MIN_KNOWLEDGE_SCORE = 6;

/**
 * クエリに「十分に関連する」確証済みナレッジだけを返す (転置インデックス経由)。
 * 挨拶や雑談のような弱い一致 ({@link MIN_KNOWLEDGE_SCORE} 未満) は除外し、
 * オフラインのルールエンジンが誤って雑学を返さないようにする。
 */
export function knowledgeLookup(query: string, k = 3): KnowledgeDoc[] {
  return retrieveScored(query, k, knowledgeIndex())
    .filter((s) => s.score >= MIN_KNOWLEDGE_SCORE)
    .map((s) => s.doc);
}

/**
 * オフライン (LLM 無し) で確証済みナレッジを根拠に答える本文を組み立てる。
 * 該当が無ければ null (呼び出し側は別のフォールバックへ)。
 */
export function formatKnowledgeReply(query: string, k = 3): string | null {
  const docs = knowledgeLookup(query, k);
  if (docs.length === 0) return null;
  const lines = docs.map((d) => `- [${d.kind}] ${d.title}: ${d.body}`);
  return [
    '📚 確証済みナレッジ（出典あり）から要点をまとめます。',
    ...lines,
    '※ 出典つきデータの要約です。最終判断は一次情報・専門家にご確認ください。',
  ].join('\n');
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

/** Claude が遵守すべき基本方針 (RAG 文脈の前段)。 */
export const ASSISTANT_BASE_INSTRUCTIONS = [
  'あなたは「Service Hub」の日本語ビジネスアシスタントです。経営者・個人事業主を支援します。',
  '回答方針:',
  '- 簡潔で実用的に。結論を先に述べ、必要に応じて根拠・手順を補足する。',
  '- 比較・一覧・スケジュール・収支など構造化できる情報は Markdown の表で示す。',
  '- 手順やチェックリストは箇条書きで示す。',
  '- 下記「参考ナレッジ」に該当があれば、それを根拠に答える。該当がなければ一般知識で答え、その旨を明示する。',
  '- 税務・法務・労務・投資の最終判断は専門家・一次情報の確認を促す。断定を避け、時点（asOf）に注意する。',
  '- 不確実なことを推測で断定しない。分からないことは「分からない」と述べる。',
].join('\n');

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

/**
 * 最終的な system プロンプトを組み立てる。
 * @param query    直近のユーザー発話 (検索クエリ)
 * @param services サービスカタログ全件 (関連抽出に使う)
 */
export function buildSystemPrompt(query: string, services: readonly AssistantService[]): string {
  const docs = retrieve(query);
  const relServices = retrieveServices(query, services);
  return [
    ASSISTANT_BASE_INSTRUCTIONS,
    formatKnowledgeSection(docs),
    formatServiceSection(relServices),
  ]
    .filter((s) => s.length > 0)
    .join('\n');
}
