/** @vitest-environment jsdom */
/**
 * **Google OAuth の節を実際に押す** (2026-09-12 · パス 157)。
 *
 * `SettingsPage` の 2026-09-12 計測で、この節 (1607-1777 行) は**行カバレッジ 0%** ——
 * `start` も `complete` も一度も走ったことがなかった。押す前に読んで見つけた欠陥は
 * 2 つで、どちらも「画面の指示に従うと必ず失敗する」形である:
 *
 *  1. 説明文と placeholder は「認可後に表示される **code**」を求めるが、
 *     `parseGoogleCallback` は `code` と `state` の**両方**を要求する。
 *     しかも既定のリダイレクト URI (`urn:ietf:wg:oauth:2.0:oob`) は
 *     **構造上 state を持ち帰れない** —— 既定値のままではどうやっても完了できない。
 *  2. 生成した認可 URL は `authUrl` に入るが**画面には出ない** (段の切り替えにしか
 *     使っていない)。`openExternal` の失敗は main が記録だけ残して解決するので
 *     レンダラーに届かず、ブラウザが開かない端末では認可ページへ行く手が
 *     1 つも残らなかった。
 *
 * 直した形をここで押す。判定と文面は `oauth/callbackPaste.ts` に 1 組だけ置く。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GoogleOAuthSection } from '../SettingsPage';
import { LOOPBACK_REDIRECT_URI, OOB_REDIRECT_URI } from '../../oauth/callbackPaste';
import { readPkceSession } from '../../oauth/pkceSession';

let opened: string[];
let container: HTMLDivElement;
let root: Root | null = null;

function stubHub(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    openExternal: (url: string) => {
      opened.push(url);
      return Promise.resolve();
    },
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
  }
}

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(GoogleOAuthSection));
  });
  await settle();
}

function inputs(): HTMLInputElement[] {
  return Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
}

async function type(el: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

function button(label: string): HTMLButtonElement {
  const b = Array.from(container.querySelectorAll('button')).find((x) =>
    (x.textContent ?? '').includes(label),
  );
  if (!b) throw new Error(`ボタンが見つからない: ${label}`);
  return b as HTMLButtonElement;
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
}

/** クライアント ID を入れて「認可ページを開く」まで進める。 */
async function startFlow(redirect = LOOPBACK_REDIRECT_URI): Promise<void> {
  const [clientId, redirectField] = inputs();
  await type(clientId!, 'abc.apps.googleusercontent.com');
  if (redirect !== LOOPBACK_REDIRECT_URI) await type(redirectField!, redirect);
  await click(button('認可ページを開く'));
}

function text(): string {
  return container.textContent ?? '';
}

beforeEach(() => {
  opened = [];
  sessionStorage.clear();
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
  vi.unstubAllGlobals();
});

