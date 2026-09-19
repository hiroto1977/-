/** @vitest-environment jsdom */
/**
 * **「バックログ候補として記録します」と答えたなら、記録できたときだけそう言う。**
 *
 * `data/chatbot.ts` の要望受付の返事は「最高戦略責任者 (CSO) 配下のバックログ候補として
 * 記録します」と言い切る。2026-09-06 まで `recordRequest` は `catch {}` で書き込みの失敗を
 * 捨てていたので、容量超過やプライベートモードでは**記録しないまま言い切っていた**。
 * 同じファイルの `runIntent` には「`persisted: false` を見ずに『実行しました』と言うな
 * (2026-08 監査)」と書いてあるのに、こちらには掛かっていなかった。
 *
 * 測るのは**返事の文面**と**保存値**。書ける端末では警告が出ないことを対照に置く。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChatbotWidget } from '../ChatbotWidget';

const REQUESTS_KEY = 'chatbot-requests';
/** `REQUEST_MARKERS` の「作って」を含む文 —— 要望として受け付けられる。 */
const REQUEST_TEXT = '経費精算の機能を作ってほしい';

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

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

async function openWidget(): Promise<HTMLElement> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ChatbotWidget));
  });
  await settle();
  const launcher = Array.from(container.querySelectorAll('button')).find(
    (b) => b.getAttribute('aria-label') === 'AI コンシェルジュを開く',
  );
  if (!launcher) throw new Error('launcher not found');
  await act(async () => {
    launcher.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
  const dialog = container.querySelector('[role="dialog"]');
  if (!dialog) throw new Error('dialog not open');
  return dialog as HTMLElement;
}

async function ask(dialog: HTMLElement, text: string): Promise<void> {
  const input = dialog.querySelector('input[aria-label="チャット入力"]') as HTMLInputElement | null;
  if (!input) throw new Error('input not found');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const form = dialog.querySelector('form');
  if (!form) throw new Error('form not found');
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await settle();
}

/** 容量超過を模す。jsdom の `setItem` は実体ではなく `Storage.prototype` に在る。 */
function failWrites(name = 'QuotaExceededError'): void {
  const err = new Error(name);
  err.name = name;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw err;
  });
}

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (root) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
    root = null;
  }
  container.remove();
});

describe('要望の記録', () => {
  it('★ 記録できなかったら、その返事の中で断る', async () => {
    const dialog = await openWidget();
    failWrites();
    await ask(dialog, REQUEST_TEXT);
    expect(dialog.textContent).toContain('記録できませんでした');
    // 理由 (容量超過) と打ち手まで出す
    expect(dialog.textContent).toContain('保存領域が一杯');
  });

  it('★ プライベートモード (SecurityError) では別の打ち手を出す', async () => {
    const dialog = await openWidget();
    failWrites('SecurityError');
    await ask(dialog, REQUEST_TEXT);
    expect(dialog.textContent).toContain('記録できませんでした');
    expect(dialog.textContent).toContain('プライベートモード');
  });

  it('対照: 書ける端末では言い切ったまま、警告は出ない', async () => {
    const dialog = await openWidget();
    await ask(dialog, REQUEST_TEXT);
    expect(dialog.textContent).toContain('バックログ候補として記録します');
    expect(dialog.textContent).not.toContain('記録できませんでした');
  });

  it('対照: 書ける端末では保存値に実際に入る', async () => {
    const dialog = await openWidget();
    await ask(dialog, REQUEST_TEXT);
    const raw = localStorage.getItem(REQUESTS_KEY);
    expect(raw).not.toBeNull();
    expect(raw).toContain('経費精算');
  });

  it('壊れた保存値でも記録できる (空から積み直す)', async () => {
    localStorage.setItem(REQUESTS_KEY, '{壊れた JSON');
    const dialog = await openWidget();
    await ask(dialog, REQUEST_TEXT);
    expect(dialog.textContent).not.toContain('記録できませんでした');
    expect(localStorage.getItem(REQUESTS_KEY)).toContain('経費精算');
  });
});
