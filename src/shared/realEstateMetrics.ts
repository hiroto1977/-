/**
 * 不動産投資の利回り指標 (概算試算)。
 *
 * **重要 — これは概算試算であり、投資助言ではありません。**
 * 表面利回り・実質利回りは物件比較の目安です。実際の収支は空室・金利・税金・
 * 修繕・売却損益で大きく変動します。投資判断は専門家にご相談ください。
 *
 *   表面利回り = 年間満室賃料 ÷ 物件価格 × 100
 *   実質利回り = (年間賃料×入居率 − 年間経費) ÷ (物件価格 + 取得費) × 100
 */

function pct2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface RealEstateYield {
  /** 表面利回り (%)。 */
  readonly grossYieldPct: number;
  /** 実質利回り (%)。 */
  readonly netYieldPct: number;
  /** 実質の年間純収入 (賃料×入居率 − 経費)。 */
  readonly annualNetIncome: number;
  /** 年間満室賃料。 */
  readonly annualGrossRent: number;
}

/**
 * 不動産の表面利回り・実質利回りを計算する。
 *
 * @param monthlyRent 月額満室賃料 (円)
 * @param purchasePrice 物件価格 (円)。0 以下なら全指標 0 (ゼロ除算回避)。
 * @param occupancyRate 入居率 (0..1)。既定 1.0 (満室)。範囲外はクランプ。
 * @param annualExpense 年間経費 (管理費・修繕・税金等, 円)。既定 0。
 * @param acquisitionCost 取得費 (仲介手数料・登記等, 円)。既定 0。
 */
export function calcRealEstateYield(
  monthlyRent: number,
  purchasePrice: number,
  occupancyRate = 1,
  annualExpense = 0,
  acquisitionCost = 0,
): RealEstateYield {
  const rent = Math.max(0, monthlyRent);
  const price = Math.max(0, purchasePrice);
  const occ = Math.min(1, Math.max(0, occupancyRate));
  const expense = Math.max(0, annualExpense);
  const acqCost = Math.max(0, acquisitionCost);

  const annualGrossRent = rent * 12;
  const annualNetIncome = Math.round(annualGrossRent * occ - expense);

  if (price <= 0) {
    return { grossYieldPct: 0, netYieldPct: 0, annualNetIncome, annualGrossRent };
  }
  const grossYieldPct = pct2((annualGrossRent / price) * 100);
  const netYieldPct = pct2((annualNetIncome / (price + acqCost)) * 100);
  return { grossYieldPct, netYieldPct, annualNetIncome, annualGrossRent };
}

/** レバレッジ指標 (CCR・イールドギャップ) の結果。 */
export interface RealEstateLeverage {
  /** 年間のローン返済額 (元利)。 */
  readonly annualDebtService: number;
  /** ローン返済後の年間キャッシュフロー (実質純収入 − 返済額)。 */
  readonly annualCashflow: number;
  /** 自己資金回収率 CCR (%) = 返済後CF ÷ 自己資金。自己資金0なら0。 */
  readonly cashOnCashReturnPct: number;
  /** イールドギャップ (%) = 実質利回り − ローン金利。プラスなら正レバレッジ。 */
  readonly yieldGapPct: number;
}

/**
 * 不動産投資のレバレッジ指標 (CCR・イールドギャップ) を計算する。
 *
 * CCR (Cash on Cash Return) は投下した自己資金に対する手残りキャッシュフローの
 * 割合で、レバレッジ効率の目安。イールドギャップは実質利回りとローン金利の差で、
 * プラスなら借入が収益にプラスに働く (正レバレッジ)。
 *
 * @param annualNetIncome 実質の年間純収入 (calcRealEstateYield の annualNetIncome)
 * @param ownEquity 自己資金 (頭金 + 取得費の自己負担分, 円)。0 以下なら CCR 0。
 * @param annualDebtService 年間のローン返済額 (元利, 円)。既定 0。
 * @param netYieldPct 実質利回り (%, calcRealEstateYield の netYieldPct)
 * @param loanRatePct ローンの年利 (%)。
 */
