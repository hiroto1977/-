import { describe, expect, it } from 'vitest';
import { parseHighlightSettings, HIGHLIGHT_SETTINGS_COLLECTION, HIGHLIGHT_THRESHOLD_FIELDS } from '../highlightSettings';
import { DEFAULT_HIGHLIGHT_THRESHOLDS } from '../managementHighlights';
import { COLLECTION_SHAPES } from '../collectionShapes';

describe('parseHighlightSettings — keys, boundaries & labels', () => {
  it('exposes the highlight-settings collection key', () => {
    expect(HIGHLIGHT_SETTINGS_COLLECTION).toBe('highlight-settings');
  });

  it('accepts boundary values: streak 1 and percentages 0 / 100', () => {
    const s = parseHighlightSettings({
      declineWarnStreak: 1, declineCriticalStreak: 1, laborShareWarnPct: 0, singleChannelWarnPct: 100,
    });
    expect(s.declineWarnStreak).toBe(1); // n<1 を <=1 にする mutant を kill
    expect(s.laborShareWarnPct).toBe(0); // n<0 を <=0 に
    expect(s.singleChannelWarnPct).toBe(100); // n>100 を >=100 に
  });

  it('treats a blank percentage as the default for that field (not 0)', () => {
    // pct の `v === ''` を外す mutant は Number('')=0 を返してしまうため、既定値で殺す。
    const s = parseHighlightSettings({ laborShareWarnPct: '' });
    expect(s.laborShareWarnPct).toBe(DEFAULT_HIGHLIGHT_THRESHOLDS.laborShareWarnPct);
  });

  it('reports the exact field label in each validation error (StringLiteral golden)', () => {
    // ★ 期数の断りは Error そのもので照合する (2026-09-27 · パス 496) —— 断りの文を関数で組むので、
    //   `toThrow('文面')` だとその関数が undefined を返す形を素通りする (chai は投げた値が偽だと
    //   文面の照合を飛ばす —— 実測)。`toThrow(new Error(…))` は Error であることと文面の一致を両方見る。
    expect(() => parseHighlightSettings({ declineWarnStreak: 0 })).toThrow(new Error('連続下落(警告)期数は 1 以上の整数で入力してください'));
    expect(() => parseHighlightSettings({ declineCriticalStreak: 0 })).toThrow(new Error('連続下落(危険)期数は 1 以上の整数で入力してください'));
    expect(() => parseHighlightSettings({ laborShareWarnPct: -1 })).toThrow('労働分配率の警告しきい値は 0〜100 の数値で入力してください');
    expect(() => parseHighlightSettings({ singleChannelWarnPct: 200 })).toThrow('単一チャネル依存の警告しきい値は 0〜100 の数値で入力してください');
    expect(() => parseHighlightSettings({ budgetShortfallWarnPct: 101 })).toThrow('予算未達の警告しきい値は 0〜100 の数値で入力してください');
  });
});

/*
 * **しきい値はどれも保存でき、画面から設定できる** (2026-09-27 · パス 493c)。
 * 予算未達の 90 は判定の中の生の literal で、設定の型にも保存の形にも画面の欄にも居なかった。
 * 鍵の母集団は `DEFAULT_HIGHLIGHT_THRESHOLDS` から導く —— 手で並べると 6 つ目で黙る。
 */
describe('★ しきい値の鍵は、検証・保存の形・画面の欄のすべてに在る (両方向)', () => {
  const KEYS = Object.keys(DEFAULT_HIGHLIGHT_THRESHOLDS).sort();

  it('画面の欄の表は、しきい値の鍵と同じ集合 (重複なし・名札は空でない)', () => {
    const keys = HIGHLIGHT_THRESHOLD_FIELDS.map((f) => f.key);
    expect([...keys].sort()).toEqual(KEYS);
    expect(new Set(keys).size).toBe(keys.length);
    const labels = HIGHLIGHT_THRESHOLD_FIELDS.map((f) => f.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const l of labels) expect(l.trim().length).toBeGreaterThan(0);
  });

  it('保存の形は、しきい値の鍵と同じ欄を持つ', () => {
    expect([...COLLECTION_SHAPES[HIGHLIGHT_SETTINGS_COLLECTION]!.fields].sort()).toEqual(KEYS);
  });

  it.each(KEYS)('%s は検証を通って保存値に載る (既定と違う値で —— 黙って既定へ倒さない)', (key) => {
    const d = DEFAULT_HIGHLIGHT_THRESHOLDS[key as keyof typeof DEFAULT_HIGHLIGHT_THRESHOLDS];
    // 連続下落は危険 ≧ 警告の関係があるので、危険の側を上げても警告は既定のまま成り立つ。
    const v = key === 'declineWarnStreak' ? 3 : d === 100 ? 99 : d + 1;
    const input = key === 'declineWarnStreak' ? { declineWarnStreak: v, declineCriticalStreak: 3 } : { [key]: v };
    expect(parseHighlightSettings(input)[key as keyof typeof DEFAULT_HIGHLIGHT_THRESHOLDS]).toBe(v);
  });
});

