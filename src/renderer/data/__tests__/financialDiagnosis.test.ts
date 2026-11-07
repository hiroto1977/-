import { describe, expect, it } from 'vitest';
import { diagnoseFinancials, gradeOf, levelOf } from '../financialDiagnosis';
import { DEFAULT_HEALTH_BANDS } from '../../../shared/financialHealthBands';
import { computeFinancialRatios, radarAxes } from '../financialRatios';
import { deriveBusinessFinancials } from '../businessFinancials';
import type { RadarAxis } from '../financialRatios';

function axis(key: string, label: string, score: number): RadarAxis {
  return { key, label, unit: '', raw: score, score };
}

describe('diagnoseFinancials', () => {
  it('averages all axis scores into the overall score and grade', () => {
    const axes = [axis('equityRatio', '自己資本比率', 90), axis('operatingMargin', '営業利益率', 90), axis('ccc', 'CCC', 90)];
    const d = diagnoseFinancials(axes);
    expect(d.overallScore).toBe(90);
    expect(d.grade).toBe('S');
  });

  it('grades a weak profile as D and surfaces weaknesses', () => {
    const axes = [axis('equityRatio', '自己資本比率', 10), axis('operatingMargin', '営業利益率', 5), axis('ccc', 'CCC', 20)];
    const d = diagnoseFinancials(axes);
    expect(d.grade).toBe('D');
    expect(d.strengths).toHaveLength(0);
    // 最も低い軸が先頭に来る
    expect(d.weaknesses[0]?.key).toBe('operatingMargin');
    expect(d.weaknesses[0]?.level).toBe('bad');
  });

  it('groups axes into 安全性 / 収益性 / 効率性', () => {
    const axes = [
      axis('equityRatio', '自己資本比率', 80), axis('currentRatio', '流動比率', 60),
      axis('operatingMargin', '営業利益率', 40), axis('roe', 'ROE', 20),
      axis('ccc', 'CCC', 100),
    ];
    const d = diagnoseFinancials(axes);
    const safety = d.categories.find((c) => c.category === '安全性')!;
    const eff = d.categories.find((c) => c.category === '効率性')!;
    expect(safety.score).toBe(70); // (80+60)/2
    expect(eff.score).toBe(100);
    expect(d.categories.map((c) => c.category)).toEqual(['安全性', '収益性', '効率性']);
  });

  it('limits strengths and weaknesses to 3 each', () => {
    const axes = Array.from({ length: 8 }, (_, i) => axis(`k${i}`, `軸${i}`, 90)); // 全部 good
    const d = diagnoseFinancials(axes);
    expect(d.strengths.length).toBeLessThanOrEqual(3);
  });

  it('integrates with the real ratio → radar pipeline', () => {
    const f = deriveBusinessFinancials({ revenue: 1_000_000, variableCost: 400_000, fixedCost: 300_000, profit: 200_000, profitMargin: 20 });
    const d = diagnoseFinancials(radarAxes(computeFinancialRatios(f)));
    expect(d.overallScore).toBeGreaterThanOrEqual(0);
    expect(d.overallScore).toBeLessThanOrEqual(100);
    expect(['S', 'A', 'B', 'C', 'D']).toContain(d.grade);
  });

  it('maps the overall score to a grade at the exact thresholds', () => {
    const g = (s: number) => diagnoseFinancials([axis('k', 'l', s)]).grade;
    // 境界: 80=S, 65=A, 50=B, 35=C, 未満=D
    expect([g(80), g(79), g(65), g(64), g(50), g(49), g(35), g(34)]).toEqual(
      ['S', 'A', 'A', 'B', 'B', 'C', 'C', 'D'],
    );
  });

  it('classifies axis level as good≥70 / warn≥45 / bad otherwise', () => {
    const lvl = (s: number) => {
      const d = diagnoseFinancials([axis('equityRatio', '自己資本比率', s)]);
      return (d.strengths[0] ?? d.weaknesses[0])!.level;
    };
    expect([lvl(70), lvl(69), lvl(45), lvl(44)]).toEqual(['good', 'warn', 'warn', 'bad']);
  });

  it('uses the per-axis improvement hint for weaknesses and a good note for strengths', () => {
    const weak = diagnoseFinancials([axis('currentRatio', '流動比率', 20)]);
    expect(weak.weaknesses[0]!.comment).toMatch(/流動比率/);
    expect(weak.strengths).toHaveLength(0);
    const strong = diagnoseFinancials([axis('currentRatio', '流動比率', 90)]);
    expect(strong.strengths[0]!.comment).toBe('流動比率は良好な水準です。'); // 良好コメントの厳密値
    // 未知キーの弱みはフォールバック文 (ラベル + 注意) の厳密値
    const unknown = diagnoseFinancials([axis('zzz', '謎指標', 10)]);
    expect(unknown.weaknesses[0]!.comment).toBe('謎指標の水準に注意。');
  });

  it('maps ordinaryMargin / netMargin to 収益性 (full category map)', () => {
    const d = diagnoseFinancials([axis('ordinaryMargin', '経常利益率', 80), axis('netMargin', '当期純利益率', 60)]);
    const profit = d.categories.find((c) => c.category === '収益性')!;
    expect(profit.score).toBe(70); // (80+60)/2 — 両軸が収益性に入る
    expect(profit.axisKeys).toEqual(['ordinaryMargin', 'netMargin']);
  });

  it('golden: pins the exact improvement hint for every one of the 15 axes', () => {
    const HINTS: Record<string, string> = {
      equityRatio: '自己資本比率が低め。利益の内部留保で純資産の積み増しを検討。',
      currentRatio: '流動比率が低め。短期の支払能力・運転資金の確保に注意。',
      fixedLongTermFit: '固定長期適合率が高め。固定資産を長期資金で賄えているか確認を。',
      debtToMonthlySales: '借入金月商倍率が高め。月商に対する借入残高の水準に注意。',
      debtRepaymentYears: '債務償還年数が長め。キャッシュ創出力に対する借入水準を確認。',
      operatingMargin: '営業利益率が低め。本業の採算（原価・固定費）の見直しを。',
      ordinaryMargin: '経常利益率が低め。営業外損益も含めた採算を確認。',
      netMargin: '当期純利益率が低め。特別損益・税負担も含め最終利益を確認。',
      laborShare: '労働分配率が高め。付加価値に対する人件費の水準に注意。',
      ebitdaMargin: 'EBITDAマージンが低め。償却前の稼ぐ力を確認。',
      receivablesTurnover: '売上債権回転率が低め。回収サイトの長期化に注意。',
      inventoryTurnover: '棚卸資産回転率が低め。在庫の滞留に注意。',
      ccc: 'CCC（現金化日数）が長め。回収・在庫・支払のサイト最適化を検討。',
      roa: 'ROA が低め。総資産に対する収益性（資産効率）を確認。',
      roe: 'ROE が低め。自己資本に対する収益性を確認。',
    };
    for (const [key, hint] of Object.entries(HINTS)) {
      const d = diagnoseFinancials([axis(key, key, 10)]);
      expect(d.weaknesses[0]!.comment).toBe(hint);
    }
  });

  /**
   * **★ 空の軸配列は「0 点」ではなく未算定 (2026-09-08)。**
   *
   * この検査は名前が `空の軸配列でも overallScore は 0 (NaN にならない)` で、
   * 理由もコメントに書いてあった —— 「条件を false に固定する mutant は
   * `Math.round(0/0)=NaN` になるため、この assertion で殺せる」。
   * **NaN にしないために 0 を仕様として固定していた** (パス 71 と同じ形で、
   * これが 3 例目)。`toBeNull()` は同じ変異体を同じように殺す (NaN は null でない)。
   */
  it('★ 空の軸配列は未算定 (null) —— 0 点でも NaN でもない', () => {
    const d = diagnoseFinancials([]);
    // 直す前は 0 だった
    expect(d.overallScore).toBeNull();
    expect(d.grade).toBeNull();
    // 変異体 (`xs.length === 0` を false に固定) は NaN を作るので、これで死ぬ。
    expect(Number.isNaN(d.overallScore as unknown as number)).toBe(false);
  });

  it('弱点が多くても weaknesses は最大 3 件に丸める (.slice(0,3))', () => {
    // 非 good 軸を 5 つ与える (score<70=warn/bad)。slice(0,3) を外す mutant は
    // 5 件返すため、length===3 で殺せる。
    const axes = [
      axis('a', 'A', 10), axis('b', 'B', 12), axis('c', 'C', 14),
      axis('d', 'D', 16), axis('e', 'E', 18),
    ];
    const d = diagnoseFinancials(axes);
    expect(d.weaknesses).toHaveLength(3);
  });
});

