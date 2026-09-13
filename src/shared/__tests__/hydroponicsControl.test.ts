import { describe, expect, it } from 'vitest';
import {
  acidToNeutralizeAlkalinity,
  assessField,
  assessReading,
  batchFromStored,
  batchSchedule,
  BATCH_STATE_LABELS,
  DEFAULT_CONTROL_SETTINGS,
  DEFAULT_DOSING_SETUP,
  DEFAULT_ENVIRONMENT_TARGETS,
  dailyTasks,
  doseFor,
  ecDose,
  isBatchState,
  latestReading,
  lowPotassiumSwitchDate,
  MG_CACO3_PER_MEQ,
  nextSolutionChange,
  readingFromStored,
  READING_FIELDS,
  READING_FIELD_SPECS,
  summarize,
  TARGET_BASIS,
  targetEcFor,
  targetFor,
  topUpLiters,
  type ControlInput,
  type CultivationBatch,
  type DosingSetup,
  type EnvironmentTargets,
  type HydroponicReading,
} from '../hydroponicsControl';
import { HYDROPONIC_CROPS } from '../hydroponics';
import { HYDROPONIC_CROP_BOUNDS, DEFAULT_CROP_LIST } from '../hydroponicCrops';

/*
 * 水耕栽培の運転管理 (2026-09-13 · パス 194)。
 *
 * ここで守るのは 6 つの約束 (モジュール冒頭と同じ順):
 *   1. 測っていない値を 0 に倒さない / 「全部緑」は全項目を測ったときだけ
 *   2. 「測っていない」と「読めない」を混ぜない
 *   3. 算定できない量は出さない (足りない物の名前を返す)
 *   4. pH は「目標 pH までの酸の量」を出さない (当量と手順だけ)
 *   5. 根拠の強さを値ごとに持つ
 *   6. 目標域は入力欄の値 (parameters 台帳に載せない)
 */

const LETTUCE = HYDROPONIC_CROPS['leaf-lettuce'];
const T: EnvironmentTargets = DEFAULT_ENVIRONMENT_TARGETS;

/** 全項目を埋めた測定 (すべて適正域の中)。 */
function goodReading(at = '2026-09-13'): HydroponicReading {
  return {
    at,
    values: {
      ec: 1.0,
      ph: 6.0,
      waterTempC: 20,
      airTempC: 22,
      humidityPct: 70,
      co2Ppm: 900,
      dissolvedOxygenMgL: 7,
      waterLevelPct: 90,
    },
    batchId: null,
    note: '',
  };
}

function input(over: Partial<ControlInput> = {}): ControlInput {
  return {
    today: '2026-09-13',
    crops: DEFAULT_CROP_LIST,
    batches: [],
    readings: [],
    targets: T,
    dosing: DEFAULT_DOSING_SETUP,
    settings: DEFAULT_CONTROL_SETTINGS,
    ...over,
  };
}

// --- 台帳 -----------------------------------------------------------------

