import { describe, expect, it } from 'vitest';
import {
  CUSTOM_METRIC_MAX_LABEL,
  CUSTOM_METRIC_MAX_NOTE,
  OVERRIDABLE_FIELDS,
  OVERVIEW_CUSTOM_METRICS_COLLECTION,
  OVERVIEW_OVERRIDES_COLLECTION,
  applyOverviewOverrides,
  fieldsBySection,
  findOverridableField,
  formatMetric,
  isMetricUnit,
  parseCustomMetric,
  parseOverrideValue,
  type MetricUnit,
  type OverrideEntry,
} from '../overviewOverrides';

const entry = (path: string, value: number): OverrideEntry => ({ path, value });

/** 上書き先として使う、経営概況のごく一部を写した器。 */
function baseOverview() {
  return {
    sales: { totalAmount: 100, totalOrders: 4, aov: 25, channelCount: 2 },
    kpi: { revenue: 1000, operatingProfit: 100, operatingMarginPct: 10, grossProfit: 400, grossMarginPct: 40 },
    team: { members: 5, seatLimit: 10 },
    productivity: { revenuePerCapita: 200, labor: { laborCost: 300, laborSharePct: 30 } },
    financialPosition: { totalAssets: 5000, totalLiabilities: 2000, netAssets: 3000 },
    runwayMonths: 6,
  };
}

