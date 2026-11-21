import { describe, expect, it } from 'vitest';
import {
  addCheckIn,
  adviceTone,
  adviseMember,
  aiDeepDivePrompt,
  answerQuestion,
  buildMentorSnapshot,
  CHECKIN_INTERVAL_DAYS,
  emptyMentorSession,
  HIGH_LOAD_STREAK,
  isMentorQuestionKey,
  LOW_TRUST,
  MAX_MENTOR_ANSWER_CHARS,
  MAX_MENTOR_CHECKINS,
  MAX_MENTOR_NOTE_CHARS,
  MAX_MENTOR_RELATIONS,
  mediationPlan,
  memberKeyOf,
  MENTOR_QUESTIONS,
  nextPrompt,
  sanitizeMentorSession,
  setRelation,
  teamPairs,
  teamSignals,
  type MentorMember,
  type MentorSession,
} from '../mentor';

/**
 * 専属カウンセラーの判断 (2026-10-29 · パス 551)。
 *
 * 守る物を順に: 危機は先に・別の道へ / 本人の記録は本人の物 (同意の無い人は集計にも仲介にも
 * 出ない・仲介は本音を引用しない) / 推測で埋めない (読めない項目だけ落とし行は残す)。
 */
const A: MentorMember = { key: 'a@example.com', name: '青木', role: 'member' };
const B: MentorMember = { key: 'b@example.com', name: '坂本', role: 'admin' };
const OWNER: MentorMember = { key: 'o@example.com', name: '大島', role: 'owner' };
const ROSTER = [A, B, OWNER];
const TODAY = '2026-10-29';
const never = (): boolean => false;
const crisisIf = (needle: string) => (t: string): boolean => t.includes(needle);

function answered(member = A.key): MentorSession {
  let s = emptyMentorSession(member);
  for (const q of MENTOR_QUESTIONS) s = answerQuestion(s, q.key, `${q.key} の答え`);
  return s;
}

describe('聞き取り (intake)', () => {
  it('問いは 6 つで、順に 1 つずつ聞く —— 答えると次の問いへ進む', () => {
    let s = emptyMentorSession('A@Example.com');
    expect(s.member).toBe('a@example.com');
    for (const q of MENTOR_QUESTIONS) {
      const p = nextPrompt(s, TODAY, ROSTER);
      expect(p.kind).toBe('intake');
      expect(p.questionKey).toBe(q.key);
      expect(p.text).toBe(q.prompt);
      expect(p.examples).toEqual(q.examples);
      s = answerQuestion(s, q.key, '答え');
    }
    expect(nextPrompt(s, TODAY, ROSTER).kind).toBe('checkin');
  });

  it('空の答えと長すぎる答えは理由の文で断る (天井は文字で数える)', () => {
    const s = emptyMentorSession(A.key);
    expect(() => answerQuestion(s, 'style', '   ')).toThrow(new Error('答えを入力してください'));
    expect(answerQuestion(s, 'style', '😀'.repeat(MAX_MENTOR_ANSWER_CHARS)).answers.style).toBe('😀'.repeat(MAX_MENTOR_ANSWER_CHARS));
    expect(() => answerQuestion(s, 'style', '😀'.repeat(MAX_MENTOR_ANSWER_CHARS + 1))).toThrow(
      new Error(`答えは ${MAX_MENTOR_ANSWER_CHARS} 文字までにしてください (今 ${MAX_MENTOR_ANSWER_CHARS + 1} 文字)`),
    );
  });

  it('isMentorQuestionKey は台帳の 6 つだけを通す', () => {
    for (const q of MENTOR_QUESTIONS) expect(isMentorQuestionKey(q.key)).toBe(true);
    expect(isMentorQuestionKey('constructor')).toBe(false);
    expect(isMentorQuestionKey(42)).toBe(false);
  });
});

