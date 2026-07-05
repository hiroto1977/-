import { describe, it, expect, vi } from 'vitest';
import { isSpeechSynthesisSupported, speak, cancelSpeech } from '../ttsAdapter';

function mockWin() {
  const spoken: string[] = [];
  const cancels = { n: 0 };
  const win = {
    speechSynthesis: {
      speak: (u: { text: string }) => spoken.push(u.text),
      cancel: () => {
        cancels.n++;
      },
    },
    SpeechSynthesisUtterance: class {
      text: string;
      lang = '';
      rate = 1;
      pitch = 1;
      constructor(t?: string) {
        this.text = t ?? '';
      }
    },
  };
  return { win, spoken, cancels };
}

describe('ttsAdapter', () => {
  it('reports unsupported when the API is absent', () => {
    expect(isSpeechSynthesisSupported({})).toBe(false);
  });

  it('reports supported when speechSynthesis + Utterance exist', () => {
    const { win } = mockWin();
    expect(isSpeechSynthesisSupported(win as never)).toBe(true);
  });

  it('speak() cancels prior utterance then speaks the text', () => {
    const { win, spoken, cancels } = mockWin();
    const ok = speak('こんにちは', {}, win as never);
    expect(ok).toBe(true);
    expect(spoken).toEqual(['こんにちは']);
    expect(cancels.n).toBe(1);
  });

  it('speak() returns false and is silent when unsupported', () => {
    expect(speak('x', {}, {} as never)).toBe(false);
  });

  it('speak() ignores empty/whitespace text', () => {
    const { win, spoken } = mockWin();
    expect(speak('   ', {}, win as never)).toBe(false);
    expect(spoken).toEqual([]);
  });

  it('speak() swallows synth errors (never throws)', () => {
    const win = {
      speechSynthesis: {
        speak: () => {
          throw new Error('boom');
        },
        cancel: vi.fn(),
      },
      SpeechSynthesisUtterance: class {
        constructor(public text = '') {}
        lang = '';
        rate = 1;
        pitch = 1;
      },
    };
    expect(speak('hi', {}, win as never)).toBe(false);
  });

  it('cancelSpeech() is a no-op when unsupported', () => {
    expect(() => cancelSpeech({})).not.toThrow();
  });
});
