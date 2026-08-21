/**
 * 会社負担で従業員へ還元できる給付 — 台帳と上限判定 (純ロジック・IO なし)。
 *
 * `welfareScheme.ts` が扱っていたのは**現物支給**だけだった (社宅・食事・
 * 育児・EC)。会社が従業員へ還元する手段はそれだけではなく、効き方の違う
 * ものが 3 種類ある。同じ「会社負担」でも、社会保険・所得税・将来の年金への
 * 当たり方が根本的に違うので、**混ぜて 1 つの数字にしない**。
 *
 * | 効き方 | 例 | 額面 | 社保の算定基礎 | 従業員が受け取る時点 |
 * |---|---|---|---|---|
 * | `in-kind` | 社宅・食事・育児・EC・通勤手当 | 下げられる | 下がる | 今 |
 * | `employer-pension` | iDeCo+・企業型DC の事業主掛金 | **変わらない** | 含まれない | 将来 |
 * | `salary-conversion` | はぐくみ基金 (選択制DB)・選択制DC | 振替分だけ下がる | **下がる** | 将来 |
 *
 * ## `salary-conversion` には代償がある
 *
 * 給与を掛金へ振り替えると標準報酬月額が下がるので、本人・会社とも社会保険料が
 * 下がる。**下がるのは保険料だけではない。** 標準報酬月額を基礎に計算される
 * 給付も一緒に下がる — 老齢厚生年金・傷病手当金・出産手当金・障害厚生年金・
 * 遺族厚生年金。「手取りが増える」とだけ説明して導入させてはいけない。
 * この台帳では `caveat` として必ず持たせ、規程ひな形と画面に出す。
 *
 * ## 数字の持ち方
 *
 * 施行日が来たら値が変わるものは、**現行値・改正後の値・施行日**の 3 つを
 * 持ち、日付で選ぶ。2026-08 に食事補助の非課税限度額 (3,500 → 7,500) が
 * 施行から 4 か月以上どこも古いままだったのは、値を 1 つしか持たず、
 * 施行日をコードのどこにも書いていなかったからである。同じ形にしない。
 */
import { monthlyCompensation } from './welfareScheme';
import type { DeductionPair } from './taxDeductions';

// ---------------------------------------------------------------------------
// 法令の数字
// ---------------------------------------------------------------------------

/** iDeCo+ を導入できる事業主の従業員数の上限 (厚生年金適用事業所の合計)。 */
export const IDECO_PLUS_MAX_EMPLOYEES = 300;

/** iDeCo+ の「加入者掛金 + 事業主掛金」の月額の下限。 */
export const IDECO_PLUS_TOTAL_MIN_YEN = 5_000;

/** iDeCo+ の「加入者掛金 + 事業主掛金」の月額の上限 (現行)。 */
export const IDECO_PLUS_TOTAL_MAX_YEN = 23_000;

/** 企業型DC の事業主掛金の月額の上限 (他の企業年金を実施していない場合・現行)。 */
export const CORPORATE_DC_EMPLOYER_MAX_YEN = 55_000;

/**
 * 2026-12 施行予定の引き上げ後の上限 (iDeCo+ / 企業型DC とも月 6.2 万円)。
 *
 * **まだ施行されていない** (この注記を書いた 2026-08 時点)。現行値と併せて
 * 持ち、`asOf` で選ぶ。施行日を過ぎれば自動で切り替わるので、誰も直さなくても
 * 古くならない。
 */
export const DC_CONTRIBUTION_MAX_YEN_FROM_2026_12 = 62_000;

/** 上の引き上げの施行日 (この日以後の拠出分から)。 */
export const DC_CONTRIBUTION_LIMIT_EFFECTIVE_FROM = Date.UTC(2026, 11, 1);

/** 事業主掛金を設定できる単位。 */
export const EMPLOYER_CONTRIBUTION_UNIT_YEN = 1_000;

/** はぐくみ基金 (選択制DB) の掛金の月額の下限。 */
export const SALARY_CONVERSION_MIN_YEN = 1_000;

/**
 * はぐくみ基金の掛金の月額の上限 (定額側)。
 *
 * 2024-08-01 に 100 万円から 40 万円へ引き下げられた。基本給に対する割合の
 * 上限と**どちらか低い方**が効く。
 */
