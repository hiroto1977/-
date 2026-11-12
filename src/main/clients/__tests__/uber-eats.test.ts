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
    const input = {
      stores: [
        { name: 'A店', orders: 10, revenue: 300_000, rating: 4.8 },
        { name: 'B店', orders: 5, revenue: 100_000, rating: 4.1 },
      ],
      topItems: [{ name: '唐揚げ弁当', sold: 40, revenue: 32_000 }],
      avgRating: 4.5,
    };

    it('画面が渡した集計から規則で組む (店舗名・数字が payload の物である)', async () => {
      const r = await action({ token: '', payload: input }) as {
        recommendations: { title: string; rationale: string }[];
        disclaimer: string;
        notForRealMoney: true;
        basis: string;
        phase: 'stub' | 'rules' | 'live';
      };
      expect(r.phase).toBe('rules');
      expect(r.notForRealMoney).toBe(true); // BLOCKING-1: 型レベル安全装置
      // **`|` で繋がない。** `/助言ではありません|Phase 6/` は「どちらか一方」
      // でも通るので、前半を丸ごと空にしても後半の "Phase 6" で素通りする ——
      // 2 つ確かめているように見えて、どちらも確かめていない検査だった
      // (2026-09-01)。片ごとに分ける。
      expect(r.disclaimer).toMatch(/店舗運営上の助言ではありません/);
      expect(r.disclaimer).toMatch(/実際の経営判断はオーナー・専門家の責任で/);
      expect(r.disclaimer).toMatch(/Phase 6/);
      expect(r.recommendations.map((x) => x.title)).toEqual([
        '店舗別売上の平準化',
        '評価の底上げ: B店',
        '人気メニューの横展開: 唐揚げ弁当',
      ]);
      expect(r.recommendations[0]!.rationale).toContain('A店 (¥300,000)');
      expect(r.basis).toBe('2 店舗・メニュー 1 品・平均評価 4.5');
      // 見本の数字を写した固定文は残っていない。
      const text = JSON.stringify(r);
      for (const frozen of ['Shibuya', 'Shinjuku', '4.60', '4.70']) expect(text, frozen).not.toContain(frozen);
    });

    it('読めない payload は断る (文面は shared と同じ —— ブラウザ版も同じ文で断る)', async () => {
      await expect(action({ token: '', payload: {} })).rejects.toThrow('uber-eats.advise: stores は配列 (1〜500 件) で指定してください');
    });
  });
});
