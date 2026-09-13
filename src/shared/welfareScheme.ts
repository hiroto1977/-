import {
  calcSalaryIncomeDeduction,
  calcBasicDeduction,
  calcResidentBasicDeduction,
  calcIncomeTax,
  calcResidentTax,
} from './taxCalc';
import {
  calcMonthlySocialInsurance,
  EMPLOYMENT_INSURANCE_RATE_EMPLOYER,
  WORKERS_ACCIDENT_RATE,
} from './payroll';
import {
  calcDependentDeduction,
  calcSpouseDeduction,
  type DependentKind,
  type DeductionPair,
} from './taxDeductions';

/**
 * 給与デザイン / 福利厚生スキーム試算 (純ロジック・IO なし・概算)。
 *
 * 「生活費を払った後に手元へ残る自由なお金 (= 手元残り)」を**同額**に保ったまま、
 *   ① 通常給与 (従業員が家賃・育児・食事・EC を自分で支払う)
 *   ② 福利厚生スキーム (社宅・食事補助・育児補助・EC カフェテリアポイントを
 *      会社が非課税で現物支給し、基本給を下げる)
 * を比較する。額面を下げることで本人・会社双方の社会保険料と税が下がり、
 * 従業員は同じ手元残り + 現物価値、会社は総コスト減という構図を数値化する。
 *
 * **重要 (コンプライアンス):**
 * - EC は「会社から毎月の非課税ポイントを支給するカフェテリアプラン」として扱う
 *   (現金値引きの強制ではない)。社宅・食事補助・育児補助も現物/役務の非課税枠を前提。
 * - 本モジュールは**概算**であり税務助言ではない。実際の標準報酬等級・自治体料率・
 *   非課税要件 (食事は本人半額負担かつ会社負担が `MEAL_SUBSIDY_TAX_FREE_LIMIT_YEN`
 *   以下 等) の充足は要確認。
 *
 * 税・社保は既存の純モジュール (taxCalc / payroll) を合成。扶養なし・基礎控除のみの
 * 簡略モデル (所得税は年税額の月割、住民税は同課税所得 × 10% の概算)。
 */

/**
 * 食事の現物支給の所得税 非課税限度額 (円/月・消費税抜き)。
 *
 * **2026-04-01 施行の改正で 3,500 円 → 7,500 円**。42 年ぶりの引き上げで、
 * 令和8年3月31日付の法令解釈通達により所得税基本通達 36-38の2 が改正された。
 * 令和8年4月1日以後に支給する食事に適用される。
 *
 * 非課税の要件は**2 つとも**満たす必要がある (割合の要件は改正されていない):
 *
 * 1. 従業員から徴収する対価が食事の価額の **50% 以上**
 * 2. 食事の価額から対価を引いた残額 (= 会社負担) が **月 7,500 円以下**
 *
 * 出典: 国税庁「食事の現物支給に係る所得税の非課税限度額の引上げについて」
 * https://www.nta.go.jp/users/gensen/2026shokuji/index.htm
 * 国税庁 タックスアンサー No.2594「食事を支給したとき」
 * https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2594.htm
 *
 * ## なぜ定数にしたか
 *
 * この数字は 2026-08-21 まで**出典もゲートも無いまま 4 箇所に地の文で
 * 書かれていた** (規程ひな形・本モジュールの注記・画面の免責文・その検査)。
 * 改正から 4 か月以上、どこも古いままだった。しかも画面の会社負担の既定値は
 * 7,500 円で、**免責文が掲げる 3,500 円の上限を自分で超えていた**。
 * 1 か所に寄せて、施行日と出典を数字のとなりに置く。
 */
export const MEAL_SUBSIDY_TAX_FREE_LIMIT_YEN = 7_500;

/** 上と同じ改正で 300 円 → 650 円 になった、深夜勤務者の夜食代の金銭支給の非課税限度額。 */
export const NIGHT_MEAL_CASH_TAX_FREE_LIMIT_YEN = 650;