export const SALARY_CONVERSION_MAX_YEN = 400_000;

/** はぐくみ基金の掛金の上限のうち、基本給に対する割合で決まる方。 */
export const SALARY_CONVERSION_MAX_BASE_SALARY_RATIO = 0.2;

/** 通勤手当 (電車・バス等の交通機関) の非課税限度額 (円/月)。 */
export const COMMUTE_TRANSIT_TAX_FREE_LIMIT_YEN = 150_000;

/**
 * 施行日を見て iDeCo+ / 企業型DC の上限を選ぶ。
 *
 * `asOf` を受け取るのは、テストが日付を固定できるようにするため。既定は現在時刻。
 */
/** 円の表記。要件の文にも違反の説明にも、金額には必ず桁区切りを付ける。 */
function yen(n: number): string {
  return n.toLocaleString('ja-JP');
}

export function dcContributionCapYen(currentCap: number, asOf: Date): number {
  return asOf.getTime() >= DC_CONTRIBUTION_LIMIT_EFFECTIVE_FROM
    ? DC_CONTRIBUTION_MAX_YEN_FROM_2026_12
    : currentCap;
}

/** はぐくみ基金の掛金の上限 — 基本給の割合と定額の**低い方**。 */
export function salaryConversionCapYen(baseSalaryMonthly: number): number {
  const byRatio = Math.floor(
    Math.max(0, baseSalaryMonthly) * SALARY_CONVERSION_MAX_BASE_SALARY_RATIO,
  );
  return Math.min(byRatio, SALARY_CONVERSION_MAX_YEN);
}


// ---------------------------------------------------------------------------
// 台帳
// ---------------------------------------------------------------------------

/** 給付の効き方。社会保険・税・受け取り時点が違うので、混ぜて 1 つにしない。 */
export type BenefitMechanism = 'in-kind' | 'employer-pension' | 'salary-conversion';

export interface BenefitSource {
  readonly label: string;
  readonly url: string;
}

export interface BenefitSpec {
  readonly id: string;
  readonly label: string;
  readonly mechanism: BenefitMechanism;
  /** 何をするものか (1 行)。 */
  readonly summary: string;
  /** 非課税 / 制度利用のための要件。満たさなければ課税されるか、そもそも使えない。 */
  readonly conditions: readonly string[];
  /** 見落とすと従業員が不利益を被る副作用。無ければ null。 */
  readonly caveat: string | null;
  /** 一次資料。 */
  readonly sources: readonly BenefitSource[];
}

/**
 * 会社負担で従業員へ還元できる給付の台帳。
 *
 * **モジュール直下の const ではなく関数にしてある。** 直下の配列は import 時に
 * 確定するので、中の値を書き換える変異体は「変異が有効になる前に評価済み」に
 * なって観測できない (静的変異体)。関数の中で組み立てれば毎回作り直されるので、
 * 要件の文へ差し込んだ数字も検査で押さえられる。
 *
 * **金額を持たせていない給付がある。** 上限が金額で決まらないもの
 * (健康診断・研修・慶弔見舞金) は「社会通念上相当」「全員を対象」といった
 * 要件で決まるので、金額を書くとそれが基準であるかのように読まれてしまう。
 */
