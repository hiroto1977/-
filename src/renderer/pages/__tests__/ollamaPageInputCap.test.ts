/** @vitest-environment jsdom */
/**
 * **Ollama 画面の入力欄は共有の天井を読み、handler の断りをそのまま見せる。** (2026-09-09 · パス 114)
 *
 * パス 112 の走査は「外へ出る印」で母集団を導いたので端末内の Ollama は入らず、
 * `OllamaPage` の prompt / system の欄には天井が無かった (handler は黙って切っていた)。
 * パス 113 はチャットボットの手写しの型を直したが、同じ形 `invoke<{ reply; durationMs }>` が
 * この画面にも在った。ここは**動かして**見る: 欄の `maxLength` が共有の定数と同じこと、
 * `invoke` が断れば (文面は handler の物) その文面が画面に出ること、成功なら `reply` が出ること。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OllamaPage } from '../OllamaPage';
import { MAX_OLLAMA_PROMPT_CHARS, MAX_OLLAMA_SYSTEM_CHARS } from '../../../shared/ollama';
import { inputTooLongMessage } from '../../../shared/assistantLimits';

const MODEL = 'llama3.2:1b';
/** 接続済み + モデル 1 つ (fetchSnapshot が返す。既定の snapshot は「未起動」でチャット欄が開かない)。 */
const RUNNING = {
  running: true,
  version: '0.6.0',
  versionSafe: true,
  versionMinRecommended: '0.1.46',
  models: [
    { name: MODEL, family: 'llama', parameterSize: '1B', quantization: 'Q4_K_M', sizeMb: 1300, modifiedAt: '2026-09-01' },
  ],
  warnings: [] as string[],
};

let invokeResult: { ok: true; data: unknown } | { ok: false; code: string; message: string } = {
  ok: true,
  data: { reply: 'こんにちは', durationMs: 5 },
};
const invoke = vi.fn(() => Promise.resolve(invokeResult));

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: RUNNING }),
    invoke,
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
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

function buttons(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button'));
}

/** 画面を描き、「チャット」節を開く。 */
async function openChat(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(OllamaPage));
  });
  await settle();
  // 節の開閉ボタン (送信フォームの `.primary` ではない方)。
  const toggle = buttons().find((b) => b.textContent === '送信' && !b.classList.contains('primary'));
  if (!toggle) throw new Error('chat toggle not found');
  expect(toggle.disabled, 'fetchSnapshot の running / models が画面に届いていない').toBe(false);
  await act(async () => {
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
}

function setValue(el: HTMLElement, proto: object, value: string, event: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  return act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event(event, { bubbles: true }));
  });
}

async function send(prompt: string): Promise<void> {
  const select = container.querySelector('select') as HTMLSelectElement | null;
  const textarea = container.querySelector('textarea') as HTMLTextAreaElement | null;
  if (!select || !textarea) throw new Error('chat form not found');
  await setValue(select, HTMLSelectElement.prototype, MODEL, 'change');
  await setValue(textarea, HTMLTextAreaElement.prototype, prompt, 'input');
  const submit = buttons().find((b) => b.classList.contains('primary') && b.textContent === '送信');
  if (!submit) throw new Error('submit not found');
  await act(async () => {
    submit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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

describe('OllamaPage のチャット欄', () => {
  it('★ prompt / system の欄は共有の天井を maxLength に読む (数を写していない)', async () => {
    await openChat();
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    const system = container.querySelector('input[placeholder="System prompt (任意)"]') as HTMLInputElement;
    expect(textarea.maxLength).toBe(MAX_OLLAMA_PROMPT_CHARS);
    expect(system.maxLength).toBe(MAX_OLLAMA_SYSTEM_CHARS);
  });

  it('★ handler の断り (天井超え) はその文面のまま画面に出る', async () => {
    const message = inputTooLongMessage('プロンプト', MAX_OLLAMA_PROMPT_CHARS);
    invokeResult = { ok: false, code: 'ollama_too-long', message };
    await openChat();
    await send('長い質問');
    expect(invoke).toHaveBeenCalledWith('ollama', 'chat', { model: MODEL, prompt: '長い質問', system: undefined });
    expect(container.textContent).toContain(message);
  });

  it('★ 対照: 成功なら共有の型の reply が応答として出る (手写しの欄を読んでいない)', async () => {
    invokeResult = { ok: true, data: { reply: 'およそ 22 か月です。', durationMs: 12 } };
    await openChat();
    await send('ゾウの妊娠期間は');
    expect(container.textContent).toContain('およそ 22 か月です。');
    expect(container.textContent).toContain('応答 (12ms)');
  });
});
