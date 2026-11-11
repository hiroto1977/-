import { describe, it, expect } from 'vitest';
import {
  buildChatterScenes,
  buildRequestFlow,
  flowCursor,
  sceneCursor,
  FLOW_END_HOLD_TICKS,
  FLOW_WAIT_CAP_TICKS,
  SCENE_LINE_TICKS,
  SCENE_LINES,
  SCENE_TICKS,
  TICK_WRAP,
  type RequestFlow,
} from '../villageScenes';
import type { Villager } from '../villageData';

function v(p: Partial<Villager> & Pick<Villager, 'id' | 'name' | 'kind'>): Villager {
  return { emoji: 'x', regionId: 'r', ...p };
}

const COO = v({ id: 'coo', name: 'COO', kind: 'coo' });
const CFO = v({ id: 'cfo', name: 'CFO', kind: 'executive', execId: 'cfo' });
const CSO = v({ id: 'cso', name: 'CSO', kind: 'executive', execId: 'cso' });
const M1 = v({ id: 'm1', name: '経理部長', kind: 'manager', execId: 'cfo', managerId: 'm1' });
const M2 = v({ id: 'm2', name: '営業部長', kind: 'manager', execId: 'cso', managerId: 'm2' });
const T1 = v({ id: 't1', name: '給与チーム', kind: 'team', execId: 'cfo', managerId: 'm1', domain: '給与', focus: '源泉' });
const T2 = v({ id: 't2', name: '請求チーム', kind: 'team', execId: 'cfo', managerId: 'm1' });
const T3 = v({ id: 't3', name: '販促チーム', kind: 'team', execId: 'cso', managerId: 'm2', domain: '販促', focus: '集客' });
const ALL = [COO, CFO, CSO, M1, M2, T1, T2, T3];