describe('Google OAuth の節 (カバレッジ 0% だった側 · パス 157)', () => {
  it('★ 既定のリダイレクト URI は http(s) —— 帯は出ない (標本: 規則が空振りしていない)', async () => {
    await mount();
    expect(inputs()[1]!.value).toBe(LOOPBACK_REDIRECT_URI);
    expect(container.querySelector('[data-redirect-unusable]')).toBeNull();
  });

  it('★ 以前の既定値 (OOB) を入れると、押す前に理由が出る', async () => {
    await mount();
    await type(inputs()[1]!, OOB_REDIRECT_URI);
    const band = container.querySelector('[data-redirect-unusable]');
    expect(band).not.toBeNull();
    expect(band!.textContent).toContain('完了できません');
    expect(band!.textContent).toContain('state');
  });

  it('★ OOB のまま押しても認可ページを開かない (往復させてから断らない)', async () => {
    await mount();
    await startFlow(OOB_REDIRECT_URI);
    expect(opened).toEqual([]);
    // 秘密も作らない (消す物を増やさない)。
    expect(readPkceSession()).toBeNull();
    expect(text()).toContain('完了できません');
  });

  it('クライアント ID が空なら押しても何も起きない', async () => {
    await mount();
    await click(button('認可ページを開く'));
    expect(opened).toEqual([]);
    expect(text()).toContain('Client ID を入力してください');
  });

  it('★ 認可 URL は画面に出る (ブラウザが開かなかった端末の唯一の手)', async () => {
    await mount();
    await startFlow();
    expect(opened).toHaveLength(1);
    const shown = container.querySelector('[data-google-auth-url]');
    expect(shown).not.toBeNull();
    // **画面に出る URL と、OS へ渡した URL は同じ物。**
    expect(shown!.textContent).toBe(opened[0]);
    expect(shown!.textContent).toContain('https://accounts.google.com/o/oauth2/v2/auth?');
    expect(shown!.textContent).toContain('code_challenge_method=S256');
    expect(shown!.textContent).toContain(`redirect_uri=${encodeURIComponent(LOOPBACK_REDIRECT_URI)}`);
  });

  it('★ 2 段目の指示は URL 全体を求める (「code」だけを求めない)', async () => {
    await mount();
    await startFlow();
    expect(text()).toContain('アドレスバー');
    expect(text()).toContain('code だけでは完了できません');
    const paste = inputs().find((i) => i.placeholder.includes('state='));
    expect(paste, 'placeholder が state= を含む欄が無い').toBeDefined();
  });

  it('★ 生の認可コードを貼ると、「それでは完了できない」と名指しで出る', async () => {
    await mount();
    await startFlow();
    const paste = inputs().find((i) => i.placeholder.includes('state='))!;
    await type(paste, '4/0AbCdEfGhIjKlMn');
    await click(button('token を取得して保存'));
    expect(text()).toContain('認可コードだけ');
    expect(text()).toContain('URL 全体');
  });

  it('code だけの URL を貼ると、欠けているのが state だと言う', async () => {
    await mount();
    await startFlow();
    const paste = inputs().find((i) => i.placeholder.includes('state='))!;
    await type(paste, 'http://localhost/?code=4%2F0Ab');
    await click(button('token を取得して保存'));
    expect(text()).toContain('state がありません');
    expect(text()).toContain('CSRF');
  });

  it('空欄で押すと、求める物 (URL 全体) を言う', async () => {
    await mount();
    await startFlow();
    await click(button('token を取得して保存'));
    expect(text()).toContain('URL 全体');
  });

  it('★ state が違う URL は CSRF として断る (交換へ進まない)', async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchSpy);
    await mount();
    await startFlow();
    const paste = inputs().find((i) => i.placeholder.includes('state='))!;
    await type(paste, 'http://localhost/?code=4%2F0Ab&state=not-the-one');
    await click(button('token を取得して保存'));
    expect(text()).toContain('state が一致しません');
    // **token エンドポイントへは行かない。**
    expect(fetchSpy).not.toHaveBeenCalled();
    // 一時秘密は成否によらず捨てる (verifier は単回使用)。
    expect(readPkceSession()).toBeNull();
  });

  it('★ 交換が失敗しても「交換中…」で固まらず、理由が出て秘密は消える', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'invalid_grant' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );
    await mount();
    await startFlow();
    const saved = readPkceSession();
    expect(saved).not.toBeNull();
    const paste = inputs().find((i) => i.placeholder.includes('state='))!;
    await type(paste, `http://localhost/?code=4%2F0Ab&state=${encodeURIComponent(saved!.state)}`);
    await click(button('token を取得して保存'));
    // ボタンは押せる状態に戻っている (`finally` の setBusy(false) が飛んでいない)。
    expect(button('token を取得して保存').disabled).toBe(false);
    expect(text()).toContain('invalid_grant');
    expect(readPkceSession()).toBeNull();
  });

  it('★ キャンセルは 1 段目に戻し、一時秘密を 4 つまとめて消す', async () => {
    await mount();
    await startFlow();
    expect(readPkceSession()).not.toBeNull();
    await click(button('キャンセル'));
    expect(readPkceSession()).toBeNull();
    // 1 段目に戻っている (認可 URL の表示は消え、「認可ページを開く」が在る)。
    expect(container.querySelector('[data-google-auth-url]')).toBeNull();
    expect(() => button('認可ページを開く')).not.toThrow();
  });

  it('★ 保存できない端末では、認可ページを開く前に理由を出して止まる', async () => {
    // `savePkceSession` が投げる形 (プライベートウィンドウ・Web Storage 拒否)。
    const proto = Object.getPrototypeOf(window.sessionStorage) as Storage;
    const original = proto.setItem;
    (proto as unknown as Record<string, unknown>).setItem = () => {
      throw Object.assign(new Error('denied'), { name: 'SecurityError' });
    };
    try {
      await mount();
      await startFlow();
      // 開かない (開いてから「保存できませんでした」と言うと、認可が無駄になる)。
      expect(opened).toEqual([]);
      expect(container.querySelector('[data-google-auth-url]')).toBeNull();
      expect(text()).toMatch(/SecurityError|保存/);
    } finally {
      (proto as unknown as Record<string, unknown>).setItem = original;
    }
  });
});