describe('測定項目の台帳', () => {
  it('全項目に仕様が在る (総当たり)', () => {
    for (const f of READING_FIELDS) {
      const s = READING_FIELD_SPECS[f];
      expect(s, `${f} の仕様が無い`).toBeDefined();
      expect(s.label.length, `${f} のラベルが空`).toBeGreaterThan(0);
      expect(s.plausibleMin, `${f} の妥当範囲が逆`).toBeLessThan(s.plausibleMax);
      expect(Number.isInteger(s.digits)).toBe(true);
    }
    expect(Object.keys(READING_FIELD_SPECS).sort()).toEqual([...READING_FIELDS].sort());
  });

  it('★ EC / pH の妥当範囲は品目の編集欄と同じ幅を読む (数を写さない)', () => {
    expect(READING_FIELD_SPECS.ec.plausibleMin).toBe(HYDROPONIC_CROP_BOUNDS.ecLow.min);
    expect(READING_FIELD_SPECS.ec.plausibleMax).toBe(HYDROPONIC_CROP_BOUNDS.ecHigh.max);
    expect(READING_FIELD_SPECS.ph.plausibleMin).toBe(HYDROPONIC_CROP_BOUNDS.phLow.min);
    expect(READING_FIELD_SPECS.ph.plausibleMax).toBe(HYDROPONIC_CROP_BOUNDS.phHigh.max);
  });

  it('★ 根拠の強さを全項目が持ち、今日はすべて目安である (出典で検証していない)', () => {
    for (const f of READING_FIELDS) {
      expect(TARGET_BASIS[f], `${f} の根拠が無い`).toBeDefined();
      expect(TARGET_BASIS[f], `${f} を 'sourced' と名乗っています`).toBe('reference');
    }
  });

  it('溶存酸素と液位は上限を咎めない (高すぎても害にならない)', () => {
    expect(READING_FIELD_SPECS.dissolvedOxygenMgL.upperBoundMatters).toBe(false);
    expect(READING_FIELD_SPECS.waterLevelPct.upperBoundMatters).toBe(false);
    expect(targetFor('dissolvedOxygenMgL', LETTUCE, T).high).toBeNull();
    expect(targetFor('waterLevelPct', LETTUCE, T).high).toBeNull();
  });

  it('EC / pH の目標域は品目から来る (室の設定ではない)', () => {
    expect(targetFor('ec', LETTUCE, T)).toEqual({ low: LETTUCE.ecLow, high: LETTUCE.ecHigh });
    expect(targetFor('ph', LETTUCE, T)).toEqual({ low: LETTUCE.phLow, high: LETTUCE.phHigh });
  });

  it('室の目標域は設定から来る (全 6 項目)', () => {
    expect(targetFor('waterTempC', LETTUCE, T)).toEqual({ low: T.waterTempLowC, high: T.waterTempHighC });
    expect(targetFor('airTempC', LETTUCE, T)).toEqual({ low: T.airTempLowC, high: T.airTempHighC });
    expect(targetFor('humidityPct', LETTUCE, T)).toEqual({ low: T.humidityLowPct, high: T.humidityHighPct });
    expect(targetFor('co2Ppm', LETTUCE, T)).toEqual({ low: T.co2LowPpm, high: T.co2HighPpm });
    expect(targetFor('dissolvedOxygenMgL', LETTUCE, T).low).toBe(T.dissolvedOxygenLowMgL);
    expect(targetFor('waterLevelPct', LETTUCE, T).low).toBe(T.waterLevelLowPct);
  });

  it('★ 目標域を上書きすると判定が動く (対照つき — 設定が効いている)', () => {
    const cold: EnvironmentTargets = { ...T, airTempLowC: 25, airTempHighC: 30 };
    expect(assessField('airTempC', 22, LETTUCE, T).status).toBe('ok');
    expect(assessField('airTempC', 22, LETTUCE, cold).status).toBe('low');
  });
});

// --- 判定 -----------------------------------------------------------------

describe('判定 — 未測定と読めないを混ぜない', () => {
  it('適正域の中は ok。両端を含む', () => {
    expect(assessField('ec', LETTUCE.ecLow, LETTUCE, T).status).toBe('ok');
    expect(assessField('ec', LETTUCE.ecHigh, LETTUCE, T).status).toBe('ok');
  });

  it('下限未満は low / 上限超は high', () => {
    expect(assessField('ec', LETTUCE.ecLow - 0.01, LETTUCE, T).status).toBe('low');
    expect(assessField('ec', LETTUCE.ecHigh + 0.01, LETTUCE, T).status).toBe('high');
  });

  it('★ null / undefined は unmeasured —— ok でも low でもない', () => {
    expect(assessField('ec', null, LETTUCE, T).status).toBe('unmeasured');
    expect(assessField('ec', undefined, LETTUCE, T).status).toBe('unmeasured');
    // 値は刷らない。
    expect(assessField('ec', null, LETTUCE, T).value).toBeNull();
  });

  it('★ 妥当範囲の外・NaN・±Infinity は unreadable で、値を刷らない', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 11]) {
      const a = assessField('ec', bad, LETTUCE, T);
      expect(a.status, `${String(bad)} が unreadable でない`).toBe('unreadable');
      expect(a.value, `${String(bad)} の値を刷っています`).toBeNull();
    }
  });

  it('★ pH 99 は「高すぎ」ではなく「読めない」 (pH の定義域の外)', () => {
    expect(assessField('ph', 99, LETTUCE, T).status).toBe('unreadable');
    // 対照: 定義域の中で上限超なら high。
    expect(assessField('ph', 8, LETTUCE, T).status).toBe('high');
  });

  it('上限を咎めない項目は、いくら高くても ok', () => {
    expect(assessField('dissolvedOxygenMgL', 20, LETTUCE, T).status).toBe('ok');
    expect(assessField('waterLevelPct', 100, LETTUCE, T).status).toBe('ok');
    // 下限は効く。
    expect(assessField('dissolvedOxygenMgL', 1, LETTUCE, T).status).toBe('low');
    expect(assessField('waterLevelPct', 10, LETTUCE, T).status).toBe('low');
  });

  it('★ 全項目を測って全部範囲内のときだけ allOk', () => {
    const a = assessReading(goodReading(), LETTUCE, T);
    expect(a.allOk).toBe(true);
    expect(a.measured).toBe(READING_FIELDS.length);
    expect(a.unmeasured).toBe(0);
  });

  it('★ 1 項目でも未測定なら allOk は false (測っていない物を正常と言わない)', () => {
    const r: HydroponicReading = { ...goodReading(), values: { ...goodReading().values, co2Ppm: null } };
    const a = assessReading(r, LETTUCE, T);
    expect(a.allOk, '★ 未測定が在るのに「全部正常」と答えました').toBe(false);
    expect(a.unmeasured).toBe(1);
    expect(a.outOfRange).toBe(0);
    expect(a.measured).toBe(READING_FIELDS.length - 1);
  });

  it('★ 読めない値が在っても allOk は false、かつ未測定とは別に数える', () => {
    const r: HydroponicReading = {
      ...goodReading(),
      values: { ...goodReading().values, ph: 99, co2Ppm: null },
    };
    const a = assessReading(r, LETTUCE, T);
    expect(a.allOk).toBe(false);
    expect(a.unreadable).toBe(1);
    expect(a.unmeasured).toBe(1);
    expect(a.measured).toBe(READING_FIELDS.length - 2);
  });

  it('何も入っていない測定は全項目 unmeasured (0 が並ばない)', () => {
    const a = assessReading({ at: '2026-09-13', values: {}, batchId: null, note: '' }, LETTUCE, T);
    expect(a.unmeasured).toBe(READING_FIELDS.length);
    expect(a.outOfRange).toBe(0);
    expect(a.allOk).toBe(false);
    for (const f of a.fields) expect(f.value).toBeNull();
  });
});

