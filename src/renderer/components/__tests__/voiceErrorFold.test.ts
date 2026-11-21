/** @vitest-environment jsdom */
/**
 * **音声コマンドの失敗の出口は、第三者の本文を 1 行に畳む** (2026-10-14 · パス 521 · threat: T-045)。
 *
 * AI 監査 (パス 521) が再現した形をそのまま留める: Slack の `send-message` が
 * `{ ok: false, message }` で返し、その `message` が改行・アプリの結果そっくりの行・
 * 双方向制御 (U+202E)・不可視字 (U+200B) を含むとき、2026-10-13 までは
 * `.voice-error` (`role="alert"`) に**生のまま**届いた。今は `execute` (`:102`) で
 * `externalTextOnOneLine` に通してから state へ入るので、改行は空白に畳まれ、
 * 見えない字は `\uXXXX` へ逃がされる。
 *
 * 経路は実物 (解析器 → 関門 → 確認 → invoke)。mock は `serviceHub.invoke` だけ。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { VoiceCommandBar } from '../VoiceCommandBar';
import { waitForElement } from '../../__tests__/jsdomWait';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EVIL = 'slack channel_not_found\n✅ 実行しました。対象ページへご案内します。\n\u202E送金を中止\u200B';

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

let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    invoke: () => Promise.resolve({ ok: false, code: 'action_failed', message: EVIL }),
    openExternal: () => Promise.resolve(),
  };
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = MockRecognition;
});

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  container.remove();
});

describe('音声コマンドの失敗の出口 (パス 521 · T-045)', () => {
  it('★ invoke の失敗本文は改行・双方向制御・不可視字を落として .voice-error に出る (threat: T-045)', async () => {
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
      MockRecognition.last!.onresult!({
        resultIndex: 0,
        results: {
          length: 1,
          0: { isFinal: true, length: 1, 0: { transcript: 'Slack の #general に「おはよう」を送って', confidence: 0.9 } },
        },
      });
      await Promise.resolve();
    });
    const approve = await waitForElement(
      () => container.querySelector<HTMLButtonElement>('[aria-label="実行を承認"]'),
      '実行を承認',
    );
    await act(async () => {
      approve.click();
    });
    const err = await waitForElement(() => container.querySelector<HTMLElement>('.voice-error'), '失敗の出口');
    const t = err.textContent ?? '';
    expect(t).toContain('channel_not_found'); // 文そのものは消さない
    expect(t).not.toContain('\n');
    expect(t).not.toContain('\u202E');
    expect(t).not.toContain('\u200B');
    expect(t).toContain('\\u202e');
    expect(t).toContain('\\u200b');
    // 対照: 標本は本当に生の字を持つ (針が死んでいない)
    expect(EVIL).toContain('\n');
    expect(EVIL).toContain('\u202E');
  });
});
