/** @vitest-environment jsdom */
/**
 * **村は相談の返答 (`kind: 'counsel'`) をモデルで上書きしない (2026-10-15 · パス 523 · threat: T-069)。**
 *
 * `replyTo` は危機でない心の不調 (「つらい、眠れない」) と破壊衝動 (「物を壊したい」) にも
 * `counsel` (セルフケアの案内 + 免責) を返すが、村の AI の条件は危機・他害しか見ていなかったので、
 * その吹き出しを AI の返答で置き換え、読み上げも置き換えていた (実測: MODEL_REPLY が出て相談の文・
 * 免責は消え、文は `assistant/chat` へ届いた)。コンシェルジュは同じ入力を端末内だけで答える。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { installPageRenderGlobals, settlePage } from '../../__tests__/pageRenderHarness';
import { SERVICES } from '../../services';
import { counsel, detectCrisis } from '../../data/counseling';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container?.remove();
  container = null;
});

async function drive(text: string): Promise<{ text: string; chatCalls: unknown[][] }> {
  installPageRenderGlobals(() => undefined);
  const invoke = vi.fn(async () => ({ ok: true, data: { text: 'MODEL_REPLY_XYZ', model: 'm', provider: 'anthropic' } }));
  const hub = (window as unknown as { serviceHub: Record<string, unknown> }).serviceHub;
  hub['invoke'] = invoke;
  hub['fetchSnapshot'] = async () => ({
    ok: true,
    data: { providers: [{ id: 'anthropic', label: 'Claude', configured: true, isDefault: true, browserDirect: true, needsApiKey: true, defaultModel: 'x' }] },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const Page = SERVICES.find((s) => s.id === 'village')!.page;
  await act(async () => {
    root!.render(createElement(Page));
  });
  await settlePage();
  const input = container.querySelector('input[aria-label="村への入力"]') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settlePage();
  await act(async () => {
    input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await settlePage();
  await settlePage();
  return {
    text: container.textContent ?? '',
    chatCalls: invoke.mock.calls.filter((c) => (c as unknown[])[1] === 'chat') as unknown[][],
  };
}

describe('村の相談の返答はモデルで上書きしない (threat: T-069)', () => {
  it('★ 危機でない心の不調の文は端末内の相談の返答のまま —— chat へ送らず、上書きもしない (threat: T-069)', async () => {
    const text = 'つらい、眠れない';
    // 標本が的に当たる: 危機ではない (T-029 の網には掛からない) が、相談の返答になる文。
    expect(detectCrisis(text)).toBe(false);
    const expected = counsel({ note: text }).message;
    const r = await drive(text);
    expect(r.chatCalls, '相談の文が外のモデルへ送られた').toEqual([]);
    expect(r.text).not.toContain('MODEL_REPLY_XYZ');
    expect(r.text, '端末内の相談の返答が吹き出しに残っていない').toContain(expected);
  });

  it('★ 破壊衝動の文も同じ (threat: T-069)', async () => {
    const r = await drive('物を壊したい');
    expect(r.chatCalls).toEqual([]);
    expect(r.text).not.toContain('MODEL_REPLY_XYZ');
  });

  it('対照: 普通の質問はモデルへ届き、吹き出しはモデルの返答になる', async () => {
    const r = await drive('インボイス制度について教えて');
    expect(r.chatCalls.length).toBeGreaterThan(0);
    expect(r.text).toContain('MODEL_REPLY_XYZ');
  });
});
