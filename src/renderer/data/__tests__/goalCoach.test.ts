import { describe, expect, it } from 'vitest';
import {
  COACH_ENTRY_MARKERS,
  MAX_ANSWER_CHARS,
  MAX_NODES,
  MAX_TASK_MINUTES,
  PERSONAS,
  QUESTIONS,
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
  renderTree,
  sanitizeCoachState,
  type CoachState,
  type CoachTurn,
} from '../goalCoach';
import { EMOTION_MARKERS } from '../chatbot';
import { isoDaysBetween } from '../../../shared/isoDate';
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
