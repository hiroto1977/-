/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { EMOTIONS_STORE_KEY, clearHistory, isAnalysisEntry, isMoodEntry, loadStore, logMood } from '../emotionsWeb';

/*
 * `loadStore` は moods / analyses が配列かだけを見て、要素の形は信じていた。null が 1 つ混じると
 * `m.date` で落ち、`score: '3'` は平均を NaN にする。方針は emotionsCorruptStore.test.ts と同じ ——
 * **在るのに読めない**ものは、読み出しでは残りを返し、書き込みは断る (上書きで消えるため)。
 */
const GOOD_MOOD = { date: '2026-01-01', score: 4, note: '大事なメモ' };
const GOOD_ANALYSIS = {
  id: 'a1',
  timestamp: 1_700_000_000_000,
  excerpt: '今日は良い日',
  scores: { joy: 0.8, sadness: 0, anger: 0, fear: 0, surprise: 0.1, disgust: 0 },
  sentiment: 'positive',
  dominant: 'joy',
};

beforeEach(() => {
  localStorage.clear();
});

describe('要素の形', () => {
  it('isMoodEntry / isAnalysisEntry: 書く形は通り、欠け・型違いは通らない', () => {
    expect(isMoodEntry(GOOD_MOOD)).toBe(true);
    for (const bad of [null, 'x', { date: 5, score: 4, note: '' }, { date: '2026-01-01', score: '4', note: '' }, { date: '2026-01-01', score: NaN, note: '' }, { date: '2026-01-01', score: 4 }]) {
      expect(isMoodEntry(bad), JSON.stringify(bad)).toBe(false);
    }
    expect(isAnalysisEntry(GOOD_ANALYSIS)).toBe(true);
    for (const bad of [null, { ...GOOD_ANALYSIS, sentiment: 'happy' }, { ...GOOD_ANALYSIS, scores: 'high' }, { ...GOOD_ANALYSIS, timestamp: '2026' }]) {
      expect(isAnalysisEntry(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('形の違う要素が混じった保管値', () => {
  it('★ 読み出しは残りを返し、logMood は断り、保管値はそのまま残る', () => {
    const raw = JSON.stringify({ moods: [GOOD_MOOD, null, { date: 5 }, { date: '2026-01-02', score: '3', note: '' }], analyses: [GOOD_ANALYSIS, 'junk'] });
    localStorage.setItem(EMOTIONS_STORE_KEY, raw);
    expect(loadStore()).toEqual({ moods: [GOOD_MOOD], analyses: [GOOD_ANALYSIS] });
    expect(() => logMood({ date: '2026-02-02', score: 3, note: 'new' })).toThrow(/記録を中止/);
    expect(localStorage.getItem(EMOTIONS_STORE_KEY)).toBe(raw);
  });
  it('★ 欄が在るのに配列でない (moods: "x") も同じ扱い', () => {
    localStorage.setItem(EMOTIONS_STORE_KEY, JSON.stringify({ moods: 'x', analyses: [] }));
    expect(loadStore()).toEqual({ moods: [], analyses: [] });
    expect(() => logMood({ date: '2026-02-02', score: 3, note: 'new' })).toThrow(/記録を中止/);
  });
  it('対照: 欄が無いだけの古い形は読めた扱いで、普通に書ける', () => {
    localStorage.setItem(EMOTIONS_STORE_KEY, JSON.stringify({ moods: [GOOD_MOOD] }));
    expect(loadStore()).toEqual({ moods: [GOOD_MOOD], analyses: [] });
    expect(logMood({ date: '2026-02-02', score: 3, note: 'new' })).toEqual({ date: '2026-02-02', score: 3 });
    expect(loadStore().moods.map((m) => m.date)).toEqual(['2026-01-01', '2026-02-02']);
  });
  it('対照: 合う保管値なら何も変わらず、「履歴を消去」は壊れていても通る', () => {
    localStorage.setItem(EMOTIONS_STORE_KEY, JSON.stringify({ moods: [GOOD_MOOD], analyses: [GOOD_ANALYSIS] }));
    expect(loadStore()).toEqual({ moods: [GOOD_MOOD], analyses: [GOOD_ANALYSIS] });
    localStorage.setItem(EMOTIONS_STORE_KEY, JSON.stringify({ moods: [null], analyses: [] }));
    expect(() => clearHistory('all')).not.toThrow();
    expect(loadStore()).toEqual({ moods: [], analyses: [] });
  });
});
