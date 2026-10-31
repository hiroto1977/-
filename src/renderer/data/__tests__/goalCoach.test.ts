import { describe, expect, it } from 'vitest';
import {
  COACH_ENTRY_MARKERS,
  LATE_GAP_PCT,
  MAX_ANSWER_CHARS,
  MAX_DUE_DAYS,
  MAX_HABITS,
  MAX_NODES,
  MAX_PRIORITY,
  MAX_SPLIT_PARTS,
  MAX_TASK_MINUTES,
  MIN_SPLIT_MINUTES,
  PERSONAS,
  QUESTIONS,
  REVIEW_WINDOW_DAYS,
  buildTree,
  coachTurn,
  critique,
  dailyPlan,
  detectPersona,
  isCoachEntry,
  isSafeForCoach,
  newCoachState,
  parseDailyMinutes,
  parseDue,
  parseSplitCause,
  renderTree,
  sanitizeCoachState,
  splitMinutes,
  splitParts,
  weeklyReview,
  type CoachState,
  type CoachTurn,
  type GoalNode,
  type SplitCause,
} from '../goalCoach';
import { EMOTION_MARKERS } from '../chatbot';
import { addIsoDays, isoDaysBetween } from '../../../shared/isoDate';
import { SERVICE_IDS } from '../../../shared/serviceId';

const TODAY = '2026-10-26';

/** 状態を持ち回しながら、発話を順に渡す。 */
function converse(lines: readonly string[], start: CoachState | null = null): { last: CoachTurn; state: CoachState | null } {
  let state = start;
  let last: CoachTurn | null = null;
  for (const l of lines) {
    const t = coachTurn(state, l, TODAY);
    if (t === null) throw new Error(`コーチが応答しませんでした: ${l}`);
    state = t.state;
    last = t;
  }
  if (last === null) throw new Error('発話がありません');
  return { last, state };
}

const INTERVIEW = ['目標を決めたい', '1', '月の売上を 100 万円にする', '家族を安心させたいから', '2027-01-31', '1時間', '月次売上が 100 万円を超えること', '営業の時間が取れない'];

describe('ゴールコーチ: 入口と終了', () => {
  it('状態が無く入口の言葉でもなければ null (コーチの出番ではない)', () => {
    expect(coachTurn(null, 'こんにちは', TODAY)).toBeNull();
    expect(coachTurn(null, '税務試算を開いて', TODAY)).toBeNull();
  });

  it('入口の言葉ごとにコーチが始まり、ペルソナの一覧を出す', () => {
    for (const m of COACH_ENTRY_MARKERS) {
      expect(isCoachEntry(m), m).toBe(true);
      const t = coachTurn(null, m, TODAY);
      expect(t?.state?.phase, m).toBe('persona');
      expect(t?.text, m).toContain('1. 経営者・事業主');
    }
  });

  it('全角・大文字でも入口を読む (正規化)', () => {
    expect(isCoachEntry('ＣＯＡＣＨ')).toBe(false); // 英字は入口ではない
    expect(isCoachEntry('ゴール設定をしたい')).toBe(true);
  });

  it('「コーチをやめる」で状態を捨てる (保存した目標を消すと言う)', () => {
    const { state } = converse(INTERVIEW);
    const t = coachTurn(state, 'コーチをやめる', TODAY);
    expect(t?.state).toBeNull();
    expect(t?.text).toContain('消しました');
  });

  it('「やり直し」はペルソナの質問へ戻り、答えを持ち越さない', () => {
    const { state } = converse(INTERVIEW);
    const t = coachTurn(state, 'やり直し', TODAY);
    expect(t?.state?.phase).toBe('persona');
    expect(t?.state?.answers).toEqual({});
    expect(t?.state?.nodes).toEqual([]);
  });
});

describe('ゴールコーチ: 安全 (感情・危機はコーチへ渡さない)', () => {
  it('危機・他害・破壊衝動・感情の吐露は渡さない', () => {
    expect(isSafeForCoach('死にたい', EMOTION_MARKERS)).toBe(false);
    expect(isSafeForCoach('つらい', EMOTION_MARKERS)).toBe(false);
    expect(isSafeForCoach('不安です', EMOTION_MARKERS)).toBe(false);
  });
  it('目標の話は渡す', () => {
    expect(isSafeForCoach('月の売上を 100 万円にする', EMOTION_MARKERS)).toBe(true);
    expect(isSafeForCoach('2027-01-31', EMOTION_MARKERS)).toBe(true);
  });
});

describe('ゴールコーチ: ペルソナ', () => {
  it('番号でも語でも決まる', () => {
    expect(detectPersona('1')).toBe('owner');
    expect(detectPersona('７')).toBe('household');
    expect(detectPersona('税理士です')).toBe('professional');
    expect(detectPersona('NISA を始めたい')).toBe('investor');
    expect(detectPersona('受験生')).toBe('student');
  });
  it('読めなければ null (推測しない)・範囲外の番号も null', () => {
    expect(detectPersona('うーん')).toBeNull();
    expect(detectPersona('0')).toBeNull();
    expect(detectPersona('9')).toBeNull();
  });
  it('読めない答えでは段階が進まず、もう一度聞く', () => {
    const t = coachTurn(newCoachState(TODAY), 'わからない', TODAY);
    expect(t?.state?.phase).toBe('persona');
    expect(t?.text).toContain('読み取れませんでした');
  });
  it('全ペルソナが 4 段階・関連サービスは実在・1 タスクは上限以内', () => {
    expect(PERSONAS).toHaveLength(7);
    for (const p of PERSONAS) {
      expect(p.stages, p.id).toHaveLength(4);
      for (const st of p.stages) {
        expect(st.steps.length, `${p.id}/${st.title}`).toBeGreaterThanOrEqual(3);
        for (const step of st.steps) expect(step.minutes, step.title).toBeLessThanOrEqual(MAX_TASK_MINUTES);
      }
      for (const svc of p.services) expect(SERVICE_IDS as readonly string[], `${p.id}/${svc}`).toContain(svc);
    }
  });
});