describe('チェックインと関係 (入口)', () => {
  it('同じ日の 2 回目は上書きで、日付順に並ぶ', () => {
    let s = answered();
    s = addCheckIn(s, { on: '2026-10-20', mood: 4, workload: 2, note: 'a' });
    s = addCheckIn(s, { on: '2026-10-10', mood: 3, workload: 3, note: 'b' });
    s = addCheckIn(s, { on: '2026-10-20', mood: 1, workload: 5, note: 'c' });
    expect(s.checkins.map((c) => `${c.on}:${c.mood}:${c.note}`)).toEqual(['2026-10-10:3:b', '2026-10-20:1:c']);
  });

  it('日付・気分・負荷・メモの天井を理由の文で断る', () => {
    const s = answered();
    expect(() => addCheckIn(s, { on: '2026-02-31', mood: 3, workload: 3, note: '' })).toThrow(new Error('日付は YYYY-MM-DD 形式で入力してください'));
    expect(() => addCheckIn(s, { on: TODAY, mood: 0, workload: 3, note: '' })).toThrow(new Error('気分は 1〜5 で選んでください'));
    expect(() => addCheckIn(s, { on: TODAY, mood: 3, workload: '3', note: '' })).toThrow(new Error('負荷は 1〜5 で選んでください'));
    expect(() => addCheckIn(s, { on: TODAY, mood: 3, workload: 3, note: 'x'.repeat(MAX_MENTOR_NOTE_CHARS + 1) })).toThrow(
      new Error(`メモは ${MAX_MENTOR_NOTE_CHARS} 文字までにしてください (今 ${MAX_MENTOR_NOTE_CHARS + 1} 文字)`),
    );
    // 4.6 は 5 に丸める (選択肢の外の小数は打ち間違いではなく丸め)
    expect(addCheckIn(s, { on: TODAY, mood: 4.6, workload: 1.2, note: '' }).checkins[0]).toEqual({ on: TODAY, mood: 5, workload: 1, note: '' });
  });

  it('チェックインは MAX_MENTOR_CHECKINS 件で古い物から落ちる', () => {
    let s = answered();
    for (let i = 0; i < MAX_MENTOR_CHECKINS + 3; i += 1) {
      const d = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
      s = addCheckIn(s, { on: d, mood: 3, workload: 3, note: String(i) });
    }
    expect(s.checkins.length).toBe(MAX_MENTOR_CHECKINS);
    expect(s.checkins[0]!.note).toBe('3');
  });

  it('関係は相手ごとに 1 件 (上書き)・自分自身は断る・上限あり', () => {
    let s = answered();
    s = setRelation(s, { with: 'B@Example.com', trust: 2, note: '頼みにくい' });
    s = setRelation(s, { with: 'b@example.com', trust: 4, note: '話せた' });
    expect(s.relations).toEqual([{ with: 'b@example.com', trust: 4, note: '話せた' }]);
    expect(() => setRelation(s, { with: A.key, trust: 3, note: '' })).toThrow(new Error('自分自身との関係は記録できません'));
    expect(() => setRelation(s, { with: '', trust: 3, note: '' })).toThrow(new Error('相手を選んでください'));
    expect(() => setRelation(s, { with: 'c@x', trust: 9, note: '' })).toThrow(new Error('信頼度は 1〜5 で選んでください'));
    for (let i = 0; i < MAX_MENTOR_RELATIONS - 1; i += 1) s = setRelation(s, { with: `p${i}@x`, trust: 3, note: '' });
    expect(s.relations.length).toBe(MAX_MENTOR_RELATIONS);
    expect(() => setRelation(s, { with: 'one-more@x', trust: 3, note: '' })).toThrow(new Error(`関係は ${MAX_MENTOR_RELATIONS} 人までです`));
    // 既に在る相手の上書きは上限に当たらない
    expect(setRelation(s, { with: 'p0@x', trust: 1, note: 'again' }).relations.length).toBe(MAX_MENTOR_RELATIONS);
  });
});