describe('diagnoseFinancials — 強みは点数の高い順に並ぶ', () => {
  /*
   * `strengths` は「点数の高い順に上位 3 つ」。並べ替えを外しても入力順で
   * 3 つ返るので、**入力順と点数順が違う入力**でないと確かめられない。
   * 2026-08-20 の実測で、この行の変異体 3 つ (並べ替えの削除・比較関数の
   * 無効化・符号の反転) がどれも生き残っていた。
   */
  const scrambled = [
    axis('equityRatio', '自己資本比率', 75),
    axis('ccc', 'CCC', 95),
    axis('operatingMargin', '営業利益率', 85),
    axis('roe', 'ROE', 100),
    axis('currentRatio', '流動比率', 72),
  ];

  it('高い順の上位 3 つを返す (入力順ではない)', () => {
    const d = diagnoseFinancials(scrambled);
    expect(d.strengths.map((s) => s.key)).toEqual(['roe', 'ccc', 'operatingMargin']);
    expect(d.strengths.map((s) => s.score)).toEqual([100, 95, 85]);
  });

  it('点数は単調に下がる (昇順にも入力順にもならない)', () => {
    const scores = diagnoseFinancials(scrambled).strengths.map((s) => s.score);
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i - 1]!).toBeGreaterThan(scores[i]!);
    }
  });

  it('弱みは低い順 (強みと逆向きであることを同じ入力で見る)', () => {
    const mixed = [
      axis('equityRatio', '自己資本比率', 40),
      axis('ccc', 'CCC', 10),
      axis('operatingMargin', '営業利益率', 30),
      axis('roe', 'ROE', 20),
    ];
    const d = diagnoseFinancials(mixed);
    expect(d.weaknesses.map((w) => w.key)).toEqual(['ccc', 'roe', 'operatingMargin']);
  });
});

