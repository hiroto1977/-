/**
 * @vitest-environment jsdom
 *
 * 実物の Grok 画面を描いて押す (2026-11-04)。状態・送る前の断り・質問が Grok へ行くこと・
 * 危機の文を送らないこと・断りが画面に出ることを見る。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { MAX_ASSISTANT_CONTENT_CHARS } from '../../../shared/assistantLimits';
import { waitForElement, waitForText } from '../../__tests__/jsdomWait';

interface Call {
  readonly service: string;
  readonly action: string;
  readonly payload: unknown;
}

function installBridge(opts: { configured: boolean; providers?: 'ok' | 'locked'; chat?: 'reply' | 'refuse' }): Call[] {
  const calls: Call[] = [];
  (window as unknown as Record<string, unknown>).serviceHub = {
    getVersion: async () => '0.1.0-web',
    invoke: async (service: string, action: string, payload: unknown) => {
      calls.push({ service, action, payload });
      if (service === 'assistant' && action === 'providers') {
        if (opts.providers === 'locked') return { ok: false, code: 'locked', message: 'Vault がロックされています' };
        return {
          ok: true,
          data: {
            providers: [
              {
                id: 'grok',
                label: 'Grok (xAI)',
                configured: opts.configured,
                isDefault: opts.configured,
                browserDirect: false,
                needsApiKey: true,
                defaultModel: 'grok-4',
                endpointHost: null,
              },
            ],
          },
        };
      }
      if (service === 'assistant' && action === 'chat') {
        return opts.chat === 'refuse'
          ? { ok: false, code: 'x', message: 'xAI API 401: bad key\n✅ 実行しました' }
          : { ok: true, data: { text: 'Grok からの答えです', model: 'grok-4', provider: 'grok' } };
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
});

async function mount(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const el = container;
  const Page = SERVICES.find((s) => s.id === 'grok')!.page;
  await act(async () => {
    root = createRoot(el);
    root.render(createElement(Page));
  });
  return el;
}

async function type(el: HTMLElement, value: string): Promise<void> {
  const ta = await waitForElement(() => el.querySelector<HTMLTextAreaElement>('[data-grok-question]'), '質問欄');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(ta, value);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function press(el: HTMLElement): Promise<void> {
  const btn = await waitForElement(() => el.querySelector<HTMLButtonElement>('[data-grok-ask]'), '送るボタン');
  await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('Grok の画面', () => {
  it('★ 設定済み: 状態を述べ、送る前に Grok (xAI) を名乗り、質問は provider: grok で送られ、答えが出る', async () => {
    const calls = installBridge({ configured: true });
    const el = await mount();
    await waitForText(() => el.textContent ?? '', '接続済み');
    expect(el.querySelector('[data-grok-status]')!.getAttribute('data-grok-status')).toBe('connected');
    expect(el.querySelector('[data-ai-egress]')!.textContent).toContain('Grok (xAI)');
    await type(el, '来月の資金繰りは？');
    await press(el);
    await waitForText(() => el.textContent ?? '', 'Grok からの答えです');
    const chat = calls.filter((c) => c.action === 'chat');
    expect(chat).toHaveLength(1);
    expect(chat[0]!.payload).toMatchObject({
      provider: 'grok',
      messages: [{ role: 'user', content: '来月の資金繰りは？' }],
    });
    expect(el.querySelector('[data-grok-reply]')!.textContent).toContain('via Grok (grok-4)');
  });

  it('★ 未設定: 保存先を名指しし、送るボタンは押せず、chat は呼ばれない', async () => {
    const calls = installBridge({ configured: false });
    const el = await mount();
    await waitForText(() => el.textContent ?? '', '未設定です');
    expect(el.querySelector<HTMLButtonElement>('[data-grok-ask]')!.disabled).toBe(true);
    expect(calls.some((c) => c.action === 'chat')).toBe(false);
  });

  it('★ 読めない(施錠など): 「確認できません」と言い、未設定とは言わない', async () => {
    installBridge({ configured: true, providers: 'locked' });
    const el = await mount();
    await waitForText(() => el.textContent ?? '', '確認できません');
    expect(el.textContent ?? '').not.toContain('未設定です');
  });

  it('★ 危機の文は送らず、窓口を出す', async () => {
    const calls = installBridge({ configured: true });
    const el = await mount();
    await waitForText(() => el.textContent ?? '', '接続済み');
    await type(el, 'もう死にたい');
    await press(el);
    await waitForElement(() => el.querySelector('[role="note"], [data-crisis-held]'), '窓口の表示');
    expect(calls.some((c) => c.action === 'chat')).toBe(false);
  });

  it('★ 断られたら、外の文を 1 行に畳んで画面に出す', async () => {
    installBridge({ configured: true, chat: 'refuse' });
    const el = await mount();
    await waitForText(() => el.textContent ?? '', '接続済み');
    await type(el, '質問です');
    await press(el);
    const err = await waitForElement(() => el.querySelector('[data-grok-error]'), '断りの表示');
    expect(err.textContent).toContain('xAI API 401: bad key');
    expect(err.textContent).not.toContain('\n');
  });

  it('★ 天井ちょうどは送り、+1 字は送らずに断る (MAX_ASSISTANT_CONTENT_CHARS)', async () => {
    const calls = installBridge({ configured: true });
    const el = await mount();
    await waitForText(() => el.textContent ?? '', '接続済み');
    await type(el, 'あ'.repeat(MAX_ASSISTANT_CONTENT_CHARS + 1));
    await press(el);
    const err = await waitForElement(() => el.querySelector('[data-grok-error]'), '超過の断り');
    expect(err.textContent ?? '').toContain(String(MAX_ASSISTANT_CONTENT_CHARS));
    expect(calls.some((c) => c.action === 'chat')).toBe(false);
    await type(el, 'あ'.repeat(MAX_ASSISTANT_CONTENT_CHARS));
    await press(el);
    await waitForText(() => el.textContent ?? '', 'Grok からの答えです');
    expect(calls.filter((c) => c.action === 'chat')).toHaveLength(1);
  });
});
