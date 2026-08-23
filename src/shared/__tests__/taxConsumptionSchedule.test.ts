import { floorHundred } from '../num';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RATE_POINTS,
  LOCAL_RATIO,
  MAX_RATE,
  NATIONAL_SHARE,
  breakEvenRate,
  buildSchedule,
  calcAnnualTax,
  finalDueDate,
  interimCount,
  nextBusinessDay,
  planInterim,
  roundRefund,
  settle,
  sweepRates,
  type ScheduleInput,
} from '../taxConsumptionSchedule';

/** 個人事業者・暦年・本則課税の基本形。 */
const individual = (over: Partial<ScheduleInput> = {}): ScheduleInput => ({
  filer: 'individual',
  fiscalEndMonth: 12,
  fiscalEndYear: 2026,
  extendedDeadline: false,
  method: 'standard',
  taxableSales: 30_000_000,
  taxablePurchases: 10_000_000,
  deemedPurchaseRate: 0.5,
  priorNationalTax: 0,
  eTax: true,
  ...over,
});

/** 3月決算法人。 */
const corporate = (over: Partial<ScheduleInput> = {}): ScheduleInput =>
  individual({ filer: 'corporate', fiscalEndMonth: 3, fiscalEndYear: 2027, ...over });

describe('端数処理', () => {
  it('100円未満を切り捨てる（国税通則法119条1項）', () => {
    expect(floorHundred(1_234_567)).toBe(1_234_500);
    expect(floorHundred(99)).toBe(0);
    expect(floorHundred(100)).toBe(100);
    expect(floorHundred(0)).toBe(0);
  });

  it('還付は1円未満切捨て。ただし1円未満の正値は1円', () => {
    expect(roundRefund(1234.9)).toBe(1234);
    expect(roundRefund(0.4)).toBe(1);
    expect(roundRefund(0)).toBe(0);
    expect(roundRefund(-5)).toBe(0);
  });
});

describe('年税額', () => {
  it('現行10%・本則課税で、国税と地方の区分が 78 : 22 になる', () => {
    const a = calcAnnualTax(individual(), 0.1);
    // 課税ベース 2,000万円 × 10% × 78% = 1,560,000（国税）
    expect(a.national).toBe(1_560_000);
    // 地方 = 国税 × 22/78 = 440,000
    expect(a.local).toBe(440_000);
    // 合計は 課税ベース × 税率 に一致する
    expect(a.total).toBe(2_000_000);
    expect(a.isRefund).toBe(false);
  });

  it('税率0%なら税額も0', () => {
    const a = calcAnnualTax(individual(), 0);
    expect(a.total).toBe(0);
    expect(a.isRefund).toBe(false);
  });

  it('税率50%まで比例する（上限を超える指定は50%に丸められる）', () => {
    expect(calcAnnualTax(individual(), 0.5).total).toBe(10_000_000);
    expect(calcAnnualTax(individual(), 0.8).rate).toBe(MAX_RATE);
    expect(calcAnnualTax(individual(), 0.8).total).toBe(calcAnnualTax(individual(), 0.5).total);
  });

  it('仕入が売上を上回れば還付になり、税率を変えても還付のままである', () => {
    const lossMaking = individual({ taxableSales: 10_000_000, taxablePurchases: 30_000_000 });
    for (const r of [0.01, 0.08, 0.1, 0.25, 0.5]) {
      const a = calcAnnualTax(lossMaking, r);
      expect(a.isRefund, `rate=${r}`).toBe(true);
      expect(a.total, `rate=${r}`).toBeLessThan(0);
    }
    // 本則課税では納付/還付の別は税率に依存しない（差額の符号で決まる）
    expect(calcAnnualTax(lossMaking, 0.1).total).toBe(-2_000_000);
  });

  it('簡易課税はみなし仕入率で控除し、還付は生じない', () => {
    const s = individual({ method: 'simplified', deemedPurchaseRate: 0.5, taxablePurchases: 999_999_999 });
    const a = calcAnnualTax(s, 0.1);
    // 3,000万 × 10% × (1 − 0.5) = 1,500,000
    expect(a.total).toBe(1_500_000);
    expect(a.isRefund).toBe(false);
  });

  it('みなし仕入率100%でも還付にはならない（税額0）', () => {
    const a = calcAnnualTax(individual({ method: 'simplified', deemedPurchaseRate: 1 }), 0.1);
    expect(a.total).toBe(0);
    expect(a.isRefund).toBe(false);
  });

  it('2割特例は売上税額の20%で、仕入額に影響されない', () => {
    const base = individual({ method: 'twenty-percent' });
    const a = calcAnnualTax(base, 0.1);
    // 3,000万 × 10% × 20% = 600,000
    expect(a.total).toBe(600_000);
    expect(calcAnnualTax({ ...base, taxablePurchases: 0 }, 0.1).total).toBe(600_000);
    expect(calcAnnualTax({ ...base, taxablePurchases: 100_000_000 }, 0.1).total).toBe(600_000);
  });

  it('地方消費税は「100円未満切捨て後の国税額」に対して計算する', () => {
    const a = calcAnnualTax(individual({ taxableSales: 1_234_567, taxablePurchases: 0 }), 0.1);
    expect(a.national).toBe(floorHundred(1_234_567 * 0.1 * NATIONAL_SHARE));
    expect(a.local).toBe(floorHundred(a.national * LOCAL_RATIO));
  });
});

