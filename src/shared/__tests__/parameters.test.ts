/**
 * 数値パラメータの台帳の検査。
 *
 * 守る性質は 4 つ:
 * 1. 既定値は各モジュールの定数**そのもの** (写しではない)。
 * 2. 保存された上書きは検証して読む (壊れた保存で画面が落ちない・通らない値は効かない)。
 * 3. 画面の値 (scale 後) と内部値の往復が既定値で崩れない。
 * 4. 取り出し口は台帳の id を関数の引数の形へ**正しい対応で**組む。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMETER_VALUES,
  PARAMETERS,
  PARAMETER_BY_ID,
  PARAMETER_KIND_LABEL,
  ckdPotassiumLimits,
  displayValue,
  dscrThresholds,
  fromDisplayValue,
  hydroponicsProductionParams,
  isParameterId,
  lowPotassiumParams,
  overriddenCount,
  parameterDefinitions,
  parameterFeatures,
  parameterIssue,
  resolveParameters,
  sanitizeParameterOverrides,
  toDisplayValue,
  type ParameterDef,
  type ParameterId,
  type ParameterOverrides,
} from '../parameters';
import {
  CKD_POTASSIUM_LIMIT_MG,
  DAYS_PER_YEAR,
  DEFAULT_LOW_POTASSIUM_PARAMS,
  DEFAULT_PRODUCTION_PARAMS,
  LOW_K_SWITCH_DAYS_MAX,
  LOW_K_SWITCH_DAYS_MIN,
  PANEL_AREA_SQM,
  REFERENCE_LETTUCE_POTASSIUM_MG,
  SALT_EQUIVALENT_FACTOR,
} from '../hydroponics';
import { COMMUTE_PUBLIC_TRANSPORT_CAP } from '../payroll';
import { DEFAULT_DSCR_THRESHOLDS, DSCR_CAUTION_THRESHOLD, DSCR_DANGER_THRESHOLD } from '../realEstateMetrics';
import { CONSUMPTION_TAX_REDUCED, CONSUMPTION_TAX_STANDARD } from '../taxCalc';
import { DEFAULT_EFFECTIVE_TAX_RATE } from '../funding';

const def = (id: ParameterId): ParameterDef => PARAMETER_BY_ID.get(id)!;

/** 走査用 — `as const` の合併型は `integer` / `scale` を持たない要素があるので、台帳の型で読む。 */
const DEFS: readonly ParameterDef[] = PARAMETERS;

/** 既定値がモジュールの定数そのものであること (id → 定数)。 */
const DEFAULT_SOURCE: Readonly<Record<ParameterId, number>> = {
  'hydroponics.panelAreaSqm': PANEL_AREA_SQM,
  'hydroponics.daysPerYear': DAYS_PER_YEAR,
  'hydroponics.referenceLettucePotassiumMg': REFERENCE_LETTUCE_POTASSIUM_MG,
  'hydroponics.saltEquivalentFactor': SALT_EQUIVALENT_FACTOR,
  'hydroponics.lowKSwitchDaysMin': LOW_K_SWITCH_DAYS_MIN,
  'hydroponics.lowKSwitchDaysMax': LOW_K_SWITCH_DAYS_MAX,
  'hydroponics.ckdPotassiumLimitG3b': CKD_POTASSIUM_LIMIT_MG.G3b!,
  'hydroponics.ckdPotassiumLimitG4': CKD_POTASSIUM_LIMIT_MG.G4!,
  'hydroponics.ckdPotassiumLimitG5': CKD_POTASSIUM_LIMIT_MG.G5!,
  'payroll.commutePublicTransportCap': COMMUTE_PUBLIC_TRANSPORT_CAP,
  'realEstate.dscrDangerThreshold': DSCR_DANGER_THRESHOLD,
  'realEstate.dscrCautionThreshold': DSCR_CAUTION_THRESHOLD,
  'tax.consumptionStandardRate': CONSUMPTION_TAX_STANDARD,
  'tax.consumptionReducedRate': CONSUMPTION_TAX_REDUCED,
  'finance.effectiveTaxRate': DEFAULT_EFFECTIVE_TAX_RATE,
};

