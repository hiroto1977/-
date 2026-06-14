import { describe, expect, it } from 'vitest';
import { parseHighlightSettings, HIGHLIGHT_SETTINGS_COLLECTION } from '../highlightSettings';
import { DEFAULT_HIGHLIGHT_THRESHOLDS } from '../managementHighlights';

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
    expect(() => parseHighlightSettings({ declineWarnStreak: 0 })).toThrow('連続下落(警告)期数は 1 以上の整数で入力してください');
    expect(() => parseHighlightSettings({ declineCriticalStreak: 0 })).toThrow('連続下落(危険)期数は 1 以上の整数で入力してください');
    expect(() => parseHighlightSettings({ laborShareWarnPct: -1 })).toThrow('労働分配率の警告しきい値は 0〜100 の数値で入力してください');
    expect(() => parseHighlightSettings({ singleChannelWarnPct: 200 })).toThrow('単一チャネル依存の警告しきい値は 0〜100 の数値で入力してください');
  });
});

describe('parseHighlightSettings', () => {
  it('fills every field from defaults when input is empty', () => {
    expect(parseHighlightSettings({})).toEqual(DEFAULT_HIGHLIGHT_THRESHOLDS);
  });

  it('coerces string numbers and floors streaks to integers', () => {
    const s = parseHighlightSettings({
      declineWarnStreak: '2',
      declineCriticalStreak: '4',
      laborShareWarnPct: '70',
      singleChannelWarnPct: '50',
    });
    expect(s).toEqual({ declineWarnStreak: 2, declineCriticalStreak: 4, laborShareWarnPct: 70, singleChannelWarnPct: 50 });
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
