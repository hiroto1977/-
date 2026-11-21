import { buildComplianceSnapshot, type ComplianceSnapshot } from '../../shared/complianceSnapshot';
import type { FetchContext } from './types';

/**
 * コンプライアンス — 法務/税務/労務の確証済み知識ベースの表示サービス (ローカル・認証不要)。
 *
 * 実データ (確証済み制度事実 + 出典) は renderer 側の `src/renderer/data/complianceKnowledge.ts`
 * に純データとして存在し、ページが `complianceResearch` で集計して描画する。
 * 本 fetcher はネットワーク I/O を行わず、台帳を指す標識だけを返す
 * (組み立ては `shared/complianceSnapshot.ts` の `buildComplianceSnapshot` ——
 * ブラウザ版の web-shim も同じ関数を呼ぶ)。資格情報も通信も使わないので
 * `LOCAL_SERVICES` に載り、`SERVICE_DATA_ORIGIN` は 'local'。
 */
export type { ComplianceSnapshot };

export async function fetchComplianceSnapshot(_ctx: FetchContext): Promise<ComplianceSnapshot> {
  return buildComplianceSnapshot();
}
