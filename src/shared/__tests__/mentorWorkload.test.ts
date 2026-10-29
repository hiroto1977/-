import { describe, expect, it } from 'vitest';
import {
  addCheckIn,
  CHECKIN_INTERVAL_DAYS,
  emptyMentorSession,
  WORKLOAD_HIGH,
  WORKLOAD_LIGHT,
  WORKLOAD_SKEW_RATIO,
  WORKLOAD_WINDOW,
  workloadDistribution,
  workloadImbalanceNote,
  type MentorMember,
  type MentorSession,
} from '../mentor';

/**
 * **ひとりひとりの負担率** (2026-10-29 · パス 555)。
 *
 * 利用者の依頼: 「従業員ひとりひとりの仕事の負担率等も見てわかるようにして」。
 * 守る物: ① 同意の無い人は行にならず人数だけ ② 記録の無い人は 0 (余裕) にしない —— `unknown` で
 * 分母にも入れない ③ 平均は直近 `WORKLOAD_WINDOW` 回 ④ 負担率は全員で 100% ⑤ 並びは保管層の順に依らない
 * ⑥ メモ (本音) は構造上 1 字も持たない。
 */
const A: MentorMember = { key: 'a@example.com', name: '青木', role: 'member' };
const B: MentorMember = { key: 'b@example.com', name: '坂本', role: 'admin' };
const C: MentorMember = { key: 'c@example.com', name: '千葉', role: 'member' };
const ROSTER = [A, B, C];
const TODAY = '2026-10-29';

function withLoads(member: string, loads: readonly number[], share = true, lastOn = TODAY): MentorSession {
  let s: MentorSession = { ...emptyMentorSession(member), shareWithTeam: share };
  // 日付は 1 日ずつ遡る (同じ日は上書きになる)。最後の 1 件が `lastOn`。
  const [y, m, d] = lastOn.split('-').map(Number) as [number, number, number];
  loads.forEach((w, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d - (loads.length - 1 - i)));
    s = addCheckIn(s, { on: dt.toISOString().slice(0, 10), mood: 3, workload: w, note: `本音 ${w}` });
  });
  return s;
}

