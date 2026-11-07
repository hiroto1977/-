/**
 * 法務・税務・労務の確証リサーチ・ループ — 純ロジック・決定論的。
 *
 * 確証済み知識ベース（{@link ./complianceKnowledge}）の各エントリを、出典規律
 * （{@link ./sourceVerification}：独立2出典以上・うち公的1件以上）で検証し、
 * **確証分のみ採用・未確証は破棄**して集計する。分野（税務／労務／法務）ごとの確証件数と、
 * 確証ゼロの分野（=改善候補 findings）を返す。
 *
 * 「永続的に精度を高め続ける」= 同じ規律で再実行し、確証付きエントリを PR で増やすほど
 * 網羅・精度が上がる観測可能なループ（counselingResearch / crisisDeliberation と同じ思想）。
 * 規律・既定値の変更は人の PR レビューを通す。LLM 呼び出しはしない。
 */

import {
  isConfirmed,
  type SourcedClaim,
  type VerificationPolicy,
  DEFAULT_POLICY,
} from './sourceVerification';
import {
  COMPLIANCE_DOMAINS,
  type ComplianceDomain,
  type ComplianceFact,
} from './complianceKnowledge';

/** 分野ごとの確証件数。 */
export interface DomainCoverage {
  readonly domain: ComplianceDomain;
  readonly confirmed: number;
}

/** リサーチ集計レポート。 */
export interface ComplianceResearchReport {
  readonly total: number;
  /** 確証できた件数（採用）。 */
  readonly confirmed: number;
  /** 確証できず破棄した件数。 */
  readonly discarded: number;
  /** 分野ごとの確証件数（COMPLIANCE_DOMAINS の順）。 */
  readonly byDomain: readonly DomainCoverage[];
  /** 確証ゼロの分野（改善候補）。 */
  readonly findings: readonly ComplianceDomain[];
  /** 採用された事実（確証済み・入力順）。 */
  readonly confirmedFacts: readonly ComplianceFact[];
}

/**
 * 知識ベースを確証規律で検証し集計する（純粋・決定論的）。
 * @param claims 出典つき制度事実
 * @param policy 確証方針（既定: 独立2出典以上・公的1件以上）
 */
export function runComplianceResearch(
  claims: readonly SourcedClaim<ComplianceFact>[],
  policy: VerificationPolicy = DEFAULT_POLICY,
): ComplianceResearchReport {
  const confirmedFacts: ComplianceFact[] = [];
  for (const claim of claims) {
    if (isConfirmed(claim, policy)) confirmedFacts.push(claim.value);
  }

  const byDomain: DomainCoverage[] = COMPLIANCE_DOMAINS.map((domain) => ({
    domain,
    confirmed: confirmedFacts.filter((f) => f.domain === domain).length,
  }));

  const findings = byDomain.filter((d) => d.confirmed === 0).map((d) => d.domain);

  return {
    total: claims.length,
    confirmed: confirmedFacts.length,
    discarded: claims.length - confirmedFacts.length,
    byDomain,
    findings,
    confirmedFacts,
  };
}
