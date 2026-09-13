/** @vitest-environment jsdom */
/**
 * **Microsoft 365 の書き込み操作を 1 度は押す。** (2026-09-12 · パス 152)
 *
 * この画面は 2026-09-12 の全域計測で **32.05%** —— パス 151 の `StocksPage` に次いで
 * 低く、`signIn` / `sendMail` / `createEvent` の 3 つはどれも 1 度も走ったことが
 * なかった。押してみて分かったことを下の各検査に書く。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';

interface Call {
  readonly action: string;
  readonly payload: Record<string, unknown>;
}

let invoked: Call[];
let authorized: (string | undefined)[];
let opened: string[];
/** action の戻り値 (検査ごとに差し替える)。 */
let invokeResult: { ok: boolean; data?: Record<string, unknown>; code?: string; message?: string };
let authorizeResult: { ok: boolean; data?: unknown; code?: string; message?: string };

function stubHub(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: (_id: string, action: string, payload: Record<string, unknown>) => {
      invoked.push({ action, payload });
      return Promise.resolve(invokeResult);
    },
    authorize: (_id: string, clientId?: string) => {
      authorized.push(clientId);
      return Promise.resolve(authorizeResult);
    },
    openExternal: (url: string) => {
      opened.push(url);
      return Promise.resolve();
    },
    openPath: () => Promise.resolve({ ok: true }),
    revealInFolder: () => Promise.resolve({ ok: true }),
    oauthSupported: () => Promise.resolve(true),
    setToken: () => Promise.resolve({ ok: true }),
    clearToken: () => Promise.resolve({ ok: true }),
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'microsoft-365');
  if (!def) throw new Error('microsoft-365 service missing from the sidebar');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(text),
  );
  if (!found) throw new Error(`button "${text}" not found`);
  return found as HTMLButtonElement;
}

