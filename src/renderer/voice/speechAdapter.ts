/**
 * 音声認識アダプタ (round 84) — Web Speech API (SpeechRecognition) の薄いラッパ。
 *
 * 役割は I/O の橋渡しのみ。発話テキストの「解釈」「状態遷移」は持たず、
 * 認識結果 (transcript) を `../data/voiceSession.ts` の reducer へ渡すための
 * コールバックを発火するだけ。ブラウザが Web Speech API 非対応のときは graceful
 * に「非対応」を返し、呼び出し側はマイク UI を出さない / 無効化できる。
 *
 * 設計方針:
 *   - 型・存在チェックは全てこのファイルに閉じる (TS 標準 lib に
 *     SpeechRecognition 型は無いため最小宣言を持つ)。
 *   - ロジックは一切持たない。onresult → transcript / onerror → error /
 *     onend → 終了通知 をコールバックで委譲するだけ。
 *   - 言語は ja-JP 固定 (本アプリは日本語向け)。
 */

// ---------------------------------------------------------------------------
// Web Speech API の最小型宣言 (lib.dom.d.ts には含まれないため自前で持つ)
// ---------------------------------------------------------------------------

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike {
  readonly error: string;
  readonly message?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

// ---------------------------------------------------------------------------
// サポート検出
// ---------------------------------------------------------------------------

/**
 * 実行環境から SpeechRecognition コンストラクタを解決する。
 * 標準 (`SpeechRecognition`) を優先し、無ければ WebKit prefix を見る。
 * どちらも無ければ null (非対応)。
 */
export function resolveSpeechRecognitionCtor(
  win: SpeechWindow | undefined = typeof window !== 'undefined'
    ? (window as unknown as SpeechWindow)
    : undefined,
): SpeechRecognitionCtor | null {
  if (!win) return null;
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

/** Web Speech API がこの環境で使えるか。 */
export function isSpeechRecognitionSupported(
  win?: SpeechWindow,
): boolean {
  return resolveSpeechRecognitionCtor(win) !== null;
}

// ---------------------------------------------------------------------------
// 認識結果からの transcript 抽出 (純粋ヘルパ)
// ---------------------------------------------------------------------------

/**
 * SpeechRecognition の result イベントから、最新の認識テキストを取り出す。
 * resultIndex 以降の各 result の先頭 alternative.transcript を連結する。
 * ロジックではなく「データ取り出し」なのでアダプタ内に置く。
 */
export function extractTranscript(ev: SpeechRecognitionEventLike): string {
  let out = '';
  const results = ev.results;
  for (let i = ev.resultIndex; i < results.length; i++) {
    const result = results[i];
    if (result && result.length > 0) {
      const alt = result[0];
      if (alt) out += alt.transcript;
    }
  }
  return out.trim();
}

// ---------------------------------------------------------------------------
// アダプタ本体
// ---------------------------------------------------------------------------

/** 認識セッションのハンドル。stop で停止する。 */
export interface SpeechSessionHandle {
  /** 認識を停止する (onend が後続で呼ばれる)。 */
  readonly stop: () => void;
  /** 即時中断する (結果を確定させない)。 */
  readonly abort: () => void;
}

/** startSpeechRecognition のコールバック群。 */
export interface SpeechAdapterCallbacks {
  /** 認識テキストが届いたとき (中間/確定の双方)。 */
  readonly onTranscript: (text: string, isFinal: boolean) => void;
  /** エラー発生時 (no-speech / not-allowed / network 等)。 */
  readonly onError?: (message: string) => void;
  /** 認識セッション終了時。 */
  readonly onEnd?: () => void;
}

/**
 * 音声認識を開始する。非対応環境では null を返す (呼び出し側で graceful 対応)。
 *
 * 純粋ロジックは持たず、
 *   - onresult → extractTranscript() → callbacks.onTranscript
 *   - onerror  → callbacks.onError
 *   - onend    → callbacks.onEnd
 * を仲介するだけ。`win` を注入できるためテストではモックを渡す。
 */
export function startSpeechRecognition(
  callbacks: SpeechAdapterCallbacks,
  win?: SpeechWindow,
): SpeechSessionHandle | null {
  const Ctor = resolveSpeechRecognitionCtor(win);
  if (Ctor === null) {
    return null;
  }
  const recog = new Ctor();
  recog.lang = 'ja-JP';
  recog.interimResults = true;
  recog.continuous = false;
  recog.maxAlternatives = 1;

  recog.onresult = (ev) => {
    const text = extractTranscript(ev);
    // 末尾 result の確定フラグを伝える (UI が確定時に parse を発火するため)。
    const results = ev.results;
    const last = results.length > 0 ? results[results.length - 1] : undefined;
    const isFinal = last ? last.isFinal : false;
    if (text.length > 0) {
      callbacks.onTranscript(text, isFinal);
    }
  };

  recog.onerror = (ev) => {
    callbacks.onError?.(ev.message && ev.message.length > 0 ? ev.message : ev.error);
  };

  recog.onend = () => {
    callbacks.onEnd?.();
  };

  recog.start();

  return {
    stop: () => recog.stop(),
    abort: () => recog.abort(),
  };
}
