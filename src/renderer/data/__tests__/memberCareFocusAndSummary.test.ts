/**
 * **1on1 の焦点とチームのケア概況を、片側だけ欠けた入力と全分岐の全文で留める。** (パス 502)
 *
 * 変異検査の生存 4 件を閉じる。
 *
 * - `oneOnOneFocus` の `skill.strength === null || skill.growth === null`:
 *   `skillEvaluation` が作る評価は強みと伸びしろが**必ず同時に** null になる (最初に評価済みの軸で
 *   両方を初期化する) ので、経由した検査は片方だけ欠ける形を 1 度も作らなかった。ところが
 *   `SkillEvaluation` の型は 2 つを別々の `AxisScore | null` と宣言し、`oneOnOneFocus` は export
 *   されている。片方だけ欠けた入力は型の上で作れる —— 守りが `||` の片側だけなら、そのときは
 *   欠けた側の `.axis` を読んで**投げる** (`&&` へ替えても同じ)。契約は「どちらか一方でも
 *   欠ければ軸を名指ししない・投げない」。
 * - `buildTeamCare` の `unknownCount === members.length`: 全員が記録なしの文
 *   (`気分の記録がまだありません（N 名）。…`) と、一部だけのときの文
 *   (`記録のある M 名は安定しています。残り N 名は気分の記録がまだありません。`) は
 *   **どちらも「気分の記録がまだありません」を含む**ので、既存の断片の `toContain` は区別できず、
 *   全員記録なしの枝が消えても通っていた。ここは全分岐を**値ごと**留める。
 */
import { describe, expect, it } from 'vitest';
import {
  buildTeamCare,
  oneOnOneFocus,
  type AxisScore,
  type CareMemberInput,
  type SkillEvaluation,
} from '../memberCare';

const NOT_EVALUATED = 'まだ評価が入っていません。5 軸の評価をそろえてから、強みと伸びしろの話をしましょう。';

describe('oneOnOneFocus — 強みか伸びしろのどちらかが欠けた評価 (パス 502)', () => {
  const STRENGTH: AxisScore = { axis: '営業力', score: 5 };
  const GROWTH: AxisScore = { axis: '交渉力', score: 2 };
  const skill = (strength: AxisScore | null, growth: AxisScore | null): SkillEvaluation => ({
    average: 3.5,
    level: '良好',
    strength,
    growth,
    evaluatedCount: 2,
    unevaluatedAxes: [],
  });

  it('★ 強みだけ無い・伸びしろだけ無い・両方無い —— どの優先度でも軸を名指しせず「評価をそろえて」と言う', () => {
    for (const priority of ['unknown', 'medium', 'none'] as const) {
      expect(oneOnOneFocus(priority, skill(null, GROWTH)), `${priority} · 強みだけ無い`).toBe(NOT_EVALUATED);
      expect(oneOnOneFocus(priority, skill(STRENGTH, null)), `${priority} · 伸びしろだけ無い`).toBe(NOT_EVALUATED);
      expect(oneOnOneFocus(priority, skill(null, null)), `${priority} · 両方無い`).toBe(NOT_EVALUATED);
    }
  });

  it('★ 傾聴を先に言う high は、欠けていても評価に触れない / 対照: 両方そろえば軸を名指しする', () => {
    expect(oneOnOneFocus('high', skill(null, GROWTH))).toBe(
      'まず気持ちに耳を傾けてください。評価や目標設定は、落ち着いてからで大丈夫です。',
    );
    expect(oneOnOneFocus('none', skill(STRENGTH, GROWTH))).toBe(
      '「営業力」を活かし、「交渉力」の伸ばし方を一緒に考えましょう。',
    );
    expect(oneOnOneFocus('medium', skill(STRENGTH, GROWTH))).toBe(
      '「営業力」の強みを認めつつ、最近の様子にも触れながら「交渉力」の育成を一緒に。',
    );
    expect(oneOnOneFocus('unknown', skill(STRENGTH, GROWTH))).toBe(
      '気分の記録がまだありません。まずは近況を尋ねてから、「営業力」の活かし方を話しましょう。',
    );
  });
});

describe('buildTeamCare — 概況の文を全分岐で全文 (パス 502)', () => {
  const AXES = ['営業力', '顧客対応力', '交渉力'];
  const member = (id: string, moods: readonly number[]): CareMemberInput => ({
    id,
    name: id.toUpperCase(),
    scores: [3, 3, 3],
    moods: moods.map((score) => ({ score, note: '' })),
    analyses: [],
  });
  // 気分の記録の並びと、そこから決まる優先度
  const UNKNOWN = (id: string) => member(id, []); // 記録なし → unknown
  const STABLE = (id: string) => member(id, [4, 4]); // 平均 4 → none
  const MEDIUM = (id: string) => member(id, [2, 2]); // 平均 2・連続低調 2 → medium
  const HIGH = (id: string) => member(id, [1, 2, 1]); // 連続低調 3 → high

  it('★ 7 つの枝がそれぞれ別の 1 文 (全文・繋ぎ目まで)', () => {
    const cases: readonly { readonly label: string; readonly members: readonly CareMemberInput[]; readonly summary: string }[] = [
      { label: '0 名', members: [], summary: 'メンバーがいません。' },
      {
        label: 'high が居る (他に medium / unknown が居ても high が先)',
        members: [HIGH('a'), MEDIUM('b'), UNKNOWN('c')],
        summary: '1 名は気持ちのケアを優先してください（評価より先に傾聴を）。',
      },
      {
        label: 'medium が居る (high なし・unknown が居ても medium が先)',
        members: [MEDIUM('a'), MEDIUM('b'), UNKNOWN('c')],
        summary: '2 名は最近の様子に気を配りつつ 1on1 を。',
      },
      {
        label: '全員が記録なし (2 名)',
        members: [UNKNOWN('a'), UNKNOWN('b')],
        summary: '気分の記録がまだありません（2 名）。まずは近況を聞くところから始めましょう。',
      },
      {
        label: '全員が記録なし (1 名)',
        members: [UNKNOWN('a')],
        summary: '気分の記録がまだありません（1 名）。まずは近況を聞くところから始めましょう。',
      },
      {
        label: '一部だけ記録なし (記録のある人についてだけ「安定」と言う)',
        members: [STABLE('a'), UNKNOWN('b'), UNKNOWN('c')],
        summary: '記録のある 1 名は安定しています。残り 2 名は気分の記録がまだありません。',
      },
      {
        label: '全員が記録ありで安定',
        members: [STABLE('a'), STABLE('b')],
        summary: '全員が安定しています。強みを伸ばす 1on1 を進めましょう。',
      },
    ];
    for (const c of cases) {
      expect(buildTeamCare(c.members, AXES).summary, c.label).toBe(c.summary);
    }
  });

  it('★ 人数の欄は優先度ごとに数える (unknown は high にも medium にも数えない)', () => {
    const team = buildTeamCare([HIGH('a'), MEDIUM('b'), UNKNOWN('c'), UNKNOWN('d'), STABLE('e')], AXES);
    expect({ high: team.highCount, medium: team.mediumCount, unknown: team.unknownCount }).toEqual({
      high: 1,
      medium: 1,
      unknown: 2,
    });
    expect(team.reports.map((r) => r.priority)).toEqual(['high', 'medium', 'unknown', 'unknown', 'none']);
  });
});