export function calcRealEstateLeverage(
  annualNetIncome: number,
  ownEquity: number,
  annualDebtService: number,
  netYieldPct: number,
  loanRatePct: number,
): RealEstateLeverage {
  const debtService = Math.max(0, annualDebtService);
  const equity = Math.max(0, ownEquity);
  const annualCashflow = Math.round(annualNetIncome - debtService);
  const cashOnCashReturnPct = equity > 0 ? pct2((annualCashflow / equity) * 100) : 0;
  const yieldGapPct = pct2(netYieldPct - loanRatePct);
  return { annualDebtService: debtService, annualCashflow, cashOnCashReturnPct, yieldGapPct };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Round 61 — 精緻化指標 (NOI 実質利回り / DSCR / NPV / IRR / 損益分岐入居率)
 *
 * **重要 — いずれも概算試算であり、投資助言ではありません。**
 * 実際の収支は空室・金利・税金・修繕・売却損益で大きく変動します。
 * 投資判断は必ず専門家にご相談ください。
 * ───────────────────────────────────────────────────────────────────────── */

/** NOI ベースの実質利回り (NOI 利回り) の結果。 */
export interface RealEstateNoiYield {
  /** 営業純収益 NOI = 満室想定家賃 − 空室損 − 運営費。負値もあり得る。 */
  readonly noi: number;
  /** 空室損 = 満室想定家賃 × (1 − 入居率)。 */
  readonly vacancyLoss: number;
  /** 総取得費 = 物件価格 + 購入諸費用。 */
  readonly totalAcquisition: number;
  /** NOI 利回り (%) = NOI ÷ 総取得費。総取得費 0 以下なら null。 */
  readonly noiYieldPct: number | null;
}

/**
 * NOI ベースの実質利回り (NOI 利回り) を計算する。
 *
 *   NOI        = 満室想定家賃 − 空室損 − 運営費
 *   NOI 利回り = NOI ÷ (物件価格 + 購入諸費用) × 100
 *
 * 既存の {@link calcRealEstateYield} の netYieldPct は「賃料×入居率 − 経費」を
 * 純収入として扱うが、本関数は満室想定家賃から空室損を明示的に控除した NOI を
 * 用い、空室損を内訳として返す点が異なる (加算的・別指標)。
 *
 * @param annualGrossRent 年間満室想定家賃 (円)。負値は 0 にクランプ。
 * @param occupancyRate 入居率 (0..1)。範囲外はクランプ。
 * @param annualOperatingExpense 年間運営費 (円)。負値は 0 にクランプ。
 * @param purchasePrice 物件価格 (円)。負値は 0 にクランプ。
 * @param purchaseCost 購入諸費用 (円)。既定 0。負値は 0 にクランプ。
 * @returns 総取得費が 0 以下なら noiYieldPct は null (ゼロ除算回避)。
 */
export function calcNoiYield(
  annualGrossRent: number,
  occupancyRate: number,
  annualOperatingExpense: number,
  purchasePrice: number,
  purchaseCost = 0,
): RealEstateNoiYield {
  const gross = Math.max(0, annualGrossRent);
  const occ = Math.min(1, Math.max(0, occupancyRate));
  const opex = Math.max(0, annualOperatingExpense);
  const price = Math.max(0, purchasePrice);
  const cost = Math.max(0, purchaseCost);

  const vacancyLoss = Math.round(gross * (1 - occ));
  const noi = Math.round(gross - vacancyLoss - opex);
  const totalAcquisition = price + cost;
  if (totalAcquisition <= 0) {
    return { noi, vacancyLoss, totalAcquisition, noiYieldPct: null };
  }
  return { noi, vacancyLoss, totalAcquisition, noiYieldPct: pct2((noi / totalAcquisition) * 100) };
}

/** DSCR (返済余裕率) の判定区分。 */
export type DscrBand = 'danger' | 'caution' | 'healthy';

/** DSCR (Debt Service Coverage Ratio) の結果。 */
export interface RealEstateDscr {
  /** DSCR = NOI ÷ 年間元利返済額。返済額 0 以下なら null。 */
  readonly dscr: number | null;
  /**
   * 判定区分。1.0 未満は 'danger' (危険水域)、1.0 以上 1.2 未満は 'caution'、
   * 1.2 以上は 'healthy'。DSCR が null なら null。
   */
  readonly band: DscrBand | null;
}

/** DSCR の判定しきい値 (1.0 未満=危険、1.2 未満=注意)。 */
export const DSCR_DANGER_THRESHOLD = 1.0;
export const DSCR_CAUTION_THRESHOLD = 1.2;

/**
 * DSCR (Debt Service Coverage Ratio) を計算する。
 *
 *   DSCR = NOI ÷ 年間元利返済額
 *
 * DSCR が 1.0 未満は NOI で返済を賄えない危険水域。金融機関は 1.2〜1.3 以上を
 * 求めることが多い。
 *
 * @param noi 営業純収益 (円)。負値も可 (band は danger になる)。
 * @param annualDebtService 年間元利返済額 (円)。0 以下なら dscr/band は null。
 */
export function calcDscr(noi: number, annualDebtService: number): RealEstateDscr {
  if (!(annualDebtService > 0)) {
    return { dscr: null, band: null };
  }
  const dscr = Math.round((noi / annualDebtService) * 100) / 100;
  let band: DscrBand;
  if (dscr < DSCR_DANGER_THRESHOLD) {
    band = 'danger';
  } else if (dscr < DSCR_CAUTION_THRESHOLD) {
    band = 'caution';
  } else {
    band = 'healthy';
  }
  return { dscr, band };
}

/**
 * 損益分岐入居率 BER (Break-Even Ratio) を計算する。
 *
 *   BER = (運営費 + 年間元利返済) ÷ 満室想定家賃 × 100
 *
 * 実際の入居率がこれを下回ると、運営費と返済を家賃で賄えなくなる目安。
 *
 * @param annualOperatingExpense 年間運営費 (円)。負値は 0 にクランプ。
 * @param annualDebtService 年間元利返済額 (円)。負値は 0 にクランプ。
 * @param annualGrossRent 年間満室想定家賃 (円)。0 以下なら null (ゼロ除算回避)。
 * @returns 損益分岐入居率 (%)。100 を超え得る (満室でも赤字の意)。
 */
export function calcBreakEvenOccupancyPct(
  annualOperatingExpense: number,
  annualDebtService: number,
  annualGrossRent: number,
): number | null {
  const gross = Math.max(0, annualGrossRent);
  if (gross <= 0) {
    return null;
  }
  const opex = Math.max(0, annualOperatingExpense);
  const debt = Math.max(0, annualDebtService);
  return pct2(((opex + debt) / gross) * 100);
}

/**
 * 割引キャッシュフローの正味現在価値 NPV を計算する。
 *
 *   NPV = Σ_{t=0..n} CF_t ÷ (1 + r)^t
 *
 * 慣例どおり cashflows[0] は初期投資 (通常マイナスの自己資金)、cashflows[1..]
 * は各期のキャッシュフロー (最終期は売却時のネット手取りを含める)。
 *
 * @param cashflows 期 0 から始まるキャッシュフロー配列。空なら null。
 * @param discountRate 割引率 (小数。例 0.05 = 5%)。−1 以下は割引が破綻するため null。
 * @returns NPV (円)。非有限値が混入したら null。
 */
export function calcNpv(cashflows: readonly number[], discountRate: number): number | null {
  if (cashflows.length === 0 || !Number.isFinite(discountRate) || discountRate <= -1) {
    return null;
  }
  // npvSum は非有限 CF / オーバーフローで NaN/Infinity を返すので、ここで一括ガード。
  const npv = npvSum(cashflows, discountRate);
  if (!Number.isFinite(npv)) {
    return null;
  }
  return Math.round(npv);
}

/**
 * 丸めなしの NPV 総和。discountRate > −1 である前提 (呼び出し側でガード済み)。
 * 非有限な CF が混入すれば結果は NaN になり、呼び出し側が弾く。IRR の二分法は
 * 丸め前の精密値を要するため使う。
 */
function npvSum(cashflows: readonly number[], discountRate: number): number {
  let npv = 0;
  for (let t = 0; t < cashflows.length; t += 1) {
    npv += (cashflows[t] as number) / Math.pow(1 + discountRate, t);
  }
  return npv;
}

/** IRR 二分法の反復上限と収束許容誤差・探索レンジ。 */
export const IRR_MAX_ITERATIONS = 200;
export const IRR_TOLERANCE = 1e-7;
export const IRR_RATE_LOW = -0.9999;
export const IRR_RATE_HIGH = 10;

/**
 * 内部収益率 IRR を二分法で概算する (NPV(r) = 0 となる r)。
 *
 * 二分法は符号変化区間 [IRR_RATE_LOW, IRR_RATE_HIGH] を半分に詰めていく。
 * ニュートン法より遅いが、初期値依存の発散がなく収束が保証されるため採用。
 * 区間端で NPV の符号が同じ (= 解が範囲外、または符号変化なし) なら null。
 *
 * - cashflows[0] は初期投資 (通常マイナス)、以降は各期 CF。
 * - 収束ガード: |NPV| が {@link IRR_TOLERANCE} 未満、または区間幅 (の半分) が
 *   tolerance 未満になった時点で確定。{@link IRR_MAX_ITERATIONS} に達したら
 *   最終中点を返す。
 *
 * @param cashflows 期 0 からのキャッシュフロー配列。2 要素未満は null。
 * @returns IRR (小数。例 0.08 = 8%)。符号変化なし・NPV 計算不能なら null。
 */
export function calcIrr(cashflows: readonly number[]): number | null {
  // 探索区間端の NPV。要素 0/1 個や同符号端は下の符号判定が null を返す。
  const npvLow = npvSum(cashflows, IRR_RATE_LOW);
  const npvHigh = npvSum(cashflows, IRR_RATE_HIGH);
  // npvLow は各項の分母 (1−0.9999)^t = 0.0001^t が最小 = 各項の絶対値が最大の
  // 端点。よって npvHigh の項は常に |npvLow の項| 以下で、npvLow が有限なら
  // npvHigh も必ず有限。非有限 (非有限 CF・オーバーフロー) は npvLow で弾ける。
  if (!Number.isFinite(npvLow)) {
    return null;
  }
  // 符号変化がなければ範囲内に解は無い (二分法不可)。0 は非正 (false) 扱い。
  const lowPositive = npvLow > 0;
  if (lowPositive === npvHigh > 0) {
    return null;
  }

  // 区間 [lo, hi] で「lo 側の NPV 符号」は不変 (= lowPositive)。中点の符号が
  // lo 側と一致すれば lo を、そうでなければ hi を中点へ寄せる。区間幅は毎反復で
  // 半減し、IRR_MAX_ITERATIONS (=200) 回で 10.9999/2^200 ≈ 1e-59 まで縮むため、
  // 許容誤差 IRR_TOLERANCE (1e-7) までの収束が反復上限内で必ず保証される
  // (固定回反復 = 早期 break 不要で収束ガードを一点に集約)。
  let lo = IRR_RATE_LOW;
  let hi = IRR_RATE_HIGH;
  // Stryker disable next-line EqualityOperator: 反復回数は上限まで固定で回す。
  // 200 回で幅は許容誤差を遥かに下回り、201 回目以降は丸め後の結果を変えないため
  // i<MAX と i<=MAX / i!=MAX は同値 (等価変異)。i>MAX 等は ConditionalExpression
  // 変異 (true=無限ループ→timeout, false=未実行→誤答) として別途撃墜される。
  for (let i = 0; i < IRR_MAX_ITERATIONS; i += 1) {
    const mid = (lo + hi) / 2;
    const npvMid = npvSum(cashflows, mid);
    // Stryker disable next-line EqualityOperator: 中点 NPV がちょうど 0 になるのは
    // 二項中点 (dyadic) が根に一致する場合のみで、そのとき根は mid なので > と >= は
    // 同一の収束先を与える (等価変異)。
    if (npvMid > 0 === lowPositive) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return Math.round(((lo + hi) / 2) * 1e6) / 1e6;
}
