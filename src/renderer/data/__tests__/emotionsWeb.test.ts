/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMOTIONS_STORE_KEY,
  EMOTION_KEYS,
  loadStore,
  logMood,
  clearHistory,
  extractJson,
  normalizeAnalysis,
  recordAnalysis,
  buildEmotionsSnapshot,
} from '../emotionsWeb';

beforeEach(() => localStorage.clear());

const NOW = Date.UTC(2026, 0, 31, 9, 0, 0);

describe('logMood', () => {
  it('records a mood and persists it', () => {
    const r = logMood({ score: 4, note: 'good', date: '2026-01-31' });
    expect(r).toEqual({ date: '2026-01-31', score: 4 });
    expect(loadStore().moods).toEqual([{ date: '2026-01-31', score: 4, note: 'good' }]);
  });
  it('replaces the same-day entry', () => {
    logMood({ score: 2, date: '2026-01-31' });
    logMood({ score: 5, date: '2026-01-31' });
    const moods = loadStore().moods;
    expect(moods).toHaveLength(1);
    expect(moods[0]!.score).toBe(5);
  });
  it('rounds and validates the score range', () => {
    expect(logMood({ score: 3.4, date: '2026-01-31' }).score).toBe(3);
    expect(() => logMood({ score: 0 })).toThrow(/between 1 and 5/);
    expect(() => logMood({ score: 6 })).toThrow(/between 1 and 5/);
    expect(() => logMood({ score: 'x' })).toThrow(/between 1 and 5/);
  });
  it('defaults the date to today when omitted/invalid', () => {
    const r = logMood({ score: 3 }, NOW);
    expect(r.date).toBe('2026-01-31');
  });
  it('keeps moods sorted by date', () => {
    logMood({ score: 3, date: '2026-02-02' });
    logMood({ score: 3, date: '2026-01-01' });
    expect(loadStore().moods.map((m) => m.date)).toEqual(['2026-01-01', '2026-02-02']);
  });
});

describe('clearHistory', () => {
  it('clears moods by default and reports prior counts', () => {
    logMood({ score: 3, date: '2026-01-31' });
    recordAnalysis('hi', undefined, normalizeAnalysis({}), NOW);
    const before = clearHistory(undefined);
    expect(before.moods).toBe(1);
    expect(loadStore().moods).toEqual([]);
    // default kind clears moods only, analyses remain
    expect(loadStore().analyses).toHaveLength(1);
  });
  it('clears all when kind=all', () => {
    logMood({ score: 3, date: '2026-01-31' });
    recordAnalysis('hi', undefined, normalizeAnalysis({}), NOW);
    clearHistory('all');
    const s = loadStore();
    expect(s.moods).toEqual([]);
    expect(s.analyses).toEqual([]);
  });
});

describe('extractJson', () => {
  it('strips json code fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });
});

describe('normalizeAnalysis', () => {
  it('clamps scores to [0,1] and fills missing keys with 0', () => {
    const n = normalizeAnalysis({ scores: { joy: 2, sadness: -1 }, sentiment: 'positive', dominant: 'joy' });
    expect(n.scores.joy).toBe(1);
    expect(n.scores.sadness).toBe(0);
    for (const k of EMOTION_KEYS) expect(typeof n.scores[k]).toBe('number');
    expect(n.sentiment).toBe('positive');
    expect(n.dominant).toBe('joy');
  });
  it('defaults sentiment to neutral and derives dominant when absent', () => {
    const n = normalizeAnalysis({ scores: { anger: 0.9 } });
    expect(n.sentiment).toBe('neutral');
    expect(n.dominant).toBe('anger');
  });
  it('returns dominant=mixed when all scores are zero', () => {
    expect(normalizeAnalysis({}).dominant).toBe('mixed');
  });
});

describe('recordAnalysis + buildEmotionsSnapshot', () => {
  it('prepends the newest analysis and reflects in the snapshot', () => {
    recordAnalysis('first text', 'Slack', normalizeAnalysis({ scores: { joy: 0.8 }, sentiment: 'positive' }), NOW);
    const snap = buildEmotionsSnapshot(true);
    expect(snap.keyConfigured).toBe(true);
    expect(snap.analyses).toHaveLength(1);
    expect(snap.analyses[0]!.excerpt).toContain('[Slack]');
    expect(snap.analyses[0]!.sentiment).toBe('positive');
  });
  it('empty snapshot when nothing stored', () => {
    const snap = buildEmotionsSnapshot(false);
    expect(snap.moods).toEqual([]);
    expect(snap.analyses).toEqual([]);
    expect(snap.keyConfigured).toBe(false);
  });
  it('ignores corrupt storage', () => {
    localStorage.setItem(EMOTIONS_STORE_KEY, '{bad');
    expect(loadStore()).toEqual({ moods: [], analyses: [] });
  });
});
