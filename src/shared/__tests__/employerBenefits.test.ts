import { describe, expect, it } from 'vitest';
import {
  employerBenefits,
  benefitsByMechanism,
  checkBenefitPlan,
  dcContributionCapYen,
  findBenefit,
  salaryConversionCapYen,
  summarizeBenefitPlan,
  COMMUTE_TRANSIT_TAX_FREE_LIMIT_YEN,
  CORPORATE_DC_EMPLOYER_MAX_YEN,
  DC_CONTRIBUTION_MAX_YEN_FROM_2026_12,
  EMPLOYER_CONTRIBUTION_UNIT_YEN,
  IDECO_PLUS_MAX_EMPLOYEES,
  IDECO_PLUS_TOTAL_MAX_YEN,
  IDECO_PLUS_TOTAL_MIN_YEN,
  SALARY_CONVERSION_MAX_BASE_SALARY_RATIO,
  SALARY_CONVERSION_MAX_YEN,
  SALARY_CONVERSION_MIN_YEN,
} from '../employerBenefits';

/* 法令の数字。動いたらここが落ちる。 */
describe('法令の数字', () => {
  it('iDeCo+ の要件', () => {
    expect(IDECO_PLUS_MAX_EMPLOYEES).toBe(300);
    expect(IDECO_PLUS_TOTAL_MIN_YEN).toBe(5_000);
    expect(IDECO_PLUS_TOTAL_MAX_YEN).toBe(23_000);
    expect(EMPLOYER_CONTRIBUTION_UNIT_YEN).toBe(1_000);
  });

  it('企業型DC の事業主掛金の上限 (他制度なし)', () => {
    expect(CORPORATE_DC_EMPLOYER_MAX_YEN).toBe(55_000);
  });

  it('2026-12 施行予定の引き上げ後は iDeCo+ / 企業型DC とも 6.2 万円', () => {
    expect(DC_CONTRIBUTION_MAX_YEN_FROM_2026_12).toBe(62_000);
  });

  it('はぐくみ基金の掛金の範囲', () => {
    expect(SALARY_CONVERSION_MIN_YEN).toBe(1_000);
    // 2024-08-01 に 100 万円から引き下げ。
    expect(SALARY_CONVERSION_MAX_YEN).toBe(400_000);
    expect(SALARY_CONVERSION_MAX_YEN).not.toBe(1_000_000);
    expect(SALARY_CONVERSION_MAX_BASE_SALARY_RATIO).toBe(0.2);
  });

  it('通勤手当 (交通機関) の非課税限度額', () => {
    expect(COMMUTE_TRANSIT_TAX_FREE_LIMIT_YEN).toBe(150_000);
  });
});

describe('dcContributionCapYen — 施行日で切り替わる', () => {
  const day = (iso: string) => new Date(iso);

  it('施行前は現行値', () => {
    expect(dcContributionCapYen(IDECO_PLUS_TOTAL_MAX_YEN, day('2026-11-30T23:59:59Z'))).toBe(23_000);
    expect(dcContributionCapYen(CORPORATE_DC_EMPLOYER_MAX_YEN, day('2026-08-21T00:00:00Z'))).toBe(
      55_000,
    );
  });

  it('施行日ちょうどから引き上げ後の値 (超えて初めて、ではない)', () => {
    expect(dcContributionCapYen(IDECO_PLUS_TOTAL_MAX_YEN, day('2026-12-01T00:00:00Z'))).toBe(62_000);
    expect(dcContributionCapYen(CORPORATE_DC_EMPLOYER_MAX_YEN, day('2026-12-01T00:00:00Z'))).toBe(
      62_000,
    );
  });

  it('施行後も引き上げ後の値のまま', () => {
    expect(dcContributionCapYen(IDECO_PLUS_TOTAL_MAX_YEN, day('2030-01-01T00:00:00Z'))).toBe(62_000);
  });
});

