import { describe, expect, it } from 'vitest';
import {
  MANUAL_METRICS_COLLECTION,
  MANUAL_OVERRIDES_COLLECTION,
  applyManualOverrides,
  catalogFor,
  hasCatalog,
  metricsForScope,
  overridesForScope,
  parseManualMetric,
  scopesWithCatalog,
  sectionsFor,
  type ManualMetricEntry,
  type ManualOverrideEntry,
} from '../manualData';
import { OVERRIDABLE_FIELDS } from '../overviewOverrides';

const ov = (scope: string, path: string, value: number): ManualOverrideEntry => ({
  scope,
  path,
  value,
});
const mt = (scope: string, label: string, value: number): ManualMetricEntry => ({
  scope,
  label,
  value,
  unit: 'yen',
});

/**
 * 一覧を持つ画面の期待値。**定義側から組み立てない** — 一覧を空にする変更が
 * 期待値も一緒に消してしまうため（罠 2-c-2）。
 */
const EXPECTED_SCOPES = ['overview', 'sales'];

describe('画面ごとの一覧', () => {
  // 宣言順そのものを固定する（並べ替えないので、順序を変えたら落ちる）。
  it('一覧を持つ画面と、その宣言順が期待どおり', () => {
    expect(scopesWithCatalog()).toEqual(EXPECTED_SCOPES);
  });

  it('経営サマリーの一覧は overviewOverrides のものと同じ', () => {
    expect(catalogFor('overview')).toBe(OVERRIDABLE_FIELDS);
    expect(catalogFor('overview').length).toBe(45);
  });

  it('売上の一覧は 3 項目で、パスとラベルが期待どおり', () => {
    expect(catalogFor('sales').map((f) => [f.path, f.label, f.unit])).toEqual([
      ['totalAmount', '売上合計', 'yen'],
      ['totalOrders', '受注件数', 'count'],
      ['aov', '平均単価', 'yen'],
    ]);
  });

  it('平均単価は売上合計と受注件数から計算されると宣言している', () => {
    expect(catalogFor('sales').find((f) => f.path === 'aov')?.derivedFrom).toEqual([
      'totalAmount',
      'totalOrders',
    ]);
  });

  it('一覧を持たない画面は空', () => {
    for (const s of ['github', 'notion', 'slack', '', 'nope']) {
      expect(catalogFor(s), s).toEqual([]);
      expect(hasCatalog(s), s).toBe(false);
    }
  });

  it('一覧を持つ画面は hasCatalog が true', () => {
    for (const s of EXPECTED_SCOPES) expect(hasCatalog(s), s).toBe(true);
  });

  // プロトタイプ由来のキーを画面 id として渡されても一覧が生えない。
  it('__proto__ や constructor でも一覧は空', () => {
    for (const s of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(catalogFor(s), s).toEqual([]);
      expect(hasCatalog(s), s).toBe(false);
    }
  });

  it('まとまりは一覧の順序を保つ', () => {
    expect(sectionsFor('sales').map((g) => g.section)).toEqual(['売上']);
    expect(sectionsFor('sales')[0]?.fields.length).toBe(3);
  });

  it('一覧を持たない画面のまとまりは空', () => {
    expect(sectionsFor('github')).toEqual([]);
  });
});

describe('scope での絞り込み', () => {
  const overrides = [ov('overview', 'kpi.revenue', 1), ov('sales', 'totalAmount', 2), ov('overview', 'kpi.bep', 3)];
  const metrics = [mt('overview', 'a', 1), mt('github', 'b', 2), mt('overview', 'c', 3)];

  it('上書きはその画面のものだけ', () => {
    expect(overridesForScope('overview', overrides).map((r) => r.path)).toEqual([
      'kpi.revenue',
      'kpi.bep',
    ]);
    expect(overridesForScope('sales', overrides).map((r) => r.path)).toEqual(['totalAmount']);
  });

  it('任意項目もその画面のものだけ', () => {
    expect(metricsForScope('overview', metrics).map((r) => r.label)).toEqual(['a', 'c']);
    expect(metricsForScope('github', metrics).map((r) => r.label)).toEqual(['b']);
  });

  it('該当が無ければ空', () => {
    expect(overridesForScope('nope', overrides)).toEqual([]);
    expect(metricsForScope('nope', metrics)).toEqual([]);
  });

  it('空の入力でも落ちない', () => {
    expect(overridesForScope('overview', [])).toEqual([]);
    expect(metricsForScope('overview', [])).toEqual([]);
  });
});

