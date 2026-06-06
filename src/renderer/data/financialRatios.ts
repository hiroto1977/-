/**
 * 財務分析エンジン — 損益計算書(PL)/貸借対照表(BS)/キャッシュフロー(CF) から
 * 主要な財務指標 (基本 15 種 + round 68 精緻化指標) を算出する純粋ロジック。
 * レーダー/折れ線/円/棒グラフ、および各種財務諸表ビューの共通の計算中核。
 *
 * round 68 で経営分析向けに以下を加算 (既存式・既存テスト期待値は不変):
 * ROIC (投下資本利益率)、デュポン分解 (純利益率 × 総資産回転率 × 財務レバレッジ)、
 * FCF (フリーキャッシュフロー)、インタレストカバレッジ、当座比率、現金比率。
 *
 * 各指標は分母 0 などで算定不能なときは null を返す (UI は「—」表示)。
 * 金額は円、比率は % またはその指標固有の単位 (倍 / 日 / 年)。
 *
 * **重要 — 概算の財務分析であり財務助言ではありません。** 入力は snapshot の
 * 模擬データに基づきます。
 */

/** 1 事業 (または全社) の財務インプット。PL + BS + CF の主要科目。 */
export interface FinancialInputs {
  // --- PL ---
  readonly revenue: number; // 売上高
  readonly cogs: number; // 売上原価
  readonly operatingProfit: number; // 営業利益
  readonly ordinaryProfit: number; // 経常利益
  readonly netProfit: number; // 当期純利益
  readonly depreciation: number; // 減価償却費
  readonly laborCost: number; // 人件費
  readonly interestExpense?: number; // 支払利息 (任意)
  // --- CF ---
  readonly operatingCashflow?: number; // 営業キャッシュフロー (任意; 無ければ簡易CF=営業利益+減価償却)
  // --- BS ---
  readonly totalAssets: number; // 総資産
  readonly equity: number; // 自己資本 (純資産)
  readonly currentAssets: number; // 流動資産
  readonly currentLiabilities: number; // 流動負債
  readonly fixedAssets: number; // 固定資産
  readonly fixedLiabilities: number; // 固定負債
  readonly accountsReceivable: number; // 売上債権
  readonly inventory: number; // 棚卸資産
  readonly accountsPayable: number; // 仕入債務
  readonly interestBearingDebt: number; // 有利子負債 (借入金)
  // --- 任意 (round 68: 精緻化指標; 無ければ概算デフォルトで代替) ---
  readonly capitalExpenditure?: number; // 設備投資額 (CF 投資; 無ければ減価償却費で代替)
  readonly effectiveTaxRate?: number; // 実効税率 (0-1; NOPAT 算定用; 無ければ DEFAULT_EFFECTIVE_TAX_RATE)
}

/** NOPAT / ROIC / FCF 算定で参照する既定値 (概算)。法人実効税率は約 30% を仮置き。 */
export const DEFAULT_EFFECTIVE_TAX_RATE = 0.3;

/** 算出された 15 指標。比率は %、回転率は 倍、CCC は 日、月商倍率は ヶ月、償還年数は 年。 */
export interface FinancialRatios {
  readonly equityRatioPct: number | null; // 自己資本比率
  readonly currentRatioPct: number | null; // 流動比率
  readonly fixedLongTermFitPct: number | null; // 固定長期適合率
  readonly debtToMonthlySalesRatio: number | null; // 借入金月商倍率 (ヶ月)
  readonly debtRepaymentYears: number | null; // 債務償還年数 (年)
  readonly operatingMarginPct: number | null; // 営業利益率
  readonly ordinaryMarginPct: number | null; // 経常利益率
  readonly netProfit: number; // 当期純利益 (金額)
  readonly netMarginPct: number | null; // 当期純利益率
  readonly laborSharePct: number | null; // 労働分配率
  readonly ebitda: number; // EBITDA (金額)
  readonly ebitdaMarginPct: number | null; // EBITDA マージン
  readonly receivablesTurnover: number | null; // 売上債権回転率 (倍/年)
  readonly inventoryTurnover: number | null; // 棚卸資産回転率 (倍/年)
  readonly cccDays: number | null; // キャッシュコンバージョンサイクル (日)
  readonly roaPct: number | null; // ROA
  readonly roePct: number | null; // ROE
  // --- round 68: 精緻化指標 (加算的) -------------------------------------
  readonly nopat: number; // NOPAT = 営業利益 × (1 − 実効税率) (金額)
  readonly roicPct: number | null; // ROIC = NOPAT / 投下資本 (有利子負債 + 自己資本)
  readonly quickRatioPct: number | null; // 当座比率 = (流動資産 − 棚卸資産) / 流動負債
  readonly cashRatioPct: number | null; // 現金比率 = 現預金(概算) / 流動負債
  readonly freeCashflow: number; // FCF = 営業CF − 設備投資 (金額)
  readonly interestCoverage: number | null; // インタレストカバレッジ = 営業利益 / 支払利息 (倍)
  // デュポン 3 分解: ROE = 純利益率 × 総資産回転率 × 財務レバレッジ
  readonly dupontNetMarginPct: number | null; // 売上高純利益率 (%)
  readonly dupontAssetTurnover: number | null; // 総資産回転率 (倍)
  readonly dupontEquityMultiplier: number | null; // 財務レバレッジ = 総資産 / 自己資本 (倍)
}