describe('先回り (nextPrompt)', () => {
  it('聞き取りが済んだら、空いたチェックインを先に聞く (間隔ちょうどは聞かない)', () => {
    let s = answered();
    expect(nextPrompt(s, TODAY, ROSTER)).toMatchObject({ kind: 'checkin', questionKey: null, withMember: null });
    expect(nextPrompt(s, TODAY, ROSTER).text).toContain('聞き取りありがとうございます');
    s = addCheckIn(s, { on: '2026-10-22', mood: 4, workload: 2, note: '' });
    expect(nextPrompt(s, TODAY, ROSTER).kind).toBe('growth'); // 7 日 = 間隔ちょうど → まだ聞かない
    expect(nextPrompt(s, '2026-10-30', ROSTER)).toMatchObject({ kind: 'checkin' });
    expect(nextPrompt(s, '2026-10-30', ROSTER).text).toContain(`前回から ${CHECKIN_INTERVAL_DAYS + 1} 日経ちました`);
  });

  it('信頼度の低い相手が居れば、その人との続きを名前で聞く', () => {
    let s = addCheckIn(answered(), { on: TODAY, mood: 4, workload: 2, note: '' });
    s = setRelation(s, { with: B.key, trust: LOW_TRUST, note: 'x' });
    const p = nextPrompt(s, TODAY, ROSTER);
    expect(p).toMatchObject({ kind: 'relation', withMember: B.key });
    expect(p.text).toContain('坂本 さんとの関係');
    // 名簿に居ない相手は鍵のまま (推測で埋めない)
    const q = nextPrompt(s, TODAY, [A]);
    expect(q.text).toContain(`${B.key} さんとの関係`);
    // 信頼度が上がれば成長の問いへ
    const ok = setRelation(s, { with: B.key, trust: LOW_TRUST + 1, note: '' });
    expect(nextPrompt(ok, TODAY, ROSTER)).toMatchObject({ kind: 'growth', questionKey: 'growth' });
    expect(nextPrompt(ok, TODAY, ROSTER).text).toContain('「growth の答え」に向けて');
  });
});