describe('applyManualOverrides', () => {
  it('その画面の上書きだけを当てる', () => {
    const base = { totalAmount: 100, totalOrders: 4, aov: 25 };
    const r = applyManualOverrides('sales', base, [
      ov('sales', 'totalAmount', 999),
      ov('overview', 'kpi.revenue', 1),
    ]);
    expect(r.overview.totalAmount).toBe(999);
    expect(r.overridden).toEqual(['totalAmount']);
    // 他の画面の上書きは、そもそも渡らないので ignored にも入らない。
    expect(r.ignored).toEqual([]);
  });

  it('その画面の一覧に無いパスは ignored', () => {
    const base = { totalAmount: 100 };
    const r = applyManualOverrides('sales', base, [ov('sales', 'kpi.revenue', 1)]);
    expect(r.ignored).toEqual(['kpi.revenue']);
    expect(r.overridden).toEqual([]);
  });

  // 一覧を持たない画面では何も起きない。呼び出し側で分岐を書かなくてよい。
  it('一覧を持たない画面では何も起きず、渡した値は無視される', () => {
    const base = { anything: 1 };
    const r = applyManualOverrides('github', base, [ov('github', 'anything', 999)]);
    expect(r.overview).toBe(base);
    expect(r.overridden).toEqual([]);
    expect(r.ignored).toEqual(['anything']);
  });

  it('上書きが無ければ元のオブジェクトをそのまま返す', () => {
    const base = { totalAmount: 100 };
    expect(applyManualOverrides('sales', base, []).overview).toBe(base);
  });

  it('計算元を置くと、そこから計算される指標が staleDerived に出る', () => {
    const base = { totalAmount: 100, totalOrders: 4, aov: 25 };
    const r = applyManualOverrides('sales', base, [ov('sales', 'totalAmount', 999)]);
    expect(r.staleDerived.map((d) => d.path)).toEqual(['aov']);
    expect(r.staleDerived[0]?.because).toEqual(['totalAmount']);
  });

  it('経営サマリーの上書きも同じ入口で当たる', () => {
    const base = { kpi: { revenue: 1, operatingMarginPct: 10 } };
    const r = applyManualOverrides('overview', base, [ov('overview', 'kpi.revenue', 500)]);
    expect(r.overview.kpi.revenue).toBe(500);
    expect(r.staleDerived.map((d) => d.path)).toContain('kpi.operatingMarginPct');
  });

  it('元のオブジェクトを書き換えない', () => {
    const base = { totalAmount: 100 };
    applyManualOverrides('sales', base, [ov('sales', 'totalAmount', 999)]);
    expect(base.totalAmount).toBe(100);
  });
});

describe('parseManualMetric', () => {
  it('項目名・値・単位がそろえば通る', () => {
    const r = parseManualMetric({ label: '客単価', value: '1200', unit: 'yen' });
    expect(r.ok && r.entry).toEqual({ label: '客単価', value: 1200, unit: 'yen' });
  });

  it('事業を指定すると保持する', () => {
    const r = parseManualMetric({ label: 'x', value: '1', unit: 'yen', businessId: 'b1' });
    expect(r.ok && r.entry).toEqual({ label: 'x', value: 1, unit: 'yen', businessId: 'b1' });
  });

  it('事業が空・空白なら持たせない', () => {
    for (const businessId of ['', '   ', undefined]) {
      const r = parseManualMetric({ label: 'x', value: '1', unit: 'yen', businessId });
      expect(r.ok && Object.hasOwn(r.entry, 'businessId'), String(businessId)).toBe(false);
    }
  });

  it('事業 id の前後の空白は落とす', () => {
    const r = parseManualMetric({ label: 'x', value: '1', unit: 'yen', businessId: '  b1  ' });
    expect(r.ok && r.entry.businessId).toBe('b1');
  });

  it('メモも保持する', () => {
    const r = parseManualMetric({ label: 'x', value: '1', unit: 'yen', note: 'めも' });
    expect(r.ok && r.entry.note).toBe('めも');
  });

  // 値の規則は上書きと同じ 1 本 (parseOverrideValue) を通る。
  it('値の検証は上書きと同じ規則', () => {
    expect(parseManualMetric({ label: 'x', value: '1,000', unit: 'yen' }).ok).toBe(false);
    expect(parseManualMetric({ label: 'x', value: '1.5', unit: 'count' }).ok).toBe(false);
    expect(parseManualMetric({ label: 'x', value: '-1', unit: 'count' }).ok).toBe(false);
  });

  it('項目名が空・単位が未知なら断る', () => {
    expect(parseManualMetric({ label: '', value: '1', unit: 'yen' }).ok).toBe(false);
    expect(parseManualMetric({ label: 'x', value: '1', unit: 'dollars' }).ok).toBe(false);
  });

  it('断るときは理由が付き、場合ごとに違う', () => {
    const reasons = [
      parseManualMetric({ label: '', value: '1', unit: 'yen' }),
      parseManualMetric({ label: 'x', value: '', unit: 'yen' }),
      parseManualMetric({ label: 'x', value: '1', unit: 'dollars' }),
      parseManualMetric({ label: 'x', value: '1.5', unit: 'count' }),
    ].map((r) => (r.ok ? '' : r.reason));
    for (const r of reasons) expect(r.length).toBeGreaterThan(0);
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  // scope は入力欄の値ではないので、検証では付けない。
  it('scope は入力から作らない', () => {
    const r = parseManualMetric({ label: 'x', value: '1', unit: 'yen' });
    expect(r.ok && Object.hasOwn(r.entry, 'scope')).toBe(false);
  });
});

describe('保存先の名前', () => {
  it('collection 名は決め打ち（変わると保存済みの手入力が読めなくなる）', () => {
    expect(MANUAL_METRICS_COLLECTION).toBe('manual-metrics');
    expect(MANUAL_OVERRIDES_COLLECTION).toBe('manual-overrides');
    expect(MANUAL_METRICS_COLLECTION).not.toBe(MANUAL_OVERRIDES_COLLECTION);
  });
});
