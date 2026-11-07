import { describe, expect, it } from 'vitest';
import { MAX_DSL_NODES, MAX_DSL_TASK_MINUTES, MAX_DSL_TITLE_CHARS, parseGoalDsl, serializeGoalDsl, type GoalDslDoc, type GoalDslItem } from '../goalDsl';
import { fromCoachState, toCoachState } from '../goalDslCoach';
import { MAX_NODES, MAX_TASK_MINUTES, PERSONAS, buildTree, newCoachState, sanitizeCoachState, type CoachState, type GoalNode } from '../goalCoach';

const TODAY = '2026-10-26';

const item = (kind: GoalDslItem['kind'], title: string, o: Partial<GoalDslItem> = {}): GoalDslItem => ({ kind, title, due: null, minutes: null, done: false, children: [], ...o });

function built(personaIdx: number, answers: Partial<Record<'goal' | 'why' | 'due' | 'hours' | 'measure' | 'blocker', string>>): CoachState {
  const persona = PERSONAS[personaIdx];
  if (persona === undefined) throw new Error('persona');
  return buildTree({ ...newCoachState(TODAY), phase: 'review', persona: persona.id, answers }, TODAY);
}

function roundTrip(state: CoachState): { text: string; back: CoachState } {
  const from = fromCoachState(state);
  if (!from.ok) throw new Error(JSON.stringify(from.errors));
  expect(from.notes).toEqual([]);
  const text = serializeGoalDsl(from.doc);
  const parsed = parseGoalDsl(text);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  expect(parsed.doc).toEqual(from.doc);
  const to = toCoachState(parsed.doc, TODAY);
  if (!to.ok) throw new Error(JSON.stringify(to.errors));
  expect(to.dropped).toEqual([]);
  return { text, back: to.state };
}

const ANSWERS = [
  { goal: '月の売上を 100 万円にする', why: '家族を安心させたいから', due: '2027-01-31', hours: '1時間', measure: '月次売上が 100 万円を超えること', blocker: '営業の時間が取れない' },
  { goal: '資格を取る', why: '転職したい', due: '2027-06-30', blocker: 'なし' },
  { goal: '', why: '' },
  { goal: '絵文字 😀 を含む目標 𠮟', why: '全角：コロン # 記号', due: '2026-10-30', blocker: '「引用」と: コロン' },
] as const;

