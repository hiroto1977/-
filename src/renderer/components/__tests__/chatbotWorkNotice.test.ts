/** @vitest-environment jsdom */
/**
 * **コンシェルジュが実際に実行した操作は、村の景色へ知らせが出る (2026-11-06)。**
 *
 * 実行を押すと `running` → `done` (または `failed`) の 2 つが、サービスと操作名だけを載せて出る。
 * 話した文・引数 (宛先や本文)・結果の本文は載らない (景色が持つ必要のない個人データを抱えない)。
 * 確認で「やめる」を押した操作と、実行しない発話は知らせない (景色に「作業中」を偽らない)。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChatbotWidget } from '../ChatbotWidget';
import { waitForElement } from '../../__tests__/jsdomWait';
import { subscribeConversationWork, type ConversationWorkEvent } from '../../data/conversationWork';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SLACK_QUOTED = 'Slack の #general に「こんにちは秘密の本文」を送って';

let invokeResult: { ok: boolean; code?: string; message?: string; data?: unknown } = { ok: true, data: { persisted: true } };

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve(invokeResult),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    if (typeof (Element.prototype as unknown as Record<string, unknown>)[name] !== 'function') {
      Object.defineProperty(Element.prototype, name, { value: () => undefined, configurable: true, writable: true });
    }
  }
});

let container: HTMLDivElement;
let root: Root | null = null;
let events: ConversationWorkEvent[] = [];
let unsubscribe: () => void = () => undefined;

beforeEach(() => {
  localStorage.clear();
  events = [];
  unsubscribe = subscribeConversationWork((e) => events.push(e));
  invokeResult = { ok: true, data: { persisted: true } };
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  unsubscribe();
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
  await act(async () => {
    dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

const confirmOf = (d: HTMLElement): HTMLElement | null =>
  d.querySelector<HTMLElement>('[role="alertdialog"][aria-label="実行確認"]');
function buttonNamed(scope: Element, label: string): HTMLButtonElement {
  const b = Array.from(scope.querySelectorAll('button')).find((x) => (x.textContent ?? '').trim() === label);
  if (!b) throw new Error(`button ${label} not found`);
  return b;
}

describe('コンシェルジュの作業の知らせ (村の景色へ)', () => {
  it('★ 実行を押すと running → done がサービスと操作名だけで出る', async () => {
    const dialog = await openWidget();
    await ask(dialog, SLACK_QUOTED);
    const confirm = await waitForElement(() => confirmOf(dialog), '実行確認');
    expect(events, '確認の前に作業中を知らせている').toEqual([]);
    await act(async () => {
      buttonNamed(confirm, '実行').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitForElement(
      () => (events.some((e) => e.stage === 'done') ? document.body : null),
      '完了の知らせ',
    );
    expect(events.map((e) => e.stage)).toEqual(['running', 'done']);
    expect(events[0]).toEqual({ stage: 'running', serviceId: 'slack', action: 'send-message' });
    // 話した文・本文・宛先は載せない (3 つの欄だけ)。
    for (const e of events) {
      expect(Object.keys(e).sort()).toEqual(['action', 'serviceId', 'stage']);
      expect(JSON.stringify(e)).not.toContain('秘密の本文');
      expect(JSON.stringify(e)).not.toContain('general');
    }
  });

  it('★ 失敗した実行は failed で知らせる (done と偽らない)', async () => {
    invokeResult = { ok: false, code: 'action_failed', message: '失敗の本文 秘密' };
    const dialog = await openWidget();
    await ask(dialog, SLACK_QUOTED);
    const confirm = await waitForElement(() => confirmOf(dialog), '実行確認');
    await act(async () => {
      buttonNamed(confirm, '実行').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitForElement(() => (events.some((e) => e.stage === 'failed') ? document.body : null), '失敗の知らせ');
    expect(events.map((e) => e.stage)).toEqual(['running', 'failed']);
    expect(JSON.stringify(events)).not.toContain('秘密');
  });

  it('★ 確認でやめた操作は知らせない (作業中を偽らない)', async () => {
    const dialog = await openWidget();
    await ask(dialog, SLACK_QUOTED);
    const confirm = await waitForElement(() => confirmOf(dialog), '実行確認');
    await act(async () => {
      buttonNamed(confirm, 'やめる').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitForElement(() => (confirmOf(dialog) === null ? document.body : null), '確認が閉じる');
    expect(events).toEqual([]);
  });
});
