/**
 * Shared "改善提案" advisor response shape.
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
 *
 * 2026-09-09 (パス 119): 提案は `shared/serviceAdvisor.ts` が**画面の数字から規則で**組む。
 * `phase: 'rules'` と `basis` (何件・どの数字から組んだか) を足した —— 「AI」でも
 * 固定文でもないことを、答えの形が言う。
 */
export interface ServiceAdvisorResponse {
  readonly recommendations: readonly { readonly title: string; readonly rationale: string }[];
  readonly disclaimer: string;
  /** Always true. Pinned in the type so a caller can't mistake this
   *  output for a real-money execution authorization. */
  readonly notForRealMoney: true;
  /**
   * 提案の元になった数字 (何件・どの集計から組んだか)。画面がそのまま刷る ——
   * 提案が言う数字を、利用者が画面のタイルと突き合わせられるように。
   */
  readonly basis: string;
  /**
   * `'rules'` = 画面の数字から規則で組んだ (現行)。`'stub'` = 固定文 (2026-09-09 まで)。
   * `'live'` = Phase 6 で実 LLM を接続したとき。
   */
  readonly phase: 'stub' | 'rules' | 'live';
}
