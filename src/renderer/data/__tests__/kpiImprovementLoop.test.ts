import { describe, expect, it } from 'vitest';
import type { KpiActual } from '../kpiActuals';
import {
  HIT_RATIO,
  LEVER_ASSUMPTION_NOTE,
  LEVER_STEPS,
  MAX_CONSECUTIVE_MISSES,
  PARTIAL_RATIO,
  candidateLevers,
  VERDICT_LABEL,
  judgeCycle,
  nextPeriod,
  judgeCycles,
  monthSnapshots,
  nextStep,
  type CycleRecord,
  type LeverId,
} from '../kpiImprovementLoop';

/*
 * 月次KPI改善の輪の判断の核。基準の月は 売上 1,000,000 / 原価 400,000 / 広告 100,000 /
 * 販管費 300,000 / 減価償却 50,000 → 限界利益 500,000・固定費 350,000・営業利益 150,000 (15%)。
 * 手で計算した値を期待値にする (実装の式を写さない)。
 */

const row = (period: string, o: Partial<KpiActual> = {}): KpiActual => ({
  period,
  unit: '全社',
  revenue: 1_000_000,
  cogs: 400_000,
  advertising: 100_000,
  sga: 300_000,
  depreciation: 50_000,
  ...o,
});

describe('monthSnapshots: 月次の合算', () => {
  it('事業ごとの行を期ごとに合算し、期の昇順で返す', () => {
    const { snapshots, dropped } = monthSnapshots([
      row('2026-02', { unit: 'A' }),
      row('2026-01'),
      row('2026-02', { unit: 'B' }),
    ]);
    expect(dropped).toBe(0);
    expect(snapshots.map((s) => s.period)).toEqual(['2026-01', '2026-02']);
    expect(snapshots[0]).toMatchObject({ revenue: 1_000_000, operatingProfit: 150_000, marginPct: 15 });
    // 2 事業ぶんを合算しても利益率は同じ 15%、金額は 2 倍
    expect(snapshots[1]).toMatchObject({ revenue: 2_000_000, operatingProfit: 300_000, marginPct: 15 });
  });

  it('読めない行 (期・金額) は除き、件数を返す', () => {
    const bad = { ...row('2026-03'), revenue: '9000000' } as unknown as KpiActual;
    const { snapshots, dropped } = monthSnapshots([row('2026-01'), row('bad'), bad]);
    expect(dropped).toBe(2);
    expect(snapshots.map((s) => s.period)).toEqual(['2026-01']);
  });

  it('売上 0 の月は営業利益率を 0 にせず null (算定不能) にする', () => {
    const { snapshots } = monthSnapshots([row('2026-01', { revenue: 0 })]);
    expect(snapshots[0]!.marginPct).toBeNull();
  });
});

describe('candidateLevers: 打ち手の試算', () => {
  const base = monthSnapshots([row('2026-01')]).snapshots[0]!.fundamentals;

  it('営業利益の増分が大きい順に並ぶ (手計算)', () => {
    const levers = candidateLevers(base);
    expect(levers.map((l) => l.id)).toEqual(['revenue', 'sga', 'cogs', 'advertising']);
    const gain = (id: LeverId) => levers.find((l) => l.id === id)!;
    expect(gain('revenue').expectedProfitGain).toBeCloseTo(25_000, 6);
    expect(gain('sga').expectedProfitGain).toBeCloseTo(15_000, 6);
    expect(gain('cogs').expectedProfitGain).toBeCloseTo(12_000, 6);
    expect(gain('advertising').expectedProfitGain).toBeCloseTo(10_000, 6);
    expect(gain('sga').expectedMarginGainPt).toBeCloseTo(1.5, 9);
    // 売上 +5% は変動費も比例して増えるので、利益は 25,000・率は 175,000 / 1,050,000 − 15%
    expect(gain('revenue').expectedMarginGainPt).toBeCloseTo((175_000 / 1_050_000) * 100 - 15, 9);
  });

  it('刻みと名前は台帳 LEVER_STEPS から読む (写さない)', () => {
    for (const l of candidateLevers(base)) {
      expect(l.stepPct).toBe(LEVER_STEPS[l.id].stepPct);
      expect(l.label).toBe(LEVER_STEPS[l.id].label);
    }
  });

  it('除外した打ち手は出さない', () => {
    const ids = candidateLevers(base, new Set<LeverId>(['revenue', 'sga'])).map((l) => l.id);
    expect(ids).toEqual(['cogs', 'advertising']);
  });

  it('効果が 0 の打ち手 (削る元の費用が 0) は出さない', () => {
    const ids = candidateLevers({ ...base, advertising: 0 }).map((l) => l.id);
    expect(ids).not.toContain('advertising');
    expect(ids).toContain('cogs');
  });

  it('売上 0 なら候補を出さない (利益率が算定できない)', () => {
    expect(candidateLevers({ ...base, revenue: 0 })).toEqual([]);
  });

  it('試算であって予測ではないと述べる注記を持つ', () => {
    expect(LEVER_ASSUMPTION_NOTE).toContain('試算');
    expect(LEVER_ASSUMPTION_NOTE).toContain('予測ではありません');
  });
});

