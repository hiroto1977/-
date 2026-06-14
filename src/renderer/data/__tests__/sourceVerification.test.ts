import { describe, expect, it } from 'vitest';
import {
  isOfficial,
  distinctSourceCount,
  hasOfficialSource,
  verifyClaim,
  isConfirmed,
  filterConfirmed,
  type EvidenceSource,
  type SourcedClaim,
} from '../sourceVerification';
import { VERIFIED_SUPPORT_RESOURCES } from '../counselorKnowledge';
import { SUPPORT_RESOURCES } from '../counseling';

const gov: EvidenceSource = { url: 'https://gov.example/a', type: 'government', label: '国' };
const muni: EvidenceSource = { url: 'https://city.example/b', type: 'municipality', label: '市' };
const media: EvidenceSource = { url: 'https://media.example/c', type: 'media', label: '報道' };
const op: EvidenceSource = { url: 'https://op.example/d', type: 'operator', label: '運営' };
const claim = <T>(value: T, sources: EvidenceSource[]): SourcedClaim<T> => ({ value, sources });

describe('isOfficial', () => {
  it('treats government and municipality as official, others not', () => {
    expect(isOfficial('government')).toBe(true);
    expect(isOfficial('municipality')).toBe(true);
    expect(isOfficial('operator')).toBe(false);
    expect(isOfficial('media')).toBe(false);
    expect(isOfficial('other')).toBe(false);
  });
});

describe('distinctSourceCount', () => {
  it('counts distinct URLs (dedupes repeats)', () => {
    expect(distinctSourceCount([gov, muni])).toBe(2);
    expect(distinctSourceCount([gov, gov])).toBe(1);
    expect(distinctSourceCount([])).toBe(0);
  });
});

describe('hasOfficialSource', () => {
  it('is true only when an official source is present', () => {
    expect(hasOfficialSource([gov, media])).toBe(true);
    expect(hasOfficialSource([muni])).toBe(true);
    expect(hasOfficialSource([media, op])).toBe(false);
    expect(hasOfficialSource([])).toBe(false);
  });
});

describe('verifyClaim (default policy: >=2 sources, >=1 official)', () => {
  it('confirms with 2 sources incl. one official', () => {
    expect(verifyClaim(claim('x', [gov, media]))).toBe('confirmed');
    expect(verifyClaim(claim('x', [muni, op]))).toBe('confirmed');
  });
  it('rejects a single source even if official', () => {
    expect(verifyClaim(claim('x', [gov]))).toBe('unconfirmed');
  });
  it('rejects two sources with no official one', () => {
    expect(verifyClaim(claim('x', [media, op]))).toBe('unconfirmed');
  });
  it('rejects two non-distinct sources (same URL)', () => {
    expect(verifyClaim(claim('x', [gov, gov]))).toBe('unconfirmed');
  });
  it('honors a relaxed policy (no official required)', () => {
    expect(verifyClaim(claim('x', [media, op]), { minSources: 2, requireOfficial: false })).toBe('confirmed');
  });
  it('honors a stricter minSources', () => {
    expect(verifyClaim(claim('x', [gov, media]), { minSources: 3, requireOfficial: true })).toBe('unconfirmed');
  });
  it('isConfirmed mirrors verifyClaim', () => {
    expect(isConfirmed(claim('x', [gov, media]))).toBe(true);
    expect(isConfirmed(claim('x', [gov]))).toBe(false);
  });
});

describe('filterConfirmed', () => {
  it('keeps only confirmed claims, discarding unconfirmed (input order preserved)', () => {
    const claims = [
      claim('keep1', [gov, media]),
      claim('drop1', [media]), // single
      claim('keep2', [muni, op]),
      claim('drop2', [media, op]), // no official
    ];
    expect(filterConfirmed(claims).map((c) => c.value)).toEqual(['keep1', 'keep2']);
  });
  it('returns empty when nothing is confirmed', () => {
    expect(filterConfirmed([claim('x', [media])])).toEqual([]);
  });
});

describe('VERIFIED_SUPPORT_RESOURCES (knowledge base invariant)', () => {
  it('every verified resource is CONFIRMED under the default policy', () => {
    for (const c of VERIFIED_SUPPORT_RESOURCES) {
      expect(verifyClaim(c)).toBe('confirmed');
    }
    // filterConfirmed は 1 件も落とさない (全件確証済み)。
    expect(filterConfirmed(VERIFIED_SUPPORT_RESOURCES)).toHaveLength(VERIFIED_SUPPORT_RESOURCES.length);
  });

  it('each verified resource has >=1 official source', () => {
    for (const c of VERIFIED_SUPPORT_RESOURCES) {
      expect(hasOfficialSource(c.sources)).toBe(true);
    }
  });

  it('matches the resources actually shipped in SUPPORT_RESOURCES (label+detail)', () => {
    // 検証済みデータが、実際に提示する窓口 (緊急時を除く) と一致することを固定。
    const shipped = new Set(SUPPORT_RESOURCES.map((r) => `${r.label}|${r.detail}`));
    for (const c of VERIFIED_SUPPORT_RESOURCES) {
      expect(shipped.has(`${c.value.label}|${c.value.detail}`)).toBe(true);
    }
  });
});
