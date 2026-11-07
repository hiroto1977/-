import { describe, expect, it } from 'vitest';
import {
  PLAN_ITEMS,
  PLAN_MONTHS,
  buildCashPlan,
  checkCashPlan,
  monthsOfRunway,
  planKey,
  type Amounts,
} from '../cashPlan';

/** 毎月同じ額を入れる。 */
const every = (item: string, v: string): Amounts => {
  const out: Amounts = {};
  for (let m = 1; m <= PLAN_MONTHS; m += 1) out[planKey(m, item)] = v;
  return out;
};
const merge = (...xs: Amounts[]): Amounts => Object.assign({}, ...xs);

/** 毎月 100 万入って 80 万出る、黒字の例。 */
const HEALTHY = merge(every('sales', '1000000'), every('expense', '800000'));

describe('項目の定義', () => {
  it('id が重複していない', () => {
    const ids = PLAN_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('収入・支出・財務がそろっている', () => {
    const kinds = new Set(PLAN_ITEMS.map((i) => i.kind));
    expect([...kinds].sort()).toEqual(['finance-in', 'finance-out', 'operating-in', 'operating-out']);
  });

  it('キーは月と項目から一意に決まる', () => {
    expect(planKey(1, 'sales')).toBe('m1sales');
    expect(planKey(12, 'repay')).toBe('m12repay');
    const keys = new Set<string>();
    for (let m = 1; m <= PLAN_MONTHS; m += 1) for (const it of PLAN_ITEMS) keys.add(planKey(m, it.id));
    expect(keys.size).toBe(PLAN_MONTHS * PLAN_ITEMS.length);
  });

  it('1 年分（12 か月）を扱う', () => {
    expect(PLAN_MONTHS).toBe(12);
    expect(buildCashPlan({}, 0).months).toHaveLength(12);
  });

  it('項目一覧をスナップショットで固定する', () => {
    expect(PLAN_ITEMS.map((i) => `${i.kind}|${i.id}|${i.label}`)).toMatchSnapshot();
  });
});

describe('繰越の連鎖', () => {
  it('前月の翌月繰越が翌月の前月繰越になる', () => {
    const plan = buildCashPlan(HEALTHY, 500000);
    for (let i = 1; i < plan.months.length; i += 1) {
      expect(plan.months[i]!.opening, `${i + 1}月`).toBe(plan.months[i - 1]!.closing);
    }
  });

  it('初月の前月繰越は期首残高', () => {
    expect(buildCashPlan({}, 123456).months[0]!.opening).toBe(123456);
  });

  it('翌月繰越 = 前月繰越 + 当月収支', () => {
    const plan = buildCashPlan(HEALTHY, 500000);
    for (const m of plan.months) expect(m.closing).toBe(m.opening + m.net);
  });

  it('期末残高は最終月の翌月繰越', () => {
    const plan = buildCashPlan(HEALTHY, 500000);
    expect(plan.endingBalance).toBe(plan.months[11]!.closing);
    expect(plan.endingBalance).toBe(500000 + 200000 * 12);
  });
});

describe('月次の集計', () => {
  it('経常収支は経常収入 − 経常支出', () => {
    const v = merge(
      { m1sales: '1000', m1otherIn: '200' },
      { m1purchase: '300', m1labor: '400', m1expense: '100' },
    );
    const m = buildCashPlan(v, 0).months[0]!;
    expect(m.operatingIn).toBe(1200);
    expect(m.operatingOut).toBe(800);
    expect(m.operatingNet).toBe(400);
  });

  it('財務収支は借入 − 返済で、経常とは分けて集計する', () => {
    const m = buildCashPlan({ m1borrow: '5000', m1repay: '1200' }, 0).months[0]!;
    expect(m.financeIn).toBe(5000);
    expect(m.financeOut).toBe(1200);
    expect(m.financeNet).toBe(3800);
    expect(m.operatingNet).toBe(0);
    expect(m.net).toBe(3800);
  });

  it('当月収支は経常収支 + 財務収支', () => {
    const m = buildCashPlan({ m1sales: '1000', m1expense: '400', m1repay: '100' }, 0).months[0]!;
    expect(m.net).toBe(500);
  });

  it('読めない入力は 0 として扱う', () => {
    expect(buildCashPlan({ m1sales: '未定' }, 0).months[0]!.operatingIn).toBe(0);
  });

  it('桁区切りを読む', () => {
    expect(buildCashPlan({ m1sales: '1,200,000' }, 0).months[0]!.operatingIn).toBe(1_200_000);
  });

  it('年間合計を区分ごとに出す', () => {
    const plan = buildCashPlan(merge(HEALTHY, every('borrow', '50000'), every('repay', '30000')), 0);
    expect(plan.totalOperatingIn).toBe(12_000_000);
    expect(plan.totalOperatingOut).toBe(9_600_000);
    expect(plan.totalFinanceIn).toBe(600_000);
    expect(plan.totalFinanceOut).toBe(360_000);
  });
});

describe('資金ショートの検出', () => {
  it('毎月赤字なら最初にマイナスへ落ちた月を指す', () => {
    // 期首 100 万、毎月 30 万の持ち出し → 4 か月目に −20 万
    const plan = buildCashPlan(every('expense', '300000'), 1_000_000);
    expect(plan.shortfallMonth).toBe(4);
    expect(plan.months[3]!.closing).toBe(-200_000);
  });

  it('黒字ならショートしない', () => {
    const plan = buildCashPlan(HEALTHY, 500000);
    expect(plan.shortfallMonth).toBeNull();
    expect(plan.minClosing).toBe(700000);
  });

  it('残高ちょうど 0 はショートにしない', () => {
    const plan = buildCashPlan({ m1expense: '1000' }, 1000);
    expect(plan.months[0]!.closing).toBe(0);
    expect(plan.shortfallMonth).toBeNull();
  });

  it('一度戻っても「初めて」の月を保つ', () => {
    // 2 か月目にマイナス → 3 か月目に借入で回復 → 以降黒字
    const v: Amounts = { m2expense: '5000', m3borrow: '9000' };
    const plan = buildCashPlan(v, 1000);
    expect(plan.months[1]!.closing).toBe(-4000);
    expect(plan.months[2]!.closing).toBe(5000);
    expect(plan.shortfallMonth).toBe(2);
  });

  it('最低残高は期間中の最小値', () => {
    const plan = buildCashPlan({ m2expense: '5000', m3borrow: '9000' }, 1000);
    expect(plan.minClosing).toBe(-4000);
  });

  it('経常収支がマイナスの月を数える', () => {
    const v = merge({ m1expense: '100', m2expense: '100', m3expense: '100' });
    expect(buildCashPlan(v, 0).negativeOperatingMonths).toBe(3);
    expect(buildCashPlan(HEALTHY, 0).negativeOperatingMonths).toBe(0);
  });
});

describe('手元資金の月数', () => {
  it('期末残高 ÷ 平均月次経常支出', () => {
    // 毎月 80 万支出、期末残高 240 万 → 3.0 か月
    const plan = buildCashPlan(merge(every('sales', '1000000'), every('expense', '800000')), 0);
    expect(plan.endingBalance).toBe(2_400_000);
    expect(monthsOfRunway(plan)).toBeCloseTo(3.0, 6);
  });

  it('支出が無ければ割れないので null', () => {
    expect(monthsOfRunway(buildCashPlan({}, 1000))).toBeNull();
    expect(monthsOfRunway(buildCashPlan(every('sales', '100'), 0))).toBeNull();
  });

  it('残高がマイナスならマイナスの月数を返す', () => {
    const plan = buildCashPlan(every('expense', '100'), 0);
    expect(monthsOfRunway(plan)).toBeCloseTo(-12, 6);
  });
});

describe('検算', () => {
  const has = (v: Amounts, open: number, re: RegExp) =>
    checkCashPlan(buildCashPlan(v, open)).some((i) => re.test(i.message));

  it('健全なら fatal を出さない', () => {
    expect(checkCashPlan(buildCashPlan(HEALTHY, 500000)).some((i) => i.level === 'fatal')).toBe(false);
  });

  it('ショートする月を金額つきで名指しする', () => {
    const out = checkCashPlan(buildCashPlan(every('expense', '300000'), 1_000_000));
    expect(out[0]!.level).toBe('fatal');
    expect(out[0]!.month).toBe(4);
    expect(out[0]!.message).toContain('4 か月目に資金がショート');
    expect(out[0]!.message).toContain('-200,000 円');
  });

  it('経常収支がマイナスの月が半数以上なら警告する', () => {
    const six = merge(...[1, 2, 3, 4, 5, 6].map((m) => ({ [`m${m}expense`]: '100' })));
    expect(has(six, 10_000_000, /経常収支がマイナスの月が 6 か月/)).toBe(true);
    const five = merge(...[1, 2, 3, 4, 5].map((m) => ({ [`m${m}expense`]: '100' })));
    expect(has(five, 10_000_000, /経常収支がマイナスの月が/)).toBe(false);
  });

  it('年間経常収支がマイナスのまま借入で埋めていれば返済原資を問う', () => {
    const v = merge(every('expense', '100000'), every('borrow', '200000'));
    expect(has(v, 1_000_000, /返済原資は経常収支から出る/)).toBe(true);
    // 借入が無ければ出さない
    expect(has(every('expense', '100000'), 10_000_000, /返済原資/)).toBe(false);
    // 経常収支が黒字なら出さない
    expect(has(merge(HEALTHY, every('borrow', '1000')), 0, /返済原資/)).toBe(false);
    // 年間経常収支ちょうど 0 なら出さない（マイナスのときだけ問う）
    const flat = merge(every('sales', '100000'), every('expense', '100000'), every('borrow', '1000'));
    expect(buildCashPlan(flat, 0).totalOperatingIn - buildCashPlan(flat, 0).totalOperatingOut).toBe(0);
    expect(has(flat, 1_000_000, /返済原資/)).toBe(false);
  });

  it('手元資金が 1 か月分を切れば警告する', () => {
    // 毎月 100 万支出・100 万入金、期首 50 万 → 期末 50 万 = 0.5 か月分
    const v = merge(every('sales', '1000000'), every('expense', '1000000'));
    expect(has(v, 500000, /0\.5 か月分/)).toBe(true);
    // ちょうど 1 か月分は出さない
    expect(has(v, 1_000_000, /か月分しかありません/)).toBe(false);
  });

  it('期首残高が 0 以下なら入れ忘れを疑う', () => {
    expect(has({}, 0, /期首残高が 0 以下/)).toBe(true);
    expect(has({}, -1, /期首残高が 0 以下/)).toBe(true);
    expect(has({}, 1, /期首残高が 0 以下/)).toBe(false);
  });

  it('繰越を手で転記しない旨を必ず案内する', () => {
    expect(has(HEALTHY, 500000, /前月の翌月繰越から自動で引き継ぎます/)).toBe(true);
  });

  it('fatal → warn → info の順に並ぶ', () => {
    const rank = { fatal: 0, warn: 1, info: 2 } as const;
    for (const [v, open] of [[HEALTHY, 500000], [every('expense', '300000'), 0], [{}, 0]] as const) {
      const levels = checkCashPlan(buildCashPlan(v, open)).map((i) => rank[i.level]);
      expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    }
  });

  it('指摘の文面を丸ごと固定する', () => {
    const flat = (v: Amounts, open: number) =>
      checkCashPlan(buildCashPlan(v, open)).map((i) => `${i.level}|${i.month ?? '-'}|${i.message}`);
    expect(flat(HEALTHY, 500000)).toMatchSnapshot('健全');
    expect(flat(every('expense', '300000'), 1_000_000)).toMatchSnapshot('ショート');
    expect(flat(merge(every('expense', '100000'), every('borrow', '200000')), 0)).toMatchSnapshot('借入で穴埋め');
  });
});