describe('ゴールコーチ: 期限と時間の読み', () => {
  it('ISO 日付・相対・年末・M月D日 を読む', () => {
    expect(parseDue('2027-01-31', TODAY)).toBe('2027-01-31');
    expect(parseDue('10日後', TODAY)).toBe('2026-11-05');
    expect(parseDue('2週間後', TODAY)).toBe('2026-11-09');
    expect(parseDue('3か月後', TODAY)).toBe('2027-01-24');
    expect(parseDue('一年後', TODAY)).toBe('2027-10-26');
    expect(parseDue('半年後', TODAY)).toBe('2027-04-26');
    expect(parseDue('年末', TODAY)).toBe('2026-12-31');
    expect(parseDue('12月5日', TODAY)).toBe('2026-12-05');
    expect(parseDue('3/1', TODAY)).toBe('2027-03-01'); // 過ぎた日は翌年
  });
  it('年末を過ぎていれば翌年末', () => {
    expect(parseDue('年末', '2026-12-31')).toBe('2026-12-31');
    expect(parseDue('年末', '2027-01-02')).toBe('2027-12-31');
  });
  it('読めない・あり得ない期限は null (日付を推測しない)', () => {
    expect(parseDue('そのうち', TODAY)).toBeNull();
    expect(parseDue('2027-02-30', TODAY)).toBeNull();
    expect(parseDue('0日後', TODAY)).toBeNull();
    expect(parseDue('99999日後', TODAY)).toBeNull();
    expect(parseDue('2/30', TODAY)).toBeNull();
  });
  it('1 日の時間は分に直し、下限・上限に丸める', () => {
    expect(parseDailyMinutes('1時間')).toBe(60);
    expect(parseDailyMinutes('1.5時間')).toBe(90);
    expect(parseDailyMinutes('30分')).toBe(30);
    expect(parseDailyMinutes('1時間30分')).toBe(90);
    expect(parseDailyMinutes('2')).toBe(120);
    expect(parseDailyMinutes('45')).toBe(45);
    expect(parseDailyMinutes('5分')).toBe(15);
    expect(parseDailyMinutes('99時間')).toBe(720);
  });
  it('読めなければ null', () => {
    expect(parseDailyMinutes('たくさん')).toBeNull();
    expect(parseDailyMinutes('0時間')).toBeNull();
    expect(parseDailyMinutes('')).toBeNull();
  });
});

describe('ゴールコーチ: 聞き取り → 逆算の木', () => {
  it('問いを順に聞き、答えが揃うと木と疑いを出して review に入る', () => {
    const { last, state } = converse(INTERVIEW);
    expect(state?.phase).toBe('review');
    expect(last.text).toContain('期限から逆算');
    expect(last.text).toContain('自分で疑ってみた点');
    expect(last.suggestions).toContain('進めて');
    expect(QUESTIONS.map((q) => q.key)).toEqual(['goal', 'why', 'due', 'hours', 'measure', 'blocker']);
  });

  it('期限が読めない答えでは進まず、読めたものだけを使う', () => {
    const { state } = converse(['目標を決めたい', '1', '売上を伸ばす', '生活のため']);
    const t = coachTurn(state, 'そのうち', TODAY);
    expect(t?.state?.answers.due).toBeUndefined();
    expect(t?.text).toContain('読めませんでした');
  });
  it('過去の期限は断る', () => {
    const { state } = converse(['目標を決めたい', '1', '売上を伸ばす', '生活のため']);
    const t = coachTurn(state, '2020-01-01', TODAY);
    expect(t?.state?.answers.due).toBeUndefined();
    expect(t?.text).toContain('過ぎています');
  });
  it('読めない時間・空の答えは断る', () => {
    const { state } = converse(['目標を決めたい', '1', '売上を伸ばす', '生活のため', '2027-01-31']);
    expect(coachTurn(state, 'たくさん', TODAY)?.state?.answers.hours).toBeUndefined();
    const empty = converse(['目標を決めたい', '1'], null).state;
    expect(coachTurn(empty, '   ', TODAY)?.text).toContain('空の答え');
  });

  it('逆算: 最後の段階の期日が期限、手前ほど早く、昇順になる', () => {
    const { state } = converse(INTERVIEW);
    const milestones = (state?.nodes ?? []).filter((n) => n.kind === 'milestone');
    expect(milestones).toHaveLength(4);
    const dues = milestones.map((m) => m.due ?? '');
    expect(dues[3]).toBe('2027-01-31');
    expect([...dues].sort()).toEqual(dues);
    expect(new Set(dues).size).toBe(4);
    expect((dues[0] ?? '') < (dues[3] ?? '')).toBe(true);
  });

  it('木の形: 目的 → ゴール → マイルストーン → タスク、タスクは上限以内で親を持つ', () => {
    const { state } = converse(INTERVIEW);
    const nodes = state?.nodes ?? [];
    const kinds = (k: string) => nodes.filter((n) => n.kind === k);
    expect(kinds('purpose')).toHaveLength(1);
    expect(kinds('goal')).toHaveLength(1);
    expect(kinds('purpose')[0]?.title).toBe('家族を安心させたいから');
    expect(kinds('goal')[0]?.title).toBe('月の売上を 100 万円にする');
    expect(kinds('goal')[0]?.parent).toBe(kinds('purpose')[0]?.id);
    const ids = new Set(nodes.map((n) => n.id));
    for (const n of nodes) {
      if (n.kind !== 'purpose') expect(ids.has(n.parent as number), `#${n.id}`).toBe(true);
      if (n.kind === 'task') {
        expect(n.minutes).toBeGreaterThan(0);
        expect(n.minutes).toBeLessThanOrEqual(MAX_TASK_MINUTES);
      }
    }
    expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length);
  });

  it('障害が書かれていれば最初の段階に対処のタスクが入り、「なし」なら入らない', () => {
    const withBlocker = converse(INTERVIEW).state?.nodes ?? [];
    expect(withBlocker.some((n) => n.title.includes('営業の時間が取れない'))).toBe(true);
    const none = converse([...INTERVIEW.slice(0, 7), 'なし']).state?.nodes ?? [];
    expect(none.some((n) => n.title.includes('への対処を 1 つ決める'))).toBe(false);
    expect(withBlocker.some((n) => n.title.includes('への対処を 1 つ決める'))).toBe(true);
  });

  it('期限が近すぎても逆算は最短 7 日に延ばす', () => {
    const base = converse(INTERVIEW).state as CoachState;
    const near = buildTree({ ...base, answers: { ...base.answers, due: '2026-10-27' } }, TODAY);
    const goal = near.nodes.find((n) => n.kind === 'goal');
    expect(isoDaysBetween(TODAY, goal?.due)).toBe(7);
  });

  it('描画: すべてのタスクが番号つきで出る', () => {
    const { state } = converse(INTERVIEW);
    const text = renderTree(state as CoachState);
    for (const n of (state as CoachState).nodes.filter((x) => x.kind === 'task')) expect(text).toContain(`#${n.id} `);
    expect(text).toContain('🌱');
    expect(text).toContain('🎯');
    expect(text).toContain('🏁');
  });
});

