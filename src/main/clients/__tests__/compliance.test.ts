import { describe, expect, it } from 'vitest';
import { fetchComplianceSnapshot } from '../compliance';

describe('fetchComplianceSnapshot', () => {
  it('returns the local stub (実データは renderer の complianceKnowledge)', async () => {
    const snap = await fetchComplianceSnapshot({ token: '' });
    expect(snap).toEqual({ note: 'verified-compliance' });
  });
});
