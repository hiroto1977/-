/**
 * ttsAdapter — 音声合成（Text-to-Speech）のアダプタ。`window.speechSynthesis`
 * （Web Speech API）をガード付きで包み、非対応環境では無音で degrade する。
 *
 * 既定ボイスは往々にして機械的なので、より自然に聞こえるよう:
 *   1. 高品質な日本語ボイスを選ぶ（Google / Natural / Neural / macOS プレミアム等）。
 *   2. 読み上げテキストを自然化する（記号・URL・出典脚注を除去、文で区切る）。
 *   3. 文単位に分割して連続発話し、文ごとに自然な抑揚・間を得る。
 *   4. 抑揚を穏やかにする（rate/pitch の微調整）。
 *
 * ## なぜこのファイルは `mutate` に載せていないか (2026-08-22)
 *
 * 実測 91.96%。残る 18 件は**検査の穴ではなく、整形の設計そのもの**である。
 *
 * `normalizeForSpeech` は最後に `[。．]{2,}→。` `[、，]{2,}→、` `\s+→' '`
 * `.trim()` で必ず畳む。この「最後の均し」が、**手前の置換の細かい差を
 * 全部吸ってしまう**。実験で確かめた: `/\n+/`→`/\n/`、`/[…]{1,}/`→`/[…]/`、
 * URL の置換先 `' '`→`''` — いずれも代表入力 11 通りで最終出力が一致する。
 * 手前の量指定子は「その段だけ見ても正しい」ための重ね着で、結果には出ない。
 *
 * 残り 18 件の内訳:
 *   - Regex 13 — 上のとおり、最後の均しに吸われる
 *   - StringLiteral 4 — 同じく吸われる置換先と、`${v.name || ''}` の既定値
 *     (加点・減点のどの語にも当たらないので、何を入れても点が変わらない)
 *   - MethodExpression 1 — perTest の帰属ずれ。手で当てると
 *     「割った片の前後の空白を落とす」ほか 2 本が落ちる (対照実験で確認)
 *
 * 18 件に pragma を貼れば `mutate` へ載せられるが、それは**測れていることの
 * 記録ではなく、測らないことの記録**が 18 行増えるだけである。読み上げの
 * 整形は、壊れても資格情報にも権限にも触れない。ここは載せずに、
 * 理由をこの 1 か所に書いておく。
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
  // 以前はここに `.filter((x) => x.length > 0)` があったが、空の断片が来ても
  // 下のループは何も積まない (`buf` が空のまま `if (buf.trim())` で落ちる)。
  // 同じ結果になる番人が 2 つあるだけだったので外した。
  const parts = text.split(/(?<=[。．！？!?])/).map((x) => x.trim());
  const out: string[] = [];
  for (const p of parts) {
    // 以前はここに `p.length <= maxLen` の速道があったが、**結果を変えて
    // いなかった** — maxLen 以下なら下のループは一度も押し出さず、最後に
    // 同じ文字列を 1 つ積むだけになる (`parts` は既に trim 済み)。
    // 分岐を残すと、どちらを通っても同じという枝が 1 つ増える。
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
  // `(v.lang || '').toLowerCase()` と書いていたが、`''` を別の文字列に変えても
  // 「ja で始まらない」点は同じで、結果が変わらなかった。lang が無いことを
  // そのまま「日本語ではない」と読む形にして、確かめようのない既定値を消す。
  if (v.lang?.toLowerCase().startsWith('ja') !== true) return -Infinity;
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
  // `bestScore === -Infinity ? null : best` と書いていたが、`best` は
  // `s > bestScore` を満たしたときにしか代入されない。日本語が 1 つも
  // 無ければ最初の -Infinity を超えられず null のままなので、判定は
  // 結果を変えていなかった (確かめようのない枝が 1 つ増えるだけ)。
  return best;
}

// ---------------------------------------------------------------------------
// 3. 発話
// ---------------------------------------------------------------------------

let cachedVoice: VoiceLike | null = null;
let voicesRequested = false;

function ensureVoice(synth: SpeechSynthesisLike): VoiceLike | null {
  // 関数を先に捕まえる。`synth.getVoices ? synth.getVoices() : []` と書くと、
  // **その予備側へ入る道が無い** — 有無はこの直後で確定しているのに、
  // 閉包の中では型が絞られないので予備を書かされていた。捕まえておけば
  // 到達しない枝を持たずに済む。
  const getVoices = synth.getVoices;
  if (!getVoices) return null;
  const voices = getVoices.call(synth);
  if (voices && voices.length > 0) {
    cachedVoice = pickBestJaVoice(voices);
  } else if (!voicesRequested) {
    // getVoices は初回空のことが多い。voiceschanged で再選定する。
    voicesRequested = true;
    const refresh = () => {
      const vs = getVoices.call(synth);
      // 空で戻ってきたら**選び直さない**。既に選んであるボイスを null で
      // 上書きすると、次の発話が既定の機械音声に戻ってしまう。
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
    // `prepared` は上の番人で非空が保証されているので、`splitIntoUtterances`
    // は必ず 1 件以上返す (空白だけの断片は捨てるが、全部が空白なら
    // `prepared` 自体が空になって上で弾かれている)。以前ここには
    // `chunks.length > 0 ? chunks : [prepared]` という予備があったが、
    // **予備側へ入る入力が存在しない**ので落とした。
    const chunks = splitIntoUtterances(prepared);
    for (const chunk of chunks) {
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
  // Stryker disable next-line ConditionalExpression: 等価変異。この番人を外しても
  // 観測できる差が無い — `speechSynthesis` が無い窓で `.cancel()` を呼ぶと
  // TypeError になるが、**すぐ下の try/catch が飲み込む**ので呼び出し側からは
  // 同じに見える。番人を残すのは、例外を投げてから握り潰すより、そもそも
  // 呼ばないほうが意図が読めるため。
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
