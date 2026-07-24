/**
 * ttsAdapter — 音声合成（Text-to-Speech）のアダプタ。`window.speechSynthesis`
 * （Web Speech API）をガード付きで包み、非対応環境では無音で degrade する。
 *
 * 既定ボイスは往々にして機械的なので、より自然に聞こえるよう:
 *   1. 高品質な日本語ボイスを選ぶ（Google / Natural / Neural / macOS プレミアム等）。
 *   2. 読み上げテキストを自然化する（記号・URL・出典脚注を除去、文で区切る）。
 *   3. 文単位に分割して連続発話し、文ごとに自然な抑揚・間を得る。
 *   4. 抑揚を穏やかにする（rate/pitch の微調整）。
 */

interface VoiceLike {
  readonly name: string;
  readonly lang: string;
  readonly localService?: boolean;
  readonly default?: boolean;
  readonly voiceURI?: string;
}
interface UtteranceLike {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  voice: VoiceLike | null;
}
interface SpeechSynthesisLike {
  speak(utterance: UtteranceLike): void;
  cancel(): void;
  getVoices?: () => VoiceLike[];
  addEventListener?: (type: string, listener: () => void) => void;
  onvoiceschanged?: (() => void) | null;
}
interface TtsWindow {
  speechSynthesis?: SpeechSynthesisLike;
  SpeechSynthesisUtterance?: new (text?: string) => UtteranceLike;
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

// ---------------------------------------------------------------------------
// 1. 読み上げテキストの自然化（純粋関数）
// ---------------------------------------------------------------------------

/**
 * 返答テキストを「声で読んで自然」な形へ整える。Markdown・URL・出典脚注・
 * 記号を除去し、矢印や区切りを口語へ置換、改行を句点にまとめる。
 */
export function normalizeForSpeech(text: string): string {
  let s = text;
  // コードブロック・インラインコードは読み上げない。
  s = s.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');
  // URL は読み上げると不自然なので落とす。
  s = s.replace(/https?:\/\/\S+/g, ' ');
  // 出典脚注・参照フッタ（「参照: …」「［出典: …］」「(出典: …)」）を除去。
  s = s.replace(/[［(【]?\s*(?:参照|出典)\s*[:：][^）)】\]\n]*[)）】\]]?/g, ' ');
  // Markdown 記号・表の区切り・箇条書きマーカーを除去。
  s = s.replace(/^\s{0,3}(?:[-*+・]|\d+[.)])\s+/gm, '');
  s = s.replace(/[#>*_~|]/g, ' ');
  // 記号を口語へ。
  s = s
    .replace(/[→⇒]/g, 'から')
    .replace(/[／/]/g, '、')
    .replace(/[…]{1,}|\.{3,}/g, '。')
    .replace(/[「」『』（）()【】［］[\]]/g, ' ')
    .replace(/[･]/g, '、');
  // 改行は文の区切り（句点）に。
  s = s.replace(/\n+/g, '。');
  // 連続する句読点・空白を整理。
  s = s.replace(/[。．]{2,}/g, '。').replace(/[、，]{2,}/g, '、').replace(/\s+/g, ' ').trim();
  s = s.replace(/^[、。\s]+/, '').replace(/\s*([、。])/g, '$1');
  return s;
}

/** 自然な抑揚のため文単位に分割する（句点・感嘆/疑問・改行区切り）。 */
export function splitIntoUtterances(text: string, maxLen = 120): string[] {
  const parts = text
    .split(/(?<=[。．！？!?])/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  const out: string[] = [];
  for (const p of parts) {
    if (p.length <= maxLen) {
      out.push(p);
    } else {
      // 長すぎる文は読点で分割し、それでも長ければ強制分割。
      let buf = '';
      for (const seg of p.split(/(?<=[、，])/)) {
        if ((buf + seg).length > maxLen && buf) {
          out.push(buf.trim());
          buf = seg;
        } else {
          buf += seg;
        }
      }
      if (buf.trim()) out.push(buf.trim());
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. 日本語ボイスの品質スコアリング（純粋関数）
// ---------------------------------------------------------------------------

/**
 * 日本語ボイスの「自然さ」スコア。高いほど自然。日本語以外は -Infinity。
 * ニューラル/クラウド系（Google・Natural・Neural・Online）や、macOS/iOS の
 * プレミアム音声（Kyoko・O-ren・Otoya・Nanami 等）を優先し、eSpeak/compact 等の
 * 機械的な音声を減点する。
 */
export function scoreJaVoice(v: VoiceLike): number {
  const lang = (v.lang || '').toLowerCase();
  if (!lang.startsWith('ja')) return -Infinity;
  const key = `${v.name || ''} ${v.voiceURI || ''}`.toLowerCase();
  let score = 10;
  const bonus: [RegExp, number][] = [
    [/google/, 55],
    [/natural/, 50],
    [/neural/, 50],
    [/online/, 34],
    [/premium|enhanced|plus/, 30],
    [/kyoko|nanami/, 42],
    [/o-?ren|otoya|hattori/, 36],
    [/siri/, 34],
    [/ayumi|haruka|ichiro|sayaka|keita|mizuki/, 24],
  ];
  for (const [re, pts] of bonus) if (re.test(key)) score += pts;
  const penalty: [RegExp, number][] = [
    [/espeak|eloquence|compact|robo|pico/, 40],
  ];
  for (const [re, pts] of penalty) if (re.test(key)) score -= pts;
  if (v.localService === false) score += 8; // クラウド/ニューラルの傾向
  if (v.default) score += 2;
  return score;
}

/** 候補ボイスから最も自然な日本語ボイスを選ぶ（無ければ null）。 */
export function pickBestJaVoice(voices: readonly VoiceLike[]): VoiceLike | null {
  let best: VoiceLike | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    const s = scoreJaVoice(v);
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return bestScore === -Infinity ? null : best;
}

// ---------------------------------------------------------------------------
// 3. 発話
// ---------------------------------------------------------------------------

let cachedVoice: VoiceLike | null = null;
let voicesRequested = false;

function ensureVoice(synth: SpeechSynthesisLike): VoiceLike | null {
  if (!synth.getVoices) return null;
  const voices = synth.getVoices();
  if (voices && voices.length > 0) {
    cachedVoice = pickBestJaVoice(voices);
  } else if (!voicesRequested) {
    // getVoices は初回空のことが多い。voiceschanged で再選定する。
    voicesRequested = true;
    const refresh = () => {
      const vs = synth.getVoices ? synth.getVoices() : [];
      if (vs && vs.length > 0) cachedVoice = pickBestJaVoice(vs);
    };
    if (synth.addEventListener) synth.addEventListener('voiceschanged', refresh);
    else synth.onvoiceschanged = refresh;
  }
  return cachedVoice;
}

export interface SpeakOptions {
  readonly lang?: string;
  readonly rate?: number;
  readonly pitch?: number;
  /** テキスト自然化を無効化（既定 true）。 */
  readonly raw?: boolean;
}

/**
 * テキストを自然に読み上げる。非対応なら false（例外は投げない）。
 * 直前の発話を打ち切ってから、文単位に分割して連続発話する。
 */
export function speak(text: string, opts: SpeakOptions = {}, win?: TtsWindow): boolean {
  const w = resolveWindow(win);
  if (!w || !w.speechSynthesis || !w.SpeechSynthesisUtterance) return false;
  const synth = w.speechSynthesis;
  const Utter = w.SpeechSynthesisUtterance;
  const prepared = opts.raw ? text.trim() : normalizeForSpeech(text);
  if (!prepared) return false;
  try {
    synth.cancel();
    const voice = ensureVoice(synth);
    const lang = opts.lang ?? 'ja-JP';
    const rate = opts.rate ?? 0.98;
    const pitch = opts.pitch ?? 1.0;
    const chunks = splitIntoUtterances(prepared);
    for (const chunk of chunks.length > 0 ? chunks : [prepared]) {
      const u = new Utter(chunk);
      u.lang = lang;
      u.rate = rate;
      u.pitch = pitch;
      if (voice) u.voice = voice;
      synth.speak(u);
    }
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

/** テスト用: 選定済みボイスのキャッシュを消す。 */
export function resetVoiceCache(): void {
  cachedVoice = null;
  voicesRequested = false;
}