describe('負担率 (workloadDistribution)', () => {
  it('★ 負担率は同意した人の平均の比で、全員で 100% になる (均等との差も出す)', () => {
    const d = workloadDistribution([withLoads(A.key, [5, 5]), withLoads(B.key, [3, 3]), withLoads(C.key, [2, 2])], ROSTER, TODAY);
    expect(d.counted).toBe(3);
    expect(d.withoutConsent).toBe(0);
    expect(d.evenSharePct).toBe(33.3);
    expect(d.rows.map((r) => [r.name, r.average, r.sharePct, r.skewPt, r.level])).toEqual([
      ['青木', 5, 50, 16.7, 'high'],
      ['坂本', 3, 30, -3.3, 'normal'],
      ['千葉', 2, 20, -13.3, 'light'],
    ]);
    const sum = d.rows.reduce((acc, r) => acc + (r.sharePct ?? Number.NaN), 0);
    expect(Math.abs(sum - 100)).toBeLessThan(0.11);
  });

  it('★ 同意の無い人は行にならず、人数だけが withoutConsent に出る (名前は出ない)', () => {
    const d = workloadDistribution([withLoads(A.key, [4]), withLoads(B.key, [5], false)], ROSTER, TODAY);
    expect(d.rows.map((r) => r.member)).toEqual([A.key]);
    expect(d.withoutConsent).toBe(2); // 坂本 (同意なし) + 千葉 (記録なし)
    expect(JSON.stringify(d)).not.toContain('坂本');
    expect(JSON.stringify(d)).not.toContain('本音');
    // 針が的に当たる標本 (同意していれば名前は出る)。
    expect(JSON.stringify(workloadDistribution([withLoads(B.key, [5])], ROSTER, TODAY))).toContain('坂本');
  });

  it('★ 記録の無い人は unknown で、負担率の分母に入らない (0 = 余裕 にしない)', () => {
    const d = workloadDistribution([withLoads(A.key, [4]), { ...emptyMentorSession(B.key), shareWithTeam: true }], ROSTER, TODAY);
    expect(d.counted).toBe(1);
    expect(d.evenSharePct).toBe(100);
    const b = d.rows.find((r) => r.member === B.key)!;
    expect(b).toMatchObject({ latest: null, average: null, samples: 0, sharePct: null, skewPt: null, level: 'unknown', lastOn: null, stale: true });
    // 記録の無い人は末尾。青木 1 人で 100%。
    expect(d.rows.map((r) => r.member)).toEqual([A.key, B.key]);
    expect(d.rows[0]!.sharePct).toBe(100);
  });

  it('平均は直近 WORKLOAD_WINDOW 回だけ (古い高負荷は引きずらない)・直近と最終日も持つ', () => {
    const loads = [5, 5, 5, 5, 1, 1, 1, 1];
    expect(loads.length).toBeGreaterThan(WORKLOAD_WINDOW);
    const d = workloadDistribution([withLoads(A.key, loads)], [A], TODAY);
    const a = d.rows[0]!;
    expect(a.samples).toBe(WORKLOAD_WINDOW);
    expect(a.average).toBe(1);
    expect(a.latest).toBe(1);
    expect(a.lastOn).toBe(TODAY);
    expect(a.stale).toBe(false);
    expect(a.level).toBe('light');
  });

  it('しきい値: 平均 WORKLOAD_HIGH 以上で high・WORKLOAD_LIGHT 以下で light・境目のすぐ内側は normal', () => {
    const lvl = (loads: number[]): string => workloadDistribution([withLoads(A.key, loads)], [A], TODAY).rows[0]!.level;
    expect(lvl([WORKLOAD_HIGH])).toBe('high');
    expect(lvl([WORKLOAD_HIGH, WORKLOAD_HIGH - 1])).toBe('normal'); // 3.5
    expect(lvl([WORKLOAD_LIGHT])).toBe('light');
    expect(lvl([WORKLOAD_LIGHT, WORKLOAD_LIGHT + 1])).toBe('normal'); // 2.5
  });

  it('CHECKIN_INTERVAL_DAYS を超えて空くと stale (ちょうどは stale でない)', () => {
    const edge = new Date(Date.UTC(2026, 9, 29 - CHECKIN_INTERVAL_DAYS)).toISOString().slice(0, 10);
    const over = new Date(Date.UTC(2026, 9, 29 - CHECKIN_INTERVAL_DAYS - 1)).toISOString().slice(0, 10);
    expect(workloadDistribution([withLoads(A.key, [3], true, edge)], [A], TODAY).rows[0]!.stale).toBe(false);
    expect(workloadDistribution([withLoads(A.key, [3], true, over)], [A], TODAY).rows[0]!.stale).toBe(true);
  });

  it('★ 並びは保管層の順に依らない (負担率の大きい順・同率は鍵の順)', () => {
    const sA = withLoads(A.key, [3]);
    const sB = withLoads(B.key, [5]);
    const sC = withLoads(C.key, [3]);
    const forward = workloadDistribution([sA, sB, sC], ROSTER, TODAY).rows.map((r) => r.member);
    const backward = workloadDistribution([sC, sB, sA], [C, B, A], TODAY).rows.map((r) => r.member);
    expect(forward).toEqual([B.key, A.key, C.key]);
    expect(backward).toEqual(forward);
  });

  it('名簿に無い人の記録は数えない・誰も居なければ空', () => {
    const d = workloadDistribution([withLoads('ghost@x', [5])], ROSTER, TODAY);
    expect(d.rows).toEqual([]);
    expect(d.counted).toBe(0);
    expect(d.evenSharePct).toBeNull();
    expect(d.withoutConsent).toBe(3);
    expect(workloadDistribution([], [], TODAY)).toEqual({ rows: [], counted: 0, evenSharePct: null, withoutConsent: 0 });
  });
});

describe('偏りの 1 文 (workloadImbalanceNote)', () => {
  it('★ 均等の WORKLOAD_SKEW_RATIO 倍以上を負う人が居るときだけ、その人の名前で言う', () => {
    // 2 人: 均等 50%。5 と 1 → 83.3% ≥ 75%。
    const skewed = workloadDistribution([withLoads(A.key, [5]), withLoads(B.key, [1])], ROSTER, TODAY);
    const note = workloadImbalanceNote(skewed);
    expect(note).toContain('青木 さんに負担が偏っています');
    expect(note).toContain('均等なら 50% のところ 83.3%');
    expect(note).not.toContain('坂本');
    // 5 と 3 → 62.5% < 75% なので言わない。
    expect(workloadImbalanceNote(workloadDistribution([withLoads(A.key, [5]), withLoads(B.key, [3])], ROSTER, TODAY))).toBeNull();
    // 境目ちょうど (3 人 · 均等 33.3% × 1.5 = 50%): 5, 2.5, 2.5 → 50% は言う。
    const edge = workloadDistribution([withLoads(A.key, [5]), withLoads(B.key, [2, 3]), withLoads(C.key, [3, 2])], ROSTER, TODAY);
    expect(edge.rows[0]!.sharePct).toBe(50);
    expect(edge.evenSharePct! * WORKLOAD_SKEW_RATIO).toBeCloseTo(50, 0);
    expect(workloadImbalanceNote(edge)).not.toBeNull();
  });

  it('1 人だけ・平均を持つ人が 1 人だけ・誰も居ないときは言わない (1 人で 100% は偏りではない)', () => {
    expect(workloadImbalanceNote(workloadDistribution([withLoads(A.key, [5])], ROSTER, TODAY))).toBeNull();
    expect(workloadImbalanceNote(workloadDistribution([withLoads(A.key, [5]), { ...emptyMentorSession(B.key), shareWithTeam: true }], ROSTER, TODAY))).toBeNull();
    expect(workloadImbalanceNote(workloadDistribution([], ROSTER, TODAY))).toBeNull();
  });
});
