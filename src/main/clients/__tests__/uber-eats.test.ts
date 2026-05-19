import { describe, expect, it, vi } from 'vitest';
import { fetchUberEatsSnapshot, ACTIONS } from '../uber-eats';

describe('fetchUberEatsSnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchUberEatsSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.stores).toEqual([]);
    expect(snap.topItems).toEqual([]);
    expect(snap.weekRevenue).toBe(0);
    expect(snap.weekOrders).toBe(0);
    expect(snap.avgRating).toBe(0);
  });
});

describe('uber-eats ACTIONS', () => {
  describe('record-entry', () => {
    const action = ACTIONS['record-entry']!;
    it('records valid input and explicitly returns persisted=false', async () => {
      const r = await action({ token: '', payload: { note: '今日の売上記録', amount: 12_000 } }) as {
        ok: boolean; serviceId: string; recordedAt: string; persisted: false;
      };
      expect(r.ok).toBe(true);
      expect(r.serviceId).toBe('uber-eats');
      expect(r.persisted).toBe(false); // BLOCKING-3: UI must show "not yet saved"
      expect(typeof r.recordedAt).toBe('string');
      expect(r.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('rejects empty note', async () => {
      await expect(action({ token: '', payload: { note: '' } })).rejects.toThrow(/note は 1-2000/);
    });
    it('rejects oversized note (> 2000 chars)', async () => {
      await expect(action({ token: '', payload: { note: 'x'.repeat(2001) } })).rejects.toThrow(/note は 1-2000/);
    });
    it('rejects non-finite amount', async () => {
      await expect(action({ token: '', payload: { note: 'x', amount: Number.NaN } })).rejects.toThrow(/amount は finite/);
      await expect(action({ token: '', payload: { note: 'x', amount: Infinity } })).rejects.toThrow(/amount は finite/);
    });
    it('accepts payload without amount (optional field)', async () => {
      const r = await action({ token: '', payload: { note: 'memo only' } }) as { ok: boolean; persisted: false };
      expect(r.ok).toBe(true);
      expect(r.persisted).toBe(false);
    });
  });

  describe('advise', () => {
    const action = ACTIONS['advise']!;
    it('returns AdvisorResponse-compatible shape with disclaimer + notForRealMoney', async () => {
      const r = await action({ token: '', payload: {} }) as {
        recommendations: { title: string; rationale: string }[];
        disclaimer: string;
        notForRealMoney: true;
        phase: 'stub' | 'live';
      };
      expect(r.phase).toBe('stub');
      expect(r.notForRealMoney).toBe(true); // BLOCKING-1: 型レベル安全装置
      expect(r.disclaimer).toMatch(/助言ではありません|Phase 6/);
      expect(Array.isArray(r.recommendations)).toBe(true);
      expect(r.recommendations.length).toBeGreaterThan(0);
      expect(r.recommendations[0]!.title).toBeTruthy();
      expect(r.recommendations[0]!.rationale).toBeTruthy();
    });
  });
});
