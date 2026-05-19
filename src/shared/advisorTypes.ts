/**
 * Shared "AI 改善提案" advisor response shape.
 *
 * Used by snapshot-only business services (uber-eats / demae-can /
 * real-estate / mutual-funds) to return structured advice + a mandatory
 * legal disclaimer. **Investment-domain services (real-estate /
 * mutual-funds) MUST include "投資助言ではありません" in `disclaimer`** —
 * the test suite enforces this regex.
 *
 * Distinct from `stocks.AdvisorResponse` (which has a richer
 * `AdvisorRecommendation` shape with `symbol / rank / riskFactors` for
 * the ticker-level analyzer). The two co-exist intentionally; this
 * simpler shape is appropriate for service-level guidance.
 *
 * Lives in `src/shared/` so both the main fetcher modules and the
 * renderer's `ServiceActionPanel.tsx` can import the same type — main
 * and renderer can each import shared/* (but not each other), so this
 * is the only location that eliminates the previous 5-fold duplicate
 * definition.
 */
export interface ServiceAdvisorResponse {
  readonly recommendations: readonly { readonly title: string; readonly rationale: string }[];
  readonly disclaimer: string;
  /** Always true. Pinned in the type so a caller can't mistake this
   *  output for a real-money execution authorization. */
  readonly notForRealMoney: true;
  /** `'stub'` until Phase 6 connects a real LLM, then `'live'`. */
  readonly phase: 'stub' | 'live';
}