/*
 * 台帳 (`parameters.ts`) から渡す評価と格付けの下限。省略時は既定と同じ結果、
 * 渡せば同じ点数の評価・格付けが変わる (境界は「以上」)。
 */
describe('diagnoseFinancials — 台帳から渡す下限 (HealthBands)', () => {
  const two = [axis('equityRatio', '自己資本比率', 72), axis('operatingMargin', '営業利益率', 72)];

  it('既定の引数は定数そのもので、省略時と同じ結果', () => {
    expect(diagnoseFinancials(two, DEFAULT_HEALTH_BANDS)).toEqual(diagnoseFinancials(two));
    expect([levelOf(70), levelOf(69), levelOf(45), levelOf(44)]).toEqual(['good', 'warn', 'warn', 'bad']);
    expect([gradeOf(80), gradeOf(79), gradeOf(35), gradeOf(34)]).toEqual(['S', 'A', 'C', 'D']);
  });

  it('下限を動かすと同じ点数の評価と格付けが変わる', () => {
    const b = { goodMin: 90, warnMin: 60, gradeSMin: 95, gradeAMin: 90, gradeBMin: 70, gradeCMin: 60 };
    expect([levelOf(90, b), levelOf(89, b), levelOf(60, b), levelOf(59, b)]).toEqual(['good', 'warn', 'warn', 'bad']);
    expect([gradeOf(95, b), gradeOf(94, b), gradeOf(90, b), gradeOf(89, b), gradeOf(70, b), gradeOf(69, b), gradeOf(60, b), gradeOf(59, b)]).toEqual([
      'S', 'A', 'A', 'B', 'B', 'C', 'C', 'D',
    ]);
    const d = diagnoseFinancials(two, b);
    expect(d.overallScore).toBe(72);
    expect(d.grade).toBe('B'); // 既定なら A
    expect(d.strengths).toEqual([]); // 既定なら 2 件が良好
    expect(d.weaknesses.map((w) => w.level)).toEqual(['warn', 'warn']);
    expect(diagnoseFinancials(two).grade).toBe('A');
    expect(diagnoseFinancials(two).strengths).toHaveLength(2);
  });

  it('下限を 0 にすれば全部が良好・S、100 にすれば全部が要改善・D', () => {
    const zero = { goodMin: 0, warnMin: 0, gradeSMin: 0, gradeAMin: 0, gradeBMin: 0, gradeCMin: 0 };
    const hundred = { goodMin: 100, warnMin: 100, gradeSMin: 100, gradeAMin: 100, gradeBMin: 100, gradeCMin: 100 };
    const low = [axis('equityRatio', '自己資本比率', 10), axis('ccc', 'CCC', 5)];
    expect(diagnoseFinancials(low, zero).grade).toBe('S');
    expect(diagnoseFinancials(low, zero).strengths).toHaveLength(2);
    expect(diagnoseFinancials(two, hundred).grade).toBe('D');
    expect(diagnoseFinancials(two, hundred).weaknesses.map((w) => w.level)).toEqual(['bad', 'bad']);
  });
});

