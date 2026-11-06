import { describe, expect, it } from 'vitest';
import { LEVER_STEPS } from '../kpiImprovementLoop';
import {
  IMPROVEMENT_KINDS,
  KPI_IMPROVEMENT_COLLECTION,
  LEVER_IDS,
  improvementState,
  parseCycle,
  parseGoal,
  type ImprovementRecord,
} from '../kpiImprovementStore';
import type { StoredRecord } from '../store';

const rec = (data: ImprovementRecord, createdAt = 1, id = `r${createdAt}`): StoredRecord<ImprovementRecord> => ({
  id,
  collection: KPI_IMPROVEMENT_COLLECTION,
  createdAt,
  updatedAt: createdAt,
  data,
});
const cycleData = (o: Partial<ImprovementRecord> = {}): ImprovementRecord => ({
  kind: 'cycle',
  leverId: 'sga',
  expectedGainPt: 1.5,
  beforePeriod: '2026-04',
  afterPeriod: '2026-05',
  ...o,
});

describe('台帳', () => {
  it('collection 名と種類・打ち手の一覧', () => {
    expect(KPI_IMPROVEMENT_COLLECTION).toBe('kpi-improvement-cycles');
    expect(IMPROVEMENT_KINDS).toEqual(['goal', 'cycle']);
    expect([...LEVER_IDS].sort()).toEqual(Object.keys(LEVER_STEPS).sort());
  });
});

describe('parseGoal: 目標の営業利益率', () => {
  it('画面と同じ読みで数にする (カンマ・全角・%)', () => {
    expect(parseGoal({ targetMarginPct: '20' })).toEqual({ kind: 'goal', targetMarginPct: 20 });
    expect(parseGoal({ targetMarginPct: '１５.５' }).targetMarginPct).toBe(15.5);
    expect(parseGoal({ targetMarginPct: 12 }).targetMarginPct).toBe(12);
  });

  it('空欄は未入力として断り、0 にしない', () => {
    for (const blank of [undefined, null, '', '  ']) {
      expect(() => parseGoal({ targetMarginPct: blank })).toThrow(new Error('目標の営業利益率が未入力です'));
    }
  });

  it('0 以下・100 以上・読めない値は幅の文で断る (境界の外側)', () => {
    const msg = new Error('目標の営業利益率は 0% より大きく 100% 未満の数で入力してください');
    for (const bad of ['0', 0, '-5', '100', 100, '101', 'abc', '1e3', true, {}]) {
      expect(() => parseGoal({ targetMarginPct: bad })).toThrow(msg);
    }
    expect(parseGoal({ targetMarginPct: '99.9' }).targetMarginPct).toBe(99.9);
    expect(parseGoal({ targetMarginPct: '0.1' }).targetMarginPct).toBe(0.1);
  });
});

describe('parseCycle: 選んだ打ち手の記録', () => {
  const ok = { leverId: 'cogs', expectedGainPt: 1.2, beforePeriod: '2026-04', afterPeriod: '2026-05' };

  it('正しい入力はそのまま記録の形になる', () => {
    expect(parseCycle(ok)).toEqual({ kind: 'cycle', ...ok });
  });

  it('一覧に無い打ち手・文字列でない打ち手は断る', () => {
    for (const bad of [undefined, '', 'nope', 'toString', 42, null]) {
      expect(() => parseCycle({ ...ok, leverId: bad })).toThrow(new Error('打ち手が選ばれていません'));
    }
  });

  it('見込みは正の有限な数だけ (文字列の数も断る)', () => {
    const msg = new Error('見込みの利益率の増分は 0 より大きい数にしてください');
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '1.5', undefined]) {
      expect(() => parseCycle({ ...ok, expectedGainPt: bad })).toThrow(msg);
    }
  });

  it('月は YYYY-MM だけ', () => {
    const msg = new Error('月は YYYY-MM 形式にしてください');
    expect(() => parseCycle({ ...ok, beforePeriod: '2026-4' })).toThrow(msg);
    expect(() => parseCycle({ ...ok, afterPeriod: 'bad' })).toThrow(msg);
    expect(() => parseCycle({ ...ok, beforePeriod: 202604 })).toThrow(msg);
  });

  it('検証する月は選んだ月より後 (同じ月も断る)', () => {
    const msg = new Error('検証する月は、打ち手を選んだ月より後にしてください');
    expect(() => parseCycle({ ...ok, afterPeriod: '2026-04' })).toThrow(msg);
    expect(() => parseCycle({ ...ok, afterPeriod: '2026-03' })).toThrow(msg);
    expect(parseCycle({ ...ok, afterPeriod: '2027-01' }).afterPeriod).toBe('2027-01');
  });
});

