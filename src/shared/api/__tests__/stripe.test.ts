/**
 * Stripe 共有クライアントの検査 (2026-11-18)。
 *
 * ここは main (デスクトップ) と renderer (ブラウザ) の**両方**が呼ぶ。通信手段を差し替えられる形
 * そのものを固定し、応答の正規化は値ごと留める (読めない欄は 0 にしない)。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  STRIPE_AMOUNT_UNKNOWN,
  STRIPE_API_BASE,
  STRIPE_BALANCE_URL,
  STRIPE_CHARGES_URL,
  STRIPE_CHARGE_LIMIT,
  STRIPE_CURRENCY_UNKNOWN,
  buildStripeSnapshot,
  fetchStripeSnapshotWith,
  normalizeStripeBalance,
  normalizeStripeCharges,
  stripeAmountText,
  stripeCreatedDate,
  stripeCurrency,
  stripeDecimals,
  stripeHeaders,
  stripeIntakeNote,
  stripeModeLabel,
  stripeStatusLabel,
} from '../stripe';
import { localIsoDate } from '../../localDate';
import { rereadModule } from '../../__tests__/rereadModule';

/** 2026-11-16 12:00 UTC (どの時間帯でも日付が大きくずれない正午)。 */
const NOON_SECONDS = Date.UTC(2026, 10, 16, 12, 0, 0) / 1000;
const NOON_DATE = localIsoDate(new Date(NOON_SECONDS * 1000));

describe('定数', () => {
  it('送り先は api.stripe.com の 2 つだけ', () => {
    expect(STRIPE_API_BASE).toBe('https://api.stripe.com');
    expect(STRIPE_CHARGE_LIMIT).toBe(10);
    expect(STRIPE_BALANCE_URL).toBe('https://api.stripe.com/v1/balance');
    expect(STRIPE_CHARGES_URL).toBe('https://api.stripe.com/v1/charges?limit=10');
  });

  it('★ 直下の値を読み直しても同じ (表・文・URL を値ごと留める)', async () => {
    const m = await rereadModule<typeof import('../stripe')>(import.meta.url, '../stripe');
    expect(m.STRIPE_API_BASE).toBe('https://api.stripe.com');
    expect(m.STRIPE_CHARGE_LIMIT).toBe(10);
    expect(m.STRIPE_BALANCE_URL).toBe('https://api.stripe.com/v1/balance');
    expect(m.STRIPE_CHARGES_URL).toBe('https://api.stripe.com/v1/charges?limit=10');
    expect(m.STRIPE_AMOUNT_UNKNOWN).toBe('金額不明');
    expect(m.STRIPE_CURRENCY_UNKNOWN).toBe('通貨不明');
    expect([...m.STRIPE_ZERO_DECIMAL].sort()).toEqual([
      'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
    ]);
    expect([...m.STRIPE_THREE_DECIMAL].sort()).toEqual(['bhd', 'jod', 'kwd', 'omr', 'tnd']);
  });
});

describe('stripeCurrency', () => {
  it('3 文字の英字を小文字にする', () => {
    expect(stripeCurrency('JPY')).toBe('jpy');
    expect(stripeCurrency('usd')).toBe('usd');
  });

  it.each([
    ['数', 392],
    ['null', null],
    ['undefined', undefined],
    ['物', { a: 1 }],
    ['空文字', ''],
    ['2 文字', 'jp'],
    ['数字入り', 'jp1'],
    ['記号入り', 'j-y'],
    ['配列 (文字列にすると 3 文字の英字に見える)', ['usd']],
    ['NaN (文字列にすると 3 文字の英字に見える)', Number.NaN],
  ])('読めない通貨 (%s) は空文字', (_label, v) => {
    expect(stripeCurrency(v)).toBe('');
  });

  it('4 文字以上は 3 文字の通貨として読まない (前に付けても後ろに付けても)', () => {
    expect(stripeCurrency('jpyx')).toBe('');
    expect(stripeCurrency('xjpy')).toBe('');
  });
});

