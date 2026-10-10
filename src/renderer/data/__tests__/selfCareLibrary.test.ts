import { describe, expect, it } from 'vitest';
import { SELF_CARE_LIBRARY, selfCareArticles } from '../selfCareLibrary';
import { verifyClaim, hasOfficialSource, filterConfirmed } from '../sourceVerification';

describe('SELF_CARE_LIBRARY (evidence invariants)', () => {
  it('every article is CONFIRMED under the default policy (>=2 sources, >=1 official)', () => {
    for (const c of SELF_CARE_LIBRARY) {
      expect(verifyClaim(c)).toBe('confirmed');
    }
    expect(filterConfirmed(SELF_CARE_LIBRARY)).toHaveLength(SELF_CARE_LIBRARY.length);
  });

  it('every article has at least one official (gov/municipality) source', () => {
    for (const c of SELF_CARE_LIBRARY) {
      expect(hasOfficialSource(c.sources)).toBe(true);
    }
  });

  it('has unique ids and non-empty evidence/practice', () => {
    const ids = SELF_CARE_LIBRARY.map((c) => c.value.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of SELF_CARE_LIBRARY) {
      expect(c.value.evidence.length).toBeGreaterThan(20);
      expect(c.value.practice.length).toBeGreaterThan(10);
      expect(c.value.title.length).toBeGreaterThan(0);
    }
  });

  it('covers the five intended categories', () => {
    expect(new Set(SELF_CARE_LIBRARY.map((c) => c.value.category))).toEqual(
      new Set(['運動', '睡眠', '考え方', 'ストレス対処', 'マインドフルネス']),
    );
  });

  it('selfCareArticles unwraps values in input order', () => {
    expect(selfCareArticles().map((a) => a.id)).toEqual(SELF_CARE_LIBRARY.map((c) => c.value.id));
  });
});