/** 食事補助が非課税となるための本人負担の割合 (改正されていない)。 */
export const MEAL_SUBSIDY_SELF_PAY_RATIO = 0.5;

const floorYen = (n: number) => Math.floor(n);

/**
 * 配偶者控除 + 配偶者特別控除を求める。
 *
 * ## 循環をどこで切るか
 *
 * この控除は**本人の合計所得**で段階的に減る (900 / 950 / 1,000 万円)。
 * ところが本モジュールは「手元残りが目標額になる額面」を逆算する作りなので、
 * 額面は控除に依存し、控除は額面に依存する。素直に書くと循環する。
 *
 * 一度だけ**控除なしで額面を解いて**、その額面で段階を決める。二巡目は
 * 回さない — 配偶者控除は最大 38 万円 (年) で、それが額面を動かす幅は
 * 段階の境目 (900 / 950 / 1,000 万円) をまたぐには小さすぎる。
 *
 * 両シナリオへ**同額**を適用する。スキーム側は額面が下がるので、実際の
 * 控除はこれ以上に有利になることはあっても不利にはならない (所得が下がる
 * ほど満額へ寄る)。つまりこの近似は**スキームの効果を過小に見せる方向**に
 * 倒れており、良く見せる方向には倒れない。
 */
function calcSpouseDeductionFor(input: WelfareSchemeInput, withCare: boolean): DeductionPair {
  // 未指定は「配偶者なし」。所得 0 の配偶者が居る場合と取り違えない。
  if (input.spouseIncome === undefined) return ZERO_DEDUCTION;
  const livingCost = input.rentTotal + input.childcare + input.mealTotal + input.ecPoints;
  const taxYear = input.taxYear ?? new Date().getFullYear();
  const provisionalGross = solveGrossForTakeHome(
    input.targetFreeCash + livingCost,
    withCare,
    ZERO_DEDUCTION,
    taxYear,
  );
  const annualGross = provisionalGross * 12;
  const selfIncome = Math.max(0, annualGross - calcSalaryIncomeDeduction(annualGross, taxYear));
  return calcSpouseDeduction(
    selfIncome,
    Math.max(0, input.spouseIncome),
    input.spouseElderly ?? false,
    taxYear,
  );
}

/** 追加の所得控除 (扶養控除・青色申告特別控除 等) のゼロ値。 */
const ZERO_DEDUCTION: DeductionPair = { incomeTax: 0, residentTax: 0 };

export interface MonthlyCompensation {
  /** 額面月給 (円/月)。 */
  readonly gross: number;
  /** 社会保険料 本人負担 (円/月)。 */
  readonly employeeSocialInsurance: number;
  /** 所得税 概算 (円/月)。 */
  readonly incomeTax: number;
  /** 住民税 概算 (円/月)。 */
  readonly residentTax: number;
  /** 手取り (= 額面 − 社保 − 所得税 − 住民税)。 */
  readonly takeHome: number;
  /** 会社負担の社会保険料 (法定福利費, 円/月)。 */
  readonly employerSocialInsurance: number;
}

/**
 * 額面月給から本人手取りと会社負担社保を概算する (基礎控除 + 任意の追加所得控除)。
 * 0 / 負の額面は全 0。
 *
 * `extraDeductions` には扶養控除・青色申告特別控除など、基礎控除・社会保険料控除
 * 以外の所得控除を所得税分 / 住民税分に分けて渡す (省略時は 0)。所得税と住民税で
 * 控除額が異なる扶養控除に対応するため `DeductionPair` で受ける。
 */
