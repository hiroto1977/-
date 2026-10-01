import { beforeAll, describe, expect, it, vi } from 'vitest';
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

  /*
   * **生成 script の self-test は検査の「外」で走らせる** (2026-09-30 · パス 502)。
   *
   * `selfTest()` は実物の読み込み (esbuild で型を剥がして Node の require へ渡す) を通るので、
   * `ontologyMain.ts` の閉包 (`dataOrigin` / `credentialUse` ほか) を **新しい写しとして評価し直す**。
   * 検査の中で走らせると、その直下の表が「この検査が覆った」と数えられ、変異体は覆った検査
   * (= この 1 件) だけで走る —— この検査は表の値を主張しないので、`dataOrigin.ts` の 77 件・
   * `credentialUse.ts` の 77 件が生き残っていた (手元の Stryker で実測: 覆った検査はこの 1 件だけ)。
   * `beforeAll` は Stryker の `beforeEach` (`currentTestId` を立てる) より前なので、ここで評価した
   * 直下の値は static 側に落ち (`ignoreStatic`)、検査は結果を見るだけになる。
   * 表の値そのものは `dataOrigin.test.ts` / `credentialUse.test.ts` が import の時点で主張する。
   */
  let selfTestExit = -1;
  beforeAll(() => {
    const silent = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      selfTestExit = selfTest();
    } finally {
      silent.mockRestore();
    }
  });

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
    expect(selfTestExit).toBe(0);
  });
});
