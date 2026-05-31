import { describe, expect, it } from 'vitest';
import { parseHighlightSettings } from '../highlightSettings';
import { DEFAULT_HIGHLIGHT_THRESHOLDS } from '../managementHighlights';

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
