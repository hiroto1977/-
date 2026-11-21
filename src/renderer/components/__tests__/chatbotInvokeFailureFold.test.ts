/** @vitest-environment jsdom */
/**
 * **コンシェルジュの invoke 失敗の吹き出しは、外から来た文を 1 行に畳む** (2026-10-13 · パス 516 · T-020)。
 *
 * ## 見つけた物 (実測)
 *
 * `ChatbotWidget.runIntent` は `serviceHub.invoke` の失敗を
 * `append({ role: 'bot', text: \`⚠ 実行に失敗しました: ${classified.message}\` })` で
 * 描いていた。`classified.message` は `invoke` の戻り値 (= 第三者 SaaS の応答・
 * ブラウザ版では **乗っ取られた / 設定を誤った BYO proxy** の本文) を運ぶ。
 * 吹き出し (`.concierge-msg`) は `white-space: pre-wrap` なので、**改行を 1 つ
 * 持ち込めば** `✅ 実行しました…` のような**アプリの結果そっくりの行**を別の行として
 * 描ける —— パス 488 (AI アシスタントの失敗の吹き出し) / パス 511・T-005
 * (**同じコンシェルジュ**の Ollama エラー経路 `chatbotOllama.ts:116`) が
 * `externalTextOnOneLine` で塞いだ当の形が、この invoke 失敗の経路**だけ**に
 * 残っていた (choke point の `err()` / `safeErrorMessage` は伏字と長さは掛けるが、
 * 実測で **改行は残す** —— 畳みはこの経路に無かった)。
 *
 * 伏字と長さ切りは既に掛かっているので、ここで足りなかったのは**畳み**だけ。
 * 直しは `externalTextOnOneLine(classified.message)` —— Ollama 兄弟と同じ。
 *
 * ## ここで測る物
 *
 * 1. 実物の経路 (発話 → 確認 → 実行) で invoke が失敗し、注入された改行入りの文を
 *    持たせると、失敗の吹き出しの `textContent` に `\n` が**残らない** (畳んだ)。
 * 2. 文そのものは消えない (注入された語が畳まれた 1 行の中に在る)。
 * 3. 双方向制御 (U+202E) は `\uXXXX` へ逃がす (Ollama 兄弟と同じ全処理)。
 * 4. 対照: 畳む前の形 (生の `classified.message`) なら `\n` が残り、
 *    `✅ 実行しました…` が独立した行として描かれる —— `externalTextOnOneLine` を
 *    外すとこの検査が落ちる。
 *
 * 待ちは条件で取る (`jsdomWait`) —— 固定回数の `settle` は負荷の下で嘘をつく (パス 368)。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChatbotWidget } from '../ChatbotWidget';
import { waitForElement } from '../../__tests__/jsdomWait';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 解析器が `send-message` に解く + `#general` と 「こんにちは」 を持つ (writeConfirmReachable と同じ形)。 */
const SLACK_QUOTED = 'Slack の #general に「こんにちは」を送って';

/**
 * 乗っ取られた proxy / SaaS が返す失敗本文。改行で**アプリの結果そっくりの行**を
 * 立て、末尾に双方向制御 (U+202E) を忍ばせる。choke point が伏字と長さを掛けた
 * **後**の形を模す (伏字は改行を残すので、畳む前はこの改行がそのまま届く)。
 */
const INJECTED_FAILURE =
  'トークンが不正です\n\n✅ 実行しました。対象ページへご案内します。\n🛠 Slack で「send-message」を実行します。\u202E秘密';

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () =>
      // 失敗を返す (未設定トークン / 乗っ取られた proxy の形)。message は改行を残したまま届く。
      Promise.resolve({ ok: false, code: 'action_failed', message: INJECTED_FAILURE }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    if (typeof (Element.prototype as unknown as Record<string, unknown>)[name] !== 'function') {
      Object.defineProperty(Element.prototype, name, {
        value: () => undefined,
        configurable: true,
        writable: true,
      });
    }
  }
});

let container: HTMLDivElement;
let root: Root | null = null;

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

