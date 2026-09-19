/**
 * 台帳の**欄と欄の順序** (パス 221)。
 *
 * `parameterIssue` は 1 欄ずつしか見ないので、順序を崩した組は 2026-09-13 まで
 * 1 件も止まらず、45 点の軸が「良好」・35 点の会社が格付け S・所得 500 万円の
 * 法人事業税が 33,000 円 (正しくは約 175,000 円) になっていた。
 *
 * ここで留めるのは 3 つ:
 *   1. 既定値はどの順序も満たす (逆向きに書いた台帳を見つける)。
 *   2. 順序を崩すと `parameterConsistencyIssues` が**その組を名前で**言う。
 *   3. 名前が順序を持ちうる欄 (73 件) は、順序の台帳か「要らない理由」の
 *      どちらかに載っている (両方向)。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMETER_VALUES,
  PARAMETERS,
  PARAMETER_BY_ID,
  resolveParameters,
  type ParameterId,
} from '../parameters';
import { RADAR_AXIS_KEYS } from '../financialHealthBands';
import {
  ORDER_NOT_REQUIRED,
  PARAMETER_DISTINCT,
  PARAMETER_ORDERS,
  isAxisBandParameter,
  looksOrdered,
  parameterConsistencyIssueFor,
  parameterConsistencyIssues,
} from '../parameterConsistency';

/** 台帳に載っている順序つきの欄 (重複なし)。 */
const ORDERED_IDS = [...new Set(PARAMETER_ORDERS.flatMap((o) => o.ids))];
/** 台帳に載っている相違つきの欄 (重複なし)。 */
const DISTINCT_IDS = [...new Set(PARAMETER_DISTINCT.flatMap((d) => d.ids))];

describe('PARAMETER_ORDERS の台帳', () => {
  it('載せた id はすべて実在する', () => {
    for (const id of ORDERED_IDS) expect(PARAMETER_BY_ID.has(id), id).toBe(true);
  });

  it('どの家系も 2 件以上を並べている (1 件では順序が無い)', () => {
    for (const o of PARAMETER_ORDERS) expect(o.ids.length, o.why).toBeGreaterThanOrEqual(2);
  });

  it('同じ id を 2 つの家系に置かない (断りが二重になる)', () => {
    const all = PARAMETER_ORDERS.flatMap((o) => o.ids);
    expect(all.length).toBe(ORDERED_IDS.length);
  });

  it('理由 (why) は空でない — 画面がそのまま刷る', () => {
    for (const o of PARAMETER_ORDERS) expect(o.why.trim().length).toBeGreaterThan(10);
  });

  it('既定値はどの順序も満たす', () => {
    expect(parameterConsistencyIssues(DEFAULT_PARAMETER_VALUES)).toEqual([]);
  });

  it('単位と種別が家系の中で揃っている (点と円を比べない)', () => {
    for (const o of PARAMETER_ORDERS) {
      const units = new Set(o.ids.map((id) => PARAMETER_BY_ID.get(id)!.unit));
      expect(units.size, `${o.ids.join(' / ')}`).toBe(1);
    }
  });
});

describe('parameterConsistencyIssues — 順序を崩したら名前で言う', () => {
  /** 家系の隣り合う組を入れ替えた有効値を作る。 */
  function swapped(order: readonly ParameterId[], i: number) {
    const lo = order[i]!;
    const hi = order[i + 1]!;
    return resolveParameters({
      [lo]: DEFAULT_PARAMETER_VALUES[hi],
      [hi]: DEFAULT_PARAMETER_VALUES[lo],
    });
  }

  for (const o of PARAMETER_ORDERS) {
    for (let i = 0; i + 1 < o.ids.length; i++) {
      const lo = o.ids[i]!;
      const hi = o.ids[i + 1]!;
      it(`${lo} > ${hi} を断る`, () => {
        // 既定が等しい組は入れ替えても崩れない — その組は順序の検査の対象外。
        if (DEFAULT_PARAMETER_VALUES[lo] === DEFAULT_PARAMETER_VALUES[hi]) return;
        const issues = parameterConsistencyIssues(swapped(o.ids, i));
        expect(issues.length).toBeGreaterThan(0);
        const loLabel = PARAMETER_BY_ID.get(lo)!.label;
        const hiLabel = PARAMETER_BY_ID.get(hi)!.label;
        expect(issues.some((t) => t.includes(loLabel) && t.includes(hiLabel))).toBe(true);
        // 理由まで刷る (「何が起きるか」を言わない断りは直しようがない)。
        expect(issues.some((t) => t.includes(o.why))).toBe(true);
      });
    }
  }

  it('断りには今の値が入る (どちらを直すか読めるように)', () => {
    const v = resolveParameters({
      'financeHealth.levelWarnMin': 60,
      'financeHealth.levelGoodMin': 40,
    });
    const issues = parameterConsistencyIssues(v);
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain('(60点)');
    expect(issues[0]).toContain('(40点)');
  });

  it('順序を持たない欄を動かしても何も言わない (対照)', () => {
    const v = resolveParameters({ 'deduction.smallBizMutualAnnualCap': 1 });
    expect(parameterConsistencyIssues(v)).toEqual([]);
  });
});

