/**
 * speechAdapter.ts — Web Speech API 薄いアダプタのテスト (round 84)。
 *
 * Web Speech API はテスト環境に存在しないため、SpeechRecognition をモックして
 * 配線 (lang=ja-JP / onresult→transcript / onerror→error / onend) と
 * graceful な非対応フォールバックを検証する。判断ロジックは持たないため
 * クラッシュ無し + コールバック配線が正しいことを担保する。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  resolveSpeechRecognitionCtor,
  isSpeechRecognitionSupported,
  extractTranscript,
  startSpeechRecognition,
} from '../speechAdapter';

// ---- モック SpeechRecognition ------------------------------------------------

interface MockEvent {
  resultIndex: number;
  results: {
    length: number;
    [i: number]: { isFinal: boolean; length: number; [j: number]: { transcript: string; confidence: number } };
  };
}

class MockRecognition {
  lang = '';
  interimResults = false;
  continuous = true;
  maxAlternatives = 0;
  onresult: ((ev: MockEvent) => void) | null = null;
  onerror: ((ev: { error: string; message?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
  abort() {
    this.aborted = true;
  }
}

/** result イベントを組み立てる。 */
function makeEvent(
  parts: { transcript: string; isFinal: boolean }[],
  resultIndex = 0,
): MockEvent {
  const results: Record<number, { isFinal: boolean; length: number; 0: { transcript: string; confidence: number } }> = {};
  parts.forEach((p, i) => {
    results[i] = { isFinal: p.isFinal, length: 1, 0: { transcript: p.transcript, confidence: 0.9 } };
  });
  return { resultIndex, results: { length: parts.length, ...results } } as unknown as MockEvent;
}

// ---- resolveSpeechRecognitionCtor / isSpeechRecognitionSupported ------------

describe('resolveSpeechRecognitionCtor', () => {
  it('標準 SpeechRecognition を優先する', () => {
    const std = MockRecognition;
    const webkit = class Other extends MockRecognition {};
    const ctor = resolveSpeechRecognitionCtor({ SpeechRecognition: std, webkitSpeechRecognition: webkit } as never);
    expect(ctor).toBe(std);
  });

  it('標準が無ければ webkit prefix を使う', () => {
    const webkit = MockRecognition;
    const ctor = resolveSpeechRecognitionCtor({ webkitSpeechRecognition: webkit } as never);
    expect(ctor).toBe(webkit);
  });

  it('どちらも無ければ null', () => {
    expect(resolveSpeechRecognitionCtor({} as never)).toBeNull();
  });

  it('window が undefined なら null', () => {
    expect(resolveSpeechRecognitionCtor(undefined)).toBeNull();
  });
});

describe('isSpeechRecognitionSupported', () => {
  it('ctor があれば true', () => {
    expect(isSpeechRecognitionSupported({ SpeechRecognition: MockRecognition } as never)).toBe(true);
  });
  it('無ければ false', () => {
    expect(isSpeechRecognitionSupported({} as never)).toBe(false);
  });
});

// ---- extractTranscript ------------------------------------------------------

describe('extractTranscript', () => {
  it('単一 result の transcript を返す', () => {
    expect(extractTranscript(makeEvent([{ transcript: 'こんにちは', isFinal: true }]) as never)).toBe('こんにちは');
  });

  it('resultIndex 以降の result を連結する', () => {
    const ev = makeEvent(
      [
        { transcript: '無視されるべき', isFinal: true },
        { transcript: 'ぎっとはぶ', isFinal: false },
        { transcript: 'をひらいて', isFinal: false },
      ],
      1,
    );
    expect(extractTranscript(ev as never)).toBe('ぎっとはぶをひらいて');
  });

  it('前後の空白を trim する', () => {
    expect(extractTranscript(makeEvent([{ transcript: '  はい  ', isFinal: true }]) as never)).toBe('はい');
  });

  it('result が無ければ空文字', () => {
    expect(extractTranscript(makeEvent([]) as never)).toBe('');
  });
});

// ---- startSpeechRecognition -------------------------------------------------