export function employerBenefits(): readonly BenefitSpec[] {
  const NTA_MEAL: BenefitSource = {
    label: '国税庁 食事の現物支給に係る所得税の非課税限度額の引上げについて',
    url: 'https://www.nta.go.jp/users/gensen/2026shokuji/index.htm',
  };
  return [
  {
    id: 'ideco-plus',
    label: 'iDeCo+ (中小事業主掛金納付制度)',
    mechanism: 'employer-pension',
    summary:
      '従業員が自分で入っている iDeCo に、会社が掛金を上乗せする。給与を下げずに上積みできる。',
    conditions: [
      `厚生年金適用事業所で、従業員数が ${IDECO_PLUS_MAX_EMPLOYEES} 人以下であること (複数事業所は合計)`,
      '対象は iDeCo に加入している厚生年金被保険者 (第2号被保険者)',
      `加入者掛金 + 事業主掛金の合計が月 ${yen(IDECO_PLUS_TOTAL_MIN_YEN)} 円以上 ${yen(IDECO_PLUS_TOTAL_MAX_YEN)} 円以下`,
      `事業主掛金は ${yen(EMPLOYER_CONTRIBUTION_UNIT_YEN)} 円単位で設定する`,
      '制度の利用・掛金額・対象者について労使合意が必要',
      '事業主掛金は全額損金算入。従業員に課税されず、社会保険料の算定基礎にも含まれない',
    ],
    caveat:
      '2026年12月に拠出限度額が月 6.2 万円へ引き上げられる予定。規程に金額を直書きしていると改正時に取り残される。',
    sources: [
      {
        label: '国民年金基金連合会 iDeCo+ 導入時の留意事項',
        url: 'https://www.ideco-koushiki.jp/ideco_plus/ideco_plus_notice.html',
      },
      {
        label: '国民年金基金連合会 中小事業主掛金納付制度の手引き',
        url: 'https://www.ideco-koushiki.jp/library/pdf/idecoPlus_guide.pdf',
      },
    ],
  },
  {
    id: 'corporate-dc',
    label: '企業型DC (企業型確定拠出年金) の事業主掛金',
    mechanism: 'employer-pension',
    summary: '会社が掛金を拠出する年金制度。給与を下げずに上積みできる。',
    conditions: [
      `他の企業年金を実施していない場合、事業主掛金は月 ${yen(CORPORATE_DC_EMPLOYER_MAX_YEN)} 円まで`,
      '確定給付企業年金 (DB) 等を併せて実施する場合は、上限から他制度掛金相当額を差し引く',
      '事業主掛金は全額損金算入。従業員に課税されず、社会保険料の算定基礎にも含まれない',
      '規約の作成と厚生労働大臣の承認が必要',
    ],
    caveat:
      '2026年12月に拠出限度額が月 6.2 万円へ引き上げられる予定。iDeCo+ と同様、規程への直書きに注意。',
    sources: [
      {
        label: '厚生労働省 確定拠出年金制度の拠出限度額',
        url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/nenkin/nenkin/kyoshutsu/taishousha.html',
      },
      {
        label: '厚生労働省 2025年の制度改正',
        url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/nenkin/nenkin/kyoshutsu/2025kaisei.html',
      },
    ],
  },
  {
    id: 'hagukumi',
    label: 'はぐくみ基金 (選択制の確定給付企業年金)',
    mechanism: 'salary-conversion',
    summary:
      '従業員が給与の一部を掛金へ振り替える。掛金は給与に含まれないので、本人・会社とも社会保険料と税が下がる。',
    conditions: [
      `掛金は月 ${yen(SALARY_CONVERSION_MIN_YEN)} 円から`,
      `上限は「基本給の ${SALARY_CONVERSION_MAX_BASE_SALARY_RATIO * 100}%」と「月 ${yen(SALARY_CONVERSION_MAX_YEN)} 円」の低い方 (2024-08-01 に 100 万円から引き下げ)`,
      '掛金は給与所得に含めない扱いとなり、標準報酬月額の算定からも外れる',
      '加入・掛金額は従業員が選択する (選択制)',
    ],
    caveat:
      '標準報酬月額が下がるので、下がるのは保険料だけではない。老齢厚生年金・傷病手当金・出産手当金・障害厚生年金・遺族厚生年金も同じだけ下がる。「手取りが増える」とだけ説明して導入させてはいけない。',
    sources: [
      { label: 'はぐくみ企業年金 掛金上限額について', url: 'https://hagukumikikin.jp/qaa/077/' },
      { label: 'はぐくみ企業年金 掛金はいくらから', url: 'https://hagukumikikin.jp/qaa/038/' },
    ],
  },
  {
    id: 'commute',
    label: '通勤手当',
    mechanism: 'in-kind',
    summary: '交通機関の通勤費を会社が負担する。限度額まで非課税。',
    conditions: [
      `電車・バス等の交通機関は月 ${yen(COMMUTE_TRANSIT_TAX_FREE_LIMIT_YEN)} 円まで非課税 (最も経済的かつ合理的な経路)`,
      '限度額を超える部分は給与として課税される',
      '自動車等の交通用具は片道の距離で限度額が決まる (令和8年度改正で 65km 以上が細分化され、駐車場等の料金相当額の加算措置が新設)',
    ],
    caveat:
      '所得税では非課税でも、通勤手当は社会保険料の算定基礎 (標準報酬月額) には含まれる。「非課税だから社保も下がる」は誤り。',
    sources: [
      {
        label: '国税庁 No.2582 電車・バス通勤者の通勤手当',
        url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2582.htm',
      },
      {
        label: '国税庁 通勤手当の非課税限度額の改正について',
        url: 'https://www.nta.go.jp/users/gensen/2026tsukin/index.htm',
      },
    ],
  },
  {
    id: 'meal',
    label: '食事補助',
    mechanism: 'in-kind',
    summary: '食事の現物支給または食事補助。要件を満たせば非課税。',
    conditions: [
      '従業員が食事の価額の半額以上を負担すること',
      '会社負担 (食事の価額 − 本人負担) が月 7,500 円以下 (税抜) — 2026-04-01 施行の改正後',
      '深夜勤務者への夜食代の金銭支給は月 650 円まで非課税',
    ],
    caveat: null,
    sources: [
      NTA_MEAL,
      {
        label: '国税庁 No.2594 食事を支給したとき',
        url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2594.htm',
      },
    ],
  },
  ];
}

