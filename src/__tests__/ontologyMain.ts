import { renderOntologyMarkdown } from '../shared/ontology/render';
import { gatherOntologyFacts } from './ontologyFacts';

/**
 * `docs/ONTOLOGY.md` の本文を、いまの実物から組む。
 *
 * 呼び手は 2 つ —— `scripts/build-ontology-md.cjs` (生成と --check) と
 * `src/shared/__tests__/ontologyDoc.test.ts` (committed == 再生成)。同じ関数なので
 * CLI と検査が別々の文書を組むことは無い。
 */
export function renderCurrent(): string {
  return renderOntologyMarkdown(gatherOntologyFacts());
}
