/** @vitest-environment jsdom */
/**
 * **コンシェルジュのボタンは、読み上げの名前が 1 つずつ違う** (2026-09-27)。
 *
 * 浮いた窓を開くと、見出しの ✕ と右下の 🤖 (開いているときは閉じるボタン) がデスクトップでは
 * 2 つとも見える。直す前は 2 つとも「チャットを閉じる」で、支援技術は同じ名前のボタンを 2 つ読み、
 * 名前で押す人 (と e2e の `getByRole`) はどちらか決められなかった (Playwright の strict は 2 件に当たる)。
 * 動作は同じなので害は小さいが、名前は「どのボタンか」を言うためにある。
 *
 * 見るのは**開いた状態の全ボタン**の名前 (aria-label、無ければ文字)。重複を拾う関数そのものが
 * 生きていることは、直す前の組を標本にして同じ `it` で確かめる。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChatbotWidget } from '../ChatbotWidget';
import { waitForElement } from '../../__tests__/jsdomWait';

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    if (typeof (Element.prototype as unknown as Record<string, unknown>)[name] !== 'function') {
      Object.defineProperty(Element.prototype, name, { value: () => undefined, configurable: true, writable: true });
    }
  }
});

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
    root = null;
  }
  container.remove();
});

const nameOf = (b: HTMLButtonElement): string => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim();

function duplicates(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) dup.add(n);
    seen.add(n);
  }
  return [...dup];
}

describe('コンシェルジュ —— ボタンの読み上げの名前', () => {
  it('★ 浮いた窓を開いた状態で、どのボタンも名前が違う (見出しの ✕ と右下の閉じるボタンを含む)', async () => {
    expect(duplicates(['チャットを閉じる', 'チャットを閉じる', '送信']), '標本: 直す前の組は重複として拾う').toEqual([
      'チャットを閉じる',
    ]);

    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(ChatbotWidget));
    });
    const launcher = await waitForElement(
      () => container.querySelector<HTMLButtonElement>('button[aria-label="AI コンシェルジュを開く"]'),
      '🤖 の入口',
    );
    await act(async () => {
      launcher.click();
    });
    await waitForElement(() => container.querySelector('[role="dialog"]'), 'コンシェルジュの窓');

    const names = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).map(nameOf);
    expect(names, '見出しの ✕ が在る').toContain('コンシェルジュを閉じる');
    expect(names, '右下の閉じるボタンが在る').toContain('チャットを閉じる');
    expect(duplicates(names)).toEqual([]);
  });
});