/**
 * **算定できなかった軸を 0 点として評価に混ぜない (2026-09-08)。**
 *
 * `linScore` は 2026-09-08 まで `raw == null` に 0 点を返しており、
 * `diagnoseFinancials` はその 0 を**総合スコア・カテゴリ平均・強み・要改善**の
 * すべてに混ぜていた。**実測 (production 経路 `deriveBusinessFinancials`)**:
 *
 * | 入力 | 未評価軸 | 直す前の総合 | 直す前に「要改善」と名指しされた軸 |
 * | --- | ---: | --- | --- |
 * | 物販 (変動費あり) | 0/15 | 86 S | 実測された 3 軸 (正しい) |
 * | **サービス業 (変動費 0)** | 2/15 | 78 A | **棚卸資産回転率(0) · CCC(0)** |
 * | **創業前 (売上 0)** | **12/15** | **7 D** | 全部が未入力の軸 |
 *
 * 仕入が無い事業 (士業・コンサル・サービス業 —— このアプリの主要な対象) に
 * **「棚卸資産回転率が低め。在庫の滞留に注意。」**と言っていた。
 * **在庫を持たない事業に、在庫の滞留を警告していた。**
 *
 * パス 55 が team radar で直したのと同じ形。パス 39 は**この同じ 財務健全度
 * grade** の「定数軸による希釈」を直したが、null 軸は残っていた。
 */
