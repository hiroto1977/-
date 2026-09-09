/** @vitest-environment jsdom */
/**
 * **Ollama の答えが画面に出る。** (2026-09-09 · パス 113)
 *
 * チャットボットの自由質問は Ollama 接続時に `invoke('ollama','chat')` へ落ちる。その戻り値を
 * `{ response?, message? }` と**手で写した型**で読んでおり、両ビルドの実物 (`{ reply, durationMs }`)
 * と食い違っていた —— 答えは常に空として捨てられ、「うまく解釈できませんでした」だけが出ていた。
 * `tsc` は手写しの型に黙る (パス 62 と同じ形)。ここは**動かして**見る: `reply` を返す stub で
 * 🧠 の吹き出しが出ること、そして (対照) 失敗なら定型文が出ること。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChatbotWidget } from '../ChatbotWidget';

/** どの定型にも当たらない文 —— `replyTo` は `fallback` を返す。 */
const FREE_QUESTION = 'ゾウの妊娠期間はどれくらい';
const LLM_ANSWER = 'およそ 22 か月です。';

let invokeResult: { ok: true; data: unknown } | { ok: false; code: string; message: string } = {
  ok: true,
  data: { reply: LLM_ANSWER, durationMs: 12 },
};
const invoke = vi.fn(() => Promise.resolve(invokeResult));

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke,
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

beforeEach(() => {
  localStorage.clear();
  invoke.mockClear();
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

describe('チャットボットの自由質問 → Ollama', () => {
  it('★ handler が返した reply が 🧠 の吹き出しとして出る (2026-09-09 まで 1 度も出なかった)', async () => {
    invokeResult = { ok: true, data: { reply: LLM_ANSWER, durationMs: 12 } };
    const dialog = await openWidget();
    await ask(dialog, FREE_QUESTION);
    expect(invoke).toHaveBeenCalledWith('ollama', 'chat', expect.objectContaining({ prompt: FREE_QUESTION }));
    expect(dialog.textContent).toContain(`🧠 ${LLM_ANSWER}`);
    expect(dialog.textContent).not.toContain('うまく解釈できませんでした');
  });

  it('★ 対照: Ollama が失敗すれば定型の案内が出る (吹き出しをでっち上げない)', async () => {
    invokeResult = { ok: false, code: 'ollama_unreachable', message: 'x' };
    const dialog = await openWidget();
    await ask(dialog, FREE_QUESTION);
    expect(dialog.textContent).toContain('うまく解釈できませんでした');
    expect(dialog.textContent).not.toContain('🧠');
  });

  it('★ 対照: 空の reply は答えとして出さない', async () => {
    invokeResult = { ok: true, data: { reply: '   ', durationMs: 1 } };
    const dialog = await openWidget();
    await ask(dialog, FREE_QUESTION);
    expect(dialog.textContent).toContain('うまく解釈できませんでした');
  });
});
