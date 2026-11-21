/**
 * **チーム感情のサマリ文を、活力の平均が読めないときも含めて全文で留める。** (パス 502)
 *
 * `teamEmotionSummary` は 1 行の文を返す。活力の平均 (`teamAverage[0]`) が算定できていれば数を出し、
 * **算定できていなければ数を出さない** (`undefined/5` も `0/5` も刷らない —— 「活力 0/5」は
 * 最低評価の主張になる)。算定できない形は `null` と、**配列が空で添字が `undefined`** の 2 通りで、
 * 後者は `buildTeamEmotionRadar` が返す物ではないが、`TeamEmotionRadar` の型は空の配列を許す。
 * 既存の検査は算定できている 2 通りしか見ておらず、算定できない側の文は 1 度も主張されていなかった。
 *
 * レーダーは手で組む (`buildTeamEmotionRadar` の出力に依らず、文だけを見る)。
 */
import { describe, expect, it } from 'vitest';
import { buildTeamEmotionRadar, teamEmotionSummary, type RadarMember, type TeamEmotionRadar } from '../teamEmotionRadar';

const member = (id: string): RadarMember => ({ id, name: id, scores: [3, null, 3, 3, 3] });
const radar = (over: Partial<TeamEmotionRadar>): TeamEmotionRadar => ({
  axes: ['活力', '前向き', '安定', '余裕', '回復力'],
  members: [member('a')],
  teamAverage: [3.5, null, 3, 3, 3],
  needsSupport: [],
  missingData: [],
  ...over,
});
const SUPPORT = [
  { id: 'a', name: 'A', reason: '平均的な気分が低め' },
  { id: 'b', name: 'B', reason: '連続して低調が 3 日' },
];

describe('teamEmotionSummary — 全文 (パス 502)', () => {
  it('★ メンバーが 0 人なら、感情データが無いと言う', () => {
    expect(teamEmotionSummary(radar({ members: [] }))).toBe('メンバーの感情データがありません。');
  });

  it('★ 活力の平均が在り、声かけ対象が無ければ「全員が安定」と言う', () => {
    expect(teamEmotionSummary(radar({}))).toBe('チーム 1 名の感情ウェルビーイング: 活力 3.5/5。いまのところ全員が安定しています。');
  });

  it('★ 活力の平均が在り、声かけ対象が在れば、人数を言う (「安定」とは言わない)', () => {
    const text = teamEmotionSummary(radar({ members: [member('a'), member('b')], needsSupport: SUPPORT }));
    expect(text).toBe('チーム 2 名の感情ウェルビーイング: 活力 3.5/5。2 名に声かけをおすすめします。');
    expect(text).not.toContain('安定');
  });

  for (const [name, teamAverage] of [
    ['null', [null, null, null, null, null]],
    ['空の配列 (添字が undefined)', []],
  ] as const) {
    it(`★ 活力の平均が ${name} のときは数を出さず、記録が無いために算定していないと言う`, () => {
      const text = teamEmotionSummary(radar({ teamAverage: [...teamAverage] }));
      expect(text).toBe('チーム 1 名の感情ウェルビーイング: 活力は気分の記録がまだ無いため算定していません。まずは気分の記録から始めてください。');
      // 数を刷らない (undefined も 0 も)。「全員が安定」とも言わない。
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('/5');
      expect(text).not.toContain('安定');
    });

    it(`★ 活力の平均が ${name} でも、声かけ対象が在ればその人数を言う (記録の案内ではなく)`, () => {
      expect(teamEmotionSummary(radar({ teamAverage: [...teamAverage], needsSupport: SUPPORT }))).toBe(
        'チーム 1 名の感情ウェルビーイング: 活力は気分の記録がまだ無いため算定していません。2 名に声かけをおすすめします。',
      );
    });
  }

  it('★ 実際に組んだレーダーでも同じ: 気分の記録が 1 件も無いチームは算定していないと言う', () => {
    const r = buildTeamEmotionRadar([{ id: 'a', name: 'A', moods: [], analyses: [] }]);
    expect(teamEmotionSummary(r)).toBe(
      'チーム 1 名の感情ウェルビーイング: 活力は気分の記録がまだ無いため算定していません。まずは気分の記録から始めてください。',
    );
  });
});
