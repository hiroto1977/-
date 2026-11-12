import { BUILDS, ENTITY_CLASSES, ZONES } from './vocabulary';
import { FACET_AXIOMS, facetTotals, type ServiceFacet } from './serviceFacets';
import { LAWS, LAW_FAMILIES, type Enforcer, type Law, type LawFamily } from './laws';
import { escapeMarkdownInline } from '../escape';

/**
 * `docs/ONTOLOGY.md` を組む。**純粋関数** —— 実物を読むのは呼び出し側
 * (`src/__tests__/ontologyFacts.ts`) で、ここは受け取った事実と語彙を並べるだけ。
 *
 * 出力に日付や時刻は入れない。入れると再生成のたびに変わり、「committed と
 * 再生成が一致する」検査が成り立たなくなる。測った日は引継ぎが持つ。
 */

export interface OntologyFacts {
  readonly services: readonly ServiceFacet[];
  /** `verify:all` に並ぶ npm script (順序どおり)。 */
  readonly verifyAllGates: readonly string[];
}

/** 表のセル。Markdown のエスケープは shared の 1 つ (`escape.ts`) を通す —— 写しは lint:forbidden が落とす。 */
const cell = (s: string): string => escapeMarkdownInline(s.replace(/\n/g, ' '));
const code = (s: string): string => `\`${s}\``;
const list = (xs: readonly string[]): string => (xs.length === 0 ? '—' : xs.map(code).join(' '));

function enforcerCell(e: Enforcer): string {
  switch (e.kind) {
    case 'gate':
      return `ゲート ${code(`npm run ${e.script}`)}`;
    case 'test':
      return `検査 ${code(e.file)}`;
    case 'harness':
      return `実機 ${code(`npm run ${e.script}`)}`;
    case 'chain':
      return '整合性チェーン (`scripts/integrity-chain.cjs`)';
    case 'type':
      return `型 ${code(e.where)}`;
    case 'ci':
      return `CI ${code(e.workflow)}`;
    case 'prose':
      return `散文だけ ${code(e.where)} — ${cell(e.why)}`;
  }
}

export function isMachine(e: Enforcer): boolean {
  return e.kind !== 'prose';
}

export function lawsWithoutMachine(laws: readonly Law[] = LAWS): Law[] {
  return laws.filter((l) => !l.enforcedBy.some(isMachine));
}

function lawRows(family: LawFamily, laws: readonly Law[]): string[] {
  return laws
    .filter((l) => l.family === family)
    .map(
      (l) =>
        `| ${code(l.id)} | **${cell(l.name)}** — ${cell(l.statement)} | ${l.provenance.map(cell).join(' / ')} | ${l.enforcedBy.map(enforcerCell).join('<br>')} |`,
    );
}

