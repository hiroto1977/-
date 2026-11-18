import { describe, expect, it, vi } from 'vitest';
import { fetchStripeSnapshot } from '../stripe';
import { FetchError } from '../types';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('fetchStripeSnapshot (デスクトップ版の入口)', () => {
  it('★ 残高と最近の入金を読み、鍵を Bearer で api.stripe.com へだけ送る', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ available: [{ amount: 128400, currency: 'jpy' }], pending: [{ amount: 36200, currency: 'jpy' }], livemode: true }))
      .mockResolvedValueOnce(json({ data: [{ id: 'ch_1', amount: 18400, currency: 'jpy', status: 'succeeded', refunded: false }] }));

    const snap = await fetchStripeSnapshot({ token: 'rk_test_example', fetch: fetchMock });

    expect(snap.balances).toEqual([{ currency: 'jpy', available: 128400, pending: 36200 }]);
    expect(snap.charges).toEqual([
      { id: 'ch_1', amount: 18400, currency: 'jpy', status: 'succeeded', refunded: false, created: null, description: '' },
    ]);
    expect(snap.balanceRead).toBe(true);
    expect(snap.chargesRead).toBe(true);
    expect(snap.livemode).toBe(true);

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://api.stripe.com/v1/balance',
      'https://api.stripe.com/v1/charges?limit=10',
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer rk_test_example');
      // 読み取りだけ —— 書き込みの method も本文も付けない。
      expect((init as RequestInit).method).toBeUndefined();
      expect((init as RequestInit).body).toBeUndefined();
    }
  });

  it('★ 401 は stripe の FetchError として上へ出す (見本へ黙って戻らない)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ error: { message: 'Invalid API Key' } }, 401));
    const err = await fetchStripeSnapshot({ token: 'bad', fetch: fetchMock }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).serviceId).toBe('stripe');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('本文が物でない応答 (null) は、型エラーの文面を出さずに断る', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json(null));
    const err = await fetchStripeSnapshot({ token: 't', fetch: fetchMock }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toMatch(/Cannot read propert|is not a function|of null/);
    // 針が的に当たる標本 (不在の主張には標本を添える)。
    expect("Cannot read properties of null (reading 'available')").toMatch(/Cannot read propert|is not a function|of null/);
  });

  it('欄の無い応答 ({}) は「読めなかった」として返す (0 件と混ぜない)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json({})).mockResolvedValueOnce(json({}));
    const snap = await fetchStripeSnapshot({ token: 't', fetch: fetchMock });
    expect(snap).toEqual({ balances: [], charges: [], balanceRead: false, chargesRead: false, livemode: null });
  });
});
