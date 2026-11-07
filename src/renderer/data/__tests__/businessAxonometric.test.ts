/**
 * 3 軸 (縦 / 横 / 斜め) の組み立ての検査。
 *
 * ここで守りたいのは**図が嘘をつかないこと**である。
 *   - 奥行きで縮まない (縮むと「奥は動きが小さい」という嘘の印象になる)
 *   - 当月が縦に揃う (揃わないと同じ縦線が事業ごとに別の月を指す)
 *   - 0 が縦軸に入る (入らないと小さな差が大差に見える)
 *   - 赤字が黙って 0% に潰れない (潰れると全体が黒字に見える)
 */
import { describe, expect, it } from 'vitest';
import {
  buildAxonometric,
  buildComposition,
  COMPOSITION_LABELS,
  DIAGONAL_ANGLE_DEG,
  findIndicator,
  INDICATORS,
  projectAxonometric,
  type AxonometricUnitInput,
  type CompositionKey,
} from '../businessAxonometric';

/** 月次実績を 1 つ作る。profitMargin は revenue と profit から決まる。 */
function month(revenue: number, profit: number, fixedCost = 600_000) {
  return {
    revenue,
    variableCost: Math.max(0, revenue - profit - fixedCost),
    fixedCost,
    profit,
    profitMargin: revenue === 0 ? 0 : (profit / revenue) * 100,
  };
}

function unit(
  id: string,
  label: string,
  months: { revenue: number; profit: number }[],
  sample = false,
): AxonometricUnitInput {
  const all = months.map((m) => month(m.revenue, m.profit));
  return { id, label, sample, current: all[all.length - 1]!, history: all.slice(0, -1) };
}

describe('projectAxonometric', () => {
  it('奥行き 0 なら平面のまま', () => {
    expect(projectAxonometric(10, 20, 0)).toEqual({ x: 10, y: 20 });
  });

  it('奥へ行くほど右上へずれる', () => {
    const near = projectAxonometric(0, 0, 0);
    const far = projectAxonometric(0, 0, 3);
    expect(far.x).toBeGreaterThan(near.x);
    expect(far.y).toBeGreaterThan(near.y);
  });

  it('斜め軸は等間隔 (平行投影なので奥ほど詰まったりしない)', () => {
    const step = (z: number) => projectAxonometric(0, 0, z);
    const d1 = step(1).x - step(0).x;
    const d2 = step(2).x - step(1).x;
    const d3 = step(3).x - step(2).x;
    expect(d2).toBeCloseTo(d1, 10);
    expect(d3).toBeCloseTo(d1, 10);
  });

  it('奥行きが変わっても横の長さは縮まない', () => {
    // 遠近法なら奥の 1 単位は短く写る。ここでは同じでなければならない。
    const nearSpan = projectAxonometric(5, 0, 0).x - projectAxonometric(0, 0, 0).x;
    const farSpan = projectAxonometric(5, 0, 7).x - projectAxonometric(0, 0, 7).x;
    expect(farSpan).toBe(nearSpan);
  });

  it('傾きは指定した角度どおり', () => {
    const p = projectAxonometric(0, 0, 1);
    expect(Math.atan2(p.y, p.x) * (180 / Math.PI)).toBeCloseTo(DIAGONAL_ANGLE_DEG, 10);
  });
});