describe('salaryConversionCapYen — 割合と定額の低い方', () => {
  it('基本給が低いうちは割合が効く', () => {
    expect(salaryConversionCapYen(300_000)).toBe(60_000); // 20%
    expect(salaryConversionCapYen(1_000_000)).toBe(200_000);
  });

  it('基本給が高いと定額 40 万円で頭打ち', () => {
    // 20% が 40 万円に達するのは基本給 200 万円。
    expect(salaryConversionCapYen(2_000_000)).toBe(400_000);
    expect(salaryConversionCapYen(5_000_000)).toBe(400_000);
  });

  it('境界: 200 万円ちょうどはどちらでも 40 万円', () => {
    expect(salaryConversionCapYen(1_999_999)).toBeLessThan(400_000);
    expect(salaryConversionCapYen(2_000_000)).toBe(400_000);
  });

  it('0 や負でも落ちない', () => {
    expect(salaryConversionCapYen(0)).toBe(0);
    expect(salaryConversionCapYen(-100)).toBe(0);
  });

  it('端数は切り捨てる (上限を 1 円でも超えさせない)', () => {
    expect(salaryConversionCapYen(100_005)).toBe(20_001); // 20,001.0 → 20,001
    expect(salaryConversionCapYen(100_004)).toBe(20_000); // 20,000.8 → 20,000
  });
});