// --- 保存値の読み方 -------------------------------------------------------

describe('保存値を読む', () => {
  it('日付が読めない控えは記録として使えない (null)', () => {
    expect(readingFromStored({ at: '2026-02-30', values: {} })).toBeNull();
    expect(readingFromStored({ at: 'いつか', values: {} })).toBeNull();
    expect(readingFromStored({ values: {} })).toBeNull();
    expect(readingFromStored(null)).toBeNull();
    expect(readingFromStored('文字列')).toBeNull();
  });

  it('★ 数でない値は null (未測定) ではなく NaN にして下流へ渡す', () => {
    const r = readingFromStored({ at: '2026-09-13', values: { ec: '1.2', ph: null } });
    expect(r).not.toBeNull();
    // 文字列だった欄は「読めない値が入っていた」。
    expect(Number.isNaN(r!.values.ec)).toBe(true);
    expect(assessField('ec', r!.values.ec, LETTUCE, T).status).toBe('unreadable');
    // 本当に無い欄は未測定。
    expect(r!.values.ph).toBeNull();
    expect(assessField('ph', r!.values.ph, LETTUCE, T).status).toBe('unmeasured');
  });

  it('values が無い / オブジェクトでない控えは全項目 未測定', () => {
    const r = readingFromStored({ at: '2026-09-13' });
    expect(r).not.toBeNull();
    for (const f of READING_FIELDS) expect(r!.values[f]).toBeNull();
  });

  it('ロットは id と播種日が読めなければ使えない', () => {
    expect(batchFromStored({ id: '', cropId: 'leaf-lettuce', sowDate: '2026-09-01' })).toBeNull();
    expect(batchFromStored({ id: 'b1', cropId: 'leaf-lettuce', sowDate: '2026-13-01' })).toBeNull();
    expect(batchFromStored({ id: 'b1', cropId: '', sowDate: '2026-09-01' })).toBeNull();
    expect(batchFromStored(42)).toBeNull();
  });

  it('ロットの読めない状態は育苗中に倒す。読めない日付は null (今日に倒さない)', () => {
    const b = batchFromStored({
      id: 'b1',
      cropId: 'leaf-lettuce',
      sowDate: '2026-09-01',
      state: 'なにか',
      transplantedDate: '2026-02-30',
      panels: -3,
    });
    expect(b).not.toBeNull();
    expect(b!.state).toBe('nursery');
    expect(b!.transplantedDate).toBeNull();
    expect(b!.panels).toBe(0);
  });

  it('状態のラベルと判定は同じ 4 つを覆う', () => {
    const states = Object.keys(BATCH_STATE_LABELS);
    expect(states).toHaveLength(4);
    for (const s of states) expect(isBatchState(s)).toBe(true);
    expect(isBatchState('growing2')).toBe(false);
    expect(isBatchState(null)).toBe(false);
  });
});

// --- 調製 -----------------------------------------------------------------

const FULL_DOSING: DosingSetup = {
  tankLiters: 1_000,
  stockEcRisePerMlPerL: 0.002,
  alkalinityMgCaCO3PerL: 80,
  acidNormality: 1,
  residualAlkalinityMgCaCO3PerL: 30,
};

