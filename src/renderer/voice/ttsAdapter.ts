/**
 * ttsAdapter — 音声合成（Text-to-Speech）の薄いアダプタ。
 * `window.speechSynthesis`（Web Speech API）をガード付きで包み、非対応環境では
 * 無音でグレースフルに degrade する（`speechAdapter.ts` の認識側と同じ思想）。
 * 村のキャラクターが返答を声で話すために使う。
 */

interface SpeechSynthesisLike {
  speak(utterance: SpeechSynthesisUtteranceLike): void;
  cancel(): void;
}
interface SpeechSynthesisUtteranceLike {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
}
interface TtsWindow {
  speechSynthesis?: SpeechSynthesisLike;
  SpeechSynthesisUtterance?: new (text?: string) => SpeechSynthesisUtteranceLike;
}

function resolveWindow(win?: TtsWindow): TtsWindow | undefined {
  if (win) return win;
  return typeof window !== 'undefined' ? (window as unknown as TtsWindow) : undefined;
}

/** この環境で音声合成が使えるか。 */
export function isSpeechSynthesisSupported(win?: TtsWindow): boolean {
  const w = resolveWindow(win);
  return !!(w && w.speechSynthesis && w.SpeechSynthesisUtterance);
}

export interface SpeakOptions {
  readonly lang?: string;
  readonly rate?: number;
  readonly pitch?: number;
}

/**
 * テキストを読み上げる。非対応なら false を返して何もしない（例外を投げない）。
 * 直前の発話は打ち切ってから話す（重複読み上げ防止）。
 */
export function speak(text: string, opts: SpeakOptions = {}, win?: TtsWindow): boolean {
  const w = resolveWindow(win);
  if (!w || !w.speechSynthesis || !w.SpeechSynthesisUtterance) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  try {
    w.speechSynthesis.cancel();
    const u = new w.SpeechSynthesisUtterance(trimmed);
    u.lang = opts.lang ?? 'ja-JP';
    u.rate = opts.rate ?? 1;
    u.pitch = opts.pitch ?? 1;
    w.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

/** 進行中の読み上げを止める。 */
export function cancelSpeech(win?: TtsWindow): void {
  const w = resolveWindow(win);
  if (w && w.speechSynthesis) {
    try {
      w.speechSynthesis.cancel();
    } catch {
      /* 無視 */
    }
  }
}
