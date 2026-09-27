import { describe, expect, it } from 'vitest';
import { INDUSTRY_PRESETS, getIndustryPreset } from '../industryPresets';
import { parseHighlightSettings } from '../highlightSettings';
import { DEFAULT_HIGHLIGHT_THRESHOLDS } from '../managementHighlights';

describe('INDUSTRY_PRESETS', () => {
  it('exposes the default preset first and mirrors DEFAULT_HIGHLIGHT_THRESHOLDS', () => {
    expect(INDUSTRY_PRESETS[0]!.id).toBe('default');
    expect(INDUSTRY_PRESETS[0]!.thresholds).toEqual(DEFAULT_HIGHLIGHT_THRESHOLDS);
  });

  it('has unique ids and non-empty labels/notes', () => {
    const ids = INDUSTRY_PRESETS.map((p) => p.id);
    // 全 id を固定 (各 id の StringLiteral mutation を kill)。
    expect(ids).toEqual(['default', 'retail', 'manufacturing', 'saas', 'service']);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of INDUSTRY_PRESETS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.note.length).toBeGreaterThan(0);
    }
  });

  it('every preset passes parseHighlightSettings validation', () => {
    for (const p of INDUSTRY_PRESETS) {
      // round-trips through the same validator the UI uses.
      // 欄を手で並べない (パス 493c) —— 並べると 5 つ目の欄が検証を通らないまま既定と一致して黙る。
      const parsed = parseHighlightSettings({ ...p.thresholds });
      expect(parsed).toEqual(p.thresholds);
    }
  });

  it('keeps critical streak >= warning streak in every preset', () => {
    for (const p of INDUSTRY_PRESETS) {
      expect(p.thresholds.declineCriticalStreak).toBeGreaterThanOrEqual(p.thresholds.declineWarnStreak);
    }
  });

  it('keeps every percentage threshold within 0..100', () => {
    for (const p of INDUSTRY_PRESETS) {
      expect(p.thresholds.laborShareWarnPct).toBeGreaterThanOrEqual(0);
      expect(p.thresholds.laborShareWarnPct).toBeLessThanOrEqual(100);
      expect(p.thresholds.singleChannelWarnPct).toBeGreaterThanOrEqual(0);
      expect(p.thresholds.singleChannelWarnPct).toBeLessThanOrEqual(100);
      expect(p.thresholds.budgetShortfallWarnPct).toBeGreaterThanOrEqual(0);
      expect(p.thresholds.budgetShortfallWarnPct).toBeLessThanOrEqual(100);
    }
  });

  it('★ 予算未達の許容幅は業種ではなく方針なので、どの業種も既定を持つ (パス 493c)', () => {
    for (const p of INDUSTRY_PRESETS) {
      expect(p.thresholds.budgetShortfallWarnPct, p.id).toBe(DEFAULT_HIGHLIGHT_THRESHOLDS.budgetShortfallWarnPct);
    }
  });
});

describe('getIndustryPreset', () => {
  it('returns the matching preset by id', () => {
    expect(getIndustryPreset('saas').label).toBe('SaaS・IT');
    expect(getIndustryPreset('retail').id).toBe('retail');
  });

  it('falls back to the default preset for an unknown id', () => {
    expect(getIndustryPreset('nonexistent').id).toBe('default');
  });
});
