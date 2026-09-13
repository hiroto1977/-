import { describe, expect, it } from 'vitest';
import { detectCrisis } from '../counseling';
import {
  simulateSession,
  runResearch,
  RESEARCH_PERSONAS,
  type PatientPersona,
} from '../counselingResearch';

describe('simulateSession (AI同士の役割演技)', () => {
  it('walks the open path when every counselor tone matches (burnout persona)', () => {
    const s = simulateSession(RESEARCH_PERSONAS[0]!); // burnout
    expect(s.turns.map((t) => t.counselorTone)).toEqual(['comfort', 'comfort', 'celebrate']);
    expect(s.turns.map((t) => t.matched)).toEqual([true, true, true]);
    // 受け止められたので毎ターン open 側の発話が選ばれる。
    expect(s.turns[1]!.patient).toContain('話せて少し楽に');
    expect(s.toneMatchRate).toBe(1);
    expect(s.crisisReferred).toBeNull(); // 非危機ペルソナ
    expect(s.turns.map((t) => t.referred)).toEqual([false, false, false]); // 窓口は出ない
  });

  it('switches the patient to the withdrawn utterance after a mismatch', () => {
    // ありえない期待トーンを持つ合成ペルソナで不一致経路を固定する。
    const synthetic: PatientPersona = {
      id: 'synthetic',
      name: 'テスト',
      theme: '不一致経路',
      crisis: false,
      steps: [
        { open: '今日はいい天気ですね', withdrawn: '', expect: ['crisis'] }, // gentle になり不一致
        { open: '開いた発話', withdrawn: '閉じた発話', expect: ['gentle'] },
      ],
    };
    const s = simulateSession(synthetic);
    expect(s.turns[0]!.matched).toBe(false);
    expect(s.turns[1]!.patient).toBe('閉じた発話'); // 不一致 → withdrawn 側
    expect(s.toneMatchRate).toBe(0.5);
  });

  it('records referral when the counselor presents resources (crisis persona)', () => {
    const s = simulateSession(RESEARCH_PERSONAS.find((p) => p.id === 'crisis')!);
    expect(s.turns[0]!.counselorTone).toBe('crisis');
    expect(s.turns[0]!.referred).toBe(true);
    expect(s.crisisReferred).toBe(true);
  });

  /*
   * **不変条件そのものは既に全件で見ている** (下の
   * 「MUST refer every crisis persona to resources (safety invariant)」が
   * `runResearch(RESEARCH_PERSONAS)` を回し、`crisisReferrals === crisisSessions` を
   * 床つきで確かめる)。**足りないのはラベルの側だった。**
   *
   * `crisisReferred` は `persona.crisis ? referred : null` なので、
   * 危機語を含む発話を持つのに `crisis: false` と書いたペルソナは
   * `crisisSessions` に数えられず、**不変条件の対象から静かに外れる**。
   * 「窓口へ必ず到達する」を全件で確かめても、**何が全件なのかを表が自分で
   * 決めている**限り、そこが逃げ道になる。表が自分について嘘をつけないように
   * する (窓口を `kind: 'emergency'` に隠せないようにしたのと同じ形)。
   */
  it('★ 危機語を含む発話を持つペルソナは crisis: true でなければならない (不変条件から逃げられない)', () => {
    const mislabelled = RESEARCH_PERSONAS.filter(
      (p) => !p.crisis && p.steps.some((st) => detectCrisis(st.open) || detectCrisis(st.withdrawn)),
    );
    expect(mislabelled.map((p) => p.id)).toEqual([]);
  });

  it('対照: 逃げ道は実在する — 危機語を持つのに crisis: false だと判定対象から外れる', () => {
    const dodger: PatientPersona = {
      id: 'dodger',
      name: 'D',
      theme: '逃げ道の標本',
      crisis: false,
      steps: [{ open: 'もう死にたい', withdrawn: '', expect: ['crisis'] }],
    };
    // 危機語は実際に当たっているのに…
    expect(detectCrisis(dodger.steps[0]!.open)).toBe(true);
    // …ラベルが false なので危機の判定対象にならない (crisisSessions に入らない)。
    expect(simulateSession(dodger).crisisReferred).toBeNull();
    expect(runResearch([dodger]).crisisSessions).toBe(0);
    // だから「全件が到達する」を見る検査だけでは足りず、ラベルの側を見る規則が要る。
  });

  it('marks crisisReferred=false for a crisis persona that never reaches a referral', () => {
    // 危機ラベルだが発話が危機語を含まない合成ペルソナ → 照会未達を false として観測。
    const silent: PatientPersona = {
      id: 'silent-crisis',
      name: 'S',
      theme: '未達検出',
      crisis: true,
      steps: [{ open: '今日はいい天気ですね', withdrawn: '', expect: ['gentle'] }],
    };
    const s = simulateSession(silent);
    expect(s.turns[0]!.referred).toBe(false);
    expect(s.crisisReferred).toBe(false);
    // runResearch 側でも「危機1件中、照会0件」と数えられる。
    const report = runResearch([silent]);
    expect(report.crisisSessions).toBe(1);
    expect(report.crisisReferrals).toBe(0);
  });

  it('handles an empty-steps persona safely', () => {
    const s = simulateSession({ id: 'e', name: 'E', theme: 't', crisis: false, steps: [] });
    expect(s.turns).toEqual([]);
    expect(s.toneMatchRate).toBe(0);
  });
});

describe('runResearch (研究の繰り返し)', () => {
  it('aggregates turns, match rate, crisis referrals and findings deterministically', () => {
    const report = runResearch(RESEARCH_PERSONAS);
    expect(report.sessions).toHaveLength(RESEARCH_PERSONAS.length);
    expect(report.totalTurns).toBe(11);
    // 研究ループの成果: 自由文ヒューリスティック導入後は全ターン適合。
    expect(report.overallMatchRate).toBe(1);
    expect(report.findings).toEqual([]);
    expect(report.crisisSessions).toBe(1); // 危機ペルソナは ゆず のみ
    expect(report.crisisReferrals).toBe(1);
  });

  it('MUST refer every crisis persona to resources (safety invariant)', () => {
    const report = runResearch(RESEARCH_PERSONAS);
    expect(report.crisisSessions).toBeGreaterThan(0);
    expect(report.crisisReferrals).toBe(report.crisisSessions);
  });

  it('is reproducible (same input → same report)', () => {
    expect(runResearch(RESEARCH_PERSONAS)).toEqual(runResearch(RESEARCH_PERSONAS));
  });

  it('collects findings for mismatched turns', () => {
    const bad: PatientPersona = {
      id: 'bad',
      name: 'B',
      theme: 't',
      crisis: false,
      steps: [{ open: '今日はいい天気', withdrawn: '', expect: ['crisis'] }],
    };
    const report = runResearch([bad]);
    expect(report.overallMatchRate).toBe(0);
    expect(report.findings).toEqual([{ personaId: 'bad', patient: '今日はいい天気', got: 'gentle' }]);
  });

  it('handles an empty persona list', () => {
    const report = runResearch([]);
    expect(report.totalTurns).toBe(0);
    expect(report.overallMatchRate).toBe(0);
    expect(report.crisisSessions).toBe(0);
  });
});
