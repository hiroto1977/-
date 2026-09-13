/** @vitest-environment jsdom */
/**
 * **「かんたん接続」カードを押す** (2026-09-12 · パス 155)。
 *
 * このカード (Drive / Calendar / Gmail の 3 画面が共有) は 2026-09-12 の全域計測で
 * **38.46%** —— `signIn` は 1 度も走ったことがなかった。押す前に読んで見つけた欠陥:
 *
 * カードの末尾は「クライアント ID は Drive / Calendar / Gmail で共通
 * （**1 回貼れば各ページで使えます**）」と書いている。**その約束は localStorage への
 * 保存に乗っている**のに、保存は `catch {}` で捨てられ、読み取りも
 * `catch { return '' }` で「未設定」に畳まれていた。プライベートウィンドウや
 * ブラウザ設定で Web Storage が拒まれる端末では、貼っても他の画面に持ち越せず、
 * 画面はそれを「できます」と書き続ける。
 *
 * (パス 152 で Microsoft 365 の同じ `catch {}` は**欠陥ではない**と裁定した ——
 *  あちらの画面は保存を約束していないから。**約束していないことは破れない**が、
 *  ここは約束している。同じ形でも文面で結論が変わる。)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GoogleConnectCard } from '../GoogleConnectCard';

const KEY = 'google-client-id';
const ID = '1234-abcd.apps.googleusercontent.com';

let authorized: { id: string; clientId: string | undefined }[];
let opened: string[];
let authorizeResult: { ok: boolean; data?: unknown; code?: string; message?: string };
let connected: number;

function stubHub(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    authorize: (id: string, clientId?: string) => {
      authorized.push({ id, clientId });
      return Promise.resolve(authorizeResult);
    },
    openExternal: (url: string) => {
      opened.push(url);
      return Promise.resolve();
    },
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(serviceId: 'drive' | 'calendar' | 'gmail' = 'drive'): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(GoogleConnectCard, { serviceId, onConnected: () => { connected += 1; } }));
  });
  await settle();
}

function field(): HTMLInputElement {
  const el = container.querySelector('[aria-label="Google OAuth クライアント ID"]');
  if (el === null) throw new Error('クライアント ID の欄が見つからない');
  return el as HTMLInputElement;
}

function signInButton(): HTMLButtonElement {
  const b = Array.from(container.querySelectorAll('button')).find((x) =>
    (x.textContent ?? '').includes('Google でサインイン'),
  );
  if (!b) throw new Error('サインインのボタンが見つからない');
  return b as HTMLButtonElement;
}

async function type(value: string): Promise<void> {
  const el = field();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
}

function notice(): string | null {
  const el = container.querySelector('[data-google-client-id-not-saved]');
  return el === null ? null : (el.textContent ?? '');
}

/** localStorage の 1 メソッドだけを投げるものに差し替える (prototype 側に置く)。 */
function breakStorage(method: 'getItem' | 'setItem', err: Error): () => void {
  const proto = Object.getPrototypeOf(window.localStorage) as Storage;
  const original = proto[method];
  (proto as unknown as Record<string, unknown>)[method] = () => {
    throw err;
  };
  return () => {
    (proto as unknown as Record<string, unknown>)[method] = original;
  };
}

let restore: (() => void) | null = null;

beforeEach(() => {
  localStorage.clear();
  authorized = [];
  opened = [];
  authorizeResult = { ok: true, data: {} };
  connected = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  stubHub();
});