describe('improvementState: 保管した行から読む', () => {
  it('行が無ければ目標なし・記録なし', () => {
    expect(improvementState([])).toEqual({ targetMarginPct: null, cycles: [], unreadableIds: [] });
  });

  it('目標は最新の作成の 1 件 (同時刻なら後に並んだ行)', () => {
    const s = improvementState([
      rec({ kind: 'goal', targetMarginPct: 10 }, 1),
      rec({ kind: 'goal', targetMarginPct: 30 }, 3),
      rec({ kind: 'goal', targetMarginPct: 20 }, 2),
    ]);
    expect(s.targetMarginPct).toBe(30);
    const same = improvementState([
      rec({ kind: 'goal', targetMarginPct: 10 }, 5, 'a'),
      rec({ kind: 'goal', targetMarginPct: 40 }, 5, 'b'),
    ]);
    expect(same.targetMarginPct).toBe(40);
  });

  it('読めない目標 (範囲外・非数) は採らず、読めない行として数える', () => {
    const s = improvementState([
      rec({ kind: 'goal', targetMarginPct: 150 }, 1),
      rec({ kind: 'goal', targetMarginPct: '20' as unknown as number }, 2),
      rec({ kind: 'goal' }, 3),
    ]);
    expect(s.targetMarginPct).toBeNull();
    expect(s.unreadableIds).toEqual(['r1', 'r2', 'r3']);
  });

  it('記録は選んだ月の昇順・同じ月は作成順で、中身をそのまま返す', () => {
    const s = improvementState([
      rec(cycleData({ leverId: 'cogs', beforePeriod: '2026-06', afterPeriod: '2026-07' }), 9),
      rec(cycleData({ leverId: 'sga' }), 5),
      rec(cycleData({ leverId: 'revenue' }), 2),
    ]);
    expect(s.cycles.map((c) => c.leverId)).toEqual(['revenue', 'sga', 'cogs']);
    expect(s.cycles[1]).toEqual({ leverId: 'sga', expectedGainPt: 1.5, beforePeriod: '2026-04', afterPeriod: '2026-05' });
    expect(s.unreadableIds).toEqual([]);
  });

  it('読めない記録 (打ち手・月・見込みの欠け / 逆順) は使わず数える', () => {
    const s = improvementState([
      rec(cycleData(), 1),
      rec(cycleData({ leverId: 'nope' as never }), 2),
      rec(cycleData({ beforePeriod: 'bad' }), 3),
      rec(cycleData({ expectedGainPt: undefined }), 4),
      rec(cycleData({ afterPeriod: '2026-01' }), 5),
      rec({ kind: 'other' } as never, 6),
    ]);
    expect(s.cycles).toHaveLength(1);
    expect(s.unreadableIds).toEqual(['r2', 'r3', 'r4', 'r5', 'r6']);
  });

  it('壊れた行があっても投げず、目標は別に読む', () => {
    const s = improvementState([rec({ kind: 'goal', targetMarginPct: 25 }, 1), rec(cycleData({ leverId: 7 as never }), 2)]);
    expect(s.targetMarginPct).toBe(25);
    expect(s.unreadableIds).toEqual(['r2']);
  });

  it('同じ打ち手を同じ月に 2 度選んだ行は 1 件に畳む (最初の行を残す)・別の月や別の打ち手は畳まない', () => {
    const s = improvementState([
      rec(cycleData({ expectedGainPt: 1 }), 1),
      rec(cycleData({ expectedGainPt: 9 }), 2),
      rec(cycleData({ beforePeriod: '2026-05', afterPeriod: '2026-06' }), 3),
      rec(cycleData({ leverId: 'cogs' }), 4),
    ]);
    expect(s.cycles).toHaveLength(3);
    expect(s.cycles.filter((c) => c.leverId === 'sga' && c.beforePeriod === '2026-04')[0]!.expectedGainPt).toBe(1);
    expect(s.unreadableIds).toEqual([]);
  });
});