describe('ゴール DSL ↔ ゴールコーチの状態', () => {
  it('天井の定数がゴールコーチの保存する長さと同じ (題名 160・項目 200・タスク 45 分)', () => {
    const s = sanitizeCoachState({
      v: 1,
      phase: 'active',
      persona: null,
      answers: {},
      startedOn: TODAY,
      nodes: [{ id: 1, parent: null, kind: 'goal', title: 'あ'.repeat(MAX_DSL_TITLE_CHARS + 50), due: null, minutes: 0, done: false }],
      nextId: 2,
    });
    expect(Array.from(s?.nodes[0]?.title ?? '')).toHaveLength(MAX_DSL_TITLE_CHARS);
    expect(MAX_DSL_NODES).toBe(MAX_NODES);
    expect(MAX_DSL_TASK_MINUTES).toBe(MAX_TASK_MINUTES);
  });

  describe.each(PERSONAS.map((p, i) => [p.id, i] as const))('%s', (_id, idx) => {
    it.each(ANSWERS.map((a, i) => [i, a] as const))('buildTree の木 (答え %i) が DSL を経由してノード列ごと戻る', (_i, answers) => {
      const state = built(idx, answers);
      const { text, back } = roundTrip(state);
      expect(back.nodes).toEqual(state.nodes);
      expect(back.nextId).toBe(state.nextId);
      expect(back.startedOn).toBe(TODAY);
      expect(sanitizeCoachState(back)).toEqual(back);
      // 木の形: 行の数 = ノード数・先頭は目的・タスクは分数つき
      expect(text.trimEnd().split('\n')).toHaveLength(state.nodes.length);
      expect(text.startsWith('目的: ')).toBe(true);
    });
  });

  it('コーチの木の見た目 (種類・入れ子・期限・分数・済み) を文にする', () => {
    const state = built(0, ANSWERS[0]);
    const done: CoachState = { ...state, nodes: state.nodes.map((n) => (n.kind === 'task' && n.id === 5 ? { ...n, done: true } : n)) };
    const from = fromCoachState(done);
    expect(from.ok).toBe(true);
    if (!from.ok) return;
    const lines = serializeGoalDsl(from.doc).trimEnd().split('\n');
    expect(lines[0]).toBe('目的: 家族を安心させたいから');
    expect(lines[1]).toBe(`  目標 ${state.nodes[1]?.due}: 月の売上を 100 万円にする`);
    expect(lines[2]).toMatch(/^ {4}節目 \S+: /);
    expect(lines.filter((l) => l.trimStart().startsWith('タスク ')).every((l) => /^ {6}タスク \S+ \d+分( 済)?: /.test(l))).toBe(true);
    expect(lines.filter((l) => l.endsWith(' 済') || l.includes(' 済:'))).toHaveLength(1);
    const back = toCoachState(from.doc, TODAY);
    expect(back.ok && back.state.nodes).toEqual(done.nodes);
  });

  it('期日を持つ・持たない / 済み / 分数 0 (見積なし) を保つ', () => {
    const nodes: GoalNode[] = [
      { id: 1, parent: null, kind: 'purpose', title: '目的', due: null, minutes: 0, done: false },
      { id: 2, parent: 1, kind: 'goal', title: '目標', due: '2028-02-29', minutes: 0, done: true },
      { id: 3, parent: 2, kind: 'milestone', title: '節目', due: null, minutes: 0, done: false },
      { id: 4, parent: 3, kind: 'task', title: '分数なし', due: null, minutes: 0, done: false },
      { id: 5, parent: 3, kind: 'task', title: '分数あり', due: '2028-02-29', minutes: 45, done: true },
      { id: 6, parent: 2, kind: 'task', title: '目標直下', due: null, minutes: 1, done: false },
    ];
    const state: CoachState = { v: 1, phase: 'active', persona: null, answers: {}, startedOn: TODAY, nodes, nextId: 7 };
    const { back } = roundTrip(state);
    expect(back.nodes).toEqual(nodes);
  });

  it('id は先行順の連番に振り直され、木の形・期限・分数は変わらない (兄弟の順も)', () => {
    // 追加で後から足されたタスクのように、id の順と木の順が一致しない状態
    const nodes: GoalNode[] = [
      { id: 10, parent: null, kind: 'purpose', title: 'P', due: null, minutes: 0, done: false },
      { id: 30, parent: 20, kind: 'task', title: '後から足した', due: '2027-03-01', minutes: 30, done: false },
      { id: 20, parent: 10, kind: 'goal', title: 'G', due: '2027-03-01', minutes: 0, done: false },
    ];
    const state: CoachState = { v: 1, phase: 'active', persona: null, answers: {}, startedOn: TODAY, nodes, nextId: 31 };
    const from = fromCoachState(state);
    expect(from.ok).toBe(true);
    if (!from.ok) return;
    expect(from.notes).toEqual([]);
    const back = toCoachState(from.doc, TODAY);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.state.nodes).toEqual([
      { id: 1, parent: null, kind: 'purpose', title: 'P', due: null, minutes: 0, done: false },
      { id: 2, parent: 1, kind: 'goal', title: 'G', due: '2027-03-01', minutes: 0, done: false },
      { id: 3, parent: 2, kind: 'task', title: '後から足した', due: '2027-03-01', minutes: 30, done: false },
    ]);
    expect(back.state.nextId).toBe(4);
  });

  describe('toCoachState', () => {
    it('予定はコーチの木に載らないので捨て、行番号つきの理由を返す (残りは詰めて振る)', () => {
      const doc = parseGoalDsl('目的: P\n  予定 2027-01-05 60分: 打合せ\n  目標: G\n    タスク 5分: T\n');
      if (!doc.ok) throw new Error('parse');
      const r = toCoachState(doc.doc, TODAY);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.dropped).toHaveLength(1);
      expect(r.dropped[0]).toContain('行 2');
      expect(r.dropped[0]).toContain('打合せ');
      expect(r.state.nodes.map((n) => [n.id, n.parent, n.kind])).toEqual([
        [1, null, 'purpose'],
        [2, 1, 'goal'],
        [3, 2, 'task'],
      ]);
      expect(r.state.phase).toBe('active');
      expect(r.state.persona).toBeNull();
      expect(r.state.answers).toEqual({});
      expect(r.state.startedOn).toBe(TODAY);
      expect(r.state.nextId).toBe(4);
    });

    it('木が空・予定だけなら phase は persona (始めからやり直す側)', () => {
      const r = toCoachState({ items: [] }, TODAY);
      expect(r.ok && r.state.phase).toBe('persona');
      const e = toCoachState({ items: [item('event', 'e', { due: '2027-01-05' })] }, TODAY);
      expect(e.ok && e.state.nodes).toEqual([]);
      expect(e.ok && e.dropped).toHaveLength(1);
    });

    it('題名の空白の連なりは 1 つにまとめられる (コーチの保存と同じ)。そのことを言う', () => {
      const r = toCoachState({ items: [item('goal', 'あ   い')] }, TODAY);
      expect(r.ok && r.state.nodes[0]?.title).toBe('あ い');
      expect(r.ok && r.dropped).toEqual(['行 1 の題名の空白の連なりを 1 つにまとめました']);
    });

    it('検査に通らない木・今日が読めない・天井超えは状態を返さず断る', () => {
      expect(toCoachState({ items: [item('task', 't', { minutes: MAX_DSL_TASK_MINUTES + 1 })] }, TODAY).ok).toBe(false);
      expect(toCoachState({ items: [item('goal', 'g', { due: '2027-02-29' })] }, TODAY).ok).toBe(false);
      expect(toCoachState({ items: [item('task', 't', { children: [item('task', 'u')] })] }, TODAY).ok).toBe(false);
      const bad = toCoachState({ items: [] }, '2026-02-30');
      expect(bad).toEqual({ ok: false, errors: [{ line: 0, message: '今日の日付が暦に在る YYYY-MM-DD ではありません' }] });
      const many: GoalDslDoc = { items: Array.from({ length: MAX_DSL_NODES + 1 }, (_v, i) => item('goal', `g${i}`)) };
      const r = toCoachState(many, TODAY);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.some((e) => e.message.includes('項目が多すぎます'))).toBe(true);
      expect(toCoachState({ items: Array.from({ length: MAX_DSL_NODES }, (_v, i) => item('goal', `g${i}`)) }, TODAY).ok).toBe(true);
    });

    it('返す状態は必ず sanitizeCoachState を通る (通る状態だけを返す)', () => {
      const doc = parseGoalDsl(serializeGoalDsl({ items: [item('purpose', 'P', { children: [item('goal', 'G', { due: '2027-01-01', children: [item('task', 'T', { minutes: 45, done: true })] })] })] }));
      if (!doc.ok) throw new Error('parse');
      const r = toCoachState(doc.doc, TODAY);
      expect(r.ok && sanitizeCoachState(JSON.parse(JSON.stringify(r.state)))).toEqual(r.ok ? r.state : null);
    });
  });

  describe('fromCoachState: 読めない状態は理由つきで直すか除く', () => {
    const base = (nodes: GoalNode[]): CoachState => ({ v: 1, phase: 'active', persona: null, answers: {}, startedOn: TODAY, nodes, nextId: 99 });
    const n = (id: number, parent: number | null, o: Partial<GoalNode> = {}): GoalNode => ({ id, parent, kind: 'goal', title: `n${id}`, due: null, minutes: 0, done: false, ...o });

    it('項目が MAX_DSL_NODES を超える状態は切らずに断る (ちょうどは通る)', () => {
      const mk = (c: number): CoachState => base(Array.from({ length: c }, (_v, i) => n(i + 1, null)));
      expect(fromCoachState(mk(MAX_DSL_NODES)).ok).toBe(true);
      const over = fromCoachState(mk(MAX_DSL_NODES + 1));
      expect(over).toEqual({ ok: false, errors: [{ line: 0, message: `項目が多すぎます (${MAX_DSL_NODES} 件まで)` }] });
    });

    it('親が見当たらない節は根として扱う / 重複 id は後の物を除く / 循環は除く', () => {
      const r = fromCoachState(base([n(1, null), n(2, 77), n(3, 3), n(4, 5), n(5, 4), n(1, null, { title: '重複' })]));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.doc.items.map((i) => i.title)).toEqual(['n1', 'n2', 'n3']);
      expect(r.notes.some((x) => x.includes('#1 が重複'))).toBe(true);
      expect(r.notes.some((x) => x.includes('#2 の親 #77'))).toBe(true);
      expect(r.notes.some((x) => x.includes('#4') && x.includes('循環'))).toBe(true);
      expect(r.notes.some((x) => x.includes('#5') && x.includes('循環'))).toBe(true);
    });

    it('タスクの下の項目は同じ階層へ移す (葉に子を書けない)', () => {
      const r = fromCoachState(base([n(1, null), n(2, 1, { kind: 'task', minutes: 10 }), n(3, 2, { kind: 'task', minutes: 5 }), n(4, 1, { kind: 'task', minutes: 5 })]));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.doc.items[0]?.children.map((c) => c.title)).toEqual(['n2', 'n3', 'n4']);
      expect(r.notes).toEqual(['#2 (タスク) の下の項目は同じ階層へ移しました']);
      expect(parseGoalDsl(serializeGoalDsl(r.doc)).ok).toBe(true);
    });

    it('入れ子が深すぎる枝は除く (理由つき)・書けない分数と期日は空にする (理由つき)', () => {
      const chain = Array.from({ length: 10 }, (_v, i) => n(i + 1, i === 0 ? null : i));
      const deep = fromCoachState(base(chain));
      expect(deep.ok && countItems(deep.doc)).toBe(8);
      expect(deep.ok && deep.notes.some((x) => x.includes('入れ子が深すぎる'))).toBe(true);
      const odd = fromCoachState(
        base([n(1, null, { due: '2027-02-29' }), n(2, 1, { kind: 'task', minutes: 46 }), n(3, 1, { kind: 'task', minutes: 1.5 }), n(4, 1, { kind: 'goal', minutes: 5 })]),
      );
      expect(odd.ok).toBe(true);
      if (!odd.ok) return;
      expect(odd.notes).toHaveLength(4);
      expect(odd.doc.items[0]?.due).toBeNull();
      expect(odd.doc.items[0]?.children.map((c) => c.minutes)).toEqual([null, null, null]);
    });

    it('題名の見えない字・改行は空白へ直し (理由つき)、空は (無題)、長すぎる題名は 160 字に収める', () => {
      const r = fromCoachState(base([n(1, null, { title: 'あ\u202e\nい' }), n(2, null, { title: '   ' }), n(3, null, { title: 'x'.repeat(500) })]));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.doc.items.map((i) => i.title)).toEqual(['あ い', '(無題)', 'x'.repeat(MAX_DSL_TITLE_CHARS)]);
      expect(r.notes).toHaveLength(3);
      expect(parseGoalDsl(serializeGoalDsl(r.doc)).ok).toBe(true);
    });

    it('知らない種類は除く', () => {
      const r = fromCoachState(base([n(1, null), n(2, null, { kind: 'bogus' as unknown as GoalNode['kind'] })]));
      expect(r.ok && r.doc.items).toHaveLength(1);
      expect(r.ok && r.notes).toEqual(['#2 の種類が読めないため除きました']);
    });
  });
});

function countItems(doc: GoalDslDoc): number {
  let c = 0;
  const walk = (xs: readonly GoalDslItem[]): void => {
    for (const x of xs) {
      c += 1;
      walk(x.children);
    }
  };
  walk(doc.items);
  return c;
}
