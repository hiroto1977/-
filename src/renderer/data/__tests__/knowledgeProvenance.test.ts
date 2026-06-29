import { describe, it, expect } from 'vitest';
import { VERIFIED_CONCEPTS, type AcademicSourceType } from '../academicKnowledge';
import {
  ADMISSION_RULE,
  assessEvidence,
  evidenceTier,
  isAuthoritativeSource,
  isDiscoveryOnly,
  type DiscoveryModality,
} from '../knowledgeProvenance';

describe('evidenceTier — source type → evidence tier', () => {
  it('maps each AcademicSourceType to its canonical tier', () => {
    expect(evidenceTier('government')).toBe('primary');
    expect(evidenceTier('academic')).toBe('scholarly');
    expect(evidenceTier('reference')).toBe('reference');
    expect(evidenceTier('media')).toBe('popular');
  });

  it('counts every tier except popular as an authoritative source (encyclopedia-grade included)', () => {
    expect(isAuthoritativeSource('primary')).toBe(true);
    expect(isAuthoritativeSource('scholarly')).toBe(true);
    expect(isAuthoritativeSource('reference')).toBe(true);
    expect(isAuthoritativeSource('popular')).toBe(false);
  });
});

describe('isDiscoveryOnly — video/social/aggregator are leads, never sole evidence', () => {
  it('treats youtube / tiktok / perplexity as discovery-only', () => {
    for (const m of ['youtube', 'tiktok', 'perplexity'] as DiscoveryModality[]) {
      expect(isDiscoveryOnly(m)).toBe(true);
    }
  });

  it('treats book / web / podcast / other as admissible discovery modalities', () => {
    for (const m of ['book', 'web', 'podcast', 'other'] as DiscoveryModality[]) {
      expect(isDiscoveryOnly(m)).toBe(false);
    }
  });
});

describe('assessEvidence — the admission (確証) gate', () => {
  const src = (type: AcademicSourceType) => ({ type });

  it('admits ≥2 sources with at least one authoritative source', () => {
    expect(assessEvidence([src('academic'), src('reference')]).ok).toBe(true);
    expect(assessEvidence([src('government'), src('media')]).ok).toBe(true);
    // Two encyclopedia-grade references qualify per the project standard.
    expect(assessEvidence([src('reference'), src('reference')]).ok).toBe(true);
  });

  it('rejects fewer than the minimum number of sources', () => {
    const a = assessEvidence([src('academic')]);
    expect(a.ok).toBe(false);
    expect(a.reasons.join()).toContain(`${ADMISSION_RULE.minSources} 件以上`);
  });

  it('rejects sources that are all popular media (no authoritative backing)', () => {
    const a = assessEvidence([src('media'), src('media')]);
    expect(a.ok).toBe(false);
    expect(a.reasons.join()).toContain('権威ある出典');
  });

  it('reports every failing reason at once', () => {
    const a = assessEvidence([src('media')]);
    expect(a.ok).toBe(false);
    expect(a.reasons).toHaveLength(2); // too few AND no authoritative
  });
});

describe('VERIFIED_CONCEPTS — every admitted concept satisfies the gate', () => {
  it('has no concept that would fail assessEvidence (guards future batches)', () => {
    const offenders = VERIFIED_CONCEPTS.filter((c) => !assessEvidence(c.sources).ok).map(
      (c) => c.id,
    );
    expect(offenders).toEqual([]);
  });
});
