/**
 * Assistant RAG 文脈ビルダー — 純ロジック・IO なし。
 *
 * 確証済みナレッジ (全 5 コレクション) とサービスカタログを横断検索し、
 * Claude へ渡す system プロンプトを組み立てる。コーパス本体は
 * `knowledgeCorpus.ts` が単一の真実源。
 */

import {
  buildCorpus,
  buildCorpusParallel,
  KNOWLEDGE_CORPUS,
  corpusStats,
  extractTerms,
  retrieve,
  retrieveScored,
  retrieveServices,
  formatKnowledgeSection,
  formatServiceSection,
  type KnowledgeDoc,
  type KnowledgeKind,
  type AssistantService,
  type ScoredDoc,
  type CorpusStats,
} from './knowledgeCorpus';

export {
  buildCorpus,
  buildCorpusParallel,
  KNOWLEDGE_CORPUS,
  corpusStats,
  extractTerms,
  retrieve,
  retrieveScored,
  retrieveServices,
  formatKnowledgeSection,
  formatServiceSection,
  type KnowledgeDoc,
  type KnowledgeKind,
  type AssistantService,
  type ScoredDoc,
  type CorpusStats,
};

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