describe('調製 — 算定できない量は出さない', () => {
  it('適正域の中なら何もしない', () => {
    const d = ecDose(1.0, LETTUCE, FULL_DOSING);
    expect(d.kind).toBe('none');
  });

  it('★ EC が低い → 原液の mL を出す (目標は適正域の中央)', () => {
    // 中央 = (0.8 + 1.2) / 2 = 1.0。現在 0.5 → 差 0.5。
    // mL = 0.5 / 0.002 * 1000 = 250,000 mL … 上昇率が小さい原液の例。
    const d = ecDose(0.5, LETTUCE, FULL_DOSING);
    expect(d.kind).toBe('add-stock');
    if (d.kind !== 'add-stock') throw new Error('add-stock ではない');
    expect(d.targetEc).toBe(1.0);
    expect(d.ml).toBeCloseTo(250_000, 6);
  });

  it('★ EC が高い → 薄める水の L を出す (EC は体積に反比例)', () => {
    // 現在 2.0 / 目標 1.0 → 倍に薄める = タンクと同量の水。
    const d = ecDose(2.0, LETTUCE, FULL_DOSING);
    expect(d.kind).toBe('dilute');
    if (d.kind !== 'dilute') throw new Error('dilute ではない');
    expect(d.liters).toBeCloseTo(1_000, 6);
  });

  /*
   * **上の 1 点では式が決まらない。** (2026-09-13 · パス 194 の対照で発覚)
   *
   * リーフレタスの適正域は 0.8〜1.2 なので中央 (目標) がちょうど **1.0**。
   * 目標が 1 のときは `tank × (ec / target − 1)` と `tank × (ec − target)` が
   * **同じ値になる** —— 反比例を掛け算に取り違えても上の検査は通る
   * (実測: 薄め量の式を `tank * (ec - target)` へ変えても 70 件すべて緑だった)。
   * CLAUDE.md の「守っている物を実際に壊し、狙った項目が落ちることを見る」で
   * 拾った。**1 点で留めた式は、その点を通る別の式を許す。**
   *
   * 直し方は 2 つ重ねる: 目標が 1 でない品目 (バジル 1.2〜1.8 → 中央 1.5) で
   * 数を留め、さらに**式そのものが満たすべき関係**を留める ——
   * 薄めた後の EC が目標に一致すること。後者はどの点でも成り立つので、
   * 点の選び方に依らない。
   */
  it('★ 目標が 1 でない品目でも合う (1 点では反比例と差が区別できない)', () => {
    const basil = HYDROPONIC_CROPS.basil;
    expect(targetEcFor(basil)).toBeCloseTo(1.5, 6); // 走査が実物に当たっている
    const d = ecDose(3.0, basil, FULL_DOSING);
    if (d.kind !== 'dilute') throw new Error('dilute ではない');
    // 反比例: 1000 × (3.0 / 1.5 − 1) = 1000 L。
    // 差の取り違え: 1000 × (3.0 − 1.5) = 1500 L。
    expect(d.liters).toBeCloseTo(1_000, 6);

    const d2 = ecDose(2.25, basil, FULL_DOSING);
    if (d2.kind !== 'dilute') throw new Error('dilute ではない');
    // 反比例: 1000 × (2.25 / 1.5 − 1) = 500 L / 差: 750 L。
    expect(d2.liters).toBeCloseTo(500, 6);
  });

  it('★ 薄めた後の EC が目標に一致する (点に依らない関係)', () => {
    const tank = FULL_DOSING.tankLiters;
    if (tank === null) throw new Error('タンク容量が無い');
    for (const [crop, ec] of [
      [LETTUCE, 2.0],
      [LETTUCE, 1.35],
      [HYDROPONIC_CROPS.basil, 3.0],
      [HYDROPONIC_CROPS.basil, 2.25],
      [HYDROPONIC_CROPS.romaine, 4.8],
    ] as const) {
      const d = ecDose(ec, crop, FULL_DOSING);
      if (d.kind !== 'dilute') throw new Error(`dilute ではない (${crop.label} / ${ec})`);
      // 溶質の量は変わらない: ec × tank = target × (tank + 足した水)。
      const afterEc = (ec * tank) / (tank + d.liters);
      expect(afterEc, `${crop.label} EC ${ec}`).toBeCloseTo(d.targetEc, 6);
    }
  });

  it('★ 原液の EC 上昇率が無ければ mL を出さない (足りない物を名指す)', () => {
    const d = ecDose(0.5, LETTUCE, { ...FULL_DOSING, stockEcRisePerMlPerL: null });
    expect(d.kind).toBe('cannot');
    if (d.kind !== 'cannot') throw new Error('cannot ではない');
    expect(d.missing.join()).toContain('EC 上昇率');
    expect(d.how, '埋め方を言っていない').toContain('1 mL');
  });

  it('★ タンク容量が無ければ量を出さない (低い / 高いの両方向)', () => {
    for (const ec of [0.5, 2.0]) {
      const d = ecDose(ec, LETTUCE, { ...FULL_DOSING, tankLiters: null });
      expect(d.kind, `EC ${ec} で量を出しました`).toBe('cannot');
      if (d.kind !== 'cannot') throw new Error('cannot ではない');
      expect(d.missing.join()).toContain('タンクの容量');
    }
  });

  it('★ 測れていない EC には量を出さない (0 として扱わない)', () => {
    for (const bad of [null, Number.NaN, -1, 11]) {
      const d = ecDose(bad, LETTUCE, FULL_DOSING);
      expect(d.kind, `${String(bad)} で量を出しました`).toBe('cannot');
    }
  });

  it('上昇率が 0 や負なら断る (0 除算と符号の逆転を作らない)', () => {
    for (const rise of [0, -0.002]) {
      const d = ecDose(0.5, LETTUCE, { ...FULL_DOSING, stockEcRisePerMlPerL: rise });
      expect(d.kind).toBe('cannot');
    }
  });

  it('目標 EC は適正域の中央', () => {
    expect(targetEcFor(LETTUCE)).toBe((LETTUCE.ecLow + LETTUCE.ecHigh) / 2);
  });

  it('★ 適正域の中央が 0 なら薄める量を出さない (0 除算)', () => {
    const zero = { ...LETTUCE, ecLow: 0, ecHigh: 0 };
    const d = ecDose(1.0, zero, FULL_DOSING);
    expect(d.kind).toBe('cannot');
    if (d.kind !== 'cannot') throw new Error('cannot ではない');
    expect(d.missing.join()).toContain('EC 適正域');
  });
});