describe('台帳の形', () => {
  it('id は重複しない・全件が写像に載る', () => {
    const ids = PARAMETERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PARAMETER_BY_ID.size).toBe(ids.length);
    for (const id of ids) expect(PARAMETER_BY_ID.get(id)?.id).toBe(id);
  });

  it('既定値はモジュールの定数そのもの (写しではない)', () => {
    expect(Object.keys(DEFAULT_SOURCE).sort()).toEqual(PARAMETERS.map((p) => p.id).slice().sort());
    for (const [id, expected] of Object.entries(DEFAULT_SOURCE)) {
      expect(def(id as ParameterId).defaultValue, id).toBe(expected);
      expect(DEFAULT_PARAMETER_VALUES[id as ParameterId], id).toBe(expected);
    }
  });

  it('既定値は範囲の内側・範囲は正の幅・整数の既定は整数・種別は表に在る', () => {
    for (const p of DEFS) {
      expect(p.min, p.id).toBeLessThan(p.max);
      expect(p.defaultValue, p.id).toBeGreaterThanOrEqual(p.min);
      expect(p.defaultValue, p.id).toBeLessThanOrEqual(p.max);
      expect(Number.isFinite(p.defaultValue), p.id).toBe(true);
      if (p.integer) expect(Number.isInteger(toDisplayValue(p, p.defaultValue)), p.id).toBe(true);
      expect(PARAMETER_KIND_LABEL[p.kind], p.id).toBeTruthy();
      expect(p.label.length, p.id).toBeGreaterThan(0);
      expect(p.feature.length, p.id).toBeGreaterThan(0);
      // 既定値そのものが検査を通らなければ、画面が最初から「範囲外」を出す。
      expect(parameterIssue(p, p.defaultValue), p.id).toBeNull();
    }
  });

  it('画面のまとまりは登場順で、重複しない', () => {
    expect(parameterFeatures()).toEqual(['水耕栽培', '給与', '不動産', '税', '財務']);
  });

  it('割合は % で見せる (scale 100)、それ以外は素のまま', () => {
    for (const p of DEFS) {
      if (p.unit === '%') expect(p.scale, p.id).toBe(100);
      else expect(p.scale, p.id).toBeUndefined();
    }
  });

  it('安全上限 (通信・保存・暗号・入力長) は台帳に載らない', () => {
    // 載せない理由は台帳の冒頭。名前で見る — 増えたら設計から問い直す。
    for (const p of DEFS) {
      expect(p.id, p.id).not.toMatch(/timeout|iteration|maxBytes|maxLength|maxRecords|pbkdf/i);
    }
    // 標本: この規則は実際にその名前へ当たる。
    expect('vault.pbkdf2Iterations').toMatch(/timeout|iteration|maxBytes|maxLength|maxRecords|pbkdf/i);
  });

  it('isParameterId は台帳の id だけを通す', () => {
    for (const p of DEFS) expect(isParameterId(p.id)).toBe(true);
    for (const bad of ['', 'nope', 'hydroponics.energyIntensityLow', 42, null, undefined, {}]) {
      expect(isParameterId(bad), String(bad)).toBe(false);
    }
  });
});

describe('値の検査 (parameterIssue)', () => {
  const INT: ParameterDef = {
    id: 'x.int', feature: 'x', label: 'x', unit: '日', defaultValue: 5, min: 1, max: 10, integer: true, kind: 'assumption',
  };
  const PCT: ParameterDef = {
    id: 'x.pct', feature: 'x', label: 'x', unit: '%', scale: 100, defaultValue: 0.1, min: 0.05, max: 0.5, kind: 'law',
  };

  it('数でない・有限でない値を断る', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity, '5', null, undefined, {}]) {
      expect(parameterIssue(INT, bad), String(bad)).toBe('数値で入力してください');
    }
  });

  it('範囲は両端を含む・外れたら画面の値と単位で言う', () => {
    expect(parameterIssue(INT, 1)).toBeNull();
    expect(parameterIssue(INT, 10)).toBeNull();
    expect(parameterIssue(INT, 0.999)).toBe('1日 以上で入力してください');
    expect(parameterIssue(INT, 10.001)).toBe('10日 以下で入力してください');
    // % は scale 後の値で言う (0.05 ではなく 5%)。
    expect(parameterIssue(PCT, 0.04)).toBe('5% 以上で入力してください');
    expect(parameterIssue(PCT, 0.51)).toBe('50% 以下で入力してください');
    expect(parameterIssue(PCT, 0.07)).toBeNull();
  });

  it('整数の指定は画面の値で見る (scale 後)', () => {
    expect(parameterIssue(INT, 2.5)).toBe('整数で入力してください');
    const INT_PCT: ParameterDef = { ...PCT, integer: true, min: 0, max: 1 };
    expect(parameterIssue(INT_PCT, 0.07)).toBeNull(); // 7%
    expect(parameterIssue(INT_PCT, 0.075)).toBe('整数で入力してください'); // 7.5%
  });

  it('範囲の順に見る (数値 → 下限 → 上限 → 整数)', () => {
    // 0.5 は下限より下でもあり整数でもない — 先に下限を言う。
    expect(parameterIssue(INT, 0.5)).toBe('1日 以上で入力してください');
    expect(parameterIssue(INT, 10.5)).toBe('10日 以下で入力してください');
  });
});

