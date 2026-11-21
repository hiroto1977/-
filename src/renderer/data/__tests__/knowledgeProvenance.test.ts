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
  /*
   * **URL は項ごとに別物を渡す** (2026-09-26 · パス 478) —— `独立` を数えるのは
   * URL なので、省くと全件が 1 件に畳まれて下の期待値が「独立が足りない」で埋まる。
   */
  let seq = 0;
  const src = (type: AcademicSourceType, url?: string) => ({
    type,
    url: url ?? `https://example.org/p${(seq += 1)}`,
  });

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
  /*
   * 非空の床 (2026-08-22)。この describe は `VERIFIED_CONCEPTS.filter(...)` が
   * 空配列になることを確かめる形なので、**元の配列が空でも成立する**。
   * 本番データを回して expect するのに非空を確かめていない検査を走査したとき、
   * ここも該当していた。
   */
  it('概念が 1 件以上ある (空なら以下は空虚に通る)', () => {
    expect(VERIFIED_CONCEPTS.length).toBeGreaterThanOrEqual(1000);
  });

  it('has no concept that would fail assessEvidence (guards future batches)', () => {
    const offenders = VERIFIED_CONCEPTS.filter((c) => !assessEvidence(c.sources).ok).map(
      (c) => c.id,
    );
    expect(offenders).toEqual([]);
  });
});

/*
 * **`独立` は件数ではない** (2026-09-26 · パス 478)。
 *
 * この関数の docblock は冒頭から「独立 2 出典以上」と繰り返していたのに、
 * 2026-09-26 まで `sources.length` を素で数えていた。実測ではコーパス 4,039 項目に
 * **同じ文書を指す綴りの組が 1 件**在り (`bizlaw-equitable-set-off` の 2 出典は
 * 同じ Wikipedia の頁で、2 つ目は節のアンカーだけが違った)、確証ゲートは
 * 「4039 項目（出典 2+・権威 1+）… ✅」と刷っていた。
 */
describe('assessEvidence — 独立性 (同じ文書を 2 件と数えない)', () => {
  const S = (...pairs: readonly (readonly [AcademicSourceType, string])[]) =>
    pairs.map(([type, url]) => ({ type, url }));

  it('★ 節のアンカーだけが違う 2 件は独立 1 件 (実物に在った形)', () => {
    const a = assessEvidence(
      S(
        ['reference', 'https://en.wikipedia.org/wiki/Set-off_(law)'],
        ['reference', 'https://en.wikipedia.org/wiki/Set-off_(law)#Equitable_set-off'],
      ),
    );
    expect(a.ok).toBe(false);
    // 断りは「何件が何件に畳まれたか」を言う (件数だけの文だと直す手が分からない)。
    expect(a.reasons.join()).toContain('独立した出典が 1 件');
    expect(a.reasons.join()).toContain('出典 2 件');
  });

  it('★ 同じ URL を 2 度・scheme / 末尾 / / ホストの大小だけの違いも独立 1 件', () => {
    const same: readonly (readonly [string, string])[] = [
      ['https://example.org/a', 'https://example.org/a'],
      ['http://example.org/a/', 'https://example.org/a'],
      ['https://EXAMPLE.org/a', 'https://example.org/a'],
    ];
    for (const [u1, u2] of same) {
      expect(assessEvidence(S(['reference', u1], ['reference', u2])).ok, `${u1} vs ${u2}`).toBe(false);
    }
  });

  it('対照: 別の文書なら独立 2 件として通る (畳み過ぎていない)', () => {
    const different: readonly (readonly [string, string])[] = [
      ['https://en.wikipedia.org/wiki/Set-off_(law)', 'https://en.wikipedia.org/wiki/Liquidated_damages'],
      ['https://example.org/p?id=1', 'https://example.org/p?id=2'],
      ['https://example.org/a', 'https://www.example.org/a'],
    ];
    for (const [u1, u2] of different) {
      expect(assessEvidence(S(['reference', u1], ['reference', u2])).ok, `${u1} vs ${u2}`).toBe(true);
    }
  });

  it('★ 出典が本当に 1 件のときは畳んだ話をしない (原因を取り違えない)', () => {
    const a = assessEvidence(S(['reference', 'https://example.org/only']));
    expect(a.ok).toBe(false);
    expect(a.reasons.join()).toContain('出典が 1 件');
    expect(a.reasons.join()).not.toContain('畳んだ');
  });
});