describe('INDICATORS', () => {
  it('経営サマリーの 17 指標をすべて持つ', () => {
    expect(INDICATORS).toHaveLength(17);
    expect(INDICATORS.map((i) => i.label)).toEqual([
      '自己資本比率', '流動比率', '固定長期適合率', '借入金月商倍率', '債務償還年数',
      '営業利益率', '経常利益率', '当期純利益率', '当期純利益', '労働分配率',
      'EBITDA', 'EBITDAマージン', '売上債権回転率', '棚卸資産回転率', 'CCC', 'ROA', 'ROE',
    ]);
  });

  it('キーは重複しない', () => {
    expect(new Set(INDICATORS.map((i) => i.key)).size).toBe(INDICATORS.length);
  });

  it('足せるのは金額だけ (比率を円グラフに載せない)', () => {
    for (const i of INDICATORS) {
      expect(i.additive, i.label).toBe(i.unit === '円');
    }
    expect(INDICATORS.filter((i) => i.additive).map((i) => i.key)).toEqual(['netProfit', 'ebitda']);
  });

  it('低いほど良い指標を取り違えていない', () => {
    const lower = INDICATORS.filter((i) => !i.higherIsBetter).map((i) => i.key);
    expect(lower).toEqual([
      'fixedLongTermFit', 'debtToMonthlySales', 'debtRepaymentYears', 'laborShare', 'ccc',
    ]);
  });

  it('findIndicator は知らないキーに undefined を返す', () => {
    expect(findIndicator('roe')?.label).toBe('ROE');
    expect(findIndicator('nope')).toBeUndefined();
    // プロトタイプ由来の名前を「知っている指標」と答えない。
    expect(findIndicator('toString')).toBeUndefined();
    expect(findIndicator('constructor')).toBeUndefined();
  });
});

