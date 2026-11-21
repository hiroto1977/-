// @vitest-environment jsdom
/**
 * Stripe の画面 (2026-11-18) —— 実物の client に応答を食わせ、その戻りで画面を描く。
 *
 * 算定の正しさは `shared/api/__tests__/stripe.test.ts` が持つ。ここが見るのは**配線**:
 * 通貨の桁・読めない欄の理由・「0 件」と「読めなかった」の言い分けが画面に届くこと、
 * そして画面に書き込みの操作子が無いこと。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StripePage } from '../StripePage';
import { fetchStripeSnapshot } from '../../../main/clients/stripe';
import { waitForText } from '../../__tests__/jsdomWait';
import { WEB_BUILD_SUFFIX } from '../../../shared/buildDestinations';

/** 相手の応答を順に返す `fetch`。 */
function replying(bodies: readonly unknown[]): typeof fetch {
  let i = 0;
  return (async () => {
    const body = bodies[Math.min(i++, bodies.length - 1)];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}

let container: HTMLDivElement;
let root: Root | null = null;
let invoke: ReturnType<typeof vi.fn>;

async function mount(
  Page: ComponentType,
  configured: boolean,
  data: unknown,
  waitFor: string,
  version: string | null = '0.1.0',
): Promise<string> {
  invoke = vi.fn(() => Promise.resolve({ ok: true, data: {} }));
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    // `null` は「実行形態がまだ分からない」(橋が答えない) 状態を作る。
    getVersion: () => (version === null ? new Promise<string>(() => {}) : Promise.resolve(version)),
    listConfigured: () => Promise.resolve(configured ? ['stripe'] : []),
    fetchSnapshot: () => Promise.resolve({ ok: true, data }),
    invoke,
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(Page));
  });
  await waitForText(() => container.textContent ?? '', waitFor);
  return container.textContent ?? '';
}

const live = async (bodies: readonly unknown[]): Promise<unknown> =>
  fetchStripeSnapshot({ token: 'rk_test_example', fetch: replying(bodies) });

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root !== null) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

describe('Stripe の画面: 鍵を登録する前 (同梱の見本)', () => {
  it('見本の残高と入金を出し、鍵の作り方 (読み取り専用の制限付きキー) を案内する', async () => {
    const t = await mount(StripePage, false, null, '残高');
    expect(t).toContain('利用可能 ¥128,400 · 入金待ち ¥36,200');
    expect(t).toContain('¥18,400');
    expect(t).toContain('見本: オンライン注文');
    expect(t).toContain('返金済み');
    expect(t).toContain('失敗');
    expect(container.querySelector('[data-stripe-key-guide]')?.textContent).toContain('制限付きキー');
    expect(container.querySelector('[data-stripe-key-guide]')?.textContent).toContain('返金や請求の作成はしません');
    expect(container.querySelector('[data-stripe-intake-note]')).toBeNull();
  });
});

describe('Stripe の画面: 実物の client の戻りを描く', () => {
  it('★ ドルの入金は 100 で割った額で出る (最小単位のまま刷らない)', async () => {
    const data = await live([
      { available: [{ amount: 418000, currency: 'usd' }], pending: [{ amount: 5, currency: 'usd' }], livemode: true },
      { data: [{ id: 'ch_usd', amount: 2599, currency: 'usd', status: 'succeeded', refunded: false, created: 1794830400, description: 'Order 7' }] },
    ]);
    const t = await mount(StripePage, true, data, 'Order 7');
    expect(t).toContain('利用可能 4,180.00 USD · 入金待ち 0.05 USD');
    expect(t).toContain('25.99 USD');
    expect(t).not.toContain('2599');
    expect(t).toContain('本番');
    expect(t).toContain('成功');
  });

  it('★ 金額・日付が欠けた入金は、0 や空欄にせず理由を出す (画面は落ちない)', async () => {
    const data = await live([
      { available: [{ currency: 'jpy' }], pending: [], livemode: false },
      { data: [{ id: 'ch_broken', currency: 'jpy', status: 'succeeded' }] },
    ]);
    const t = await mount(StripePage, true, data, '金額不明');
    expect(t).toContain('利用可能 金額不明 · 入金待ち 金額不明');
    expect(t).toContain('日付が読めません');
    expect(t).toContain('テスト環境');
    expect(t).not.toContain('¥0');
  });

  it('★ 一覧が読めなかった応答は「0 件」と混ぜずに ⚠ で述べる', async () => {
    const data = await live([{}, {}]);
    const t = await mount(StripePage, true, data, '読み取れませんでした');
    const note = container.querySelector('[data-stripe-intake-note]');
    expect(note?.getAttribute('role')).toBe('alert');
    expect(note?.textContent).toContain('残高と最近の入金を読み取れませんでした (0 件という意味ではありません)');
    expect(t).toContain('環境不明');
  });

  it('0 件と答えた応答では ⚠ を出さず、「入金はまだありません」と言う', async () => {
    const data = await live([{ available: [], pending: [] }, { data: [] }]);
    const t = await mount(StripePage, true, data, '入金はまだありません');
    expect(container.querySelector('[data-stripe-intake-note]')).toBeNull();
    expect(t).toContain('残高の行がありません');
  });

  it('★ 画面は読むだけ —— 書き込みの action を 1 つも呼ばない', async () => {
    const data = await live([{ available: [], pending: [] }, { data: [] }]);
    await mount(StripePage, true, data, '入金はまだありません');
    expect(invoke).not.toHaveBeenCalled();
    // 入力欄は資格情報の 1 つだけ (畳まれている間は 0)。金額や宛先を打つ欄は無い。
    expect(container.querySelectorAll('input:not([type=password]), textarea, select')).toHaveLength(0);
  });
});

describe('Stripe の画面: ブラウザ版はプロキシが要ると、押す前に述べる', () => {
  it('★ ブラウザ版では、プロキシの登録と許可リストへの追加を案内する', async () => {
    await mount(StripePage, false, null, 'api.stripe.com', `0.1.0${WEB_BUILD_SUFFIX}`);
    const note = container.querySelector('[data-stripe-proxy-note]');
    expect(note?.textContent).toContain('「BYO プロキシ」');
    expect(note?.textContent).toContain('api.stripe.com');
    // 案内は鍵の欄より前に在る (押してから知る形にしない)。
    const field = container.querySelector('[data-stripe-key-guide]');
    expect(field).not.toBeNull();
  });

  it('対照: デスクトップ版では述べない (直接つなぐので、プロキシを建てさせない)', async () => {
    const t = await mount(StripePage, false, null, '残高');
    // 実行形態の判定が終わるのを待つ印: 画面の鍵の案内は出ている。
    expect(t).toContain('制限付きキー');
    expect(container.querySelector('[data-stripe-proxy-note]')).toBeNull();
  });

  it('対照: 実行形態がまだ分からない間も述べない (間違って述べるより 1 フレーム遅れて述べる)', async () => {
    const t = await mount(StripePage, false, null, '残高', null);
    expect(t).toContain('制限付きキー');
    expect(container.querySelector('[data-stripe-proxy-note]')).toBeNull();
  });
});