describe('台帳', () => {
  it('効き方は 3 種類とも載っている', () => {
    expect(benefitsByMechanism('employer-pension').map((b) => b.id)).toEqual([
      'ideco-plus',
      'corporate-dc',
    ]);
    expect(benefitsByMechanism('salary-conversion').map((b) => b.id)).toEqual(['hagukumi']);
    expect(benefitsByMechanism('in-kind').map((b) => b.id)).toEqual(['commute', 'meal']);
  });

  it('全件が出典を持つ (数字を出典なしで置かない)', () => {
    for (const b of employerBenefits()) {
      expect(b.sources.length).toBeGreaterThan(0);
      for (const s of b.sources) expect(s.url).toMatch(/^https:\/\//);
      expect(b.conditions.length).toBeGreaterThan(0);
    }
  });

  it('給与振替は必ず副作用を明示する', () => {
    for (const b of benefitsByMechanism('salary-conversion')) {
      expect(b.caveat).not.toBeNull();
      // 「手取りが増える」だけの説明にしない。
      expect(b.caveat).toContain('老齢厚生年金');
      expect(b.caveat).toContain('傷病手当金');
    }
  });

  it('通勤手当は「非課税だから社保も下がる」の誤解を打ち消す', () => {
    expect(findBenefit('commute')?.caveat).toContain('標準報酬月額');
  });

  it('id で引ける / 無いものは null', () => {
    expect(findBenefit('ideco-plus')?.label).toContain('iDeCo+');
    expect(findBenefit('no-such-benefit')).toBeNull();
  });

  it('id は重複しない', () => {
    const ids = employerBenefits().map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('checkBenefitPlan — 上限を超えたら黙って丸めない', () => {
  const base = { gross: 400_000, baseSalary: 300_000, asOf: new Date('2026-08-21T00:00:00Z') };
  const ids = (v: readonly { benefitId: string }[]) => v.map((x) => x.benefitId);

  it('適合なら空', () => {
    expect(
      checkBenefitPlan({
        ...base,
        idecoPlusEmployer: 10_000,
        idecoPlusEmployee: 10_000,
        employeeCount: 20,
        corporateDcEmployer: 50_000,
        salaryConversion: 60_000,
        commuteAllowance: 20_000,
      }),
    ).toEqual([]);
  });

  it('iDeCo+: 従業員数超過', () => {
    const v = checkBenefitPlan({ ...base, idecoPlusEmployer: 5_000, employeeCount: 301 });
    expect(ids(v)).toContain('ideco-plus');
    expect(v[0]!.message).toContain('301');
  });

  it('iDeCo+: 300 人ちょうどは通る (超えて初めて)', () => {
    expect(
      checkBenefitPlan({ ...base, idecoPlusEmployer: 5_000, employeeCount: 300 }),
    ).toEqual([]);
  });

  it('iDeCo+: 従業員数が未指定なら人数では弾かない', () => {
    expect(checkBenefitPlan({ ...base, idecoPlusEmployer: 5_000 })).toEqual([]);
  });

  it('iDeCo+: 1,000 円単位でない', () => {
    const v = checkBenefitPlan({ ...base, idecoPlusEmployer: 5_500 });
    expect(v.some((x) => x.message.includes('単位'))).toBe(true);
  });

  it('iDeCo+: 合計の上限・下限', () => {
    const over = checkBenefitPlan({ ...base, idecoPlusEmployer: 20_000, idecoPlusEmployee: 5_000 });
    expect(over.some((x) => x.message.includes('2,000 円超えて'))).toBe(true);
    const under = checkBenefitPlan({ ...base, idecoPlusEmployer: 1_000 });
    expect(under.some((x) => x.message.includes('5,000 円以上'))).toBe(true);
  });

  it('iDeCo+: 施行日を過ぎれば 23,000 超も通る', () => {
    const plan = { ...base, idecoPlusEmployer: 30_000, idecoPlusEmployee: 10_000 };
    expect(checkBenefitPlan(plan).length).toBeGreaterThan(0);
    expect(checkBenefitPlan({ ...plan, asOf: new Date('2026-12-01T00:00:00Z') })).toEqual([]);
  });

  it('iDeCo+: 事業主掛金 0 なら何も見ない (導入していない)', () => {
    expect(checkBenefitPlan({ ...base, idecoPlusEmployer: 0, employeeCount: 9_999 })).toEqual([]);
  });

  it('企業型DC: 他制度掛金相当額を差し引いた後で判定する', () => {
    expect(checkBenefitPlan({ ...base, corporateDcEmployer: 55_000 })).toEqual([]);
    const v = checkBenefitPlan({
      ...base,
      corporateDcEmployer: 55_000,
      otherPensionEquivalent: 27_500,
    });
    expect(v[0]!.message).toContain('27,500');
  });

  it('はぐくみ: 上限・下限・額面超え', () => {
    expect(checkBenefitPlan({ ...base, salaryConversion: 60_000 })).toEqual([]);
    expect(
      checkBenefitPlan({ ...base, salaryConversion: 60_001 })[0]!.message,
    ).toContain('1 円超えて');
    expect(checkBenefitPlan({ ...base, salaryConversion: 999 })[0]!.message).toContain(
      '1,000 円以上',
    );
    // 上限 (基本給の20% と 40 万円の低い方 = 40 万円) には収まるが額面を超える。
    const overGross = checkBenefitPlan({
      ...base,
      gross: 300_000,
      baseSalary: 3_000_000,
      salaryConversion: 400_000,
    });
    expect(overGross.some((x) => x.message.includes('額面を超えて'))).toBe(true);
  });

  it('通勤手当: 限度額ちょうどは通り、超えたら課税されると伝える', () => {
    expect(checkBenefitPlan({ ...base, commuteAllowance: 150_000 })).toEqual([]);
    expect(checkBenefitPlan({ ...base, commuteAllowance: 150_001 })[0]!.message).toContain(
      '課税',
    );
  });

  it('金額は桁区切りで出す (規程や画面にそのまま出る)', () => {
    // 区切りが無いと 400000 が 40,000 と読み違えられる。
    const v = checkBenefitPlan({ ...base, commuteAllowance: 200_000 });
    expect(v[0]!.message).toContain('150,000');
    expect(v[0]!.message).not.toContain('150000');
  });

  it('複数の違反はすべて返す (最初の 1 件で止めない)', () => {
    const v = checkBenefitPlan({
      ...base,
      idecoPlusEmployer: 15_500,
      idecoPlusEmployee: 10_000,
      employeeCount: 400,
      corporateDcEmployer: 60_000,
      salaryConversion: 100_000,
      commuteAllowance: 160_000,
    });
    expect(new Set(ids(v))).toEqual(new Set(['ideco-plus', 'corporate-dc', 'hagukumi', 'commute']));
  });
});

describe('summarizeBenefitPlan', () => {
  const base = { gross: 400_000, baseSalary: 300_000, asOf: new Date('2026-08-21T00:00:00Z') };

  it('振替だけが額面を下げる', () => {
    const r = summarizeBenefitPlan({ ...base, salaryConversion: 30_000 });
    expect(r.adjustedGross).toBe(370_000);
    expect(r.salaryBaseReduction).toBe(30_000);
    // 会社の上乗せは額面を動かさない。
    const p = summarizeBenefitPlan({ ...base, idecoPlusEmployer: 20_000 });
    expect(p.adjustedGross).toBe(400_000);
    expect(p.salaryBaseReduction).toBe(0);
  });

  it('振替で本人・会社とも社会保険料と税が下がる', () => {
    const r = summarizeBenefitPlan({ ...base, salaryConversion: 30_000 });
    expect(r.employeeSocialInsuranceSaving).toBeGreaterThan(0);
    expect(r.employerSocialInsuranceSaving).toBeGreaterThan(0);
    expect(r.taxSaving).toBeGreaterThan(0);
  });

  it('振替が無ければ社保も税も動かない', () => {
    const r = summarizeBenefitPlan({ ...base, idecoPlusEmployer: 20_000, commuteAllowance: 10_000 });
    expect(r.employeeSocialInsuranceSaving).toBe(0);
    expect(r.employerSocialInsuranceSaving).toBe(0);
    expect(r.taxSaving).toBe(0);
  });

  it('非課税枠を超える通勤手当は「渡せた非課税分」に数えない', () => {
    const r = summarizeBenefitPlan({ ...base, commuteAllowance: 200_000 });
    expect(r.taxFreeAllowanceTotal).toBe(COMMUTE_TRANSIT_TAX_FREE_LIMIT_YEN);
    // 会社の負担は実際に払う 20 万円で数える (非課税分だけではない)。
    expect(r.companyCostDelta).toBe(200_000);
  });

  it('振替は額面で頭打ち (額面より多く振り替えない)', () => {
    const r = summarizeBenefitPlan({ ...base, baseSalary: 3_000_000, salaryConversion: 500_000 });
    expect(r.salaryBaseReduction).toBe(400_000);
    expect(r.adjustedGross).toBe(0);
  });

  it('従業員が受け取る合計は 3 種類の和', () => {
    const r = summarizeBenefitPlan({
      ...base,
      salaryConversion: 30_000,
      idecoPlusEmployer: 10_000,
      corporateDcEmployer: 5_000,
      commuteAllowance: 20_000,
    });
    expect(r.employerPensionTotal).toBe(15_000);
    expect(r.employeeTotalValue).toBe(30_000 + 15_000 + 20_000);
  });

  it('見ていないものを値として返す', () => {
    // 通勤手当は標準報酬月額に含まれるので実際は社保が増える。
    expect(summarizeBenefitPlan({ ...base, commuteAllowance: 10_000 }).unmodeled.join()).toContain(
      '標準報酬月額には含まれる',
    );
    // 振替は将来の給付を減らす。
    expect(summarizeBenefitPlan({ ...base, salaryConversion: 30_000 }).unmodeled.join()).toContain(
      '老齢厚生年金',
    );
    // 何もしていなければ空。
    expect(summarizeBenefitPlan(base).unmodeled).toEqual([]);
  });

  it('違反もそのまま含める (試算だけ返して黙らない)', () => {
    const r = summarizeBenefitPlan({ ...base, salaryConversion: 100_000 });
    expect(r.violations.length).toBeGreaterThan(0);
  });

  it('額面 0 でも落ちない', () => {
    const r = summarizeBenefitPlan({ gross: 0, baseSalary: 0, salaryConversion: 10_000 });
    expect(r.adjustedGross).toBe(0);
    expect(r.employeeSocialInsuranceSaving).toBe(0);
  });
});

/*
 * 境界と、説明文に出る計算。
 *
 * 変異検査で生き残った 14 件から起こした検査。「上限を超えたら弾く」だけを
 * 見ていて**ちょうど上限のときに通ることを誰も見ていなかった**もの、
 * 違反メッセージの中の引き算 (超過額) を誰も読んでいなかったものが中心。
 * メッセージは規程や画面にそのまま出るので、数字が間違っていれば実害になる。
 */
describe('checkBenefitPlan — 境界とメッセージの数字', () => {
  const base = { gross: 400_000, baseSalary: 300_000, asOf: new Date('2026-08-21T00:00:00Z') };

  it('iDeCo+: 合計が上限ちょうどなら通る (超えて初めて弾く)', () => {
    expect(
      checkBenefitPlan({ ...base, idecoPlusEmployer: 13_000, idecoPlusEmployee: 10_000 }),
    ).toEqual([]);
    expect(
      checkBenefitPlan({ ...base, idecoPlusEmployer: 13_000, idecoPlusEmployee: 10_001 }).length,
    ).toBe(1);
  });

  it('iDeCo+: 合計が下限ちょうどなら通る', () => {
    expect(checkBenefitPlan({ ...base, idecoPlusEmployer: 5_000 })).toEqual([]);
    expect(checkBenefitPlan({ ...base, idecoPlusEmployer: 4_000 }).length).toBe(1);
  });

  it('iDeCo+: 超過額をメッセージに正しく出す', () => {
    const v = checkBenefitPlan({ ...base, idecoPlusEmployer: 20_000, idecoPlusEmployee: 8_000 });
    // 28,000 − 23,000 = 5,000。足し算に化けると 51,000 になる。
    expect(v[0]!.message).toContain('5,000 円超えて');
    expect(v[0]!.message).not.toContain('51,000');
  });

  it('企業型DC: 掛金 0 でも他制度が上限を食い潰していれば弾かない', () => {
    // `dcEmployer > 0` を `>= 0` に取り違えると、導入していない事業主にも
    // 「上限超過」と告げることになる (cap が負になるため)。
    expect(
      checkBenefitPlan({ ...base, corporateDcEmployer: 0, otherPensionEquivalent: 60_000 }),
    ).toEqual([]);
  });

  it('企業型DC: 上限ちょうどは通り、超過額を正しく出す', () => {
    expect(checkBenefitPlan({ ...base, corporateDcEmployer: 55_000 })).toEqual([]);
    const v = checkBenefitPlan({ ...base, corporateDcEmployer: 58_000 });
    // 58,000 − 55,000 = 3,000。
    expect(v[0]!.message).toContain('3,000 円超えて');
    expect(v[0]!.message).not.toContain('113,000');
  });

  it('はぐくみ: 下限ちょうど・額面ちょうどは通る', () => {
    expect(checkBenefitPlan({ ...base, salaryConversion: 1_000 })).toEqual([]);
    // 振替額 = 額面 は「超えて」いないので通す。
    expect(
      checkBenefitPlan({ ...base, gross: 60_000, baseSalary: 300_000, salaryConversion: 60_000 }),
    ).toEqual([]);
    expect(
      checkBenefitPlan({ ...base, gross: 59_999, baseSalary: 300_000, salaryConversion: 60_000 })
        .length,
    ).toBe(1);
  });

  it('はぐくみ: 超過額と割合をメッセージに正しく出す', () => {
    const v = checkBenefitPlan({ ...base, salaryConversion: 70_000 });
    // 70,000 − 60,000 = 10,000。
    expect(v[0]!.message).toContain('10,000 円超えて');
    expect(v[0]!.message).not.toContain('130,000');
    // 割合は百分率で出す。100 で割ると 0.002% になる。
    expect(v[0]!.message).toContain('20%');
    expect(v[0]!.message).not.toContain('0.002%');
  });

  it('通勤手当: 超過額をメッセージに正しく出す', () => {
    const v = checkBenefitPlan({ ...base, commuteAllowance: 180_000 });
    // 180,000 − 150,000 = 30,000。
    expect(v[0]!.message).toContain('を超える 30,000 円');
    expect(v[0]!.message).not.toContain('330,000');
  });
});

describe('summarizeBenefitPlan — 介護保険と会社負担の符号', () => {
  const base = { gross: 400_000, baseSalary: 300_000, asOf: new Date('2026-08-21T00:00:00Z') };

  it('40歳以上 (介護保険料あり) は減る額が変わる', () => {
    const without = summarizeBenefitPlan({ ...base, salaryConversion: 30_000, withCare: false });
    const withIt = summarizeBenefitPlan({ ...base, salaryConversion: 30_000, withCare: true });
    // 介護保険料の分だけ本人・会社とも減る額が大きい。
    expect(withIt.employeeSocialInsuranceSaving).toBeGreaterThan(
      without.employeeSocialInsuranceSaving,
    );
    expect(withIt.employerSocialInsuranceSaving).toBeGreaterThan(
      without.employerSocialInsuranceSaving,
    );
  });

  it('withCare 未指定は 40歳未満と同じ', () => {
    const omitted = summarizeBenefitPlan({ ...base, salaryConversion: 30_000 });
    const explicit = summarizeBenefitPlan({ ...base, salaryConversion: 30_000, withCare: false });
    expect(omitted.employeeSocialInsuranceSaving).toBe(explicit.employeeSocialInsuranceSaving);
    // true とは違う (既定値が true に化けていない)。
    const care = summarizeBenefitPlan({ ...base, salaryConversion: 30_000, withCare: true });
    expect(omitted.employeeSocialInsuranceSaving).not.toBe(care.employeeSocialInsuranceSaving);
  });

  it('会社負担は社会保険料の減少分を差し引く (足さない)', () => {
    const r = summarizeBenefitPlan({
      ...base,
      salaryConversion: 30_000,
      idecoPlusEmployer: 10_000,
    });
    expect(r.employerSocialInsuranceSaving).toBeGreaterThan(0);
    expect(r.companyCostDelta).toBe(10_000 - r.employerSocialInsuranceSaving);
    expect(r.companyCostDelta).toBeLessThan(10_000);
  });
});

/*
 * 台帳の中身の golden。
 *
 * 要件の文は規程ひな形と画面にそのまま出る **法令の説明**なので、
 * 書き換えたら検査が落ちるようにしておく。落ちること自体が目的で、
 * 「出典を読み直して直したか」を確認する手間を強制するためのもの。
 */
describe('台帳の golden — 法令の説明は勝手に変えない', () => {
  const byId = (id: string) => {
    const b = findBenefit(id);
    expect(b).not.toBeNull();
    return b!;
  };

  it('iDeCo+', () => {
    expect(byId('ideco-plus').conditions).toEqual([
      '厚生年金適用事業所で、従業員数が 300 人以下であること (複数事業所は合計)',
      '対象は iDeCo に加入している厚生年金被保険者 (第2号被保険者)',
      '加入者掛金 + 事業主掛金の合計が月 5,000 円以上 23,000 円以下',
      '事業主掛金は 1,000 円単位で設定する',
      '制度の利用・掛金額・対象者について労使合意が必要',
      '事業主掛金は全額損金算入。従業員に課税されず、社会保険料の算定基礎にも含まれない',
    ]);
    expect(byId('ideco-plus').sources.map((s) => s.url)).toEqual([
      'https://www.ideco-koushiki.jp/ideco_plus/ideco_plus_notice.html',
      'https://www.ideco-koushiki.jp/library/pdf/idecoPlus_guide.pdf',
    ]);
  });

  it('企業型DC', () => {
    expect(byId('corporate-dc').conditions).toEqual([
      '他の企業年金を実施していない場合、事業主掛金は月 55,000 円まで',
      '確定給付企業年金 (DB) 等を併せて実施する場合は、上限から他制度掛金相当額を差し引く',
      '事業主掛金は全額損金算入。従業員に課税されず、社会保険料の算定基礎にも含まれない',
      '規約の作成と厚生労働大臣の承認が必要',
    ]);
    expect(byId('corporate-dc').sources.map((s) => s.url)).toEqual([
      'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/nenkin/nenkin/kyoshutsu/taishousha.html',
      'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/nenkin/nenkin/kyoshutsu/2025kaisei.html',
    ]);
  });

  it('はぐくみ基金 — 割合は百分率で書く', () => {
    expect(byId('hagukumi').conditions).toEqual([
      '掛金は月 1,000 円から',
      '上限は「基本給の 20%」と「月 400,000 円」の低い方 (2024-08-01 に 100 万円から引き下げ)',
      '掛金は給与所得に含めない扱いとなり、標準報酬月額の算定からも外れる',
      '加入・掛金額は従業員が選択する (選択制)',
    ]);
    expect(byId('hagukumi').sources.map((s) => s.url)).toEqual([
      'https://hagukumikikin.jp/qaa/077/',
      'https://hagukumikikin.jp/qaa/038/',
    ]);
  });

  it('通勤手当', () => {
    expect(byId('commute').conditions).toEqual([
      '電車・バス等の交通機関は月 150,000 円まで非課税 (最も経済的かつ合理的な経路)',
      '限度額を超える部分は給与として課税される',
      '自動車等の交通用具は片道の距離で限度額が決まる (令和8年度改正で 65km 以上が細分化され、駐車場等の料金相当額の加算措置が新設)',
    ]);
    expect(byId('commute').sources.map((s) => s.url)).toEqual([
      'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2582.htm',
      'https://www.nta.go.jp/users/gensen/2026tsukin/index.htm',
    ]);
  });

  it('食事補助', () => {
    expect(byId('meal').conditions).toEqual([
      '従業員が食事の価額の半額以上を負担すること',
      '会社負担 (食事の価額 − 本人負担) が月 7,500 円以下 (税抜) — 2026-04-01 施行の改正後',
      '深夜勤務者への夜食代の金銭支給は月 650 円まで非課税',
    ]);
    expect(byId('meal').sources.map((s) => s.url)).toEqual([
      'https://www.nta.go.jp/users/gensen/2026shokuji/index.htm',
      'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2594.htm',
    ]);
  });

  it('ラベル・要約・注意書きも固定する', () => {
    expect(employerBenefits().map((b) => [b.id, b.label, b.mechanism])).toEqual([
      ['ideco-plus', 'iDeCo+ (中小事業主掛金納付制度)', 'employer-pension'],
      ['corporate-dc', '企業型DC (企業型確定拠出年金) の事業主掛金', 'employer-pension'],
      ['hagukumi', 'はぐくみ基金 (選択制の確定給付企業年金)', 'salary-conversion'],
      ['commute', '通勤手当', 'in-kind'],
      ['meal', '食事補助', 'in-kind'],
    ]);
    expect(employerBenefits().map((b) => b.summary)).toEqual([
      '従業員が自分で入っている iDeCo に、会社が掛金を上乗せする。給与を下げずに上積みできる。',
      '会社が掛金を拠出する年金制度。給与を下げずに上積みできる。',
      '従業員が給与の一部を掛金へ振り替える。掛金は給与に含まれないので、本人・会社とも社会保険料と税が下がる。',
      '交通機関の通勤費を会社が負担する。限度額まで非課税。',
      '食事の現物支給または食事補助。要件を満たせば非課税。',
    ]);
    expect(employerBenefits().map((b) => b.caveat)).toEqual([
      '2026年12月に拠出限度額が月 6.2 万円へ引き上げられる予定。規程に金額を直書きしていると改正時に取り残される。',
      '2026年12月に拠出限度額が月 6.2 万円へ引き上げられる予定。iDeCo+ と同様、規程への直書きに注意。',
      '標準報酬月額が下がるので、下がるのは保険料だけではない。老齢厚生年金・傷病手当金・出産手当金・障害厚生年金・遺族厚生年金も同じだけ下がる。「手取りが増える」とだけ説明して導入させてはいけない。',
      '所得税では非課税でも、通勤手当は社会保険料の算定基礎 (標準報酬月額) には含まれる。「非課税だから社保も下がる」は誤り。',
      null,
    ]);
    expect(employerBenefits().flatMap((b) => b.sources.map((s) => s.label))).toEqual([
      '国民年金基金連合会 iDeCo+ 導入時の留意事項',
      '国民年金基金連合会 中小事業主掛金納付制度の手引き',
      '厚生労働省 確定拠出年金制度の拠出限度額',
      '厚生労働省 2025年の制度改正',
      'はぐくみ企業年金 掛金上限額について',
      'はぐくみ企業年金 掛金はいくらから',
      '国税庁 No.2582 電車・バス通勤者の通勤手当',
      '国税庁 通勤手当の非課税限度額の改正について',
      '国税庁 食事の現物支給に係る所得税の非課税限度額の引上げについて',
      '国税庁 No.2594 食事を支給したとき',
    ]);
  });
});

/*
 * 枝ごとに 1 件だけ。
 *
 * 上の検査は 1 つの `it` で複数の枝をまとめて見ているものがあり、
 * どの枝を誰が押さえているかが曖昧だった (`benefitId` を読んでいない枝が
 * 2 つあった)。枝ごとに 1 件ずつ、`benefitId` と要点だけを見る。
 */
describe('checkBenefitPlan — 枝ごとに benefitId を確かめる', () => {
  const base = { gross: 400_000, baseSalary: 300_000, asOf: new Date('2026-08-21T00:00:00Z') };
  const only = (plan: Parameters<typeof checkBenefitPlan>[0]) => {
    const v = checkBenefitPlan(plan);
    expect(v).toHaveLength(1);
    return v[0]!;
  };

  it('従業員数超過', () => {
    const v = only({ ...base, idecoPlusEmployer: 5_000, employeeCount: 301 });
    expect(v.benefitId).toBe('ideco-plus');
    expect(v.message).toContain('300 人以下');
  });

  it('掛金の単位', () => {
    const v = only({ ...base, idecoPlusEmployer: 5_500 });
    expect(v.benefitId).toBe('ideco-plus');
    expect(v.message).toContain('1,000 円単位');
  });

  it('掛金合計の上限', () => {
    const v = only({ ...base, idecoPlusEmployer: 24_000 });
    expect(v.benefitId).toBe('ideco-plus');
    expect(v.message).toContain('上限');
  });

  it('掛金合計の下限', () => {
    const v = only({ ...base, idecoPlusEmployer: 3_000 });
    expect(v.benefitId).toBe('ideco-plus');
    expect(v.message).toContain('5,000 円以上');
  });

  it('企業型DC の上限', () => {
    const v = only({ ...base, corporateDcEmployer: 56_000 });
    expect(v.benefitId).toBe('corporate-dc');
  });

  it('給与振替の上限', () => {
    const v = only({ ...base, salaryConversion: 61_000 });
    expect(v.benefitId).toBe('hagukumi');
    expect(v.message).toContain('上限');
  });

  it('給与振替の下限', () => {
    const v = only({ ...base, salaryConversion: 500 });
    expect(v.benefitId).toBe('hagukumi');
    expect(v.message).toContain('1,000 円以上');
  });

  it('給与振替が額面を超える', () => {
    // 上限 (基本給 300 万 → 40 万) には収まるが額面 30 万を超える。
    const v = only({ ...base, gross: 300_000, baseSalary: 3_000_000, salaryConversion: 400_000 });
    expect(v.benefitId).toBe('hagukumi');
    expect(v.message).toBe('給与振替額が額面を超えています');
  });

  it('通勤手当の非課税枠超過', () => {
    const v = only({ ...base, commuteAllowance: 150_001 });
    expect(v.benefitId).toBe('commute');
  });
});
