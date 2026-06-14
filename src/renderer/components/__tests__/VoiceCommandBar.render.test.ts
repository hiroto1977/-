/** @vitest-environment jsdom */
/**
 * VoiceCommandBar — 音声コマンド最小 UI のレンダー / インタラクションテスト (round 84)。
 *
 * Web Speech API と window.serviceHub をモックし、クラッシュ無しと
 * 「破壊的コマンドは確認 UI を経由してから実行される」配線を担保する。
 * 判断ロジックは純粋核 (voiceSession.test.ts) で網羅済みのため、ここでは
 * UI 配線 (マイク → 認識 → 解釈表示 → 確認 → invoke) を検証する。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { VoiceCommandBar } from '../VoiceCommandBar';

// react-dom/client + act の連携を有効化 (act 警告の抑止)。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---- モック SpeechRecognition ------------------------------------------------

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

function installSpeech() {
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = MockRecognition;
}
function uninstallSpeech() {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
}

// ---- SSR (非対応 / 対応) -----------------------------------------------------

describe('VoiceCommandBar — SSR レンダー', () => {
  it('非対応環境では "音声非対応" を表示しクラッシュしない', () => {
    uninstallSpeech();
    const html = renderToStaticMarkup(createElement(VoiceCommandBar));
    expect(html).toContain('音声非対応');
  });

  it('対応環境ではマイクボタンを表示', () => {
    installSpeech();
    const html = renderToStaticMarkup(createElement(VoiceCommandBar));
    expect(html).toContain('🎙️');
    expect(html).toContain('音声コマンドを開始');
    uninstallSpeech();
  });
});

// ---- インタラクション (react-dom/client) ------------------------------------

describe('VoiceCommandBar — インタラクション', () => {
  let container: HTMLDivElement;
  let root: Root;
  let invoke: ReturnType<typeof vi.fn>;
  let dispatched: CustomEvent[];

  beforeEach(() => {
    installSpeech();
    MockRecognition.last = null;
    invoke = vi.fn().mockResolvedValue({ ok: true, data: {} });
    (window as unknown as { serviceHub: unknown }).serviceHub = { invoke };
    dispatched = [];
    window.addEventListener('servicehub:navigate', (e) => dispatched.push(e as CustomEvent));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    uninstallSpeech();
    vi.restoreAllMocks();
  });

  function render() {
    act(() => {
      root.render(createElement(VoiceCommandBar));
    });
  }
  function clickMic() {
    const btn = container.querySelector('[aria-label="音声コマンドを開始"]') as HTMLButtonElement;
    act(() => btn.click());
  }

  it('マイク押下 → 認識開始で "聞き取り中" 表示', () => {
    render();
    clickMic();
    expect(container.textContent).toContain('聞き取り中');
    expect(MockRecognition.last).not.toBeNull();
  });

  it('非破壊コマンド (navigate) は確認なしで navigate イベントを発火', async () => {
    render();
    clickMic();
    await act(async () => {
      emitFinal('githubを開いて');
      await Promise.resolve();
    });
    // 確認 UI は出ない。
    expect(container.textContent).not.toContain('確認');
    // navigate CustomEvent が github 宛に飛ぶ。
    expect(dispatched.some((e) => e.detail === 'github')).toBe(true);
    // action ではないので invoke は呼ばれない。
    expect(invoke).not.toHaveBeenCalled();
  });

  it('破壊的コマンド (create-issue) は確認 UI を出し、確認前は invoke しない', async () => {
    render();
    clickMic();
    await act(async () => {
      emitFinal('githubにイシューを作って');
      await Promise.resolve();
    });
    expect(container.textContent).toContain('確認');
    expect(container.textContent).toContain('実行しますか');
    // 確認前は副作用ゼロ。
    expect(invoke).not.toHaveBeenCalled();
  });

  it('破壊的コマンドは "実行" ボタン押下後に invoke される (不変条件)', async () => {
    render();
    clickMic();
    await act(async () => {
      emitFinal('githubにイシューを作って');
      await Promise.resolve();
    });
    const confirmBtn = container.querySelector('[aria-label="実行を承認"]') as HTMLButtonElement;
    expect(confirmBtn).not.toBeNull();
    await act(async () => {
      confirmBtn.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledWith('github', 'create-issue', expect.any(Object));
  });

  it('破壊的コマンドを "取消" すると invoke されず確認 UI が閉じる', async () => {
    render();
    clickMic();
    await act(async () => {
      emitFinal('githubにイシューを作って');
      await Promise.resolve();
    });
    expect(container.textContent).toContain('確認');
    const cancelBtn = container.querySelector('[aria-label="実行を取り消し"]') as HTMLButtonElement;
    await act(async () => {
      cancelBtn.click();
      await Promise.resolve();
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('実行しますか');
  });

  it('解釈不能な発話はエラー表示 (invoke しない)', async () => {
    render();
    clickMic();
    await act(async () => {
      emitFinal('ほげほげぴよぴよ');
      await Promise.resolve();
    });
    expect(container.textContent).toContain('解釈できません');
    expect(invoke).not.toHaveBeenCalled();
  });
});
