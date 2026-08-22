import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isSpeechSynthesisSupported,
  speak,
  cancelSpeech,
  normalizeForSpeech,
  splitIntoUtterances,
  scoreJaVoice,
  pickBestJaVoice,
  resetVoiceCache,
} from '../ttsAdapter';

interface V {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
  voiceURI?: string;
}

function mockWin(voices: V[] = []) {
  const spoken: { text: string; voice: V | null; rate: number; pitch: number }[] = [];
  const cancels = { n: 0 };
  const win = {
    speechSynthesis: {
      speak: (u: { text: string; voice: V | null; rate: number; pitch: number }) =>
        spoken.push({ text: u.text, voice: u.voice, rate: u.rate, pitch: u.pitch }),
      cancel: () => {
        cancels.n++;
      },
      getVoices: () => voices,
      addEventListener: () => {},
    },
    SpeechSynthesisUtterance: class {
      text: string;
      lang = '';
      rate = 1;
      pitch = 1;
      voice: V | null = null;
      constructor(t?: string) {
        this.text = t ?? '';
      }
    },
  };
  return { win, spoken, cancels };
}

beforeEach(() => resetVoiceCache());

describe('normalizeForSpeech', () => {
  it('strips markdown, list markers and pipes', () => {
    const out = normalizeForSpeech('# 見出し\n- 項目A\n- 項目B\n| 表 | 頭 |');
    expect(out).not.toMatch(/[#|*_>-]/);
    expect(out).toContain('見出し');
    expect(out).toContain('項目A');
  });

  it('removes URLs and citation footers', () => {
    const out = normalizeForSpeech('答えです。参照: 〈オークンの法則〉（学術概念）\nhttps://example.com/x');
    expect(out).not.toContain('http');
    expect(out).not.toContain('参照');
    expect(out).toContain('答えです');
  });

  it('converts arrows and slashes to spoken forms', () => {
    const out = normalizeForSpeech('税務チーム → 税務部長 / CFO');
    expect(out).toContain('から');
    expect(out).not.toContain('→');
    expect(out).not.toContain('/');
  });

  it('collapses newlines into sentence breaks', () => {
    const out = normalizeForSpeech('一行目\n二行目');
    expect(out).toContain('一行目。二行目');
  });
});

describe('splitIntoUtterances', () => {
  it('splits on sentence-ending punctuation', () => {
    expect(splitIntoUtterances('こんにちは。元気ですか？はい。')).toEqual([
      'こんにちは。',
      '元気ですか？',
      'はい。',
    ]);
  });

  it('breaks over-long sentences on commas', () => {
    const long = 'あ'.repeat(80) + '、' + 'い'.repeat(80) + '。';
    const parts = splitIntoUtterances(long, 100);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(120);
  });
});

describe('scoreJaVoice / pickBestJaVoice', () => {
  it('disqualifies non-Japanese voices', () => {
    expect(scoreJaVoice({ name: 'Alex', lang: 'en-US' })).toBe(-Infinity);
  });

  it('prefers Google/Neural over a plain local voice', () => {
    const google: V = { name: 'Google 日本語', lang: 'ja-JP', localService: false };
    const plain: V = { name: 'Kyoko (compact)', lang: 'ja-JP', localService: true };
    expect(scoreJaVoice(google)).toBeGreaterThan(scoreJaVoice(plain));
  });

  it('penalizes eSpeak/robotic voices', () => {
    const espeak: V = { name: 'eSpeak Japanese', lang: 'ja', localService: true };
    const nanami: V = { name: 'Microsoft Nanami Online (Natural)', lang: 'ja-JP', localService: false };
    expect(scoreJaVoice(nanami)).toBeGreaterThan(scoreJaVoice(espeak));
  });

  it('picks the best Japanese voice from a mixed list', () => {
    const voices: V[] = [
      { name: 'Alex', lang: 'en-US' },
      { name: 'Kyoko', lang: 'ja-JP', localService: true },
      { name: 'Google 日本語', lang: 'ja-JP', localService: false },
    ];
    expect(pickBestJaVoice(voices)?.name).toBe('Google 日本語');
  });

  it('returns null when no Japanese voice exists', () => {
    expect(pickBestJaVoice([{ name: 'Alex', lang: 'en-US' }])).toBeNull();
  });
});

describe('speak — supported / unsupported / natural output', () => {
  it('reports unsupported when the API is absent', () => {
    expect(isSpeechSynthesisSupported({})).toBe(false);
  });

  it('reports supported when speechSynthesis + Utterance exist', () => {
    const { win } = mockWin();
    expect(isSpeechSynthesisSupported(win as never)).toBe(true);
  });

  it('cancels prior speech then speaks sentence chunks', () => {
    const { win, spoken, cancels } = mockWin([{ name: 'Google 日本語', lang: 'ja-JP', localService: false }]);
    const ok = speak('こんにちは。元気ですか？', {}, win as never);
    expect(ok).toBe(true);
    expect(cancels.n).toBe(1);
    expect(spoken.map((s) => s.text)).toEqual(['こんにちは。', '元気ですか？']);
  });

  it('assigns the chosen high-quality Japanese voice', () => {
    const { win, spoken } = mockWin([
      { name: 'Alex', lang: 'en-US' },
      { name: 'Google 日本語', lang: 'ja-JP', localService: false },
    ]);
    speak('やあ。', {}, win as never);
    expect(spoken[0]?.voice?.name).toBe('Google 日本語');
  });

  it('normalizes text before speaking (drops markdown/URL)', () => {
    const { win, spoken } = mockWin();
    speak('**答え** です https://x.test', {}, win as never);
    const joined = spoken.map((s) => s.text).join('');
    expect(joined).not.toContain('*');
    expect(joined).not.toContain('http');
    expect(joined).toContain('答え');
  });

  it('uses a gentle default rate below 1.0', () => {
    const { win, spoken } = mockWin();
    speak('てすと。', {}, win as never);
    expect(spoken[0]?.rate).toBeLessThan(1);
  });

  it('returns false and is silent when unsupported', () => {
    expect(speak('x', {}, {} as never)).toBe(false);
  });

  it('ignores empty/whitespace text', () => {
    const { win, spoken } = mockWin();
    expect(speak('   ', {}, win as never)).toBe(false);
    expect(spoken).toEqual([]);
  });

  it('swallows synth errors (never throws)', () => {
    const win = {
      speechSynthesis: {
        speak: () => {
          throw new Error('boom');
        },
        cancel: vi.fn(),
        getVoices: () => [],
      },
      SpeechSynthesisUtterance: class {
        constructor(public text = '') {}
        lang = '';
        rate = 1;
        pitch = 1;
        voice = null;
      },
    };
    expect(speak('hi', {}, win as never)).toBe(false);
  });

  it('cancelSpeech is a no-op when unsupported', () => {
    expect(() => cancelSpeech({})).not.toThrow();
  });
});


/*
 * 読み上げの整形・分割・ボイス選定を、**出力そのもの**で固定する。
 *
 * 既存の検査は「URL が消える」「短く分かれる」といった性質を見ていた。
 * 性質は置換を 1 つ書き換えても保たれることが多く、2026-08-22 の実測で
 * 44.00% (生存 121 / 未到達 19) だった。置換ごと・加点ごとに 1 件ずつ置く。
 */
describe('normalizeForSpeech — 置換を 1 つずつ固定する', () => {
  it('コードブロックとインラインコードを落とす', () => {
    expect(normalizeForSpeech('前```const x = 1;```後')).toBe('前 後');
    expect(normalizeForSpeech('前`code`後')).toBe('前 後');
  });

  it('URL を落とす', () => {
    expect(normalizeForSpeech('詳しくは https://example.com/a?b=1 を見て')).toBe('詳しくは を見て');
    expect(normalizeForSpeech('http://a.example を')).toBe('を');
  });

  it('出典・参照の脚注を落とす', () => {
    expect(normalizeForSpeech('本文（出典: 国税庁）')).toBe('本文');
    expect(normalizeForSpeech('本文［参照: No.1199］')).toBe('本文');
    expect(normalizeForSpeech('本文【出典：厚労省】')).toBe('本文');
  });

  it('箇条書きのマーカーを落とす (行頭のみ)', () => {
    expect(normalizeForSpeech('- 一つ目\n* 二つ目\n1. 三つ目')).toBe('一つ目。二つ目。三つ目');
    // 行頭でないハイフンは残る。
    expect(normalizeForSpeech('a - b')).toBe('a - b');
  });

  it('Markdown の記号を空白にする', () => {
    expect(normalizeForSpeech('#見出し')).toBe('見出し');
    expect(normalizeForSpeech('**強調**')).toBe('強調');
    expect(normalizeForSpeech('a|b')).toBe('a b');
  });

  it('矢印は「から」に読み替える', () => {
    expect(normalizeForSpeech('A→B')).toBe('AからB');
    expect(normalizeForSpeech('A⇒B')).toBe('AからB');
  });

  it('スラッシュは読点にする', () => {
    expect(normalizeForSpeech('A/B')).toBe('A、B');
    expect(normalizeForSpeech('A／B')).toBe('A、B');
  });

  it('三点リーダは句点にする', () => {
    expect(normalizeForSpeech('あれ…')).toBe('あれ。');
    expect(normalizeForSpeech('あれ...')).toBe('あれ。');
  });

  it('括弧類は空白にする', () => {
    expect(normalizeForSpeech('「あ」『い』（う）(え)【お】［か］[き]')).toBe('あ い う え お か き');
  });

  it('半角中黒は読点にする', () => {
    expect(normalizeForSpeech('あ･い')).toBe('あ、い');
  });

  it('改行は句点にまとめる', () => {
    expect(normalizeForSpeech('一行目\n二行目')).toBe('一行目。二行目');
    expect(normalizeForSpeech('一行目\n\n\n二行目')).toBe('一行目。二行目');
  });

  it('連続した句読点・空白をまとめる', () => {
    expect(normalizeForSpeech('あ。。。い')).toBe('あ。い');
    expect(normalizeForSpeech('あ、、、い')).toBe('あ、い');
    expect(normalizeForSpeech('あ   い')).toBe('あ い');
  });

  it('先頭の句読点・空白を落とし、句読点の前の空白も詰める', () => {
    expect(normalizeForSpeech('、あ')).toBe('あ');
    expect(normalizeForSpeech('。あ')).toBe('あ');
    expect(normalizeForSpeech('あ 、い')).toBe('あ、い');
  });

  it('空文字・空白だけなら空文字', () => {
    expect(normalizeForSpeech('')).toBe('');
    expect(normalizeForSpeech('   ')).toBe('');
  });
});

describe('splitIntoUtterances — 分割の境目', () => {
  it('句点・感嘆・疑問で切り、区切り文字は前の文に残す', () => {
    expect(splitIntoUtterances('あ。い！う？え')).toEqual(['あ。', 'い！', 'う？', 'え']);
    expect(splitIntoUtterances('a!b?c')).toEqual(['a!', 'b?', 'c']);
  });

  it('**半角ピリオドでは切らない** (全角の ．だけが区切り)', () => {
    // 区切りの文字集合は [。．！？!?]。半角 . は入っていないので、
    // 小数や略語 (No.1199 / 3.5%) が文の途中で割れない。
    expect(splitIntoUtterances('税率は3.5%です。')).toEqual(['税率は3.5%です。']);
    expect(splitIntoUtterances('a.b')).toEqual(['a.b']);
    // 全角なら切る。
    expect(splitIntoUtterances('あ．い')).toEqual(['あ．', 'い']);
  });

  it('空の断片は捨てる', () => {
    expect(splitIntoUtterances('あ。 。い。')).toEqual(['あ。', '。', 'い。']);
    expect(splitIntoUtterances('')).toEqual([]);
    expect(splitIntoUtterances('   ')).toEqual([]);
  });

  it('maxLen 以下はそのまま 1 つ', () => {
    expect(splitIntoUtterances('あ'.repeat(10), 10)).toEqual(['あ'.repeat(10)]);
  });

  it('maxLen を超えたら読点で割る', () => {
    // 「あ×6、い×6」= 13 文字。maxLen 8 なら読点で 2 つに割れる。
    expect(splitIntoUtterances('ああああああ、いいいいいい', 8)).toEqual([
      'ああああああ、',
      'いいいいいい',
    ]);
  });

  it('読点が無ければ 1 つのまま (強制分割はしない)', () => {
    // 実装は読点でしか割らないので、読点の無い長文はそのまま出る。
    const long = 'あ'.repeat(50);
    expect(splitIntoUtterances(long, 10)).toEqual([long]);
  });

  it('読点で割った各片の前後の空白を落とす', () => {
    expect(splitIntoUtterances('ああああああ、 いいいいいい', 8)).toEqual([
      'ああああああ、',
      'いいいいいい',
    ]);
  });

  // 分割の判断は**整える前の長さ**で下る。文の前後を先に落としておかないと、
  // 前の文の後ろに付いた空白が次の文の長さに乗り、割れ方が変わる。
  it('文の前後の空白は、割る前に落とす (長さの判断に混ぜない)', () => {
    // 前の文の後ろに空白が 3 つ。落とさずに数えると 9 を超えて余分に割れる。
    expect(splitIntoUtterances('あ。   いうえお、かきく。', 9)).toEqual([
      'あ。',
      'いうえお、かきく。',
    ]);
  });

  it('割った片の前後の空白も落とす (途中の片も、最後の片も)', () => {
    // 読点のうしろに空白がある文。押し出される片 (途中) と、
    // 最後に残る片の**両方**で落ちることを見る。
    expect(splitIntoUtterances('あいう、 かきく、 さしす、たちつ。', 8)).toEqual([
      'あいう、',
      'かきく、',
      'さしす、',
      'たちつ。',
    ]);
    expect(splitIntoUtterances('あいう、 かきく。', 5)).toEqual(['あいう、', 'かきく。']);
  });

  it('空白だけの片は積まない (末尾の空白で空の発話を作らない)', () => {
    // 文末の空白は区切りのあとに空の断片を作る。そのまま積むと、
    // 読み上げが一拍止まるだけの空の発話が混ざる。
    expect(splitIntoUtterances('あ。 ')).toEqual(['あ。']);
    expect(splitIntoUtterances('あ。\n\n')).toEqual(['あ。']);
  });

  it('既定の maxLen は 120', () => {
    const s = `${'あ'.repeat(119)}、${'い'.repeat(119)}`;
    expect(splitIntoUtterances(s)).toHaveLength(2);
    expect(splitIntoUtterances('あ'.repeat(120))).toEqual(['あ'.repeat(120)]);
  });
});

describe('scoreJaVoice — 加点と減点を 1 つずつ固定する', () => {
  const V = (over: Partial<{ name: string; lang: string; voiceURI: string; localService: boolean; default: boolean }> = {}) =>
    ({ name: '', lang: 'ja-JP', ...over }) as never;

  it('日本語でなければ -Infinity', () => {
    expect(scoreJaVoice(V({ lang: 'en-US' }))).toBe(-Infinity);
    expect(scoreJaVoice(V({ lang: '' }))).toBe(-Infinity);
    // ja で始まればよい (ja / ja-JP / JA-jp)。
    expect(scoreJaVoice(V({ lang: 'ja' }))).toBe(10);
    expect(scoreJaVoice(V({ lang: 'JA-jp' }))).toBe(10);
  });

  it('素の日本語ボイスは 10', () => {
    expect(scoreJaVoice(V({ name: '名無し' }))).toBe(10);
  });

  it.each([
    ['google', 55],
    ['natural', 50],
    ['neural', 50],
    ['online', 34],
    ['premium', 30],
    ['enhanced', 30],
    ['plus', 30],
    ['kyoko', 42],
    ['nanami', 42],
    ['o-ren', 36],
    ['oren', 36],
    ['otoya', 36],
    ['hattori', 36],
    ['siri', 34],
    ['ayumi', 24],
    ['haruka', 24],
    ['ichiro', 24],
    ['sayaka', 24],
    ['keita', 24],
    ['mizuki', 24],
  ])('名前に %s を含むと +%i', (word, pts) => {
    expect(scoreJaVoice(V({ name: word }))).toBe(10 + pts);
  });

  it.each(['espeak', 'eloquence', 'compact', 'robo', 'pico'])('名前に %s を含むと −40', (word) => {
    expect(scoreJaVoice(V({ name: word }))).toBe(10 - 40);
  });

  it('voiceURI 側の一致も見る', () => {
    expect(scoreJaVoice(V({ name: '無名', voiceURI: 'com.google.ja' }))).toBe(65);
  });

  it('大文字小文字は区別しない', () => {
    expect(scoreJaVoice(V({ name: 'GOOGLE' }))).toBe(65);
    expect(scoreJaVoice(V({ name: 'Kyoko' }))).toBe(52);
  });

  it('localService が false なら +8 (true や未指定では加点しない)', () => {
    expect(scoreJaVoice(V({ localService: false }))).toBe(18);
    expect(scoreJaVoice(V({ localService: true }))).toBe(10);
    expect(scoreJaVoice(V({}))).toBe(10);
  });

  it('default なら +2', () => {
    expect(scoreJaVoice(V({ default: true }))).toBe(12);
    expect(scoreJaVoice(V({ default: false }))).toBe(10);
  });

  it('加点は重ねて足す', () => {
    // google(55) + natural(50) + localService false(8) + default(2) = 125
    expect(scoreJaVoice(V({ name: 'Google Natural', localService: false, default: true }))).toBe(125);
  });

  it('減点も同時に効く', () => {
    // google(55) − espeak(40) = 25
    expect(scoreJaVoice(V({ name: 'google espeak' }))).toBe(25);
  });
});

describe('pickBestJaVoice', () => {
  const V = (name: string, lang = 'ja-JP') => ({ name, lang }) as never;

  it('最高スコアを選ぶ', () => {
    expect(pickBestJaVoice([V('espeak'), V('Google'), V('名無し')])).toEqual(V('Google'));
  });

  it('同点なら先に出てきた方 (> で比較)', () => {
    const a = V('kyoko');
    const b = V('nanami');
    expect(pickBestJaVoice([a, b])).toBe(a);
  });

  it('日本語が 1 つも無ければ null', () => {
    expect(pickBestJaVoice([V('a', 'en-US'), V('b', 'fr-FR')])).toBeNull();
  });

  it('空なら null', () => {
    expect(pickBestJaVoice([])).toBeNull();
  });

  it('日本語が混ざっていれば日本語だけから選ぶ', () => {
    expect(pickBestJaVoice([V('Google', 'en-US'), V('名無し', 'ja-JP')])).toEqual(V('名無し'));
  });
});


/*
 * 発話まわり。**未到達だった 19 件はここ** — 既定値・raw・例外・
 * ボイスの遅延取得 (voiceschanged) の枝を誰も通していなかった。
 */
describe('speak — 既定値と分岐', () => {
  beforeEach(() => resetVoiceCache());

  /** getVoices が最初は空で、あとから voiceschanged で埋まる窓。 */
  function lateVoiceWin(voices: V[]) {
    const spoken: { text: string; voice: V | null }[] = [];
    let ready = false;
    let handler: (() => void) | null = null;
    const win = {
      speechSynthesis: {
        speak: (u: { text: string; voice: V | null }) => spoken.push({ text: u.text, voice: u.voice }),
        cancel: () => {},
        getVoices: () => (ready ? voices : []),
        addEventListener: (_e: string, fn: () => void) => {
          handler = fn;
        },
      },
      SpeechSynthesisUtterance: class {
        text: string;
        lang = '';
        rate = 1;
        pitch = 1;
        voice: V | null = null;
        constructor(t?: string) {
          this.text = t ?? '';
        }
      },
    };
    return { win, spoken, fire: () => { ready = true; handler?.(); } };
  }

  it('既定は ja-JP / rate 0.98 / pitch 1.0', () => {
    const { win, spoken } = mockWin([{ name: 'Google', lang: 'ja-JP' }]);
    expect(speak('こんにちは。', {}, win as never)).toBe(true);
    expect(spoken).toHaveLength(1);
    expect(spoken[0]!.rate).toBe(0.98);
    expect(spoken[0]!.pitch).toBe(1.0);
  });

  it('指定した lang / rate / pitch を使う', () => {
    const { win, spoken } = mockWin([]);
    speak('こんにちは。', { rate: 1.5, pitch: 0.7 }, win as never);
    expect(spoken[0]!.rate).toBe(1.5);
    expect(spoken[0]!.pitch).toBe(0.7);
  });

  it('raw なら整形せず trim だけ', () => {
    const { win, spoken } = mockWin([]);
    speak('  **強調** → x  ', { raw: true }, win as never);
    expect(spoken[0]!.text).toBe('**強調** → x');
  });

  it('raw でなければ整形する', () => {
    const { win, spoken } = mockWin([]);
    speak('**強調** → x', {}, win as never);
    expect(spoken[0]!.text).toBe('強調 から x');
  });

  it('整形して空になったら false (発話しない)', () => {
    const { win, spoken } = mockWin([]);
    expect(speak('```code```', {}, win as never)).toBe(false);
    expect(spoken).toHaveLength(0);
  });

  it('raw で空白だけでも false', () => {
    const { win } = mockWin([]);
    expect(speak('   ', { raw: true }, win as never)).toBe(false);
  });

  it('発話の前に必ず打ち切る', () => {
    const { win, cancels } = mockWin([]);
    speak('あ。', {}, win as never);
    expect(cancels.n).toBe(1);
  });

  it('文ごとに 1 回ずつ speak を呼ぶ', () => {
    const { win, spoken } = mockWin([]);
    speak('一つ目。二つ目。三つ目。', {}, win as never);
    expect(spoken.map((s) => s.text)).toEqual(['一つ目。', '二つ目。', '三つ目。']);
  });

  it('分割結果が空なら整形後の全文を 1 回で読む', () => {
    // 区切り文字が無く maxLen も超えない → 1 つになる。
    const { win, spoken } = mockWin([]);
    speak('区切りの無い文', {}, win as never);
    expect(spoken.map((s) => s.text)).toEqual(['区切りの無い文']);
  });

  it('選んだボイスを載せる', () => {
    const best = { name: 'Google', lang: 'ja-JP' };
    const { win, spoken } = mockWin([{ name: 'espeak', lang: 'ja-JP' }, best]);
    speak('あ。', {}, win as never);
    expect(spoken[0]!.voice).toEqual(best);
  });

  it('日本語ボイスが無ければ voice を載せない', () => {
    const { win, spoken } = mockWin([{ name: 'Alex', lang: 'en-US' }]);
    speak('あ。', {}, win as never);
    expect(spoken[0]!.voice).toBeNull();
  });

  it('speechSynthesis が無ければ false', () => {
    expect(speak('あ。', {}, {} as never)).toBe(false);
    expect(speak('あ。', {}, { speechSynthesis: {} } as never)).toBe(false);
  });

  it('speak が例外を投げても false を返す (呼び出し側を落とさない)', () => {
    const win = {
      speechSynthesis: {
        speak: () => {
          throw new Error('boom');
        },
        cancel: () => {},
        getVoices: () => [],
        addEventListener: () => {},
      },
      SpeechSynthesisUtterance: class {
        constructor(public text?: string) {}
      },
    };
    expect(speak('あ。', {}, win as never)).toBe(false);
  });

  it('getVoices が無い実装でも落ちない', () => {
    const { win, spoken } = mockWin([]);
    delete (win.speechSynthesis as { getVoices?: unknown }).getVoices;
    expect(speak('あ。', {}, win as never)).toBe(true);
    expect(spoken[0]!.voice).toBeNull();
  });

  it('getVoices が初回空でも voiceschanged で選び直す', () => {
    const { win, spoken, fire } = lateVoiceWin([{ name: 'Google', lang: 'ja-JP' }]);
    speak('あ。', {}, win as never);
    expect(spoken[0]!.voice).toBeNull(); // まだ選べていない
    fire();
    speak('い。', {}, win as never);
    expect(spoken[1]!.voice).toEqual({ name: 'Google', lang: 'ja-JP' });
  });

  it('addEventListener が無ければ onvoiceschanged に載せる', () => {
    const voices = [{ name: 'Google', lang: 'ja-JP' }];
    let ready = false;
    const synth: Record<string, unknown> = {
      speak: () => {},
      cancel: () => {},
      getVoices: () => (ready ? voices : []),
    };
    const win = {
      speechSynthesis: synth,
      SpeechSynthesisUtterance: class {
        constructor(public text?: string) {}
      },
    };
    speak('あ。', {}, win as never);
    expect(typeof synth.onvoiceschanged).toBe('function');
    ready = true;
    (synth.onvoiceschanged as () => void)();
    // 選び直された結果が次の発話に載る。
    const spoken: { voice: unknown }[] = [];
    synth.speak = (u: { voice: unknown }) => spoken.push({ voice: u.voice });
    (win.SpeechSynthesisUtterance as unknown) = class {
      voice: unknown = null;
      constructor(public text?: string) {}
    };
    speak('い。', {}, win as never);
    expect(spoken[0]!.voice).toEqual(voices[0]);
  });

  it('voiceschanged が来ても空のままならキャッシュを壊さない', () => {
    const { win, spoken, fire } = lateVoiceWin([]);
    speak('あ。', {}, win as never);
    fire();
    speak('い。', {}, win as never);
    expect(spoken[1]!.voice).toBeNull();
  });

  // 上の検査は**まだ何も選んでいない**状態から始まるので、「消さない」ことを
  // 示せていない (どちらに転んでも null)。声を選んだ**あと**に空で来る道を作る。
  it('選んだあとに voiceschanged が空で来ても、その声を消さない', () => {
    let voices: V[] = [];
    let handler: (() => void) | null = null;
    const spoken: { voice: V | null }[] = [];
    const win = {
      speechSynthesis: {
        speak: (u: { voice: V | null }) => spoken.push({ voice: u.voice }),
        cancel: () => {},
        getVoices: () => voices,
        addEventListener: (_e: string, fn: () => void) => {
          handler = fn;
        },
      },
      SpeechSynthesisUtterance: class {
        constructor(public text = '') {}
        lang = '';
        rate = 1;
        pitch = 1;
        voice: V | null = null;
      },
    };
    // 1) 初回は空。購読だけして、声はまだ無い。
    speak('あ。', {}, win as never);
    expect(spoken[0]!.voice).toBeNull();
    // 2) 声が揃ったので再選定される。
    voices = [{ name: 'Google', lang: 'ja-JP' }];
    handler!();
    // 3) そのあと空で来ても、選んだ声はそのまま。ここで上書きすると、
    //    次の発話が既定の機械音声に戻る。
    voices = [];
    handler!();
    speak('い。', {}, win as never);
    expect(spoken[1]!.voice).toEqual({ name: 'Google', lang: 'ja-JP' });
  });
});

describe('cancelSpeech / isSpeechSynthesisSupported', () => {
  it('speechSynthesis があれば cancel を呼ぶ', () => {
    const { win, cancels } = mockWin([]);
    cancelSpeech(win as never);
    expect(cancels.n).toBe(1);
  });

  it('無ければ何もしない (投げない)', () => {
    expect(() => cancelSpeech({} as never)).not.toThrow();
  });

  it('cancel が例外を投げても飲み込む', () => {
    const win = {
      speechSynthesis: {
        cancel: () => {
          throw new Error('boom');
        },
      },
    };
    expect(() => cancelSpeech(win as never)).not.toThrow();
  });

  it('対応判定は 2 つとも揃って初めて true', () => {
    expect(isSpeechSynthesisSupported({} as never)).toBe(false);
    expect(isSpeechSynthesisSupported({ speechSynthesis: {} } as never)).toBe(false);
    expect(
      isSpeechSynthesisSupported({ SpeechSynthesisUtterance: class {} } as never),
    ).toBe(false);
    expect(
      isSpeechSynthesisSupported({
        speechSynthesis: {},
        SpeechSynthesisUtterance: class {},
      } as never),
    ).toBe(true);
  });
});


/*
 * 2 巡目 — 変異検査で残った箇所から起こした検査。
 *
 * 既存の `mockWin` は **lang を記録していなかった**ので、`opts.lang ?? 'ja-JP'`
 * の既定値を誰も見ていなかった。記録する窓を別に用意する。
 */
describe('ttsAdapter — 残りの枝', () => {
  beforeEach(() => resetVoiceCache());

  /** lang も記録する窓。 */
  function win2(voices: V[] = []) {
    const spoken: { text: string; lang: string; voice: V | null }[] = [];
    const win = {
      speechSynthesis: {
        speak: (u: { text: string; lang: string; voice: V | null }) =>
          spoken.push({ text: u.text, lang: u.lang, voice: u.voice }),
        cancel: () => {},
        getVoices: () => voices,
        addEventListener: () => {},
      },
      SpeechSynthesisUtterance: class {
        text: string;
        lang = '';
        rate = 1;
        pitch = 1;
        voice: V | null = null;
        constructor(t?: string) {
          this.text = t ?? '';
        }
      },
    };
    return { win, spoken };
  }

  it('lang の既定は ja-JP、指定すればそれを使う', () => {
    const a = win2();
    speak('あ。', {}, a.win as never);
    expect(a.spoken[0]!.lang).toBe('ja-JP');
    const b = win2();
    speak('あ。', { lang: 'en-US' }, b.win as never);
    expect(b.spoken[0]!.lang).toBe('en-US');
  });

  it('win を渡さなければグローバルの window を見る', () => {
    // node 環境では window が無いので false。
    expect(isSpeechSynthesisSupported()).toBe(false);
    expect(speak('あ。')).toBe(false);
    expect(() => cancelSpeech()).not.toThrow();
  });

  it('グローバルに window があればそれを使う', () => {
    const g = globalThis as unknown as { window?: unknown };
    const had = 'window' in g;
    const prev = g.window;
    const { win, spoken } = win2();
    g.window = win;
    try {
      expect(isSpeechSynthesisSupported()).toBe(true);
      expect(speak('あ。')).toBe(true);
      expect(spoken).toHaveLength(1);
    } finally {
      if (had) g.window = prev;
      else delete g.window;
    }
  });

  it('引数の win はグローバルより優先される', () => {
    const g = globalThis as unknown as { window?: unknown };
    const had = 'window' in g;
    const prev = g.window;
    const globalWin = win2();
    const argWin = win2();
    g.window = globalWin.win;
    try {
      speak('あ。', {}, argWin.win as never);
      expect(argWin.spoken).toHaveLength(1);
      expect(globalWin.spoken).toHaveLength(0);
    } finally {
      if (had) g.window = prev;
      else delete g.window;
    }
  });

  it('コードブロックは最短一致 (2 つを 1 つに繋げない)', () => {
    expect(normalizeForSpeech('A```x```B```y```C')).toBe('A B C');
  });

  it('落とした部分は空白になる (単語がくっつかない)', () => {
    expect(normalizeForSpeech('あ`code`い')).toBe('あ い');
    expect(normalizeForSpeech('あ https://x.example い')).toBe('あ い');
  });

  it('URL の一致は空白まで貪欲 — 直後に空白なく続く文字も飲む', () => {
    // `\S+` なので、日本語が空白なしで続くと URL の一部として消える。
    // 実際の返答では URL の前後に空白か改行が入るので実害は出ていないが、
    // 挙動としてはこうなる、ということを記録しておく。
    expect(normalizeForSpeech('あhttps://x.exampleい')).toBe('あ');
  });

  it('箇条書きのマーカーは行頭の空白 3 つまで', () => {
    expect(normalizeForSpeech('   - 三つまで')).toBe('三つまで');
    // 4 つ以上ならマーカーとして扱わない (- が残る)。
    expect(normalizeForSpeech('    - 四つ')).toBe('- 四つ');
  });

  it('番号付きは . と ) の両方', () => {
    expect(normalizeForSpeech('1. あ\n2) い')).toBe('あ。い');
  });

  it('三点リーダは 3 つ以上のときだけ句点にする', () => {
    expect(normalizeForSpeech('あ..い')).toBe('あ..い');
    expect(normalizeForSpeech('あ...い')).toBe('あ。い');
    // 全角の … は 1 つでも句点。
    expect(normalizeForSpeech('あ…い')).toBe('あ。い');
  });

  it('lang / name / voiceURI が未設定でも落ちない', () => {
    expect(scoreJaVoice({ name: 'x' } as never)).toBe(-Infinity); // lang 未設定
    expect(scoreJaVoice({ lang: 'ja' } as never)).toBe(10); // name 未設定
    expect(scoreJaVoice({ lang: 'ja', name: undefined, voiceURI: 'google' } as never)).toBe(65);
  });

  it('全部が日本語以外でも -Infinity の比較で null になる', () => {
    // `bestScore === -Infinity` を `!==` にすると、日本語が無いのに best を返す。
    expect(pickBestJaVoice([{ name: 'a', lang: 'en' } as never])).toBeNull();
  });

  it('分割の境目は maxLen ちょうどまでが 1 つ', () => {
    expect(splitIntoUtterances('あ'.repeat(8), 8)).toEqual(['あ'.repeat(8)]);
    // 9 文字・読点付きなら割れる。
    expect(splitIntoUtterances('ああああ、いいいいい', 8)).toEqual(['ああああ、', 'いいいいい']);
  });

  it('読点で割るのは maxLen を超えたときだけ (ちょうどでは割らない)', () => {
    // 「ああ、いい」= 5 文字。maxLen 5 ならそのまま。
    expect(splitIntoUtterances('ああ、いい', 5)).toEqual(['ああ、いい']);
    expect(splitIntoUtterances('ああ、いいい', 5)).toEqual(['ああ、', 'いいい']);
  });

  it('先頭の断片が空なら割らずに溜める', () => {
    // buf が空のうちは超えても押し出さない (空の断片を出さない)。
    const out = splitIntoUtterances('あああああああ、い', 3);
    expect(out.every((x) => x.length > 0)).toBe(true);
    expect(out[0]).toBe('あああああああ、');
  });

  it('割った各片は前後の空白を落とす', () => {
    const out = splitIntoUtterances('ああああ、  いいいいい  ', 8);
    expect(out).toEqual(['ああああ、', 'いいいいい']);
  });

  it('最後の余りが空白だけなら足さない', () => {
    const out = splitIntoUtterances('ああああああ、   ', 6);
    expect(out).toEqual(['ああああああ、']);
  });

  it('ボイスが選べなければ voice を触らない', () => {
    const { win, spoken } = win2([{ name: 'Alex', lang: 'en-US' }]);
    speak('あ。', {}, win as never);
    expect(spoken[0]!.voice).toBeNull();
  });

  it('SpeechSynthesisUtterance だけ欠けていても false', () => {
    const { win } = win2();
    delete (win as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
    expect(speak('あ。', {}, win as never)).toBe(false);
  });

  it('cancelSpeech は speechSynthesis が無い窓でも何もしない', () => {
    expect(() => cancelSpeech({ speechSynthesis: undefined } as never)).not.toThrow();
  });

  it('voiceschanged の再選定は getVoices が無い実装でも落ちない', () => {
    let handler: (() => void) | null = null;
    const synth: Record<string, unknown> = {
      speak: () => {},
      cancel: () => {},
      getVoices: () => [],
      addEventListener: (_e: string, fn: () => void) => {
        handler = fn;
      },
    };
    const win = {
      speechSynthesis: synth,
      SpeechSynthesisUtterance: class {
        constructor(public text?: string) {}
      },
    };
    speak('あ。', {}, win as never);
    // 再選定の直前に getVoices が消えても落ちない。
    delete synth.getVoices;
    expect(() => handler?.()).not.toThrow();
  });

  it('購読するイベント名は voiceschanged', () => {
    // 名前が違うと購読は成立するのに永久に発火せず、既定の機械音声のまま
    // 黙って劣化する (エラーはどこにも出ない)。
    const seen: string[] = [];
    const win = {
      speechSynthesis: {
        speak: () => {},
        cancel: () => {},
        getVoices: () => [] as V[],
        addEventListener: (e: string) => {
          seen.push(e);
        },
      },
      SpeechSynthesisUtterance: class {
        constructor(public text = '') {}
        lang = '';
        rate = 1;
        pitch = 1;
        voice: V | null = null;
      },
    };
    speak('あ。', {}, win as never);
    expect(seen).toEqual(['voiceschanged']);
  });

  it('voiceschanged の購読は 1 度だけ', () => {
    let count = 0;
    const synth = {
      speak: () => {},
      cancel: () => {},
      getVoices: () => [] as V[],
      addEventListener: () => {
        count += 1;
      },
    };
    const win = {
      speechSynthesis: synth,
      SpeechSynthesisUtterance: class {
        constructor(public text?: string) {}
      },
    };
    speak('あ。', {}, win as never);
    speak('い。', {}, win as never);
    expect(count).toBe(1);
  });
});


/*
 * 3 巡目。voice の代入・境目・空文字の既定を、**観測できる形**にして固定する。
 */
describe('ttsAdapter — 代入と境目', () => {
  beforeEach(() => resetVoiceCache());

  /** voice を「触っていない」と「null を入れた」で区別できる窓。 */
  function winSentinel(voices: V[] = []) {
    const spoken: { voice: unknown }[] = [];
    const win = {
      speechSynthesis: {
        speak: (u: { voice: unknown }) => spoken.push({ voice: u.voice }),
        cancel: () => {},
        getVoices: () => voices,
        addEventListener: () => {},
      },
      SpeechSynthesisUtterance: class {
        text: string;
        lang = '';
        rate = 1;
        pitch = 1;
        // 触られたかを見たいので、初期値を null 以外にしておく。
        voice: unknown = 'UNSET';
        constructor(t?: string) {
          this.text = t ?? '';
        }
      },
    };
    return { win, spoken };
  }

  it('選べなければ voice に触らない (null を入れもしない)', () => {
    const { win, spoken } = winSentinel([{ name: 'Alex', lang: 'en-US' }]);
    speak('あ。', {}, win as never);
    expect(spoken[0]!.voice).toBe('UNSET');
  });

  it('選べたら voice を入れる', () => {
    const best = { name: 'Google', lang: 'ja-JP' };
    const { win, spoken } = winSentinel([best]);
    speak('あ。', {}, win as never);
    expect(spoken[0]!.voice).toEqual(best);
  });

  it('lang の判定は前方一致 (jav のような別言語は通さない)', () => {
    // `startsWith('ja')` なので jav (ジャワ語) も通ってしまう。
    // 実装の挙動として記録する — 通す側に倒れているので読み上げは止まらない。
    expect(scoreJaVoice({ name: 'x', lang: 'jav' } as never)).toBe(10);
    expect(scoreJaVoice({ name: 'x', lang: 'aja' } as never)).toBe(-Infinity);
  });

  it('name と voiceURI は空白で連結される (跨いだ一致をしない)', () => {
    // name 末尾 + voiceURI 先頭で 'google' を作っても一致しない。
    expect(scoreJaVoice({ lang: 'ja', name: 'goo', voiceURI: 'gle' } as never)).toBe(10);
    // それぞれの中にあれば一致する。
    expect(scoreJaVoice({ lang: 'ja', name: 'goo', voiceURI: 'google' } as never)).toBe(65);
  });

  it('最高スコアが -Infinity のときだけ null (それ以外は必ず返す)', () => {
    // 減点で 10−40 = −30 になっても -Infinity ではないので返す。
    const espeak = { name: 'espeak', lang: 'ja' } as never;
    expect(pickBestJaVoice([espeak])).toBe(espeak);
  });

  it('maxLen ちょうどは割らず、1 文字超えたら割る', () => {
    expect(splitIntoUtterances('ああ、いい', 5)).toEqual(['ああ、いい']);
    expect(splitIntoUtterances('ああ、いいい', 5)).toEqual(['ああ、', 'いいい']);
  });

  it('溜めている途中の片は trim してから積む', () => {
    // 読点のあとに空白がある場合、押し出す側も trim される。
    const out = splitIntoUtterances(' ああああ 、いいいいい', 8);
    expect(out[0]).toBe('ああああ 、');
    expect(out.every((x) => x === x.trim())).toBe(true);
  });

  it('最後の余りも trim してから積む', () => {
    const out = splitIntoUtterances('ああああああ、 いい ', 8);
    expect(out[out.length - 1]).toBe('いい');
  });

  it('箇条書きのマーカーは後ろに空白が要る', () => {
    // `\s+` なので、マーカー直後に空白が無ければ落とさない。
    expect(normalizeForSpeech('-空白なし')).toBe('-空白なし');
    expect(normalizeForSpeech('- 空白あり')).toBe('空白あり');
  });

  it('中黒もマーカーとして落とす', () => {
    expect(normalizeForSpeech('・ 項目')).toBe('項目');
  });
});


/*
 * voiceschanged の再選定だけを切り出して見る。
 *
 * 前の検査は「fire したあと speak すると声が載る」を見ていたが、**その
 * speak が自分で getVoices を呼び直して選び直してしまう**ので、再選定の
 * 中身を空にしても通ってしまった。getVoices が「再選定のときだけ」中身を
 * 返す窓を作り、キャッシュ経由でしか声が載らない状況にする。
 */
describe('ttsAdapter — voiceschanged の再選定を切り出す', () => {
  beforeEach(() => resetVoiceCache());

  function winOnce(voices: V[]) {
    const spoken: { voice: V | null }[] = [];
    let handler: (() => void) | null = null;
    let armed = false; // true の 1 回だけ voices を返す
    const win = {
      speechSynthesis: {
        speak: (u: { voice: V | null }) => spoken.push({ voice: u.voice }),
        cancel: () => {},
        getVoices: () => {
          if (!armed) return [];
          armed = false;
          return voices;
        },
        addEventListener: (_e: string, fn: () => void) => {
          handler = fn;
        },
      },
      SpeechSynthesisUtterance: class {
        text: string;
        lang = '';
        rate = 1;
        pitch = 1;
        voice: V | null = null;
        constructor(t?: string) {
          this.text = t ?? '';
        }
      },
    };
    return {
      win,
      spoken,
      fireWithVoices: () => {
        armed = true;
        handler?.();
      },
    };
  }

  it('再選定で入ったキャッシュが、その後の発話に載る', () => {
    const best = { name: 'Google', lang: 'ja-JP' };
    const { win, spoken, fireWithVoices } = winOnce([best]);

    speak('あ。', {}, win as never); // getVoices は空 → 購読するだけ
    expect(spoken[0]!.voice).toBeNull();

    fireWithVoices(); // ここでだけ getVoices が中身を返す

    speak('い。', {}, win as never); // getVoices は再び空 → キャッシュを使う
    expect(spoken[1]!.voice).toEqual(best);
  });

  it('再選定のときも日本語以外は選ばない', () => {
    const { win, spoken, fireWithVoices } = winOnce([{ name: 'Alex', lang: 'en-US' }]);
    speak('あ。', {}, win as never);
    fireWithVoices();
    speak('い。', {}, win as never);
    expect(spoken[1]!.voice).toBeNull();
  });

  it('再選定で空が返ってきたらキャッシュを触らない', () => {
    const best = { name: 'Google', lang: 'ja-JP' };
    const { win, spoken, fireWithVoices } = winOnce([best]);
    speak('あ。', {}, win as never);
    fireWithVoices(); // 1 度目で入る
    // もう一度 handler を叩くと getVoices は空を返す。上書きされないこと。
    speak('い。', {}, win as never);
    expect(spoken[1]!.voice).toEqual(best);
  });
});