describe('buildChatterScenes — 台帳の関係から台本を組む', () => {
  it('総括 ↔ 役員・役員 ↔ 部長・部長 ↔ チームの 3 種が、街区をまたいで 1 本ずつ交互に並ぶ', () => {
    const ids = buildChatterScenes(ALL).map((s) => s.id);
    // 街区は登場順 (cfo → cso)。1 周目は各街区の先頭、2 周目は次…
    expect(ids).toEqual(['coo:cfo', 'coo:cso', 'cfo:m1', 'cso:m2', 'm1:t1', 'm2:t3', 'm1:t2']);
  });

  it('どの場面も 3 行で、話し手は a / b の交互 (a が先)', () => {
    for (const s of buildChatterScenes(ALL)) {
      expect(s.lines).toHaveLength(SCENE_LINES);
      expect(s.lines.map((l) => l.who)).toEqual(['a', 'b', 'a']);
      expect(s.a).not.toBe(s.b);
    }
  });

  it('部長 ↔ チーム: 重点と領域があれば台詞に入り、無ければ一般の言い回しになる (台帳に無い事は言わない)', () => {
    const scenes = buildChatterScenes(ALL);
    const withFacts = scenes.find((s) => s.id === 'm1:t1')!;
    expect(withFacts.a).toBe('m1');
    expect(withFacts.b).toBe('t1');
    expect(withFacts.lines.map((l) => l.text)).toEqual([
      '給与チームの重点は「源泉」だったね。',
      'はい、給与の担当として進めています。',
      '何かあればCFOにも相談しよう。',
    ]);
    const bare = scenes.find((s) => s.id === 'm1:t2')!;
    expect(bare.lines.map((l) => l.text)).toEqual([
      '請求チームの様子はどうだい？',
      'はい、持ち場で進めています。',
      '何かあればCFOにも相談しよう。',
    ]);
  });

  it('役員 ↔ 部長: 部長の下のチーム数を数えて言う。0 チームなら数を言わない', () => {
    const scenes = buildChatterScenes(ALL);
    const m1 = scenes.find((s) => s.id === 'cfo:m1')!;
    expect(m1.lines.map((l) => l.text)).toEqual([
      '経理部長の部は2チームを見ているね。',
      'はい、各チームの重点を見ながら調整しています。',
      '助かります。引き続きお願いします。',
    ]);
    const lonely = buildChatterScenes([COO, CFO, M1]).find((s) => s.id === 'cfo:m1')!;
    expect(lonely.lines[0]!.text).toBe('経理部長の部の様子を聞かせてください。');
  });

  it('総括 ↔ 役員: 総括が居なければ作らない', () => {
    const scenes = buildChatterScenes(ALL);
    expect(scenes.find((s) => s.id === 'coo:cfo')!.lines[0]!.text).toBe('CFO、街区で共有したいことはありますか？');
    expect(buildChatterScenes([CFO, M1, T1]).some((s) => s.a === 'coo')).toBe(false);
  });

  it('所属の相手が村に居ない村人は、台本を作らない (欠けた参照で落ちない)', () => {
    const orphan = v({ id: 'tx', name: '迷子チーム', kind: 'team', execId: 'cfo', managerId: 'nobody' });
    expect(buildChatterScenes([COO, CFO, orphan])).toHaveLength(1); // coo:cfo だけ
    const noExec = v({ id: 'ty', name: '無所属', kind: 'team', execId: 'ghost', managerId: 'm1' });
    expect(buildChatterScenes([COO, M1, noExec]).some((s) => s.b === 'ty')).toBe(false);
  });

  it('名前と重点は天井で切る (台帳が長い値を持っても景色を埋めない)', () => {
    const long = v({ id: 'tl', name: 'あ'.repeat(40), kind: 'team', execId: 'cfo', managerId: 'm1', focus: 'い'.repeat(60) });
    const scene = buildChatterScenes([COO, CFO, M1, long]).find((s) => s.id === 'm1:tl')!;
    expect(scene.lines[0]!.text).toBe(`${'あ'.repeat(24)}…の重点は「${'い'.repeat(32)}…」だったね。`);
  });

  it('重点・領域が空文字や非文字列のときも「台帳に無い」として一般の言い回しにする', () => {
    const blank = v({ id: 'tb', name: '空チーム', kind: 'team', execId: 'cfo', managerId: 'm1', focus: '', domain: '' });
    const odd = v({ id: 'to', name: '変チーム', kind: 'team', execId: 'cfo', managerId: 'm1', focus: 42 as unknown as string });
    const scenes = buildChatterScenes([COO, CFO, M1, blank, odd]);
    for (const id of ['m1:tb', 'm1:to']) {
      const texts = scenes.find((s) => s.id === id)!.lines.map((l) => l.text);
      expect(texts[0]).toMatch(/の様子はどうだい？$/);
      expect(texts[1]).toBe('はい、持ち場で進めています。');
    }
  });

  it('秘書・チーム以外の種類は、持ち場があっても台本を作らない', () => {
    const sec = v({ id: 'sec', name: '秘書', kind: 'secretary', execId: 'cfo' });
    const ids = buildChatterScenes([COO, CFO, sec]).map((s) => s.id);
    expect(ids).toEqual(['coo:cfo']);
  });

  it('総括は村人の並びの先頭に居なくても見つかる', () => {
    const ids = buildChatterScenes([CFO, M1, T1, COO]).map((s) => s.id);
    expect(ids).toContain('coo:cfo');
  });

  it('総括 ↔ 役員の台詞は 3 行とも決まった言い回し', () => {
    const lines = buildChatterScenes(ALL).find((s) => s.id === 'coo:cfo')!.lines.map((l) => l.text);
    expect(lines).toEqual([
      'CFO、街区で共有したいことはありますか？',
      'はい、チームの重点を揃えて進めています。',
      '了解です。必要なら声をかけてください。',
    ]);
  });

  it('同じ入力は同じ台本 (乱数なし)', () => {
    expect(buildChatterScenes(ALL)).toEqual(buildChatterScenes(ALL));
  });
});

