import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  LEADER_DISQUALIFIERS,
  ORGAN_DISEASES,
  SKILL_STEPS,
  STEP1_MASTERY_YEARS,
  achievementGap,
  diagnoseOrg,
  fetchTalentSnapshotImpl,
  isValidLadderMember,
  isValidProbability,
  judgeLeaderFitness,
  judgeLeaderImpl,
  loadTalentState,
  reviewLadder,
  sanitizeInitiatives,
  sanitizeReports,
  saveTalentState,
  saveTalentStateImpl,
  type LadderMember,
  type TalentState,
} from '../talent';

const CTX = { token: '', payload: {} };

describe('5つの企業組織病 — 定義表', () => {
  it('5つある', () => {
    expect(ORGAN_DISEASES).toHaveLength(5);
  });

  it('id が重複していない', () => {
    expect(new Set(ORGAN_DISEASES.map((d) => d.id)).size).toBe(5);
  });

  it('★ 出典の強さを全項が持つ — 読み解きを確認済みと混ぜない', () => {
    for (const d of ORGAN_DISEASES) {
      expect(['confirmed', 'gloss']).toContain(d.source);
      expect(d.summary.length).toBeGreaterThan(0);
    }
    // 著者側の解説を確認できたのは 2 件だけ。ここが増えたら出典も添えて増やすこと。
    expect(ORGAN_DISEASES.filter((d) => d.source === 'confirmed').map((d) => d.id)).toEqual([
      'imprint',
      'model-dependence',
    ]);
  });
});

describe('diagnoseOrg — 2部署以上で重なったら仕組みの問題', () => {
  it('1部署だけなら systemic ではない', () => {
    const r = diagnoseOrg([{ department: '営業', diseases: ['imprint'] }]);
    expect(r.systemic).toEqual([]);
    expect(r.reportedDepartments).toBe(1);
  });

  it('★ 2部署で重なったら systemic', () => {
    const r = diagnoseOrg([
      { department: '営業', diseases: ['imprint'] },
      { department: '開発', diseases: ['imprint'] },
    ]);
    expect(r.systemic).toEqual(['imprint']);
    const t = r.tallies.find((x) => x.id === 'imprint');
    expect(t?.departments).toEqual(['営業', '開発']);
  });

  it('同じ部署が2回挙げても1部署として数える (境界)', () => {
    const r = diagnoseOrg([
      { department: '営業', diseases: ['imprint'] },
      { department: '営業', diseases: ['imprint'] },
    ]);
    expect(r.systemic).toEqual([]);
    expect(r.reportedDepartments).toBe(1);
  });

  it('未知の病 id と空の部署名は落ちる', () => {
    const r = diagnoseOrg([
      { department: '営業', diseases: ['nonexistent-disease'] },
      { department: '', diseases: ['imprint'] },
    ]);
    expect(r.reportedDepartments).toBe(1);
    expect(r.tallies.every((t) => t.departments.length === 0)).toBe(true);
  });

  it('申告ゼロでも5件の集計行が返る', () => {
    const r = diagnoseOrg([]);
    expect(r.tallies).toHaveLength(5);
    expect(r.reportedDepartments).toBe(0);
  });
});

