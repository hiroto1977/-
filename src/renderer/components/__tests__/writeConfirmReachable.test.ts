/** @vitest-environment jsdom */
/**
 * **書き込みの確認へ届く道が在り、確認は送る内容を操作子より前に見せる** (2026-10-08 · パス 507)。
 *
 * パス 506 までの実測: `parseVoiceCommand` は `params` を 1 つも設定しなかったので、
 * `VOICE_WRITE_REQUIREMENTS` の 7 行 (どれも必須欄を持つ) は**どの発話でも**
 * `missing-fields` で断り、2 つの確認ダイアログ (`VoiceCommandBar` / `ChatbotWidget` の
 * `role="alertdialog"` 実行確認) は**実物の経路からは 1 度も描かれなかった**
 * (パス 109 の検査 `VoiceCommandBar.render.test.ts` は `voiceWriteRefusal` を
 * `vi.mock` で黙らせて「揃った未来」を測っていた —— 届く道は無かった)。
 *
 * ## ここで測る物
 *
 * 1. 引用 (「…」) と `#channel` / `owner/repo` を持つ発話は、**実物の**解析器 →
 *    経路 → 関門 → 確認へ届く (mock なし)。
 * 2. 確認は**送る欄と値**を `[data-write-preview]` に並べ、それは実行 / やめる の
 *    **DOM の前**に在る (法則 `egress-notice-before-send` の向き —— 押してから知る形にしない)。
 * 3. 実行を押すと `invoke` へ**その値**が届く。やめる / 取消 なら 1 度も届かない。
 * 4. 対照: 引用の無い発話は今までどおり断られ、確認は出ない。
 *
 * 待ちは条件で取る (`jsdomWait`) —— 固定回数の `settle` は負荷の下で嘘をつく (パス 368)。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChatbotWidget } from '../ChatbotWidget';
import { VoiceCommandBar } from '../VoiceCommandBar';
import { settleUntil, waitForElement, waitForText } from '../../__tests__/jsdomWait';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 解析器が `send-message` に解く + `#general` と 「こんにちは」 を持つ。 */
const SLACK_QUOTED = 'Slack の #general に「こんにちは」を送って';
/** 対照: 引用も #channel も無い (パス 109 の標本と同じ形)。 */
const SLACK_BARE = 'Slack にメッセージを送って';
/** 音声側: 不動産の記録 (`record-entry` は `note` だけが必須)。 */
const REALESTATE_QUOTED = '不動産に「物件Aの内見」を記録して';

interface Invocation {
  readonly serviceId: string;
  readonly action: string;
  readonly params: unknown;
}
const invoked: Invocation[] = [];

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: (serviceId: string, action: string, params: unknown) => {
      invoked.push({ serviceId, action, params });
      return Promise.resolve({ ok: true, data: { persisted: true } });
    },
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
  invoked.length = 0;
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
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
});