describe('中間申告の判定', () => {
  it('前期の確定消費税額（国税分）で回数が決まる', () => {
    expect(interimCount(0)).toBe(0);
    expect(interimCount(480_000)).toBe(0);
    expect(interimCount(480_001)).toBe(1);
    expect(interimCount(4_000_000)).toBe(1);
    expect(interimCount(4_000_001)).toBe(3);
    expect(interimCount(48_000_000)).toBe(3);
    expect(interimCount(48_000_001)).toBe(11);
  });

  it('48万円以下なら中間申告なし', () => {
    const p = planInterim(individual({ priorNationalTax: 400_000 }));
    expect(p.count).toBe(0);
    expect(p.payments).toEqual([]);
    expect(p.total).toBe(0);
  });

  it('年1回: 個人事業者は 6/30 締め・8/31 期限、納付は前期国税の 6/12', () => {
    const p = planInterim(individual({ priorNationalTax: 600_000 }));
    expect(p.count).toBe(1);
    expect(p.payments).toHaveLength(1);
    expect(p.payments[0]!.periodEnd).toBe('2026-06-30');
    expect(p.payments[0]!.due).toBe('2026-08-31');
    expect(p.payments[0]!.national).toBe(300_000);
    expect(p.payments[0]!.local).toBe(floorHundred(300_000 * LOCAL_RATIO));
  });

  it('年3回: 個人事業者は 5/31・8/31・11/30 が期限、各回 3/12', () => {
    const p = planInterim(individual({ priorNationalTax: 6_000_000 }));
    expect(p.count).toBe(3);
    expect(p.payments.map((x) => x.due)).toEqual(['2026-06-01', '2026-08-31', '2026-11-30']); // 5/31 は日曜
    expect(p.payments.map((x) => x.periodEnd)).toEqual(['2026-03-31', '2026-06-30', '2026-09-30']);
    for (const x of p.payments) expect(x.national).toBe(1_500_000);
  });

  it('年11回: 最初の1か月分は開始日から2か月経過後2か月以内、以後は対象期間末日の翌日から2か月以内', () => {
    const p = planInterim(individual({ priorNationalTax: 60_000_000 }));
    expect(p.count).toBe(11);
    expect(p.payments).toHaveLength(11);
    // 1月分と2月分がいずれも 4/30
    expect(p.payments[0]!.due).toBe('2026-04-30');
    expect(p.payments[1]!.due).toBe('2026-04-30');
    // 3月分の期限 5/31 は日曜なので 6/1
    expect(p.payments[2]!.due).toBe('2026-06-01');
    // 11月分は 11/30 の翌日から2か月 = 1/31（日曜）なので 2/1
    expect(p.payments[10]!.periodEnd).toBe('2026-11-30');
    expect(p.payments[10]!.due).toBe('2027-02-01');
    // 対象期間の末日は暦のとおりで、休日送りをしない
    expect(p.payments.map((x) => x.periodEnd)).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30',
      '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30',
    ]);
    for (const x of p.payments) expect(x.national).toBe(floorHundred(60_000_000 / 12));
  });

  it('年11回・申告期限延長の法人は、開始後2か月分が3か月経過後2か月以内になる', () => {
    const p = planInterim(corporate({ priorNationalTax: 60_000_000, extendedDeadline: true }));
    // 3月決算 → 課税期間 4/1〜3/31。開始後1・2か月分の期限は 8/31
    expect(p.payments[0]!.due).toBe('2026-08-31');
    expect(p.payments[1]!.due).toBe('2026-08-31');
    expect(p.payments[2]!.due).toBe('2026-08-31');
    expect(p.payments[3]!.due).toBe('2026-09-30');
  });

  it('中間納付の合計は各回の合計に一致する', () => {
    const p = planInterim(individual({ priorNationalTax: 6_000_000 }));
    expect(p.total).toBe(p.payments.reduce((s, x) => s + x.total, 0));
    expect(p.totalNational).toBe(4_500_000);
  });
});

