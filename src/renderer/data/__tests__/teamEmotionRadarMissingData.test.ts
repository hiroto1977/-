/**
 * **チーム感情レーダーの「記録が足りず点数を出せなかったメンバー」(`missingData`) を値ごと留める。** (パス 502)
 *
 * 変異検査の生存 4 件を閉じる。どれも `missingData` に**欠けた軸が無いメンバーを混ぜる**形だった:
 *
 * - 欠けた軸を集める配列 `missingAxes` の初期値が空でなくなる
 * - 軸を数えるループが 1 つ多く回り、`undefined` の軸名を足す (`i < sums.length` → `<=`)
 * - 「欠けた軸が 1 つ以上在れば足す」が `true` / `>= 0` になり、全員を足す
 *
 * 既存の検査 (`teamEmotionRadar.test.ts`) は `missingData` を**一部の軸が欠けた標本**でしか
 * 見ず (名前の一覧と `toContain`)、全員がそろった標本では 1 度も見ていなかった。
 * 全員がそろうと、すべての軸が生きて軸を落とさない (`anyKept` が偽) ので、`missingData` は
 * 作られたまま返る —— 混ざった行は画面の「記録がまだ足りない人」に**名指しで出る**。
 *
 * `axes` の中身 (欠けた軸の名前の並び) も値ごと留める。
 */
import { describe, expect, it } from 'vitest';
import { EMOTION_AXES, buildTeamEmotionRadar, type MemberEmotion } from '../teamEmotionRadar';

/** 気分も本文解析もある人 → 5 軸すべてに点数が付く。 */
const full = (id: string, name: string): MemberEmotion => ({
  id,
  name,
  moods: [{ score: 4, note: '' }, { score: 5, note: '' }],
  analyses: [{ dominant: 'joy', sentiment: 'positive' }],
});
/** 気分だけある人 → 本文解析から来る「前向き」だけが欠ける。 */
const moodsOnly = (id: string, name: string): MemberEmotion => ({
  id,
  name,
  moods: [{ score: 4, note: '' }],
  analyses: [],
});
/** 何も記録していない人 → 5 軸すべてが欠ける。 */
const silent = (id: string, name: string): MemberEmotion => ({ id, name, moods: [], analyses: [] });

describe('buildTeamEmotionRadar — missingData (パス 502)', () => {
  it('★ 全員が 5 軸そろっていれば、欠けた人は 1 人も挙げない (空)', () => {
    const r = buildTeamEmotionRadar([full('a', 'あおい'), full('b', 'ぼたん')]);
    expect(r.missingData).toEqual([]);
    // 軸は 1 つも落とさず、元の配列をそのまま返す
    expect(r.axes).toBe(EMOTION_AXES);
  });

  it('★ 1 人だけ「前向き」が欠ける: その人と欠けた軸の名前だけを挙げ、そろっている人は挙げない', () => {
    const r = buildTeamEmotionRadar([full('a', 'あおい'), moodsOnly('b', 'ぼたん')]);
    // あおいが前向きの点数を持つので 5 軸とも生きていて、軸は落ちない
    expect(r.axes).toBe(EMOTION_AXES);
    expect(r.missingData).toEqual([{ id: 'b', name: 'ぼたん', axes: ['前向き'] }]);
  });

  it('★ 誰も何も記録していない: 全員が 5 軸すべて欠け、軸は落とさない (全軸を欠測として名指しする)', () => {
    const r = buildTeamEmotionRadar([silent('c', '未記録の人')]);
    expect(r.axes).toBe(EMOTION_AXES);
    expect(r.teamAverage).toEqual([null, null, null, null, null]);
    expect(r.missingData).toEqual([{ id: 'c', name: '未記録の人', axes: ['活力', '前向き', '安定', '余裕', '回復力'] }]);
  });

  it('★ 誰も持たない軸は結果から落ち、その軸は欠測として名指ししない (欠けた軸が残る人だけを挙げる)', () => {
    const r = buildTeamEmotionRadar([moodsOnly('b', 'ぼたん'), silent('c', '未記録の人')]);
    // 前向きは誰も持たないので軸ごと落ちる。ぼたんは前向きだけが欠けていたので挙げない。
    expect(r.axes).toEqual(['活力', '安定', '余裕', '回復力']);
    expect(r.missingData).toEqual([{ id: 'c', name: '未記録の人', axes: ['活力', '安定', '余裕', '回復力'] }]);
  });

  it('★ 欠けた軸の名前に undefined や見本の文字列が混ざらない (名前はすべて 5 軸の名前のどれか)', () => {
    const r = buildTeamEmotionRadar([silent('c', 'C'), moodsOnly('b', 'B'), full('a', 'A')]);
    for (const m of r.missingData) {
      for (const axis of m.axes) expect(EMOTION_AXES as readonly string[], `${m.name}: ${String(axis)}`).toContain(axis);
    }
    expect(r.missingData.map((m) => m.name)).toEqual(['C', 'B']);
  });
});