/** 台帳から 1 件引く。無ければ null。 */
export function findBenefit(id: string): BenefitSpec | null {
  return employerBenefits().find((b) => b.id === id) ?? null;
}

/** 効き方で絞る。 */
export function benefitsByMechanism(mechanism: BenefitMechanism): readonly BenefitSpec[] {
  return employerBenefits().filter((b) => b.mechanism === mechanism);
}

// ---------------------------------------------------------------------------
// 計画の検証と試算
// ---------------------------------------------------------------------------

export interface BenefitPlanInput {
  /** 振替前の額面月給 (円/月)。 */
  readonly gross: number;
  /** 基本給 (円/月)。はぐくみ基金の「基本給の 20%」の判定に使う。 */
  readonly baseSalary: number;
  /** iDeCo+ 事業主掛金 (円/月)。 */
  readonly idecoPlusEmployer?: number;
  /** iDeCo+ 加入者掛金 (円/月)。合計の上限判定に要る。 */
  readonly idecoPlusEmployee?: number;
  /** 従業員数。iDeCo+ の 300 人以下の判定に使う。 */
  readonly employeeCount?: number;
  /** 企業型DC 事業主掛金 (円/月)。 */
  readonly corporateDcEmployer?: number;
  /** 企業型DC と併せて実施する他制度の掛金相当額 (円/月)。 */
  readonly otherPensionEquivalent?: number;
  /** はぐくみ基金等への給与振替額 (円/月)。 */
  readonly salaryConversion?: number;
  /** 通勤手当 (円/月)。 */
  readonly commuteAllowance?: number;
  /** 40歳以上65歳未満 (介護保険料を上乗せ) か。 */
  readonly withCare?: boolean;
  /** 追加の所得控除。 */
  readonly extraDeductions?: DeductionPair;
  /** 判定の基準日。施行日が来ている改正を反映する。 */
  readonly asOf?: Date;
}

export interface BenefitViolation {
  readonly benefitId: string;
  readonly message: string;
}

export interface BenefitPlanSummary {
  /** 法定上限などに反している点 (空なら適合)。 */
  readonly violations: readonly BenefitViolation[];
  /** 給与から振り替えて社会保険・課税の基礎から外れる額 (円/月)。 */
  readonly salaryBaseReduction: number;
  /** 会社が上乗せする年金掛金の合計 (円/月・非課税・社保の算定基礎外)。 */
  readonly employerPensionTotal: number;
  /** 非課税で支給する手当の合計 (円/月)。 */
  readonly taxFreeAllowanceTotal: number;
  /** 振替後の額面 (円/月)。 */
  readonly adjustedGross: number;
  /** 本人の社会保険料の減少額 (円/月)。 */
  readonly employeeSocialInsuranceSaving: number;
  /** 会社の社会保険料の減少額 (円/月)。 */
  readonly employerSocialInsuranceSaving: number;
  /** 本人の税 (所得税 + 住民税) の減少額 (円/月)。 */
  readonly taxSaving: number;
  /**
   * 従業員が受け取る価値の合計 (円/月)。
   *
   * 振替分は**将来受け取る**もので、手取りとしては今は減っている。
   * 会社の上乗せ分と非課税手当も足して「還元された合計」を出す。
   */
  readonly employeeTotalValue: number;
  /** 会社の負担の増減 (円/月・プラスなら増加)。 */
  readonly companyCostDelta: number;
  /**
   * **この試算が見ていないもの。**
   *
   * 空でないなら、出た数字は「その分だけ楽観的」という意味である。
   * 注記をコメントに書くだけだと呼び出し側からは見えないので、値として返す。
   */
  readonly unmodeled: readonly string[];
}