describe('stripeDecimals', () => {
  it('円は 0 桁・ドルは 2 桁・クウェートディナールは 3 桁', () => {
    expect(stripeDecimals('jpy')).toBe(0);
    expect(stripeDecimals('krw')).toBe(0);
    expect(stripeDecimals('usd')).toBe(2);
    expect(stripeDecimals('eur')).toBe(2);
    expect(stripeDecimals('kwd')).toBe(3);
    expect(stripeDecimals('bhd')).toBe(3);
  });
});

describe('stripeAmountText', () => {
  it('★ 読めない金額は「金額不明」 (0 と刷らない)', () => {
    expect(stripeAmountText(null, 'jpy')).toBe(STRIPE_AMOUNT_UNKNOWN);
    expect(stripeAmountText(null, '')).toBe(STRIPE_AMOUNT_UNKNOWN);
    expect(STRIPE_AMOUNT_UNKNOWN).toBe('金額不明');
  });

  it('円はそのまま額面 (アプリの金額の口を通す)', () => {
    expect(stripeAmountText(18400, 'jpy')).toBe('¥18,400');
    expect(stripeAmountText(0, 'jpy')).toBe('¥0');
    expect(stripeAmountText(-500, 'jpy')).toBe('¥-500');
  });

  it('★ ドルは最小単位 (セント) を 100 で割る —— そのまま刷ると 100 倍に読める', () => {
    expect(stripeAmountText(418000, 'usd')).toBe('4,180.00 USD');
    expect(stripeAmountText(5, 'usd')).toBe('0.05 USD');
    expect(stripeAmountText(1234, 'eur')).toBe('12.34 EUR');
  });

  it('円以外の 0 桁の通貨は割らない・3 桁の通貨は 1000 で割る', () => {
    expect(stripeAmountText(50000, 'krw')).toBe('50,000 KRW');
    expect(stripeAmountText(12345, 'kwd')).toBe('12.345 KWD');
  });

  it('通貨が読めないときは桁を推測せず、最小単位の数に「通貨不明」を添える', () => {
    expect(stripeAmountText(1234, '')).toBe('1,234 (通貨不明)');
    expect(STRIPE_CURRENCY_UNKNOWN).toBe('通貨不明');
  });
});

describe('stripeStatusLabel', () => {
  it('知っている状態は日本語にする', () => {
    expect(stripeStatusLabel('succeeded', false)).toBe('成功');
    expect(stripeStatusLabel('pending', false)).toBe('処理中');
    expect(stripeStatusLabel('failed', false)).toBe('失敗');
  });

  it('返金済みは状態より先に言う', () => {
    expect(stripeStatusLabel('succeeded', true)).toBe('返金済み');
    expect(stripeStatusLabel('', true)).toBe('返金済み');
  });

  it('知らない状態は相手の語のまま・空なら「状態不明」', () => {
    expect(stripeStatusLabel('requires_capture', false)).toBe('requires_capture');
    expect(stripeStatusLabel('', false)).toBe('状態不明');
  });
});

describe('stripeCreatedDate', () => {
  it('epoch 秒を日付にする (ミリ秒ではない)', () => {
    expect(stripeCreatedDate(NOON_SECONDS)).toBe(NOON_DATE);
    expect(NOON_DATE).toMatch(/^2026-11-1[67]$/);
  });

  it.each([
    ['文字列', '1794830400'],
    ['null', null],
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['無限大', Number.POSITIVE_INFINITY],
    ['Date が表せない大きさ', 1e20],
  ])('読めない値 (%s) は null', (_label, v) => {
    expect(stripeCreatedDate(v)).toBeNull();
  });
});

