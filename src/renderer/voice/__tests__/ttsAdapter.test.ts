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