/** 確認の中で、送る内容の一覧が**最初の操作子より前**に在ること (DOM の順 = Tab の順)。 */
function previewPrecedesButtons(dialog: Element): boolean {
  const preview = dialog.querySelector('[data-write-preview]');
  const firstButton = dialog.querySelector('button');
  if (preview === null || firstButton === null) return false;
  return Boolean(preview.compareDocumentPosition(firstButton) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function previewRows(dialog: Element): string[] {
  return Array.from(dialog.querySelectorAll('[data-write-preview] li')).map((li) => li.textContent ?? '');
}

// ---- コンシェルジュ ---------------------------------------------------------

async function openWidget(): Promise<HTMLElement> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ChatbotWidget));
  });
  const launcher = await waitForElement(
    () => Array.from(container.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'AI コンシェルジュを開く'),
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

describe('コンシェルジュ — 引用と #channel を持つ発話は確認へ届く (パス 507)', () => {
  it('★ 実物の経路で確認ダイアログが出て、送る欄と値を操作子より前に並べる', async () => {
    const dialog = await openWidget();
    await ask(dialog, SLACK_QUOTED);
    const confirm = await waitForElement(() => confirmOf(dialog), '実行確認');
    expect(confirm.textContent, 'サービス名と action を名乗っていない').toContain('「Slack」で');
    expect(confirm.textContent).toContain('「send-message」');
    const rows = previewRows(confirm);
    expect(rows, '送る内容が 2 欄並んでいない').toHaveLength(2);
    expect(rows[0]).toContain('channel');
    expect(rows[0]).toContain('#general');
    expect(rows[1]).toContain('text');
    expect(rows[1]).toContain('こんにちは');
    expect(previewPrecedesButtons(confirm), '送る内容が操作子の後ろに在る').toBe(true);
    expect(invoked, '確認の前に invoke している').toEqual([]);
  });

  it('★ 実行を押すと、見せた値がそのまま invoke へ届く', async () => {
    const dialog = await openWidget();
    await ask(dialog, SLACK_QUOTED);
    const confirm = await waitForElement(() => confirmOf(dialog), '実行確認');
    await act(async () => {
      buttonNamed(confirm, '実行').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settleUntil(() => invoked.length === 1, 'slack へ 1 度 invoke される');
    expect(invoked[0]).toEqual({
      serviceId: 'slack',
      action: 'send-message',
      params: { channel: '#general', text: 'こんにちは' },
    });
    expect(confirmOf(dialog), '実行した後も確認が残っている').toBeNull();
  });

  it('★ やめるを押すと invoke は 1 度も呼ばれず、確認が消える', async () => {
    const dialog = await openWidget();
    await ask(dialog, SLACK_QUOTED);
    const confirm = await waitForElement(() => confirmOf(dialog), '実行確認');
    await act(async () => {
      buttonNamed(confirm, 'やめる').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settleUntil(() => confirmOf(dialog) === null, '確認が消える');
    expect(invoked).toEqual([]);
  });

  it('★ 対照: 引用の無い発話は今までどおり断られ、確認は出ない', async () => {
    const dialog = await openWidget();
    await ask(dialog, SLACK_BARE);
    await waitForText(() => dialog.textContent ?? '', '実行しません');
    expect(dialog.textContent ?? '').toContain('channel / text');
    expect(confirmOf(dialog)).toBeNull();
    expect(invoked).toEqual([]);
  });
});

// ---- 音声コマンド ------------------------------------------------------------

class MockRecognition {
  lang = '';
  interimResults = false;
  continuous = true;
  maxAlternatives = 0;
  onresult: ((ev: unknown) => void) | null = null;
  onerror: ((ev: { error: string; message?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  static last: MockRecognition | null = null;
  constructor() {
    MockRecognition.last = this;
  }
  start() {}
  stop() {}
  abort() {}
}

function emitFinal(text: string) {
  MockRecognition.last!.onresult!({
    resultIndex: 0,
    results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: text, confidence: 0.9 } } },
  });
}

async function speak(text: string): Promise<void> {
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = MockRecognition;
  MockRecognition.last = null;
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(VoiceCommandBar));
  });
  const mic = await waitForElement(
    () => container.querySelector<HTMLButtonElement>('[aria-label="音声コマンドを開始"]'),
    'マイクのボタン',
  );
  await act(async () => {
    mic.click();
  });
  await act(async () => {
    emitFinal(text);
    await Promise.resolve();
  });
}

describe('音声コマンド — 引用を持つ発話は確認へ届く (mock なし・パス 507)', () => {
  it('★ 実物の関門を通って確認が出て、note の値を操作子より前に見せる', async () => {
    await speak(REALESTATE_QUOTED);
    const confirm = await waitForElement(
      () => container.querySelector<HTMLElement>('[role="alertdialog"][aria-label="実行確認"]'),
      '実行確認',
    );
    expect(confirm.textContent).toContain('「不動産投資」');
    expect(confirm.textContent).toContain('「record-entry」');
    const rows = previewRows(confirm);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('note');
    expect(rows[0]).toContain('物件Aの内見');
    expect(previewPrecedesButtons(confirm), '送る内容が操作子の後ろに在る').toBe(true);
    expect(container.querySelector('[data-voice-cannot-run]'), '届いたのに断っている').toBeNull();
    expect(invoked).toEqual([]);
  });

  it('★ 実行を承認すると note がそのまま invoke へ届く', async () => {
    await speak(REALESTATE_QUOTED);
    const approve = await waitForElement(
      () => container.querySelector<HTMLButtonElement>('[aria-label="実行を承認"]'),
      '実行を承認',
    );
    await act(async () => {
      approve.click();
    });
    await settleUntil(() => invoked.length === 1, 'real-estate へ 1 度 invoke される');
    expect(invoked[0]).toEqual({ serviceId: 'real-estate', action: 'record-entry', params: { note: '物件Aの内見' } });
  });

  it('★ 対照: 引用の無い発話は断られ、承認ボタンは出ない', async () => {
    await speak('不動産に記録して');
    await waitForText(() => container.textContent ?? '', '実行しません');
    expect(container.querySelector('[aria-label="実行を承認"]')).toBeNull();
    expect(invoked).toEqual([]);
  });
});