export function monthlyCompensation(
  grossMonthly: number,
  withCare = false,
  extraDeductions: DeductionPair = ZERO_DEDUCTION,
  taxYear = new Date().getFullYear(),
): MonthlyCompensation {
  const gross = Math.max(0, grossMonthly);
  if (gross === 0) {
    return {
      gross: 0,
      employeeSocialInsurance: 0,
      incomeTax: 0,
      residentTax: 0,
      takeHome: 0,
      employerSocialInsurance: 0,
    };
  }
  const si = calcMonthlySocialInsurance(gross, withCare);
  const annualGross = gross * 12;
  const annualSI = si.total * 12;
  const employmentIncome = Math.max(0, annualGross - calcSalaryIncomeDeduction(annualGross, taxYear));
  const basic = calcBasicDeduction(employmentIncome, taxYear);
  const residentBasic = calcResidentBasicDeduction(employmentIncome);
  const taxable = Math.max(0, employmentIncome - annualSI - basic - extraDeductions.incomeTax);
  // 住民税の課税所得は基礎控除が所得税と異なる (43万 / 所得税は48万) ため別計算。
  const residentTaxable = Math.max(
    0,
    employmentIncome - annualSI - residentBasic - extraDeductions.residentTax,
  );
  const incomeTax = floorYen(calcIncomeTax(taxable) / 12);
  const residentTax = floorYen(calcResidentTax(residentTaxable) / 12);
  const takeHome = gross - si.total - incomeTax - residentTax;
  // 会社負担社保: 厚年・健保 (介護含む) は労使折半で本人と同額、雇用保険は事業主料率、
  // 労災は事業主全額。
  const employerSocialInsurance =
    si.pension +
    si.health +
    floorYen(gross * EMPLOYMENT_INSURANCE_RATE_EMPLOYER) +
    floorYen(gross * WORKERS_ACCIDENT_RATE);
  return {
    gross,
    employeeSocialInsurance: si.total,
    incomeTax,
    residentTax,
    takeHome,
    employerSocialInsurance,
  };
}

/**
 * 二分探索の額面上限 (円/月)。**法定値ではなくモデルの探索境界**なので
 * `parameters.ts` の台帳には載せない (CLAUDE.md: 安全上限は台帳に載せない)。
 *
 * この上限で表せる**最大の手取りは定数ではない** —— 実測 (2026 年分):
 * 介護保険なし ¥1,724,127 / 介護保険あり ¥1,718,588 / 大きな追加控除つき
 * ¥1,927,627。だから「届いたか」を手取りのしきい値で判定してはならない。
 */
const GROSS_SEARCH_CEILING_YEN = 3_000_000;

/** 逆算 ({@link solveGrossForTakeHomeChecked}) の結果。**届いたかを値と一緒に運ぶ。** */
export interface GrossForTakeHome {
  /** 解いた額面月給 (円/月)。届かない場合は探索上限そのもの。 */
  readonly gross: number;
  /** その額面で実際に得られる手取り (円/月)。 */
  readonly takeHome: number;
  /**
   * 目標手取りに**届いたか**。`false` = 探索上限に張り付いた
   * (= この簡略モデルでは表現できない高さ)。`gross` は上限のままなので、
   * **呼び出し側は false のとき「その額面なら目標が出る」と言ってはいけない。**
   */
  readonly reached: boolean;
}

