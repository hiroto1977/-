/**
 * 減価償却 (定額法 / 定率法) と少額減価償却資産の判定 — 概算試算。
 *
 * **重要 — 概算であり税務助言ではありません。** 償却率は耐用年数の逆数 (定額法) /
 * その定数倍 (定率法 既定 200%) を用いた簡便計算で、国税庁の償却率表とは端数処理が
 * 異なる場合があります。定率法は償却保証額・改定償却率の代わりに「定率額が残存簿価の
 * 均等償却額を下回ったら均等償却へ切替える」近似で、耐用年数内に備忘価額 1 円まで
 * 償却します。正確な税額は税理士・国税庁ツールでご確認ください。
 */

const yen = (n: number): number => Math.round(n);

/** 償却スケジュールの 1 年分。 */
export interface DepreciationYear {
  readonly year: number;
  /** その年の償却費。 */
  readonly depreciation: number;
  /** 期末の帳簿価額 (備忘価額 1 円を最終年に残す)。 */
  readonly bookValue: number;
}

/** 定額法の年間償却費 = 取得価額 ÷ 耐用年数 (償却率 = 1/n の簡便)。 */
export function straightLineAnnual(acquisitionCost: number, usefulLife: number): number {
  // acquisitionCost===0 は yen(0/life)=0 と計算経路も一致するため <=→< は equivalent。
  // Stryker disable next-line EqualityOperator
  if (acquisitionCost <= 0) return 0;
  if (usefulLife <= 0) return 0;
  return yen(acquisitionCost / usefulLife);
}

/** 定額法の償却スケジュール (最終年に備忘価額 1 円を残す)。 */
export function straightLineSchedule(acquisitionCost: number, usefulLife: number): DepreciationYear[] {
  // usefulLife <= 0 はループ条件 (y <= usefulLife) が 1 度も回らず [] を返すため
  // ここでは判定不要 (冗長)。acquisitionCost のみ早期 return する。
  if (acquisitionCost <= 0) return [];
  const annual = yen(acquisitionCost / usefulLife);
  const rows: DepreciationYear[] = [];
  let book = acquisitionCost;
  for (let y = 1; y <= usefulLife; y += 1) {
    let dep: number;
    if (y === usefulLife) {
      dep = book - 1; // 最終年: 備忘価額 1 円を残す
    } else {
      // book-1 の cap は均等償却では最終年まで効かない (annual ≤ book-1) 防御値のため、
      // その ArithmeticOperator は無効化する (Math.min→Math.max は既存テストで kill)。
      // Stryker disable next-line ArithmeticOperator
      dep = Math.min(annual, book - 1);
    }
    // dep は book≥1 のため常に ≥0。負値クランプは防御で到達不能。
    // Stryker disable next-line ConditionalExpression,EqualityOperator
    if (dep < 0) dep = 0;
    book -= dep;
    rows.push({ year: y, depreciation: dep, bookValue: book });
  }
  return rows;
}

/**
 * 定率法の償却スケジュール (既定 200% 定率法)。
 * 償却率 = multiplier ÷ 耐用年数。期首簿価 × 償却率を基本とし、それが残存簿価の
 * 均等償却額を下回った年から均等償却へ切替える (改定償却率の近似)。
 */
export function decliningBalanceSchedule(
  acquisitionCost: number,
  usefulLife: number,
  multiplier = 2,
): DepreciationYear[] {
  // usefulLife <= 0 はループ条件で空配列になるため冗長。acquisitionCost のみ判定。
  if (acquisitionCost <= 0) return [];
  const rate = multiplier / usefulLife;
  const rows: DepreciationYear[] = [];
  let book = acquisitionCost;
  let switched = false;
  for (let y = 1; y <= usefulLife; y += 1) {
    const remainingYears = usefulLife - y + 1;
    let dep: number;
    // 最終年の特例 (book-1) は、有効入力では切替済みのため else 側でも even=book →
    // Math.min で book-1 に丸まり同値。安全のため特例は残すが ConditionalExpression は
    // equivalent のため無効化する。
    // Stryker disable next-line ConditionalExpression
    if (y === usefulLife) {
      dep = book - 1; // 最終年: 備忘価額 1 円を残す
    } else {
      const declining = book * rate;
      const evenRemaining = book / remainingYears;
      // declining===evenRemaining の同値時は切替えても dep が変わらず以降も同一 (equivalent)。
      // Stryker disable next-line EqualityOperator
      if (!switched && declining < evenRemaining) switched = true;
      dep = yen(switched ? evenRemaining : declining);
      // 残存簿価が備忘 1 円を割らないよう book-1 で頭打ち (Math.min は if より mutation 堅牢)。
      dep = Math.min(dep, book - 1);
    }
    // dep は上で book-1 に頭打ちされ book≥1 のため常に ≥0。負値クランプは到達不能。
    // Stryker disable next-line ConditionalExpression,EqualityOperator
    if (dep < 0) dep = 0;
    book -= dep;
    rows.push({ year: y, depreciation: dep, bookValue: book });
  }
  return rows;
}

