/**
 * 国民健康保険料 (国保) の概算算定 (純粋関数のみ、IO なし)。
 *
 * **重要 — これは概算であり税務助言ではありません。** 国民健康保険料の料率・
 * 均等割額・賦課限度額・軽減 (7/5/2割) は市区町村ごとに異なり毎年改定されます。
 * 正確な額は市区町村に確認してください。
 *
 * 自営業者・無職・退職者など、被用者保険 (厚生年金/健保) に加入しない人が対象。
 * 被用者保険の概算は別モジュール `taxSocialInsurance.ts` を参照 (国保とは別物)。
 *
 * 国保は次の 3 区分構成で、各区分に賦課限度額がある:
 * - 医療分 (基礎賦課額): 所得割 + 均等割 (+ 平等割)、限度額 65 万円。
 * - 後期高齢者支援金分: 所得割 + 均等割 (+ 平等割)、限度額 24 万円。
 * - 介護分 (40〜64 歳のみ): 所得割 + 均等割 (+ 平等割)、限度額 17 万円。
 *
 * 賦課基準額 = 総所得金額等 − 基礎控除 43 万円 (負なら 0) で、所得割は
 * この賦課基準額に各区分の所得割率を乗じて求める。
 *
 * **本モジュールでは扱わない**: 低所得世帯の軽減 (7/5/2 割)・旧被扶養者減免・
 * 産前産後減免・非自発的失業者軽減などの各種減免措置。これらを適用すると
 * 実額はここでの概算より低くなる。
 */

/** 円未満を四捨五入。 */
function yen(n: number): number {
  return Math.round(n);
}

// --- 賦課限度額・基礎控除の固定値 (令和6年度の代表値) ----------------------
//
// Stryker disable all : 制度上の固定値 (賦課限度額・基礎控除)。これらの定数
// リテラル自体を書き換える変異は「別の制度値を表す別関数」であり、本モジュール
// が表現する令和6年度の制度とは等価でない (テストは min(cap) の発動境界・基礎
// 控除後の賦課基準額を実値で pin しており、定数を経由した計算結果は撃墜される)。

/** 医療分 (基礎賦課額) の賦課限度額 (円/年)。 */
export const MEDICAL_CAP = 650_000;
/** 後期高齢者支援金分の賦課限度額 (円/年)。 */
export const SUPPORT_CAP = 240_000;
/** 介護分の賦課限度額 (円/年。40〜64 歳のみ)。 */
export const CARE_CAP = 170_000;
/** 国民健康保険料の基礎控除額 (賦課基準額の算定に用いる、円)。 */
export const NHI_BASIC_DEDUCTION = 430_000;

// Stryker restore all

/**
 * 1 区分 (医療分 / 支援金分 / 介護分) の料率設定。
 *
 * 所得割率は賦課基準額に乗じ、均等割額は加入者 1 人あたり、平等割額は 1 世帯
 * あたりに課される。平等割を採用しない自治体は `perHousehold` を省略 (= 0) する。
 */
export interface NhiComponentRate {
  /** 所得割率 (賦課基準額に乗じる。例: 0.0726 = 7.26%)。 */
  readonly incomeRate: number;
  /** 均等割額 (加入者 1 人あたり、円/年)。 */
  readonly perCapita: number;
  /** 平等割額 (1 世帯あたり、円/年)。省略時は 0 (平等割なしの自治体)。 */
  readonly perHousehold?: number;
}

/** 3 区分すべての料率設定。 */
export interface NhiRates {
  /** 医療分 (基礎賦課額)。 */
  readonly medical: NhiComponentRate;
  /** 後期高齢者支援金分。 */
  readonly support: NhiComponentRate;
  /** 介護分 (40〜64 歳のみ賦課)。 */
  readonly care: NhiComponentRate;
}

/**
 * 既定の料率テーブル (令和6年度の **一例**)。
 *
 * **重要 — これは概算であり税務助言ではありません。** 料率・均等割額・平等割額・
 * 賦課限度額・軽減 (7/5/2割) は市区町村ごとに異なり毎年改定されます。正確な額は
 * 市区町村に確認してください。ここでの値はあくまで令和6年度の代表的な一例で、
 * 実際の自治体の値を `nationalHealthInsurance` の `rates` 引数で渡せます。
 */
// Stryker disable all : 代表料率テーブル (令和6年度の一例)。各リテラルの書き換え
// 変異は「別の自治体/年度の料率を表す別テーブル」であり制度的に等価でない。
// 所得割計算・min(cap)・加算・切捨ロジックは独自 rates を渡すテストで撃墜する。
export const DEFAULT_NHI_RATES: NhiRates = {
  medical: { incomeRate: 0.0726, perCapita: 45_000, perHousehold: 25_000 },
  support: { incomeRate: 0.0269, perCapita: 15_000, perHousehold: 8_000 },
  care: { incomeRate: 0.0225, perCapita: 16_000, perHousehold: 6_000 },
};
// Stryker restore all

/**
 * 賦課基準額を計算する = max(総所得金額等 − 基礎控除 43 万, 0)。
 *
 * **概算であり税務助言ではありません。** 賦課基準額の算定方法・基礎控除額は
 * 市区町村ごとに異なり毎年改定されます。正確な額は市区町村に確認してください。
 * 軽減・減免措置は本モジュールでは扱いません。
 *
 * @param totalIncome 総所得金額等 (円)。負・非有限は throw。
 */
export function assessmentBase(totalIncome: number): number {
  if (!Number.isFinite(totalIncome) || totalIncome < 0) {
    throw new Error(`assessmentBase: totalIncome must be a finite number >= 0, got ${totalIncome}`);
  }
  return Math.max(0, totalIncome - NHI_BASIC_DEDUCTION);
}