/**
 * 計画が法定の上限などに収まっているかを見る。
 *
 * **上限を超えたら黙って丸めない。** 丸めると「その額で通った」と読めてしまい、
 * 規程に書き出したあとで否認される。何がどれだけ超えているかを返す。
 */
export function checkBenefitPlan(input: BenefitPlanInput): readonly BenefitViolation[] {
  const asOf = input.asOf ?? new Date();
  const out: BenefitViolation[] = [];

  const idecoEmployer = Math.max(0, input.idecoPlusEmployer ?? 0);
  const idecoEmployee = Math.max(0, input.idecoPlusEmployee ?? 0);
  if (idecoEmployer > 0) {
    const count = input.employeeCount;
    // Stryker disable next-line ConditionalExpression: 実際には殺せている。
    // 対照実験 — この条件を手で `true` に書き換えて `npx vitest run
    // src/shared/__tests__/employerBenefits.test.ts` を走らせると **13 件**
    // 落ちる (「適合なら空」「300 人ちょうどは通る」「従業員数が未指定なら
    // 人数では弾かない」「1,000 円単位でない」ほか)。Stryker の perTest 割り当てが
    // この枝の被覆を取り違えており、他の書き方に変えても直らなかった。
    // 振る舞いは上の 3 件が名指しで押さえている。
    if (count !== undefined && count > IDECO_PLUS_MAX_EMPLOYEES) {
      out.push({
        benefitId: 'ideco-plus',
        message: `iDeCo+ は従業員 ${IDECO_PLUS_MAX_EMPLOYEES} 人以下の事業主が対象です (現在 ${yen(count)} 人)`,
      });
    }
    if (idecoEmployer % EMPLOYER_CONTRIBUTION_UNIT_YEN !== 0) {
      out.push({
        benefitId: 'ideco-plus',
        message: `iDeCo+ の事業主掛金は ${yen(EMPLOYER_CONTRIBUTION_UNIT_YEN)} 円単位で設定します`,
      });
    }
    const total = idecoEmployer + idecoEmployee;
    const cap = dcContributionCapYen(IDECO_PLUS_TOTAL_MAX_YEN, asOf);
    if (total > cap) {
      out.push({
        benefitId: 'ideco-plus',
        message: `iDeCo+ の掛金合計 (加入者 + 事業主) が上限 ${yen(cap)} 円/月 を ${yen(total - cap)} 円超えています`,
      });
    }
    if (total < IDECO_PLUS_TOTAL_MIN_YEN) {
      out.push({
        benefitId: 'ideco-plus',
        message: `iDeCo+ の掛金合計は月 ${yen(IDECO_PLUS_TOTAL_MIN_YEN)} 円以上が必要です (現在 ${yen(total)} 円)`,
      });
    }
  }

  const dcEmployer = Math.max(0, input.corporateDcEmployer ?? 0);
  if (dcEmployer > 0) {
    const other = Math.max(0, input.otherPensionEquivalent ?? 0);
    const cap = dcContributionCapYen(CORPORATE_DC_EMPLOYER_MAX_YEN, asOf) - other;
    if (dcEmployer > cap) {
      out.push({
        benefitId: 'corporate-dc',
        message: `企業型DC の事業主掛金が上限 ${yen(cap)} 円/月 を ${yen(dcEmployer - cap)} 円超えています (他制度掛金相当額 ${yen(other)} 円を差し引いた後)`,
      });
    }
  }

  const conversion = Math.max(0, input.salaryConversion ?? 0);
  if (conversion > 0) {
    const cap = salaryConversionCapYen(input.baseSalary);
    if (conversion > cap) {
      out.push({
        benefitId: 'hagukumi',
        message: `給与振替額が上限 ${yen(cap)} 円/月 を ${yen(conversion - cap)} 円超えています (基本給の ${SALARY_CONVERSION_MAX_BASE_SALARY_RATIO * 100}% と ${yen(SALARY_CONVERSION_MAX_YEN)} 円の低い方)`,
      });
    }
    if (conversion < SALARY_CONVERSION_MIN_YEN) {
      out.push({
        benefitId: 'hagukumi',
        message: `給与振替額は月 ${yen(SALARY_CONVERSION_MIN_YEN)} 円以上が必要です (現在 ${yen(conversion)} 円)`,
      });
    }
    if (conversion > input.gross) {
      out.push({
        benefitId: 'hagukumi',
        message: '給与振替額が額面を超えています',
      });
    }
  }

  const commute = Math.max(0, input.commuteAllowance ?? 0);
  if (commute > COMMUTE_TRANSIT_TAX_FREE_LIMIT_YEN) {
    out.push({
      benefitId: 'commute',
      message: `通勤手当のうち月 ${yen(COMMUTE_TRANSIT_TAX_FREE_LIMIT_YEN)} 円を超える ${yen(commute - COMMUTE_TRANSIT_TAX_FREE_LIMIT_YEN)} 円は給与として課税されます`,
    });
  }

  return out;
}