describe('酸 — pH までの量は出さない (当量だけ)', () => {
  /*
   * **期待値を定数そのものから作ってはいけない。** (2026-09-13 · パス 194 の対照)
   *
   * ここは以前 `((80 - 30) / MG_CACO3_PER_MEQ) * 1_000` を期待値にしていた ——
   * 定数を **50.04 → 100 に書き換えても両辺が一緒に動くので 70 件すべて緑**
   * だった (実測)。パス 57 の「関門が値と別の量で規則を再導出していた」と同じ形で、
   * 化学量論の定数が 1 つも留まっていなかった。
   *
   * 数は**外から**書く。CaCO₃ の当量重量は分子量 100.09 ÷ 2 価 = 50.04 mg/meq。
   */
  it('★ CaCO₃ の当量重量 50.04 mg/meq が動いていない', () => {
    expect(MG_CACO3_PER_MEQ).toBe(50.04);
  });

  it('★ 当量は化学量論どおり ((80−30)/50.04 × 1000 meq ÷ 1N = 999.20 mL)', () => {
    const d = acidToNeutralizeAlkalinity(FULL_DOSING);
    expect(d.kind).toBe('add-acid');
    if (d.kind !== 'add-acid') throw new Error('add-acid ではない');
    // 50 mg/L ÷ 50.04 mg/meq × 1,000 L ÷ 1 meq/mL。定数を写さず手計算の値を置く。
    expect(d.ml).toBeCloseTo(999.2006, 3);
  });

  it('★ 「目標 pH までの量ではない」と述べる (誤読を防ぐ断り)', () => {
    const d = acidToNeutralizeAlkalinity(FULL_DOSING);
    if (d.kind !== 'add-acid') throw new Error('add-acid ではない');
    expect(d.why).toContain('目標 pH までの量ではありません');
  });

  it('★ アルカリ度が無ければ量を出さず、手順を返す', () => {
    const d = acidToNeutralizeAlkalinity({ ...FULL_DOSING, alkalinityMgCaCO3PerL: null });
    expect(d.kind).toBe('cannot');
    if (d.kind !== 'cannot') throw new Error('cannot ではない');
    expect(d.missing.join()).toContain('アルカリ度');
    expect(d.how).toContain('少量ずつ');
  });

  it('足りない物は全部並べる (1 つだけ言って終わらない)', () => {
    const d = acidToNeutralizeAlkalinity({
      tankLiters: null,
      stockEcRisePerMlPerL: null,
      alkalinityMgCaCO3PerL: null,
      acidNormality: null,
      residualAlkalinityMgCaCO3PerL: 30,
    });
    if (d.kind !== 'cannot') throw new Error('cannot ではない');
    expect(d.missing).toHaveLength(3);
  });

  it('残すアルカリ度以下なら中和する分が無い', () => {
    const d = acidToNeutralizeAlkalinity({ ...FULL_DOSING, alkalinityMgCaCO3PerL: 20 });
    expect(d.kind).toBe('none');
  });

  it('規定度が 0 / 負なら断る (0 除算)', () => {
    for (const n of [0, -1]) {
      expect(acidToNeutralizeAlkalinity({ ...FULL_DOSING, acidNormality: n }).kind).toBe('cannot');
    }
  });

  it('★ pH が外れたときの答えは当量 —— EC のような「入れる量」ではない', () => {
    const f = assessField('ph', 7.5, LETTUCE, T);
    expect(f.status).toBe('high');
    const d = doseFor(f, LETTUCE, FULL_DOSING);
    expect(d?.kind).toBe('add-acid');
  });

  it('温度・湿度・CO₂・溶存酸素には調製の答えを出さない (入れる量では直らない)', () => {
    for (const field of ['waterTempC', 'airTempC', 'humidityPct', 'co2Ppm', 'dissolvedOxygenMgL'] as const) {
      const f = assessField(field, READING_FIELD_SPECS[field].plausibleMin, LETTUCE, T);
      expect(doseFor(f, LETTUCE, FULL_DOSING), `${field} に量を出しました`).toBeNull();
    }
  });
});