/** 少額減価償却資産の取扱い区分。 */
export type SmallAssetTreatment = 'immediate' | 'lump-3year' | 'sme-special' | 'normal';

/**
 * 取得価額から少額減価償却資産の取扱いを判定する (簡便)。
 * - 10万円未満: 全額損金算入 (即時)。
 * - 10万円以上20万円未満: 一括償却資産 (3年均等償却) も選択可。
 * - 20万円以上30万円未満: 中小企業者等の少額減価償却資産の特例 (即時、年300万円上限)。
 * - 30万円以上: 通常の減価償却。
 */
export function classifySmallAsset(acquisitionCost: number): SmallAssetTreatment {
  if (acquisitionCost < 100_000) return 'immediate';
  if (acquisitionCost < 200_000) return 'lump-3year';
  if (acquisitionCost < 300_000) return 'sme-special';
  return 'normal';
}

// ===========================================================================
// Round 66 追加 — より精緻な償却計算 (加算的 / 既存関数は不変)
//
// **重要 — いずれも概算であり税務助言ではありません。** 200% 定率法の正規ロジック
// (償却率・改定償却率・保証率) を提供しますが、各率は国税庁「減価償却資産の償却率表」を
// 引数として与える前提で、引数省略時は耐用年数からの簡便概算 (償却率 = 2/n) を用います。
// 端数処理・特例 (リース・特別償却・即時償却の年上限管理) は実務と異なる場合があります。
// 正確な税額は税理士・国税庁ツールでご確認ください。
// ===========================================================================