describe('画面の値と内部値の往復', () => {
  it('scale を掛けて丸める (0.07 × 100 は 7、7.000000000000001 ではない)', () => {
    const PCT = def('tax.consumptionStandardRate');
    expect(0.07 * 100).not.toBe(7); // 標本: 素の掛け算は尾を出す
    expect(toDisplayValue(PCT, 0.07)).toBe(7);
    expect(fromDisplayValue(PCT, 7)).toBe(0.07);
    expect(displayValue('tax.consumptionStandardRate', 0.1)).toBe(10);
    expect(displayValue('hydroponics.daysPerYear', 300)).toBe(300);
  });

  it('全パラメータの既定値は往復しても同じ', () => {
    for (const p of DEFS) {
      expect(fromDisplayValue(p, toDisplayValue(p, p.defaultValue)), p.id).toBe(p.defaultValue);
    }
  });
});

describe('保存された上書きの読み込み (sanitize / resolve)', () => {
  it('物でない保存は空', () => {
    for (const raw of [null, undefined, 'x', 1, true, []]) {
      expect(sanitizeParameterOverrides(raw)).toEqual({});
    }
  });

  it('知らない id・通らない値・数でない値は捨て、通る値と既定と同じ値は残す', () => {
    const out = sanitizeParameterOverrides({
      'hydroponics.daysPerYear': 300,
      'hydroponics.panelAreaSqm': 0, // 下限 0.05 未満
      'tax.consumptionStandardRate': 9, // 上限 0.5 超
      'payroll.commutePublicTransportCap': '150000', // 文字列
      'realEstate.dscrDangerThreshold': Number.NaN,
      'hydroponics.lowKSwitchDaysMin': LOW_K_SWITCH_DAYS_MIN, // 既定と同じ — 明示した値は残す
      bogus: 1,
    });
    expect(out).toEqual({
      'hydroponics.daysPerYear': 300,
      'hydroponics.lowKSwitchDaysMin': LOW_K_SWITCH_DAYS_MIN,
    });
  });

  it('resolve は既定に上書きを重ね、通らない上書きは既定に落とす', () => {
    expect(resolveParameters()).toEqual(DEFAULT_PARAMETER_VALUES);
    expect(resolveParameters({})).toEqual(DEFAULT_PARAMETER_VALUES);
    const v = resolveParameters({
      'hydroponics.daysPerYear': 300,
      'hydroponics.panelAreaSqm': 0,
      'tax.consumptionReducedRate': undefined,
    } as ParameterOverrides);
    expect(v['hydroponics.daysPerYear']).toBe(300);
    expect(v['hydroponics.panelAreaSqm']).toBe(PANEL_AREA_SQM);
    expect(v['tax.consumptionReducedRate']).toBe(CONSUMPTION_TAX_REDUCED);
    // 触っていない id は全部既定。
    for (const p of DEFS) {
      if (p.id !== 'hydroponics.daysPerYear') expect(v[p.id as ParameterId], p.id).toBe(p.defaultValue);
    }
  });

  it('既定そのものは resolve() と同じで、凍っている必要はないが写しである', () => {
    expect(DEFAULT_PARAMETER_VALUES).toEqual(resolveParameters());
    expect(DEFAULT_PARAMETER_VALUES).not.toBe(resolveParameters());
  });

  it('overriddenCount は台帳の id だけを数える', () => {
    expect(overriddenCount({})).toBe(0);
    expect(overriddenCount({ 'hydroponics.daysPerYear': 300, 'tax.consumptionStandardRate': 0.12 })).toBe(2);
    expect(overriddenCount({ bogus: 1 } as unknown as ParameterOverrides)).toBe(0);
  });
});