/**
 * 目標手取りに一致する額面月給を二分探索で求め、**届いたかどうかも返す**。1 円単位。
 *
 * ## 単調増加は「おおむね」でしかない (2026-09-09 実測)
 *
 * 手取りは額面に対しおおむね増えるが、**厳密には単調ではない** —— 額面を 1 円
 * 上げると手取りが下がる点が 33,322 か所在り、最大の下がりは **¥6,695**
 * (額面 ¥2,245,834 · 介護保険あり/なしとも同じ位置)。等級表や控除の段差が
 * 原因で、なぜそこで段が立つかは別途の宿題 (`docs/REMAINING_WORK.md`)。
 *
 * だから二分探索は「解が在るのに見つけ損なう」ことがありうる。**その取りこぼしは
 * `reached` が拾う** —— 解いた額面を検算するので、見つけ損なえば false になり、
 * 誤った額面を「解けた」として返すことはない。しきい値で判定していたらここも
 * 間違えていた: 介護保険つきで届く最大の目標は ¥1,718,608 で、上限額面
 * (¥3,000,000) が出す手取り ¥1,718,588 より **¥20 高い** (段差の谷で
 * 上限より低い額面のほうが手取りが多い)。
 *
 * ## なぜ「届いたか」を返すのか (2026-09-09 · パス 103 の実測)
 *
 * 2026-09-09 まで、この関数は目標が高すぎて解が無いときも**探索上限をそのまま
 * 返していた**。関数自身の注記は「到達不能な高額もカンスト上限で打ち切る」と
 * 書いてあったが、返り値は `number` 1 本で、打ち切ったことを呼び出し側が
 * 知る術が無かった。下流の 4 面が**打ち切りは起きない前提**で書かれていた:
 *
 * | 面 | 目標 | 刷っていた物 |
 * | --- | ---: | --- |
 * | チャット「手取り180万に必要な額面は？」 | ¥1,800,000 | 文は「額面 ¥3,000,000 です」・**同じ答えの内訳は「手取り ¥1,724,127」** |
 * | 福利厚生カード (実質価値の差) | ¥1,600,000 | 通常側だけが飽和し、差が ¥170,000 → **¥325,873** (1.92 倍) |
 * | 従業員向け説明資料 (基本給引き下げの根拠) | ¥1,600,000 | 「手元残りは **同じ ¥1,600,000** をキープします」・2 行上の表は ¥1,444,127 と ¥1,600,000 |
 * | {@link WelfareScenario.freeCash} の型注記 | — | 「両シナリオで targetFreeCash に一致」 |
 *
 * **規準は同じリポジトリの手の届く所に在った** —— `realEstateMetrics.ts` の
 * `calcIrr` は同じ二分法で「区間端で符号が同じ (= 解が範囲外) なら **null**」を
 * 返す。同じアルゴリズムに正反対の方針が 2 つ在った。
 *
 * ## 判定は上限を写さず、モデルに問い直す
 *
 * 解いた額面が**本当に目標手取りを出すか**を同じ `monthlyCompensation` に
 * 訊く。上限で表せる最大手取りは介護保険や追加控除で動く定数ではないので
 * ({@link GROSS_SEARCH_CEILING_YEN} の注記)、しきい値を写す形は 3 方向に間違う。
 *
 * 実測で残差は収束帯で**ちょうど 0**: 目標 1〜1,700,000 を 997 円刻みで
 * 1,706 点 (介護保険あり/なし) すべて残差 0、届かない最初の点 (¥1,724,128) で
 * −1。境目で誤って断ることも、1 円越えを見逃すことも無い。
 */
export function solveGrossForTakeHomeChecked(
  targetTakeHome: number,
  withCare = false,
  extraDeductions: DeductionPair = ZERO_DEDUCTION,
  taxYear = new Date().getFullYear(),
): GrossForTakeHome {
  let gross = 0;
  if (targetTakeHome > 0) {
    let lo = 0;
    let hi = GROSS_SEARCH_CEILING_YEN;
    // 50 回で 3,000,000 / 2^50 ≈ 1 円未満に収束。反復回数の境界 (i<50→i<=50) は
    // 1 回多いだけで Math.round 後の結果が変わらず等価変異。
    // Stryker disable next-line EqualityOperator
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      // 厳密一致 (< → <=) は連続値では測度0で到達せず結果不変の等価変異。
      // Stryker disable next-line EqualityOperator
      if (monthlyCompensation(mid, withCare, extraDeductions, taxYear).takeHome < targetTakeHome) lo = mid;
      else hi = mid;
    }
    gross = Math.round(hi);
  }
  // 目標 0 以下は額面 0 (= 手取り 0) で足りる。上の枝と同じ規則で判定するので
  // ここに「届いた」を書かない —— 規則が 1 つなら 2 か所が食い違えない。
  const takeHome = monthlyCompensation(gross, withCare, extraDeductions, taxYear).takeHome;
  // 画面と書面は丸めた円で刷るので、判定も丸めた円で行う (刷る値と同じ粒度)。
  return { gross, takeHome, reached: Math.round(takeHome) >= Math.round(targetTakeHome) };
}

