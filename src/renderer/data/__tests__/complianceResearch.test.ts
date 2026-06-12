import { describe, expect, it } from 'vitest';
import { runComplianceResearch } from '../complianceResearch';
import { VERIFIED_COMPLIANCE, COMPLIANCE_DOMAINS, type ComplianceFact } from '../complianceKnowledge';
import { isConfirmed, type SourcedClaim } from '../sourceVerification';

const fact = (id: string, domain: ComplianceFact['domain']): ComplianceFact => ({
  id,
  domain,
  title: id,
  statement: 's',
  authority: 'a',
  asOf: '2026-06',
});

const officialPair = (id: string, domain: ComplianceFact['domain']): SourcedClaim<ComplianceFact> => ({
  value: fact(id, domain),
  sources: [
    { url: `https://gov.example/${id}`, type: 'government', label: 'gov' },
    { url: `https://media.example/${id}`, type: 'media', label: 'media' },
  ],
});

describe('VERIFIED_COMPLIANCE (knowledge base invariants)', () => {
  it('every entry is confirmed (>= 2 independent sources, >= 1 official)', () => {
    for (const claim of VERIFIED_COMPLIANCE) {
      expect(isConfirmed(claim)).toBe(true);
    }
  });

  it('covers every compliance domain with at least one confirmed fact', () => {
    const report = runComplianceResearch(VERIFIED_COMPLIANCE);
    expect(report.findings).toEqual([]); // 税務・労務・法務すべてに確証済みあり
    for (const domain of COMPLIANCE_DOMAINS) {
      const cov = report.byDomain.find((d) => d.domain === domain)!;
      expect(cov.confirmed).toBeGreaterThan(0);
    }
  });

  it('discards nothing — all curated entries are confirmed', () => {
    const report = runComplianceResearch(VERIFIED_COMPLIANCE);
    expect(report.discarded).toBe(0);
    expect(report.confirmed).toBe(report.total);
  });
});

describe('runComplianceResearch', () => {
  it('counts confirmed, discards unconfirmed, and aggregates by domain', () => {
    const claims: SourcedClaim<ComplianceFact>[] = [
      officialPair('t1', 'tax'),
      officialPair('l1', 'labor'),
      // 公的出典なし → 破棄される
      {
        value: fact('bad', 'legal'),
        sources: [
          { url: 'https://m1.example', type: 'media', label: 'm1' },
          { url: 'https://m2.example', type: 'operator', label: 'm2' },
        ],
      },
      // 出典1件のみ → 破棄される
      {
        value: fact('thin', 'tax'),
        sources: [{ url: 'https://gov.example/thin', type: 'government', label: 'gov' }],
      },
    ];
    const report = runComplianceResearch(claims);
    expect(report.total).toBe(4);
    expect(report.confirmed).toBe(2);
    expect(report.discarded).toBe(2);
    expect(report.confirmedFacts.map((f) => f.id)).toEqual(['t1', 'l1']);
    expect(report.byDomain).toEqual([
      { domain: 'tax', confirmed: 1 },
      { domain: 'labor', confirmed: 1 },
      { domain: 'legal', confirmed: 0 },
    ]);
    // legal は確証ゼロ → 改善候補
    expect(report.findings).toEqual(['legal']);
  });

  it('reports every domain as a finding for an empty knowledge base', () => {
    const report = runComplianceResearch([]);
    expect(report.total).toBe(0);
    expect(report.confirmed).toBe(0);
    expect(report.discarded).toBe(0);
    expect(report.findings).toEqual([...COMPLIANCE_DOMAINS]);
    expect(report.byDomain.every((d) => d.confirmed === 0)).toBe(true);
  });

  it('honours a stricter policy (3 sources) by discarding 2-source claims', () => {
    const report = runComplianceResearch([officialPair('t1', 'tax')], {
      minSources: 3,
      requireOfficial: true,
    });
    expect(report.confirmed).toBe(0);
    expect(report.discarded).toBe(1);
  });

  it('is reproducible (same input → same report)', () => {
    expect(runComplianceResearch(VERIFIED_COMPLIANCE)).toEqual(
      runComplianceResearch(VERIFIED_COMPLIANCE),
    );
  });
});