export function renderOntologyMarkdown(facts: OntologyFacts, laws: readonly Law[] = LAWS): string {
  const out: string[] = [];
  const push = (s = ''): void => {
    out.push(s);
  };

  push('# Service Hub オントロジー (生成物)');
  push();
  push('> **このファイルは生成物です。手で編集しないでください。** `npm run ontology:md` が');
  push('> `src/shared/ontology/` の語彙と実物 (台帳・ゲート・両ビルドの action の面) から組み直します。');
  push('> `src/shared/__tests__/ontologyDoc.test.ts` が「committed == 再生成」と「本体との網羅」を検査し、');
  push('> `ontologyLaws.test.ts` / `ontologyFacets.test.ts` が語彙そのものを実物と突き合わせます。');
  push();
  push('オントロジーは 4 つの層から成る: **層とビルド** (どこで何が走るか)・**実体クラス** (何が在り、');
  push('その一覧はどこに在るか)・**サービスの facet 行列と公理** (facet 同士の整合)・**法則と執行者**');
  push('(320 パスで学んだ規則と、それを守っている機械)。「数は機械が、判断は散文が持つ」——');
  push('この文書には数と一覧だけを置き、判断は `docs/SESSION_HANDOFF.md` に書く。');
  push();

  // ---- 1. 層とビルド
  push('## 1. 層とビルド');
  push();
  push('| 層 | 役割 | 信頼の上限 | import してよい層 | node / electron | 出荷されるビルド |');
  push('|---|---|---|---|---|---|');
  for (const z of ZONES) {
    push(`| ${code(z.id)} | ${cell(z.label)} | ${cell(z.trust)} | ${list(z.mayImport)} | ${z.nodeAccess} | ${list(z.shipsIn)} |`);
  }
  push();
  push('| ビルド | 名前 | 層 | `window.serviceHub` の実体 | 備考 |');
  push('|---|---|---|---|---|');
  for (const b of BUILDS) {
    push(`| ${code(b.id)} | ${cell(b.label)} | ${list(b.zones)} | ${code(b.bridge)} | ${cell(b.note)} |`);
  }
  push();
  push('import の許可表は `scripts/check-import-boundaries.cjs` の `ALLOW` と一致する (`ontologyFacets.test.ts` が留める)。');
  push();

  // ---- 2. 実体クラス
  push('## 2. 実体クラスと台帳の在処');
  push();
  push('| クラス | 説明 | 一覧の在処 | 一覧を実物と突き合わせる機械 |');
  push('|---|---|---|---|');
  for (const c of ENTITY_CLASSES) {
    push(`| ${code(c.id)} **${cell(c.label)}** | ${cell(c.summary)} | ${c.ledger.map(code).join('<br>')} | ${c.machines.map(code).join('<br>')} |`);
  }
  push();

  // ---- 3. facet 行列
  push(`## 3. サービスの facet 行列 (${facts.services.length})`);
  push();
  push('| id | 配置 | 出所 | 資格情報 | local | OAuth | 士業 | デスクトップの action | ブラウザ版の action | デスクトップだけ |');
  push('|---|---|---|---|:---:|:---:|:---:|---|---|---|');
  const flag = (b: boolean): string => (b ? '✅' : '');
  for (const f of [...facts.services].sort((a, b) => a.id.localeCompare(b.id))) {
    push(
      `| ${code(f.id)} | ${f.placement} | ${f.dataOrigin} | ${f.credentialUse} | ${flag(f.local)} | ${flag(f.oauth)} | ${flag(f.professional)} | ${list(f.actions)} | ${list(f.webActions)} | ${list(f.desktopOnly)} |`,
    );
  }
  push();
  const t = facetTotals(facts.services);
  push('集計:');
  push();
  push(`- 配置: おすすめ ${t.byPlacement.featured} / 士業連携 ${t.byPlacement.professionals} / 分析・ツール ${t.byPlacement.tools} / 外部サービス連携 ${t.byPlacement.integrations} / 消費されるだけ ${t.byPlacement.consumed}`);
  push(`- 出所: remote ${t.byOrigin.remote} / local ${t.byOrigin.local} / sample ${t.byOrigin.sample}`);
  push(`- 資格情報の読み手 — fetch ${t.byCredential.fetch} / action ${t.byCredential.action} / none ${t.byCredential.none}`);
  push(`- LOCAL_SERVICES ${t.local} / OAuth ${t.oauth} / action を持つ ${t.withActions} / デスクトップだけの action ${t.desktopOnlyActions}`);
  push();

  // ---- 4. 公理
  push('## 4. facet の公理と例外');
  push();
  push('| 公理 | 述べていること | 理由つきの例外 |');
  push('|---|---|---|');
  for (const a of FACET_AXIOMS) {
    const ex = Object.entries(a.exceptions).map(([id, why]) => `${code(id)}: ${cell(why)}`);
    push(`| ${code(a.id)} | ${cell(a.statement)} | ${ex.length === 0 ? '—' : ex.join('<br>')} |`);
  }
  push();

  // ---- 5. 法則
  push(`## 5. 法則と執行者 (${laws.length})`);
  push();
  push('各法則は「何を守るか」「どのパス / パターンで学んだか」「何がそれを守っているか」を持つ。');
  push('執行者が**散文だけ**の法則は次の節に集める —— 散文で述べた規則は落ちない。');
  push();
  for (const [family, label] of Object.entries(LAW_FAMILIES) as [LawFamily, string][]) {
    const rows = lawRows(family, laws);
    push(`### ${label} (${rows.length})`);
    push();
    push('| id | 法則 | 出典 | 執行者 |');
    push('|---|---|---|---|');
    for (const r of rows) push(r);
    push();
  }

  // ---- 6. 散文だけ
  const prose = lawsWithoutMachine(laws);
  push(`## 6. 機械の無い法則 (${prose.length})`);
  push();
  if (prose.length === 0) push('（なし）');
  for (const l of prose) {
    const why = l.enforcedBy.filter((e) => e.kind === 'prose').map((e) => (e.kind === 'prose' ? e.why : '')).join(' / ');
    push(`- ${code(l.id)} **${cell(l.name)}** — ${cell(why)}`);
  }
  push();

  // ---- 7. 集計
  const machines = laws.length - prose.length;
  push('## 7. 集計');
  push();
  push(`- 法則 ${laws.length} (機械あり ${machines} / 散文だけ ${prose.length})`);
  push(`- facet の公理 ${FACET_AXIOMS.length}・実体クラス ${ENTITY_CLASSES.length}・層 ${ZONES.length}・ビルド ${BUILDS.length}`);
  push(`- \`verify:all\` のゲート ${facts.verifyAllGates.length}: ${facts.verifyAllGates.map(code).join(' ')}`);
  push();
  return out.join('\n');
}