describe('期限の算定', () => {
  it('個人事業者の確定申告期限は翌年3月31日', () => {
    expect(finalDueDate(individual({ fiscalEndYear: 2026 }))).toBe('2027-03-31');
  });

  it('期限が土日なら翌開庁日へ送る', () => {
    // 2029-03-31 は土曜 → 4/2(月)
    expect(finalDueDate(individual({ fiscalEndYear: 2028 }))).toBe('2029-04-02');
  });

  it('12/29〜1/3 は行政機関の休日として翌開庁日へ送る', () => {
    // 10月決算法人 → 期限 12/31 → 翌年 1/4
    expect(finalDueDate(corporate({ fiscalEndMonth: 10, fiscalEndYear: 2026 }))).toBe('2027-01-04');
    expect(nextBusinessDay(new Date(Date.UTC(2026, 11, 29)))).toEqual(new Date(Date.UTC(2027, 0, 4))); // 1/4 は月曜
  });

  it('法人は課税期間末日の翌日から2か月、延長特例があれば3か月', () => {
    expect(finalDueDate(corporate({ fiscalEndMonth: 3, fiscalEndYear: 2027 }))).toBe('2027-05-31');
    expect(finalDueDate(corporate({ fiscalEndMonth: 3, fiscalEndYear: 2027, extendedDeadline: true }))).toBe('2027-06-30');
  });
});

describe('確定申告時に動く金額', () => {
  it('中間納付がなければ年税額をそのまま納付する', () => {
    const input = individual();
    const s = settle(input, calcAnnualTax(input, 0.1), planInterim(input));
    expect(s.kind).toBe('payment');
    expect(s.amount).toBe(2_000_000);
    expect(s.due).toBe('2027-03-31');
    expect(s.refundWindow).toBeUndefined();
  });

  it('中間納付が年税額を上回ると、確定申告では還付になる', () => {
    const input = individual({ priorNationalTax: 6_000_000 }); // 中間 3 回・合計 約577万
    const s = settle(input, calcAnnualTax(input, 0.1), planInterim(input));
    expect(s.interimTotal).toBeGreaterThan(s.annualTotal);
    expect(s.kind).toBe('refund');
    expect(s.amount).toBeLessThan(0);
  });

  it('還付の目安時期は e-Tax と書面で変わる', () => {
    const base = individual({ taxableSales: 0, taxablePurchases: 30_000_000 });
    const e = settle(base, calcAnnualTax(base, 0.1), planInterim(base));
    const paper = settle({ ...base, eTax: false }, calcAnnualTax(base, 0.1), planInterim(base));
    expect(e.kind).toBe('refund');
    expect(e.refundWindow?.from).toBe('2027-04-14');
    expect(e.refundWindow?.to).toBe('2027-04-21');
    expect(paper.refundWindow?.from).toBe('2027-04-30');
    expect(paper.refundWindow?.to).toBe('2027-05-17');
    expect(new Date(paper.refundWindow!.from) > new Date(e.refundWindow!.from)).toBe(true);
  });

  it('年税額と中間納付が一致すればどちらでもない', () => {
    const input = individual({ taxableSales: 0, taxablePurchases: 0, priorNationalTax: 0 });
    const s = settle(input, calcAnnualTax(input, 0.1), planInterim(input));
    expect(s.kind).toBe('none');
    expect(s.amount).toBe(0);
  });
});

