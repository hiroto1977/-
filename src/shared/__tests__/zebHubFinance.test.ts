import { describe, expect, it } from 'vitest';
import {
  COST_COMPONENT_LABEL,
  COST_COMPONENTS,
  DEFAULT_ZEB_HUB_INPUT as D,
  MAX_HORIZON_YEARS,
  MAX_SUBSIDY_OPTIONS,
  batteryCapex,
  capexByComponent,
  chooseBatterySize,
  chooseSubsidies,
  dailyEnergy,
  irrOf,
  npvOf,
  paybackOf,
  simulateZebHub,
  zebHubInputErrors,
  type SubsidyOption,
  type ZebHubInput,
} from '../zebHubFinance';

/** 計算を手で追える小さな拠点 (劣化・割引・取り替えなし)。 */
const SIMPLE: ZebHubInput = {
  ...D,
  buildingCost: 0,
  pvCost: 1_000_000,
  waterPlantCost: 0,
  batteryFixedCost: 0,
  batteryCostPerKwh: 10_000,
  batteryKwh: 200,
  pvKw: 10,
  specificYieldKwhPerKwDay: 10, // 100 kWh/日
  pvDegradationPerYear: 0,
  baseLoadKwhPerDay: 60,
  daytimeLoadShare: 0.5, // 日中 30 / 夜 30
  criticalLoadKwhPerDay: 48, // 2 kWh/時
  roundTripEfficiency: 0.8,
  usableDepth: 0.5, // 使える 100
  reserveShare: 0.5, // 取り置き 50 / 回せる 50
  gridPurchasePrice: 30,
  wheelingValue: 20,
  selfWheelingSameArea: true,
  marketSalePrice: 10,
  arbitrageSpread: 5,
  arbitrageCyclesPerYear: 100,
  ancillaryRevenuePerKwhYear: 2,
  otherRevenuePerYear: 1_000,
  omRate: 0,
  pvReplacementCost: 0,
  pvReplacementIntervalYears: 99,
  batteryLifeYears: 99,
  batteryReplacementCostRatio: 0,
  horizonYears: 10,
  discountRate: 0,
  subsidies: [],
};

describe('1 日の電力の流れ (カスケード)', () => {
  it('★ 日中はそのまま使い、余りを蓄電池から夜へ回し、残りを外へ出す', () => {
    const e = dailyEnergy(SIMPLE, 1);
    expect(e.generation).toBe(100);
    expect(e.directUse).toBe(30);
    // 余り 70 × 効率 0.8 = 56 → 夜の需要 30 で頭打ち
    expect(e.batteryToLoad).toBe(30);
    expect(e.gridImport).toBe(0);
    // 30 を出すのに 30/0.8 = 37.5 を充電 → 外へ 70 − 37.5
    expect(e.exported).toBeCloseTo(32.5, 10);
    // 回せる容量 50 のうち夜に使った 30 を引いた 20 が値差取引へ
    expect(e.arbitrageCapacity).toBe(20);
  });

  it('★ 災害用の取り置き分は夜の自家消費にも回さない', () => {
    const e = dailyEnergy({ ...SIMPLE, reserveShare: 0.9 }, 1); // 回せるのは 10 だけ
    expect(e.batteryToLoad).toBeCloseTo(10, 10);
    expect(e.gridImport).toBeCloseTo(20, 10);
    expect(e.arbitrageCapacity).toBeCloseTo(0, 10);
  });

  it('発電が日中の需要に届かなければ、足りない分を買い、外へは出さない', () => {
    const e = dailyEnergy({ ...SIMPLE, specificYieldKwhPerKwDay: 2 }, 1); // 20 kWh/日
    expect(e.directUse).toBe(20);
    expect(e.batteryToLoad).toBe(0);
    expect(e.exported).toBe(0);
    expect(e.gridImport).toBe(40);
  });

  it('余りに効率を掛けた量で頭打ちになる (夜の需要と容量が余っているとき)', () => {
    const e = dailyEnergy({ ...SIMPLE, specificYieldKwhPerKwDay: 4, reserveShare: 0 }, 1); // 余り 10
    expect(e.batteryToLoad).toBeCloseTo(8, 10);
    expect(e.exported).toBeCloseTo(0, 10);
  });

  it('発電量は年ごとに劣化率で減る (1 年目は劣化なし)', () => {
    const input = { ...SIMPLE, pvDegradationPerYear: 0.1 };
    expect(dailyEnergy(input, 1).generation).toBe(100);
    expect(dailyEnergy(input, 3).generation).toBeCloseTo(81, 10);
  });

  it('蓄電池が無ければ、余りはすべて外へ出す', () => {
    const e = dailyEnergy({ ...SIMPLE, batteryKwh: 0 }, 1);
    expect(e.batteryToLoad).toBe(0);
    expect(e.exported).toBe(70);
    expect(e.arbitrageCapacity).toBe(0);
  });
});