describe('予算未達のしきい値の検証 (パス 493c)', () => {
  it('★ 天井は 100 —— 越えると達成済みの売上に「予算未達」と言うことになる', () => {
    expect(parseHighlightSettings({ budgetShortfallWarnPct: 100 }).budgetShortfallWarnPct).toBe(100);
    expect(() => parseHighlightSettings({ budgetShortfallWarnPct: 100.1 })).toThrow('予算未達の警告しきい値は 0〜100 の数値で入力してください');
  });

  it('0 は通り、負は断る', () => {
    expect(parseHighlightSettings({ budgetShortfallWarnPct: 0 }).budgetShortfallWarnPct).toBe(0);
    expect(() => parseHighlightSettings({ budgetShortfallWarnPct: -1 })).toThrow(/0〜100/);
  });

  it('空欄は既定 (90) —— 0 ではない', () => {
    expect(parseHighlightSettings({ budgetShortfallWarnPct: '' }).budgetShortfallWarnPct).toBe(90);
    expect(parseHighlightSettings({}).budgetShortfallWarnPct).toBe(90);
  });

  it('★ この欄を持たない古い控え (パス 493c より前) も通り、既定へ倒れる', () => {
    const old = { declineWarnStreak: 2, declineCriticalStreak: 3, laborShareWarnPct: 60, singleChannelWarnPct: 60 };
    expect(COLLECTION_SHAPES[HIGHLIGHT_SETTINGS_COLLECTION]!(old)).toBe(true);
    expect(parseHighlightSettings(old).budgetShortfallWarnPct).toBe(90);
  });
});

describe('parseHighlightSettings', () => {
  it('fills every field from defaults when input is empty', () => {
    expect(parseHighlightSettings({})).toEqual(DEFAULT_HIGHLIGHT_THRESHOLDS);
  });

  it('coerces string numbers (streaks must already be integers — パス 496)', () => {
    const s = parseHighlightSettings({
      declineWarnStreak: '2',
      declineCriticalStreak: '4',
      laborShareWarnPct: '70',
      singleChannelWarnPct: '50',
    });
    expect(s).toEqual({
      declineWarnStreak: 2, declineCriticalStreak: 4, laborShareWarnPct: 70, singleChannelWarnPct: 50,
      budgetShortfallWarnPct: DEFAULT_HIGHLIGHT_THRESHOLDS.budgetShortfallWarnPct,
    });
  });

  it('treats blank fields as the default for that field', () => {
    const s = parseHighlightSettings({ declineWarnStreak: '', laborShareWarnPct: '55' });
    expect(s.declineWarnStreak).toBe(DEFAULT_HIGHLIGHT_THRESHOLDS.declineWarnStreak);
    expect(s.laborShareWarnPct).toBe(55);
  });

  it('rejects a streak below 1', () => {
    expect(() => parseHighlightSettings({ declineWarnStreak: '0' })).toThrow(/1 以上/);
  });

  it('rejects critical streak smaller than warning streak', () => {
    expect(() => parseHighlightSettings({ declineWarnStreak: '3', declineCriticalStreak: '2' })).toThrow(/警告期数以上/);
  });

  it('rejects out-of-range percentages', () => {
    expect(() => parseHighlightSettings({ laborShareWarnPct: '150' })).toThrow(/0〜100/);
    expect(() => parseHighlightSettings({ singleChannelWarnPct: '-1' })).toThrow(/0〜100/);
  });

  it('allows equal warning and critical streaks', () => {
    const s = parseHighlightSettings({ declineWarnStreak: '3', declineCriticalStreak: '3' });
    expect(s.declineWarnStreak).toBe(3);
    expect(s.declineCriticalStreak).toBe(3);
  });
});

/**
 * **しきい値の読みは画面と同じ 1 つ** (2026-09-27 · パス 496)。それまでは `Number()` で、
 * 全角の数字や `'60%'` を断り、期数の `'2.9'` を黙って 2 に切り捨て、空白だけの欄を 0 と読んで断っていた。
 */
describe('parseHighlightSettings — 画面と同じ読み方 (パス 496)', () => {
  it('★ 期数は整数でなければ断る (黙って切り捨てない)', () => {
    expect(() => parseHighlightSettings({ declineWarnStreak: '2.9' })).toThrow(new Error('連続下落(警告)期数は 1 以上の整数で入力してください'));
    // 読めない入力も同じ文で断る (判定を 2 行に分けたので、読めない側の行も Error で照合する)
    expect(() => parseHighlightSettings({ declineWarnStreak: '2期' })).toThrow(new Error('連続下落(警告)期数は 1 以上の整数で入力してください'));
  });
  it('★ 空白だけの欄も空欄 (既定へ倒す)', () => {
    for (const raw of ['  ', '　']) {
      expect(parseHighlightSettings({ declineWarnStreak: raw }).declineWarnStreak).toBe(DEFAULT_HIGHLIGHT_THRESHOLDS.declineWarnStreak);
    }
  });
  it('★ 全角の数字と % を読む', () => {
    expect(parseHighlightSettings({ laborShareWarnPct: '６０' }).laborShareWarnPct).toBe(60);
    expect(parseHighlightSettings({ laborShareWarnPct: '55%' }).laborShareWarnPct).toBe(55);
    expect(() => parseHighlightSettings({ laborShareWarnPct: '1e1' })).toThrow('0〜100 の数値で入力してください');
  });
});
