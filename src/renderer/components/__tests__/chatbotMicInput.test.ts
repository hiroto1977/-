/**
 * @vitest-environment jsdom
 *
 * 実物の AI コンシェルジュの 🎤 を押して話しかける (2026-11-23)。
 *
 * 書き起こしは入力欄へ出て、言い終えたら (確定したら) 打ったのと同じ `send` を通って送られる ——
 * だから「今月の売上は？」と話せば記録から数字で答え、網へは出ない。非対応のブラウザでは 🎤 を出さない。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChatbotWidget, DATA_ANSWER_LABEL } from '../ChatbotWidget';
import { getRecordStore } from '../../data/store';
import { SALES_COLLECTION } from '../../data/sales';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { waitForElement, waitForText } from '../../__tests__/jsdomWait';
import { localIsoDate } from '../../../shared/localDate';

if (!('scrollTo' in Element.prototype)) {
  (Element.prototype as unknown as Record<string, unknown>).scrollTo = () => {};
}

interface FakeRecognition {
  onresult: ((ev: unknown) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  started: number;
  stopped: number;
}

let instances: FakeRecognition[] = [];
let root: Root | null = null;
let container: HTMLDivElement | null = null;
let invoked: string[] = [];

function installSpeech(): void {
  instances = [];
  class Fake implements FakeRecognition {
    lang = '';
    interimResults = false;
    continuous = false;
    maxAlternatives = 1;
    onresult: ((ev: unknown) => void) | null = null;
    onerror: ((ev: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    started = 0;
    stopped = 0;
    constructor() {
      instances.push(this);
    }
    start(): void {
      this.started += 1;
    }
    stop(): void {
      this.stopped += 1;
      this.onend?.();
    }
    abort(): void {
      this.onend?.();
    }
  }
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition = Fake;
}

function speak(rec: FakeRecognition, text: string, isFinal: boolean): void {
  const result = Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal });
  rec.onresult?.({ resultIndex: 0, results: [result] });
}

beforeEach(async () => {
  await resetRecordStore();
  invoked = [];
  (window as unknown as Record<string, unknown>).serviceHub = {
    fetchSnapshot: async () => ({ ok: true, data: {} }),
    invoke: async (service: string, action: string) => {
      if (service === 'assistant' && action === 'providers') return { ok: true, data: { providers: [] } };
      invoked.push(`${service}/${action}`);
      return { ok: true, data: { text: 'LLM の答え' } };
    },
  };
});

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove();
  root = null;
  container = null;
  delete (window as unknown as Record<string, unknown>).serviceHub;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  localStorage.clear();
});

async function openWidget(): Promise<HTMLElement> {
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

describe('AI コンシェルジュ — 話しかけて入力する', () => {
  it('★ 話した言葉が入力欄に出て、言い終えると送られ、記録から答える (網へ出ない)', async () => {
    installSpeech();
    const month = localIsoDate().slice(0, 7);
    await getRecordStore().insert(SALES_COLLECTION, { date: `${month}-03`, channel: 'shopify', amount: 4_200, orders: 2 });
    const el = await openWidget();
    const mic = await waitForElement<HTMLButtonElement>(() => el.querySelector('[data-concierge-mic]'), '🎤 のボタン');
    expect(mic.getAttribute('aria-label')).toBe('コンシェルジュに話しかける');
    await act(async () => { mic.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const rec = instances[0]!;
    expect(rec.started).toBe(1);
    expect(mic.getAttribute('aria-pressed')).toBe('true');

    await act(async () => { speak(rec, '今月の売上は', false); });
    expect(el.querySelector('input')!.value).toBe('今月の売上は');

    await act(async () => { speak(rec, '今月の売上はいくら？', true); });
    await waitForText(() => el.textContent ?? '', '¥4,200');
    expect(el.textContent ?? '').toContain(DATA_ANSWER_LABEL);
    expect(rec.stopped).toBe(1);
    expect(invoked).toEqual([]);
    expect(mic.getAttribute('aria-pressed')).toBe('false');
  });

  it('★ 🎤 の隣に、声がどこへ行くかの断りが在る', async () => {
    installSpeech();
    const el = await openWidget();
    await waitForElement(() => el.querySelector('[data-concierge-mic]'), '🎤 のボタン');
    expect(el.querySelector('[data-voice-egress]')).not.toBeNull();
  });

  it('もう一度押すと聞き取りをやめ、送らない', async () => {
    installSpeech();
    const el = await openWidget();
    const mic = await waitForElement<HTMLButtonElement>(() => el.querySelector('[data-concierge-mic]'), '🎤 のボタン');
    await act(async () => { mic.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const rec = instances[0]!;
    await act(async () => { speak(rec, '量子力学', false); });
    await act(async () => { mic.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(rec.stopped).toBe(1);
    expect(mic.getAttribute('aria-pressed')).toBe('false');
    expect(invoked).toEqual([]);
  });

  it('聞き取りの失敗は理由を出す', async () => {
    installSpeech();
    const el = await openWidget();
    const mic = await waitForElement<HTMLButtonElement>(() => el.querySelector('[data-concierge-mic]'), '🎤 のボタン');
    await act(async () => { mic.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { instances[0]!.onerror?.({ error: 'not-allowed' }); });
    expect(el.querySelector('[data-mic-error]')).not.toBeNull();
  });

  it('対照: 非対応のブラウザでは 🎤 も声の断りも出さない', async () => {
    const el = await openWidget();
    expect(el.querySelector('[data-concierge-mic]')).toBeNull();
    expect(el.querySelector('[data-voice-egress]')).toBeNull();
  });
});