describe('parameterConsistencyIssueFor — 保存の前の関門', () => {
  it('「良好」の下限を「注意」の下限より下げる保存を断る', () => {
    const issue = parameterConsistencyIssueFor(
      'financeHealth.levelGoodMin',
      DEFAULT_PARAMETER_VALUES['financeHealth.levelWarnMin'] - 1,
      DEFAULT_PARAMETER_VALUES,
    );
    expect(issue).not.toBeNull();
    expect(issue).toContain('軸の評価「注意」の下限');
  });

  it('「注意」の下限を「良好」の下限より上げる保存を断る (逆向きの欄でも鳴る)', () => {
    const issue = parameterConsistencyIssueFor(
      'financeHealth.levelWarnMin',
      DEFAULT_PARAMETER_VALUES['financeHealth.levelGoodMin'] + 1,
      DEFAULT_PARAMETER_VALUES,
    );
    expect(issue).not.toBeNull();
  });

  it('等しい値は通す (帯が空になるだけで矛盾はしない)', () => {
    const same = DEFAULT_PARAMETER_VALUES['financeHealth.levelGoodMin'];
    expect(parameterConsistencyIssueFor('financeHealth.levelWarnMin', same, DEFAULT_PARAMETER_VALUES)).toBeNull();
  });

  it('順序を持たない欄は常に通す', () => {
    expect(parameterConsistencyIssueFor('deduction.smallBizMutualAnnualCap', 1, DEFAULT_PARAMETER_VALUES)).toBeNull();
  });

  it('すでに壊れている組を直す途中の 1 欄は止めない', () => {
    // 保存済みの値が逆 (warn 60 / good 40)。good を 50 にすると矛盾は残るが、
    // その 1 手を「あなたのせい」と断ると順序へ戻す道が閉じる。
    const broken = resolveParameters({
      'financeHealth.levelWarnMin': 60,
      'financeHealth.levelGoodMin': 40,
    });
    expect(parameterConsistencyIssues(broken).length).toBe(1);
    expect(parameterConsistencyIssueFor('financeHealth.levelGoodMin', 50, broken)).toBeNull();
    // 直し切る手も当然通る。
    expect(parameterConsistencyIssueFor('financeHealth.levelGoodMin', 70, broken)).toBeNull();
  });

  it('壊れている組の**別の**家系を壊す保存は断る (前の矛盾に紛れない)', () => {
    const broken = resolveParameters({
      'financeHealth.levelWarnMin': 60,
      'financeHealth.levelGoodMin': 40,
    });
    const issue = parameterConsistencyIssueFor('corporate.businessTaxTier2Limit', 1, broken);
    expect(issue).not.toBeNull();
    expect(issue).toContain('法人事業税の所得段階の境目');
  });
});

describe('PARAMETER_DISTINCT — 等しいと上書きが黙って捨てられる組 (パス 222)', () => {
  it('レーダーの軸ぶん・1 軸 2 件を並べている (軸の一覧は RADAR_AXIS_KEYS から導く)', () => {
    expect(PARAMETER_DISTINCT.length).toBe(RADAR_AXIS_KEYS.length);
    expect(PARAMETER_DISTINCT.length).toBe(15);
    for (const d of PARAMETER_DISTINCT) expect(d.ids.length).toBe(2);
    expect(DISTINCT_IDS.length).toBe(30);
  });

  it('載せた id はすべて実在する', () => {
    for (const id of DISTINCT_IDS) expect(PARAMETER_BY_ID.has(id), id).toBe(true);
  });

  it('順序の台帳と重ねない (断りが二重になる)', () => {
    for (const id of DISTINCT_IDS) expect(ORDERED_IDS.includes(id), id).toBe(false);
  });

  it('既定値はどの組も等しくない', () => {
    for (const d of PARAMETER_DISTINCT) {
      const [a, b] = d.ids;
      expect(DEFAULT_PARAMETER_VALUES[a], `${a} / ${b}`).not.toBe(DEFAULT_PARAMETER_VALUES[b]);
    }
  });

  it('理由は「既定の水準で採点される」= 上書きが効かないことを述べている', () => {
    for (const d of PARAMETER_DISTINCT) {
      expect(d.why).toContain('既定');
      expect(d.why).toContain('効きません');
    }
  });

  for (const d of PARAMETER_DISTINCT) {
    const [a, b] = d.ids;
    it(`${a} == ${b} を断る`, () => {
      const v = resolveParameters({ [a]: DEFAULT_PARAMETER_VALUES[b], [b]: DEFAULT_PARAMETER_VALUES[b] });
      const issues = parameterConsistencyIssues(v);
      expect(issues.length).toBe(1);
      expect(issues[0]).toContain(PARAMETER_BY_ID.get(a)!.label);
      expect(issues[0]).toContain(PARAMETER_BY_ID.get(b)!.label);
      expect(issues[0]).toContain(d.why);
    });
  }

  it('保存の前の関門が、等しくする 1 手を断る (両方向)', () => {
    const bad = DEFAULT_PARAMETER_VALUES['financeHealth.equityRatioBad'];
    const good = DEFAULT_PARAMETER_VALUES['financeHealth.equityRatioGood'];
    expect(parameterConsistencyIssueFor('financeHealth.equityRatioBad', good, DEFAULT_PARAMETER_VALUES)).not.toBeNull();
    expect(parameterConsistencyIssueFor('financeHealth.equityRatioGood', bad, DEFAULT_PARAMETER_VALUES)).not.toBeNull();
  });

  it('等しくない値は通す (対照 — 断りが全部を止めていないこと)', () => {
    expect(parameterConsistencyIssueFor('financeHealth.equityRatioBad', 10, DEFAULT_PARAMETER_VALUES)).toBeNull();
    // 向きを逆にするのは利用者の選択なので通す (軸ごとに高い方が良い / 低い方が良いが変わる)。
    expect(parameterConsistencyIssueFor('financeHealth.equityRatioBad', 99, DEFAULT_PARAMETER_VALUES)).toBeNull();
  });

  it('等しいまま保存されている組を直す途中の 1 手は止めない', () => {
    const same = DEFAULT_PARAMETER_VALUES['financeHealth.equityRatioGood'];
    const broken = resolveParameters({ 'financeHealth.equityRatioBad': same });
    expect(parameterConsistencyIssues(broken).length).toBe(1);
    expect(parameterConsistencyIssueFor('financeHealth.equityRatioBad', 5, broken)).toBeNull();
  });
});

