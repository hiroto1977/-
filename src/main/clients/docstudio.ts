import type { ActionContext, ActionMap, FetchContext } from './types';

/**
 * 書類スタジオ — ローカル完結サービス。テンプレートと描画はすべて
 * renderer 側 (data/docStudioData.ts + DocstudioPage) にあり、
 * ネットワークも保存済みクレデンシャルも使わない。
 * このクライアントは LIVE_FETCHERS の全域性 invariant を満たすための
 * 固定 snapshot と、コレクション一覧アクションを提供する。
 */

export interface DocstudioSnapshot {
  readonly collections: readonly { id: string; label: string; docCount: number }[];
  readonly fetchedAt: string;
  readonly isMock: boolean;
}

// Stryker disable next-line StringLiteral
const FETCHED_AT = '2035-05-15T00:00:00.000Z';

const COLLECTIONS: DocstudioSnapshot['collections'] = [
  { id: 'studio', label: '経営書類（契約・経理・組織・規程・事業計画）', docCount: 14 },
  { id: 'teikan', label: '電子定款（株式会社・合同会社）', docCount: 2 },
  { id: 'shugyo', label: '就業規則（10章47条）', docCount: 1 },
];

export async function fetchDocstudioSnapshot(_ctx: FetchContext): Promise<DocstudioSnapshot> {
  return { collections: COLLECTIONS, fetchedAt: FETCHED_AT, isMock: true };
}

async function listCollections(_ctx: ActionContext): Promise<DocstudioSnapshot['collections']> {
  return COLLECTIONS;
}

export const ACTIONS: ActionMap = {
  'list-collections': listCollections,
};
