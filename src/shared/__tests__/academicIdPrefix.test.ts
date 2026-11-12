import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

// 学術 id は分野の接頭辞で始まる (econ- / mgmt- / human- / bizlaw- / infosoc-)。規約はあったが
// 検査が無く、2026-09-05 に無印の id が 4 件見つかった (1 件は接頭辞つきの同じ概念と二重)。
// vault:check (buildFiles) が止めるようにし、ここはその対照 —— 実物が通ること、無印が鳴ること。
const req = createRequire(import.meta.url);
const { assertAcademicIdPrefixes, ACADEMIC_ID_PREFIX } = req('../../../scripts/build-knowledge-vault.cjs') as {
  assertAcademicIdPrefixes: (entries: { id: string; collection: string; category: string }[]) => number;
  ACADEMIC_ID_PREFIX: Record<string, string>;
};
const kc = req('../../../orchestration/knowledge-context.cjs') as {
  loadEntries: () => { id: string; collection: string; category: string }[];
};

describe('学術 id の分野接頭辞 (vault:check が止める)', () => {
  it('本体の全項目が通る (走査が実物に届いている)', () => {
    const entries = kc.loadEntries();
    expect(entries.filter((e) => e.collection === 'academic').length).toBeGreaterThan(3000);
    expect(assertAcademicIdPrefixes(entries)).toBe(entries.length);
  });
  it('★ 接頭辞の無い学術 id は、その id を名指しして鳴る', () => {
    const entries = [
      { id: 'human-maslow-hierarchy-of-needs', collection: 'academic', category: 'human-science' },
      { id: 'maslow-hierarchy', collection: 'academic', category: 'human-science' },
    ];
    expect(() => assertAcademicIdPrefixes(entries)).toThrow(/maslow-hierarchy \(human-science → human-\)/);
  });
  it('★ 分野と接頭辞が食い違えば鳴る (econ- の項目が management を名乗る)', () => {
    expect(() => assertAcademicIdPrefixes([{ id: 'econ-x', collection: 'academic', category: 'management' }])).toThrow(/econ-x \(management → mgmt-\)/);
  });
  it('★ 接頭辞の定義が無い分野は鳴る (黙って素通りしない)', () => {
    expect(() => assertAcademicIdPrefixes([{ id: 'zoo-x', collection: 'academic', category: 'zoology' }])).toThrow(/zoology/);
  });
  it('学術以外のコレクションは対象外', () => {
    expect(assertAcademicIdPrefixes([{ id: 'tax-consumption', collection: 'compliance', category: 'tax' }])).toBe(1);
  });
  it('接頭辞の表は 5 分野ちょうど', () => {
    expect(Object.keys(ACADEMIC_ID_PREFIX).sort()).toEqual(['business-law', 'economics', 'human-science', 'information-sociology', 'management']);
  });
});