describe('年ごとのお金と、正味現在価値・内部収益率・回収年数', () => {
  it('★ 手で追える拠点の 1 年目', () => {
    const r = simulateZebHub(SIMPLE);
    const y1 = r.years[0]!;
    expect(y1.savings).toBe((30 + 30) * 365 * 30);
    expect(y1.exportRevenue).toBeCloseTo(32.5 * 365 * 20, 6);
    expect(y1.marketRevenue).toBe(20 * 100 * 5 + 20 * 2);
    expect(y1.otherRevenue).toBe(1_000);
    expect(y1.opex).toBe(0);
    expect(y1.replacement).toBe(0);
    expect(y1.net).toBeCloseTo(y1.savings + y1.exportRevenue + y1.marketRevenue + 1_000, 6);
    expect(r.years).toHaveLength(10);
    expect(r.years.map((y) => y.year)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('★ エリアを跨ぐなら自己託送はしない —— 余りは市場の単価で売る (制度を緩めない)', () => {
    const same = simulateZebHub(SIMPLE).years[0]!;
    const cross = simulateZebHub({ ...SIMPLE, selfWheelingSameArea: false }).years[0]!;
    expect(cross.exportRevenue).toBeCloseTo(32.5 * 365 * 10, 6);
    expect(cross.exportRevenue).toBeLessThan(same.exportRevenue);
  });

  it('★ 初期費用・補助後の投資・NPV・回収年数がつながる', () => {
    const r = simulateZebHub(SIMPLE);
    expect(r.capex).toEqual({ building: 0, pv: 1_000_000, battery: 2_000_000, water: 0 });
    expect(r.capexTotal).toBe(3_000_000);
    expect(r.subsidy.total).toBe(0);
    expect(r.netInvestment).toBe(3_000_000);
    const net = r.years[0]!.net;
    expect(r.npv).toBeCloseTo(net * 10 - 3_000_000, 4);
    expect(r.paybackYears).toBeCloseTo(3_000_000 / net, 6);
    expect(r.irr).not.toBeNull();
    expect(npvOf([-3_000_000, ...r.years.map((y) => y.net)], r.irr!)).toBeCloseTo(0, 0);
  });

  it('★ 維持費は補助前の初期費用に掛かる', () => {
    const r = simulateZebHub({ ...SIMPLE, omRate: 0.01, subsidies: [{ id: 'a', name: 'A', targets: ['pv'], rate: 1, cap: null }] });
    expect(r.years[0]!.opex).toBe(30_000);
    expect(r.netInvestment).toBe(2_000_000);
  });

  it('★ 貼り替えと取り替えは間隔の年に入り、最後の年には入れない', () => {
    const r = simulateZebHub({
      ...SIMPLE,
      pvReplacementCost: 300,
      pvReplacementIntervalYears: 3,
      batteryLifeYears: 5,
      batteryReplacementCostRatio: 0.5,
    });
    const rep = r.years.map((y) => y.replacement);
    // 年 3・6・9 に貼り替え、年 5 に蓄電池 (年 10 は最後の年なので入れない)
    expect(rep).toEqual([0, 0, 300, 0, 1_000_000, 300, 0, 0, 300, 0]);
    // 取り替えは年の純額から引く
    const plain = simulateZebHub(SIMPLE).years;
    expect(r.years[2]!.net).toBeCloseTo(plain[2]!.net - 300, 6);
    expect(r.years[4]!.net).toBeCloseTo(plain[4]!.net - 1_000_000, 6);
  });

  it('★ 災害時の持ち時間: 取り置き分と、使える容量のすべて', () => {
    const r = simulateZebHub(SIMPLE);
    // 取り置き 50 kWh ÷ 2 kWh/時 = 25 時間、使える 100 kWh ÷ 2 = 50 時間
    expect(r.reserveAutonomyHours).toBe(25);
    expect(r.fullAutonomyHours).toBe(50);
    expect(r.firstYearEnergy).toEqual(dailyEnergy(SIMPLE, 1));
  });

  it('止めない負荷が 0 なら持ち時間は出さない (0 で割らない)', () => {
    const r = simulateZebHub({ ...SIMPLE, criticalLoadKwhPerDay: 0 });
    expect(r.reserveAutonomyHours).toBeNull();
    expect(r.fullAutonomyHours).toBeNull();
  });

  it('★ 標準ハブ拠点: 電気の収支だけでは維持費も賄えないことを隠さない', () => {
    const r = simulateZebHub(D);
    expect(r.capexTotal).toBe(702_300_000);
    expect(r.years[0]!.net).toBeLessThan(0);
    expect(r.irr).toBeNull();
    expect(r.paybackYears).toBeNull();
  });

  it('入力に誤りがあれば計算しない', () => {
    expect(() => simulateZebHub({ ...SIMPLE, pvKw: Number.NaN })).toThrow(/pvKw: 数として読めません/);
    expect(() => simulateZebHub({ ...SIMPLE, pvKw: -1, omRate: 2 })).toThrow(
      'pvKw: 負の値は使えません / omRate: 0〜1 の割合で入れてください',
    );
  });
});

describe('NPV・IRR・回収年数の部品', () => {
  it('npvOf は年 0 を割り引かない', () => {
    expect(npvOf([-100, 110], 0.1)).toBeCloseTo(0, 10);
    expect(npvOf([5], 0.5)).toBe(5);
  });

  it('irrOf: 既知の答え・求められない流れ・ちょうど下端', () => {
    expect(irrOf([-100, 110])!).toBeCloseTo(0.1, 6);
    expect(irrOf([-100, 50, 50, 50])!).toBeCloseTo(0.2337519, 5);
    // 回収できない流れでも、内部収益率は負の数として出る (損の大きさ)
    expect(irrOf([-100, 10, 10])!).toBeCloseTo(-0.6298438, 5);
    expect(irrOf([-100, -10, -10])).toBeNull(); // ずっと赤字 (符号が変わらない)
    expect(irrOf([100, 10])).toBeNull();
    expect(irrOf([0, 0])).toBe(-0.99);
  });

  it('paybackOf: 補間・年 0 で回収済み・回収できない・空', () => {
    expect(paybackOf([-100, 40, 40, 40])).toBeCloseTo(2.5, 10);
    expect(paybackOf([-100, 100])).toBe(1);
    expect(paybackOf([0, 10])).toBe(0);
    expect(paybackOf([-100, 10, 10])).toBeNull();
    expect(paybackOf([])).toBe(0);
  });
});

describe('補助金を選ぶ (同じ費用に重ねない)', () => {
  const capex = { building: 100, pv: 200, battery: 300, water: 50 };

  it('★ 同じ費用の区分を対象にする 2 つは同時に選ばず、得な方を採る', () => {
    const opts: SubsidyOption[] = [
      { id: 'a', name: 'A', targets: ['pv'], rate: 0.5, cap: null }, // 100
      { id: 'b', name: 'B', targets: ['pv', 'building'], rate: 0.5, cap: null }, // 150
    ];
    const c = chooseSubsidies(opts, capex);
    expect(c.chosen.map((x) => x.id)).toEqual(['b']);
    expect(c.total).toBe(150);
  });

  it('★ 重ならない物は合わせて選ぶ・上限で切る', () => {
    const opts: SubsidyOption[] = [
      { id: 'pv', name: 'PV', targets: ['pv'], rate: 0.5, cap: null }, // 100
      { id: 'bat', name: 'BAT', targets: ['battery'], rate: 0.5, cap: 60 }, // 150 → 60
    ];
    const c = chooseSubsidies(opts, capex);
    expect(c.chosen).toEqual([
      { id: 'pv', name: 'PV', amount: 100 },
      { id: 'bat', name: 'BAT', amount: 60 },
    ]);
    expect(c.total).toBe(160);
  });

  it('★ 同じ併用不可の組は、対象が別でも同時に選ばない', () => {
    const opts: SubsidyOption[] = [
      { id: 'x', name: 'X', targets: ['pv'], rate: 0.5, cap: null, exclusiveGroup: 'env' }, // 100
      { id: 'y', name: 'Y', targets: ['battery'], rate: 0.5, cap: null, exclusiveGroup: 'env' }, // 150
    ];
    expect(chooseSubsidies(opts, capex).chosen.map((x) => x.id)).toEqual(['y']);
  });

  it('同額なら件数の少ない組み合わせを採る', () => {
    const opts: SubsidyOption[] = [
      { id: 'w', name: 'W', targets: ['water'], rate: 0, cap: null }, // 0
      { id: 'p', name: 'P', targets: ['pv'], rate: 0.5, cap: null }, // 100
    ];
    expect(chooseSubsidies(opts, capex).chosen.map((x) => x.id)).toEqual(['p']);
  });

  it('同額・同じ件数なら先の候補を採る', () => {
    const opts: SubsidyOption[] = [
      { id: 'first', name: 'F', targets: ['pv'], rate: 0.5, cap: null }, // 100
      { id: 'second', name: 'S', targets: ['pv'], rate: 0.5, cap: null }, // 100 (同じ費用なので併用不可)
    ];
    expect(chooseSubsidies(opts, capex).chosen.map((x) => x.id)).toEqual(['first']);
  });

  it('併用不可の組を持たない 2 つは、組の印が無いことでは衝突しない', () => {
    const opts: SubsidyOption[] = [
      { id: 'pv', name: 'PV', targets: ['pv'], rate: 0.5, cap: null },
      { id: 'w', name: 'W', targets: ['water'], rate: 0.5, cap: null },
    ];
    expect(chooseSubsidies(opts, capex).total).toBe(125);
  });

  it('★ 対象が一部だけ重なる 2 つも、同時には選ばない (同じ費用に 2 度出さない)', () => {
    const opts: SubsidyOption[] = [
      { id: 'a', name: 'A', targets: ['pv', 'building'], rate: 0.5, cap: null }, // 150
      { id: 'b', name: 'B', targets: ['pv', 'water'], rate: 0.5, cap: null }, // 125
    ];
    expect(chooseSubsidies(opts, capex).chosen.map((x) => x.id)).toEqual(['a']);
  });

  it('併用不可の組が別々なら、同時に選べる', () => {
    const opts: SubsidyOption[] = [
      { id: 'x', name: 'X', targets: ['pv'], rate: 0.5, cap: null, exclusiveGroup: 'env' },
      { id: 'y', name: 'Y', targets: ['battery'], rate: 0.5, cap: null, exclusiveGroup: 'meti' },
    ];
    expect(chooseSubsidies(opts, capex).total).toBe(250);
  });

  it('全部が衝突して得にならないときは、空の組 (0 円) を返す', () => {
    const opts: SubsidyOption[] = [{ id: 'z', name: 'Z', targets: ['pv'], rate: 0, cap: null }];
    expect(chooseSubsidies(opts, capex)).toEqual({ chosen: [], total: 0 });
  });

  it('候補が無ければ 0・多すぎれば断る', () => {
    expect(chooseSubsidies([], capex)).toEqual({ chosen: [], total: 0 });
    const many = Array.from({ length: MAX_SUBSIDY_OPTIONS + 1 }, (_, i): SubsidyOption => ({
      id: `s${i}`,
      name: `S${i}`,
      targets: ['water'],
      rate: 0.1,
      cap: null,
    }));
    expect(() => chooseSubsidies(many, capex)).toThrow(/12 件まで/);
    expect(() => chooseSubsidies(many.slice(0, MAX_SUBSIDY_OPTIONS), capex)).not.toThrow();
  });

  it('標準拠点の仮置きの補助: ペロブスカイトの 2/3 と蓄電池の 1/3', () => {
    const r = simulateZebHub(D);
    expect(r.subsidy.chosen.map((x) => x.id)).toEqual(['perovskite', 'storage-parity']);
    expect(r.subsidy.total).toBeCloseTo(142_000_000 * (2 / 3) + 75_300_000 / 3, 4);
  });
});

describe('蓄電池の容量を選ぶ', () => {
  it('★ NPV 最大と、持ち時間の下限を満たす中での最大を別に返す', () => {
    const c = chooseBatterySize(SIMPLE, [0, 100, 200], 20);
    expect(c.rows.map((r) => r.batteryKwh)).toEqual([0, 100, 200]);
    expect(c.rows.map((r) => r.reserveAutonomyHours)).toEqual([0, 12.5, 25]);
    expect(c.best.npv).toBe(Math.max(...c.rows.map((r) => r.npv)));
    expect(c.bestMeetingAutonomy?.batteryKwh).toBe(200);
  });

  it('★ 値差が大きければ大きい容量が、無ければ蓄電池なしが最も得になる', () => {
    expect(chooseBatterySize({ ...SIMPLE, arbitrageSpread: 1_000 }, [0, 100, 200], 0).best.batteryKwh).toBe(200);
    expect(chooseBatterySize({ ...SIMPLE, arbitrageSpread: 0, ancillaryRevenuePerKwhYear: 0 }, [0, 100, 200], 0).best.batteryKwh).toBe(0);
  });

  it('持ち時間の下限ちょうどは満たす', () => {
    expect(chooseBatterySize(SIMPLE, [100], 12.5).bestMeetingAutonomy?.batteryKwh).toBe(100);
  });

  it('どの候補も持ち時間に届かなければ、届かないと言う (null)', () => {
    expect(chooseBatterySize(SIMPLE, [100], 1_000).bestMeetingAutonomy).toBeNull();
  });

  it('止めない負荷が 0 (持ち時間が出ない) 候補は下限を満たさない', () => {
    expect(chooseBatterySize({ ...SIMPLE, criticalLoadKwhPerDay: 0 }, [100], 0).bestMeetingAutonomy).toBeNull();
  });

  it('同じ NPV なら先の候補を採る', () => {
    const c = chooseBatterySize(SIMPLE, [100, 100], 0);
    expect(c.best).toBe(c.rows[0]);
    expect(c.bestMeetingAutonomy).toBe(c.rows[0]);
  });

  it('候補が無ければ断る', () => {
    expect(() => chooseBatterySize(SIMPLE, [], 0)).toThrow(/候補がありません/);
  });
});

describe('入力の検め', () => {
  it('標準値と手で追える拠点は誤りが無い', () => {
    expect(zebHubInputErrors(D)).toEqual([]);
    expect(zebHubInputErrors(SIMPLE)).toEqual([]);
  });

  it.each([
    ['pvKw', Number.NaN, 'pvKw: 数として読めません'],
    ['pvKw', Number.POSITIVE_INFINITY, 'pvKw: 数として読めません'],
    ['pvKw', '1' as unknown as number, 'pvKw: 数として読めません'],
    ['gridPurchasePrice', -1, 'gridPurchasePrice: 負の値は使えません'],
    ['reserveShare', 1.5, 'reserveShare: 0〜1 の割合で入れてください'],
    ['discountRate', 2, 'discountRate: 0〜1 の割合で入れてください'],
    ['horizonYears', 0, 'horizonYears: 1 以上の整数で入れてください'],
    ['horizonYears', 2.5, 'horizonYears: 1 以上の整数で入れてください'],
    ['batteryLifeYears', 0.5, 'batteryLifeYears: 1 以上の整数で入れてください'],
    ['horizonYears', MAX_HORIZON_YEARS + 1, `horizonYears: ${MAX_HORIZON_YEARS} 年までです`],
    ['roundTripEfficiency', 0, 'roundTripEfficiency: 0 では蓄電池が働きません'],
  ] as const)('%s = %s は断る', (key, value, message) => {
    expect(zebHubInputErrors({ ...SIMPLE, [key]: value })).toEqual([message]);
  });

  it('境界: 割合の 0 と 1・年数の上限ちょうどは通す', () => {
    expect(zebHubInputErrors({ ...SIMPLE, reserveShare: 0, discountRate: 1, horizonYears: MAX_HORIZON_YEARS })).toEqual([]);
    expect(zebHubInputErrors({ ...SIMPLE, horizonYears: 1, batteryLifeYears: 1, pvReplacementIntervalYears: 1 })).toEqual([]);
  });

  it('補助金の率・上限・対象を検める', () => {
    const bad = (s: Partial<SubsidyOption>): SubsidyOption => ({ id: 'z', name: 'Z', targets: ['pv'], rate: 0.5, cap: null, ...s });
    expect(zebHubInputErrors({ ...SIMPLE, subsidies: [bad({ rate: 1.2 })] })).toEqual(['subsidies[0] Z: 補助率は 0〜1 です']);
    expect(zebHubInputErrors({ ...SIMPLE, subsidies: [bad({ rate: -0.1 })] })).toEqual(['subsidies[0] Z: 補助率は 0〜1 です']);
    expect(zebHubInputErrors({ ...SIMPLE, subsidies: [bad({ rate: Number.NaN })] })).toEqual(['subsidies[0] Z: 補助率は 0〜1 です']);
    expect(zebHubInputErrors({ ...SIMPLE, subsidies: [bad({ cap: -1 })] })).toEqual(['subsidies[0] Z: 上限は 0 以上の数です']);
    expect(zebHubInputErrors({ ...SIMPLE, subsidies: [bad({ cap: Number.NaN })] })).toEqual(['subsidies[0] Z: 上限は 0 以上の数です']);
    expect(zebHubInputErrors({ ...SIMPLE, subsidies: [bad({ targets: [] })] })).toEqual(['subsidies[0] Z: 対象の費用がありません']);
    expect(zebHubInputErrors({ ...SIMPLE, subsidies: [bad({ cap: 0, rate: 0 })] })).toEqual([]);
  });
});

describe('費用の区分', () => {
  it('区分・名前・内訳がそろう', () => {
    expect(COST_COMPONENTS).toEqual(['building', 'pv', 'battery', 'water']);
    expect(Object.keys(COST_COMPONENT_LABEL)).toEqual([...COST_COMPONENTS]);
    expect(COST_COMPONENT_LABEL).toEqual({
      building: '建築本体',
      pv: 'ペロブスカイト発電',
      battery: '大型蓄電池',
      water: '水循環・生産プラント',
    });
    expect(capexByComponent(D)).toEqual({ building: 440_000_000, pv: 142_000_000, battery: 75_300_000, water: 45_000_000 });
  });

  it('蓄電池の費用: 固定費 + 容量単価・容量 0 なら 0', () => {
    expect(batteryCapex({ batteryFixedCost: 28_000_000, batteryCostPerKwh: 86_000, batteryKwh: 2000 })).toBe(200_000_000);
    expect(batteryCapex({ batteryFixedCost: 28_000_000, batteryCostPerKwh: 86_000, batteryKwh: 0 })).toBe(0);
  });
});