const pct = (num: number, den: number): number | null => (den === 0 ? null : (num / den) * 100);
const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);
const round0 = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

function roundNullable(v: number | null, r: (n: number) => number): number | null {
  return v == null ? null : r(v);
}

/** すべての指標を算出する。純粋。 */
export function computeFinancialRatios(f: FinancialInputs): FinancialRatios {
  const ebitda = f.operatingProfit + f.depreciation;
  const simpleCf = f.operatingCashflow ?? f.operatingProfit + f.depreciation;
  // 付加価値の簡易定義: 営業利益 + 人件費 + 減価償却費。
  const valueAdded = f.operatingProfit + f.laborCost + f.depreciation;
  const monthlySales = f.revenue / 12;

  // CCC = 売上債権回転日数 + 棚卸資産回転日数 − 仕入債務回転日数。
  // revenue / cogs のいずれかが 0 なら算定不能 (null)。回転日数を個別に null 化
  // していた頃は invDays/apDays が同じ cogs===0 ガードで相互にマスクし合い、
  // mutation で equivalent (殺せない) になっていたため、単一ガードに集約する。
  const ccc =
    f.revenue === 0 || f.cogs === 0
      ? null
      : (f.accountsReceivable / f.revenue) * 365 +
        (f.inventory / f.cogs) * 365 -
        (f.accountsPayable / f.cogs) * 365;

  // --- round 68: 精緻化指標 --------------------------------------------
  // 実効税率は 0-1 にクランプ (NOPAT が負税率/100%超で歪まないように)。
  const taxRate = Math.min(1, Math.max(0, f.effectiveTaxRate ?? DEFAULT_EFFECTIVE_TAX_RATE));
  // NOPAT = 営業利益 × (1 − 実効税率)。営業利益が負ならそのまま負の NOPAT。
  const nopat = f.operatingProfit * (1 - taxRate);
  // 投下資本 = 有利子負債 + 自己資本。0 以下は算定不能 (null)。
  const investedCapital = f.interestBearingDebt + f.equity;
  // 現預金(概算) = 流動資産 − 売上債権 − 棚卸資産 (財務諸表ビューと同一定義、負はクランプ)。
  const cash = Math.max(0, f.currentAssets - f.accountsReceivable - f.inventory);
  // 設備投資: 明示が無ければ維持投資 ≈ 減価償却費 と仮定 (財務諸表 CF と整合)。
  const capex = f.capitalExpenditure ?? f.depreciation;
  // FCF = 営業CF − 設備投資。営業CF は既存 simpleCf (営業CF override or 営業利益+減価償却)。
  const freeCashflow = simpleCf - capex;

  return {
    equityRatioPct: roundNullable(pct(f.equity, f.totalAssets), round1),
    currentRatioPct: roundNullable(pct(f.currentAssets, f.currentLiabilities), round1),
    fixedLongTermFitPct: roundNullable(pct(f.fixedAssets, f.equity + f.fixedLiabilities), round1),
    debtToMonthlySalesRatio: roundNullable(ratio(f.interestBearingDebt, monthlySales), round2),
    debtRepaymentYears: roundNullable(simpleCf <= 0 ? null : f.interestBearingDebt / simpleCf, round2),
    operatingMarginPct: roundNullable(pct(f.operatingProfit, f.revenue), round1),
    ordinaryMarginPct: roundNullable(pct(f.ordinaryProfit, f.revenue), round1),
    netProfit: f.netProfit,
    netMarginPct: roundNullable(pct(f.netProfit, f.revenue), round1),
    laborSharePct: roundNullable(valueAdded <= 0 ? null : (f.laborCost / valueAdded) * 100, round1),
    ebitda,
    ebitdaMarginPct: roundNullable(pct(ebitda, f.revenue), round1),
    receivablesTurnover: roundNullable(ratio(f.revenue, f.accountsReceivable), round2),
    inventoryTurnover: roundNullable(ratio(f.cogs, f.inventory), round2),
    cccDays: roundNullable(ccc, round1),
    roaPct: roundNullable(pct(f.netProfit, f.totalAssets), round1),
    roePct: roundNullable(pct(f.netProfit, f.equity), round1),
    // --- round 68: 精緻化指標 (加算的) ---
    nopat: round0(nopat),
    // ROIC: 投下資本が 0 以下なら算定不能。pct は 0 のみガードするため <=0 を明示。
    roicPct: roundNullable(investedCapital <= 0 ? null : (nopat / investedCapital) * 100, round1),
    quickRatioPct: roundNullable(pct(f.currentAssets - f.inventory, f.currentLiabilities), round1),
    cashRatioPct: roundNullable(pct(cash, f.currentLiabilities), round1),
    freeCashflow: round0(freeCashflow),
    // インタレストカバレッジ: 支払利息 (任意) が未指定/0 なら算定不能。
    interestCoverage: roundNullable(
      f.interestExpense == null || f.interestExpense === 0
        ? null
        : f.operatingProfit / f.interestExpense,
      round2,
    ),
    dupontNetMarginPct: roundNullable(pct(f.netProfit, f.revenue), round1),
    dupontAssetTurnover: roundNullable(ratio(f.revenue, f.totalAssets), round2),
    dupontEquityMultiplier: roundNullable(ratio(f.totalAssets, f.equity), round2),
  } as FinancialRatios;
}

