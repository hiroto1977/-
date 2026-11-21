import { describe, expect, it } from 'vitest';
import { fetchComplianceSnapshot } from '../compliance';
import { buildComplianceSnapshot } from '../../../shared/complianceSnapshot';

describe('fetchComplianceSnapshot', () => {
  it('returns the local base marker (実データは renderer の complianceKnowledge)', async () => {
    const snap = await fetchComplianceSnapshot({ token: '' });
    expect(snap).toEqual({ note: 'verified-compliance' });
  });

  it('組み立ては shared の buildComplianceSnapshot と一致する (ブラウザ版と同値)', async () => {
    const snap = await fetchComplianceSnapshot({ token: '' });
    expect(snap).toEqual(buildComplianceSnapshot());
  });
});
