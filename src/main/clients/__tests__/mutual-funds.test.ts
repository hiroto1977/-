import { describe, expect, it, vi } from 'vitest';
import { fetchMutualFundsSnapshot, ACTIONS } from '../mutual-funds';

describe('fetchMutualFundsSnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchMutualFundsSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.holdings).toEqual([]);
    expect(snap.portfolio).toEqual({ totalValuation: 0, totalCostBasis: 0, unrealizedGain: 0, unrealizedGainPct: 0 });
    expect(snap.recentDividends).toEqual([]);
  });
});

describe('mutual-funds ACTIONS', () => {
  describe('record-entry', () => {
    const action = ACTIONS['record-entry']!;
    it('records valid input with persisted=false', async () => {
      const r = await action({ token: '', payload: { note: 'eMAXIS Slim S&P500 を 1 万円積立', amount: 10_000 } }) as { ok: boolean; serviceId: string; persisted: false };
      expect(r.ok).toBe(true);
      expect(r.serviceId).toBe('mutual-funds');
      expect(r.persisted).toBe(false);
    });
    it('rejects empty note', async () => {
      await expect(action({ token: '', payload: { note: '' } })).rejects.toThrow(/note は 1-2000/);
    });
    it('rejects oversized note', async () => {
      await expect(action({ token: '', payload: { note: 'x'.repeat(2001) } })).rejects.toThrow(/note は 1-2000/);
    });
    it('rejects non-finite amount', async () => {
      await expect(action({ token: '', payload: { note: 'x', amount: Infinity } })).rejects.toThrow(/amount は finite/);
    });
  });

  describe('advise', () => {
    const action = ACTIONS['advise']!;
    const input = {
      holdings: [
        { name: '国内株式ファンド', valuation: 700_000, ytdReturnPct: -1.5, demo: false },
        { name: '先進国債券ファンド', valuation: 300_000, ytdReturnPct: 2.0, demo: false },
      ],
      totalValuation: 1_000_000,
      unrealizedGainPct: -4.0,
    };

    it('画面が渡した集計から規則で組む (銘柄名・数字が payload の物で、見本の数字を写した固定文ではない)', async () => {
      const r = await action({ token: '', payload: input }) as {
        recommendations: { title: string; rationale: string }[];
        disclaimer: string; notForRealMoney: true; basis: string; phase: 'stub' | 'rules' | 'live';
      };
      expect(r.phase).toBe('rules');
      expect(r.notForRealMoney).toBe(true);
      // 3 片の連結。真ん中 (誰に確かめるか) を片ごとに留める —— 理由は
      // `real-estate.test.ts` の同じ検査に書いてある。
      expect(r.disclaimer).toMatch(/投資助言ではありません/);
      expect(r.disclaimer).toMatch(/ファイナンシャルアドバイザーの確認を経て/);
      expect(r.disclaimer).toMatch(/ご自身の責任で行ってください/);
      expect(r.disclaimer).toMatch(/Phase 6/);
      expect(r.recommendations.map((x) => x.title)).toEqual([
        '集中リスク: 国内株式ファンド',
        '年初来マイナスの銘柄: 国内株式ファンド',
        '含み損 4.0%',
      ]);
      expect(r.basis).toBe('2 銘柄 (すべて利用者の入力)・評価額 ¥1,000,000・評価損益率 -4.0%');
      const text = JSON.stringify(r);
      for (const frozen of ['14.8', '14.2', 'S&P500', 'ひふみ']) expect(text, frozen).not.toContain(frozen);
    });

    it('読めない payload は断る (文面は shared と同じ)', async () => {
      await expect(action({ token: '', payload: {} })).rejects.toThrow('mutual-funds.advise: holdings は配列 (1〜500 件) で指定してください');
    });
  });
});
