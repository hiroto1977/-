/** @vitest-environment jsdom */
/**
 * **背骨: 読む口が在る画面に、書く口が実際に在る** —— 実物の 3 画面を描いて
 * 鍵を打ち、保管層へ渡るところまで辿る (2026-09-24 · パス 451)。
 *
 * 隣の `shared/__tests__/credentialFaceCensus.test.ts` は綴りで数える
 * (`tokenSetup` を渡す画面が在るか)。それだけだと「渡してはいるが押せない」形が
 * 通るので、ここは**押して打って保存する**。
 *
 * 直す前、株式と事業ダッシュボードはこの欄を持たず、main は空の鍵を Anthropic へ
 * 送って相手の「鍵が不正」を画面に出していた (実測は
 * `shared/advisorQuestionLimits.ts` の docblock の表)。
 *
 * ★ **錠は構造で取る** —— 欄は畳まれて出る (ラベルはボタンの文字として先に在る) ので、
 * 押した**後に現れる `input[type=password]`** で待つ (パス 442 / 445 / 449 / 450 の罠)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { waitForElement } from '../../__tests__/jsdomWait';

const saved: { id: string; token: string }[] = [];

function stubHub(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'not_configured', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'not_configured', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: (id: string, token: string) => {
      saved.push({ id, token });
      return Promise.resolve({ ok: true });
    },
    clearToken: () => Promise.resolve({ ok: true }),
    storageProtection: () =>
      Promise.resolve({ ok: true, data: { encrypted: true, plainCount: 0, mechanism: 'test' } }),
    checkUpdate: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    revealInFolder: () => Promise.resolve(),
    openPath: () => Promise.resolve({ ok: true }),
    setColorScheme: () => Promise.resolve({ ok: true }),
    eraseAll: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    authorize: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  saved.length = 0;
  stubHub();
  if (!Element.prototype.scrollTo) {
    Object.defineProperty(Element.prototype, 'scrollTo', { value: () => {}, writable: true });
  }
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    await act(async () => r.unmount());
    root = null;
  }
  container.remove();
  vi.restoreAllMocks();
  try {
    localStorage.clear();
  } catch {
    /* 私有ウィンドウでは読めないことが在る */
  }
});

/** Anthropic の鍵を読む 3 サービス —— 母集団は client が `ctx.token` を読むこと。 */
const SERVICE_IDS = ['stocks', 'business', 'emotions'] as const;

describe('Anthropic の鍵を読む 3 画面には、鍵を書く欄が在る', () => {
  it.each(SERVICE_IDS)('★ %s: 押して打って保存すると、そのスロットへ届く', async (id) => {
    const def = SERVICES.find((s) => s.id === id);
    expect(def, `${id} がサイドバーに無い`).toBeDefined();
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(def!.page));
    });

    // ラベルはボタンの文字として先に在る (未設定なら `tokenSetup.label` そのまま)。
    const open = await waitForElement<HTMLButtonElement>(
      () =>
        Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
          (b) => b.textContent?.trim() === 'Anthropic API キー',
        ) ?? null,
      `${id}: 「Anthropic API キー」のボタン`,
    );
    await act(async () => open.click());

    // **押した後に現れる**欄で待つ (これが錠)。
    const field = await waitForElement<HTMLInputElement>(
      () => container.querySelector<HTMLInputElement>('input[type="password"]'),
      `${id}: 開いた後に現れる鍵の入力欄`,
    );
    expect(field.placeholder).toBe('sk-ant-…');
    expect(field.autocomplete).toBe('off');

    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    await act(async () => {
      setter?.call(field, 'sk-ant-probe');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === '保存',
    );
    expect(save, `${id}: 「保存」が無い`).toBeDefined();
    await act(async () => save!.click());

    expect(saved).toEqual([{ id, token: 'sk-ant-probe' }]);
  }, 20_000);
});