describe('ゴールコーチ: 批判的な見直し', () => {
  const stateWith = (answers: CoachState['answers']): CoachState => {
    const base = converse(INTERVIEW).state as CoachState;
    return buildTree({ ...base, answers: { ...base.answers, ...answers } }, TODAY);
  };

  it('数字が無いと指摘する・数字があれば指摘しない', () => {
    expect(critique(stateWith({ measure: 'うまくいくこと', goal: 'もっと良くする' }), TODAY).some((c) => c.message.includes('数字がありません'))).toBe(true);
    expect(critique(stateWith({ measure: '月次売上 100 万円' }), TODAY).some((c) => c.message.includes('数字がありません'))).toBe(false);
  });
  it('目的が短いと指摘する', () => {
    expect(critique(stateWith({ why: '楽になる' }), TODAY).some((c) => c.message.includes('目的が短く'))).toBe(true);
    expect(critique(stateWith({ why: '家族を安心させたいから' }), TODAY).some((c) => c.message.includes('目的が短く'))).toBe(false);
  });
  it('時間が足りないと、必要と使える時間を数字で言う', () => {
    const s = stateWith({ hours: '15分', due: '2026-11-09' });
    const c = critique(s, TODAY).find((x) => x.message.includes('足りません'));
    expect(c?.severity).toBe('warn');
    expect(c?.message).toMatch(/約 [\d.]+ 時間/);
  });
  it('時間が十分なら「足りません」は出ない', () => {
    expect(critique(stateWith({ hours: '8時間', due: '2027-10-26' }), TODAY).some((c) => c.message.includes('足りません'))).toBe(false);
  });
  it('期限が過ぎていれば逆算は無効と言う', () => {
    const s = stateWith({});
    expect(critique(s, '2027-06-01').some((c) => c.message.includes('すでに過ぎています'))).toBe(true);
  });
  it('障害は思い込みかを疑い、失敗の形 (pre-mortem) を最後に添える', () => {
    const c = critique(stateWith({}), TODAY);
    expect(c.some((x) => x.message.includes('事実ですか、それとも思い込み'))).toBe(true);
    expect(c[c.length - 1]?.message).toContain('失敗するとしたら');
  });
});

describe('ゴールコーチ: 毎日のタスク', () => {
  const active = (): CoachState => converse([...INTERVIEW, '進めて']).state as CoachState;

  it('review で「進めて」と答えると active になり、今日の予定を出す', () => {
    const { last, state } = converse([...INTERVIEW, '進めて']);
    expect(state?.phase).toBe('active');
    expect(last.text).toContain(`${TODAY} の予定`);
    expect(last.relatedServices.length).toBeGreaterThan(0);
  });
  it('review の途中の言葉は確定せず案内する', () => {
    const { state } = converse(INTERVIEW);
    const t = coachTurn(state, 'どうしよう', TODAY);
    expect(t?.state?.phase).toBe('review');
    expect(t?.text).toContain('確認中');
  });

  it('今日の予定は使える時間の範囲で、期日の早い順に最低 1 件', () => {
    const s = active();
    const plan = dailyPlan(s, TODAY);
    expect(plan.items.length).toBeGreaterThanOrEqual(1);
    expect(plan.minutes).toBeLessThanOrEqual(plan.budget);
    const dues = plan.items.map((i) => i.due ?? '');
    expect([...dues].sort()).toEqual(dues);
    const tiny = dailyPlan({ ...s, answers: { ...s.answers, hours: '15分' } }, TODAY);
    expect(tiny.items.length).toBeGreaterThanOrEqual(1); // 予算より大きい 1 件目でも最低 1 件
  });
  it('期日を過ぎた未完了は overdue に数え、予定の文に警告を出す', () => {
    const s = active();
    const late = dailyPlan(s, '2027-03-01');
    expect(late.overdue.length).toBeGreaterThan(0);
    const t = coachTurn(s, '今日の予定', '2027-03-01');
    expect(t?.text).toContain('期日を過ぎた未完了');
  });

  it('「#番号 完了」で完了にし、残り件数を言う・同じ番号をもう一度は断る', () => {
    const s = active();
    const first = dailyPlan(s, TODAY).items[0];
    const t = coachTurn(s, `#${first?.id} 完了`, TODAY);
    expect(t?.state?.nodes.find((n) => n.id === first?.id)?.done).toBe(true);
    expect(t?.text).toContain('完了にしました');
    const again = coachTurn(t?.state ?? null, `#${first?.id} 完了`, TODAY);
    expect(again?.text).toContain('すでに完了');
  });
  it('存在しない番号・タスクでない番号は断る', () => {
    const s = active();
    expect(coachTurn(s, '#999 完了', TODAY)?.text).toContain('見当たりません');
    const goalId = s.nodes.find((n) => n.kind === 'goal')?.id;
    expect(coachTurn(s, `#${goalId} 完了`, TODAY)?.text).toContain('見当たりません');
  });
  it('全部完了すると祝って、次の目標へ促す', () => {
    let s = active();
    let last: CoachTurn | null = null;
    for (const n of s.nodes.filter((x) => x.kind === 'task')) {
      last = coachTurn(s, `#${n.id} 完了`, TODAY);
      s = last?.state as CoachState;
    }
    expect(last?.text).toContain('すべてのタスクが完了');
    expect(coachTurn(s, '今日の予定', TODAY)?.text).toContain('達成済み');
  });
  it('「追加: ○○」で未完了のマイルストーンへ足す', () => {
    const s = active();
    const t = coachTurn(s, '追加: 見積書のひな形を作る', TODAY);
    const added = t?.state?.nodes[t.state.nodes.length - 1];
    expect(added?.title).toBe('見積書のひな形を作る');
    expect(added?.kind).toBe('task');
    expect(t?.state?.nextId).toBe(s.nextId + 1);
  });
  it('計画が上限に達していれば追加を断る', () => {
    const s = active();
    const full: CoachState = { ...s, nodes: Array.from({ length: MAX_NODES }, (_, i) => ({ id: i + 1, parent: null, kind: 'task', title: 't', due: null, minutes: 10, done: false })), nextId: MAX_NODES + 1 };
    expect(coachTurn(full, '追加: もう一つ', TODAY)?.text).toContain('上限');
  });
  it('全体・見直し・ヘルプの言い回しに答える', () => {
    const s = active();
    expect(coachTurn(s, '全体を見せて', TODAY)?.text).toContain('🏁');
    expect(coachTurn(s, '見直して', TODAY)?.text).toContain('自分で疑ってみた点');
    expect(coachTurn(s, 'コーチの使い方', TODAY)?.text).toContain('使える言い方');
  });
  it('★ コーチの言い回しでない依頼は飲み込まず null (他の機能が答える)', () => {
    const s = active();
    for (const other of ['パスワードをリセットして', 'サービス一覧を見せて', '税務試算を開いて', '額面40万の手取りは？', '事業計画書を作って', 'むにゃ', '予定表を開いて']) {
      expect(coachTurn(s, other, TODAY), other).toBeNull();
    }
  });
  it('聞き取りの途中は、どんな文でも答えとして受け取る (飲み込む範囲はここだけ)', () => {
    const { state } = converse(['目標を決めたい', '1']);
    const t = coachTurn(state, 'パスワードをリセットして', TODAY);
    expect(t?.state?.answers.goal).toBe('パスワードをリセットして');
  });
});

