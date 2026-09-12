/** @vitest-environment jsdom */
/**
 * **Ollama 画面の入力欄は共有の天井を読み、handler の断りをそのまま見せる。** (2026-09-09 · パス 114)
 *
 * パス 112 の走査は「外へ出る印」で母集団を導いたので端末内の Ollama は入らず、
 * `OllamaPage` の prompt / system の欄には天井が無かった (handler は黙って切っていた)。
 * パス 113 はチャットボットの手写しの型を直したが、同じ形 `invoke<{ reply; durationMs }>` が
 * この画面にも在った。ここは**動かして**見る: 欄が共有の定数で**断る**こと、
 * `invoke` が断れば (文面は handler の物) その文面が画面に出ること、成功なら `reply` が出ること。
 *
 * ## `maxLength` から「切らずに断る」へ (2026-09-12 · パス 175)
 *
 * パス 114 はこの 2 欄に `maxLength={定数}` を置いた。**それが害だった** ——
 * 32,768 / 8,192 字は打って届く量ではないので、`maxLength` が発火するのは貼り付けのときだけで、
 * そのときブラウザは超過分を**黙って**落とす。つまり handler の断り
 * (`inputTooLongMessage` —— パス 114 が `slice` から直した当のもの) には**1 度も到達しない**。
 * この検査は間違いではなく**狭かった** ので、当てる形を変えた (削らずに広げる ——
 * 下の「断りが画面に出る」と「成功なら reply」はそのまま効いている)。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OllamaPage } from '../OllamaPage';
import { MAX_OLLAMA_PROMPT_CHARS, MAX_OLLAMA_SYSTEM_CHARS, MIN_SAFE_VERSION } from '../../../shared/ollama';
import { inputTooLongMessage } from '../../../shared/assistantLimits';

const MODEL = 'llama3.2:1b';
/** 接続済み + モデル 1 つ (fetchSnapshot が返す。既定の snapshot は「未起動」でチャット欄が開かない)。 */
const RUNNING = {
  running: true,
  version: '0.33.3',
  versionSafe: true,
  versionMinRecommended: MIN_SAFE_VERSION,
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
  it('★ prompt / system の欄は `maxLength` に任せない (パス 175 —— 貼り付けが黙って切れる)', async () => {
    await openChat();
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    const system = container.querySelector('input[placeholder="System prompt (任意)"]') as HTMLInputElement;
    expect(textarea.hasAttribute('maxlength'), 'prompt に maxLength が戻っている').toBe(false);
    expect(system.hasAttribute('maxlength'), 'system に maxLength が戻っている').toBe(false);
  });

  it('★ 代わりに共有の天井で断る (全文が残り、超過を述べ、送れない)', async () => {
    await openChat();
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    await setValue(textarea, HTMLTextAreaElement.prototype, 'あ'.repeat(MAX_OLLAMA_PROMPT_CHARS + 3), 'input');
    expect(textarea.value, '欄で切られている').toHaveLength(MAX_OLLAMA_PROMPT_CHARS + 3);
    const note = container.querySelector('[data-ceiling-notice="プロンプト"]');
    expect(note, '超えているのに何も言っていない').not.toBeNull();
    expect(note!.textContent).toContain(String(MAX_OLLAMA_PROMPT_CHARS));
    expect(note!.textContent).toContain('3 字超えています');
    const submit = buttons().find((b) => b.classList.contains('primary') && b.textContent === '送信');
    expect((submit as HTMLButtonElement).disabled, '超えているのに押せる').toBe(true);
  });

  it('★ System prompt の天井は別に数える (欄ごとに違う定数)', async () => {
    await openChat();
    const system = container.querySelector('input[placeholder="System prompt (任意)"]') as HTMLInputElement;
    await setValue(system, HTMLInputElement.prototype, 'い'.repeat(MAX_OLLAMA_SYSTEM_CHARS + 1), 'input');
    const note = container.querySelector('[data-ceiling-notice="システムプロンプト"]');
    expect(note, 'System 側の断りが出ていない').not.toBeNull();
    expect(note!.textContent).toContain(String(MAX_OLLAMA_SYSTEM_CHARS));
    // prompt 側の天井 (32,768) では鳴らない量である —— 定数を取り違えていないことの対照。
    expect(MAX_OLLAMA_SYSTEM_CHARS + 1).toBeLessThan(MAX_OLLAMA_PROMPT_CHARS);
    expect(container.querySelector('[data-ceiling-notice="プロンプト"]')).toBeNull();
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