describe('judgeCycle: 翌月の実績で当たったか', () => {
  it('見込みの 8 割以上で当たり・3 割以上で部分的・未満で外れ (境界ちょうど)', () => {
    expect(HIT_RATIO).toBe(0.8);
    expect(PARTIAL_RATIO).toBe(0.3);
    expect(judgeCycle(2, 0, 1.6)).toBe('hit');
    expect(judgeCycle(2, 0, 1.59)).toBe('partial');
    expect(judgeCycle(2, 0, 0.6)).toBe('partial');
    expect(judgeCycle(2, 0, 0.59)).toBe('miss');
    expect(judgeCycle(2, 0, 3)).toBe('hit');
  });

  it('悪化は外れ', () => {
    expect(judgeCycle(2, 10, 9)).toBe('miss');
  });

  it('利益率が算定不能 (null) なら外れではなく unreadable', () => {
    expect(judgeCycle(2, null, 5)).toBe('unreadable');
    expect(judgeCycle(2, 5, null)).toBe('unreadable');
  });

  it('見込みが正の有限でなければ unreadable', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(judgeCycle(bad, 1, 5)).toBe('unreadable');
    }
  });
});

describe('judgeCycles と nextStep: 輪を回す', () => {
  const snaps = (...margins: (number | null)[]) =>
    margins.map((m, i) => ({
      period: `2026-0${i + 1}`,
      revenue: m === null ? 0 : 1_000_000,
      operatingProfit: m === null ? 0 : m * 10_000,
      marginPct: m,
      fundamentals: {
        revenue: m === null ? 0 : 1_000_000,
        cogs: 400_000,
        advertising: 100_000,
        sga: 300_000,
        depreciation: 50_000,
      },
    }));
  const cycle = (leverId: LeverId, n: number): CycleRecord => ({
    leverId,
    expectedGainPt: 2,
    beforePeriod: `2026-0${n}`,
    afterPeriod: `2026-0${n + 1}`,
  });

  it('検証する月の実績が届いていなければ verdict は null (待ち)', () => {
    expect(judgeCycles([cycle('sga', 1)], snaps(10))[0]!.verdict).toBeNull();
    expect(judgeCycles([cycle('sga', 1)], snaps(10, 12))[0]!.verdict).toBe('hit');
  });

  it('実績が 1 つも無ければ no-data', () => {
    expect(nextStep(20, [], [])).toEqual({ kind: 'no-data' });
  });

  it('最新月の売上が 0 なら blank (理由つき・0 と混ぜない)', () => {
    const r = nextStep(20, snaps(10, null), []);
    expect(r.kind).toBe('blank');
    if (r.kind === 'blank') expect(r.reason).toContain('2026-02');
  });

  it('目標に届いていれば goal-reached (境界ちょうども届いた)', () => {
    expect(nextStep(15, snaps(15), [])).toEqual({ kind: 'goal-reached', marginPct: 15 });
    expect(nextStep(15.01, snaps(15), []).kind).toBe('propose');
  });

  it('届いていなければ差と候補を propose する', () => {
    const r = nextStep(20, snaps(15), []);
    expect(r.kind).toBe('propose');
    if (r.kind === 'propose') {
      expect(r.gapPt).toBe(5);
      expect(r.levers.map((l) => l.id)).toEqual(['revenue', 'sga', 'cogs', 'advertising']);
    }
  });

  it('打ち手を選んだ翌月の実績が未着なら await-actuals', () => {
    expect(nextStep(20, snaps(15), [cycle('sga', 1)])).toEqual({ kind: 'await-actuals', period: '2026-02' });
  });

  it('外した打ち手は候補から外れる (部分的に当たった打ち手は残る)', () => {
    const r = nextStep(30, snaps(10, 10, 10), [cycle('sga', 1), cycle('cogs', 2)]);
    // sga: 10→10 で外れ / cogs: 10→10 で外れ
    expect(r.kind).toBe('propose');
    if (r.kind === 'propose') expect(r.levers.map((l) => l.id)).toEqual(['revenue', 'advertising']);
    const partial = nextStep(30, snaps(10, 10.8), [cycle('sga', 1)]);
    if (partial.kind === 'propose') expect(partial.levers.map((l) => l.id)).toContain('sga');
    else throw new Error('partial の打ち手は残るはず');
  });

  it('連続して外した回数が上限に達したら人へ戻す', () => {
    expect(MAX_CONSECUTIVE_MISSES).toBe(3);
    const two = nextStep(30, snaps(10, 10, 10), [cycle('sga', 1), cycle('cogs', 2)]);
    expect(two.kind).toBe('propose');
    const three = nextStep(30, snaps(10, 10, 10, 10), [cycle('sga', 1), cycle('cogs', 2), cycle('advertising', 3)]);
    expect(three.kind).toBe('stop-for-human');
    if (three.kind === 'stop-for-human') expect(three.reason).toContain('連続 3 回');
  });

  it('当たった周を挟むと連続は切れる', () => {
    const r = nextStep(30, snaps(10, 10, 12, 12), [cycle('sga', 1), cycle('cogs', 2), cycle('advertising', 3)]);
    // sga miss → cogs hit (10→12) → advertising miss (12→12): 末尾の連続は 1
    expect(r.kind).toBe('propose');
  });

  it('測れなかった周 (unreadable) は外れに数えず、連続も切らない', () => {
    const s = snaps(10, 10, null, 10, 10);
    const cs: CycleRecord[] = [
      cycle('sga', 1),
      cycle('cogs', 2), // 2026-03 が null → unreadable
      { leverId: 'advertising', expectedGainPt: 2, beforePeriod: '2026-04', afterPeriod: '2026-05' },
    ];
    // miss, unreadable, miss → 連続 2 (unreadable は数えず切らない) → 上限 3 に届かない
    expect(nextStep(30, s, cs).kind).toBe('propose');
  });

  it('末尾の測れなかった周は、それまでの連続した外れを切らない', () => {
    // 外れが 3 回続いたあとに、測れなかった周 (前の月の利益率が算定不能) が 1 つ付いても人へ戻す
    const r = nextStep(30, snaps(10, 10, 10, 10, null, 10), [
      cycle('sga', 1),
      cycle('cogs', 2),
      cycle('advertising', 3),
      { leverId: 'revenue', expectedGainPt: 2, beforePeriod: '2026-05', afterPeriod: '2026-06' },
    ]);
    expect(r.kind).toBe('stop-for-human');
  });

  it('候補が尽きたら人へ戻す (連続上限とは別の文)', () => {
    // sga 外れ → cogs 外れ → sga 当たり (連続を切る) → advertising 外れ → revenue 外れ。
    // 末尾の連続は 2 で上限に届かないが、4 つの打ち手のすべてを一度は外している。
    const r = nextStep(30, snaps(10, 10, 10, 12, 12, 12), [
      cycle('sga', 1),
      cycle('cogs', 2),
      cycle('sga', 3),
      cycle('advertising', 4),
      cycle('revenue', 5),
    ]);
    expect(r.kind).toBe('stop-for-human');
    if (r.kind === 'stop-for-human') {
      expect(r.reason).toContain('候補が尽きました');
      expect(r.reason).not.toContain('連続');
    }
  });

  it('候補が残っていれば propose のまま (外した打ち手だけが消える)', () => {
    const r = nextStep(30, snaps(10, 10, 10, 12, 12), [
      cycle('sga', 1),
      cycle('cogs', 2),
      cycle('sga', 3),
      cycle('advertising', 4),
    ]);
    expect(r.kind).toBe('propose');
    if (r.kind === 'propose') expect(r.levers.map((l) => l.id)).toEqual(['revenue']);
  });
});

describe('nextPeriod と判定の呼び名', () => {
  it('翌月 (12 月は翌年 1 月・月は 2 桁)', () => {
    expect(nextPeriod('2026-01')).toBe('2026-02');
    expect(nextPeriod('2026-09')).toBe('2026-10');
    expect(nextPeriod('2026-11')).toBe('2026-12');
    expect(nextPeriod('2026-12')).toBe('2027-01');
  });

  it('判定の呼び名は 4 つ全部に在る', () => {
    expect(VERDICT_LABEL).toEqual({ hit: '当たり', partial: '一部当たり', miss: '外れ', unreadable: '測れず' });
  });
});
