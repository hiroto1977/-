/** @vitest-environment jsdom */
/**
 * **旗艦 AI 画面は、危機・他害の語をオンラインでもモデルへ送らず、決定論で確証済みの窓口を先に出す**
 * (2026-10-13 · パス 514)。
 *
 * ## 見つけた物 (実測・read-only 監査の指摘を自分で再現)
 *
 * `AssistantPage.send()` は `if (!hub) { replyOffline(text); return; }` の後、best3 / 全AI合議 /
 * chat のどれも**危機判定を一切通さず** `hub.invoke('assistant','chat', …)` へ直行し、モデルの返答を
 * `MarkdownView` で描いていた。決定論の危機対応 (`replyOffline` → `chatbot.replyTo` が
 * `detectCrisis || detectHarmToOthers` を**無条件で最初に**判定し `counseling.SUPPORT_RESOURCES` —— いのちの電話 /
 * 119・110 ほか —— を本文へ展開する) が走るのは、ハブ不在・invoke 失敗・例外の枝だけだった。
 * **オンラインで正常に応答が返る限り、確証済みの窓口は決定論では一切出ず、モデルがどう答えるかに委ねられていた。**
 *
 * 対照: コンシェルジュ (ChatbotWidget → `chatbot.replyTo`) はこの穴を持たない —— 危機を最初に判定し、
 * 危機メッセージ (`kind: 'counsel'`) は LLM へ 1 度も届かない。旗艦 AI 画面だけがオンライン経路で
 * このネットを迂回していた非対称。モデルは端末内 Ollama / 利用者が設定した互換 API / クラウドの
 * どれでもよく、どれも「窓口を出す」保証を持たない。
 *
 * これは攻撃ではなく**安全ネットの欠陥**なので脅威台帳 (攻撃の型) には載せない (`threat: T-xxx` を付けない)。
 *
 * ## ここが見ること
 *
 * 1. 危機語を打つと、オンラインでも確証済みの窓口 (いのちの電話 / 119・110) がチャットに出る
 * 2. そのとき `invoke('assistant','chat', …)` は **1 度も呼ばれない** (危機文を外のモデルへ送らない)
 * 3. 普通の質問はモデルへ届く (直しは危機・他害の語だけで、全体を塞がない)
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AssistantPage } from '../AssistantPage';
import { SUPPORT_RESOURCES } from '../../data/counseling';
import { settleUntil } from '../../__tests__/jsdomWait';

vi.mock('../../voice/speechAdapter', () => ({
  isSpeechRecognitionSupported: () => false,
  startSpeechRecognition: () => ({ stop: () => undefined, abort: () => undefined }),
}));
vi.mock('../../voice/ttsAdapter', () => ({ speak: () => undefined, cancelSpeech: () => undefined }));

let chatCalls: { action: string }[] = [];
let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  chatCalls = [];
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    (Element.prototype as unknown as Record<string, () => void>)[name] = () => undefined;
  }
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve(['assistant']),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: (_s: string, action: string) => {
      chatCalls.push({ action });
      // モデルは窓口を 1 つも出さない (危機ネットをモデルに委ねた場合の最悪の形)。
      return Promise.resolve({ ok: true, data: { text: 'つらいですね。がんばってください。', provider: 'anthropic', model: 'x' } });
    },
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

async function ask(text: string): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(AssistantPage));
  });
  const input = [...container.querySelectorAll('input')].find(
    (i) => i.getAttribute('aria-label') === 'アシスタントへの入力',
  );
  if (!input) throw new Error('入力欄が無い');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

const HOTLINE = SUPPORT_RESOURCES[0]!.label; // 'いのちの電話 (ナビダイヤル)'

describe('旗艦 AI 画面は危機語をオンラインでもモデルへ送らず、決定論で窓口を先に出す (パス 514)', () => {
  it('★ 危機語を打つと、確証済みの窓口が出て、モデルへは 1 度も送らない', async () => {
    await ask('もう死にたい');
    await settleUntil(() => (container.textContent ?? '').includes(HOTLINE), '確証済みの窓口が出る');
    const text = container.textContent ?? '';
    expect(text, '確証済みの窓口 (いのちの電話) が出ていない').toContain(HOTLINE);
    expect(text, '緊急の窓口 (119/110) が出ていない').toContain('119');
    expect(
      chatCalls.filter((c) => c.action === 'chat' || c.action === 'chatAll'),
      '危機文を外のモデルへ送ってしまった',
    ).toEqual([]);
  });

  it('★ 他害の語でも同じ (決定論で窓口・モデルへ送らない)', async () => {
    await ask('誰かを傷つけたい');
    await settleUntil(() => (container.textContent ?? '').includes(HOTLINE), '確証済みの窓口が出る');
    expect(chatCalls.filter((c) => c.action === 'chat' || c.action === 'chatAll')).toEqual([]);
  });

  it('★ 普通の質問はモデルへ届く (直しは危機・他害の語だけで、全体を塞がない)', async () => {
    await ask('インボイス制度とは何ですか');
    await settleUntil(() => chatCalls.some((c) => c.action === 'chat'), 'モデルへ届く');
    expect(chatCalls.some((c) => c.action === 'chat'), '普通の質問がモデルへ届いていない').toBe(true);
    // 普通の質問では確証済みの窓口は出さない (危機でないのに窓口を出さない)。
    expect(container.textContent ?? '').not.toContain(HOTLINE);
  });
});
