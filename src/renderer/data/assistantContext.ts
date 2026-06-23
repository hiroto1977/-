/**
 * Assistant RAG 文脈ビルダー — 純ロジック・IO なし。
 *
 * 確証済みナレッジ (全 5 コレクション) とサービスカタログを横断検索し、
 * Claude へ渡す system プロンプトを組み立てる。**単一の真実源**は
 * `knowledgeIndex.ts` (並列索引) から導出する。
 */

import {
  KNOWLEDGE_CORPUS,
  buildCorpus,
  buildCorpusParallel,
  extractTerms,
  retrieve,
  retrieveParallel,
  retrieveScored,
  formatKnowledgeSection,
  type KnowledgeDoc,
  type KnowledgeKind,
  type ScoredDoc,
} from './knowledgeIndex';

export type { KnowledgeDoc, KnowledgeKind, ScoredDoc };
export {
  KNOWLEDGE_CORPUS,
  buildCorpus,
  buildCorpusParallel,
  extractTerms,
  retrieve,
  retrieveParallel,
  retrieveScored,
  formatKnowledgeSection,
};

/** チャットが案内できるサービス 1 件。 */
export interface AssistantService {
  readonly id: string;
  readonly label: string;
  readonly description: string;
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
      for (const t of terms) {
        let from = 0;
        const countIn = (hay: string) => {
          let c = 0;
          for (;;) {
            const idx = hay.indexOf(t, from);
            if (idx === -1) break;
            c++;
            from = idx + t.length;
          }
          return c;
        };
        score += countIn(label) * 3 + countIn(desc);
      }
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
 * 最終的な system プロンプトを組み立てる (同期検索)。
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

/**
 * 並列検索版 system プロンプト (大規模コーパス向け)。
 */
export async function buildSystemPromptParallel(
  query: string,
  services: readonly AssistantService[],
): Promise<string> {
  const scored = await retrieveParallel(query);
  const docs = scored.map((s) => s.doc);
  const relServices = retrieveServices(query, services);
  return [
    ASSISTANT_BASE_INSTRUCTIONS,
    formatKnowledgeSection(docs),
    formatServiceSection(relServices),
  ]
    .filter((s) => s.length > 0)
    .join('\n');
}
