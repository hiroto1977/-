import { describe, expect, it, vi } from 'vitest';
import { fetchRealEstateSnapshot, ACTIONS } from '../real-estate';

describe('fetchRealEstateSnapshot (snapshot-only stub)', () => {
  it('returns a typed stub without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchRealEstateSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.properties).toEqual([]);
    expect(snap.monthlyCashflow).toEqual({ grossRent: 0, operatingExpenses: 0, mortgagePayment: 0, netCashflow: 0 });
    expect(snap.portfolioYield).toBe(0);
    expect(snap.occupancyRate).toBe(0);
  });
});

describe('real-estate ACTIONS', () => {
  describe('record-entry', () => {
    const action = ACTIONS['record-entry']!;
    it('records valid input with persisted=false', async () => {
      const r = await action({ token: '', payload: { note: '修繕費発生', amount: -120_000 } }) as { ok: boolean; serviceId: string; persisted: false };
      expect(r.ok).toBe(true);
      expect(r.serviceId).toBe('real-estate');
      expect(r.persisted).toBe(false);
    });
    it('rejects empty note', async () => {
      await expect(action({ token: '', payload: { note: '' } })).rejects.toThrow(/note は 1-2000/);
    });
    it('rejects oversized note', async () => {
      await expect(action({ token: '', payload: { note: 'x'.repeat(2001) } })).rejects.toThrow(/note は 1-2000/);
    });
    it('rejects non-finite amount', async () => {
      await expect(action({ token: '', payload: { note: 'x', amount: Number.NaN } })).rejects.toThrow(/amount は finite/);
    });
  });

  describe('advise', () => {
    const action = ACTIONS['advise']!;
    const input = {
      properties: [
        { name: '福岡市アパート', occupied: false, monthlyRent: 100_000, grossYieldPct: 10.0, demo: false },
        { name: '仙台市戸建て', occupied: true, monthlyRent: 90_000, grossYieldPct: 4.0, demo: false },
      ],
      netCashflow: 50_000,
      portfolioYieldPct: 7.0,
      occupancyRate: 0.5,
    };

    it('画面が渡した集計から規則で組む (物件名・数字が payload の物で、見本の数字を写した固定文ではない)', async () => {
      const r = await action({ token: '', payload: input }) as {
        recommendations: { title: string; rationale: string }[];
        disclaimer: string; notForRealMoney: true; basis: string; phase: 'stub' | 'rules' | 'live';
      };
      expect(r.phase).toBe('rules');
      expect(r.notForRealMoney).toBe(true);
      // 投資系には特に厳しい disclaimer (BLOCKING-1)
      // 文言は 3 片の連結。**片ごとに固有の言い回しを取る** —— 真ん中の
      // 「誰に確かめるか」だけを空にする変異は、前後 2 片に当たる検査では
      // 捕まらない。投資系の免責でいちばん行動に結びつく一文である。
      expect(r.disclaimer).toMatch(/投資助言ではありません/);
      expect(r.disclaimer).toMatch(/ファイナンシャルアドバイザー・税理士・宅建士の確認を経て/);
      expect(r.disclaimer).toMatch(/ご自身の責任で行ってください/);
      expect(r.disclaimer).toMatch(/Phase 6/);
      expect(r.recommendations.map((x) => x.title)).toEqual([
        '空室 1 件の解消',
        'キャッシュフローの主力: 仙台市戸建て',
        '低利回り物件の見直し: 仙台市戸建て',
      ]);
      expect(r.recommendations[0]!.rationale).toContain('福岡市アパート (¥100,000/月)');
      expect(r.basis).toBe('2 物件 (すべて利用者の入力)・月次 CF ¥50,000・平均表面利回り 7.0%・入居率 50%');
      // 2026-09-09 まで返していた固定文の数字 (見本) は、どこにも残っていない。
      const text = JSON.stringify(r);
      for (const frozen of ['大阪', '札幌', '6.15', '8.1%']) expect(text, frozen).not.toContain(frozen);
    });

    it('読めない payload は断る (文面は shared と同じ —— ブラウザ版も同じ文で断る)', async () => {
      await expect(action({ token: '', payload: {} })).rejects.toThrow('real-estate.advise: properties は配列 (1〜500 件) で指定してください');
    });
  });
});
