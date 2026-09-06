/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { EMOTIONS_STORE_KEY, assertStoreWritable, clearHistory, isAnalysisEntry, isMoodEntry, loadStore, logMood } from '../emotionsWeb';
import { asRecord } from '../../../shared/emotionsShape';

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
    // 欄ごとに 1 標本 (どの欄の検査を外しても鳴る)。scores は配列 (Object.values は通る) と null (投げる) も。
    for (const bad of [
      null,
      'junk',
      { ...GOOD_ANALYSIS, id: 1 },
      { ...GOOD_ANALYSIS, timestamp: '2026' },
      { ...GOOD_ANALYSIS, excerpt: null },
      { ...GOOD_ANALYSIS, scores: 'high' },
      { ...GOOD_ANALYSIS, scores: [1] },
      { ...GOOD_ANALYSIS, scores: null },
      { ...GOOD_ANALYSIS, scores: { joy: '1' } },
      { ...GOOD_ANALYSIS, scores: { joy: 1, sadness: '1' } }, // 1 つでも数値でなければ (every が some に縮まないこと)
      { ...GOOD_ANALYSIS, sentiment: 'happy' },
      { ...GOOD_ANALYSIS, dominant: 3 },
    ]) {
      expect(isAnalysisEntry(bad), JSON.stringify(bad)).toBe(false);
    }
    // 3 つの sentiment はどれも通る (1 つだけ通る形に縮んでいないこと)
    for (const sentiment of ['positive', 'neutral', 'negative']) {
      expect(isAnalysisEntry({ ...GOOD_ANALYSIS, sentiment }), sentiment).toBe(true);
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

describe('asRecord — 保管値の JSON を辞書として読む (両ビルド共通)', () => {
  beforeEach(() => localStorage.clear());

  it('オブジェクトはそのまま、null / 配列 / 数値 / 文字列 / 真偽値 / undefined は空の辞書', () => {
    const rec = { moods: [] };
    expect(asRecord(rec)).toBe(rec);
    for (const v of [null, [], 42, 'x', true, undefined]) expect(asRecord(v)).toEqual({});
  });

  it('★ 標本: オブジェクトでない保管値 (null / [] / 42) は欄が無い古い形と同じで、読めて書ける', () => {
    for (const raw of ['null', '[]', '42']) {
      localStorage.setItem(EMOTIONS_STORE_KEY, raw);
      expect(loadStore(), raw).toEqual({ moods: [], analyses: [] });
      logMood({ date: '2026-02-02', score: 3, note: 'new' });
      expect(loadStore().moods, raw).toHaveLength(1);
    }
  });
});

describe('assertStoreWritable — 書けるかだけを確かめる (web-shim が送る前に呼ぶ)', () => {
  beforeEach(() => localStorage.clear());

  it('空文字の保管値は「無い」と同じ (消える物が無いので degraded ではなく、書ける)', () => {
    localStorage.setItem(EMOTIONS_STORE_KEY, '');
    expect(loadStore()).toEqual({ moods: [], analyses: [] });
    expect(() => assertStoreWritable()).not.toThrow();
    logMood({ date: '2026-02-02', score: 3, note: 'new' });
    expect(loadStore().moods).toHaveLength(1);
  });

  it('★ 形の違う要素が混じっていれば投げ、保管値はそのまま', () => {
    const broken = JSON.stringify({ moods: [null], analyses: [] });
    localStorage.setItem(EMOTIONS_STORE_KEY, broken);
    expect(() => assertStoreWritable()).toThrow(/記録を中止/);
    expect(localStorage.getItem(EMOTIONS_STORE_KEY)).toBe(broken);
  });

  it('対照: 合う保管値でも無い保管値でも投げない', () => {
    expect(() => assertStoreWritable()).not.toThrow();
    localStorage.setItem(EMOTIONS_STORE_KEY, JSON.stringify({ moods: [{ date: '2026-01-01', score: 4, note: '' }], analyses: [] }));
    expect(() => assertStoreWritable()).not.toThrow();
  });
});