describe('機能ごとの取り出し口', () => {
  const custom = resolveParameters({
    'hydroponics.panelAreaSqm': 1,
    'hydroponics.daysPerYear': 300,
    'hydroponics.referenceLettucePotassiumMg': 400,
    'hydroponics.saltEquivalentFactor': 2,
    'hydroponics.lowKSwitchDaysMin': 3,
    'hydroponics.lowKSwitchDaysMax': 5,
    'hydroponics.ckdPotassiumLimitG3b': 1000,
    'hydroponics.ckdPotassiumLimitG4': 800,
    'hydroponics.ckdPotassiumLimitG5': 600,
    'realEstate.dscrDangerThreshold': 1.5,
    'realEstate.dscrCautionThreshold': 2,
  });

  it('既定は各モジュールの既定引数と同じ物', () => {
    expect(hydroponicsProductionParams(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_PRODUCTION_PARAMS);
    expect(lowPotassiumParams(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_LOW_POTASSIUM_PARAMS);
    expect(ckdPotassiumLimits(DEFAULT_PARAMETER_VALUES)).toEqual(CKD_POTASSIUM_LIMIT_MG);
    expect(dscrThresholds(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_DSCR_THRESHOLDS);
  });

  it('上書きは正しい引数へ届く (id と引数の対応を 1 つずつ)', () => {
    expect(hydroponicsProductionParams(custom)).toEqual({ panelAreaSqm: 1, daysPerYear: 300 });
    expect(lowPotassiumParams(custom)).toEqual({
      referencePotassiumMgPer100g: 400,
      saltEquivalentFactor: 2,
      switchDaysMin: 3,
      switchDaysMax: 5,
    });
    expect(ckdPotassiumLimits(custom)).toEqual({ G1: null, G2: null, G3a: null, G3b: 1000, G4: 800, G5: 600 });
    expect(dscrThresholds(custom)).toEqual({ danger: 1.5, caution: 2 });
  });

  it('制限のない病期 (G1〜G3a) の null は上書きしても保たれる', () => {
    const limits = ckdPotassiumLimits(custom);
    expect(limits.G1).toBeNull();
    expect(limits.G2).toBeNull();
    expect(limits.G3a).toBeNull();
  });
});

/**
 * 台帳の表そのものを固定する。表は関数 `parameterDefinitions()` が組む —
 * 検査がそれを呼ぶことで、モジュール読込時にしか走らない表 (静的な値) も
 * 変異が測れる (`vi.resetModules()` で読み直すと依存先の表まで測定に入る)。
 */
describe('台帳の表 (静的な値の固定)', () => {
  it('id・単位・倍率・範囲・整数・種別の組が 1 つも動いていない', () => {
    const m = { PARAMETERS: parameterDefinitions(), PARAMETER_KIND_LABEL };
    expect(m.PARAMETERS).toEqual(PARAMETERS);
    const rows = (m.PARAMETERS as readonly ParameterDef[]).map((p) => [p.id, p.unit, p.scale ?? 1, p.min, p.max, p.integer === true, p.kind]);
    expect(rows).toEqual([
      ['hydroponics.panelAreaSqm', 'm²', 1, 0.05, 10, false, 'reference'],
      ['hydroponics.daysPerYear', '日', 1, 1, 366, true, 'assumption'],
      ['hydroponics.referenceLettucePotassiumMg', 'mg/100g', 1, 1, 5_000, false, 'reference'],
      ['hydroponics.saltEquivalentFactor', '', 1, 1, 5, false, 'law'],
      ['hydroponics.lowKSwitchDaysMin', '日', 1, 1, 60, true, 'reference'],
      ['hydroponics.lowKSwitchDaysMax', '日', 1, 1, 60, true, 'reference'],
      ['hydroponics.ckdPotassiumLimitG3b', 'mg', 1, 100, 10_000, true, 'reference'],
      ['hydroponics.ckdPotassiumLimitG4', 'mg', 1, 100, 10_000, true, 'reference'],
      ['hydroponics.ckdPotassiumLimitG5', 'mg', 1, 100, 10_000, true, 'reference'],
      ['payroll.commutePublicTransportCap', '円', 1, 0, 1_000_000, true, 'law'],
      ['realEstate.dscrDangerThreshold', '倍', 1, 0.1, 10, false, 'threshold'],
      ['realEstate.dscrCautionThreshold', '倍', 1, 0.1, 10, false, 'threshold'],
      ['tax.consumptionStandardRate', '%', 100, 0, 0.5, false, 'law'],
      ['tax.consumptionReducedRate', '%', 100, 0, 0.5, false, 'law'],
      ['finance.effectiveTaxRate', '%', 100, 0, 1, false, 'assumption'],
    ]);
    expect(m.PARAMETER_KIND_LABEL).toEqual({ law: '法定値', reference: '参考値', threshold: 'しきい値', assumption: '前提' });
    // 出典と注記は空でない (法定値には出典が要る)。
    for (const p of m.PARAMETERS as readonly ParameterDef[]) {
      if (p.kind === 'law') expect(p.source, p.id).toBeTruthy();
      expect(p.label.trim(), p.id).toBe(p.label);
    }
  });
});