describe('母集団 — 順序を持ちうる欄はすべて裁定済み (パス 221)', () => {
  const SUSPECTS: readonly string[] = PARAMETERS.map((p) => p.id as string).filter(
    (id) => looksOrdered(id) || isAxisBandParameter(id),
  );

  it('走査が母集団を拾っている (縮んだら鳴る床)', () => {
    // 2026-09-13 実測 73 件 (順序つき 15 / 軸の 0-100 点 30 / 要らない 25 の内訳は下)。
    expect(SUSPECTS.length).toBeGreaterThanOrEqual(70);
  });

  it('順序を持ちうる欄はすべて「順序つき」「軸の水準」「要らない (理由つき)」のどれか', () => {
    const unjudged = SUSPECTS.filter(
      (id) =>
        !ORDERED_IDS.includes(id as ParameterId) &&
        !DISTINCT_IDS.includes(id as ParameterId) &&
        ORDER_NOT_REQUIRED[id] === undefined,
    );
    expect(unjudged).toEqual([]);
  });

  it('逆向き — 台帳に載っている id は実際に走査に拾われる (綴りのずれを見つける)', () => {
    for (const id of ORDERED_IDS) expect(SUSPECTS.includes(id), id).toBe(true);
    for (const id of DISTINCT_IDS) expect(SUSPECTS.includes(id), id).toBe(true);
    for (const id of Object.keys(ORDER_NOT_REQUIRED)) expect(SUSPECTS.includes(id), id).toBe(true);
  });

  it('「要らない」の台帳に理由が書かれている', () => {
    for (const [id, why] of Object.entries(ORDER_NOT_REQUIRED)) {
      expect(why.trim().length, id).toBeGreaterThan(10);
    }
  });

  it('「要らない」の台帳に、順序つきの欄を重ねて置かない', () => {
    for (const id of ORDERED_IDS) expect(ORDER_NOT_REQUIRED[id], id).toBeUndefined();
  });

  it('軸の 0-100 点の水準は 15 軸 × 2 件あり、すべて相違の台帳に載っている', () => {
    const axisIds = SUSPECTS.filter((id) => isAxisBandParameter(id));
    expect(axisIds.length).toBe(30);
    for (const id of axisIds) expect(DISTINCT_IDS.includes(id as ParameterId), id).toBe(true);
    // 逆向き: 相違の台帳に軸以外を混ぜていない。
    for (const id of DISTINCT_IDS) expect(isAxisBandParameter(id), id).toBe(true);
  });

  it('looksOrdered / isAxisBandParameter は標本に当たる (空の走査でないこと)', () => {
    expect(looksOrdered('financeHealth.levelGoodMin')).toBe(true);
    expect(looksOrdered('corporate.businessTaxTier1Limit')).toBe(true);
    expect(looksOrdered('deduction.donationFloor')).toBe(true);
    expect(looksOrdered('corporate.standardRate')).toBe(false);
    expect(isAxisBandParameter('financeHealth.cccBad')).toBe(true);
    expect(isAxisBandParameter('financeHealth.levelGoodMin')).toBe(false);
  });
});
