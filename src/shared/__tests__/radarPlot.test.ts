/**
 * **レーダー図に何を描き、何を描かないか** (2026-09-12 · パス 190)。
 *
 * 欠測は 2 通りの形で来る。どちらも「その軸が最低」ではない:
 * `null` / 配列が軸より短い (感情レーダー・古い下書き) と、**`0`** (下書きの
 * `finiteOrZero` が数でない値を倒した分)。2 つ目が効く —— 評点の欄は
 * `isEvaluatedScore` を見て「—」と刷るのに、同じ画面の多角形は 0 を中心に置いていた。
 */
import { describe, expect, it } from 'vitest';
import {
  axisName,
  isPlottableScore,
  omittedRadarNote,
  planRadarPlot,
} from '../radarPlot';
import { SCORE_MAX, SCORE_MIN } from '../teamRadarState';

const AXES = ['営業力', '顧客対応力', 'プレゼン力', '交渉力', '顧客管理力'];

describe('isPlottableScore — 図に置ける値', () => {
  it('範囲の中の整数と小数を通す', () => {
    for (let n = SCORE_MIN; n <= SCORE_MAX; n += 1) expect(isPlottableScore(n)).toBe(true);
    expect(isPlottableScore(3.5)).toBe(true);
  });

  it('★ 未評価の 0 は置けない (範囲の外)', () => {
    expect(isPlottableScore(0)).toBe(false);
    expect(isPlottableScore(SCORE_MIN - 1)).toBe(false);
    expect(isPlottableScore(SCORE_MAX + 1)).toBe(false);
  });

  it('★ null / undefined / 数でない値 / NaN / Infinity を置けない', () => {
    expect(isPlottableScore(null)).toBe(false);
    expect(isPlottableScore(undefined)).toBe(false);
    expect(isPlottableScore('3')).toBe(false);
    expect(isPlottableScore(Number.NaN)).toBe(false);
    expect(isPlottableScore(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('境界そのものは通す (SCORE_MIN / SCORE_MAX)', () => {
    expect(isPlottableScore(SCORE_MIN)).toBe(true);
    expect(isPlottableScore(SCORE_MAX)).toBe(true);
  });
});

describe('axisName — 名前が無ければ位置で呼ぶ', () => {
  it('在る名前を返す', () => {
    expect(axisName(AXES, 2)).toBe('プレゼン力');
  });
  it('★ 無い / 空の軸名は「軸 N」(無言で落とさない)', () => {
    expect(axisName(AXES, 9)).toBe('軸 10');
    expect(axisName(['', 'x'], 0)).toBe('軸 1');
  });
});

describe('planRadarPlot', () => {
  it('全軸に値が在る人は描く', () => {
    const plan = planRadarPlot(AXES, [{ id: 'a', name: '田中', scores: [5, 4, 3, 2, 1] }]);
    expect(plan.drawable).toEqual([{ id: 'a', name: '田中', scores: [5, 4, 3, 2, 1] }]);
    expect(plan.omitted).toEqual([]);
  });

  it('★ 配列が軸より短い人は描かず、欠けた軸を名指しする', () => {
    const plan = planRadarPlot(AXES, [{ id: 'a', name: '田中', scores: [5, 5] }]);
    expect(plan.drawable).toEqual([]);
    expect(plan.omitted).toEqual([
      { id: 'a', name: '田中', missingAxes: ['プレゼン力', '交渉力', '顧客管理力'] },
    ]);
  });

  it('★ 未評価の 0 が 1 つでも在れば描かない (0 を中心に置かない)', () => {
    const plan = planRadarPlot(AXES, [{ id: 'a', name: '田中', scores: [5, 4, 0, 2, 1] }]);
    expect(plan.drawable).toEqual([]);
    expect(plan.omitted[0]!.missingAxes).toEqual(['プレゼン力']);
  });

  it('★ null の軸 (感情レーダーの記録なし) も同じ扱い', () => {
    const plan = planRadarPlot(AXES, [{ id: 'a', name: '田中', scores: [5, null, 3, 2, 1] }]);
    expect(plan.drawable).toEqual([]);
    expect(plan.omitted[0]!.missingAxes).toEqual(['顧客対応力']);
  });

  it('描ける人と描けない人は混ざってよい (片方だけ落とす)', () => {
    const plan = planRadarPlot(AXES, [
      { id: 'a', name: '描ける', scores: [1, 2, 3, 4, 5] },
      { id: 'b', name: '描けない', scores: [1, 2, 3, 4, 0] },
    ]);
    expect(plan.drawable.map((m) => m.name)).toEqual(['描ける']);
    expect(plan.omitted.map((m) => m.name)).toEqual(['描けない']);
  });

  it('★ 軸が 0 本なら誰も描けない (図そのものが成り立たない)', () => {
    const plan = planRadarPlot([], [{ id: 'a', name: '田中', scores: [5] }]);
    expect(plan).toEqual({ drawable: [], omitted: [] });
  });

  it('軸より長い配列は余りを見ない (軸の数だけ読む)', () => {
    const plan = planRadarPlot(AXES, [{ id: 'a', name: '田中', scores: [1, 2, 3, 4, 5, 0, 0] }]);
    expect(plan.drawable[0]!.scores).toEqual([1, 2, 3, 4, 5]);
    expect(plan.omitted).toEqual([]);
  });
});

describe('omittedRadarNote — 描かなかった人を名指しする', () => {
  it('全員描けていれば null', () => {
    expect(omittedRadarNote(planRadarPlot(AXES, [{ id: 'a', name: 'x', scores: [1, 1, 1, 1, 1] }])))
      .toBeNull();
  });

  it('★ 件数と、誰のどの軸が欠けているかを書く', () => {
    const note = omittedRadarNote(planRadarPlot(AXES, [
      { id: 'a', name: '田中', scores: [5, 4, 0, 2, 1] },
      { id: 'b', name: '佐藤', scores: [5, 4] },
    ]));
    expect(note).not.toBeNull();
    expect(note).toContain('2 名を図に描いていません');
    expect(note).toContain('田中 (プレゼン力)');
    expect(note).toContain('佐藤 (プレゼン力・交渉力・顧客管理力)');
    // 標本: 直っていなければ出ていない文 (これが消えたら黙って落としている)
    expect(note).toContain('評点が入っていない軸があるため');
  });
});