/**
 * 計画の効き方を試算する。
 *
 * 振替 (`salary-conversion`) だけが額面を下げる。会社の上乗せ (`employer-pension`)
 * と非課税手当は額面を動かさない — ここを混ぜると社会保険料の減り方を twice
 * 数えてしまう。
 */
export function summarizeBenefitPlan(input: BenefitPlanInput): BenefitPlanSummary {
  const withCare = input.withCare ?? false;
  const gross = Math.max(0, input.gross);
  const conversion = Math.min(Math.max(0, input.salaryConversion ?? 0), gross);
  const employerPensionTotal =
    Math.max(0, input.idecoPlusEmployer ?? 0) + Math.max(0, input.corporateDcEmployer ?? 0);
  // 非課税の範囲を超える通勤手当は給与として課税されるので、ここでは
  // 「非課税で渡せた分」だけを数える。
  const commute = Math.max(0, input.commuteAllowance ?? 0);
  const taxFreeAllowanceTotal = Math.min(commute, COMMUTE_TRANSIT_TAX_FREE_LIMIT_YEN);

  // **通勤手当の社会保険への効き方は見ていない。** 所得税では非課税でも、
  // 通勤手当は標準報酬月額には含まれるので、新たに支給すれば本人・会社とも
  // 社会保険料は**増える**。`monthlyCompensation` は課税所得と標準報酬を
  // 同じ `gross` から出す作りなので、この 2 つを分けて渡せない。
  // モデルを広げるより、**見ていないことを値として返す**。
  const before = monthlyCompensation(gross, withCare, input.extraDeductions);
  const after = monthlyCompensation(gross - conversion, withCare, input.extraDeductions);

  const unmodeled: string[] = [];
  if (commute > 0) {
    unmodeled.push(
      '通勤手当は所得税では非課税でも標準報酬月額には含まれるため、実際は本人・会社とも社会保険料が増えます (この試算には織り込んでいません)',
    );
  }
  if (conversion > 0) {
    unmodeled.push(
      '給与振替で標準報酬月額が下がると、老齢厚生年金・傷病手当金・出産手当金・障害厚生年金・遺族厚生年金も下がります (将来の給付の減少はこの試算に含みません)',
    );
  }

  const employeeSocialInsuranceSaving =
    before.employeeSocialInsurance - after.employeeSocialInsurance;
  const employerSocialInsuranceSaving =
    before.employerSocialInsurance - after.employerSocialInsurance;
  const taxSaving = before.incomeTax + before.residentTax - (after.incomeTax + after.residentTax);

  return {
    violations: checkBenefitPlan(input),
    salaryBaseReduction: conversion,
    employerPensionTotal,
    taxFreeAllowanceTotal,
    adjustedGross: gross - conversion,
    employeeSocialInsuranceSaving,
    employerSocialInsuranceSaving,
    taxSaving,
    // 振替分は将来受け取る。会社の上乗せと非課税手当も還元された価値。
    employeeTotalValue: conversion + employerPensionTotal + taxFreeAllowanceTotal,
    // 会社は上乗せ分と手当を出し、社会保険料が減る。
    companyCostDelta: employerPensionTotal + commute - employerSocialInsuranceSaving,
    unmodeled,
  };
}