describe('buildAxonometric', () => {
  const units = [
    unit('a', 'A 事業', [
      { revenue: 1_000_000, profit: 100_000 },
      { revenue: 1_100_000, profit: 150_000 },
      { revenue: 1_200_000, profit: 200_000 },
    ]),
    unit('b', 'B 事業', [{ revenue: 900_000, profit: 50_000 }], true),
  ];

  it('知らない指標なら null', () => {
    expect(buildAxonometric(units, 'nope')).toBeNull();
  });

  it('全事業を斜め軸に 0 から順に並べる', () => {
    const c = buildAxonometric(units, 'roe')!;
    expect(c.series.map((s) => [s.id, s.z])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
    expect(c.series[1]!.sample).toBe(true);
    expect(c.series[0]!.sample).toBe(false);
  });

  it('横軸は最長の系列に合わせ、当月を右端に揃える', () => {
    const c = buildAxonometric(units, 'roe')!;
    expect(c.periods).toBe(3);
    // 履歴の短い B 事業は右詰め — 当月が A と同じ x に来る。
    expect(c.series[0]!.points.map((p) => p.x)).toEqual([0, 1, 2]);
    expect(c.series[1]!.points.map((p) => p.x)).toEqual([2]);
    for (const s of c.series) {
      const last = s.points[s.points.length - 1]!;
      expect(last.x).toBe(c.periods - 1);
      expect(last.monthsAgo).toBe(0);
      expect(last.label).toBe('当月');
    }
  });

  it('過去の点は何ヶ月前かで名前が付く', () => {
    const c = buildAxonometric(units, 'roe')!;
    expect(c.series[0]!.points.map((p) => p.label)).toEqual(['2ヶ月前', '1ヶ月前', '当月']);
  });

  it('各期の値はその期の実績から計算する (当期の値で埋めない)', () => {
    const c = buildAxonometric(units, 'operatingMargin')!;
    const vals = c.series[0]!.points.map((p) => p.value);
    // 売上も利益も増えているので営業利益率は単調に上がる。
    expect(vals[0]!).toBeLessThan(vals[1]!);
    expect(vals[1]!).toBeLessThan(vals[2]!);
  });

  it('縦軸には必ず 0 を含める', () => {
    const c = buildAxonometric(units, 'roe')!;
    expect(c.min).toBeLessThanOrEqual(0);
    expect(c.max).toBeGreaterThan(c.min);
  });

  it('赤字があれば縦軸の下限は負まで伸びる', () => {
    const loss = [unit('l', '赤字', [{ revenue: 1_000_000, profit: -300_000 }])];
    const c = buildAxonometric(loss, 'netProfit')!;
    expect(c.min).toBeLessThan(0);
  });

  it('事業が無くても潰れた縦軸を返さない', () => {
    const c = buildAxonometric([], 'roe')!;
    expect(c.series).toEqual([]);
    expect(c.periods).toBe(0);
    expect(c.max).toBeGreaterThan(c.min);
  });

  it('履歴が無い事業は当月 1 点だけの系列になる', () => {
    const fresh: AxonometricUnitInput = {
      id: 'new',
      label: '登録したばかり',
      current: month(500_000, 40_000),
      history: [],
    };
    const c = buildAxonometric([fresh], 'roe')!;
    expect(c.periods).toBe(1);
    expect(c.series[0]!.points).toHaveLength(1);
    expect(c.series[0]!.points[0]!.label).toBe('当月');
  });

  it('算定不能な期は null のまま返す (0 として描かない)', () => {
    // 売上 0 の月は率が出せない。0% と描くと「利益率 0 の月があった」
    // という別の意味になってしまう。
    const zero: AxonometricUnitInput = {
      id: 'z',
      label: 'ゼロ',
      current: month(1_000_000, 100_000),
      history: [month(0, 0, 0)],
    };
    const c = buildAxonometric([zero], 'operatingMargin')!;
    expect(c.series[0]!.points[0]!.value).toBeNull();
    expect(c.series[0]!.points[1]!.value).not.toBeNull();
  });

  it('17 指標すべてが組み立てられる', () => {
    for (const spec of INDICATORS) {
      const c = buildAxonometric(units, spec.key);
      expect(c, spec.label).not.toBeNull();
      expect(c!.indicator.key).toBe(spec.key);
      expect(c!.series[0]!.points).toHaveLength(3);
    }
  });
});

describe('buildComposition', () => {
  const units = [
    unit('a', 'A 事業', [{ revenue: 3_000_000, profit: 400_000 }]),
    unit('b', 'B 事業', [{ revenue: 1_000_000, profit: 200_000 }], true),
  ];

  it('4 種の対象すべてに日本語名がある', () => {
    const keys: CompositionKey[] = ['revenue', 'netProfit', 'ebitda', 'laborCost'];
    for (const k of keys) {
      expect(COMPOSITION_LABELS[k]).not.toBe('');
      expect(buildComposition(units, k).label).toBe(COMPOSITION_LABELS[k]);
    }
  });

  it('大きい順に並べ、割合の合計は 100% になる', () => {
    const c = buildComposition(units, 'revenue');
    expect(c.slices.map((s) => s.id)).toEqual(['a', 'b']);
    expect(c.slices[0]!.value).toBeGreaterThan(c.slices[1]!.value);
    expect(c.slices.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 1);
    expect(c.total).toBe(c.slices.reduce((s, x) => s + x.value, 0));
  });

  it('同梱サンプルかどうかを切れごとに持ち回る', () => {
    const c = buildComposition(units, 'revenue');
    expect(c.slices.find((s) => s.id === 'b')!.sample).toBe(true);
    expect(c.slices.find((s) => s.id === 'a')!.sample).toBe(false);
  });

  it('赤字は 0% に潰さず、別に返す', () => {
    // ここが潰れると、赤字の事業が構成比 0% として黙って消え、
    // 全体が黒字であるかのように見える。
    const withLoss = [
      unit('a', '黒字', [{ revenue: 3_000_000, profit: 400_000 }]),
      unit('b', '赤字', [{ revenue: 1_000_000, profit: -500_000 }]),
    ];
    const c = buildComposition(withLoss, 'netProfit');
    expect(c.slices.map((s) => s.id)).toEqual(['a']);
    expect(c.negatives).toHaveLength(1);
    expect(c.negatives[0]!.label).toBe('赤字');
    expect(c.negatives[0]!.value).toBeLessThan(0);
    // 円の全体は黒字だけの合計 — 赤字を差し引いた額ではない。
    expect(c.total).toBe(c.slices[0]!.value);
  });

  it('全部が赤字なら円は空になり、割合は 0%', () => {
    const allLoss = [unit('x', '赤字', [{ revenue: 1_000_000, profit: -500_000 }])];
    const c = buildComposition(allLoss, 'netProfit');
    expect(c.slices).toEqual([]);
    expect(c.total).toBe(0);
    expect(c.negatives).toHaveLength(1);
  });

  it('事業が無ければ空 (0 除算しない)', () => {
    const c = buildComposition([], 'revenue');
    expect(c.slices).toEqual([]);
    expect(c.negatives).toEqual([]);
    expect(c.total).toBe(0);
  });

  it('人件費は固定費から、EBITDA は減価償却を足し戻して出す', () => {
    const c = buildComposition(units, 'laborCost');
    expect(c.total).toBeGreaterThan(0);
    const e = buildComposition(units, 'ebitda');
    const n = buildComposition(units, 'netProfit');
    // EBITDA は税・利息・減価償却の前なので、当期純利益より必ず大きい。
    expect(e.total).toBeGreaterThan(n.total);
  });
});

describe('縦軸の範囲', () => {
  it('上限は実際に出ている最大値 (勝手に縮めない)', () => {
    const units = [
      unit('a', 'A', [{ revenue: 1_000_000, profit: 100_000 }]),
      unit('b', 'B', [{ revenue: 2_000_000, profit: 500_000 }]),
    ];
    const c = buildAxonometric(units, 'operatingMargin')!;
    const vals = c.series.flatMap((s) => s.points.map((p) => p.value!));
    expect(c.max).toBe(Math.max(...vals));
    expect(c.min).toBe(0);
  });

  it('算定不能な期を 0 と数えない (全期が赤字なら上限も負のまま)', () => {
    // null を数値に混ぜると 0 として扱われ、赤字ばかりの事業なのに
    // 上限が 0 まで持ち上がって「0 に届いた月がある」ように見える。
    const withNull: AxonometricUnitInput = {
      id: 'n',
      label: '赤字と欠測',
      current: month(1_000_000, -200_000),
      history: [month(0, 0, 0)],
    };
    const c = buildAxonometric([withNull], 'operatingMargin')!;
    const vals = c.series[0]!.points.map((p) => p.value);
    expect(vals[0]).toBeNull();
    expect(vals[1]).toBeLessThan(0);
    expect(c.max).toBeLessThan(0);
    expect(c.max).toBe(c.min + 1);
  });
});

describe('構成比の並びと境界', () => {
  /** 当月だけの事業を作る (値は売上で決まる)。 */
  const u1 = (id: string, revenue: number, profit: number) =>
    unit(id, id, [{ revenue, profit }]);

  it('降順に並べ替える (入力順のままにしない)', () => {
    // 3 件必要 — 2 件だと比較関数を足し算に変えても順序が変わらない。
    const c = buildComposition(
      [u1('small', 1_000_000, 100_000), u1('big', 5_000_000, 500_000), u1('mid', 3_000_000, 300_000)],
      'revenue',
    );
    expect(c.slices.map((s) => s.id)).toEqual(['big', 'mid', 'small']);
    const vals = c.slices.map((s) => s.value);
    expect(vals[0]!).toBeGreaterThan(vals[1]!);
    expect(vals[1]!).toBeGreaterThan(vals[2]!);
  });

  it('0 の事業は切れにも赤字にも入れない', () => {
    // 0 を切れにすると 0% の凡例が並び、赤字に混ぜると赤字でないものを
    // 赤字として出す。どちらでもない扱いが要る。
    const c = buildComposition([u1('zero', 0, 0), u1('some', 2_000_000, 200_000)], 'revenue');
    expect(c.slices.map((s) => s.id)).toEqual(['some']);
    expect(c.negatives).toEqual([]);
  });

  it('対象ごとに別の金額を取り出す (取り違えていない)', () => {
    const units = [u1('a', 3_000_000, 400_000)];
    const revenue = buildComposition(units, 'revenue').total;
    const netProfit = buildComposition(units, 'netProfit').total;
    const ebitda = buildComposition(units, 'ebitda').total;
    const laborCost = buildComposition(units, 'laborCost').total;
    // 4 つとも別の数でなければ、どれかが別の項目を指している。
    expect(new Set([revenue, netProfit, ebitda, laborCost]).size).toBe(4);
    expect(revenue).toBeGreaterThan(ebitda);
    expect(ebitda).toBeGreaterThan(netProfit);
    // 人件費は固定費の内数なので売上より小さい。
    expect(laborCost).toBeLessThan(revenue);
  });
});