describe('税率の掃引と分岐税率', () => {
  it('既定の税率点は 0%〜50% に収まり、現行の 8% と 10% を含む', () => {
    expect(Math.min(...DEFAULT_RATE_POINTS)).toBe(0);
    expect(Math.max(...DEFAULT_RATE_POINTS)).toBe(MAX_RATE);
    expect(DEFAULT_RATE_POINTS).toContain(0.08);
    expect(DEFAULT_RATE_POINTS).toContain(0.1);
  });

  it('掃引すると税率に比例して年税額が増える', () => {
    const rows = sweepRates(individual());
    expect(rows).toHaveLength(DEFAULT_RATE_POINTS.length);
    expect(rows[0]!.annual.total).toBe(0);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.annual.total).toBeGreaterThan(rows[i - 1]!.annual.total);
    }
  });

  it('範囲外の税率は掃引から除かれる', () => {
    expect(sweepRates(individual(), [-0.1, 0.1, 0.6])).toHaveLength(1);
  });

  it('分岐税率を下回ると確定申告が還付に変わる', () => {
    const input = individual({ priorNationalTax: 6_000_000 });
    const r = breakEvenRate(input);
    expect(r).not.toBeNull();
    const below = settle(input, calcAnnualTax(input, r! - 0.01), planInterim(input));
    const above = settle(input, calcAnnualTax(input, r! + 0.01), planInterim(input));
    expect(below.kind).toBe('refund');
    expect(above.kind).toBe('payment');
  });

  it('中間納付がなければ分岐税率は無い', () => {
    expect(breakEvenRate(individual({ priorNationalTax: 0 }))).toBeNull();
  });

  it('課税ベースが0以下（常に還付）なら分岐税率は無い', () => {
    expect(breakEvenRate(individual({ taxableSales: 0, taxablePurchases: 1_000_000, priorNationalTax: 6_000_000 }))).toBeNull();
  });

  it('分岐税率が50%を超える場合は無い扱いにする', () => {
    // 課税ベースが極端に小さく、中間納付が大きい
    expect(breakEvenRate(individual({ taxableSales: 5_000_000, taxablePurchases: 4_900_000, priorNationalTax: 48_000_000 }))).toBeNull();
  });

  it('簡易課税・2割特例でも分岐税率が求まる', () => {
    const s = breakEvenRate(individual({ method: 'simplified', deemedPurchaseRate: 0.5, priorNationalTax: 600_000 }));
    const t = breakEvenRate(individual({ method: 'twenty-percent', priorNationalTax: 600_000 }));
    expect(s).toBeGreaterThan(0);
    expect(t).toBeGreaterThan(0);
    // 2割特例の方が課税ベースが小さいので、分岐税率は高くなる
    expect(t!).toBeGreaterThan(s!);
  });
});

describe('buildSchedule — 画面が使う一括の結果', () => {
  it('年税額・中間・確定・分岐・掃引をまとめて返す', () => {
    const r = buildSchedule(individual({ priorNationalTax: 600_000 }), 0.1);
    expect(r.annual.total).toBe(2_000_000);
    expect(r.interim.count).toBe(1);
    expect(r.settlement.due).toBe('2027-03-31');
    expect(r.settlement.amount).toBe(r.annual.total - r.interim.total);
    expect(r.breakEven).toBeGreaterThan(0);
    expect(r.sweep.length).toBe(DEFAULT_RATE_POINTS.length);
  });

  it('掃引の各行の確定額は「年税額 − 中間納付」に一致する', () => {
    const input = individual({ priorNationalTax: 6_000_000 });
    const r = buildSchedule(input, 0.1);
    for (const row of r.sweep) {
      expect(row.settlement.amount).toBe(row.annual.total - r.interim.total);
    }
  });
});

/* mutation testing で生き残った変異体を狙って足したケース。 */

