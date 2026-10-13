/**
 * @vitest-environment jsdom
 *
 * 実物の AI コンシェルジュを描いて、**実際に自由質問を打つ** (2026-09-24 · パス 449)。
 *
 * 綴りの走査では足りない —— 見るべきは「どのモデルへ行ったか」と
 * 「断られたときに利用者が何を読むか」で、それは描いて打てば直接出る。
 *
 * ## 直す前の実測 (2026-09-24)
 *
 * | | |
 * | --- | --- |
 * | 送ったモデル | `llama3.2` (`chatbot-ollama-model` の書き手は出荷コードに **0 件**) |
 * | `npm run ollama:setup` が入れる物 | `llama3.2:1b` |
 * | アプリが組んだ助言 | 「モデル「llama3.2」がまだ取得されていません。」+「インストール済みの…」 |
 * | 画面に出た助言 | **0 文字** (`if (!res.ok) return null`) |
 * | 画面に出た文 | 「…Ollama 接続時は自由質問にもお答えします。」= **その利用者にとって偽** |
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChatbotWidget } from '../ChatbotWidget';
import { CHATBOT_OLLAMA_ESCAPE } from '../../data/chatbotOllama';
import { DEFAULT_SETUP_MODEL, describeOllamaError } from '../../../shared/ollama';
import { waitForElement, waitForText } from '../../__tests__/jsdomWait';

// jsdom は `Element.prototype.scrollTo` を実装していない (この widget は
// 新しい行が来るたびに呼ぶ)。**製品の欠陥ではない**ので足場で埋める。
if (!('scrollTo' in Element.prototype)) {
  (Element.prototype as unknown as Record<string, unknown>).scrollTo = () => {};
}

/** 解釈できない = 自由質問へ回る入力 (サービス名も定型句も含まない)。 */
const FREE_QUESTION = '量子力学について教えて';

interface Sent {
  readonly model: string;
}

function installBridge(installed: readonly string[], answer: 'reply' | 'refuse'): Sent[] {
  const sent: Sent[] = [];
  (window as unknown as Record<string, unknown>).serviceHub = {
    fetchSnapshot: async () => ({ ok: true, data: { models: installed.map((name) => ({ name })) } }),
    invoke: async (_s: string, _a: string, payload: unknown) => {
      const model = (payload as { model: string }).model;
      sent.push({ model });
      if (answer === 'reply' && installed.includes(model)) {
        return { ok: true, data: { reply: 'これは端末内のモデルの答えです', durationMs: 12 } };
      }
      const advice = describeOllamaError(404, `model "${model}" not found, try pulling it first`, {
        model,
        installed: [...installed],
      });
      return {
        ok: false,
        code: 'ollama_model-not-found',
        message: `${advice.message} (${advice.hints[0] ?? ''})`,
      };
    },
  };
  return sent;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove();
  root = null;
  container = null;
  delete (window as unknown as Record<string, unknown>).serviceHub;
  // **履歴は端末に残る** (`chatbot-history`)。消さないと次の `it` が
  // 前の `it` の行を読み、不在の主張が前の行に当たって落ちる (実測)。
  localStorage.clear();
});

async function ask(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const el = container;
  await act(async () => {
    root = createRoot(el);
    root.render(createElement(ChatbotWidget));
  });
  // 開く (吹き出しのボタン)。錠は**その後に現れる入力欄**で取る ——
  // ラベルは開く前から在りうるので、綴りで待つと開く前の姿を測る。
  const fab = await waitForElement(() => el.querySelector('button'), 'AI コンシェルジュのボタン');
  await act(async () => { fab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const input = await waitForElement<HTMLInputElement>(
    () => el.querySelector('input'),
    'チャットの入力欄',
  );
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
  return el;
}

describe('AI コンシェルジュの自由質問 — 行き先と断り', () => {
  it('★ setup で入れたモデルへ行き、答えが画面に出る', async () => {
    const sent = installBridge([DEFAULT_SETUP_MODEL], 'reply');
    const el = await ask();
    await waitForText(() => el.textContent ?? '', '端末内のモデルの答え');
    expect(sent.map((s) => s.model)).toEqual([DEFAULT_SETUP_MODEL]);
    // 答えが出たなら断りは出ない
    expect(el.textContent ?? '').not.toContain(CHATBOT_OLLAMA_ESCAPE);
  });

  it('★ 断られたら、アプリが組んだ原因と逃げ口が画面に出る', async () => {
    // 上書きが在って導入済みに無い形 (断られる側を作る唯一の道)
    localStorage.setItem('chatbot-ollama-model', 'mistral:7b');
    const sent = installBridge(['qwen2.5:0.5b', 'gemma2:2b'], 'refuse');
    const el = await ask();
    await waitForText(() => el.textContent ?? '', '答えませんでした');
    const t = el.textContent ?? '';
    expect(sent.map((x) => x.model)).toEqual(['mistral:7b']);
    expect(t).toContain('モデル「mistral:7b」がまだ取得されていません');
    expect(t).toContain(CHATBOT_OLLAMA_ESCAPE);
  });

  it('★ 橋が無いときは断りを出さない (定型文がその人にとって真である)', async () => {
    delete (window as unknown as Record<string, unknown>).serviceHub;
    const el = await ask();
    // **錠は定型文そのもの** —— 断りが出るなら同じ 1 つの行に入るので、
    // その行が出た時点で「出ていない」は測れる (回数で待たない)。
    await waitForText(() => el.textContent ?? '', 'うまく解釈できませんでした');
    expect(el.textContent ?? '').not.toContain('答えませんでした');
    // 針が的に当たることを示す標本 (断る側では出る)
    expect(CHATBOT_OLLAMA_ESCAPE.length).toBeGreaterThan(0);
  });
});
