/**
 * ナレッジ活用チャット — 確証済みコーパスからの決定論的回答 (純ロジック・IO なし)。
 *
 * `knowledgeCorpus` で並列ナレッジ化した全コレクションを RAG 検索し、
 * チャットボットがオフラインでも根拠付きで応答できるようにする。
 */

import { retrieveScored, type KnowledgeDoc } from './knowledgeCorpus';
import { routeLabel, routeTopicScored, type OrgIndex } from './chatOrg';

/** ナレッジ回答と判定する最低スコア (1 語以上の有意な一致)。 */
export const MIN_KNOWLEDGE_SCORE = 2;

/** 確証済みナレッジからユーザー向け回答文を組み立てる。 */
export function formatKnowledgeAnswer(docs: readonly KnowledgeDoc[]): string {
  if (docs.length === 0) return '';
  const lines = [
    '📚 確証済みナレッジからお答えします:',
    '',
    ...docs.map((d, i) => `**${i + 1}. [${d.kind}] ${d.title}**\n${d.body}`),
    '',
    '※ 税務・法務・労務・投資の最終判断は専門家・一次情報の確認を促します。概算・参考情報としてご利用ください。',
  ];
  return lines.join('\n');
}

/** ナレッジ回答の担当ルート (種別・クエリから組織索引を引く)。 */
export function knowledgeRouteLabel(org: OrgIndex, query: string, topDoc?: KnowledgeDoc): string {
  const topic =
    topDoc?.kind === 'コンプライアンス'
      ? '税務'
      : topDoc?.kind === '補助金・助成金'
        ? '補助金'
        : topDoc?.kind === '経済史'
          ? '経済'
          : (topDoc?.title ?? query);
  return routeLabel(routeTopicScored(org, topic).route);
}

export interface KnowledgeMatch {
  readonly docs: readonly KnowledgeDoc[];
  readonly topScore: number;
}

/** クエリがナレッジコーパスにマッチするか判定し、上位ドキュメントを返す。 */
export function matchKnowledge(query: string, k = 3): KnowledgeMatch | null {
  const scored = retrieveScored(query, k);
  if (scored.length === 0 || scored[0]!.score < MIN_KNOWLEDGE_SCORE) return null;
  return { docs: scored.map((s) => s.doc), topScore: scored[0]!.score };
}