describe('端数と日付ユーティリティの境界', () => {
  it('還付は 1円未満なら 1円、1円ちょうどは 1円のまま', () => {
    expect(roundRefund(0.9)).toBe(1);
    expect(roundRefund(1)).toBe(1);
    expect(roundRefund(1.9)).toBe(1);
    expect(roundRefund(2)).toBe(2);
  });

  it('年末年始は 12/29〜1/3 で、1/4 と 12/28 は開庁日', () => {
    const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));
    // 2027-12-28 は火曜（開庁日）
    expect(nextBusinessDay(d(2027, 12, 28))).toEqual(d(2027, 12, 28));
    // 12/29 以降は送られる
    expect(nextBusinessDay(d(2027, 12, 29))).toEqual(d(2028, 1, 4));
    expect(nextBusinessDay(d(2028, 1, 3))).toEqual(d(2028, 1, 4));
    // 1/4 は送られない（月曜以外でも開庁日）
    expect(nextBusinessDay(d(2028, 1, 4))).toEqual(d(2028, 1, 4));
  });

  it('土日は翌開庁日へ送る', () => {
    const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));
    expect(nextBusinessDay(d(2026, 5, 30))).toEqual(d(2026, 6, 1)); // 土
    expect(nextBusinessDay(d(2026, 5, 31))).toEqual(d(2026, 6, 1)); // 日
    expect(nextBusinessDay(d(2026, 6, 1))).toEqual(d(2026, 6, 1)); // 月
  });

  it('12月決算法人の課税期間は 1月開始（開始月の算出）', () => {
    // 12月決算 → 課税期間 1/1〜12/31 → 年1回中間の対象期間末日は 6/30
    const p = planInterim(corporate({ fiscalEndMonth: 12, fiscalEndYear: 2026, priorNationalTax: 600_000 }));
    expect(p.payments[0]!.periodEnd).toBe('2026-06-30');
    expect(p.payments[0]!.due).toBe('2026-08-31');
  });

  it('1月決算法人の課税期間は前年2月開始', () => {
    const p = planInterim(corporate({ fiscalEndMonth: 1, fiscalEndYear: 2027, priorNationalTax: 600_000 }));
    // 課税期間 2026-02-01〜2027-01-31 → 6か月中間の末日は 2026-07-31
    expect(p.payments[0]!.periodEnd).toBe('2026-07-31');
    expect(p.payments[0]!.due).toBe('2026-09-30');
  });
});