describe('助言 (adviseMember)', () => {
  it('★ 危機が記録のどこかに在れば、それ 1 件だけを返す (仕事の助言は出さない)', () => {
    let s = addCheckIn(answered(), { on: '2026-10-28', mood: 1, workload: 5, note: 'つらい' });
    s = addCheckIn(s, { on: TODAY, mood: 1, workload: 5, note: 'もう限界' });
    const plain = adviseMember(s, A, TODAY, never);
    expect(plain.map((a) => a.severity)).toEqual(['warn', 'warn']);
    const held = adviseMember(s, A, TODAY, crisisIf('限界'));
    expect(held.length).toBe(1);
    expect(held[0]!.severity).toBe('crisis');
    expect(held[0]!.body).toContain('端末の外へは出ていません');
    // 聞き取りの答えに在っても同じ
    expect(adviseMember(answered(), A, TODAY, crisisIf('style の答え'))[0]!.severity).toBe('crisis');
  });

  it('負荷 4 以上が HIGH_LOAD_STREAK 回続いたら警告し、役割で頼む先が変わる', () => {
    let s = answered();
    s = addCheckIn(s, { on: '2026-10-28', mood: 3, workload: 4, note: '' });
    expect(adviseMember(s, A, TODAY, never).some((a) => a.title.includes('負荷'))).toBe(false);
    s = addCheckIn(s, { on: TODAY, mood: 3, workload: 5, note: '' });
    const member = adviseMember(s, A, TODAY, never).find((a) => a.title === '負荷の高い状態が続いています')!;
    expect(member.severity).toBe('warn');
    expect(member.body).toContain('オーナーか管理者に');
    expect(member.basis).toBe(`直近 ${HIGH_LOAD_STREAK} 回のチェックインの負荷`);
    const owner = adviseMember({ ...s, member: OWNER.key }, OWNER, TODAY, never).find((a) => a.title === '負荷の高い状態が続いています')!;
    expect(owner.body).toContain('誰かに渡せる仕事を 1 つ決めて');
  });

  it('口調は聞き取りの「伝え方」で変わる (率直 / やわらかく / 選択肢)', () => {
    const base = addCheckIn(addCheckIn(answered(), { on: '2026-10-28', mood: 3, workload: 4, note: '' }), { on: TODAY, mood: 3, workload: 4, note: '' });
    const direct = answerQuestion(base, 'style', '率直に結論から');
    const gentle = answerQuestion(base, 'style', 'やわらかく理由から');
    const options = answerQuestion(base, 'style', '選択肢を並べてほしい');
    expect(adviceTone(direct)).toBe('direct');
    expect(adviceTone(gentle)).toBe('gentle');
    expect(adviceTone(options)).toBe('options');
    expect(adviceTone(emptyMentorSession(A.key))).toBe('gentle');
    const body = (s: MentorSession): string => adviseMember(s, A, TODAY, never)[0]!.body;
    expect(body(direct)).toMatch(/^直近 2 回とも負荷 4 以上です。/);
    expect(body(gentle)).toMatch(/^ここ 2 回、負荷が高いままですね。/);
    expect(body(options)).toContain('(a)');
    expect(body(options)).toContain('(b) 期限を 1 つ後ろへ');
  });

  it('気分が 2 以下・空白が 2 週間超・低い信頼度は、それぞれ別の助言になる', () => {
    let s = addCheckIn(answered(), { on: '2026-10-01', mood: 2, workload: 1, note: '' });
    s = setRelation(s, { with: B.key, trust: 1, note: '話しづらい' });
    const titles = adviseMember(s, A, TODAY, never).map((a) => a.title);
    expect(titles).toEqual(['気分が下がっています', 'しばらくチェックインがありません', `${B.key} さんとの関係を整える`]);
    const rel = adviseMember(s, A, TODAY, never)[2]!;
    expect(rel.body).toContain('信頼度が 1 と低めですね');
    expect(rel.body).toContain('短い雑談から入り');
    // フィードバックの好みで手が変わる
    const byText = answerQuestion(s, 'feedback', '文章で後から読みたい');
    expect(adviseMember(byText, A, TODAY, never)[2]!.body).toContain('文章で一度気持ちを整理');
    const by1on1 = answerQuestion(s, 'feedback', '1on1 でまとめて');
    expect(adviseMember(by1on1, A, TODAY, never)[2]!.body).toContain('1on1 の場で');
  });

  it('困り事が無ければ、強みと半年後から一歩を 1 件だけ出す (聞き取り前は 0 件)', () => {
    expect(adviseMember(emptyMentorSession(A.key), A, TODAY, never)).toEqual([]);
    const s = addCheckIn(answered(), { on: TODAY, mood: 4, workload: 2, note: '' });
    const out = adviseMember(s, A, TODAY, never);
    expect(out.length).toBe(1);
    expect(out[0]).toMatchObject({ severity: 'info', title: '強みを活かす一歩', basis: '聞き取りの「強み」と「半年後」' });
    expect(out[0]!.body).toContain('「strength の答え」が強みで');
  });
});