async function click(text: string): Promise<void> {
  const b = button(text);
  await act(async () => {
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
}

/**
 * React の制御 input / textarea へ値を入れる。
 *
 * **`el.value = …` だけでは駄目**で、React は値の変化を自前の tracker で見ているので
 * onChange が走らない (最初そう書いて 8 本落ちた —— 画面ではなく検査の誤り)。
 * プロトタイプ側の setter を使う (`StatusBar.credentials.test.ts` の作法)。
 */
function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** placeholder / aria-label で入力欄を引いて値を入れる。 */
async function type(selector: string, value: string): Promise<void> {
  const el = container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) throw new Error(`field ${selector} not found`);
  await act(async () => {
    setValue(el, value);
  });
  await settle();
}

beforeEach(() => {
  indexedDB.deleteDatabase('business-hub-data');
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  invoked = [];
  authorized = [];
  opened = [];
  invokeResult = { ok: true, data: { to: 'x@example.com' } };
  authorizeResult = { ok: true, data: {} };
  container = document.createElement('div');
  document.body.appendChild(container);
  stubHub();
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

describe('Microsoft 365 の書き込み操作 (カバレッジ 32.05% だった側 · パス 152)', () => {
  it('★ 走査が実物に当たる (かんたん接続とアクションの節が出ている)', async () => {
    await mount();
    expect(container.textContent).toContain('かんたん接続');
    expect(container.textContent).toContain('アクション (書き込み)');
    // クライアント ID が空ならサインインは押せない。
    expect(button('サインイン').disabled).toBe(true);
  });

  it('★ サインインはクライアント ID を渡し、成功を言い、次に備えて localStorage に残す', async () => {
    await mount();
    await type('[aria-label="Entra クライアント ID"]', '00000000-1111-2222-3333-444444444444');
    expect(button('サインイン').disabled).toBe(false);
    await click('サインイン');
    expect(authorized).toEqual(['00000000-1111-2222-3333-444444444444']);
    expect(container.textContent).toContain('サインインしました');
    expect(localStorage.getItem('ms365-client-id')).toBe('00000000-1111-2222-3333-444444444444');
  });

  it('★ サインインの失敗は理由を出す', async () => {
    authorizeResult = { ok: false, code: 'authorize_failed', message: 'ユーザーが取り消しました' };
    await mount();
    await type('[aria-label="Entra クライアント ID"]', 'abcdefgh');
    await click('サインイン');
    expect(container.textContent).toContain('ユーザーが取り消しました');
    expect(container.textContent).not.toContain('サインインしました');
  });

  it('★ メール送信は trim した値を渡し、成功したら欄を空にする', async () => {
    await mount();
    await click('メール送信');
    await type('[placeholder="宛先 (to@example.com)"]', '  a@example.com  ');
    await type('[placeholder="件名"]', '  ご連絡  ');
    await type('[placeholder="本文"]', '本文です');
    await click('送信');
    expect(invoked).toHaveLength(1);
    expect(invoked[0]?.action).toBe('send-mail');
    expect(invoked[0]?.payload).toEqual({ to: 'a@example.com', subject: 'ご連絡', body: '本文です' });
    expect(container.textContent).toContain('送信しました');
    // 成功したら欄は空に戻る (同じ宛先へ二重送信しにくくする)。
    expect((container.querySelector('[placeholder="宛先 (to@example.com)"]') as HTMLInputElement).value).toBe('');
  });

  it('★ 予定作成は datetime-local に秒を足して渡す (localToIso)', async () => {
    invokeResult = { ok: true, data: { webLink: 'https://outlook.office.com/calendar/item/1' } };
    await mount();
    await click('予定を作成');
    await type('[placeholder="件名"]', '打ち合わせ');
    const times = Array.from(container.querySelectorAll('input[type="datetime-local"]'));
    await act(async () => {
      setValue(times[0] as HTMLInputElement, '2026-09-20T10:00');
      setValue(times[1] as HTMLInputElement, '2026-09-20T11:00');
    });
    await settle();
    await click('作成');
    expect(invoked[0]?.action).toBe('create-event');
    expect(invoked[0]?.payload).toEqual({
      subject: '打ち合わせ',
      start: '2026-09-20T10:00:00',
      end: '2026-09-20T11:00:00',
      location: '',
    });
    expect(container.textContent).toContain('予定を作成しました');
  });

  it('★ 予定の webLink は openExternal で開く (https なので関門を通る)', async () => {
    // パス 151 の `file://` と対になる形 —— **こちらは正しく openExternal でよい。**
    invokeResult = { ok: true, data: { webLink: 'https://outlook.office.com/calendar/item/1' } };
    await mount();
    await click('予定を作成');
    await type('[placeholder="件名"]', 'x');
    const times = Array.from(container.querySelectorAll('input[type="datetime-local"]'));
    await act(async () => {
      setValue(times[0] as HTMLInputElement, '2026-09-20T10:00');
      setValue(times[1] as HTMLInputElement, '2026-09-20T11:00');
    });
    await settle();
    await click('作成');
    /*
     * **`includes('開く')` では案内リンクを掴む。** 最初そう書いて落ちた ——
     * この画面には「Entra「アプリの登録」を開く」「Graph Explorer を開く」が在り、
     * どちらも 開く を含む。結果の隣のリンクは**文面がちょうど「開く」**である。
     */
    const link = Array.from(container.querySelectorAll('a')).find((a) => (a.textContent ?? '').trim() === '開く');
    expect(link, '結果の「開く」リンクが出ていない').toBeTruthy();
    await act(async () => {
      link!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(opened).toEqual(['https://outlook.office.com/calendar/item/1']);
  });

  /*
   * **ここが今回の欠陥。** `result` は 1 つの state で、メールの節と予定の節の
   * **両方**が同じものを刷る。フォームを切り替えても消えないので、
   * 「送信しました → a@example.com」が**予定作成ボタンの隣**に出る。
   */
  it('★ 片方の結果が、もう片方のフォームに出ない', async () => {
    await mount();
    await click('メール送信');
    await type('[placeholder="宛先 (to@example.com)"]', 'a@example.com');
    await type('[placeholder="件名"]', 'ご連絡');
    await click('送信');
    expect(container.textContent).toContain('送信しました');

    // メールの節を閉じて予定の節を開く。
    await click('閉じる');
    await click('予定を作成');
    expect(
      container.textContent,
      'メール送信の結果が予定作成のフォームに残っている (どの操作の結果か読めない)',
    ).not.toContain('送信しました');
  });

  it('★ 対照: 同じフォームに留まっている間は結果が消えない', async () => {
    await mount();
    await click('メール送信');
    await type('[placeholder="宛先 (to@example.com)"]', 'a@example.com');
    await type('[placeholder="件名"]', 'ご連絡');
    await click('送信');
    expect(container.textContent).toContain('送信しました');
    // 本文を打ち直しても結果は残る (消し方が乱暴になっていないことの対照)。
    await type('[placeholder="本文"]', '追記');
    expect(container.textContent).toContain('送信しました');
  });

  it('★ action の失敗は理由を出し、欄を空にしない', async () => {
    invokeResult = { ok: false, code: 'action_failed', message: 'Graph が 403 を返しました' };
    await mount();
    await click('メール送信');
    await type('[placeholder="宛先 (to@example.com)"]', 'a@example.com');
    await type('[placeholder="件名"]', 'ご連絡');
    await click('送信');
    expect(container.textContent).toContain('Graph が 403 を返しました');
    // 失敗したら打ち込んだ物は残す (もう一度押せる)。
    expect((container.querySelector('[placeholder="宛先 (to@example.com)"]') as HTMLInputElement).value).toBe('a@example.com');
  });
});
