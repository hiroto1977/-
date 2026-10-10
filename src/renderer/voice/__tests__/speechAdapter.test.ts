/**
 * speechAdapter.ts — Web Speech API 薄いアダプタのテスト (round 84)。
 *
 * Web Speech API はテスト環境に存在しないため、SpeechRecognition をモックして
 * 配線 (lang=ja-JP / onresult→transcript / onerror→error / onend) と
 * graceful な非対応フォールバックを検証する。判断ロジックは持たないため
 * クラッシュ無し + コールバック配線が正しいことを担保する。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  /** 直近に生成されたインスタンス (this 別名を避けてテストから参照する)。 */
  static last: MockRecognition | null = null;
  constructor() {
    MockRecognition.last = this;
  }
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
  const SPEECH = { SpeechRecognition: MockRecognition } as never;

  beforeEach(() => {
    MockRecognition.last = null;
  });

  it('非対応環境では null を返す (graceful)', () => {
    const handle = startSpeechRecognition({ onTranscript: vi.fn() }, {} as never);
    expect(handle).toBeNull();
  });

  it('対応環境では認識を ja-JP / interim 有効で開始する', () => {
    const handle = startSpeechRecognition({ onTranscript: vi.fn() }, SPEECH);
    expect(handle).not.toBeNull();
    const instance = MockRecognition.last;
    expect(instance).not.toBeNull();
    expect(instance!.lang).toBe('ja-JP');
    expect(instance!.interimResults).toBe(true);
    expect(instance!.started).toBe(true);
  });

  it('onresult → onTranscript を発火 (テキスト + isFinal)', () => {
    const onTranscript = vi.fn();
    startSpeechRecognition({ onTranscript }, SPEECH);
    MockRecognition.last!.onresult!(makeEvent([{ transcript: 'すらっく', isFinal: true }]));
    expect(onTranscript).toHaveBeenCalledWith('すらっく', true);
  });

  it('中間結果は isFinal=false で渡る', () => {
    const onTranscript = vi.fn();
    startSpeechRecognition({ onTranscript }, SPEECH);
    MockRecognition.last!.onresult!(makeEvent([{ transcript: 'とちゅう', isFinal: false }]));
    expect(onTranscript).toHaveBeenCalledWith('とちゅう', false);
  });

  it('空テキストの result では onTranscript を呼ばない', () => {
    const onTranscript = vi.fn();
    startSpeechRecognition({ onTranscript }, SPEECH);
    MockRecognition.last!.onresult!(makeEvent([{ transcript: '   ', isFinal: true }]));
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('onerror → onError を message 優先で発火', () => {
    const onError = vi.fn();
    startSpeechRecognition({ onTranscript: vi.fn(), onError }, SPEECH);
    MockRecognition.last!.onerror!({ error: 'no-speech', message: '発話なし' });
    expect(onError).toHaveBeenCalledWith('発話なし');
  });

  it('onerror で message が空なら error code を使う', () => {
    const onError = vi.fn();
    startSpeechRecognition({ onTranscript: vi.fn(), onError }, SPEECH);
    MockRecognition.last!.onerror!({ error: 'not-allowed', message: '' });
    expect(onError).toHaveBeenCalledWith('not-allowed');
  });

  it('onError 未指定でも onerror でクラッシュしない', () => {
    startSpeechRecognition({ onTranscript: vi.fn() }, SPEECH);
    expect(() => MockRecognition.last!.onerror!({ error: 'network' })).not.toThrow();
  });

  it('onend → onEnd を発火', () => {
    const onEnd = vi.fn();
    startSpeechRecognition({ onTranscript: vi.fn(), onEnd }, SPEECH);
    MockRecognition.last!.onend!();
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('handle.stop / handle.abort が認識へ委譲する', () => {
    const handle = startSpeechRecognition({ onTranscript: vi.fn() }, SPEECH);
    const instance = MockRecognition.last;
    handle!.stop();
    expect(instance!.stopped).toBe(true);
    handle!.abort();
    expect(instance!.aborted).toBe(true);
  });
});


/*
 * 変異検査で残った箇所から起こした検査。
 *
 * 既存の検査は「配線されている」ことを見ており、**取り出しの途中で
 * 欠けている要素**や**確定フラグの既定値**を通っていなかった。
 */
describe('extractTranscript — 取り出しの穴', () => {
  /** results 風のオブジェクトを作る (length と添字を持つ)。 */
  const results = (items: readonly (unknown | null)[]) => {
    const o: Record<string | number, unknown> = { length: items.length };
    items.forEach((it, i) => {
      o[i] = it;
    });
    return o as never;
  };
  const alt = (transcript: string) => ({ length: 1, 0: { transcript, confidence: 1 } });

  it('resultIndex 以降だけを連結する (前は読まない)', () => {
    const ev = {
      resultIndex: 1,
      results: results([alt('捨てる'), alt('あ'), alt('い')]),
    } as never;
    expect(extractTranscript(ev)).toBe('あい');
  });

  it('resultIndex が 0 なら全部つなぐ', () => {
    const ev = { resultIndex: 0, results: results([alt('あ'), alt('い')]) } as never;
    expect(extractTranscript(ev)).toBe('あい');
  });

  it('resultIndex が末尾を超えていれば空', () => {
    const ev = { resultIndex: 5, results: results([alt('あ')]) } as never;
    expect(extractTranscript(ev)).toBe('');
  });

  it('要素が欠けていても飛ばして続ける', () => {
    const ev = { resultIndex: 0, results: results([null, alt('い')]) } as never;
    expect(extractTranscript(ev)).toBe('い');
  });

  it('alternative を持たない result は飛ばす (length 0)', () => {
    const ev = { resultIndex: 0, results: results([{ length: 0 }, alt('い')]) } as never;
    expect(extractTranscript(ev)).toBe('い');
  });

  it('length はあるのに中身が欠けている result も飛ばす', () => {
    const ev = { resultIndex: 0, results: results([{ length: 1 }, alt('い')]) } as never;
    expect(extractTranscript(ev)).toBe('い');
  });

  it('前後の空白は落とす', () => {
    const ev = { resultIndex: 0, results: results([alt('  あ '), alt(' い  ')]) } as never;
    expect(extractTranscript(ev)).toBe('あ  い');
  });

  it('results が空なら空', () => {
    expect(extractTranscript({ resultIndex: 0, results: results([]) } as never)).toBe('');
  });
});

describe('startSpeechRecognition — 設定と既定値', () => {
  beforeEach(() => {
    MockRecognition.last = null;
  });

  const winWith = () => ({ SpeechRecognition: MockRecognition }) as never;
  const results = (items: readonly unknown[]) => {
    const o: Record<string | number, unknown> = { length: items.length };
    items.forEach((it, i) => {
      o[i] = it;
    });
    return o as never;
  };
  const alt = (transcript: string, isFinal = false) => ({
    isFinal,
    length: 1,
    0: { transcript, confidence: 1 },
  });

  it('continuous は false (押している間だけ拾う)', () => {
    startSpeechRecognition({ onTranscript: () => {} }, winWith());
    expect(MockRecognition.last!.continuous).toBe(false);
  });

  it('lang / interimResults / maxAlternatives も固定する', () => {
    startSpeechRecognition({ onTranscript: () => {} }, winWith());
    const r = MockRecognition.last!;
    expect(r.lang).toBe('ja-JP');
    expect(r.interimResults).toBe(true);
    expect(r.maxAlternatives).toBe(1);
  });

  it('末尾 result の isFinal を伝える', () => {
    const seen: { text: string; isFinal: boolean }[] = [];
    startSpeechRecognition({ onTranscript: (text, isFinal) => seen.push({ text, isFinal }) }, winWith());
    MockRecognition.last!.onresult!({
      resultIndex: 0,
      results: results([alt('あ', false), alt('い', true)]),
    } as never);
    expect(seen).toEqual([{ text: 'あい', isFinal: true }]);
  });

  it('末尾が未確定なら isFinal は false', () => {
    const seen: boolean[] = [];
    startSpeechRecognition({ onTranscript: (_t, f) => seen.push(f) }, winWith());
    MockRecognition.last!.onresult!({
      resultIndex: 0,
      results: results([alt('あ', true), alt('い', false)]),
    } as never);
    expect(seen).toEqual([false]);
  });

  it('results が空なら isFinal は false 扱いで、テキストも空なので呼ばない', () => {
    const seen: unknown[] = [];
    startSpeechRecognition({ onTranscript: (...a) => seen.push(a) }, winWith());
    MockRecognition.last!.onresult!({ resultIndex: 0, results: results([]) } as never);
    expect(seen).toEqual([]);
  });

  it('テキストが空なら onTranscript を呼ばない', () => {
    const seen: unknown[] = [];
    startSpeechRecognition({ onTranscript: (...a) => seen.push(a) }, winWith());
    MockRecognition.last!.onresult!({
      resultIndex: 0,
      results: results([alt('   ', true)]),
    } as never);
    expect(seen).toEqual([]);
  });

  // length だけ進んで末尾の実体が欠けたリスト。テキストは前の result から
  // 取れるので配信はするが、確定フラグは取れないので false に倒す
  // (ここで落ちると、認識中に UI ごと死ぬ)。
  it('末尾 result が欠けていても配信し、isFinal は false に倒す', () => {
    const seen: { text: string; isFinal: boolean }[] = [];
    startSpeechRecognition(
      { onTranscript: (text, isFinal) => seen.push({ text, isFinal }) },
      winWith(),
    );
    MockRecognition.last!.onresult!({
      resultIndex: 0,
      results: results([alt('あ', true), null]),
    } as never);
    expect(seen).toEqual([{ text: 'あ', isFinal: false }]);
  });
});

describe('startSpeechRecognition — エラーと終了', () => {
  beforeEach(() => {
    MockRecognition.last = null;
  });
  const winWith = () => ({ SpeechRecognition: MockRecognition }) as never;

  it('message があればそれを、無ければ error の種別を渡す', () => {
    const seen: string[] = [];
    startSpeechRecognition({ onTranscript: () => {}, onError: (m) => seen.push(m) }, winWith());
    const r = MockRecognition.last!;
    r.onerror!({ error: 'no-speech', message: '音声が検出されません' });
    r.onerror!({ error: 'not-allowed' });
    r.onerror!({ error: 'network', message: '' });
    expect(seen).toEqual(['音声が検出されません', 'not-allowed', 'network']);
  });

  it('onError を渡していなくても落ちない', () => {
    startSpeechRecognition({ onTranscript: () => {} }, winWith());
    expect(() => MockRecognition.last!.onerror!({ error: 'no-speech' })).not.toThrow();
  });

  it('onEnd を渡していなくても落ちない', () => {
    startSpeechRecognition({ onTranscript: () => {} }, winWith());
    expect(() => MockRecognition.last!.onend!()).not.toThrow();
  });

  it('onEnd を渡していれば呼ぶ', () => {
    let ended = 0;
    startSpeechRecognition({ onTranscript: () => {}, onEnd: () => (ended += 1) }, winWith());
    MockRecognition.last!.onend!();
    expect(ended).toBe(1);
  });
});