describe('achievementGap — 達成確率100%キープの法則', () => {
  it('★ 30%の施策が10%しか出なければ、不足は90%', () => {
    expect(achievementGap([{ name: '既存顧客の掘り起こし', probability: 10 }]).shortfall).toBe(90);
  });

  it('★ 足りない分を足して100%に戻せば不足0', () => {
    const r = achievementGap([
      { name: '既存顧客の掘り起こし', probability: 10 },
      { name: '紹介キャンペーン', probability: 20 },
      { name: '広告の入れ替え', probability: 70 },
    ]);
    expect(r.total).toBe(100);
    expect(r.shortfall).toBe(0);
    expect(r.ok).toBe(true);
  });

  it('100%ちょうどが境界 (99.9 は不足、100 は充足)', () => {
    expect(achievementGap([{ name: 'a', probability: 99.9 }]).ok).toBe(false);
    expect(achievementGap([{ name: 'a', probability: 100 }]).ok).toBe(true);
  });

  it('超過は不足ではない', () => {
    const r = achievementGap([
      { name: 'a', probability: 80 },
      { name: 'b', probability: 60 },
    ]);
    expect(r.total).toBe(140);
    expect(r.shortfall).toBe(0);
  });

  it('★ 浮動小数の誤差が画面に出ない', () => {
    // 最初この標本を 33.33+33.33+33.34 で書いたが、**それは誤差を出さない**
    // (JS でちょうど 100 になる)。丸めを外す対照が鳴らず、標本の側が
    // 間違っていると分かった。実際に誤差の出る組を探して置き換えた:
    //   0.1 + 64.1 + 35.8 = 99.999999999999985789
    const r = achievementGap([
      { name: 'a', probability: 0.1 },
      { name: 'b', probability: 64.1 },
      { name: 'c', probability: 35.8 },
    ]);
    // 標本が本当に誤差を出すことを、同じ検査の中で確かめる。
    expect(0.1 + 64.1 + 35.8).not.toBe(100);
    // 丸めが効いていれば、画面には 100% と出る (99.99999999999999% は故障に見える)。
    expect(r.total).toBe(100);
    expect(r.ok).toBe(true);
  });

  it('不正な確率は数えず、counted で何件数えたかが分かる', () => {
    const r = achievementGap([
      { name: 'a', probability: 50 },
      { name: 'b', probability: Number.NaN },
      { name: 'c', probability: 120 },
      { name: 'd', probability: -1 },
    ]);
    expect(r.counted).toBe(1);
    expect(r.total).toBe(50);
  });

  it('施策ゼロなら不足100%', () => {
    expect(achievementGap([])).toEqual({ total: 0, shortfall: 100, ok: false, counted: 0 });
  });

  it('isValidProbability の境界', () => {
    expect(isValidProbability(0)).toBe(true);
    expect(isValidProbability(100)).toBe(true);
    expect(isValidProbability(-0.1)).toBe(false);
    expect(isValidProbability(100.1)).toBe(false);
    expect(isValidProbability(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidProbability('50')).toBe(false);
  });
});

describe('judgeLeaderFitness — 10ヶ条', () => {
  it('10項目あり、id が重複していない', () => {
    expect(LEADER_DISQUALIFIERS).toHaveLength(10);
    expect(new Set(LEADER_DISQUALIFIERS.map((d) => d.id)).size).toBe(10);
  });

  it('★ 能力に関する項目が1つも無い — 姿勢と誠実さだけ', () => {
    // 「スキル」「能力」「実績」「経験」が文面に出てこないこと。出たら
    // 10ヶ条の性格が変わっているので、出典に当たり直すこと。
    const capability = ['スキル', '能力', '実績', '経験', '知識'];
    for (const d of LEADER_DISQUALIFIERS) {
      for (const w of capability) expect(d.text).not.toContain(w);
    }
    // 上の not.toContain が空振りでないことを、同じ検査の中で確かめる。
    expect(capability.some((w) => 'このリーダーは能力が高い'.includes(w))).toBe(true);
  });

  it('該当ゼロなら登用できる', () => {
    const r = judgeLeaderFitness([]);
    expect(r.eligible).toBe(true);
    expect(r.hits).toEqual([]);
    expect(r.checked).toBe(10);
  });

  it('★ 1つでも該当したら不可 (閾値は置かない)', () => {
    const r = judgeLeaderFitness(['lies']);
    expect(r.eligible).toBe(false);
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]?.text).toBe('うそをついてごまかす');
  });

  it('未知の id は無視され、重複は1件に畳まれる', () => {
    const r = judgeLeaderFitness(['lies', 'lies', 'not-a-real-flag']);
    expect(r.hits).toHaveLength(1);
    expect(r.eligible).toBe(false);
  });

  it('hits は定義表の並び順で返る', () => {
    const r = judgeLeaderFitness(['flees-trouble', 'gives-up']);
    expect(r.hits.map((h) => h.id)).toEqual(['gives-up', 'flees-trouble']);
  });
});

describe('reviewLadder — 育成ロードマップ', () => {
  const member = (over: Partial<LadderMember> = {}): unknown => ({
    id: 'm1',
    name: '山田',
    step: 1,
    yearsInStep: 1,
    ...over,
  });

  it('4つの STEP がある', () => {
    expect(SKILL_STEPS.map((s) => s.step)).toEqual([1, 2, 3, 4]);
  });

  it('★ STEP1 に習得目安を超えて留まっていたら挙げる', () => {
    const r = reviewLadder([member({ yearsInStep: STEP1_MASTERY_YEARS + 1 })]);
    expect(r.stalled).toHaveLength(1);
  });

  it('習得目安ちょうどは滞留ではない (境界)', () => {
    expect(reviewLadder([member({ yearsInStep: STEP1_MASTERY_YEARS })]).stalled).toHaveLength(0);
  });

  it('STEP2 以降は年数が長くても滞留に数えない', () => {
    expect(reviewLadder([member({ step: 2, yearsInStep: 20 })]).stalled).toHaveLength(0);
  });

  it('STEP ごとの人数を数える', () => {
    const r = reviewLadder([member(), member({ id: 'm2', step: 3 })]);
    expect(r.byStep[1]).toBe(1);
    expect(r.byStep[3]).toBe(1);
    expect(r.byStep[4]).toBe(0);
  });

  it('不正なメンバーは落とす', () => {
    const r = reviewLadder([
      member({ step: 5 }),
      member({ id: 'BAD ID' }),
      member({ name: '' }),
      member({ yearsInStep: -1 }),
      null,
      'not an object',
    ]);
    expect(r.members).toHaveLength(0);
  });

  it('isValidLadderMember の境界', () => {
    expect(isValidLadderMember(member())).toBe(true);
    expect(isValidLadderMember(member({ step: 0 }))).toBe(false);
    expect(isValidLadderMember(member({ step: 4 }))).toBe(true);
    expect(isValidLadderMember(member({ step: 1.5 }))).toBe(false);
    expect(isValidLadderMember(member({ yearsInStep: 61 }))).toBe(false);
    expect(isValidLadderMember(member({ name: 'あ'.repeat(65) }))).toBe(false);
  });
});