describe('sceneCursor — いまの tick で見せる行', () => {
  const scenes = buildChatterScenes(ALL);
  const everyone = new Set(ALL.map((x) => x.id));

  it('1 行は SCENE_LINE_TICKS 刻み・3 行のあと間 (台詞なし)・次の場面へ', () => {
    expect(SCENE_TICKS).toBe(11);
    const at = (t: number) => sceneCursor(scenes, everyone, t)!;
    expect(at(0).scene.id).toBe(scenes[0]!.id);
    expect([0, 2].map((t) => at(t).lineIndex)).toEqual([0, 0]);
    expect([3, 5].map((t) => at(t).lineIndex)).toEqual([1, 1]);
    expect([6, 8].map((t) => at(t).lineIndex)).toEqual([2, 2]);
    expect([9, 10].map((t) => at(t).lineIndex)).toEqual([null, null]);
    expect(at(11).scene.id).toBe(scenes[1]!.id);
    expect(at(11).lineIndex).toBe(0);
    expect(SCENE_LINE_TICKS).toBe(3);
  });

  it('鍵は同じ行の間は変わらず、行や場面が変わると変わる', () => {
    const k = (t: number) => sceneCursor(scenes, everyone, t)!.key;
    expect(k(0)).toBe(k(2));
    expect(k(2)).not.toBe(k(3));
    expect(k(9)).toBe(k(10));
    expect(k(10)).not.toBe(k(11));
    expect(k(9)).toBe(`${scenes[0]!.id}#gap`);
    expect(k(0)).toBe(`${scenes[0]!.id}#0`);
  });

  it('場面の数だけ進むと最初へ戻る', () => {
    expect(sceneCursor(scenes, everyone, SCENE_TICKS * scenes.length)!.scene.id).toBe(scenes[0]!.id);
    expect(sceneCursor(scenes, everyone, SCENE_TICKS * scenes.length + SCENE_TICKS)!.scene.id).toBe(scenes[1]!.id);
  });

  it('2 人とも居る場面だけを数える (片方が景色に居なければ飛ばす)', () => {
    const without = new Set(everyone);
    without.delete('t1');
    const ids = new Set<string>();
    for (let t = 0; t < SCENE_TICKS * scenes.length; t += SCENE_TICKS) ids.add(sceneCursor(scenes, without, t)!.scene.id);
    expect(ids.has('m1:t1')).toBe(false);
    expect(ids.size).toBe(scenes.length - 1);
  });

  it('★ 揃う場面の数が変わっても、いま見せている場面は動かない (途中で別の掛け合いへ飛ばない)', () => {
    for (let slot = 0; slot < scenes.length; slot += 1) {
      const t = slot * SCENE_TICKS + 4; // 場面の途中
      const before = sceneCursor(scenes, everyone, t)!;
      for (const v of ALL) {
        if (v.id === before.scene.a || v.id === before.scene.b) continue;
        const fewer = new Set(everyone);
        fewer.delete(v.id);
        const after = sceneCursor(scenes, fewer, t)!;
        expect(after.key, `${v.id} が居なくなっただけで場面 ${before.scene.id} が飛んだ`).toBe(before.key);
      }
    }
  });

  it('★ tick が一周する境目は場面の切れ目に当たる (一周のたびに場面が途中で切れない)', () => {
    expect(TICK_WRAP % SCENE_TICKS).toBe(0);
    expect(TICK_WRAP).toBeLessThanOrEqual(100000);
    expect(TICK_WRAP).toBeGreaterThan(100000 - SCENE_TICKS);
    const last = sceneCursor(scenes, everyone, TICK_WRAP - 1)!;
    const first = sceneCursor(scenes, everyone, 0)!;
    expect(last.lineIndex, '一周の直前が場面の最後の間ではない').toBeNull();
    expect(first.lineIndex).toBe(0);
  });

  it('見せられる場面が 1 本も無ければ null', () => {
    expect(sceneCursor(scenes, new Set(), 0)).toBeNull();
    expect(sceneCursor([], everyone, 0)).toBeNull();
    expect(sceneCursor(scenes, new Set(['coo']), 5)).toBeNull();
  });
});

describe('buildRequestFlow — 話題が担当へ渡る流れ', () => {
  it('総括 → 役員 → 部長 → チームの順に渡し、最後の担当が作業に入る', () => {
    const f = buildRequestFlow(ALL, { executiveId: 'cfo', managerId: 'm1', teamId: 't1' }, 'ふるさと納税の相談')!;
    expect(f.stages.map((s) => [s.label, s.speakerId, s.listenerId])).toEqual([
      ['受付', 'coo', 'cfo'],
      ['割り当て', 'coo', 'cfo'],
      ['割り当て', 'cfo', 'm1'],
      ['割り当て', 'm1', 't1'],
      ['作業中', 't1', undefined],
    ]);
    expect(f.stages.map((s) => s.text)).toEqual([
      '「ふるさと納税の相談」を受け付けました。',
      'CFO、「ふるさと納税の相談」をお願いします。',
      '経理部長、「ふるさと納税の相談」をお願いします。',
      '給与チーム、「ふるさと納税の相談」をお願いします。',
      '給与チームが取りかかります。',
    ]);
    expect(f.done).toEqual({ speakerId: 't1', label: '完了', text: '回答を出しました。' });
    expect(f.failed).toEqual({ speakerId: 't1', label: '失敗', text: 'うまくいきませんでした。' });
  });

  it('担当が見つからなければ総括が自分で受ける', () => {
    const f = buildRequestFlow(ALL, {}, 'こんにちは')!;
    expect(f.stages.map((s) => [s.label, s.speakerId, s.listenerId])).toEqual([
      ['受付', 'coo', undefined],
      ['作業中', 'coo', undefined],
    ]);
    expect(f.stages[1]!.text).toBe('COOが取りかかります。');
  });

  it('村に居ない担当・総括自身・重複は飛ばす', () => {
    const f = buildRequestFlow(ALL, { executiveId: 'coo', managerId: 'ghost', teamId: 't1' }, 'x')!;
    expect(f.stages.map((s) => s.speakerId)).toEqual(['coo', 'coo', 't1']);
    expect(f.stages.map((s) => s.listenerId)).toEqual(['t1', 't1', undefined]);
  });

  it('総括が村に居なければ流れを作らない', () => {
    expect(buildRequestFlow([CFO, M1], { executiveId: 'cfo' }, 'x')).toBeNull();
  });

  it('話題は 1 行に畳み、16 字で切る', () => {
    const f = buildRequestFlow(ALL, {}, '1行目\n\n  2行目\t3行目')!;
    expect(f.stages[0]!.text).toBe('「1行目 2行目 3行目」を受け付けました。');
    const long = buildRequestFlow(ALL, {}, 'あ'.repeat(20))!;
    expect(long.stages[0]!.text).toBe(`「${'あ'.repeat(16)}…」を受け付けました。`);
  });

  it('作業の文面は呼び手が差し替えられる (会話で頼んだ実行の流れ用)', () => {
    const f = buildRequestFlow(ALL, { teamId: 't1' }, 'x', { text: '実行中', doneText: '済み', failedText: 'ダメ' })!;
    expect(f.stages[f.stages.length - 1]!.text).toBe('実行中');
    expect(f.done.text).toBe('済み');
    expect(f.failed.text).toBe('ダメ');
    const half = buildRequestFlow(ALL, { teamId: 't1' }, 'x', { text: '実行中' })!;
    expect(half.done.text).toBe('回答を出しました。');
    expect(half.failed.text).toBe('うまくいきませんでした。');
  });
});