afterEach(async () => {
  if (restore) {
    restore();
    restore = null;
  }
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

describe('Google かんたん接続カード (カバレッジ 38.46% だった側 · パス 155)', () => {
  it('★ 走査が実物に当たる: 保存できる端末では「1 回貼れば各ページで使えます」と言い、注意は出ない', async () => {
    await mount();
    expect(container.textContent).toContain('1 回貼れば各ページで使えます');
    expect(notice()).toBeNull();
  });

  it('保存済みの ID を初期値に出す (3 サービス共通の鍵から)', async () => {
    localStorage.setItem(KEY, ID);
    await mount('gmail');
    expect(field().value).toBe(ID);
    expect(signInButton().disabled).toBe(false);
  });

  it('ID が空ならサインインは押せない', async () => {
    await mount();
    expect(signInButton().disabled).toBe(true);
  });

  it('サインインは trim した ID を渡し、共通の鍵に保存して、成功を言う', async () => {
    await mount('calendar');
    await type(`  ${ID}  `);
    await click(signInButton());
    expect(authorized).toEqual([{ id: 'calendar', clientId: ID }]);
    expect(localStorage.getItem(KEY)).toBe(ID);
    expect(container.textContent).toContain('サインインしました');
    expect(connected).toBe(1);
    expect(notice()).toBeNull();
  });

  it('サインインの失敗は理由を出し、onConnected を呼ばない', async () => {
    authorizeResult = { ok: false, code: 'not_supported', message: 'クライアント ID が不正です' };
    await mount();
    await type(ID);
    await click(signInButton());
    expect(container.textContent).toContain('クライアント ID が不正です');
    expect(connected).toBe(0);
  });

  it('★ 読めない端末では「各ページで使えます」と言わず、貼り直しが要ると言う', async () => {
    restore = breakStorage('getItem', Object.assign(new Error('denied'), { name: 'SecurityError' }));
    await mount();
    const n = notice();
    expect(n).not.toBeNull();
    expect(n).toContain('この端末ではクライアント ID を保存できません');
    expect(n).toContain('SecurityError');
    expect(n).toContain('それぞれの画面で貼り直してください');
    // **約束そのものを取り下げる。** 「1 回貼れば」は出ない。
    expect(container.textContent).not.toContain('1 回貼れば各ページで使えます');
    expect(container.textContent).toContain('この端末では保存できないため、画面ごとに貼り直しが必要です');
  });

  it('★ 書けない端末ではサインインは通るが、保存できなかったと言う', async () => {
    await mount();
    await type(ID);
    restore = breakStorage('setItem', Object.assign(new Error('full'), { name: 'QuotaExceededError' }));
    await click(signInButton());
    // サインイン自体は止めない (トークンは別の保管層)。
    expect(authorized).toEqual([{ id: 'drive', clientId: ID }]);
    expect(container.textContent).toContain('サインインしました');
    // だが約束は取り下げる。文面は `data/localWrite.ts` の容量超過の枝。
    const n = notice();
    expect(n).toContain('保存領域が一杯で保存できませんでした');
    expect(container.textContent).not.toContain('1 回貼れば各ページで使えます');
  });

  it('★ 対照: 一度書けなかった後でも、書けるようになれば注意は消える', async () => {
    await mount();
    await type(ID);
    const undo = breakStorage('setItem', Object.assign(new Error('full'), { name: 'QuotaExceededError' }));
    await click(signInButton());
    expect(notice()).not.toBeNull();
    undo();
    await click(signInButton());
    expect(notice()).toBeNull();
    expect(container.textContent).toContain('1 回貼れば各ページで使えます');
  });

  /**
   * 案内のリンク 3 本は `href="#"` + `onClick` で、**`openExternal` を通す**
   * (リポジトリの規約: 外部リンクは OS のブラウザへ渡す)。`preventDefault()` を
   * 忘れると `#` への遷移が起きるので、既定が止まっていることも見る。
   */
  it('★ 案内の 3 リンクは openExternal を通り、ページ内遷移を起こさない', async () => {
    await mount();
    const links = Array.from(container.querySelectorAll('a')) as HTMLAnchorElement[];
    expect(links).toHaveLength(3);
    const defaults: boolean[] = [];
    for (const a of links) {
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
      await act(async () => {
        a.dispatchEvent(ev);
      });
      defaults.push(ev.defaultPrevented);
    }
    await settle();
    expect(opened).toEqual([
      'https://console.cloud.google.com/apis/credentials',
      'https://console.cloud.google.com/apis/library',
      'https://developers.google.com/oauthplayground',
    ]);
    // 3 本とも既定を止めている (href="#" への遷移をしない)。
    expect(defaults).toEqual([true, true, true]);
    // 送り先はすべて https (関門を通る形)。
    for (const url of opened) expect(url.startsWith('https://')).toBe(true);
  });

  it('★ 標本: 走査が実物の欄に当たる (壊していない端末では notice が無い = 規則が空振りしていない)', async () => {
    // 不在の主張には標本を添える —— 同じ検査の中で「出る側」も見る。
    await mount();
    expect(notice()).toBeNull();
    restore = breakStorage('getItem', Object.assign(new Error('x'), { name: 'SecurityError' }));
    const second = document.createElement('div');
    document.body.appendChild(second);
    const r2 = createRoot(second);
    await act(async () => {
      r2.render(createElement(GoogleConnectCard, { serviceId: 'drive' }));
    });
    await settle();
    expect(second.querySelector('[data-google-client-id-not-saved]')).not.toBeNull();
    await act(async () => {
      r2.unmount();
    });
    second.remove();
  });
});