/**
 * 目標手取りに一致する額面月給を二分探索で求める (手取りは額面に対し単調増加)。
 * 1 円単位。
 *
 * **到達不能かどうかを知りたいなら {@link solveGrossForTakeHomeChecked} を使う。**
 * こちらは額面だけを返すので、目標が高すぎたときは探索上限がそのまま返り、
 * 「その額面なら目標が出る」は成り立たない。
 */
export function solveGrossForTakeHome(
  targetTakeHome: number,
  withCare = false,
  extraDeductions: DeductionPair = ZERO_DEDUCTION,
  taxYear = new Date().getFullYear(),
): number {
  return solveGrossForTakeHomeChecked(targetTakeHome, withCare, extraDeductions, taxYear).gross;
}

export interface WelfareSchemeInput {
  /** 目標の「手元残り」(生活費支払後に自由に使える額, 円/月)。 */
  readonly targetFreeCash: number;
  /** 家賃 総額 (円/月)。 */
  readonly rentTotal: number;
  /** 社宅: 会社が直接負担する家賃 (非課税, 円/月)。残りは本人天引き。 */
  readonly rentCompanyShare: number;
  /** 食事 総額 (円/月)。 */
  readonly mealTotal: number;
  /** 食事補助: 会社負担分 (非課税, 円/月)。残りは本人天引き。 */
  readonly mealCompanyShare: number;
  /** 育児補助: 会社手配 (シッター券等・非課税, 円/月)。 */
  readonly childcare: number;
  /** 自社 EC カフェテリアポイント (非課税, 円/月)。 */
  readonly ecPoints: number;
  /** 40歳以上65歳未満 (介護保険料を上乗せ) か。 */
  readonly withCare?: boolean;
  /** 扶養親族の年齢区分の配列 (扶養控除。16歳未満は控除0)。両シナリオ共通に適用。 */
  readonly dependents?: readonly DependentKind[];
  /**
   * 青色申告特別控除額 (円/年。0 / 100,000 / 550,000 / 650,000)。
   *
   * **注意:** 青色申告特別控除は本来「事業所得・不動産所得」に対する控除であり、
   * 給与所得には適用できない。本試算では「給与のほかに青色申告する事業所得があり、
   * その控除を世帯全体の課税所得から差し引ける」場合の概算として、給与の課税所得から
   * 控除する簡略モデルで扱う。給与のみの人には適用されない点に留意 (UI で明示)。
   */
  readonly blueDeduction?: number;
  /**
   * 配偶者の合計所得金額 (円/年)。指定すると配偶者控除・配偶者特別控除を
   * 両シナリオに適用する。
   *
   * **配偶者が居ないのと「所得 0 の配偶者が居る」は違う。** 前者は控除なし、
   * 後者は満額の配偶者控除になる。0 を既定値にすると「未入力」と
   * 「専業主婦・主夫」を取り違えるので、**未指定は undefined のまま**にして
   * 配偶者なしとして扱う。
   */
  readonly spouseIncome?: number;
  /** 配偶者が70歳以上 (老人控除対象配偶者) か。 */
  readonly spouseElderly?: boolean;
  /**
   * 対象の年分 (西暦)。配偶者控除の境目が年分で動くので効く。
   * 省略時は現在の年。
   */
  readonly taxYear?: number;
}

