import { describe, expect, it, vi } from 'vitest';
import { extractJson, normalizeAnalysis } from '../emotions';

describe('extractJson', () => {
  it('returns the raw text when no fences are present', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it('strips ```json fences', () => {
    expect(extractJson('```json\n{"x":1}\n```')).toBe('{"x":1}');
  });

  it('strips bare ``` fences (no lang tag)', () => {
    expect(extractJson('```\n{"x":1}\n```')).toBe('{"x":1}');
  });

  it('trims surrounding whitespace', () => {
    expect(extractJson('   {"a":1}   ')).toBe('{"a":1}');
  });
});

describe('normalizeAnalysis', () => {
  it('produces all six emotion keys even when input is missing them', () => {
    const n = normalizeAnalysis({ scores: { joy: 0.7 } });
    expect(Object.keys(n.scores).sort()).toEqual(
      ['anger', 'disgust', 'fear', 'joy', 'sadness', 'surprise'],
    );
    expect(n.scores.joy).toBe(0.7);
    expect(n.scores.sadness).toBe(0);
  });

  it('clamps out-of-range scores into [0, 1]', () => {
    const n = normalizeAnalysis({ scores: { joy: 5, sadness: -3, anger: 0.5 } });
    expect(n.scores.joy).toBe(1);
    expect(n.scores.sadness).toBe(0);
    expect(n.scores.anger).toBe(0.5);
  });

  it('falls back to neutral sentiment when value is unknown', () => {
    expect(normalizeAnalysis({ sentiment: 'amazing' }).sentiment).toBe('neutral');
    expect(normalizeAnalysis({}).sentiment).toBe('neutral');
  });

  it('passes through valid sentiment values', () => {
    expect(normalizeAnalysis({ sentiment: 'positive' }).sentiment).toBe('positive');
    expect(normalizeAnalysis({ sentiment: 'negative' }).sentiment).toBe('negative');
  });

  it('uses the model-provided dominant when it is a known label', () => {
    const n = normalizeAnalysis({
      scores: { joy: 0.1, anger: 0.9 },
      dominant: 'anger',
    });
    expect(n.dominant).toBe('anger');
  });

  it('computes dominant from scores when the model omits the field', () => {
    const n = normalizeAnalysis({ scores: { joy: 0.1, sadness: 0.8, anger: 0.3 } });
    expect(n.dominant).toBe('sadness');
  });

  it('returns "mixed" when no score is positive', () => {
    const n = normalizeAnalysis({ scores: { joy: 0, sadness: 0, anger: 0 } });
    expect(n.dominant).toBe('mixed');
  });

  it('handles entirely empty/null input', () => {
    const n = normalizeAnalysis(null);
    expect(n.sentiment).toBe('neutral');
    expect(n.scores.joy).toBe(0);
  });

  it('rejects an invalid dominant label and recomputes from scores', () => {
    const n = normalizeAnalysis({
      scores: { joy: 0.9 },
      dominant: 'something-weird',
    });
    expect(n.dominant).toBe('joy');
  });
});

// We can't fully exercise the actions in unit tests (they touch
// app.getPath / disk), but the action wrapper itself is thin —
// the tested pure helpers above cover the parsing/normalization
// logic that's prone to failure. End-to-end behaviour is verified
// by manual exercise in the renderer.
void vi; // keep vitest happy if it ever wants the import
