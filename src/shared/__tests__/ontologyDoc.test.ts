import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { SERVICE_IDS } from '../serviceId';
import { LAWS } from '../ontology/laws';
import { ENTITY_CLASSES } from '../ontology/vocabulary';
import { FACET_AXIOMS } from '../ontology/serviceFacets';
import { renderOntologyMarkdown } from '../ontology/render';
import { REPO_ROOT, gatherOntologyFacts } from '../../__tests__/ontologyFacts';
import { renderCurrent } from '../../__tests__/ontologyMain';
import { readOriginalSource } from './originalSource';

// 生成 script の陰性対照は vitest から回す (誰も回さない対照は、対照が無いのと同じ —— gateSelfTests)。
const req = createRequire(__filename);
const { selfTest } = req('../../../scripts/build-ontology-md.cjs') as { selfTest: () => number };

/*
 * **`docs/ONTOLOGY.md` は生成物。committed == 再生成、かつ本体を網羅する。** (2026-09-18)
 *
 * 「committed == 再生成」だけでは、組む側が項目を落としても再生成すれば通る
 * (パターン 0-a-5)。だから法則・実体クラス・公理・サービスの id が**全部**載ることを
 * 本体から数えて確かめる。
 */

describe('docs/ONTOLOGY.md', () => {
  const committed = readOriginalSource(join(REPO_ROOT, 'docs', 'ONTOLOGY.md'));
  const generated = renderCurrent();

  it('committed は再生成と一致する (ずれたら npm run ontology:md)', () => {
    expect(committed).toBe(generated);
  });

  it('本体を網羅する: 法則・実体クラス・公理・サービスの id が全部載る', () => {
    expect(LAWS.length).toBeGreaterThan(0);
    for (const l of LAWS) expect(committed, l.id).toContain(`\`${l.id}\``);
    for (const c of ENTITY_CLASSES) expect(committed, c.id).toContain(`\`${c.id}\``);
    for (const a of FACET_AXIOMS) expect(committed, a.id).toContain(`\`${a.id}\``);
    for (const id of SERVICE_IDS) expect(committed, id).toContain(`| \`${id}\` |`);
  });

  it('★ 対照: サービスを落とした事実で組むと行列が空になる', () => {
    const facts = gatherOntologyFacts();
    const empty = renderOntologyMarkdown({ ...facts, services: [] });
    expect(empty).toContain('## 3. サービスの facet 行列 (0)');
    expect(empty).not.toContain('| `github` |');
    expect(generated).toContain('| `github` |');
  });

  it('組み立ては決定的で、生成の時刻を持たない (再生成のたびに変わる物を置かない)', () => {
    // 出典の中の日付 (「パス 301」「2026-08-25 の規約」) は静的な内容で、ここで言う「時刻」ではない。
    expect(renderCurrent()).toBe(generated);
    const STAMP = /生成(日|時刻)|generated at|measuredAt/i;
    expect(STAMP.test('生成日: 2026-09-18')).toBe(true); // 標本: 針は時刻の印に当たる
    expect(generated).not.toMatch(STAMP);
  });

  it('生成 script の self-test が通る (checkAgainst の陰性対照)', () => {
    const silent = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      expect(selfTest()).toBe(0);
    } finally {
      silent.mockRestore();
    }
  });
});