describe('startSpeechRecognition', () => {
  it('非対応環境では null を返す (graceful)', () => {
    const handle = startSpeechRecognition({ onTranscript: vi.fn() }, {} as never);
    expect(handle).toBeNull();
  });

  it('対応環境では認識を ja-JP / interim 有効で開始する', () => {
    let instance: MockRecognition | null = null;
    class Capturing extends MockRecognition {
      constructor() {
        super();
        instance = this;
      }
    }
    const handle = startSpeechRecognition({ onTranscript: vi.fn() }, { SpeechRecognition: Capturing } as never);
    expect(handle).not.toBeNull();
    expect(instance).not.toBeNull();
    expect(instance!.lang).toBe('ja-JP');
    expect(instance!.interimResults).toBe(true);
    expect(instance!.started).toBe(true);
  });

  it('onresult → onTranscript を発火 (テキスト + isFinal)', () => {
    let instance: MockRecognition | null = null;
    class Capturing extends MockRecognition {
      constructor() {
        super();
        instance = this;
      }
    }
    const onTranscript = vi.fn();
    startSpeechRecognition({ onTranscript }, { SpeechRecognition: Capturing } as never);
    instance!.onresult!(makeEvent([{ transcript: 'すらっく', isFinal: true }]));
    expect(onTranscript).toHaveBeenCalledWith('すらっく', true);
  });

  it('中間結果は isFinal=false で渡る', () => {
    let instance: MockRecognition | null = null;
    class Capturing extends MockRecognition {
      constructor() {
        super();
        instance = this;
      }
    }
    const onTranscript = vi.fn();
    startSpeechRecognition({ onTranscript }, { SpeechRecognition: Capturing } as never);
    instance!.onresult!(makeEvent([{ transcript: 'とちゅう', isFinal: false }]));
    expect(onTranscript).toHaveBeenCalledWith('とちゅう', false);
  });

  it('空テキストの result では onTranscript を呼ばない', () => {
    let instance: MockRecognition | null = null;
    class Capturing extends MockRecognition {
      constructor() {
        super();
        instance = this;
      }
    }
    const onTranscript = vi.fn();
    startSpeechRecognition({ onTranscript }, { SpeechRecognition: Capturing } as never);
    instance!.onresult!(makeEvent([{ transcript: '   ', isFinal: true }]));
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('onerror → onError を message 優先で発火', () => {
    let instance: MockRecognition | null = null;
    class Capturing extends MockRecognition {
      constructor() {
        super();
        instance = this;
      }
    }
    const onError = vi.fn();
    startSpeechRecognition({ onTranscript: vi.fn(), onError }, { SpeechRecognition: Capturing } as never);
    instance!.onerror!({ error: 'no-speech', message: '発話なし' });
    expect(onError).toHaveBeenCalledWith('発話なし');
  });

  it('onerror で message が空なら error code を使う', () => {
    let instance: MockRecognition | null = null;
    class Capturing extends MockRecognition {
      constructor() {
        super();
        instance = this;
      }
    }
    const onError = vi.fn();
    startSpeechRecognition({ onTranscript: vi.fn(), onError }, { SpeechRecognition: Capturing } as never);
    instance!.onerror!({ error: 'not-allowed', message: '' });
    expect(onError).toHaveBeenCalledWith('not-allowed');
  });

  it('onError 未指定でも onerror でクラッシュしない', () => {
    let instance: MockRecognition | null = null;
    class Capturing extends MockRecognition {
      constructor() {
        super();
        instance = this;
      }
    }
    startSpeechRecognition({ onTranscript: vi.fn() }, { SpeechRecognition: Capturing } as never);
    expect(() => instance!.onerror!({ error: 'network' })).not.toThrow();
  });

  it('onend → onEnd を発火', () => {
    let instance: MockRecognition | null = null;
    class Capturing extends MockRecognition {
      constructor() {
        super();
        instance = this;
      }
    }
    const onEnd = vi.fn();
    startSpeechRecognition({ onTranscript: vi.fn(), onEnd }, { SpeechRecognition: Capturing } as never);
    instance!.onend!();
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('handle.stop / handle.abort が認識へ委譲する', () => {
    let instance: MockRecognition | null = null;
    class Capturing extends MockRecognition {
      constructor() {
        super();
        instance = this;
      }
    }
    const handle = startSpeechRecognition({ onTranscript: vi.fn() }, { SpeechRecognition: Capturing } as never);
    handle!.stop();
    expect(instance!.stopped).toBe(true);
    handle!.abort();
    expect(instance!.aborted).toBe(true);
  });
});