/** `componentPremium` の入力。 */
export interface ComponentPremiumInput {
  /** 賦課基準額 (円)。`assessmentBase` の結果。 */
  readonly base: number;
  /** 加入者数 (均等割の人数。1 以上の整数)。 */
  readonly members: number;
  /** この区分の料率設定。 */
  readonly rate: NhiComponentRate;
  /** この区分の賦課限度額 (円)。 */
  readonly cap: number;
}

/**
 * 1 区分の保険料 = min(所得割 + 均等割 + 平等割, 賦課限度額) を計算する。
 *
 * - 所得割 = 賦課基準額 × 所得割率
 * - 均等割 = 均等割額 × 加入者数
 * - 平等割 = 平等割額 × 1 世帯 (`perHousehold` 省略時は 0)
 * - 合算後、賦課限度額で頭打ちし、最後に **100 円未満を切り捨てる**
 *   (多くの自治体の調定額の端数処理に倣う)。
 *
 * **概算であり税務助言ではありません。** 料率・均等割額・平等割額・賦課限度額・
 * 軽減措置は市区町村ごとに異なり毎年改定されます。正確な額は市区町村に確認すること。
 *
 * @param input 賦課基準額・加入者数・料率・限度額。
 */
export function componentPremium(input: ComponentPremiumInput): number {
  const { base, members, rate, cap } = input;
  if (!Number.isFinite(base) || base < 0) {
    throw new Error(`componentPremium: base must be a finite number >= 0, got ${base}`);
  }
  if (!Number.isInteger(members) || members < 1) {
    throw new Error(`componentPremium: members must be an integer >= 1, got ${members}`);
  }
  if (!Number.isFinite(rate.incomeRate) || rate.incomeRate < 0) {
    throw new Error(`componentPremium: incomeRate must be a finite number >= 0, got ${rate.incomeRate}`);
  }
  if (!Number.isFinite(rate.perCapita) || rate.perCapita < 0) {
    throw new Error(`componentPremium: perCapita must be a finite number >= 0, got ${rate.perCapita}`);
  }
  const perHousehold = rate.perHousehold ?? 0;
  if (!Number.isFinite(perHousehold) || perHousehold < 0) {
    throw new Error(`componentPremium: perHousehold must be a finite number >= 0, got ${perHousehold}`);
  }
  if (!Number.isFinite(cap) || cap < 0) {
    throw new Error(`componentPremium: cap must be a finite number >= 0, got ${cap}`);
  }
  const incomeLevy = base * rate.incomeRate;
  const perCapitaLevy = rate.perCapita * members;
  const total = incomeLevy + perCapitaLevy + perHousehold;
  const capped = Math.min(total, cap);
  // 100 円未満を切り捨てる (自治体の調定額の端数処理に倣う)。
  return Math.floor(capped / 100) * 100;
}

/** `nationalHealthInsurance` の入力。 */
export interface NationalHealthInsuranceInput {
  /** 総所得金額等 (世帯の国保加入者合計、円)。負・非有限は throw。 */
  readonly totalIncome: number;
  /** 国保加入者数 (均等割の人数。1 以上の整数)。 */
  readonly members: number;
  /** 40〜64 歳 (介護分を賦課する) か。省略時 false (介護分 0)。 */
  readonly age40to64?: boolean;
  /** 料率設定。省略時 `DEFAULT_NHI_RATES`。 */
  readonly rates?: NhiRates;
}

/** 国民健康保険料の内訳 (円/年)。 */
export interface NationalHealthInsuranceBreakdown {
  /** 医療分 (基礎賦課額)。 */
  readonly medical: number;
  /** 後期高齢者支援金分。 */
  readonly support: number;
  /** 介護分 (age40to64=false のときは 0)。 */
  readonly care: number;
  /** 3 区分の合計 (年額)。 */
  readonly total: number;
}

/**
 * 国民健康保険料 (年額) を 3 区分で概算し、内訳と合計を返す。
 *
 * 医療分・後期高齢者支援金分は常に賦課し、介護分は `age40to64=true` のときのみ
 * 賦課する (40 歳未満・65 歳以上は介護分 0)。各区分は賦課基準額に所得割率を
 * 乗じた所得割 + 均等割 + 平等割を賦課限度額で頭打ちして算定する。
 *
 * **重要 — これは概算であり税務助言ではありません。** 料率・均等割額・平等割額・
 * 賦課限度額・軽減 (7/5/2割) は市区町村ごとに異なり毎年改定されます。正確な額は
 * 市区町村に確認してください。低所得世帯の軽減・旧被扶養者減免・産前産後減免
 * 等は本モジュールでは扱いません。
 *
 * @param input 総所得金額等・加入者数・年齢区分・料率。
 */
export function nationalHealthInsurance(
  input: NationalHealthInsuranceInput,
): NationalHealthInsuranceBreakdown {
  const { totalIncome, members, age40to64 = false, rates = DEFAULT_NHI_RATES } = input;
  // assessmentBase が totalIncome の負/非有限を throw する。members の検証
  // (整数・1 以上) は最初に呼ぶ componentPremium が行う (重複ガードを置かない)。
  const base = assessmentBase(totalIncome);
  const medical = componentPremium({ base, members, rate: rates.medical, cap: MEDICAL_CAP });
  const support = componentPremium({ base, members, rate: rates.support, cap: SUPPORT_CAP });
  const care = age40to64
    ? componentPremium({ base, members, rate: rates.care, cap: CARE_CAP })
    : 0;
  return { medical, support, care, total: yen(medical + support + care) };
}
