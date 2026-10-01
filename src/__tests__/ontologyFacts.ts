import path from 'node:path';
import { createRequire } from 'node:module';
import { readOriginalSource } from '../shared/__tests__/originalSource';
import { SERVICE_IDS, type ServiceId } from '../shared/serviceId';
import { SERVICE_DATA_ORIGIN } from '../shared/dataOrigin';
import { SERVICE_CREDENTIAL_USE } from '../shared/credentialUse';
import { PROFESSIONAL_IDS } from '../renderer/data/professionalMap';
import { SIDEBAR_CATEGORIES, type Placement, type ServiceFacet, type SidebarCategory } from '../shared/ontology/serviceFacets';
import type { OntologyFacts } from '../shared/ontology/render';
import { browserPairs, desktopPairs, invokeBody } from './actionSurface';

/*
 * **オントロジーが突き合わせる「実物」をここで読む。**
 *
 * 語彙 (`src/shared/ontology/`) は node を読まない。実物 —— 7 つの台帳・package.json・
 * 両ビルドの action の面 —— を読むのはこのモジュールだけで、検査 (`ontology*.test.ts`) と
 * 文書の生成 (`scripts/build-ontology-md.cjs` → `ontologyMain.ts`) の両方がここを通る。
 *
 * 読み方の規則は 1 つずつ既存の物を借りる:
 *   - 出所と資格情報の読み手は shared の宣言そのもの (import)。宣言と導出の一致は
 *     `lint:data-origin` / `lint:credential-use` が持つ
 *   - LOCAL_SERVICES は `lint-data-origin.cjs` の `localServiceIds` (同じ読み方)
 *   - 両ビルドの action は `actionSurface.ts` (dualBuildActionSurface と同じ読み方)
 *   - サイドバーの分類は `services.ts` の字面 (`sidebarCoverage` と同じく SERVICES から)
 */

export const REPO_ROOT = path.resolve(__dirname, '../..');
const read = (rel: string): string => readOriginalSource(path.join(REPO_ROOT, rel));
const req = createRequire(path.join(REPO_ROOT, 'package.json'));

interface DataOriginGate {
  localServiceIds(indexSource: string): Set<string>;
}

/** `SERVICES` (services.ts) の id → category。消費されるだけのサービスは載らない。 */
export function sidebarPlacements(): Map<string, SidebarCategory> {
  const text = read('src/renderer/services.ts');
  const start = text.indexOf('export const SERVICES');
  const body = text.slice(start);
  const out = new Map<string, SidebarCategory>();
  for (const m of body.matchAll(/id:\s*'([a-z0-9-]+)'[\s\S]*?category:\s*'([a-z]+)'/g)) {
    const category = m[2]!;
    if (!(SIDEBAR_CATEGORIES as readonly string[]).includes(category)) {
      throw new Error(`services.ts に語彙に無い category: ${category} (${m[1]})`);
    }
    out.set(m[1]!, category as SidebarCategory);
  }
  return out;
}

/** `OAUTH_CONFIGS` (oauth.ts) の鍵。 */
export function oauthServiceIds(): Set<string> {
  const text = read('src/main/oauth.ts');
  const start = text.indexOf('export const OAUTH_CONFIGS');
  const body = text.slice(start, text.indexOf('\n};', start));
  return new Set([...body.matchAll(/^\s{2}'?([a-z0-9-]+)'?:\s*\{/gm)].map((m) => m[1]!));
}

/** `DESKTOP_ONLY` の台帳 (webShimCredentials.test.ts) の service/action。 */
export function desktopOnlyPairs(): Set<string> {
  const text = read('src/renderer/__tests__/webShimCredentials.test.ts');
  const start = text.indexOf('const DESKTOP_ONLY: readonly DesktopOnlyRow[] = [');
  const end = text.indexOf('\n  ];', start);
  const body = text.slice(start, end);
  return new Set(
    [...body.matchAll(/service:\s*'([a-z0-9-]+)',\s*action:\s*'([^']+)'/g)].map((m) => `${m[1]}/${m[2]}`),
  );
}

export function localServiceIds(): Set<string> {
  const gate = req(path.join(REPO_ROOT, 'scripts', 'lint-data-origin.cjs')) as DataOriginGate;
  return gate.localServiceIds(read('src/main/clients/index.ts'));
}

/** 76 サービスの facet を組む。 */
export function gatherServiceFacets(): ServiceFacet[] {
  const placements = sidebarPlacements();
  const local = localServiceIds();
  const oauth = oauthServiceIds();
  const desktop = desktopPairs().pairs;
  const web = browserPairs(invokeBody());
  const desktopOnly = desktopOnlyPairs();
  const professional = new Set<string>(PROFESSIONAL_IDS);
  const actionsOf = (pairs: ReadonlySet<string>, id: string): string[] =>
    [...pairs]
      .filter((p) => p.startsWith(`${id}/`))
      .map((p) => p.slice(id.length + 1))
      .sort();
  return SERVICE_IDS.map((id: ServiceId): ServiceFacet => {
    const placement: Placement = placements.get(id) ?? 'consumed';
    return {
      id,
      placement,
      dataOrigin: SERVICE_DATA_ORIGIN[id],
      credentialUse: SERVICE_CREDENTIAL_USE[id],
      local: local.has(id),
      oauth: oauth.has(id),
      actions: actionsOf(desktop, id),
      webActions: actionsOf(web, id),
      desktopOnly: actionsOf(desktopOnly, id),
      professional: professional.has(id),
    };
  });
}

/** `verify:all` に並ぶ npm script の名前 (順序どおり)。 */
export function verifyAllGates(): string[] {
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  const chainText = pkg.scripts['verify:all'] ?? '';
  return chainText
    .split('&&')
    .map((s) => s.trim())
    .map((s) => s.replace(/^npm run\s+/, ''))
    .filter((s) => s.length > 0);
}

export function gatherOntologyFacts(): OntologyFacts {
  return { services: gatherServiceFacets(), verifyAllGates: verifyAllGates() };
}