export interface WelfareScenario {
  /** 額面月給。 */
  readonly gross: number;
  /** 社会保険料 本人負担。 */
  readonly employeeSocialInsurance: number;
  /** 所得税 + 住民税 概算。 */
  readonly tax: number;
  /** 本人負担天引き (社宅・食事の自己負担分)。 */
  readonly payrollDeduction: number;
  /** 口座振込額 (= 額面 − 社保 − 税 − 天引き)。 */
  readonly netPaid: number;
  /**
   * 自由に使えるお金 (= 手元残り)。**`reachedTarget` が true のときだけ**
   * `targetFreeCash` に一致する。
   *
   * 2026-09-09 までこの注記は「両シナリオで targetFreeCash に一致」と
   * 無条件に書いてあり、書面の散文はそれを信じて「同じ ¥X をキープします」と
   * 刷っていた (パス 103)。逆算が探索上限に張り付くと一致しない。
   */
  readonly freeCash: number;
  /** 現物支給の福利厚生価値 (非課税)。 */
  readonly inKindValue: number;
  /** 従業員の実質手元残り (= freeCash + inKindValue)。 */
  readonly employeeRealValue: number;
  /** 会社の総コスト (額面 + 会社負担社保 + 会社負担福利厚生)。 */
  readonly companyTotalCost: number;
  /**
   * この筋書きが**目標手元残りに届いたか**。`false` = 逆算が探索上限に
   * 張り付いた (このモデルでは表せない高さ)。`freeCash` は目標より小さく、
   * **両筋書きの比較はもう「同じ手元残りでの比較」ではない。**
   */
  readonly reachedTarget: boolean;
}

export interface WelfareSchemeResult {
  readonly normal: WelfareScenario;
  readonly scheme: WelfareScenario;
  /** 差額 (scheme − normal)。 */
  readonly diff: {
    readonly gross: number;
    readonly employeeSocialInsurance: number;
    readonly tax: number;
    readonly employeeRealValue: number;
    readonly companyTotalCost: number;
  };
  /** 両シナリオに適用した追加所得控除の内訳 (扶養控除・青色申告特別控除)。 */
  readonly deductions: {
    /** 扶養控除 (所得税分 / 住民税分)。 */
    readonly dependent: DeductionPair;
    /** 青色申告特別控除 (所得税・住民税とも同額)。 */
    readonly blue: number;
    /** 配偶者控除 + 配偶者特別控除 (所得税分 / 住民税分)。 */
    readonly spouse: DeductionPair;
    /** 課税所得から差し引いた合計の追加所得控除 (所得税分 / 住民税分)。 */
    readonly total: DeductionPair;
  };
}

/**
 * 福利厚生スキームの設計図を算出する。
 *
 * 両シナリオとも「手元残り = targetFreeCash」になるよう額面を逆算し、
 * 社保・税・現物価値・会社総コストを比較する。
 */
