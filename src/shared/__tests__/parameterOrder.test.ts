/**
 * 台帳の**欄と欄の順序** (パス 221)。
 *
 * `parameterIssue` は 1 欄ずつしか見ないので、順序を崩した組は 2026-09-13 まで
 * 1 件も止まらず、45 点の軸が「良好」・35 点の会社が格付け S・所得 500 万円の
 * 法人事業税が 33,000 円 (正しくは約 175,000 円) になっていた。
 *
 * ここで留めるのは 3 つ:
 *   1. 既定値はどの順序も満たす (逆向きに書いた台帳を見つける)。
 *   2. 順序を崩すと `parameterOrderIssues` が**その組を名前で**言う。
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
import {
  ORDER_NOT_REQUIRED,
  PARAMETER_ORDERS,
  isAxisBandParameter,
  looksOrdered,
  parameterOrderIssueFor,
  parameterOrderIssues,
} from '../parameterOrder';

/** 台帳に載っている順序つきの欄 (重複なし)。 */
const ORDERED_IDS = [...new Set(PARAMETER_ORDERS.flatMap((o) => o.ids))];

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
    expect(parameterOrderIssues(DEFAULT_PARAMETER_VALUES)).toEqual([]);
  });

  it('単位と種別が家系の中で揃っている (点と円を比べない)', () => {
    for (const o of PARAMETER_ORDERS) {
      const units = new Set(o.ids.map((id) => PARAMETER_BY_ID.get(id)!.unit));
      expect(units.size, `${o.ids.join(' / ')}`).toBe(1);
    }
  });
});

describe('parameterOrderIssues — 順序を崩したら名前で言う', () => {
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
        const issues = parameterOrderIssues(swapped(o.ids, i));
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
    const issues = parameterOrderIssues(v);
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain('(60点)');
    expect(issues[0]).toContain('(40点)');
  });

  it('順序を持たない欄を動かしても何も言わない (対照)', () => {
    const v = resolveParameters({ 'deduction.smallBizMutualAnnualCap': 1 });
    expect(parameterOrderIssues(v)).toEqual([]);
  });
});

describe('parameterOrderIssueFor — 保存の前の関門', () => {
  it('「良好」の下限を「注意」の下限より下げる保存を断る', () => {
    const issue = parameterOrderIssueFor(
      'financeHealth.levelGoodMin',
      DEFAULT_PARAMETER_VALUES['financeHealth.levelWarnMin'] - 1,
      DEFAULT_PARAMETER_VALUES,
    );
    expect(issue).not.toBeNull();
    expect(issue).toContain('軸の評価「注意」の下限');
  });

  it('「注意」の下限を「良好」の下限より上げる保存を断る (逆向きの欄でも鳴る)', () => {
    const issue = parameterOrderIssueFor(
      'financeHealth.levelWarnMin',
      DEFAULT_PARAMETER_VALUES['financeHealth.levelGoodMin'] + 1,
      DEFAULT_PARAMETER_VALUES,
    );
    expect(issue).not.toBeNull();
  });

  it('等しい値は通す (帯が空になるだけで矛盾はしない)', () => {
    const same = DEFAULT_PARAMETER_VALUES['financeHealth.levelGoodMin'];
    expect(parameterOrderIssueFor('financeHealth.levelWarnMin', same, DEFAULT_PARAMETER_VALUES)).toBeNull();
  });

  it('順序を持たない欄は常に通す', () => {
    expect(parameterOrderIssueFor('deduction.smallBizMutualAnnualCap', 1, DEFAULT_PARAMETER_VALUES)).toBeNull();
  });

  it('すでに壊れている組を直す途中の 1 欄は止めない', () => {
    // 保存済みの値が逆 (warn 60 / good 40)。good を 50 にすると矛盾は残るが、
    // その 1 手を「あなたのせい」と断ると順序へ戻す道が閉じる。
    const broken = resolveParameters({
      'financeHealth.levelWarnMin': 60,
      'financeHealth.levelGoodMin': 40,
    });
    expect(parameterOrderIssues(broken).length).toBe(1);
    expect(parameterOrderIssueFor('financeHealth.levelGoodMin', 50, broken)).toBeNull();
    // 直し切る手も当然通る。
    expect(parameterOrderIssueFor('financeHealth.levelGoodMin', 70, broken)).toBeNull();
  });

  it('壊れている組の**別の**家系を壊す保存は断る (前の矛盾に紛れない)', () => {
    const broken = resolveParameters({
      'financeHealth.levelWarnMin': 60,
      'financeHealth.levelGoodMin': 40,
    });
    const issue = parameterOrderIssueFor('corporate.businessTaxTier2Limit', 1, broken);
    expect(issue).not.toBeNull();
    expect(issue).toContain('法人事業税の所得段階の境目');
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
        !isAxisBandParameter(id) &&
        ORDER_NOT_REQUIRED[id] === undefined,
    );
    expect(unjudged).toEqual([]);
  });

  it('逆向き — 台帳に載っている id は実際に走査に拾われる (綴りのずれを見つける)', () => {
    for (const id of ORDERED_IDS) expect(SUSPECTS.includes(id), id).toBe(true);
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

  it('軸の 0-100 点の水準は 15 軸 × 2 件ある (走査の綴りの対照)', () => {
    expect(SUSPECTS.filter((id) => isAxisBandParameter(id)).length).toBe(30);
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
