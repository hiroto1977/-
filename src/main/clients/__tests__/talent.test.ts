import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  LEADER_DISQUALIFIERS,
  LEADER_DISQUALIFIERS_SOURCE,
  SKILL_STEPS_SOURCE,
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
  sanitizeTalentState,
  MAX_DEPT_REPORTS,
  MAX_INITIATIVES,
  MAX_LADDER_MEMBERS,
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

  it('★ 出典の強さを全項が持つ — 精度の違う物を同じ札で配らない', () => {
    for (const d of ORGAN_DISEASES) {
      expect(['confirmed', 'secondary', 'gloss']).toContain(d.source);
      expect(d.summary.length).toBeGreaterThan(0);
    }
    // 著者側で確認できたのは 3 件、第三者の解説で確認できたのが 2 件。
    // (数字万能病は 2 度目の訂正で著者の連載記事に当たれたので confirmed へ移した。)
    // ここを動かすときは出典も一緒に足すこと (docs 側の一覧と対応している)。
    expect(ORGAN_DISEASES.filter((d) => d.source === 'confirmed').map((d) => d.id)).toEqual([
      'imprint',
      'model-dependence',
      'number-worship',
    ]);
    expect(ORGAN_DISEASES.filter((d) => d.source === 'secondary').map((d) => d.id)).toEqual([
      'shrinking',
      'format-trust',
    ]);
  });

  it('★ どの表も出典の強さを示している — 無印を残さない', () => {
    // 病だけが札を持ち、10ヶ条と STEP は無印だった。どちらも出典はあるのに
    // 「在ることを示していない」状態で、無印を弱いと読むか強いと読むかが割れる。
    expect(LEADER_DISQUALIFIERS_SOURCE).toBe('confirmed');
    expect(SKILL_STEPS_SOURCE).toBe('confirmed');
    // 札の語彙は病と共通であること (別の段を勝手に作らない)。
    for (const v of [LEADER_DISQUALIFIERS_SOURCE, SKILL_STEPS_SOURCE]) {
      expect(['confirmed', 'secondary', 'gloss']).toContain(v);
    }
  });

  it('★ 読み解きのままの項が残っていない', () => {
    // 2026-08-28 に 03〜05 を当たり直して 0 件にした。増えたら、それは
    // 「名称から推測した語釈」が新しく入ったということ。
    expect(ORGAN_DISEASES.filter((d) => d.source === 'gloss')).toEqual([]);
  });

  it('★ 当たり直した 3 件が、旧い読み解きのままでないこと', () => {
    // 旧語釈は名称の字面からの推測で、3 つとも意味を外していた。
    // 実際の定義に含まれる語で留める (綴りが戻ったら鳴る)。
    const by = (id: string): string => ORGAN_DISEASES.find((d) => d.id === id)?.summary ?? '';
    expect(by('shrinking')).toContain('外部要因');
    // 「万能ではない」だけでは足りない —— 1 度目の訂正はここで止まっていて、
    // 7 割 / 3 割という肝心の構造が抜けていた。構造のほうを留める。
    expect(by('number-worship')).toContain('7割');
    expect(by('number-worship')).toContain('3割');
    expect(by('format-trust')).toContain('勝ちパターン');
    // 旧語釈の綴りが残っていないこと。
    expect(by('format-trust')).not.toContain('埋めること自体が目的化');
    // 上の not.toContain が空振りでないことを、同じ検査の中で確かめる。
    expect('フォーマットを埋めること自体が目的化する').toContain('埋めること自体が目的化');
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

  it('★ 習得目安ちょうどは滞留ではない — 「以上」ではなく「超過」', () => {
    // ここを「以上」と読み違えると、5 年ちょうどの人まで挙がる。
    // 手引き側の文面が実際に一度「5 年以上」になっていて食い違っていた。
    expect(reviewLadder([member({ yearsInStep: STEP1_MASTERY_YEARS })]).stalled).toHaveLength(0);
    // 1 つ超えたら挙がること (境界の両側を押さえる)。
    expect(reviewLadder([member({ yearsInStep: STEP1_MASTERY_YEARS + 1 })]).stalled).toHaveLength(1);
    // 目安の内側も挙がらないこと。
    expect(reviewLadder([member({ yearsInStep: STEP1_MASTERY_YEARS - 1 })]).stalled).toHaveLength(0);
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

describe('入力 → 保存 → 判定 の一巡', () => {
  it('★ 保存した申告が snapshot から編集できる形で返る', async () => {
    // 画面は `diagnosis.tallies` (病→部署の集計) を編集し直せない。
    // 元の `reports` が返らないと、入力 UI は保存値を復元できず、
    // 開くたびに空から入れ直すことになる。
    const state: TalentState = {
      reports: [
        { department: '営業', diseases: ['imprint'] },
        // 病を 1 つも挙げていない部署。集計から復元すると**消える**ので、
        // 生の reports が要ることの標本にもなっている。
        { department: '管理', diseases: [] },
      ],
      initiatives: [{ name: 'a', probability: 40 }],
      members: [{ id: 'm1', name: '山田', step: 1, yearsInStep: 9 }],
      updatedAt: '2026-08-28',
    };
    const snap = await fetchTalentSnapshotImpl(CTX, { loadState: async () => state });
    expect(snap.reports).toEqual(state.reports);
    // 集計側には「管理」が現れない (病を挙げていないため) ことも確かめる。
    expect(snap.diagnosis.tallies.flatMap((t) => t.departments)).not.toContain('管理');
    // それでも申告部署としては数えられている。
    expect(snap.diagnosis.reportedDepartments).toBe(2);
  });

  it('★ 画面から保存 → 判定し直した値が返る (口が繋がっている)', async () => {
    let stored: TalentState | null = null;
    await saveTalentStateImpl(
      {
        token: '',
        payload: {
          reports: [
            { department: '営業', diseases: ['imprint'] },
            { department: '開発', diseases: ['imprint'] },
          ],
          initiatives: [{ name: '広告の入れ替え', probability: 40 }],
          members: [{ id: 'm1', name: '山田', step: 1, yearsInStep: 9 }],
          updatedAt: '2026-08-28',
        },
      },
      {
        save: async (st) => {
          stored = st;
          return st;
        },
      },
    );
    expect(stored).not.toBeNull();
    const snap = await fetchTalentSnapshotImpl(CTX, {
      loadState: async () => stored as unknown as TalentState,
    });
    // 保存した値から判定が出ていること。
    expect(snap.diagnosis.systemic).toEqual(['imprint']);
    expect(snap.achievement.shortfall).toBe(60);
    expect(snap.ladder.stalled).toHaveLength(1);
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


/**
 * **IPC 境界での件数上限。**
 *
 * 文字列長だけ切って件数を野放しにすると、`talent.save-state` は
 * 無制限の書き込み口になる —— 乗っ取られた renderer が巨大な配列を渡せば
 * `saveTalentState` が丸ごとディスクへ書く (2026-08-28 のレビューで検出)。
 */
describe('件数の上限 — 無制限の書き込み口にしない', () => {
  it('★ 部署の申告は MAX_DEPT_REPORTS で切る', () => {
    const many = Array.from({ length: MAX_DEPT_REPORTS + 50 }, (_, i) => ({
      department: `d${i}`,
      diseases: ['imprint'],
    }));
    expect(sanitizeReports(many)).toHaveLength(MAX_DEPT_REPORTS);
  });

  it('★ 施策は MAX_INITIATIVES で切る', () => {
    const many = Array.from({ length: MAX_INITIATIVES + 50 }, (_, i) => ({
      name: `p${i}`,
      probability: 1,
    }));
    expect(sanitizeInitiatives(many)).toHaveLength(MAX_INITIATIVES);
  });

  it('★ メンバーは MAX_LADDER_MEMBERS で切る', () => {
    const many = Array.from({ length: MAX_LADDER_MEMBERS + 50 }, (_, i) => ({
      id: `m${i}`,
      name: `n${i}`,
      step: 1,
      yearsInStep: 0,
    }));
    expect(sanitizeTalentState({ members: many }).members).toHaveLength(MAX_LADDER_MEMBERS);
  });

  it('上限以内はそのまま通る (締めすぎていないこと)', () => {
    const ok = Array.from({ length: 10 }, (_, i) => ({ department: `d${i}`, diseases: [] }));
    expect(sanitizeReports(ok)).toHaveLength(10);
  });

  it('★ 保存の口を通しても上限が効く (action → sanitize → 書き込み)', async () => {
    let written: unknown = null;
    await saveTalentStateImpl(
      {
        payload: {
          reports: Array.from({ length: MAX_DEPT_REPORTS + 10 }, (_, i) => ({
            department: `d${i}`,
            diseases: [],
          })),
        },
      } as unknown as Parameters<typeof saveTalentStateImpl>[0],
      {
        save: async (state) => {
          written = state;
          return state;
        },
      },
    );
    expect((written as { reports: unknown[] }).reports).toHaveLength(MAX_DEPT_REPORTS);
  });
});


/**
 * **IPC 境界の上限と許可リスト。**
 *
 * 2026-08-29、`src/shared/talent.ts` を変異検査の対象へ入れて実測したところ
 * 65.83%。生存 121 件の大半は定義表の「覆われた static 変異体」で、手で
 * 当てると実際は殺されていた (帰属ずれ) —— **が、3 件は本物だった**。
 * どれも payload が乗っ取られた renderer から来る経路で、外しても
 * 11,277 件の検査が 1 つも落ちなかった。
 */
describe('境界の上限と許可リスト — 外しても誰も気付かなかった 3 件', () => {
  /*
   * `sanitizeReports` の許可リストは**元から守られていた**。
   *
   * 最初「無防備だ」と報告しかけたが、そのとき潰したのは同じ綴りを持つ
   * **別の行** (`diagnoseOrg` の中の読み飛ばし) だった —— 置換が先頭一致で
   * 当たっていた。**鳴らない対照は、まず対照自身を疑う。**
   * 疑って正解で、無防備だったのは下の `diagnoseOrg` のほうである。
   * この検査は元から在った守りを、行を名指しして留め直すもの。
   */
  it('未知の病 id は落とす (sanitizeReports の許可リスト)', () => {
    const got = sanitizeReports([
      { department: '営業', diseases: ['imprint', 'not-a-real-disease', '<script>'] },
    ]);
    expect(got).toHaveLength(1);
    expect(got[0]?.diseases).toEqual(['imprint']);
  });

  it('未知の id しか無ければ、その部署は病 0 件になる (部署自体は残る)', () => {
    const got = sanitizeReports([{ department: '開発', diseases: ['nope'] }]);
    expect(got).toHaveLength(1);
    expect(got[0]?.diseases).toEqual([]);
  });

  /*
   * **`diagnoseOrg` は生の入力でも未知の id を出さない。**
   *
   * かつてここには `if (!DISEASE_IDS.has(d)) continue;` という 2 つ目の
   * 守りが在ったが、変異検査で**外しても何も変わらない**ことが分かり、
   * 消した (2026-08-29)。理由は構造にある —— `tallies` は
   * `ORGAN_DISEASES` を回して作るので、知らない id は `byDisease` に
   * 入っても二度と読まれない。
   *
   * つまり許可リストは**構造そのもの**である。この検査はその構造を留める:
   * `tallies` を `byDisease` 由来に変えると 3 件落ちる (対照で確認済み)。
   */
  it('★ diagnoseOrg は生の入力でも未知の病 id を出さない (許可リストは構造)', () => {
    const d = diagnoseOrg([
      { department: '営業', diseases: ['imprint', 'bogus'] },
      { department: '開発', diseases: ['imprint', 'bogus'] },
    ]);
    // 未知の id は集計に現れない
    expect(d.tallies.map((t) => t.id)).not.toContain('bogus');
    // 知っている id はちゃんと 2 部署で数えられている
    const imprint = d.tallies.find((t) => t.id === 'imprint');
    expect(imprint?.departments).toEqual(['営業', '開発']);
    expect(d.systemic).toEqual(['imprint']);
  });

  /*
   * 施策名の上限。他の欄 (部署名 64 / 氏名 64) は留めてあったのに、
   * ここだけ抜けていた —— **同じ形の欄が並んでいると、1 つ抜けても目で
   * 気付かない**。
   */
  it('★ 施策名は 128 文字を超えたら落とす', () => {
    expect(sanitizeInitiatives([{ name: 'あ'.repeat(128), probability: 10 }])).toHaveLength(1);
    expect(sanitizeInitiatives([{ name: 'あ'.repeat(129), probability: 10 }])).toHaveLength(0);
  });

  /*
   * `updatedAt` は画面が作る日付文字列だが、payload なので長さを信じない。
   * 切っていることを誰も見ていなかった。
   */
  it('★ updatedAt は 32 文字で切る', () => {
    const long = 'x'.repeat(100);
    expect(sanitizeTalentState({ updatedAt: long }).updatedAt).toHaveLength(32);
    expect(sanitizeTalentState({ updatedAt: '2026-08-29' }).updatedAt).toBe('2026-08-29');
  });

  it('updatedAt が文字列でなければ空にする', () => {
    expect(sanitizeTalentState({ updatedAt: 12345 }).updatedAt).toBe('');
    expect(sanitizeTalentState({}).updatedAt).toBe('');
  });
});


/**
 * **メンバー id の形。**
 *
 * `MEMBER_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/` の 2 つの制約
 * (先頭は英数字・全体で 64 文字まで) は、変異検査で**どちらも外しても
 * 誰も気付かなかった** (2026-08-29 実測)。
 *
 * id は保存され、画面が key に使う。先頭の `-` を許すと見た目が壊れ、
 * 長さを許すと payload の上限が 1 つ抜ける。
 */
describe('メンバー id の形 — 外しても誰も気付かなかった 2 件', () => {
  const member = (id: string) => ({ id, name: '山田', step: 1, yearsInStep: 0 });

  it('★ 先頭は英数字でなければならない', () => {
    expect(isValidLadderMember(member('m1'))).toBe(true);
    expect(isValidLadderMember(member('1m'))).toBe(true);
    expect(isValidLadderMember(member('-m1')), '先頭のハイフンは許さない').toBe(false);
  });

  it('★ 全体で 64 文字まで', () => {
    expect(isValidLadderMember(member('a'.repeat(64))), '64 は通す').toBe(true);
    expect(isValidLadderMember(member('a'.repeat(65))), '65 は落とす').toBe(false);
  });

  it('使える字は小文字英数字とハイフンだけ', () => {
    expect(isValidLadderMember(member('m-1'))).toBe(true);
    expect(isValidLadderMember(member('M1')), '大文字は落とす').toBe(false);
    expect(isValidLadderMember(member('m_1')), 'アンダースコアは落とす').toBe(false);
    expect(isValidLadderMember(member('')), '空文字は落とす').toBe(false);
  });
});