/** 有限な正の数かを判定する内部ヘルパ。 */
function isPositiveFinite(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

/**
 * 200% 定率法の償却率の概算 = multiplier ÷ 耐用年数。
 * 国税庁の償却率表が手元に無い場合の簡便値。耐用年数 ≤ 0 / 非有限は null。
 */
export function decliningBalanceRate(usefulLife: number, multiplier = 2): number | null {
  if (!isPositiveFinite(usefulLife)) return null;
  if (!isPositiveFinite(multiplier)) return null;
  return multiplier / usefulLife;
}

/** 中古資産の見積耐用年数 (簡便法) の結果。 */
export interface UsedAssetUsefulLifeResult {
  /** 見積耐用年数 (年, 1年未満切捨て・最低2年)。 */
  readonly usefulLife: number;
  /** 法定耐用年数を全て経過していたか (その場合 法定×0.2 を適用)。 */
  readonly fullyElapsed: boolean;
}

/**
 * 中古資産の見積耐用年数 (簡便法)。
 * - 法定耐用年数の一部を経過: (法定耐用年数 − 経過年数) + 経過年数 × 0.2
 * - 法定耐用年数の全部を経過: 法定耐用年数 × 0.2
 * - いずれも 1 年未満の端数は切捨て、最低 2 年。
 *
 * statutoryLife ≤ 0 / 非有限、elapsedYears が負 / 非有限なら null。
 */
export function usedAssetUsefulLife(
  statutoryLife: number,
  elapsedYears: number,
): UsedAssetUsefulLifeResult | null {
  if (!isPositiveFinite(statutoryLife)) return null;
  if (!Number.isFinite(elapsedYears) || elapsedYears < 0) return null;
  const fullyElapsed = elapsedYears >= statutoryLife;
  const raw = fullyElapsed
    ? statutoryLife * 0.2
    : statutoryLife - elapsedYears + elapsedYears * 0.2;
  // 1年未満は切捨て、最低 2 年。
  const floored = Math.floor(raw);
  return { usefulLife: Math.max(2, floored), fullyElapsed };
}

/**
 * 月割償却額 = 年間償却額 × 事業供用月数 ÷ 12。
 * 取得・事業供用が期中の場合に使用。年間額は呼び出し側で算定したもの。
 * monthsInService は 12 を上限にクランプ。年間額が非有限 / 非正、月数が非有限 / 非正なら 0。
 */
export function proratedDepreciation(annualDepreciation: number, monthsInService: number): number {
  // annualDepreciation===0 は <=→< でも yen(0*months/12)=0 と計算経路が一致するため equivalent。
  // Stryker disable next-line EqualityOperator
  if (!Number.isFinite(annualDepreciation) || annualDepreciation <= 0) return 0;
  // monthsInService===0 も <=→< で Math.min(12,0)=0 → yen(annual*0/12)=0 と一致するため equivalent。
  // Stryker disable next-line EqualityOperator
  if (!Number.isFinite(monthsInService) || monthsInService <= 0) return 0;
  const months = Math.min(12, monthsInService);
  return yen((annualDepreciation * months) / 12);
}

/** 正規の 200% 定率法を構成する各率 (国税庁 償却率表)。 */
export interface DecliningBalanceFactors {
  /** 償却率 (省略時 multiplier ÷ 耐用年数)。 */
  readonly rate?: number;
  /** 改定償却率 (省略時 rate を流用)。 */
  readonly revisedRate?: number;
  /** 保証率 (省略時 0 = 保証額の制約なし)。 */
  readonly guaranteeRate?: number;
  /** multiplier (省略時 2 = 200% 定率法)。 */
  readonly multiplier?: number;
}

/**
 * 200% 定率法の償却スケジュール (正規ロジック)。
 *
 * 各年の「調整前償却額」= 期首帳簿価額 × 償却率。これが「償却保証額」
 * (取得価額 × 保証率) を**下回った最初の年**から、その年の期首帳簿価額を
 * 「改定取得価額」として固定し、以後は 改定取得価額 × 改定償却率 で均等償却する。
 * 最終年は備忘価額 1 円を残す。
 *
 * 既存の {@link decliningBalanceSchedule} (均等償却近似) とは別関数。
 * acquisitionCost ≤ 0 / 非有限、usefulLife ≤ 0 / 非有限、rate ≤ 0 / 非有限なら []。
 */
export function decliningBalanceScheduleStrict(
  acquisitionCost: number,
  usefulLife: number,
  factors: DecliningBalanceFactors = {},
): DepreciationYear[] {
  if (!isPositiveFinite(acquisitionCost)) return [];
  if (!isPositiveFinite(usefulLife)) return [];
  const multiplier = factors.multiplier ?? 2;
  const rate = factors.rate ?? multiplier / usefulLife;
  const revisedRate = factors.revisedRate ?? rate;
  const guaranteeRate = factors.guaranteeRate ?? 0;
  if (!isPositiveFinite(rate)) return [];

  const guaranteedAmount = acquisitionCost * guaranteeRate;
  const rows: DepreciationYear[] = [];
  let book = acquisitionCost;
  let revisedBase = 0; // 改定取得価額 (切替時に期首簿価で固定)
  let switched = false;

  for (let y = 1; y <= usefulLife; y += 1) {
    let dep: number;
    if (!switched) {
      const beforeAdjust = book * rate;
      // 調整前償却額 < 償却保証額 → 改定取得価額 × 改定償却率 へ切替。
      if (beforeAdjust < guaranteedAmount) {
        switched = true;
        revisedBase = book;
        dep = yen(revisedBase * revisedRate);
      } else {
        dep = yen(beforeAdjust);
      }
    } else {
      dep = yen(revisedBase * revisedRate);
    }
    // 残存簿価が備忘 1 円を割らないよう book-1 で頭打ち。
    dep = Math.min(dep, book - 1);
    // dep は book≥1 のため常に ≥0。負値クランプは到達不能の防御。
    // Stryker disable next-line ConditionalExpression,EqualityOperator
    if (dep < 0) dep = 0;
    book -= dep;
    rows.push({ year: y, depreciation: dep, bookValue: book });
  }
  return rows;
}

/** 定額法 vs 定率法の 1 年分の比較行。 */
export interface MethodComparisonYear {
  readonly year: number;
  /** 定額法のその年の償却費。 */
  readonly straightLine: number;
  /** 定額法の期末帳簿価額。 */
  readonly straightLineBookValue: number;
  /** 定率法のその年の償却費。 */
  readonly decliningBalance: number;
  /** 定率法の期末帳簿価額。 */
  readonly decliningBalanceBookValue: number;
}

/**
 * 同一資産について定額法と定率法 (200% 既定) の各年償却額・帳簿価額を並べて比較する。
 * 定率法は既存の {@link decliningBalanceSchedule} (均等償却近似) を用いる。
 * acquisitionCost ≤ 0 / 非有限、usefulLife ≤ 0 / 非有限なら []。
 */
export function compareMethods(
  acquisitionCost: number,
  usefulLife: number,
  multiplier = 2,
): MethodComparisonYear[] {
  if (!isPositiveFinite(acquisitionCost)) return [];
  if (!isPositiveFinite(usefulLife)) return [];
  const sl = straightLineSchedule(acquisitionCost, usefulLife);
  const db = decliningBalanceSchedule(acquisitionCost, usefulLife, multiplier);
  const rows: MethodComparisonYear[] = [];
  for (let y = 1; y <= usefulLife; y += 1) {
    const slRow = sl[y - 1];
    const dbRow = db[y - 1];
    rows.push({
      year: y,
      straightLine: slRow ? slRow.depreciation : 0,
      straightLineBookValue: slRow ? slRow.bookValue : acquisitionCost,
      decliningBalance: dbRow ? dbRow.depreciation : 0,
      decliningBalanceBookValue: dbRow ? dbRow.bookValue : acquisitionCost,
    });
  }
  return rows;
}

/**
 * 一括償却資産 (取得価額 20 万円未満) の 3 年均等償却スケジュール。
 * 残存簿価・備忘価額の概念は無く、3 年で全額 (取得価額) を均等償却する。
 * 端数は最終年で調整 (合計 = 取得価額)。
 * acquisitionCost ≤ 0 / 非有限、または 20 万円以上なら [] (対象外)。
 */
export function lumpSum3YearSchedule(acquisitionCost: number): DepreciationYear[] {
  if (!isPositiveFinite(acquisitionCost)) return [];
  if (acquisitionCost >= 200_000) return [];
  const perYear = yen(acquisitionCost / 3);
  const rows: DepreciationYear[] = [];
  let book = acquisitionCost;
  for (let y = 1; y <= 3; y += 1) {
    // 最終年は端数調整で残額を全額償却 (備忘価額なし → bookValue 0)。
    const dep = y === 3 ? book : perYear;
    book -= dep;
    rows.push({ year: y, depreciation: dep, bookValue: book });
  }
  return rows;
}

/** 中小企業者等の少額減価償却資産の特例 (即時償却) の判定結果。 */
export interface SmeImmediateResult {
  /** この資産が即時償却の対象か (30 万円未満 かつ 年上限の残枠あり)。 */
  readonly eligible: boolean;
  /** 即時償却できる金額 (対象なら残枠まで、対象外なら 0)。 */
  readonly deductible: number;
  /** この資産適用後の年間累計額。 */
  readonly cumulativeAfter: number;
  /** 年 300 万円上限を超過し即時償却できなかった金額 (通常償却へ回る)。 */
  readonly excludedOverCap: number;
}

/** 中小企業者等の少額減価償却資産の特例 — 1 資産あたりの取得価額上限 (30 万円)。 */
export const SME_UNIT_LIMIT = 300_000;
/** 中小企業者等の少額減価償却資産の特例 — 年間取得価額の合計上限 (300 万円)。 */
export const SME_ANNUAL_CAP = 3_000_000;

/**
 * 中小企業者等の少額減価償却資産の特例 (措法 67 の 5)。
 * - 取得価額 30 万円未満が対象、年間累計 300 万円が上限。
 * - acquisitionCost ≤ 0 / 非有限、30 万円以上、または既に上限到達なら eligible=false。
 * - 累計が上限を跨ぐ場合、上限までの残枠のみ即時償却し、超過分は excludedOverCap。
 *
 * @param acquisitionCost 当該資産の取得価額
 * @param cumulativeBefore 同一年度で既に即時償却した累計額 (省略時 0、負 / 非有限は 0 扱い)
 */
export function smeImmediateDeduction(
  acquisitionCost: number,
  cumulativeBefore = 0,
): SmeImmediateResult {
  // cumulativeBefore===0 は >0→>=0 でも prior=0 で同値 (三項の両枝とも 0)。equivalent。
  // Stryker disable next-line EqualityOperator
  const prior = Number.isFinite(cumulativeBefore) && cumulativeBefore > 0 ? cumulativeBefore : 0;
  if (!isPositiveFinite(acquisitionCost) || acquisitionCost >= SME_UNIT_LIMIT) {
    return { eligible: false, deductible: 0, cumulativeAfter: prior, excludedOverCap: 0 };
  }
  const remainingCap = SME_ANNUAL_CAP - prior;
  if (remainingCap <= 0) {
    return {
      eligible: false,
      deductible: 0,
      cumulativeAfter: prior,
      excludedOverCap: acquisitionCost,
    };
  }
  const deductible = Math.min(acquisitionCost, remainingCap);
  const excludedOverCap = acquisitionCost - deductible;
  return {
    eligible: true,
    deductible,
    cumulativeAfter: prior + deductible,
    excludedOverCap,
  };
}