// --- レーダーチャート用の 0-100 スコアリング ----------------------------
// 各指標を「健全域=高スコア」になるよう 0-100 に正規化する。健全性の方向が
// 指標ごとに違う (高いほど良い / 低いほど良い) ため、ベンチマークで吸収する。

export interface RadarAxis {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly raw: number | null;
  /** 0-100。null (算定不能) は 0 とみなす。 */
  readonly score: number;
}

/** 線形スコア: raw が good で 100、bad で 0。範囲外はクランプ。 */
function linScore(raw: number | null, bad: number, good: number): number {
  if (raw == null) return 0;
  const t = (raw - bad) / (good - bad);
  return Math.max(0, Math.min(100, Math.round(t * 100)));
}

/** 15 指標をレーダー軸 (0-100 スコア) に変換する。 */
export function radarAxes(r: FinancialRatios): RadarAxis[] {
  return [
    { key: 'equityRatio', label: '自己資本比率', unit: '%', raw: r.equityRatioPct, score: linScore(r.equityRatioPct, 0, 50) },
    { key: 'currentRatio', label: '流動比率', unit: '%', raw: r.currentRatioPct, score: linScore(r.currentRatioPct, 80, 200) },
    { key: 'fixedLongTermFit', label: '固定長期適合率', unit: '%', raw: r.fixedLongTermFitPct, score: linScore(r.fixedLongTermFitPct, 130, 80) },
    { key: 'debtToMonthlySales', label: '借入金月商倍率', unit: 'ヶ月', raw: r.debtToMonthlySalesRatio, score: linScore(r.debtToMonthlySalesRatio, 6, 1) },
    { key: 'debtRepaymentYears', label: '債務償還年数', unit: '年', raw: r.debtRepaymentYears, score: linScore(r.debtRepaymentYears, 15, 3) },
    { key: 'operatingMargin', label: '営業利益率', unit: '%', raw: r.operatingMarginPct, score: linScore(r.operatingMarginPct, -5, 20) },
    { key: 'ordinaryMargin', label: '経常利益率', unit: '%', raw: r.ordinaryMarginPct, score: linScore(r.ordinaryMarginPct, -5, 20) },
    { key: 'netMargin', label: '当期純利益率', unit: '%', raw: r.netMarginPct, score: linScore(r.netMarginPct, -5, 15) },
    { key: 'laborShare', label: '労働分配率', unit: '%', raw: r.laborSharePct, score: linScore(r.laborSharePct, 80, 40) },
    { key: 'ebitdaMargin', label: 'EBITDAマージン', unit: '%', raw: r.ebitdaMarginPct, score: linScore(r.ebitdaMarginPct, 0, 25) },
    { key: 'receivablesTurnover', label: '売上債権回転率', unit: '倍', raw: r.receivablesTurnover, score: linScore(r.receivablesTurnover, 4, 24) },
    { key: 'inventoryTurnover', label: '棚卸資産回転率', unit: '倍', raw: r.inventoryTurnover, score: linScore(r.inventoryTurnover, 4, 24) },
    { key: 'ccc', label: 'CCC', unit: '日', raw: r.cccDays, score: linScore(r.cccDays, 90, 0) },
    { key: 'roa', label: 'ROA', unit: '%', raw: r.roaPct, score: linScore(r.roaPct, 0, 10) },
    { key: 'roe', label: 'ROE', unit: '%', raw: r.roePct, score: linScore(r.roePct, 0, 15) },
  ];
}