describe('flowCursor — 流れの位置', () => {
  const flow = buildRequestFlow(ALL, { executiveId: 'cfo', managerId: 'm1', teamId: 't1' }, 't') as RequestFlow;
  const N = flow.stages.length; // 5

  it('結果が無いあいだ: 受付から作業中まで順に進み、作業中で待つ', () => {
    const c0 = flowCursor(flow, 0, null);
    expect([c0.index, c0.phase, c0.waiting, c0.finished, c0.key]).toEqual([0, 'relay', false, false, 'flow#0']);
    const c3 = flowCursor(flow, 3, null);
    expect([c3.index, c3.phase, c3.waiting]).toEqual([3, 'relay', false]);
    expect(c3.stage).toBe(flow.stages[3]);
    const c4 = flowCursor(flow, N - 1, null);
    expect([c4.index, c4.phase, c4.waiting, c4.finished, c4.key]).toEqual([4, 'work', true, false, 'flow#4w']);
    const c30 = flowCursor(flow, 30, null);
    expect([c30.index, c30.waiting, c30.finished]).toEqual([4, true, false]);
  });

  it('結果が来ないまま上限を過ぎたら畳む (終わったと偽らない)', () => {
    expect(flowCursor(flow, N + FLOW_WAIT_CAP_TICKS - 1, null).finished).toBe(false);
    const over = flowCursor(flow, N + FLOW_WAIT_CAP_TICKS, null);
    expect(over.finished).toBe(true);
    expect(over.waiting).toBe(true);
    expect(over.phase).toBe('work');
    expect(over.index).toBe(N - 1);
    expect(over.stage).toBe(flow.stages[N - 1]);
  });

  it('結果が来たら完了 / 失敗の段へ移り、少し見せてから畳む', () => {
    const done = { kind: 'done', atElapsed: 20 } as const;
    const c = flowCursor(flow, 20, done);
    expect([c.phase, c.index, c.waiting, c.finished, c.key]).toEqual(['end', N, false, false, 'flow#end-done']);
    expect(c.stage).toBe(flow.done);
    expect(flowCursor(flow, 20 + FLOW_END_HOLD_TICKS - 1, done).finished).toBe(false);
    expect(flowCursor(flow, 20 + FLOW_END_HOLD_TICKS, done).finished).toBe(true);
    const failed = flowCursor(flow, 21, { kind: 'failed', atElapsed: 21 });
    expect(failed.stage).toBe(flow.failed);
    expect(failed.key).toBe('flow#end-failed');
  });

  it('答えが先に分かっている流れ (atElapsed = 0): 受付〜作業中を見せ切ってから完了へ', () => {
    const reply = { kind: 'done', atElapsed: 0 } as const;
    for (let t = 0; t < N - 1; t++) {
      const c = flowCursor(flow, t, reply);
      expect([c.index, c.phase, c.waiting]).toEqual([t, 'relay', false]);
    }
    const w = flowCursor(flow, N - 1, reply);
    expect([w.index, w.phase, w.waiting, w.key]).toEqual([N - 1, 'work', false, 'flow#4']);
    const end = flowCursor(flow, N, reply);
    expect([end.phase, end.finished]).toEqual(['end', false]);
    expect(flowCursor(flow, N + FLOW_END_HOLD_TICKS, reply).finished).toBe(true);
  });

  it('結果が作業中の途中で来ても、段を飛ばさずその時点の段から完了へ', () => {
    // 4 刻み目 (作業中の段) で結果が来た = 受付〜割り当てを見せ終えている。
    const late = { kind: 'done', atElapsed: N - 1 } as const;
    expect(flowCursor(flow, N - 1, late).phase).toBe('work');
    expect(flowCursor(flow, N, late).phase).toBe('end');
  });
});