describe('diagnoseFinancials — 算定できなかった軸 (未評価)', () => {
  /** `score: null` の軸 (算定不能)。 */
  const unscoredAxis = (key: string, label: string): RadarAxis => ({ key, label, unit: '', raw: null, score: null });

  it('★ 未評価の軸を総合スコアの平均に入れない', () => {
    const d = diagnoseFinancials([
      axis('equityRatio', '自己資本比率', 90),
      axis('operatingMargin', '営業利益率', 90),
      unscoredAxis('ccc', 'CCC'),
    ]);
    // 直す前は (90+90+0)/3 = 60 だった
    expect(d.overallScore).toBe(90);
    expect(d.grade).toBe('S');
    expect(d.unscored.map((u) => u.key)).toEqual(['ccc']);
  });

  it('★ 未評価の軸を「要改善」として名指ししない', () => {
    const d = diagnoseFinancials([
      axis('equityRatio', '自己資本比率', 90),
      unscoredAxis('inventoryTurnover', '棚卸資産回転率'),
      unscoredAxis('ccc', 'CCC'),
    ]);
    expect(d.weaknesses).toEqual([]);
    // 直す前は「棚卸資産回転率が低め。在庫の滞留に注意。」が出ていた。
    expect(d.weaknesses.map((w) => w.comment).join()).not.toContain('在庫の滞留');
    // 弱みではなく「未評価」として別に出す (名前は消さない — 何が測れていないかは伝える)。
    expect(d.unscored.map((u) => u.label)).toEqual(['棚卸資産回転率', 'CCC']);
  });

  it('★ 対照: 実測して低い軸は今も要改善に出る (床が本物の警告を消さない)', () => {
    const d = diagnoseFinancials([
      axis('equityRatio', '自己資本比率', 90),
      { key: 'inventoryTurnover', label: '棚卸資産回転率', unit: '倍', raw: 0.5, score: 5 },
    ]);
    expect(d.weaknesses.map((w) => w.comment).join()).toContain('在庫の滞留');
    expect(d.unscored).toEqual([]);
  });

  it('★ 1 軸も算定できなければ格付けしない (未入力から D を作らない)', () => {
    const d = diagnoseFinancials([unscoredAxis('ccc', 'CCC'), unscoredAxis('roe', 'ROE')]);
    // 直す前は 0 点 → grade D だった
    expect(d.overallScore).toBeNull();
    expect(d.grade).toBeNull();
    expect(d.strengths).toEqual([]);
    expect(d.weaknesses).toEqual([]);
    expect(d.unscored).toHaveLength(2);
  });

  it('★ カテゴリ平均も算定できた軸だけ (全滅したカテゴリは null)', () => {
    const d = diagnoseFinancials([
      axis('equityRatio', '自己資本比率', 80), // 安全性
      unscoredAxis('ccc', 'CCC'), // 効率性 (このカテゴリは全滅)
      unscoredAxis('inventoryTurnover', '棚卸資産回転率'), // 効率性
    ]);
    const safety = d.categories.find((c) => c.category === '安全性')!;
    const efficiency = d.categories.find((c) => c.category === '効率性')!;
    expect(safety.score).toBe(80);
    expect(safety.scoredCount).toBe(1);
    // 直す前は 0 だった (帯が幅 0% で「最悪」に見えた)
    expect(efficiency.score).toBeNull();
    expect(efficiency.scoredCount).toBe(0);
    // 軸の一覧そのものは減らさない (何が属するかは変わらない)。
    expect(efficiency.axisKeys).toEqual(['ccc', 'inventoryTurnover']); // 入力の並び順のまま
  });

  it('★ 実測: 仕入が無い事業 (変動費 0) で在庫の警告を出さない', () => {
    // **production 経路をそのまま通す** —— 士業・コンサル・サービス業の普通の入力。
    const axes = radarAxes(
      computeFinancialRatios(
        deriveBusinessFinancials({ revenue: 1_000_000, variableCost: 0, fixedCost: 700_000, profit: 300_000, profitMargin: 30 }),
      ),
    );
    const d = diagnoseFinancials(axes);
    expect(d.unscored.map((u) => u.key).sort()).toEqual(['ccc', 'inventoryTurnover']);
    expect(d.weaknesses.map((w) => w.key)).not.toContain('inventoryTurnover');
    expect(d.weaknesses.map((w) => w.key)).not.toContain('ccc');
    expect(d.weaknesses.map((w) => w.comment).join()).not.toContain('在庫の滞留');
    // 総合は算定できた 13 軸の平均で、未評価の 2 軸で下がらない。
    expect(d.overallScore).not.toBeNull();
    expect(d.overallScore!).toBeGreaterThan(78); // 直す前は 78
  });

  it('★ 実測: 創業前 (売上 0) を「7 点 D」と格付けしない', () => {
    const axes = radarAxes(
      computeFinancialRatios(
        deriveBusinessFinancials({ revenue: 0, variableCost: 0, fixedCost: 300_000, profit: -300_000, profitMargin: 0 }),
      ),
    );
    const d = diagnoseFinancials(axes);
    expect(d.unscored.length).toBe(12);
    // 直す前は 7 点 / D —— 12/15 軸が未入力なのに格付けが付いていた。
    expect(d.overallScore).not.toBe(7);
    expect(d.overallScore!).toBeGreaterThan(7);
    // 未評価の軸は要改善に 1 つも出ない。
    for (const u of d.unscored) expect(d.weaknesses.map((w) => w.key)).not.toContain(u.key);
  });
});
