/**
 * @vitest-environment jsdom
 *
 * 実物の「AIの村」を描いて、**既定の提供者が Grok のとき村の返答が Grok へ行く**ことを見る (2026-11-04)。
 * 村は `assistant/chat` を提供者の指名なしで呼ぶので既定の提供者に従う —— その既定が Grok のとき、
 * ① 送る前の断りが「Grok (xAI)」を名乗り ② 話しかけた担当の役割が system に載り ③ 答えが吹き出しに出る。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { waitForElement, waitForText } from '../../__tests__/jsdomWait';

interface Call {
  readonly service: string;
  readonly action: string;
  readonly payload: unknown;
}

function installBridge(): Call[] {
  const calls: Call[] = [];
  (window as unknown as Record<string, unknown>).serviceHub = {
    getVersion: async () => '0.1.0-web',
    listConfigured: async () => [],
    invoke: async (service: string, action: string, payload: unknown) => {
      calls.push({ service, action, payload });
      if (service === 'assistant' && action === 'providers') {
        return {
          ok: true,
          data: {
            providers: [
              {
                id: 'grok',
                label: 'Grok (xAI)',
                configured: true,
                isDefault: true,
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
        return { ok: true, data: { text: '村のGrokの答えです', model: 'grok-4', provider: 'grok' } };
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

describe('AIの村 × Grok', () => {
  it('★ 既定が Grok: 送る前に Grok (xAI) を名乗り、役割つきの system で Grok へ送り、答えが出る', async () => {
    const calls = installBridge();
    container = document.createElement('div');
    document.body.appendChild(container);
    const el = container;
    const Page = SERVICES.find((s) => s.id === 'village')!.page;
    await act(async () => {
      root = createRoot(el);
      root.render(createElement(Page));
    });
    // 送り先の断りが Grok を名乗る (読みが終わるまで待つ)
    await waitForText(() => el.textContent ?? '', 'Grok (xAI)');
    const input = await waitForElement(
      () => el.querySelector<HTMLInputElement>('input[aria-label="村への入力"]'),
      '村への入力欄',
    );
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, '所得税について教えて');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const send = await waitForElement(
      () => Array.from(el.querySelectorAll('button')).find((b) => b.textContent === '伝える') ?? null,
      '伝えるボタン',
    );
    await act(async () => { send.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await waitForText(() => el.textContent ?? '', '村のGrokの答えです');
    const chat = calls.filter((c) => c.service === 'assistant' && c.action === 'chat');
    expect(chat).toHaveLength(1);
    const payload = chat[0]!.payload as { system: string; messages: unknown; provider?: unknown };
    // 提供者は指名しない (既定に従う) —— 既定が Grok なので Grok へ行く
    expect(payload.provider).toBeUndefined();
    expect(payload.messages).toEqual([{ role: 'user', content: '所得税について教えて' }]);
    expect(payload.system).toContain('「AIの村」の住人');
    // 話しかけた担当の役割が載る
    expect(payload.system).toMatch(/今あなたが演じる担当: .+/);
  });
});