describe('チーム (同意した集計だけ)', () => {
  function pairSessions(aTrust: number, bTrust: number | null, aShare = true, bShare = true): MentorSession[] {
    let a = setRelation(answered(A.key), { with: B.key, trust: aTrust, note: 'A の本音' });
    a = { ...a, shareWithTeam: aShare };
    let b: MentorSession = { ...answered(B.key), shareWithTeam: bShare };
    if (bTrust !== null) b = setRelation(b, { with: A.key, trust: bTrust, note: 'B の本音' });
    return [a, b];
  }

  it('★ 同意の無い人は集計に出ない・名簿に無い人も出ない', () => {
    const a = addCheckIn(addCheckIn({ ...answered(A.key), shareWithTeam: true }, { on: '2026-10-28', mood: 2, workload: 5, note: '' }), { on: TODAY, mood: 2, workload: 5, note: '' });
    const b = addCheckIn({ ...answered(B.key), shareWithTeam: false }, { on: TODAY, mood: 1, workload: 5, note: '' });
    const ghost = { ...answered('ghost@x'), shareWithTeam: true };
    const sig = teamSignals([a, b, ghost], ROSTER, TODAY);
    expect(sig).toEqual([{ member: A.key, name: '青木', highLoad: true, lowMood: true, silent: false }]);
    expect(teamSignals([{ ...answered(OWNER.key), shareWithTeam: true }], ROSTER, TODAY)).toEqual([
      { member: OWNER.key, name: '大島', highLoad: false, lowMood: false, silent: true },
    ]);
  });

  it('★ 組は両方の同意が在るときだけ出る (片方の評価だけでは出さない)・相互と片側を見分ける', () => {
    expect(teamPairs(pairSessions(1, 1, true, false), ROSTER)).toEqual([]);
    expect(teamPairs(pairSessions(1, 1, false, true), ROSTER)).toEqual([]);
    expect(teamPairs(pairSessions(LOW_TRUST + 1, 1), ROSTER).map((p) => p.kind)).toEqual(['one-sided']); // B 側だけ低い
    const mutual = teamPairs(pairSessions(1, 2), ROSTER);
    expect(mutual).toEqual([{ a: A.key, b: B.key, aName: '青木', bName: '坂本', kind: 'mutual', consented: true }]);
    expect(teamPairs(pairSessions(1, null), ROSTER).map((p) => p.kind)).toEqual(['one-sided']);
    // 同じ組は 1 度だけ。相互の組は保管層の並びに依らず鍵の順 (b を先に並べても a が先)
    expect(teamPairs(pairSessions(1, 1), ROSTER).length).toBe(1);
    expect(teamPairs([...pairSessions(1, 1)].reverse(), ROSTER)[0]).toMatchObject({ a: A.key, b: B.key, kind: 'mutual' });
    // 片側の組は、距離を感じている側が a (坂本だけが低い → a は坂本)
    expect(teamPairs([...pairSessions(LOW_TRUST + 1, 1)].reverse(), ROSTER)[0]).toMatchObject({ a: B.key, b: A.key, kind: 'one-sided' });
  });

  it('★ 仲介の計画は本音を 1 字も引用しない。同意が揃わなければ組まず理由を返す', () => {
    const [pair] = teamPairs(pairSessions(1, 1), ROSTER);
    const plan = mediationPlan(pair!);
    expect(plan.holdReason).toBeNull();
    expect(plan.steps!.map((s) => s.step)).toEqual([1, 2, 3, 4]);
    const text = plan.steps!.map((s) => s.text).join('\n');
    expect(text).toContain('青木 さんと 坂本 さんに別々に 10 分ずつ');
    expect(text).not.toContain('本音');
    expect(text).not.toContain('A の'); // 標本の本音 'A の本音' は入らない
    const oneSided = mediationPlan({ ...pair!, kind: 'one-sided' });
    expect(oneSided.steps![0]!.text).toContain('坂本 さんには「最近どう」とだけ聞く');
    const held = mediationPlan({ ...pair!, consented: false });
    expect(held.steps).toBeNull();
    expect(held.holdReason).toContain('両方の同意が揃っていない');
  });
});