describe('normalizeStripeBalance', () => {
  it('通貨ごとに利用可能と入金待ちを並べる', () => {
    const r = normalizeStripeBalance({
      object: 'balance',
      livemode: true,
      available: [{ amount: 128400, currency: 'jpy' }, { amount: 5000, currency: 'usd' }],
      pending: [{ amount: 36200, currency: 'jpy' }],
    });
    expect(r).toEqual({
      balances: [
        { currency: 'jpy', available: 128400, pending: 36200 },
        { currency: 'usd', available: 5000, pending: null },
      ],
      read: true,
      livemode: true,
    });
  });

  it('入金待ちにしか無い通貨も行になる (利用可能は null)', () => {
    const r = normalizeStripeBalance({ available: [], pending: [{ amount: 700, currency: 'eur' }], livemode: false });
    expect(r.balances).toEqual([{ currency: 'eur', available: null, pending: 700 }]);
    expect(r.read).toBe(true);
    expect(r.livemode).toBe(false);
  });

  it('★ 数でない金額は null (0 に倒さない)', () => {
    const r = normalizeStripeBalance({ available: [{ amount: '128400', currency: 'jpy' }], pending: [{ currency: 'jpy' }] });
    expect(r.balances).toEqual([{ currency: 'jpy', available: null, pending: null }]);
  });

  it('同じ通貨が 2 度在れば最初の 1 件だけを使う', () => {
    const r = normalizeStripeBalance({
      available: [{ amount: 100, currency: 'jpy' }, { amount: 999, currency: 'jpy' }],
      pending: [{ amount: 1, currency: 'jpy' }, { amount: 2, currency: 'jpy' }],
    });
    expect(r.balances).toEqual([{ currency: 'jpy', available: 100, pending: 1 }]);
  });

  it('片方だけが配列でも「読めた」・行でない要素は飛ばす', () => {
    const onlyAvailable = normalizeStripeBalance({ available: [null, 'x', [1], { amount: 3, currency: 'jpy' }] });
    expect(onlyAvailable).toEqual({ balances: [{ currency: 'jpy', available: 3, pending: null }], read: true, livemode: null });
    const onlyPending = normalizeStripeBalance({ pending: [] });
    expect(onlyPending).toEqual({ balances: [], read: true, livemode: null });
  });

  it.each([
    ['null', null],
    ['文字列', 'balance'],
    ['配列', [1, 2]],
    ['欄の無い物', {}],
    ['欄が配列でない', { available: 'x', pending: 3 }],
  ])('★ 読めない応答 (%s) は read: false (0 件と混ぜない)', (_label, body) => {
    expect(normalizeStripeBalance(body)).toEqual({ balances: [], read: false, livemode: null });
  });

  it('livemode は真偽値だけを受ける', () => {
    expect(normalizeStripeBalance({ available: [], livemode: 'true' }).livemode).toBeNull();
    expect(normalizeStripeBalance({ available: [], livemode: 1 }).livemode).toBeNull();
  });
});

describe('normalizeStripeCharges', () => {
  it('入金を行へ正規化する', () => {
    const r = normalizeStripeCharges({
      object: 'list',
      data: [
        { id: 'ch_1', amount: 18400, currency: 'JPY', status: 'succeeded', refunded: false, created: NOON_SECONDS, description: '注文 #1042' },
        { id: 'ch_2', amount: 6200, currency: 'jpy', status: 'succeeded', refunded: true, created: NOON_SECONDS, description: null },
      ],
    });
    expect(r).toEqual({
      charges: [
        { id: 'ch_1', amount: 18400, currency: 'jpy', status: 'succeeded', refunded: false, created: NOON_DATE, description: '注文 #1042' },
        { id: 'ch_2', amount: 6200, currency: 'jpy', status: 'succeeded', refunded: true, created: NOON_DATE, description: '' },
      ],
      read: true,
    });
  });

  it('★ 欄が欠けた行も落とさず、読めない欄だけを null / 空にする', () => {
    const r = normalizeStripeCharges({ data: [{}] });
    expect(r.charges).toEqual([
      { id: '', amount: null, currency: '', status: '', refunded: false, created: null, description: '' },
    ]);
    expect(r.read).toBe(true);
  });

  it('refunded は true のときだけ返金済み (真に見える値では立てない)', () => {
    const r = normalizeStripeCharges({ data: [{ refunded: 'true' }, { refunded: 1 }, { refunded: true }] });
    expect(r.charges.map((c) => c.refunded)).toEqual([false, false, true]);
  });

  it('★ 長い欄は天井で切る (説明 256 字・状態 32 字)', () => {
    const r = normalizeStripeCharges({ data: [{ id: 'i'.repeat(1000), status: 's'.repeat(1000), description: 'd'.repeat(1000) }] });
    const c = r.charges[0]!;
    expect(c.id).toBe(`${'i'.repeat(256)}…`);
    expect(c.status).toBe(`${'s'.repeat(32)}…`);
    expect(c.description).toBe(`${'d'.repeat(256)}…`);
  });

  it('行でない要素は飛ばす', () => {
    const r = normalizeStripeCharges({ data: [null, 'x', 3, [1], { id: 'ch_ok' }] });
    expect(r.charges.map((c) => c.id)).toEqual(['ch_ok']);
  });

  it.each([
    ['null', null],
    ['data が無い', {}],
    ['data が物', { data: { id: 'ch_1' } }],
    ['配列そのもの', [{ id: 'ch_1' }]],
  ])('★ 読めない応答 (%s) は read: false', (_label, body) => {
    expect(normalizeStripeCharges(body)).toEqual({ charges: [], read: false });
  });

  it('0 件と答えた応答は read: true', () => {
    expect(normalizeStripeCharges({ data: [] })).toEqual({ charges: [], read: true });
  });
});