describe('補水', () => {
  it('液位から不足分の L を出す', () => {
    const d = topUpLiters(60, FULL_DOSING);
    expect(d.kind).toBe('top-up');
    if (d.kind !== 'top-up') throw new Error('top-up ではない');
    expect(d.liters).toBeCloseTo(400, 6);
  });

  it('満水なら何もしない', () => {
    expect(topUpLiters(100, FULL_DOSING).kind).toBe('none');
  });

  it('★ 液位が読めない / タンク容量が無ければ量を出さない', () => {
    expect(topUpLiters(null, FULL_DOSING).kind).toBe('cannot');
    expect(topUpLiters(Number.NaN, FULL_DOSING).kind).toBe('cannot');
    expect(topUpLiters(150, FULL_DOSING).kind).toBe('cannot');
    expect(topUpLiters(60, { ...FULL_DOSING, tankLiters: null }).kind).toBe('cannot');
  });

  it('★ 水だけ足すと EC が下がることを述べる', () => {
    const d = topUpLiters(60, FULL_DOSING);
    if (d.kind !== 'top-up') throw new Error('top-up ではない');
    expect(d.why).toContain('EC が下がります');
  });
});

// --- 工程 -----------------------------------------------------------------

const BATCH: CultivationBatch = {
  id: 'b1',
  cropId: 'leaf-lettuce',
  sowDate: '2026-09-01',
  panels: 10,
  state: 'nursery',
  transplantedDate: null,
  harvestedDate: null,
  solutionChangedDate: null,
  note: '',
};

describe('工程の日程', () => {
  it('定植予定 = 播種 + 育苗日数、収穫予定 = 定植予定 + 定植後日数', () => {
    const s = batchSchedule(BATCH, LETTUCE);
    expect(s).not.toBeNull();
    // リーフレタス: 育苗 24 日 / 定植後 10 日。
    expect(s!.transplantDue).toBe('2026-09-25');
    expect(s!.harvestDue).toBe('2026-10-05');
    expect(s!.harvestCountedFrom).toBe('planned-transplant');
  });

  it('★ 実際に定植した日が在れば、収穫予定はそこから数える (予定のままにしない)', () => {
    const late = { ...BATCH, transplantedDate: '2026-09-30', state: 'growing' as const };
    const s = batchSchedule(late, LETTUCE);
    expect(s!.harvestDue, '★ 定植が遅れたのに収穫予定が動きませんでした').toBe('2026-10-10');
    expect(s!.harvestCountedFrom).toBe('actual-transplant');
  });

  it('読めない播種日・日数は null (今日に倒さない)', () => {
    expect(batchSchedule({ ...BATCH, sowDate: '2026-02-30' }, LETTUCE)).toBeNull();
    expect(batchSchedule(BATCH, { ...LETTUCE, growOutDays: 0 })).toBeNull();
    expect(batchSchedule(BATCH, { ...LETTUCE, nurseryDays: -1 })).toBeNull();
    expect(batchSchedule(BATCH, { ...LETTUCE, growOutDays: 1.5 })).toBeNull();
  });

  it('育苗 0 日 (直播) は通る', () => {
    const s = batchSchedule(BATCH, { ...LETTUCE, nurseryDays: 0 });
    expect(s!.transplantDue).toBe('2026-09-01');
  });

  it('養液交換は前回から数え、記録が無ければ播種日から', () => {
    expect(nextSolutionChange(BATCH, 14)).toBe('2026-09-15');
    expect(nextSolutionChange({ ...BATCH, solutionChangedDate: '2026-09-10' }, 14)).toBe('2026-09-24');
    expect(nextSolutionChange(BATCH, 0)).toBeNull();
    expect(nextSolutionChange(BATCH, 1.5)).toBeNull();
  });

  it('★ K 抜きへの切替日 = 収穫予定 − 切替日数 (今日まで誰も出していなかった)', () => {
    const s = batchSchedule(BATCH, LETTUCE)!;
    expect(lowPotassiumSwitchDate(s, 7)).toBe('2026-09-28');
    expect(lowPotassiumSwitchDate(s, 10)).toBe('2026-09-25');
    expect(lowPotassiumSwitchDate(s, -1)).toBeNull();
    expect(lowPotassiumSwitchDate(s, 1.5)).toBeNull();
  });
});

// --- 今日やること ---------------------------------------------------------