export function designWelfareScheme(input: WelfareSchemeInput): WelfareSchemeResult {
  const withCare = input.withCare ?? false;
  // 年分は 1 つに揃える。配偶者控除だけ年分を見て基礎控除は今年、では
  // 「どの年分でもない」試算になる。
  const taxYear = input.taxYear ?? new Date().getFullYear();
  const rentSelf = Math.max(0, input.rentTotal - input.rentCompanyShare);
  const mealSelf = Math.max(0, input.mealTotal - input.mealCompanyShare);

  // 追加の所得控除 (両シナリオ共通): 扶養控除 (所得税/住民税で異額) + 青色申告特別控除。
  // 青色申告特別控除は所得税・住民税とも同額を課税所得から差し引く (簡略モデル)。
  const dependentDeduction = calcDependentDeduction(input.dependents ?? []);
  const blueDeduction = Math.max(0, input.blueDeduction ?? 0);
  // 配偶者控除・配偶者特別控除。**本人の合計所得で段階的に減る**控除なので、
  // 本来はシナリオごとの額面から求めるべきだが、それをすると額面の逆算の中に
  // 額面依存の控除が入って循環する。ここでは通常シナリオの額面 (年額) を
  // 基準に 1 度だけ求め、両シナリオへ同額を適用する簡略モデルにしている
  // — スキーム側は額面が下がるので、実際の控除は**これ以上に有利**になる
  // ことはあっても不利にはならない (段階は所得が下がるほど満額へ寄る)。
  const spouseDeduction = calcSpouseDeductionFor(input, withCare);
  const extraDeductions: DeductionPair = {
    incomeTax: dependentDeduction.incomeTax + blueDeduction + spouseDeduction.incomeTax,
    residentTax: dependentDeduction.residentTax + blueDeduction + spouseDeduction.residentTax,
  };

  // ① 通常: 従業員が家賃・育児・食事・EC を手取りから全額支払う。
  //    手元残り = 手取り − (家賃 + 育児 + 食事 + EC) → 目標達成に必要な手取りを逆算。
  const normalLivingCost = input.rentTotal + input.childcare + input.mealTotal + input.ecPoints;
  const normalSolved = solveGrossForTakeHomeChecked(
    input.targetFreeCash + normalLivingCost,
    withCare,
    extraDeductions,
    taxYear,
  );
  const normalComp = monthlyCompensation(normalSolved.gross, withCare, extraDeductions, taxYear);
  const normal: WelfareScenario = {
    gross: normalComp.gross,
    employeeSocialInsurance: normalComp.employeeSocialInsurance,
    tax: normalComp.incomeTax + normalComp.residentTax,
    payrollDeduction: 0,
    netPaid: normalComp.takeHome,
    freeCash: normalComp.takeHome - normalLivingCost,
    inKindValue: 0,
    employeeRealValue: normalComp.takeHome - normalLivingCost,
    companyTotalCost: normalComp.gross + normalComp.employerSocialInsurance,
    reachedTarget: normalSolved.reached,
  };

  // ② スキーム: 会社が家賃(社宅)・食事・育児・EC を非課税で現物支給し基本給を下げる。
  //    本人天引き = 社宅自己負担 + 食事自己負担。手元残り = 手取り − 天引き。
  const schemeDeduction = rentSelf + mealSelf;
  const schemeSolved = solveGrossForTakeHomeChecked(
    input.targetFreeCash + schemeDeduction,
    withCare,
    extraDeductions,
    taxYear,
  );
  const schemeComp = monthlyCompensation(schemeSolved.gross, withCare, extraDeductions, taxYear);
  const inKindValue =
    input.rentCompanyShare + input.mealCompanyShare + input.childcare + input.ecPoints;
  const schemeFreeCash = schemeComp.takeHome - schemeDeduction;
  const scheme: WelfareScenario = {
    gross: schemeComp.gross,
    employeeSocialInsurance: schemeComp.employeeSocialInsurance,
    tax: schemeComp.incomeTax + schemeComp.residentTax,
    payrollDeduction: schemeDeduction,
    netPaid: schemeComp.takeHome - schemeDeduction,
    freeCash: schemeFreeCash,
    inKindValue,
    employeeRealValue: schemeFreeCash + inKindValue,
    companyTotalCost: schemeComp.gross + schemeComp.employerSocialInsurance + inKindValue,
    reachedTarget: schemeSolved.reached,
  };

  return {
    normal,
    scheme,
    diff: {
      gross: scheme.gross - normal.gross,
      employeeSocialInsurance: scheme.employeeSocialInsurance - normal.employeeSocialInsurance,
      tax: scheme.tax - normal.tax,
      employeeRealValue: scheme.employeeRealValue - normal.employeeRealValue,
      companyTotalCost: scheme.companyTotalCost - normal.companyTotalCost,
    },
    deductions: {
      dependent: dependentDeduction,
      blue: blueDeduction,
      spouse: spouseDeduction,
      total: extraDeductions,
    },
  };
}
