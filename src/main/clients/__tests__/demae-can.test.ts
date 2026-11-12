import { describe, expect, it, vi } from 'vitest';
import { fetchDemaeCanSnapshot, ACTIONS } from '../demae-can';

describe('fetchDemaeCanSnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchDemaeCanSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.orders).toEqual([]);
    expect(snap.topAreas).toEqual([]);
    expect(snap.monthSummary).toEqual({ orders: 0, revenue: 0, avgOrderValue: 0, cancellationRate: 0 });
  });
});

describe('demae-can ACTIONS', () => {
  describe('record-entry', () => {
    const action = ACTIONS['record-entry']!;
    it('records valid input with persisted=false', async () => {
      const r = await action({ token: '', payload: { note: '配達遅延あり', amount: 2_400 } }) as { ok: boolean; serviceId: string; persisted: false };
      expect(r.ok).toBe(true);
      expect(r.serviceId).toBe('demae-can');
      expect(r.persisted).toBe(false);
    });
    it('rejects empty note', async () => {
      await expect(action({ token: '', payload: { note: '' } })).rejects.toThrow(/note は 1-2000/);
    });
    it('rejects oversized note', async () => {
      await expect(action({ token: '', payload: { note: 'x'.repeat(2001) } })).rejects.toThrow(/note は 1-2000/);
    });
    it('rejects NaN amount', async () => {
      await expect(action({ token: '', payload: { note: 'x', amount: Number.NaN } })).rejects.toThrow(/amount は finite/);
    });
  });

  describe('advise', () => {
    const action = ACTIONS['advise']!;
    const input = {
      monthOrders: 40,
      cancellationRate: 0.05,
      topAreas: [
        { area: '北区', orders: 10, revenue: 30_000 },
        { area: '南区', orders: 10, revenue: 20_000 },
      ],
      deliveringOrders: 2,
    };

    it('画面が渡した集計から規則で組む (地域名・数字が payload の物である)', async () => {
      const r = await action({ token: '', payload: input }) as {
        recommendations: { title: string; rationale: string }[];
        disclaimer: string; notForRealMoney: true; basis: string; phase: 'stub' | 'rules' | 'live';
      };
      expect(r.phase).toBe('rules');
      expect(r.notForRealMoney).toBe(true);
      // **`|` で繋がない。** `/助言ではありません|Phase 6/` は「どちらか一方」
      // でも通るので、前半を丸ごと空にしても後半の "Phase 6" で素通りする ——
      // 2 つ確かめているように見えて、どちらも確かめていない検査だった
      // (2026-09-01)。片ごとに分ける。
      expect(r.disclaimer).toMatch(/店舗運営上の助言ではありません/);
      expect(r.disclaimer).toMatch(/実際の経営判断はオーナー・専門家の責任で/);
      expect(r.disclaimer).toMatch(/Phase 6/);
      expect(r.recommendations.map((x) => x.title)).toEqual([
        'キャンセル率 5.0% の改善',
        '客単価の地域格差: 北区 と 南区',
        '配達中 2 件の監視',
      ]);
      expect(r.basis).toBe('月次 40 件・地域 2 か所・配達中 2 件');
      const text = JSON.stringify(r);
      for (const frozen of ['1.80%', '渋谷区', '世田谷区']) expect(text, frozen).not.toContain(frozen);
    });

    it('読めない payload は断る (文面は shared と同じ)', async () => {
      await expect(action({ token: '', payload: {} })).rejects.toThrow('demae-can.advise: monthOrders は有限の数値で指定してください');
    });
  });
});