describe('読み (sanitizeMentorSession) —— 読めない項目だけ落とし、行は残す', () => {
  it('member が無い物は行ごと null。それ以外は項目ごと', () => {
    expect(sanitizeMentorSession(null)).toBeNull();
    expect(sanitizeMentorSession({ answers: {} })).toBeNull();
    expect(sanitizeMentorSession({ member: '  ' })).toBeNull();
    const s = sanitizeMentorSession({
      member: ' A@Example.com ',
      answers: { style: ' 率直 ', bogus: 'x', motivation: 42, stress: 'y'.repeat(MAX_MENTOR_ANSWER_CHARS + 1), feedback: '' },
      checkins: [
        { on: '2026-10-01', mood: 3, workload: 3, note: 'ok' },
        { on: '2026-02-31', mood: 3, workload: 3, note: 'bad date' },
        { on: '2026-10-02', mood: 7, workload: 3, note: 'bad mood' },
        { on: '2026-10-03', mood: 3, workload: 3, note: 42 },
        null,
      ],
      relations: [
        { with: 'B@Example.com', trust: 2, note: 'x' },
        { with: 'b@example.com', trust: 5, note: 'dup' },
        { with: '', trust: 3, note: '' },
        { with: 'c@x', trust: 3 },
      ],
      shareWithTeam: 'yes',
    })!;
    expect(s).toEqual({
      member: 'a@example.com',
      answers: { style: '率直' },
      checkins: [{ on: '2026-10-01', mood: 3, workload: 3, note: 'ok' }],
      relations: [{ with: 'b@example.com', trust: 2, note: 'x' }],
      shareWithTeam: false,
    });
  });

  it('入口を通った記録は 1 字も変わらない (往復)', () => {
    let s = answered();
    s = addCheckIn(s, { on: TODAY, mood: 4, workload: 2, note: 'メモ' });
    s = setRelation(s, { with: B.key, trust: 3, note: '' });
    s = { ...s, shareWithTeam: true };
    expect(sanitizeMentorSession(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('チェックインと関係の上限は読むときにも掛かる (古い物から落とす / 相手は先勝ち)', () => {
    const checkins = Array.from({ length: MAX_MENTOR_CHECKINS + 5 }, (_, i) => ({ on: '2026-10-01', mood: 3, workload: 3, note: String(i) }));
    const relations = Array.from({ length: MAX_MENTOR_RELATIONS + 5 }, (_, i) => ({ with: `p${i}@x`, trust: 3, note: '' }));
    const s = sanitizeMentorSession({ member: 'a', checkins, relations })!;
    expect(s.checkins.length).toBe(MAX_MENTOR_CHECKINS);
    expect(s.checkins[0]!.note).toBe('5');
    expect(s.relations.length).toBe(MAX_MENTOR_RELATIONS);
    expect(s.relations[0]!.with).toBe('p0@x');
  });
});

describe('AI へ渡す文 (本人の記録だけ)', () => {
  it('聞き取り・直近 3 回・相談文だけが入り、関係の本音と他人は入らない', () => {
    let s = answered();
    for (let i = 1; i <= 4; i += 1) s = addCheckIn(s, { on: `2026-10-0${i}`, mood: 3, workload: i, note: `メモ${i}` });
    s = setRelation(s, { with: B.key, trust: 1, note: '坂本さんが怖い' });
    const p = aiDeepDivePrompt(s, A, '  後輩への伝え方  ');
    expect(p).toContain('相手の役割は「member」');
    expect(p).toContain('→ style の答え');
    expect(p).toContain('2026-10-02: 気分 3/5・負荷 2/5 メモ2');
    expect(p).not.toContain('メモ1'); // 直近 3 回だけ
    expect(p).not.toContain('坂本');
    expect(p).not.toContain('怖い');
    expect(p).toContain('本人の相談: 後輩への伝え方');
    expect(p).toContain('医療・法的な判断はせず');
    const empty = aiDeepDivePrompt(emptyMentorSession(A.key), A, 'q');
    expect(empty).toContain('聞き取り: まだ無し');
    expect(empty).toContain('チェックイン: まだ無し');
  });
});

describe('見本', () => {
  it('buildMentorSnapshot は問いの台帳と間隔だけを持つ (人の記録は無い)', () => {
    expect(buildMentorSnapshot()).toEqual({ questions: MENTOR_QUESTIONS, checkinIntervalDays: CHECKIN_INTERVAL_DAYS });
    expect(memberKeyOf(' X@Y ')).toBe('x@y');
  });
});