describe('入力の正規化', () => {
  it('sanitizeReports は未知の病と長すぎる部署名を落とす', () => {
    const r = sanitizeReports([
      { department: '営業', diseases: ['imprint', 'bogus'] },
      { department: 'あ'.repeat(65), diseases: ['imprint'] },
      { department: '', diseases: [] },
      null,
    ]);
    expect(r).toEqual([{ department: '営業', diseases: ['imprint'] }]);
  });

  it('sanitizeInitiatives は不正な確率と空名を落とす', () => {
    const r = sanitizeInitiatives([
      { name: 'a', probability: 30 },
      { name: '', probability: 30 },
      { name: 'b', probability: 200 },
      'nope',
    ]);
    expect(r).toEqual([{ name: 'a', probability: 30 }]);
  });

  it('配列でなければ空を返す', () => {
    expect(sanitizeReports('nope')).toEqual([]);
    expect(sanitizeInitiatives(null)).toEqual([]);
  });
});

describe('状態の保存と読み込み', () => {
  const state: TalentState = {
    reports: [{ department: '営業', diseases: ['imprint'] }],
    initiatives: [{ name: 'a', probability: 40 }],
    members: [{ id: 'm1', name: '山田', step: 1, yearsInStep: 2 }],
    updatedAt: '2026-08-28',
  };

  it('保存したものが読み戻せる', async () => {
    let written = '';
    await saveTalentState(state, {
      statePath: () => '/tmp/talent.json',
      mkdir: async () => undefined,
      writeFile: async (_p, c) => {
        written = c;
      },
    });
    const back = await loadTalentState({
      statePath: () => '/tmp/talent.json',
      readFile: async () => written,
    });
    expect(back).toEqual(state);
  });

  it('★ 保存の前に正規化する — 壊れた入力でファイルを汚さない', async () => {
    let written = '';
    const saved = await saveTalentState(
      { ...state, initiatives: [{ name: 'bad', probability: 999 }] },
      {
        statePath: () => '/tmp/talent.json',
        mkdir: async () => undefined,
        writeFile: async (_p, c) => {
          written = c;
        },
      },
    );
    expect(saved.initiatives).toEqual([]);
    expect(written).not.toContain('999');
  });

  it('読めなければ空の状態を返す', async () => {
    const r = await loadTalentState({
      statePath: () => '/tmp/talent.json',
      readFile: async () => {
        throw new Error('ENOENT');
      },
    });
    expect(r.reports).toEqual([]);
    expect(r.updatedAt).toBe('');
  });

  it('JSON が object でなければ空の状態を返す', async () => {
    const r = await loadTalentState({
      statePath: () => '/tmp/talent.json',
      readFile: async () => '"just a string"',
    });
    expect(r.reports).toEqual([]);
  });
});

describe('スナップショット', () => {
  it('保存された状態から判定済みの値を組み立てる', async () => {
    const snap = await fetchTalentSnapshotImpl(CTX, {
      loadState: async () => ({
        reports: [
          { department: '営業', diseases: ['imprint'] },
          { department: '開発', diseases: ['imprint'] },
        ],
        initiatives: [{ name: 'a', probability: 40 }],
        members: [{ id: 'm1', name: '山田', step: 1, yearsInStep: 9 }],
        updatedAt: '2026-08-28',
      }),
    });
    expect(snap.diseases).toHaveLength(5);
    expect(snap.disqualifiers).toHaveLength(10);
    expect(snap.diagnosis.systemic).toEqual(['imprint']);
    expect(snap.achievement.shortfall).toBe(60);
    expect(snap.ladder.stalled).toHaveLength(1);
  });
});

describe('アクション', () => {
  it('save-state は payload を正規化して保存する', async () => {
    const saved = await saveTalentStateImpl(
      {
        token: '',
        payload: {
          reports: [{ department: '営業', diseases: ['imprint', 'bogus'] }],
          initiatives: [{ name: 'a', probability: 40 }],
          members: [{ id: 'm1', name: '山田', step: 2, yearsInStep: 1 }],
          updatedAt: '2026-08-28',
        },
      },
      { save: async (s) => s },
    );
    expect(saved.reports).toEqual([{ department: '営業', diseases: ['imprint'] }]);
  });

  it('judge-leader は判定結果と候補者名を返す', async () => {
    const r = await judgeLeaderImpl({
      token: '',
      payload: { flagged: ['lies', 123], candidate: '山田' },
    });
    expect(r.fitness.eligible).toBe(false);
    expect(r.candidate).toBe('山田');
  });

  it('judge-leader は flagged が配列でなくても落ちない', async () => {
    const r = await judgeLeaderImpl({ token: '', payload: { flagged: 'nope' } });
    expect(r.fitness.eligible).toBe(true);
    expect(r.candidate).toBe('');
  });

  it('★ 公開している口は save-state と judge-leader の 2 つだけ', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual(['judge-leader', 'save-state']);
  });
});