describe('OVERRIDABLE_FIELDS', () => {
  it('パスが重複していない', () => {
    const paths = OVERRIDABLE_FIELDS.map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('ラベル・セクション・単位がすべて埋まっている', () => {
    for (const f of OVERRIDABLE_FIELDS) {
      expect(f.label.length, f.path).toBeGreaterThan(0);
      expect(f.section.length, f.path).toBeGreaterThan(0);
      expect(isMetricUnit(f.unit), f.path).toBe(true);
    }
  });

  // derivedFrom が実在しないパスを指していると、staleDerived の警告が永久に出ない。
  it('derivedFrom は一覧にあるパスだけを指す', () => {
    const paths = new Set(OVERRIDABLE_FIELDS.map((f) => f.path));
    for (const f of OVERRIDABLE_FIELDS) {
      for (const src of f.derivedFrom ?? []) {
        expect(paths.has(src), `${f.path} ← ${src}`).toBe(true);
      }
    }
  });

  it('自分自身を計算元にしていない', () => {
    for (const f of OVERRIDABLE_FIELDS) {
      expect(f.derivedFrom ?? [], f.path).not.toContain(f.path);
    }
  });
});

describe('findOverridableField', () => {
  it('一覧にあるパスを引ける', () => {
    expect(findOverridableField('kpi.revenue')?.label).toBe('売上高');
  });

  it('一覧に無いパスは null', () => {
    expect(findOverridableField('kpi.unknown')).toBeNull();
    expect(findOverridableField('')).toBeNull();
  });

  // allowlist なので、プロトタイプを触りにくる名前も素通りしない。
  it('__proto__ や constructor も null', () => {
    expect(findOverridableField('__proto__')).toBeNull();
    expect(findOverridableField('constructor')).toBeNull();
    expect(findOverridableField('kpi.__proto__')).toBeNull();
  });
});

describe('fieldsBySection', () => {
  it('全項目がどれかのセクションに入る', () => {
    const total = fieldsBySection().reduce((n, s) => n + s.fields.length, 0);
    expect(total).toBe(OVERRIDABLE_FIELDS.length);
  });

  it('一覧の並び順を保つ', () => {
    const flat = fieldsBySection().flatMap((s) => s.fields.map((f) => f.path));
    expect(flat).toEqual(OVERRIDABLE_FIELDS.map((f) => f.path));
  });

  it('同じセクションが連続していれば 1 つにまとまる', () => {
    const sections = fieldsBySection().map((s) => s.section);
    expect(new Set(sections).size).toBe(sections.length);
  });
});

describe('parseOverrideValue', () => {
  it('半角の整数・小数を受ける', () => {
    expect(parseOverrideValue('1000', 'yen')).toEqual({ ok: true, value: 1000 });
    expect(parseOverrideValue('12.5', 'pct')).toEqual({ ok: true, value: 12.5 });
    expect(parseOverrideValue('  42  ', 'count')).toEqual({ ok: true, value: 42 });
  });

  it('負の値は円・％・日数では受ける（赤字や短縮を表せる必要がある）', () => {
    expect(parseOverrideValue('-500', 'yen').ok).toBe(true);
    expect(parseOverrideValue('-3.2', 'pct').ok).toBe(true);
    expect(parseOverrideValue('-10', 'days').ok).toBe(true);
  });

  it('件数と月数は負を受けない', () => {
    expect(parseOverrideValue('-1', 'count').ok).toBe(false);
    expect(parseOverrideValue('-1', 'months').ok).toBe(false);
  });

  it('件数は整数のみ', () => {
    expect(parseOverrideValue('3.5', 'count').ok).toBe(false);
    expect(parseOverrideValue('3', 'count').ok).toBe(true);
  });

  it('空・全角・カンマ・単位語は断る', () => {
    for (const bad of ['', '   ', '１０００', '1,000', '1000円', '1e3', '--1', '.5', 'abc']) {
      expect(parseOverrideValue(bad, 'yen').ok, bad).toBe(false);
    }
  });

  it('範囲の境界', () => {
    expect(parseOverrideValue('1000000000000000', 'yen').ok).toBe(true);
    expect(parseOverrideValue('1000000000001', 'months').ok).toBe(false);
    expect(parseOverrideValue('100000', 'pct').ok).toBe(true);
    expect(parseOverrideValue('100001', 'pct').ok).toBe(false);
    expect(parseOverrideValue('0', 'count').ok).toBe(true);
  });

  it('小数点以下は 2 桁以上も受ける', () => {
    expect(parseOverrideValue('1.25', 'yen')).toEqual({ ok: true, value: 1.25 });
    expect(parseOverrideValue('-0.125', 'pct')).toEqual({ ok: true, value: -0.125 });
  });

  // 桁が多すぎると Number() が Infinity になる。範囲の判定より先に断る。
  it('数値として読めない桁数は、範囲ではなく「読めない」として断る', () => {
    const r = parseOverrideValue('9'.repeat(400), 'yen');
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.reason).toBe('数値として読めません。');
  });

  it('断るときは理由が付く', () => {
    const r = parseOverrideValue('abc', 'yen');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
  });
});

describe('applyOverviewOverrides', () => {
  it('指定した数値だけを置き換える', () => {
    const r = applyOverviewOverrides(baseOverview(), [entry('kpi.revenue', 2000)]);
    expect(r.overview.kpi.revenue).toBe(2000);
    expect(r.overview.kpi.operatingProfit).toBe(100);
    expect(r.overridden).toEqual(['kpi.revenue']);
  });

  it('入れ子の深いパスも置ける', () => {
    const r = applyOverviewOverrides(baseOverview(), [entry('productivity.labor.laborCost', 999)]);
    expect(r.overview.productivity.labor.laborCost).toBe(999);
  });

  it('元のオブジェクトを書き換えない', () => {
    const base = baseOverview();
    applyOverviewOverrides(base, [entry('kpi.revenue', 2000)]);
    expect(base.kpi.revenue).toBe(1000);
  });

  it('一覧に無いパスは無視して ignored に入れる', () => {
    const r = applyOverviewOverrides(baseOverview(), [{ path: 'kpi.nope', value: 1 }]);
    expect(r.overridden).toEqual([]);
    expect(r.ignored).toEqual(['kpi.nope']);
  });

  it('数値でない値・NaN は無視する', () => {
    const bad = [
      { path: 'kpi.revenue', value: Number.NaN },
      { path: 'kpi.operatingProfit', value: '100' as unknown as number },
    ];
    const base = baseOverview();
    const r = applyOverviewOverrides(base, bad);
    expect(r.overridden).toEqual([]);
    expect(r.ignored).toEqual(['kpi.revenue', 'kpi.operatingProfit']);
    // 概況そのものに触っていないこと（複製すら作らない）。
    expect(r.overview).toBe(base);
  });

  it('器に無いパスは書かずに ignored（形が違う概況を渡されても壊れない）', () => {
    const r = applyOverviewOverrides({ kpi: { revenue: 1 } }, [entry('financialPosition.totalAssets', 5)]);
    expect(r.ignored).toEqual(['financialPosition.totalAssets']);
  });

  it('末端のキーが無ければ作らずに ignored', () => {
    // 途中まで在るが最後のキーだけ無い形。ここで作ってしまうと
    // 「概況に無い数値が画面にだけ生える」ので、書かずに無視する。
    const nested = applyOverviewOverrides({ kpi: {} }, [entry('kpi.revenue', 5)]);
    expect(nested.ignored).toEqual(['kpi.revenue']);
    expect(nested.overridden).toEqual([]);
    // 1 段だけのパスも同じ。
    const flat = applyOverviewOverrides({}, [entry('runwayMonths', 5)]);
    expect(flat.ignored).toEqual(['runwayMonths']);
  });

  it('途中が null / 配列 / 関数なら書かずに ignored（例外にもしない）', () => {
    for (const child of [null, [1, 2], () => 0, 'text', 42]) {
      const r = applyOverviewOverrides({ kpi: child }, [entry('kpi.revenue', 5)]);
      expect(r.ignored, String(child)).toEqual(['kpi.revenue']);
      expect(r.overridden, String(child)).toEqual([]);
    }
  });

  it('概況そのものがオブジェクトでなければ何も書かない', () => {
    for (const root of [null, undefined, 'text', 42, true]) {
      const r = applyOverviewOverrides(root, [entry('runwayMonths', 5)]);
      expect(r.ignored, String(root)).toEqual(['runwayMonths']);
      expect(r.overview, String(root)).toBe(root);
    }
  });

  it('配列や関数に見せかけた器へは書かない（素のオブジェクトだけを受ける）', () => {
    // 配列へ書くと展開の結果が黙って素のオブジェクトに化ける。
    const arrayish = [] as unknown as Record<string, unknown>;
    arrayish['runwayMonths'] = 6;
    const arr = applyOverviewOverrides(arrayish, [entry('runwayMonths', 12)]);
    expect(arr.ignored).toEqual(['runwayMonths']);
    expect(arrayish['runwayMonths']).toBe(6);

    const fnish = (() => 0) as unknown as Record<string, unknown>;
    fnish['runwayMonths'] = 6;
    const fn = applyOverviewOverrides(fnish, [entry('runwayMonths', 12)]);
    expect(fn.ignored).toEqual(['runwayMonths']);
  });

  it('同じパスを 2 回指定しても overridden は 1 つ', () => {
    const r = applyOverviewOverrides(baseOverview(), [entry('kpi.revenue', 10), entry('kpi.revenue', 20)]);
    expect(r.overview.kpi.revenue).toBe(20);
    expect(r.overridden).toEqual(['kpi.revenue']);
  });

  it('上書きが無ければ何も起きない', () => {
    const base = baseOverview();
    const r = applyOverviewOverrides(base, []);
    expect(r.overview).toBe(base);
    expect(r.overridden).toEqual([]);
    expect(r.staleDerived).toEqual([]);
  });

  describe('staleDerived — 手で置いた数値から計算される指標を挙げる', () => {
    it('売上を置くと利益率などが「自動値のまま」として挙がる', () => {
      const r = applyOverviewOverrides(baseOverview(), [entry('kpi.revenue', 2000)]);
      const paths = r.staleDerived.map((s) => s.path);
      expect(paths).toContain('kpi.operatingMarginPct');
      expect(paths).toContain('kpi.grossMarginPct');
      for (const s of r.staleDerived) expect(s.because).toContain('kpi.revenue');
    });

    it('派生側も一緒に置けば挙がらない', () => {
      const r = applyOverviewOverrides(baseOverview(), [
        entry('kpi.revenue', 2000),
        entry('kpi.operatingMarginPct', 12),
      ]);
      expect(r.staleDerived.map((s) => s.path)).not.toContain('kpi.operatingMarginPct');
    });

    it('計算元でない指標は挙がらない', () => {
      const r = applyOverviewOverrides(baseOverview(), [entry('team.seatLimit', 20)]);
      expect(r.staleDerived).toEqual([]);
    });

    it('複数の計算元を置いたら because に両方入る', () => {
      const r = applyOverviewOverrides(baseOverview(), [
        entry('kpi.revenue', 2000),
        entry('kpi.grossProfit', 900),
      ]);
      const gm = r.staleDerived.find((s) => s.path === 'kpi.grossMarginPct');
      expect(gm?.because).toEqual(['kpi.revenue', 'kpi.grossProfit']);
    });

    it('ラベルが付いている（画面にそのまま出せる）', () => {
      const r = applyOverviewOverrides(baseOverview(), [entry('kpi.revenue', 2000)]);
      for (const s of r.staleDerived) expect(s.label.length).toBeGreaterThan(0);
    });
  });

  // allowlist を通るので、危険な名前はそもそも書き込みまで到達しない。
  it('__proto__ を含むパスはグローバルを汚さない', () => {
    const r = applyOverviewOverrides(baseOverview(), [
      { id: 'x', path: '__proto__.polluted', value: 1 },
      { id: 'y', path: 'kpi.__proto__', value: 1 },
    ]);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(r.overridden).toEqual([]);
  });
});

describe('parseCustomMetric', () => {
  it('項目名・値・単位がそろえば通る', () => {
    const r = parseCustomMetric({ label: '補助金入金', value: '500000', unit: 'yen' });
    expect(r).toEqual({ ok: true, entry: { label: '補助金入金', value: 500000, unit: 'yen' } });
  });

  it('メモも保持する', () => {
    const r = parseCustomMetric({ label: 'x', value: '1', unit: 'count', note: ' 期末見込み ' });
    expect(r.ok && r.entry.note).toBe('期末見込み');
  });

  it('メモが空なら持たせない', () => {
    const r = parseCustomMetric({ label: 'x', value: '1', unit: 'count', note: '   ' });
    expect(r.ok && 'note' in r.entry).toBe(false);
  });

  it('項目名が空なら断る', () => {
    expect(parseCustomMetric({ label: '  ', value: '1', unit: 'yen' }).ok).toBe(false);
  });

  it('項目名・メモの長さ上限', () => {
    expect(parseCustomMetric({ label: 'あ'.repeat(CUSTOM_METRIC_MAX_LABEL), value: '1', unit: 'yen' }).ok).toBe(true);
    expect(parseCustomMetric({ label: 'あ'.repeat(CUSTOM_METRIC_MAX_LABEL + 1), value: '1', unit: 'yen' }).ok).toBe(false);
    expect(
      parseCustomMetric({ label: 'x', value: '1', unit: 'yen', note: 'あ'.repeat(CUSTOM_METRIC_MAX_NOTE + 1) }).ok,
    ).toBe(false);
  });

  it('単位が未知なら断る', () => {
    expect(parseCustomMetric({ label: 'x', value: '1', unit: 'dollars' }).ok).toBe(false);
    expect(parseCustomMetric({ label: 'x', value: '1' }).ok).toBe(false);
  });

  it('値の検証は上書きと同じ規則', () => {
    expect(parseCustomMetric({ label: 'x', value: '1,000', unit: 'yen' }).ok).toBe(false);
    expect(parseCustomMetric({ label: 'x', value: '-1', unit: 'count' }).ok).toBe(false);
  });

  it('項目名を省いたときは空文字と同じに扱う', () => {
    const r = parseCustomMetric({ value: '1', unit: 'yen' });
    expect(r.ok ? '' : r.reason).toBe('項目名を入力してください。');
  });

  it('値を省いたときも空文字と同じに扱う', () => {
    const r = parseCustomMetric({ label: '客単価', unit: 'yen' });
    expect(r.ok ? '' : r.reason).toBe('数値を入力してください。');
  });

  it('メモは上限ちょうどまで受ける', () => {
    const r = parseCustomMetric({
      label: 'x',
      value: '1',
      unit: 'yen',
      note: 'あ'.repeat(CUSTOM_METRIC_MAX_NOTE),
    });
    expect(r.ok).toBe(true);
  });

  it('断る文言が場合ごとに決め打ちで一致する', () => {
    const longLabel = parseCustomMetric({
      label: 'あ'.repeat(CUSTOM_METRIC_MAX_LABEL + 1),
      value: '1',
      unit: 'yen',
    });
    expect(longLabel.ok ? '' : longLabel.reason).toBe(`項目名は ${CUSTOM_METRIC_MAX_LABEL} 文字までです。`);

    const unknownUnit = parseCustomMetric({ label: 'x', value: '1', unit: 'dollars' });
    expect(unknownUnit.ok ? '' : unknownUnit.reason).toBe('単位を選んでください。');

    const longNote = parseCustomMetric({
      label: 'x',
      value: '1',
      unit: 'yen',
      note: 'あ'.repeat(CUSTOM_METRIC_MAX_NOTE + 1),
    });
    expect(longNote.ok ? '' : longNote.reason).toBe(`メモは ${CUSTOM_METRIC_MAX_NOTE} 文字までです。`);
  });

  it('断るときは理由が付く', () => {
    const r = parseCustomMetric({ label: '', value: '1', unit: 'yen' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
  });
});

describe('保存先の名前', () => {
  // collection 名が変わると、保存済みの手入力が読み出せなくなる（消えたように見える）。
  it('レコードストアの collection 名は決め打ち', () => {
    expect(OVERVIEW_OVERRIDES_COLLECTION).toBe('overview-overrides');
    expect(OVERVIEW_CUSTOM_METRICS_COLLECTION).toBe('overview-custom-metrics');
    expect(OVERVIEW_OVERRIDES_COLLECTION).not.toBe(OVERVIEW_CUSTOM_METRICS_COLLECTION);
  });
});

describe('isMetricUnit', () => {
  it('既知の単位だけ true', () => {
    for (const u of ['yen', 'pct', 'count', 'days', 'months']) expect(isMetricUnit(u), u).toBe(true);
    for (const u of ['', 'dollars', 'YEN', 1, null, undefined, {}]) expect(isMetricUnit(u), String(u)).toBe(false);
  });
});

describe('formatMetric', () => {
  it('単位ごとの表記', () => {
    expect(formatMetric(1234567, 'yen')).toBe('1,234,567 円');
    expect(formatMetric(12.34, 'pct')).toBe('12.3 %');
    expect(formatMetric(42, 'count')).toBe('42 件');
    expect(formatMetric(30.5, 'days')).toBe('30.5 日');
    expect(formatMetric(6, 'months')).toBe('6.0 か月');
  });

  it('円と件数は丸めて桁区切りにする', () => {
    expect(formatMetric(1000.6, 'yen')).toBe('1,001 円');
    expect(formatMetric(1000.4, 'count')).toBe('1,000 件');
  });

  it('負の値も表記できる', () => {
    expect(formatMetric(-5000, 'yen')).toBe('-5,000 円');
    expect(formatMetric(-2.5, 'pct')).toBe('-2.5 %');
  });

  it('全ての単位に表記がある', () => {
    const units: MetricUnit[] = ['yen', 'pct', 'count', 'days', 'months'];
    for (const u of units) expect(formatMetric(1, u).length, u).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 一覧の中身そのものを、期待値を書き写して照合する
// ---------------------------------------------------------------------------

/**
 * 「何を手で置けるか」の期待値。**定義側から組み立てない**のが肝で、
 * `OVERRIDABLE_FIELDS` を写して期待値を作ると、定義を 1 本消す変更が
 * 期待値も一緒に消してしまい素通りする（実際それで計算元の定義を
 * 空にする変更が検知できていなかった）。ここに書き写しておけば、
 * 定義を触った瞬間に差分として出る。
 */
const EXPECTED_CATALOG: readonly {
  path: string;
  label: string;
  section: string;
  unit: MetricUnit;
  derivedFrom?: readonly string[];
}[] = [
  { path: 'sales.totalAmount', label: '売上合計', section: '売上', unit: 'yen' },
  { path: 'sales.totalOrders', label: '受注件数', section: '売上', unit: 'count' },
  { path: 'sales.aov', label: '平均単価', section: '売上', unit: 'yen', derivedFrom: ['sales.totalAmount', 'sales.totalOrders'] },
  { path: 'sales.channelCount', label: 'チャネル数', section: '売上', unit: 'count' },
  { path: 'kpi.revenue', label: '売上高', section: '損益', unit: 'yen' },
  { path: 'kpi.grossProfit', label: '売上総利益', section: '損益', unit: 'yen', derivedFrom: ['kpi.revenue'] },
  { path: 'kpi.operatingProfit', label: '営業利益', section: '損益', unit: 'yen', derivedFrom: ['kpi.revenue'] },
  { path: 'kpi.ebitda', label: 'EBITDA', section: '損益', unit: 'yen', derivedFrom: ['kpi.operatingProfit'] },
  { path: 'kpi.bep', label: '損益分岐点売上高', section: '損益', unit: 'yen' },
  { path: 'kpi.safetyMargin', label: '安全余裕率', section: '損益', unit: 'pct', derivedFrom: ['kpi.revenue', 'kpi.bep'] },
  { path: 'kpi.grossMarginPct', label: '売上総利益率', section: '比率', unit: 'pct', derivedFrom: ['kpi.revenue', 'kpi.grossProfit'] },
  { path: 'kpi.operatingMarginPct', label: '営業利益率', section: '比率', unit: 'pct', derivedFrom: ['kpi.revenue', 'kpi.operatingProfit'] },
  { path: 'kpi.ebitdaMarginPct', label: 'EBITDA マージン', section: '比率', unit: 'pct', derivedFrom: ['kpi.revenue', 'kpi.ebitda'] },
  { path: 'kpi.cogsRatioPct', label: '原価率', section: '比率', unit: 'pct', derivedFrom: ['kpi.revenue'] },
  { path: 'kpi.sgaRatioPct', label: '販管費率', section: '比率', unit: 'pct', derivedFrom: ['kpi.revenue'] },
  { path: 'kpi.advertisingRatioPct', label: '広告費比率', section: '比率', unit: 'pct', derivedFrom: ['kpi.revenue'] },
  { path: 'kpi.contributionRatio', label: '限界利益率', section: '比率', unit: 'pct', derivedFrom: ['kpi.revenue'] },
  { path: 'kpi.revenueGrowthPct', label: '売上高成長率', section: '成長', unit: 'pct', derivedFrom: ['kpi.revenue'] },
  { path: 'kpi.revenueCagrPct', label: '期間平均成長率', section: '成長', unit: 'pct', derivedFrom: ['kpi.revenue'] },
  { path: 'team.members', label: 'メンバー数', section: '体制', unit: 'count' },
  { path: 'team.seatLimit', label: '席数上限', section: '体制', unit: 'count' },
  { path: 'productivity.revenuePerCapita', label: '一人当たり売上', section: '体制', unit: 'yen', derivedFrom: ['kpi.revenue', 'team.members'] },
  { path: 'productivity.operatingProfitPerCapita', label: '一人当たり営業利益', section: '体制', unit: 'yen', derivedFrom: ['kpi.operatingProfit', 'team.members'] },
  { path: 'productivity.labor.laborCost', label: '人件費', section: '体制', unit: 'yen' },
  { path: 'productivity.labor.laborSharePct', label: '労働分配率', section: '体制', unit: 'pct', derivedFrom: ['productivity.labor.laborCost'] },
  { path: 'productivity.labor.laborToRevenuePct', label: '人件費率', section: '体制', unit: 'pct', derivedFrom: ['kpi.revenue', 'productivity.labor.laborCost'] },
  { path: 'productivity.labor.laborPerCapita', label: '一人当たり人件費', section: '体制', unit: 'yen', derivedFrom: ['team.members', 'productivity.labor.laborCost'] },
  { path: 'financialPosition.totalAssets', label: '総資産', section: '財政状態', unit: 'yen' },
  { path: 'financialPosition.totalLiabilities', label: '負債合計', section: '財政状態', unit: 'yen' },
  { path: 'financialPosition.netAssets', label: '純資産', section: '財政状態', unit: 'yen', derivedFrom: ['financialPosition.totalAssets', 'financialPosition.totalLiabilities'] },
  { path: 'financialPosition.equityRatioPct', label: '自己資本比率', section: '財政状態', unit: 'pct', derivedFrom: ['financialPosition.totalAssets', 'financialPosition.netAssets'] },
  { path: 'financialPosition.currentRatioPct', label: '流動比率', section: '財政状態', unit: 'pct' },
  { path: 'financialPosition.quickRatioPct', label: '当座比率', section: '財政状態', unit: 'pct' },
  { path: 'financialPosition.roaPct', label: 'ROA', section: '財政状態', unit: 'pct', derivedFrom: ['kpi.operatingProfit', 'financialPosition.totalAssets'] },
  { path: 'financialPosition.roePct', label: 'ROE', section: '財政状態', unit: 'pct', derivedFrom: ['kpi.operatingProfit', 'financialPosition.netAssets'] },
  { path: 'workingCapital.dso', label: '売上債権回転日数', section: '運転資金', unit: 'days' },
  { path: 'workingCapital.dio', label: '棚卸資産回転日数', section: '運転資金', unit: 'days' },
  { path: 'workingCapital.dpo', label: '仕入債務回転日数', section: '運転資金', unit: 'days' },
  { path: 'workingCapital.ccc', label: 'キャッシュ化速度 (CCC)', section: '運転資金', unit: 'days', derivedFrom: ['workingCapital.dso', 'workingCapital.dio', 'workingCapital.dpo'] },
  { path: 'workingCapital.workingCapital', label: '運転資金', section: '運転資金', unit: 'yen' },
  { path: 'accounting.latestNet', label: '直近月の収支', section: '資金繰り', unit: 'yen' },
  { path: 'accounting.avgMonthlyNet', label: '月平均の収支', section: '資金繰り', unit: 'yen' },
  { path: 'runwayMonths', label: '資金ランウェイ', section: '資金繰り', unit: 'months', derivedFrom: ['accounting.avgMonthlyNet'] },
  { path: 'cashForecast.openingBalance', label: '期首現預金', section: '資金繰り', unit: 'yen' },
  { path: 'cashForecast.minBalance', label: '最低現預金 (予測)', section: '資金繰り', unit: 'yen', derivedFrom: ['cashForecast.openingBalance', 'accounting.avgMonthlyNet'] },
];

/** 計算元を持つ項目の数。まとめて消えたときに気付くための決め打ち。 */
const EXPECTED_DERIVED_COUNT = 26;

describe('一覧の中身（期待値を書き写して照合する）', () => {
  it('項目の数と並び順が期待どおり', () => {
    expect(OVERRIDABLE_FIELDS.map((f) => f.path)).toEqual(EXPECTED_CATALOG.map((f) => f.path));
  });

  it('ラベル・セクション・単位・計算元が 1 件ずつ期待どおり', () => {
    for (const want of EXPECTED_CATALOG) {
      const got = findOverridableField(want.path);
      expect(got, want.path).not.toBeNull();
      expect(got?.label, want.path).toBe(want.label);
      expect(got?.section, want.path).toBe(want.section);
      expect(got?.unit, want.path).toBe(want.unit);
      expect(got?.derivedFrom ?? null, want.path).toEqual(want.derivedFrom ?? null);
    }
  });

  it('計算元を持つ項目の数が期待どおり', () => {
    const withDeps = OVERRIDABLE_FIELDS.filter((f) => (f.derivedFrom ?? []).length > 0);
    expect(withDeps.length).toBe(EXPECTED_DERIVED_COUNT);
  });

  it('セクションの並びが期待どおり', () => {
    const want: string[] = [];
    for (const f of EXPECTED_CATALOG) if (want[want.length - 1] !== f.section) want.push(f.section);
    expect(fieldsBySection().map((g) => g.section)).toEqual(want);
  });

  it('セクションごとの件数が期待どおり', () => {
    const groups = fieldsBySection();
    for (const g of groups) {
      const want = EXPECTED_CATALOG.filter((f) => f.section === g.section);
      expect(g.fields.map((f) => f.path), g.section).toEqual(want.map((f) => f.path));
    }
  });
});

// ---------------------------------------------------------------------------
// 一覧そのものを検査する（定義を消しても気付けるように）
// ---------------------------------------------------------------------------

describe('一覧の定義が実際に効いていること', () => {
  it('すべてのパスが findOverridableField で引ける', () => {
    for (const f of OVERRIDABLE_FIELDS) {
      expect(findOverridableField(f.path)?.path, f.path).toBe(f.path);
    }
  });

  it('セクションの数は、重複を除いたセクション名の数と一致する', () => {
    const distinct = new Set(OVERRIDABLE_FIELDS.map((f) => f.section));
    expect(fieldsBySection().length).toBe(distinct.size);
    expect(fieldsBySection().length).toBeGreaterThan(1);
  });

  it('各セクションの中身は、そのセクションの項目だけ', () => {
    for (const g of fieldsBySection()) {
      for (const f of g.fields) expect(f.section, f.path).toBe(g.section);
    }
  });

  // derivedFrom を空にすると「自動値のまま」の警告が出なくなる。
  // 期待する組み合わせは EXPECTED_CATALOG 側（書き写した表）から回す。
  // 定義側から回すと、定義を空にした変更が期待値も空にしてしまう。
  it('計算元を手で置くと、そこから計算される指標が staleDerived に出る', () => {
    const withDeps = EXPECTED_CATALOG.filter((f) => (f.derivedFrom ?? []).length > 0);
    expect(withDeps.length).toBe(EXPECTED_DERIVED_COUNT);
    for (const f of withDeps) {
      for (const src of f.derivedFrom ?? []) {
        // 器はパスから組み立てる（概況の形に依存しない）。
        const base = buildShell([f.path, src]);
        const r = applyOverviewOverrides(base, [entry(src, 123)]);
        const hit = r.staleDerived.find((d) => d.path === f.path);
        expect(hit, `${f.path} ← ${src}`).toBeDefined();
        expect(hit?.because, `${f.path} ← ${src}`).toContain(src);
      }
    }
  });

  // 逆向き: 表に無い組み合わせは警告に出ない（計算元を足す変更に気付く）。
  it('表に無い計算元は staleDerived に出ない', () => {
    const allPaths = EXPECTED_CATALOG.map((f) => f.path);
    for (const f of EXPECTED_CATALOG) {
      const deps = f.derivedFrom ?? [];
      for (const src of allPaths) {
        if (src === f.path || deps.includes(src)) continue;
        const base = buildShell([f.path, src]);
        const r = applyOverviewOverrides(base, [entry(src, 123)]);
        expect(r.staleDerived.some((d) => d.path === f.path), `${f.path} ← ${src}`).toBe(false);
      }
    }
  });
});

/** 指定したパスがすべて存在する入れ子オブジェクトを作る。 */
function buildShell(paths: readonly string[]): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const path of paths) {
    let node = root;
    const segs = path.split('.');
    segs.forEach((key, i) => {
      if (i === segs.length - 1) node[key] = 0;
      else {
        if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
        node = node[key] as Record<string, unknown>;
      }
    });
  }
  return root;
}

describe('単位ごとの範囲が実際に効いていること', () => {
  const units: MetricUnit[] = ['yen', 'pct', 'count', 'days', 'months'];

  /** 単位ごとの上限・下限。定義側と同じ値をここにも書き写して境界で照合する。 */
  const EXPECTED_LIMITS: readonly { unit: MetricUnit; min: number; max: number; integer: boolean }[] = [
    { unit: 'yen', min: -1e15, max: 1e15, integer: false },
    { unit: 'pct', min: -100_000, max: 100_000, integer: false },
    { unit: 'count', min: 0, max: 1e9, integer: true },
    { unit: 'days', min: -100_000, max: 100_000, integer: false },
    { unit: 'months', min: 0, max: 12_000, integer: false },
  ];

  it('上限・下限ちょうどは通り、1 つ外れると断る', () => {
    for (const c of EXPECTED_LIMITS) {
      expect(parseOverrideValue(String(c.max), c.unit).ok, `${c.unit} 上限`).toBe(true);
      expect(parseOverrideValue(String(c.max + 1), c.unit).ok, `${c.unit} 上限+1`).toBe(false);
      expect(parseOverrideValue(String(c.min), c.unit).ok, `${c.unit} 下限`).toBe(true);
      expect(parseOverrideValue(String(c.min - 1), c.unit).ok, `${c.unit} 下限-1`).toBe(false);
    }
  });

  it('小数を受けるかどうかが単位ごとに期待どおり', () => {
    for (const c of EXPECTED_LIMITS) {
      expect(parseOverrideValue('2.5', c.unit).ok, `${c.unit} 小数`).toBe(!c.integer);
    }
  });

  it('範囲の表は全ての単位を覆う', () => {
    expect(EXPECTED_LIMITS.map((c) => c.unit).sort()).toEqual([...units].sort());
  });

  it('どの単位にも上限がある（桁を打ち間違えたら止まる）', () => {
    for (const u of units) {
      expect(parseOverrideValue('9999999999999999999', u).ok, u).toBe(false);
    }
  });

  it('円・％・日数・月数は小数を受ける', () => {
    for (const u of ['yen', 'pct', 'days', 'months'] as MetricUnit[]) {
      expect(parseOverrideValue('1.5', u).ok, u).toBe(true);
    }
  });

  it('件数だけが整数を要求する', () => {
    expect(parseOverrideValue('1.5', 'count').ok).toBe(false);
  });

  it('件数・月数だけが負を断る', () => {
    for (const u of ['yen', 'pct', 'days'] as MetricUnit[]) {
      expect(parseOverrideValue('-1', u).ok, u).toBe(true);
    }
    for (const u of ['count', 'months'] as MetricUnit[]) {
      expect(parseOverrideValue('-1', u).ok, u).toBe(false);
    }
  });

  it('断る理由は場合ごとに違う文言になる', () => {
    const reasons = [
      parseOverrideValue('', 'yen'),
      parseOverrideValue('1,000', 'yen'),
      parseOverrideValue('1.5', 'count'),
      parseOverrideValue('-1', 'count'),
      parseOverrideValue('9999999999999999999', 'yen'),
    ].map((r) => (r.ok ? '' : r.reason));
    for (const r of reasons) expect(r.length).toBeGreaterThan(0);
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  it('文言が何を直せばよいかを含む', () => {
    const empty = parseOverrideValue('', 'yen');
    expect(empty.ok ? '' : empty.reason).toContain('数値');
    const comma = parseOverrideValue('1,000', 'yen');
    expect(comma.ok ? '' : comma.reason).toContain('半角');
    const frac = parseOverrideValue('1.5', 'count');
    expect(frac.ok ? '' : frac.reason).toContain('整数');
    const low = parseOverrideValue('-1', 'count');
    expect(low.ok ? '' : low.reason).toContain('以上');
    const high = parseOverrideValue('9999999999999999999', 'yen');
    expect(high.ok ? '' : high.reason).toContain('以下');
  });
});
