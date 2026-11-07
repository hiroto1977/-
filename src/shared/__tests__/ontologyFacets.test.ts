import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { SERVICE_IDS } from '../serviceId';
import { FACET_AXIOMS, SIDEBAR_CATEGORIES, facetTotals, facetViolations, type ServiceFacet } from '../ontology/serviceFacets';
import { REPO_ROOT, gatherServiceFacets } from '../../__tests__/ontologyFacts';
import { readOriginalSource } from './originalSource';

/*
 * **サービスの facet 行列と公理を、76 サービスの実物に当てる。** (2026-09-18)
 *
 * 各 facet の「宣言と導出の一致」は既存のゲートが持つ。ここが見るのは facet **同士**の
 * 整合で、それを見る網は無かった。公理が成り立たないサービスは `FACET_AXIOMS[].exceptions`
 * に理由つきで載せる —— 台帳は双方向 (成り立つようになれば落ちる)。
 */

const base: ServiceFacet = {
  id: 'github',
  placement: 'integrations',
  dataOrigin: 'remote',
  credentialUse: 'fetch',
  local: false,
  oauth: false,
  actions: ['create-issue'],
  webActions: ['create-issue'],
  desktopOnly: [],
  professional: false,
};

describe('facet 行列', () => {
  const facets = gatherServiceFacets();

  it('走査が実物に届いている (空撃ちでない)', () => {
    expect(facets.length).toBe(SERVICE_IDS.length);
    expect(new Set(facets.map((f) => f.id)).size).toBe(SERVICE_IDS.length);
    const t = facetTotals(facets);
    expect(t.withActions).toBeGreaterThanOrEqual(25);
    expect(t.oauth).toBeGreaterThanOrEqual(8);
    expect(t.local).toBeGreaterThanOrEqual(40);
    expect(t.byPlacement.professionals).toBe(8);
    expect(facets.reduce((n, f) => n + f.webActions.length, 0)).toBeGreaterThanOrEqual(30);
  });

  it('公理は全サービスで成り立つ (例外は台帳の分だけ・双方向)', () => {
    expect(facetViolations(facets)).toEqual([]);
  });

  it('★ 標本: 破れ・古い例外・実在しない例外はそれぞれ鳴る', () => {
    // action を持たせない: 持たせると actions-need-reader-or-local も同時に鳴る (それは別の標本で見る)
    const broken: ServiceFacet = { ...base, id: 'slack', credentialUse: 'none', actions: [], webActions: [] };
    expect(facetViolations([broken])).toEqual([
      { kind: 'broken', axiom: 'remote-reads-credential', id: 'slack' },
    ]);
    const axiomWithStale = FACET_AXIOMS.map((a) =>
      a.id === 'remote-reads-credential' ? { ...a, exceptions: { github: '標本', nope: '実在しない' } } : a,
    );
    expect(facetViolations([base], axiomWithStale)).toEqual([
      { kind: 'stale-exception', axiom: 'remote-reads-credential', id: 'github' },
      { kind: 'unknown-exception', axiom: 'remote-reads-credential', id: 'nope' },
    ]);
    // action を持ちながら資格情報を読まず local でもない facet は、行き先の無い書き込み
    const homeless: ServiceFacet = { ...base, id: 'slack', credentialUse: 'none', dataOrigin: 'sample' };
    expect(facetViolations([homeless]).map((v) => v.axiom)).toEqual(['actions-need-reader-or-local']);
    // 対照の対照: 例外に載せた破れは鳴らない
    expect(facetViolations([broken], axiomWithStale.map((a) => (a.id === 'remote-reads-credential' ? { ...a, exceptions: { slack: '標本' } } : a)))).toEqual([]);
  });

  it('desktop-only-is-the-difference の標本: 台帳に無い差・台帳にだけ在る行はどちらも破れ', () => {
    const axiom = FACET_AXIOMS.find((a) => a.id === 'desktop-only-is-the-difference')!;
    expect(axiom.holds({ ...base, actions: ['a', 'b'], webActions: ['a'], desktopOnly: ['b'] })).toBe(true);
    expect(axiom.holds({ ...base, actions: ['a', 'b'], webActions: ['a'], desktopOnly: [] })).toBe(false);
    expect(axiom.holds({ ...base, actions: ['a'], webActions: ['a'], desktopOnly: ['b'] })).toBe(false);
  });
});

describe('語彙は renderer の型と台帳に一致する', () => {
  it('SIDEBAR_CATEGORIES は services.ts の ServiceCategory と同じ集合', () => {
    const text = readOriginalSource(join(REPO_ROOT, 'src/renderer/services.ts'));
    const m = /export type ServiceCategory = ([^;]+);/.exec(text);
    expect(m, 'ServiceCategory の宣言が読めない').not.toBeNull();
    const declared = [...m![1]!.matchAll(/'([a-z]+)'/g)].map((x) => x[1]!).sort();
    expect(declared).toEqual([...SIDEBAR_CATEGORIES].sort());
  });

  it('「消費されるだけ」のサービスは sidebarCoverage の台帳と同じ集合 (双方向)', () => {
    const text = readOriginalSource(join(REPO_ROOT, 'src/renderer/__tests__/sidebarCoverage.test.ts'));
    const start = text.indexOf('const SIDEBAR_LESS');
    const body = text.slice(start, text.indexOf('\n};', start));
    const ledger = [...body.matchAll(/^\s*'([a-z0-9-]+)':\s*'/gm)].map((m) => m[1]!).sort();
    expect(ledger.length).toBeGreaterThan(0);
    const consumed = gatherServiceFacets()
      .filter((f) => f.placement === 'consumed')
      .map((f) => f.id)
      .sort();
    expect(consumed).toEqual(ledger);
  });
});