describe('中間申告の区分ラベルと内訳', () => {
  it('区分ごとのラベル文面', () => {
    expect(planInterim(individual({ priorNationalTax: 0 })).band)
      .toBe('48万円以下 — 中間申告は不要（任意の中間申告制度あり）');
    expect(planInterim(individual({ priorNationalTax: 600_000 })).band)
      .toBe('48万円超 400万円以下 — 年1回（6か月中間申告）');
    expect(planInterim(individual({ priorNationalTax: 6_000_000 })).band)
      .toBe('400万円超 4,800万円以下 — 年3回（3か月中間申告）');
    expect(planInterim(individual({ priorNationalTax: 60_000_000 })).band)
      .toBe('4,800万円超 — 年11回（1か月中間申告）');
  });

  it('各回の total は 国税 + 地方（引き算ではない）', () => {
    for (const prior of [600_000, 6_000_000, 60_000_000]) {
      const p = planInterim(individual({ priorNationalTax: prior }));
      for (const x of p.payments) {
        expect(x.total, String(prior)).toBe(x.national + x.local);
        expect(x.total, String(prior)).toBeGreaterThan(x.national);
      }
    }
  });

  it('地方消費税は国税に 22/78 を掛ける（割るのではない）', () => {
    const p = planInterim(individual({ priorNationalTax: 60_000_000 }));
    const x = p.payments[0]!;
    expect(x.local).toBeLessThan(x.national);
    expect(x.local).toBe(floorHundred(x.national * LOCAL_RATIO));
  });

  it('回数は 1 から始まり連番になる', () => {
    expect(planInterim(individual({ priorNationalTax: 6_000_000 })).payments.map((x) => x.no)).toEqual([1, 2, 3]);
    expect(planInterim(individual({ priorNationalTax: 60_000_000 })).payments.map((x) => x.no))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('還付の目安の文面', () => {
  it('e-Tax と書面で注記が変わる', () => {
    const base = individual({ taxableSales: 0, taxablePurchases: 30_000_000 });
    expect(settle(base, calcAnnualTax(base, 0.1), planInterim(base)).refundWindow?.note)
      .toBe('e-Tax で申告した場合のおおむねの目安（申告から2〜3週間程度）。期限より早く申告すればその分早まります。');
    const paper = { ...base, eTax: false };
    expect(settle(paper, calcAnnualTax(paper, 0.1), planInterim(paper)).refundWindow?.note)
      .toBe('書面で申告した場合のおおむねの目安（申告から1か月〜1か月半程度）。期限より早く申告すればその分早まります。');
  });
});

describe('年税額の還付側', () => {
  it('還付のとき国税・地方はいずれも負の値になる', () => {
    const a = calcAnnualTax(individual({ taxableSales: 0, taxablePurchases: 10_000_000 }), 0.1);
    expect(a.isRefund).toBe(true);
    expect(a.national).toBeLessThan(0);
    expect(a.local).toBeLessThan(0);
    expect(a.total).toBe(a.national + a.local);
  });

  it('納付のときはいずれも 0 以上', () => {
    const a = calcAnnualTax(individual(), 0.1);
    expect(a.isRefund).toBe(false);
    expect(a.national).toBeGreaterThan(0);
    expect(a.local).toBeGreaterThan(0);
  });
});

describe('分岐税率の課税ベース', () => {
  it('簡易課税の課税ベースは 売上 ×（1 − みなし仕入率）', () => {
    // 売上3,000万・みなし50% → ベース1,500万。中間150万なら分岐は 10%
    const input = individual({ method: 'simplified', deemedPurchaseRate: 0.5, priorNationalTax: 600_000 });
    const interim = planInterim(input);
    expect(breakEvenRate(input)).toBeCloseTo(interim.total / 15_000_000, 10);
  });

  it('みなし仕入率が上がると課税ベースが減り、分岐税率は上がる', () => {
    const low = breakEvenRate(individual({ method: 'simplified', deemedPurchaseRate: 0.4, priorNationalTax: 600_000 }))!;
    const high = breakEvenRate(individual({ method: 'simplified', deemedPurchaseRate: 0.8, priorNationalTax: 600_000 }))!;
    expect(high).toBeGreaterThan(low);
  });

  it('みなし仕入率の範囲外指定は 0〜1 に丸める', () => {
    const over = breakEvenRate(individual({ method: 'simplified', deemedPurchaseRate: 5, priorNationalTax: 600_000 }));
    const under = breakEvenRate(individual({ method: 'simplified', deemedPurchaseRate: -5, priorNationalTax: 600_000 }));
    // 1 に丸められるとベースが 0 になり分岐なし
    expect(over).toBeNull();
    // 0 に丸められるとベースは売上全額
    expect(under).toBeCloseTo(planInterim(individual({ priorNationalTax: 600_000 })).total / 30_000_000, 10);
  });

  it('課税ベースがちょうど 0 なら分岐税率は無い', () => {
    expect(breakEvenRate(individual({ taxableSales: 1_000_000, taxablePurchases: 1_000_000, priorNationalTax: 600_000 }))).toBeNull();
  });

  it('分岐税率がちょうど 50% なら返す（超えたときだけ null）', () => {
    // 中間納付 = ベース × 0.5 になるように売上を決める
    const interim = planInterim(individual({ priorNationalTax: 6_000_000 }));
    const sales = interim.total / 0.5;
    const input = individual({ taxableSales: sales, taxablePurchases: 0, priorNationalTax: 6_000_000 });
    expect(breakEvenRate(input)).toBeCloseTo(MAX_RATE, 10);
    // わずかに売上を減らすと 50% を超えて null
    expect(breakEvenRate({ ...input, taxableSales: sales * 0.99 })).toBeNull();
  });
});

describe('残った変異体を狙う — 観測できる差があるもの', () => {
  it('11月決算法人の課税期間は前年12月開始（開始月の年またぎ）', () => {
    const p = planInterim(corporate({ fiscalEndMonth: 11, fiscalEndYear: 2027, priorNationalTax: 600_000 }));
    // 課税期間 2026-12-01〜2027-11-30 → 6か月中間の末日は 2027-05-31
    expect(p.payments[0]!.periodEnd).toBe('2027-05-31');
    expect(p.payments[0]!.due).toBe('2027-08-02'); // 7/31 は土曜
  });

  it('決算月ごとに中間対象期間の末日が 1 か月ずつずれる', () => {
    const endOf = (m: number) =>
      planInterim(corporate({ fiscalEndMonth: m, fiscalEndYear: 2027, priorNationalTax: 600_000 })).payments[0]!.periodEnd;
    expect(endOf(3)).toBe('2026-09-30'); // 課税期間 2026-04-01〜
    expect(endOf(6)).toBe('2026-12-31'); // 2026-07-01〜
    expect(endOf(9)).toBe('2027-03-31'); // 2026-10-01〜
    expect(endOf(11)).toBe('2027-05-31'); // 2026-12-01〜
    expect(endOf(12)).toBe('2027-06-30'); // 2027-01-01〜
  });

  it('還付の端数は「1円未満切捨て」であって 100円単位ではない', () => {
    // 仕入 20,001 × 10% × 78% = 1,560.078 → 還付は 1,560 円（100円単位なら 1,600 になる）
    const input = individual({ taxableSales: 0, taxablePurchases: 20_001 });
    const a = calcAnnualTax(input, 0.1);
    expect(a.isRefund).toBe(true);
    expect(a.national).toBe(-1_560);
    // 地方も 1円単位: 1,560 × 22/78 = 440.0 → 440
    expect(a.local).toBe(-440);
    expect(a.total).toBe(-2_000);
  });

  it('納付側は 100円未満切捨てのまま（還付と扱いが違う）', () => {
    const input = individual({ taxableSales: 20_001, taxablePurchases: 0 });
    const a = calcAnnualTax(input, 0.1);
    expect(a.isRefund).toBe(false);
    expect(a.national).toBe(1_500); // 1,560.078 → 100円未満切捨て
    expect(a.local).toBe(400); // 1,500 × 22/78 = 423.07 → 400
  });
});

/*
 * **祝日を扱っていないことを、事実として留める。**
 *
 * 元の注記は「月末にあたる固定祝日が無いため祝日は考慮しない」と書いていた。
 * 固定祝日についてはそのとおりだが、**振替休日を数えていなかった** ——
 * 昭和の日 4/29 が日曜だと翌 4/30 が振替休日になり、4/30 は月末である
 * (実測: 2029 / 2035 / 2040 年)。
 *
 * ずれる向きは**安全側** (法定より早い日を返す) なので直していない。
 * だが「祝日は無視してよい」と読める理由を残すと次に触る人が再利用するので、
 * **今どう振る舞うか**を検査で固定しておく。ここが落ちるようになったら
 * (= 祝日を扱い始めたら) 注記も一緒に直すこと。
 */
describe('nextBusinessDay — 祝日は扱わない (既知の限界)', () => {
  const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

  it('土日は送る', () => {
    // 2026-08-29 は土曜 → 月曜 8/31
    expect(nextBusinessDay(d(2026, 8, 29))).toEqual(d(2026, 8, 31));
  });

  it('年末年始 (12/29〜1/3) は送る', () => {
    expect(nextBusinessDay(d(2026, 12, 30))).toEqual(d(2027, 1, 4));
  });

  it('振替休日 4/30 は送らない (法定より早い = 安全側)', () => {
    // 2029-04-29 は日曜 → 4/30 は振替休日だが、平日なのでそのまま返る。
    expect(d(2029, 4, 29).getUTCDay()).toBe(0); // 前提: 日曜であること
    expect(nextBusinessDay(d(2029, 4, 30))).toEqual(d(2029, 4, 30));
  });

  it('固定祝日 (5/3 憲法記念日) も送らない', () => {
    // 2027-05-03 は月曜。祝日だが平日として扱う。
    expect(d(2027, 5, 3).getUTCDay()).toBe(1); // 前提: 月曜であること
    expect(nextBusinessDay(d(2027, 5, 3))).toEqual(d(2027, 5, 3));
  });
});
