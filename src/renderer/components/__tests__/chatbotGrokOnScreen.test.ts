/**
 * @vitest-environment jsdom
 *
 * 実物の AI コンシェルジュを描いて、**既定の提供者が Grok のとき自由質問が Grok へ行く**ことを見る
 * (2026-11-04)。Ollama は呼ばれず、送る前に送り先を名乗り、断りは画面に出る。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChatbotWidget } from '../ChatbotWidget';
import { CONCIERGE_SYSTEM_PROMPT, GROK_LABEL } from '../../data/chatbotGrok';
import { waitForElement, waitForText } from '../../__tests__/jsdomWait';

if (!('scrollTo' in Element.prototype)) {
  (Element.prototype as unknown as Record<string, unknown>).scrollTo = () => {};
}

const toGrok = (c: Call): boolean =>
  c.service === 'assistant' && c.action === 'chat' && (c.payload as { provider?: string }).provider === 'grok';

const FREE_QUESTION = '量子力学について教えて';

interface Call {
  readonly service: string;
  readonly action: string;
  readonly payload: unknown;
}

function installBridge(opts: { grokDefault: boolean; chat: 'reply' | 'refuse' }): Call[] {
  const calls: Call[] = [];
  (window as unknown as Record<string, unknown>).serviceHub = {
    fetchSnapshot: async () => ({ ok: true, data: { models: [{ name: 'llama3.2:1b' }] } }),
    invoke: async (service: string, action: string, payload: unknown) => {
      calls.push({ service, action, payload });
      if (service === 'assistant' && action === 'providers') {
        return {
          ok: true,
          data: {
            providers: [
              { id: 'anthropic', configured: true, isDefault: !opts.grokDefault },
              { id: 'grok', configured: true, isDefault: opts.grokDefault },
            ],
          },
        };
      }
      if (service === 'assistant' && action === 'chat') {
        // 提供者を指名しない自由質問は、端末の LiteLLM (purpose: concierge) へ行く。
        if ((payload as { provider?: string }).provider !== 'grok') {
          return { ok: true, data: { text: 'これは Ollama の答えです', model: 'balanced', provider: 'compat' } };
        }
        return opts.chat === 'reply'
          ? { ok: true, data: { text: 'これは Grok の答えです', model: 'grok-4', provider: 'grok' } }
          : { ok: false, code: 'x', message: 'xAI API 401: bad key' };
      }
      return { ok: false, code: 'x', message: 'x' };
    },
  };
  return calls;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove();
  root = null;
  container = null;
  delete (window as unknown as Record<string, unknown>).serviceHub;
  localStorage.clear();
});

async function open(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const el = container;
  await act(async () => {
    root = createRoot(el);
    root.render(createElement(ChatbotWidget));
  });
  const fab = await waitForElement(() => el.querySelector('button'), 'AI コンシェルジュのボタン');
  await act(async () => { fab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await waitForElement(() => el.querySelector('input'), 'チャットの入力欄');
  return el;
}

async function ask(el: HTMLElement): Promise<void> {
  const input = el.querySelector('input')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, FREE_QUESTION);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const send = await waitForElement(
    () => Array.from(el.querySelectorAll('button')).find((b) => b.textContent === '送信') ?? null,
    '送信ボタン',
  );
  await act(async () => { send.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('AI コンシェルジュ × Grok', () => {
  it('★ 既定が Grok: 送る前に送り先を名乗り、質問は Grok へ行き、Ollama は呼ばれない', async () => {
    const calls = installBridge({ grokDefault: true, chat: 'reply' });
    const el = await open();
    await waitForElement(() => el.querySelector('[data-grok-egress]'), 'Grok の送り先の断り');
    // 断りは共有の `AiEgressNotice` (送り先を名乗る)。自前の文面ではない。
    expect(el.querySelector('[data-grok-egress] [data-ai-egress]')!.textContent).toContain(GROK_LABEL);
    await ask(el);
    await waitForText(() => el.textContent ?? '', 'これは Grok の答えです');
    const chat = calls.filter((c) => c.service === 'assistant' && c.action === 'chat');
    expect(chat).toHaveLength(1); // Grok へ 1 回だけ。端末の LiteLLM へは回さない
    expect(chat[0]!.payload).toEqual({
      provider: 'grok',
      system: CONCIERGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: FREE_QUESTION }],
    });
    expect(el.textContent ?? '').toContain(GROK_LABEL);
  });

  it('★ 既定が別の提供者: 断りは出ず、質問は端末の LiteLLM へ行き、xAI へは送らない', async () => {
    const calls = installBridge({ grokDefault: false, chat: 'reply' });
    const el = await open();
    await ask(el);
    await waitForText(() => el.textContent ?? '', 'これは Ollama の答えです');
    expect(el.querySelector('[data-grok-egress]')).toBeNull();
    expect(calls.some(toGrok)).toBe(false);
  });

  it('★ Grok に断られたら、原因と逃げ口が画面に出る (Ollama へ黙って回さない)', async () => {
    installBridge({ grokDefault: true, chat: 'refuse' });
    const el = await open();
    await ask(el);
    await waitForText(() => el.textContent ?? '', 'Grok が答えませんでした');
    const t = el.textContent ?? '';
    expect(t).toContain('xAI API 401: bad key');
    expect(t).toContain('エージェント設定');
  });

  it('★ 提供者の一覧を読めないときは端末の LiteLLM のまま (分からないのに外へ送らない)', async () => {
    const calls = installBridge({ grokDefault: true, chat: 'reply' });
    const hub = (window as unknown as { serviceHub: { invoke: (...a: unknown[]) => Promise<unknown> } }).serviceHub;
    const orig = hub.invoke;
    hub.invoke = async (s: unknown, a: unknown, p: unknown) =>
      s === 'assistant' && a === 'providers' ? { ok: false, code: 'x', message: 'x' } : orig(s, a, p);
    const el = await open();
    await ask(el);
    await waitForText(() => el.textContent ?? '', 'これは Ollama の答えです');
    expect(calls.some(toGrok)).toBe(false);
  });
});