describe('今日やること', () => {
  it('★ 記録が 1 件も無ければ「測定を記録する」を出す (静かに緑にしない)', () => {
    const tasks = dailyTasks(input());
    expect(tasks.some((t) => t.id === 'reading:none')).toBe(true);
    const s = summarize(input());
    expect(s.noReadings).toBe(true);
    expect(s.allOk, '★ 何も測っていないのに「全部正常」と答えました').toBe(false);
  });

  it('今日の測定が在って全項目 ok なら、測定の作業は出ない', () => {
    const tasks = dailyTasks(input({ readings: [goodReading('2026-09-13')] }));
    expect(tasks.filter((t) => t.id.startsWith('reading:'))).toHaveLength(0);
    expect(tasks.filter((t) => t.id.startsWith('measure:'))).toHaveLength(0);
    expect(summarize(input({ readings: [goodReading('2026-09-13')] })).allOk).toBe(true);
  });

  it('1 日空いたら warn、しきい値以上空いたら alert', () => {
    const one = dailyTasks(input({ readings: [goodReading('2026-09-12')] }));
    const t1 = one.find((t) => t.id === 'reading:today');
    expect(t1?.severity).toBe('warn');
    expect(t1?.overdueDays).toBe(1);

    const many = dailyTasks(input({ readings: [goodReading('2026-09-09')] }));
    const t2 = many.find((t) => t.id === 'reading:stale');
    expect(t2?.severity).toBe('alert');
    expect(t2?.overdueDays).toBe(4);
    expect(t2?.why).toContain('この間の養液の状態は分かりません');
  });

  it('★ 未測定の項目は info で必ず出る (画面から消えない)', () => {
    const r: HydroponicReading = {
      ...goodReading(),
      values: { ...goodReading().values, co2Ppm: null, dissolvedOxygenMgL: null },
    };
    const tasks = dailyTasks(input({ readings: [r] }));
    const measure = tasks.filter((t) => t.id.startsWith('measure:'));
    expect(measure).toHaveLength(2);
    for (const t of measure) {
      expect(t.severity).toBe('info');
      expect(t.why, '未測定であることを言っていない').toContain('未測定');
    }
  });

  it('★ 読めない値は「測り直す」で、妥当範囲を述べる', () => {
    const r: HydroponicReading = { ...goodReading(), values: { ...goodReading().values, ph: 99 } };
    const tasks = dailyTasks(input({ readings: [r] }));
    const t = tasks.find((x) => x.id === 'reread:ph');
    expect(t).toBeDefined();
    expect(t!.severity).toBe('warn');
    expect(t!.why).toContain('妥当な範囲');
    // 「高すぎ」の作業は出ない (読めないものは判定できない)。
    expect(tasks.some((x) => x.id === 'adjust:ph')).toBe(false);
  });

  it('★ 範囲外は alert で、調製の答えを持つ', () => {
    const r: HydroponicReading = { ...goodReading(), values: { ...goodReading().values, ec: 0.4 } };
    const tasks = dailyTasks(input({ readings: [r], dosing: FULL_DOSING }));
    const t = tasks.find((x) => x.id === 'adjust:ec');
    expect(t).toBeDefined();
    expect(t!.severity).toBe('alert');
    expect(t!.label).toContain('上げる');
    expect(t!.dose?.kind).toBe('add-stock');
  });

  it('★ 設備の値が無ければ、作業は出るが量は出ない (断りを持って出る)', () => {
    const r: HydroponicReading = { ...goodReading(), values: { ...goodReading().values, ec: 0.4 } };
    const tasks = dailyTasks(input({ readings: [r] })); // DEFAULT_DOSING_SETUP は空
    const t = tasks.find((x) => x.id === 'adjust:ec');
    expect(t, '★ 量が出せないと作業そのものが消えました').toBeDefined();
    expect(t!.dose?.kind).toBe('cannot');
  });

  it('定植予定日を過ぎた育苗中のロットは「定植する」', () => {
    const tasks = dailyTasks(input({ today: '2026-09-26', batches: [BATCH] }));
    const t = tasks.find((x) => x.id === 'batch:b1:transplant');
    expect(t).toBeDefined();
    expect(t!.dueDate).toBe('2026-09-25');
    expect(t!.overdueDays).toBe(1);
    expect(t!.severity).toBe('alert');
  });

  it('予定日ちょうどは warn (まだ遅れていない)', () => {
    const tasks = dailyTasks(input({ today: '2026-09-25', batches: [BATCH] }));
    expect(tasks.find((x) => x.id === 'batch:b1:transplant')?.severity).toBe('warn');
  });

  it('対照: 予定日の前日には出ない', () => {
    const tasks = dailyTasks(input({ today: '2026-09-24', batches: [BATCH] }));
    expect(tasks.some((x) => x.id === 'batch:b1:transplant')).toBe(false);
  });

  it('収穫予定を過ぎた定植済みロットは alert、近いだけなら info', () => {
    const growing: CultivationBatch = { ...BATCH, state: 'growing', transplantedDate: '2026-09-25' };
    const late = dailyTasks(input({ today: '2026-10-06', batches: [growing] }));
    expect(late.find((x) => x.id === 'batch:b1:harvest')?.severity).toBe('alert');

    const soon = dailyTasks(input({ today: '2026-10-03', batches: [growing] }));
    const t = soon.find((x) => x.id === 'batch:b1:harvest-soon');
    expect(t?.severity).toBe('info');
    expect(t?.why).toContain('あと 2 日');
  });

  it('収穫済み / 廃棄のロットは工程の作業を出さない', () => {
    for (const state of ['harvested', 'discarded'] as const) {
      const tasks = dailyTasks(input({ today: '2026-12-01', batches: [{ ...BATCH, state }] }));
      expect(tasks.filter((t) => t.batchId === 'b1'), state).toHaveLength(0);
    }
  });

  it('養液交換は周期を過ぎたら出る (記録が無ければ播種日から)', () => {
    const tasks = dailyTasks(input({ today: '2026-09-16', batches: [BATCH] }));
    const t = tasks.find((x) => x.id === 'batch:b1:solution-change');
    expect(t).toBeDefined();
    expect(t!.dueDate).toBe('2026-09-15');
    expect(t!.why).toContain('交換の記録がまだありません');
  });

  it('★ 低カリウム栽培の切替日を過ぎたら出て、実測が必要だと述べる', () => {
    const growing: CultivationBatch = { ...BATCH, state: 'growing' };
    const tasks = dailyTasks(
      input({
        today: '2026-09-29',
        batches: [growing],
        settings: { ...DEFAULT_CONTROL_SETTINGS, lowPotassium: true, lowPotassiumSwitchDays: 7 },
      }),
    );
    const t = tasks.find((x) => x.id === 'batch:b1:low-k-switch');
    expect(t).toBeDefined();
    expect(t!.dueDate).toBe('2026-09-28');
    expect(t!.why).toContain('実測が必要');
  });

  it('対照: 低カリウムを切っていれば切替の作業は出ない', () => {
    const tasks = dailyTasks(
      input({ today: '2026-09-29', batches: [{ ...BATCH, state: 'growing' }] }),
    );
    expect(tasks.some((x) => x.id === 'batch:b1:low-k-switch')).toBe(false);
  });

  it('★ 品目が消されたロットは「品目が見つかりません」と言う (黙って落とさない)', () => {
    const tasks = dailyTasks(input({ batches: [{ ...BATCH, cropId: 'custom-99' }] }));
    const t = tasks.find((x) => x.id === 'batch:b1:crop-missing');
    expect(t).toBeDefined();
    expect(t!.why).toContain('custom-99');
  });

  it('今日が読めなければ作業を出さない (誤った期限を作らない)', () => {
    expect(dailyTasks(input({ today: '2026-02-30' }))).toHaveLength(0);
    expect(dailyTasks(input({ today: 'きょう' }))).toHaveLength(0);
  });

  it('要約は重さごとに数え、「やることが無い」と「測っていない」を分ける', () => {
    const r: HydroponicReading = { ...goodReading(), values: { ...goodReading().values, ec: 0.4, co2Ppm: null } };
    const s = summarize(input({ readings: [r] }));
    expect(s.alerts).toBeGreaterThanOrEqual(1);
    expect(s.infos).toBeGreaterThanOrEqual(1);
    expect(s.noReadings).toBe(false);
    expect(s.allOk).toBe(false);
    expect(s.total).toBe(s.alerts + s.warns + s.infos);
  });

  it('直近の測定は日付で選ぶ (配列の順でない)', () => {
    const a = goodReading('2026-09-10');
    const b = goodReading('2026-09-13');
    expect(latestReading([b, a])?.at).toBe('2026-09-13');
    expect(latestReading([a, b])?.at).toBe('2026-09-13');
    expect(latestReading([])).toBeNull();
    // 読めない日付の控えは候補にしない。
    expect(latestReading([{ at: '2026-02-30', values: {}, batchId: null, note: '' }, a])?.at).toBe(
      '2026-09-10',
    );
  });

  it('★ 測定に紐づくロットの品目で判定する (タンクごとに品目が違う)', () => {
    // バジルは EC 1.2〜1.8。レタスの適正値 1.0 はバジルでは低い。
    const basil: CultivationBatch = { ...BATCH, id: 'b2', cropId: 'basil', state: 'growing' };
    const r: HydroponicReading = { ...goodReading(), batchId: 'b2' };
    const tasks = dailyTasks(input({ batches: [basil], readings: [r] }));
    expect(tasks.some((t) => t.id === 'adjust:ec'), '★ 品目ごとの適正域を見ていません').toBe(true);
  });
});