async function openWidget(): Promise<HTMLElement> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ChatbotWidget));
  });
  const launcher = await waitForElement(
    () =>
      Array.from(container.querySelectorAll('button')).find(
        (b) => b.getAttribute('aria-label') === 'AI コンシェルジュを開く',
      ),
    'コンシェルジュを開くボタン',
  );
  await act(async () => {
    launcher.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  return waitForElement(() => container.querySelector<HTMLElement>('[role="dialog"]'), 'コンシェルジュの窓');
}

async function ask(dialog: HTMLElement, text: string): Promise<void> {
  const input = await waitForElement(
    () => dialog.querySelector<HTMLInputElement>('input[aria-label="チャット入力"]'),
    'チャット入力',
  );
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
}

function confirmOf(dialog: HTMLElement): HTMLElement | null {
  return dialog.querySelector<HTMLElement>('[role="alertdialog"][aria-label="実行確認"]');
}

function buttonNamed(scope: Element, label: string): HTMLButtonElement {
  const b = Array.from(scope.querySelectorAll('button')).find((x) => (x.textContent ?? '').trim() === label);
  if (!b) throw new Error(`button ${label} not found`);
  return b;
}

/** 失敗の吹き出し (bot・`⚠ 実行に失敗しました:` で始まる) を探す。 */
function failureBubble(dialog: HTMLElement): HTMLElement | null {
  return (
    Array.from(dialog.querySelectorAll<HTMLElement>('[data-concierge-role="bot"]')).find((el) =>
      (el.textContent ?? '').startsWith('⚠ 実行に失敗しました:'),
    ) ?? null
  );
}

/** 発話 → 確認 → 実行 を押して、失敗の吹き出しを得る。 */
async function runToFailure(): Promise<HTMLElement> {
  const dialog = await openWidget();
  await ask(dialog, SLACK_QUOTED);
  const confirm = await waitForElement(() => confirmOf(dialog), '実行確認');
  await act(async () => {
    buttonNamed(confirm, '実行').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  return waitForElement(() => failureBubble(dialog), '失敗の吹き出し');
}

describe('コンシェルジュの invoke 失敗の吹き出しは外から来た文を畳む (パス 516 · T-020)', () => {
  it('★ 改行入りの失敗本文を 1 行に畳む (吹き出しに改行が残らない) (threat: T-020)', async () => {
    const bubble = await runToFailure();
    const text = bubble.textContent ?? '';
    expect(text).toContain('⚠ 実行に失敗しました:');
    // 畳みの核 —— `externalTextOnOneLine` を外すとここが落ちる (生の \n が残る)。
    expect(text, '失敗本文の改行が畳まれていない (偽のアプリ行が独立した行になる)').not.toContain('\n');
    expect(text, 'タブ等の空白が残っている').not.toContain('\t');
  });

  it('★ 文そのものは消さない (注入された語が畳まれた 1 行の中に在る)', async () => {
    const bubble = await runToFailure();
    const text = bubble.textContent ?? '';
    expect(text).toContain('トークンが不正です');
    // 偽のアプリ行の語は消えず、⚠ の 1 行の中へ畳まれる (独立した行にはならない)。
    expect(text).toContain('✅ 実行しました');
    expect(text).toContain('send-message');
  });

  it('★ 双方向制御 (U+202E) は \\uXXXX へ逃がす (Ollama 兄弟と同じ全処理)', async () => {
    const bubble = await runToFailure();
    const text = bubble.textContent ?? '';
    expect(text, '双方向制御が生のまま残っている (Trojan Source)').not.toContain('\u202E');
    expect(text, '双方向制御を逃がしていない').toContain('\\u202e');
  });

  it('★ 対照: 失敗の吹き出しはちょうど 1 つ (遷移しない・偽の成功行が別の吹き出しにならない)', async () => {
    const dialog = await runToFailure();
    // runToFailure は失敗の吹き出しを返す; その親の dialog から全 bot 吹き出しを数える。
    const root2 = dialog.closest('[role="dialog"]') ?? dialog.parentElement;
    const bots = Array.from(
      (root2 ?? dialog).querySelectorAll<HTMLElement>('[data-concierge-role="bot"]'),
    ).map((el) => (el.textContent ?? '').trim());
    // `✅ 実行しました。…` だけの独立した吹き出し (= アプリの成功の声) は無い。
    expect(bots.filter((t) => t.startsWith('✅ 実行しました'))).toEqual([]);
    expect(bots.filter((t) => t.startsWith('⚠ 実行に失敗しました:'))).toHaveLength(1);
  });
});