describe('buildStripeSnapshot / stripeIntakeNote / stripeModeLabel', () => {
  it('2 つの応答を 1 つの形にする', () => {
    const snap = buildStripeSnapshot(
      { available: [{ amount: 1, currency: 'jpy' }], pending: [], livemode: false },
      { data: [{ id: 'ch_1', amount: 2, currency: 'jpy' }] },
    );
    expect(snap).toEqual({
      balances: [{ currency: 'jpy', available: 1, pending: null }],
      charges: [{ id: 'ch_1', amount: 2, currency: 'jpy', status: '', refunded: false, created: null, description: '' }],
      balanceRead: true,
      chargesRead: true,
      livemode: false,
    });
    expect(stripeIntakeNote(snap)).toBeNull();
  });

  it('★ 読めなかった一覧を名指しする (どちらが読めなかったかで文が違う)', () => {
    expect(stripeIntakeNote(buildStripeSnapshot(null, { data: [] }))).toBe(
      'Stripe の応答から残高を読み取れませんでした (0 件という意味ではありません)。',
    );
    expect(stripeIntakeNote(buildStripeSnapshot({ available: [] }, null))).toBe(
      'Stripe の応答から最近の入金を読み取れませんでした (0 件という意味ではありません)。',
    );
    expect(stripeIntakeNote(buildStripeSnapshot(null, null))).toBe(
      'Stripe の応答から残高と最近の入金を読み取れませんでした (0 件という意味ではありません)。',
    );
  });

  it('環境の語', () => {
    expect(stripeModeLabel(true)).toBe('本番');
    expect(stripeModeLabel(false)).toBe('テスト環境');
    expect(stripeModeLabel(null)).toBe('環境不明');
  });
});

describe('fetchStripeSnapshotWith', () => {
  it('★ 2 つの URL だけを、Bearer で、順に読む (書き込みの method は付けない)', async () => {
    const jsonFetch = vi
      .fn<(url: string, init: RequestInit) => Promise<unknown>>()
      .mockResolvedValueOnce({ available: [{ amount: 10, currency: 'jpy' }], pending: [], livemode: true })
      .mockResolvedValueOnce({ data: [{ id: 'ch_9', amount: 10, currency: 'jpy', status: 'succeeded' }] });

    const snap = await fetchStripeSnapshotWith(jsonFetch, 'rk_test_example');

    expect(jsonFetch.mock.calls).toEqual([
      ['https://api.stripe.com/v1/balance', { headers: { Authorization: 'Bearer rk_test_example' } }],
      ['https://api.stripe.com/v1/charges?limit=10', { headers: { Authorization: 'Bearer rk_test_example' } }],
    ]);
    expect(snap.balances).toEqual([{ currency: 'jpy', available: 10, pending: null }]);
    expect(snap.charges.map((c) => c.id)).toEqual(['ch_9']);
    expect(snap.livemode).toBe(true);
  });

  it('通信手段が投げたら、そのまま上へ出す (握り潰さない)', async () => {
    const jsonFetch = vi.fn<(url: string, init: RequestInit) => Promise<unknown>>().mockRejectedValue(new Error('401'));
    await expect(fetchStripeSnapshotWith(jsonFetch, 't')).rejects.toThrow(new Error('401'));
    expect(jsonFetch).toHaveBeenCalledTimes(1);
  });

  it('ヘッダは Authorization の 1 つだけ', () => {
    expect(stripeHeaders('k')).toEqual({ Authorization: 'Bearer k' });
  });
});