describe('ゴールコーチ: 保存値の読み', () => {
  const good = (): unknown => JSON.parse(JSON.stringify(converse([...INTERVIEW, '進めて']).state));

  it('往復して同じ状態になる', () => {
    const s = converse([...INTERVIEW, '進めて']).state;
    expect(sanitizeCoachState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it.each([
    ['null', null],
    ['配列', []],
    ['版が違う', { v: 2 }],
    ['phase が未知', (() => ({ ...(good() as object), phase: 'xx' }))()],
    ['persona が未知', (() => ({ ...(good() as object), persona: 'wizard' }))()],
    ['startedOn が暦に無い', (() => ({ ...(good() as object), startedOn: '2026-02-30' }))()],
    ['nextId が整数でない', (() => ({ ...(good() as object), nextId: 1.5 }))()],
    ['answers が配列', (() => ({ ...(good() as object), answers: [] }))()],
    ['answers の値が文字列でない', (() => ({ ...(good() as object), answers: { goal: 5 } }))()],
    ['nodes が配列でない', (() => ({ ...(good() as object), nodes: {} }))()],
    ['nodes が多すぎる', (() => ({ ...(good() as object), nodes: Array.from({ length: MAX_NODES + 1 }, () => ({})) }))()],
    ['node の kind が未知', (() => { const g = good() as { nodes: Record<string, unknown>[] }; return { ...g, nodes: [{ ...g.nodes[0], kind: 'x' }, ...g.nodes.slice(1)] }; })()],
    ['node の minutes が上限超え', (() => { const g = good() as { nodes: Record<string, unknown>[] }; return { ...g, nodes: [{ ...g.nodes[0], minutes: 999 }, ...g.nodes.slice(1)] }; })()],
    ['node の due が暦に無い', (() => { const g = good() as { nodes: Record<string, unknown>[] }; return { ...g, nodes: [{ ...g.nodes[0], due: 'あした' }, ...g.nodes.slice(1)] }; })()],
    ['node の id が nextId 以上', (() => { const g = good() as { nodes: Record<string, unknown>[] }; return { ...g, nextId: 1 }; })()],
  ])('読めない保存値 (%s) は null (黙って別の値にしない)', (_n, raw) => {
    expect(sanitizeCoachState(raw)).toBeNull();
  });
  it('__proto__ の鍵を持つ answers でも prototype を置換しない', () => {
    const raw = JSON.parse('{"v":1,"phase":"persona","persona":null,"startedOn":"2026-10-26","nextId":1,"nodes":[],"answers":{"__proto__":{"goal":"x"}}}');
    const s = sanitizeCoachState(raw);
    expect(s?.answers).toEqual({});
    expect(({} as Record<string, unknown>).goal).toBeUndefined();
  });
  it('長すぎる文字列は切って読む', () => {
    const g = good() as { answers: Record<string, string> };
    g.answers.goal = 'あ'.repeat(5000);
    expect(Array.from(sanitizeCoachState(g)?.answers.goal ?? '').length).toBeLessThanOrEqual(120);
  });
});

describe('ゴールコーチ: 答えの長さの上限', () => {
  it('上限を超える答えは MAX_ANSWER_CHARS 文字で切って持つ (木に長文を積まない)', () => {
    const long = 'あ'.repeat(MAX_ANSWER_CHARS + 50);
    const { state } = converse(['目標を決めたい', '1', long]);
    const stored = state?.answers.goal ?? '';
    expect(Array.from(stored).length).toBe(MAX_ANSWER_CHARS);
  });
});

// --- 会話文法の拡張 (目標・期限の変更 / 優先度 / 習慣 / 振り返り / できなかった) -----------------

const activeState = (): CoachState => converse([...INTERVIEW, '進めて']).state as CoachState;
const node = (s: CoachState | null | undefined, id: number): GoalNode | undefined => s?.nodes.find((n) => n.id === id);
const say = (s: CoachState, line: string, today = TODAY): CoachTurn => {
  const t = coachTurn(s, line, today);
  if (t === null) throw new Error(`コーチが応答しませんでした: ${line}`);
  return t;
};
const tasksOf = (s: CoachState): GoalNode[] => s.nodes.filter((n) => n.kind === 'task');
/** 計画を MAX_NODES ちょうどまで埋める (どれも未完了・題名は重ならない)。 */
const filled = (s: CoachState): CoachState => {
  const extra: GoalNode[] = Array.from({ length: MAX_NODES - s.nodes.length }, (_, i) => ({ id: s.nextId + i, parent: 3, kind: 'task', title: `埋め草 ${i}`, due: '2027-01-31', minutes: 10, done: false }));
  return { ...s, nodes: [...s.nodes, ...extra], nextId: s.nextId + extra.length };
};
const consistent = (s: CoachState): void => {
  const ids = s.nodes.map((n) => n.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.every((i) => i < s.nextId)).toBe(true);
  expect(s.nodes.length).toBeLessThanOrEqual(MAX_NODES);
  expect(sanitizeCoachState(JSON.parse(JSON.stringify(s)))).toEqual(s);
};

describe('ゴールコーチ: 目標・期限を変えて逆算し直す', () => {
  it('「目標を変える: ○○」でゴールの題を替え、期限から作り直す (フェーズは変えない)', () => {
    const s = activeState();
    const t = say(s, '目標を変える: 月の売上を 150 万円にする');
    expect(t.state?.phase).toBe('active');
    expect(t.state?.answers.goal).toBe('月の売上を 150 万円にする');
    expect(t.state?.nodes.find((n) => n.kind === 'goal')?.title).toBe('月の売上を 150 万円にする');
    expect(t.text).toContain('逆算し直しました');
    consistent(t.state as CoachState);
  });
  it('新しい目標の文に「やり直し」が入っていても、預かった計画を消さない (終了・やり直しより先に読む)', () => {
    const t = say(activeState(), '目標を変える: 営業のやり直しを仕組みにする');
    expect(t.state?.phase).toBe('active');
    expect(t.state?.answers.goal).toBe('営業のやり直しを仕組みにする');
  });
  it('目標の長さは MAX_ANSWER_CHARS で切る・空は断る・同じなら変えない', () => {
    const s = activeState();
    const long = say(s, `目標を変える: ${'あ'.repeat(MAX_ANSWER_CHARS + 30)}`);
    expect(Array.from(long.state?.answers.goal ?? '').length).toBeLessThanOrEqual(MAX_ANSWER_CHARS);
    expect(say(s, '目標を変える:   ').state).toEqual(s); // 中身が空 = コロンの後ろが無いのと同じ (使い方を案内する)
    expect(say(s, '目標を変える: 月の売上を 100 万円にする').text).toContain('同じです');
  });
  it('コロンが無ければ使い方を案内し、何も変えない', () => {
    const s = activeState();
    for (const w of ['目標を変えたい', '期限を延ばしたい']) {
      const t = say(s, w);
      expect(t.state).toEqual(s);
      expect(t.text).toContain('コロンの後ろ');
    }
  });
  it('「期限を変える: ○○」は日付 / 相対で読み、最終マイルストーンが新しい期限になる', () => {
    const s = activeState();
    const a = say(s, '期限を変える: 2027-03-31');
    expect(a.state?.answers.due).toBe('2027-03-31');
    expect(a.state?.nodes.find((n) => n.kind === 'goal')?.due).toBe('2027-03-31');
    const ms = (a.state?.nodes ?? []).filter((n) => n.kind === 'milestone');
    expect(ms[3]?.due).toBe('2027-03-31');
    expect(say(s, '期限を延ばす: 半年後').state?.answers.due).toBe('2027-04-26');
  });
  it('読めない・過去・遠すぎる期限は断り、状態を変えない (日付を推測しない)', () => {
    const s = activeState();
    for (const bad of ['そのうち', '2027-02-30', '2020-01-01', '9999-12-31']) {
      const t = say(s, `期限を変える: ${bad}`);
      expect(t.state, bad).toEqual(s);
    }
    expect(say(s, '期限を変える: そのうち').text).toContain('読めませんでした');
    expect(say(s, '期限を変える: 2020-01-01').text).toContain('過ぎています');
  });
  it('期限の上限 MAX_DUE_DAYS ちょうどは受け、1 日先は断る', () => {
    const s = activeState();
    const edge = addIsoDays(TODAY, MAX_DUE_DAYS) as string;
    expect(say(s, `期限を変える: ${edge}`).state?.answers.due).toBe(edge);
    const over = addIsoDays(TODAY, MAX_DUE_DAYS + 1) as string;
    const t = say(s, `期限を変える: ${over}`);
    expect(t.state).toEqual(s);
    expect(t.text).toContain(`${MAX_DUE_DAYS} 日`);
  });
  it('review の途中でも変えられ、フェーズは review のまま「進めて」を案内する', () => {
    const review = converse(INTERVIEW).state as CoachState;
    const t = say(review, '期限を変える: 2027-06-30');
    expect(t.state?.phase).toBe('review');
    expect(t.text).toContain('「進めて」');
  });
  it('作り直しは完了・優先度・自分で足した物を引き継ぐ', () => {
    let s = activeState();
    s = say(s, '#4 完了').state as CoachState;
    s = say(s, '追加: 見積書のひな形を作る').state as CoachState;
    s = say(s, '#9 優先度を上げて').state as CoachState;
    const t = say(s, '目標を変える: 月の売上を 120 万円にする');
    const next = t.state as CoachState;
    expect(next.nodes.find((n) => n.title.includes('への対処を 1 つ決める'))?.done).toBe(true);
    expect(next.nodes.some((n) => n.title === '見積書のひな形を作る')).toBe(true);
    expect(next.nodes.filter((n) => (n.priority ?? 0) > 0)).toHaveLength(1);
    consistent(next);
  });
  it('割ったタスクは作り直しで二重にならず、部品がすべて完了なら元も完了として引き継ぐ', () => {
    let s = activeState();
    const orig = node(s, 5)?.title ?? '';
    s = say(s, '#5 できなかった 大きすぎた').state as CoachState;
    const parts = s.nodes.filter((n) => n.title.startsWith(`${orig}（`));
    expect(parts.length).toBeGreaterThanOrEqual(2);
    const open = (say(s, '期限を変える: 2027-03-31').state as CoachState).nodes;
    expect(open.some((n) => n.title.startsWith(`${orig}（`))).toBe(false);
    expect(open.find((n) => n.title === orig)?.done).toBe(false);
    for (const p of parts) s = say(s, `#${p.id} 完了`).state as CoachState;
    const doneAll = (say(s, '期限を変える: 2027-03-31').state as CoachState).nodes;
    expect(doneAll.find((n) => n.title === orig)?.done).toBe(true);
    expect(doneAll.some((n) => n.title.startsWith(`${orig}（`))).toBe(false);
  });
  it('作り直しが上限 MAX_NODES を超えるなら切らずに断り、状態を変えない', () => {
    // 生成されたタスクが 1 つも無く、自分で足した物が MAX_NODES まで在る計画 —— 作り直すと、新しい木と引き継ぐ物の合計が上限を超える。
    const base = activeState();
    const skeleton = base.nodes.filter((n) => n.kind !== 'task');
    const crowd: GoalNode[] = Array.from({ length: MAX_NODES - skeleton.length }, (_, i) => ({ id: base.nextId + i, parent: 3, kind: 'task', title: `自分で足した ${i}`, due: '2027-01-31', minutes: 10, done: false }));
    const s: CoachState = { ...base, nodes: [...skeleton, ...crowd], nextId: base.nextId + crowd.length };
    expect(s.nodes).toHaveLength(MAX_NODES);
    const t = say(s, '期限を変える: 半年後');
    expect(t.state).toEqual(s);
    expect(t.text).toContain('大きくなりすぎ');
  });
});

describe('ゴールコーチ: 優先度', () => {
  it('上げると今日の予定で期日より先に並ぶ・下げると戻る (0 に戻ると欄ごと消える)', () => {
    const s = activeState();
    const last = tasksOf(s)[tasksOf(s).length - 1] as GoalNode;
    expect(dailyPlan(s, TODAY).items[0]?.id).not.toBe(last.id);
    const up = say(s, `#${last.id} 優先度を上げて`).state as CoachState;
    expect(node(up, last.id)?.priority).toBe(1);
    expect(dailyPlan(up, TODAY).items[0]?.id).toBe(last.id);
    const back = say(up, `#${last.id} 優先度を下げて`).state as CoachState;
    expect('priority' in (node(back, last.id) as object)).toBe(false);
    expect(dailyPlan(back, TODAY).items[0]?.id).not.toBe(last.id);
  });
  it('幅は ±MAX_PRIORITY で、超える上げ下げは断る', () => {
    let s = activeState();
    const id = (tasksOf(s)[3] as GoalNode).id;
    for (let i = 0; i < MAX_PRIORITY; i += 1) s = say(s, `#${id} 優先度を上げて`).state as CoachState;
    expect(node(s, id)?.priority).toBe(MAX_PRIORITY);
    const over = say(s, `#${id} 優先度を上げて`);
    expect(over.text).toContain('最上位');
    expect(node(over.state, id)?.priority).toBe(MAX_PRIORITY);
    let d = activeState();
    for (let i = 0; i < MAX_PRIORITY; i += 1) d = say(d, `#${id} 優先度を下げて`).state as CoachState;
    expect(node(d, id)?.priority).toBe(-MAX_PRIORITY);
    expect(say(d, `#${id} 優先度を下げて`).text).toContain('最下位');
  });
  it('番号が無い・存在しない・完了済みは断り、状態を変えない', () => {
    const s = activeState();
    expect(say(s, '優先度を上げて').text).toContain('番号を付けて');
    expect(say(s, '#999 優先度を上げて').text).toContain('見当たりません');
    const done = say(s, '#4 完了').state as CoachState;
    const t = say(done, '#4 優先度を上げて');
    expect(t.text).toContain('完了している');
    expect(node(t.state, 4)?.priority).toBeUndefined();
  });
});

describe('ゴールコーチ: 習慣 (繰り返しタスク)', () => {
  it('毎日の習慣: 完了にしても done は立たず、翌日また予定へ戻る', () => {
    const s = say(activeState(), '#4 習慣にする').state as CoachState;
    expect(node(s, 4)?.repeat).toBe('daily');
    const done = say(s, '#4 完了');
    expect(node(done.state, 4)?.done).toBe(false);
    expect(node(done.state, 4)?.doneOn).toBe(TODAY);
    expect(done.text).toContain('翌日にまた予定へ戻ります');
    expect(dailyPlan(done.state as CoachState, TODAY).items.some((n) => n.id === 4)).toBe(false);
    expect(dailyPlan(done.state as CoachState, addIsoDays(TODAY, 1) as string).items.some((n) => n.id === 4)).toBe(true);
    expect(say(done.state as CoachState, '#4 完了').text).toContain('今日の分がすでに完了');
  });
  it('毎週の習慣は 7 日後に戻る (6 日後はまだ)', () => {
    const s = say(activeState(), '#5 毎週やる').state as CoachState;
    expect(node(s, 5)?.repeat).toBe('weekly');
    const done = say(s, '#5 完了').state as CoachState;
    expect(dailyPlan(done, addIsoDays(TODAY, 6) as string).items.some((n) => n.id === 5)).toBe(false);
    expect(dailyPlan(done, addIsoDays(TODAY, 7) as string).items.some((n) => n.id === 5)).toBe(true);
  });
  it('習慣は期限切れ (overdue) にも数えず、達成の完了判定にも入らない', () => {
    let s = say(activeState(), '#4 習慣にする').state as CoachState;
    expect(dailyPlan(s, '2027-03-01').overdue.some((n) => n.id === 4)).toBe(false);
    let last: CoachTurn | null = null;
    for (const n of tasksOf(s).filter((x) => x.repeat === undefined)) {
      last = say(s, `#${n.id} 完了`);
      s = last.state as CoachState;
    }
    expect(last?.text).toContain('すべてのタスクが完了');
    expect(node(s, 4)?.done).toBe(false);
  });
  it('習慣は MAX_HABITS 件まで・やめると未完了の普通のタスクへ戻る', () => {
    let s = activeState();
    const ids = tasksOf(s).map((n) => n.id);
    for (const id of ids.slice(0, MAX_HABITS)) s = say(s, `#${id} 習慣にする`).state as CoachState;
    const over = say(s, `#${ids[MAX_HABITS]} 習慣にする`);
    expect(over.text).toContain(`${MAX_HABITS} 件まで`);
    expect(node(over.state, ids[MAX_HABITS] as number)?.repeat).toBeUndefined();
    const off = say(s, `#${ids[0]} 習慣をやめる`).state as CoachState;
    expect(node(off, ids[0] as number)?.repeat).toBeUndefined();
    expect(node(off, ids[0] as number)?.done).toBe(false);
  });
  it('完了済み・番号なし・存在しない番号・習慣でない物の解除は断る', () => {
    const s = activeState();
    const done = say(s, '#4 完了').state as CoachState;
    expect(say(done, '#4 習慣にする').text).toContain('すでに完了');
    expect(say(s, '習慣にする').text).toContain('番号を付けて');
    expect(say(s, '#999 習慣にする').text).toContain('見当たりません');
    expect(say(s, '#4 習慣をやめる').text).toContain('習慣ではありません');
  });
  it('review の途中では確定を促すだけで、習慣にはしない', () => {
    const review = converse(INTERVIEW).state as CoachState;
    const t = say(review, '#4 習慣にする');
    expect(t.text).toContain('確認中');
    expect(node(t.state, 4)?.repeat).toBeUndefined();
  });
});

describe('ゴールコーチ: 今週の振り返り', () => {
  const mini = (tasks: readonly Partial<GoalNode>[], over: { startedOn?: string; goalDue?: string } = {}): CoachState => {
    const goalDue = over.goalDue ?? '2026-04-11';
    const nodes: GoalNode[] = [
      { id: 1, parent: null, kind: 'purpose', title: '目的を具体的に書いた文', due: null, minutes: 0, done: false },
      { id: 2, parent: 1, kind: 'goal', title: '目標 100', due: goalDue, minutes: 0, done: false },
      ...tasks.map((t, i): GoalNode => ({ id: 10 + i, parent: 2, kind: 'task', title: `タスク ${i}`, due: goalDue, minutes: 30, done: false, ...t })),
    ];
    return { v: 1, phase: 'active', persona: 'owner', answers: { hours: '60分' }, startedOn: over.startedOn ?? '2026-01-01', nodes, nextId: 10 + tasks.length };
  };
  const NOW = '2026-02-20'; // 開始から 50 日・期間 (100 日) の 50%
  const many = (done: number, total: number): Partial<GoalNode>[] => Array.from({ length: total }, (_, i) => (i < done ? { done: true, doneOn: '2026-02-19' } : {}));

  it('完了率・作業量・直近の完了・遅れ・経過を数字で言い、問いは 1 つだけ', () => {
    const t = say(activeState(), '今週の振り返り');
    expect(t.text).toContain('今週の振り返り');
    for (const k of ['完了 0 /', '作業量 (分) では', '直近 7 日の完了', '期日を過ぎた未完了', '期間の経過']) expect(t.text).toContain(k);
    expect(t.text.split('❓')).toHaveLength(2);
    expect(t.state).toEqual(activeState());
  });
  it('REVIEW_WINDOW_DAYS: 6 日前の完了は数え、7 日前・未来・日付なしは数えない', () => {
    const r = weeklyReview(mini([{ done: true, doneOn: '2026-02-14' }, { done: true, doneOn: '2026-02-13' }, { done: true, doneOn: '2026-02-21' }, { done: true }, {}]), NOW);
    expect(REVIEW_WINDOW_DAYS).toBe(7);
    expect(r.doneThisWeek).toBe(1);
    expect(r.doneUndated).toBe(1);
    expect(r.done).toBe(4);
    expect(r.total).toBe(5);
  });
  it('遅れ: 経過率が完了率を LATE_GAP_PCT より上回ると根拠を問う (ちょうどは問わない)', () => {
    const edge = weeklyReview(mini(many(30, 100)), NOW);
    expect(edge.elapsedPct).toBe(50);
    expect((edge.elapsedPct as number) - (edge.donePct as number)).toBe(LATE_GAP_PCT);
    expect(edge.question).toContain('遅れていません');
    const late = weeklyReview(mini(many(29, 100)), NOW);
    expect((late.elapsedPct as number) - (late.donePct as number)).toBe(LATE_GAP_PCT + 1);
    expect(late.question).toContain('根拠');
  });
  it('期日を過ぎた未完了があれば、それを名指しして「できなかった」へ繋ぐ (最優先の問い)', () => {
    const r = weeklyReview(mini([{ due: '2026-02-01' }, ...many(1, 3)]), NOW);
    expect(r.overdue.map((n) => n.id)).toEqual([10]);
    expect(r.question).toContain('#10 できなかった');
  });
  it('直近 7 日に 1 件も完了していなければ、止めている物を問う (開始から 7 日未満なら問わない)', () => {
    const stalled = weeklyReview(mini([{}, {}, {}]), NOW);
    expect(stalled.question).toContain('0 件');
    const young = weeklyReview(mini([{}, {}, {}], { startedOn: '2026-02-18' }), NOW);
    expect(young.question).not.toContain('0 件');
  });
  it('タスクが無ければそう言う・順調なら再現性を疑う問いを返す', () => {
    expect(weeklyReview(mini([]), NOW).question).toContain('タスクがありません');
    expect(weeklyReview(mini(many(5, 10)), NOW).question).toContain('再現できる');
  });
  it('習慣は件数だけ別に言い、完了率には混ぜない', () => {
    const s = say(activeState(), '#4 習慣にする').state as CoachState;
    const r = weeklyReview(s, TODAY);
    expect(r.habits).toBe(1);
    expect(r.total).toBe(tasksOf(activeState()).length - 1);
    expect(say(s, '今週の振り返り').text).toContain('習慣: 1 件');
  });
  it('割れない割合 (タスクが 0 件) は 0% と言わず「—」にする', () => {
    const r = weeklyReview(mini([]), NOW);
    expect(r.donePct).toBeNull();
    expect(r.minutesPct).toBeNull();
    const text = say(mini([]), '今週の振り返り', NOW).text;
    expect(text).toContain('完了 0 / 0 件 (—)');
    expect(text).not.toContain('(0%)');
  });
  it('review の途中では確定を促すだけ', () => {
    expect(say(converse(INTERVIEW).state as CoachState, '今週の振り返り').text).toContain('確認中');
  });
});

describe('ゴールコーチ: できなかった → 原因を 1 つ聞いて割る', () => {
  const pending = (): CoachState => say(activeState(), '#5 できなかった').state as CoachState;

  it('「できなかった」は完了ではない。原因を聞き、保留 (splitFor) を持つ', () => {
    const t = say(activeState(), '#5 できなかった');
    expect(node(t.state, 5)?.done).toBe(false);
    expect(t.state?.splitFor).toBe(5);
    expect(t.text).toContain('1. 大きすぎた');
    expect(t.suggestions).toEqual(['1', '2', '3']);
  });
  it('番号なしなら、期日を過ぎた物・なければ今日の予定の先頭を対象にする', () => {
    const s = activeState();
    expect(say(s, 'できなかった').state?.splitFor).toBe(dailyPlan(s, TODAY).items[0]?.id);
    const late = dailyPlan(s, '2027-03-01').overdue[0]?.id;
    expect(say(s, 'できなかった', '2027-03-01').state?.splitFor).toBe(late);
  });
  it.each<[string, SplitCause]>([
    ['1', 'large'],
    ['2', 'time'],
    ['3', 'start'],
    ['大きすぎた', 'large'],
    ['時間がなかった', 'time'],
    ['何から始めればいいか分からなかった', 'start'],
  ])('原因「%s」→ %s', (said, cause) => {
    expect(parseSplitCause(said)).toBe(cause);
    const t = say(pending(), said);
    expect(t.state?.splitFor).toBeUndefined();
    expect(t.state?.nodes.length).toBeGreaterThan(activeState().nodes.length);
  });
  it('割ると合計の分は変わらず、最初の部品は元の番号を引き継ぎ、親・期日・優先度を持ち越す', () => {
    let s = say(activeState(), '#5 優先度を上げて').state as CoachState;
    const orig = node(s, 5) as GoalNode;
    s = say(s, '#5 できなかった 大きすぎた').state as CoachState;
    const parts = s.nodes.filter((n) => n.title.startsWith(`${orig.title}（`));
    expect(parts[0]?.id).toBe(5);
    expect(parts.reduce((a, n) => a + n.minutes, 0)).toBe(orig.minutes);
    for (const p of parts) {
      expect(p.parent).toBe(orig.parent);
      expect(p.due).toBe(orig.due);
      expect(p.priority).toBe(1);
      expect(p.minutes).toBeGreaterThanOrEqual(MIN_SPLIT_MINUTES);
      expect(p.minutes).toBeLessThanOrEqual(MAX_TASK_MINUTES);
    }
    expect(parts.length).toBeLessThanOrEqual(MAX_SPLIT_PARTS);
    consistent(s);
  });
  it('原因ごとに割り方が違う (最初の一歩・短く)', () => {
    const start = say(pending(), '3').state as CoachState;
    expect(start.nodes.some((n) => n.title.includes('最初の一歩'))).toBe(true);
    expect(start.nodes.find((n) => n.title.includes('最初の一歩'))?.minutes).toBe(MIN_SPLIT_MINUTES);
    const time = say(pending(), '2');
    expect(time.state?.nodes.some((n) => n.title.includes('短く 1/'))).toBe(true);
    expect(time.text).toContain('「見直して」');
  });
  it('「キャンセル」で保留だけ外し、読めない発話は飲み込まず保留も残る', () => {
    const p = pending();
    const cancelled = say(p, 'キャンセル');
    expect(cancelled.state?.splitFor).toBeUndefined();
    expect(cancelled.state?.nodes).toEqual(p.nodes);
    const other = say(p, '今日の予定');
    expect(other.text).toContain('の予定');
    expect(other.state?.splitFor).toBe(5);
    expect(coachTurn(p, 'パスワードをリセットして', TODAY)).toBeNull();
    expect(say(other.state as CoachState, '1').state?.splitFor).toBeUndefined();
  });
  it('割れない物・習慣・完了済みは割らず、保留も立てない', () => {
    const small: CoachState = { ...activeState(), nodes: activeState().nodes.map((n) => (n.id === 5 ? { ...n, minutes: MIN_SPLIT_MINUTES * 2 - 1 } : n)) };
    const t = say(small, '#5 できなかった');
    expect(t.text).toContain('これ以上は割れません');
    expect(t.state?.splitFor).toBeUndefined();
    const habit = say(say(activeState(), '#5 習慣にする').state as CoachState, '#5 できなかった');
    expect(habit.text).toContain('習慣なので割りません');
    const done = say(say(activeState(), '#5 完了').state as CoachState, '#5 できなかった');
    expect(done.text).toContain('すでに完了');
    expect(say(activeState(), '#999 できなかった').text).toContain('見当たりません');
  });
  it('上限 MAX_NODES に達していれば割らず、状態を変えない', () => {
    const s = filled(activeState());
    const t = say(s, '#5 できなかった 大きすぎた');
    expect(t.text).toContain('大きくなりすぎ');
    expect(t.state?.nodes).toEqual(s.nodes);
  });
  it('完了より先に「できなかった」を読む (「完了できなかった」を完了にしない)', () => {
    const t = say(activeState(), '#4 完了できなかった');
    expect(node(t.state, 4)?.done).toBe(false);
  });
  it('splitParts / splitMinutes: 全範囲で、合計一致・最小以上・最大以下・割る数の上限を守る', () => {
    expect(splitParts(MIN_SPLIT_MINUTES * 2 - 1)).toBeNull();
    expect(splitParts(MIN_SPLIT_MINUTES * 2)).toBe(2);
    for (let m = MIN_SPLIT_MINUTES * 2; m <= MAX_TASK_MINUTES; m += 1) {
      const n = splitParts(m) as number;
      expect(n).toBeLessThanOrEqual(MAX_SPLIT_PARTS);
      for (const cause of ['large', 'time', 'start'] as const) {
        const mins = splitMinutes(m, n, cause);
        expect(mins.reduce((a, b) => a + b, 0), `${m}/${cause}`).toBe(m);
        expect(mins, `${m}/${cause}`).toHaveLength(n);
        for (const x of mins) {
          expect(x).toBeGreaterThanOrEqual(MIN_SPLIT_MINUTES);
          expect(x).toBeLessThanOrEqual(MAX_TASK_MINUTES);
        }
      }
    }
  });
});

describe('ゴールコーチ: 新しい言い回しも安全の門の後ろ (isSafeForCoach)', () => {
  it('新しいコマンドでも、危機・感情の言葉が同居すれば渡さない', () => {
    for (const w of ['目標を変える: 死にたい', '#4 できなかった つらい', '期限を変える: 消えたい', '#4 習慣にする 不安です']) {
      expect(isSafeForCoach(w, EMOTION_MARKERS), w).toBe(false);
    }
    for (const w of ['目標を変える: 月の売上を 150 万円にする', '期限を変える: 半年後', '#4 できなかった 大きすぎた', '今週の振り返り', '#4 優先度を上げて']) {
      expect(isSafeForCoach(w, EMOTION_MARKERS), w).toBe(true);
    }
  });
});

describe('ゴールコーチ: 保存値の読み (新しい欄)', () => {
  const withNew = (): CoachState => {
    let s = activeState();
    s = say(s, '#5 優先度を上げて').state as CoachState;
    s = say(s, '#6 毎週やる').state as CoachState;
    s = say(s, '#7 完了').state as CoachState;
    return say(s, '#9 できなかった').state as CoachState;
  };
  const ser = (s: CoachState): Record<string, unknown> => JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
  const patchNode = (s: CoachState, id: number, patch: Record<string, unknown>): unknown => {
    const o = ser(s) as { nodes: Record<string, unknown>[] };
    return { ...o, nodes: o.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
  };

  it('新しい欄 (priority / repeat / doneOn / splitFor) は往復して同じ状態になる', () => {
    const s = withNew();
    expect(node(s, 5)?.priority).toBe(1);
    expect(node(s, 6)?.repeat).toBe('weekly');
    expect(node(s, 7)?.doneOn).toBe(TODAY);
    expect(s.splitFor).toBe(9);
    expect(sanitizeCoachState(ser(s))).toEqual(s);
  });
  it('古い保存値 (新しい欄が無い) はそのまま読め、新しい欄を生やさない', () => {
    const old = JSON.parse(
      '{"v":1,"phase":"active","persona":"owner","answers":{"goal":"売上"},"startedOn":"2026-10-26","nextId":4,"nodes":[' +
        '{"id":1,"parent":null,"kind":"purpose","title":"目的","due":null,"minutes":0,"done":false},' +
        '{"id":2,"parent":1,"kind":"goal","title":"売上","due":"2027-01-31","minutes":0,"done":false},' +
        '{"id":3,"parent":2,"kind":"task","title":"一覧にする","due":"2027-01-31","minutes":30,"done":true}]}',
    );
    const s = sanitizeCoachState(old);
    expect(s?.nodes).toHaveLength(3);
    expect(s?.splitFor).toBeUndefined();
    for (const n of s?.nodes ?? []) {
      expect('priority' in n || 'repeat' in n || 'doneOn' in n).toBe(false);
    }
  });
  it.each<[string, (s: CoachState) => unknown]>([
    ['priority が幅の外', (s) => patchNode(s, 5, { priority: MAX_PRIORITY + 1 })],
    ['priority が整数でない', (s) => patchNode(s, 5, { priority: 1.5 })],
    ['priority が文字列', (s) => patchNode(s, 5, { priority: '1' })],
    ['repeat が未知', (s) => patchNode(s, 6, { repeat: 'monthly' })],
    ['doneOn が暦に無い', (s) => patchNode(s, 7, { doneOn: '2026-02-30' })],
    ['完了済みの習慣', (s) => patchNode(s, 6, { done: true })],
    ['タスクでない節点の repeat', (s) => patchNode(s, 3, { repeat: 'daily' })],
    ['タスクでない節点の priority', (s) => patchNode(s, 3, { priority: 1 })],
    ['splitFor が存在しない番号', (s) => ({ ...ser(s), splitFor: 999 })],
    ['splitFor が数でない', (s) => ({ ...ser(s), splitFor: '8' })],
    ['splitFor が完了済みのタスク', (s) => ({ ...ser(s), splitFor: 7 })],
    ['splitFor が習慣', (s) => ({ ...ser(s), splitFor: 6 })],
    ['splitFor がタスクでない', (s) => ({ ...ser(s), splitFor: 3 })],
  ])('読めない新しい欄 (%s) は null (黙って別の値にしない)', (_n, make) => {
    expect(sanitizeCoachState(make(withNew()))).toBeNull();
  });
  it('習慣が MAX_HABITS を超える保存値は読まない', () => {
    const s = activeState();
    const ids = tasksOf(s).map((n) => n.id).slice(0, MAX_HABITS + 1);
    const raw = { ...ser(s), nodes: (ser(s) as { nodes: Record<string, unknown>[] }).nodes.map((n) => (ids.includes(n.id as number) ? { ...n, repeat: 'daily' } : n)) };
    expect(sanitizeCoachState(raw)).toBeNull();
  });
  it('割った後・習慣にした後・作り直した後の状態はすべて保存値として読み戻せる', () => {
    let s = activeState();
    for (const w of ['#5 できなかった 大きすぎた', '#9 習慣にする', '#10 優先度を上げて', '期限を変える: 半年後', '#4 完了', '今週の振り返り']) {
      s = say(s, w).state as CoachState;
      consistent(s);
    }
  });
});
