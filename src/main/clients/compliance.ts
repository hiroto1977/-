import type { FetchContext } from './types';

/**
 * コンプライアンス — 法務/税務/労務の確証済み知識ベースの表示サービス (ローカル・認証不要)。
 *
 * 実データ (確証済み制度事実 + 出典) は renderer 側の `src/renderer/data/complianceKnowledge.ts`
 * に純データとして存在し、ページが `complianceResearch` で集計して描画する。本 fetcher は
 * ローカル・スナップショット専用のスタブで、ネットワーク I/O を行わない (storage と同方針)。
 */

export interface ComplianceSnapshot {
  /** スタブ標識 (実データは renderer の complianceKnowledge を参照)。 */
  readonly note: string;
}

// Stryker disable next-line all
const STUB: ComplianceSnapshot = { note: 'verified-compliance' };

export async function fetchComplianceSnapshot(_ctx: FetchContext): Promise<ComplianceSnapshot> {
  return STUB;
}
