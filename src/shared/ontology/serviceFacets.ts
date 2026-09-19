import type { ServiceId } from '../serviceId';
import type { DataOrigin } from '../dataOrigin';
import type { CredentialUse } from '../credentialUse';

/**
 * **サービスの facet 行列と、facet の間に成り立つ公理。**
 *
 * サービス 1 つの性質は 7 つの台帳に分かれて宣言されている:
 *
 * | facet | 台帳 | 区画 |
 * |---|---|---|
 * | 配置 (サイドバーの分類 / 消費される) | `SERVICES` (`services.ts`) + `sidebarCoverage` の台帳 | renderer |
 * | 出所 (remote / local / sample) | `SERVICE_DATA_ORIGIN` | shared (導出は main の木) |
 * | 資格情報の読み手 (fetch / action / none) | `SERVICE_CREDENTIAL_USE` | shared (導出は main の木) |
 * | local (資格情報なしで取得できる) | `LOCAL_SERVICES` | main |
 * | OAuth | `OAUTH_CONFIGS` | main |
 * | 書き込み操作 | `LIVE_ACTIONS` (main) / `invoke` の分岐 (web-shim) / `DESKTOP_ONLY` の台帳 | main / renderer |
 * | 士業 | `PROFESSIONAL_IDS` | renderer |
 *
 * 台帳が区画を跨ぐのは**設計**である (renderer は main を読めない)。だから
 * 1 つの登録簿に畳むことはできず、代わりに **facet の間の関係**をここで公理として
 * 述べ、`ontologyFacets.test.ts` が 76 サービスの実物に当てる。公理が成り立たない
 * サービスは理由つきの `exceptions` に載せる (双方向 —— 成り立つようになれば落ちる)。
 *
 * 各 facet の**宣言と導出の一致**は既存のゲートが持つ (`lint:data-origin` /
 * `lint:credential-use` / `dualBuildActionSurface` / `sidebarCoverage`)。ここが見るのは
 * **facet 同士の整合**で、既存ゲートはそれを 1 つも見ていなかった (2026-09-18 実測)。
 */

export const SIDEBAR_CATEGORIES = ['featured', 'professionals', 'tools', 'integrations'] as const;
export type SidebarCategory = (typeof SIDEBAR_CATEGORIES)[number];

/** サイドバーの分類か、他の画面の中で消費されるだけか。 */
export type Placement = SidebarCategory | 'consumed';

export interface ServiceFacet {
  readonly id: ServiceId;
  readonly placement: Placement;
  readonly dataOrigin: DataOrigin;
  readonly credentialUse: CredentialUse;
  /** `LOCAL_SERVICES` に載っている (トークン未設定でも取得できる)。 */
  readonly local: boolean;
  /** `OAUTH_CONFIGS` に登録がある。 */
  readonly oauth: boolean;
  /** デスクトップ版の `LIVE_ACTIONS` に登録された action。 */
  readonly actions: readonly string[];
  /** ブラウザ版の `invoke` が分岐を持つ action。 */
  readonly webActions: readonly string[];
  /** デスクトップ版だけの action (種類つきの台帳に載っている物)。 */
  readonly desktopOnly: readonly string[];
  /** 士業 8 種。 */
  readonly professional: boolean;
}

export interface FacetAxiom {
  readonly id: string;
  readonly statement: string;
  readonly holds: (f: ServiceFacet) => boolean;
  /** 成り立たないことを理由つきで認めるサービス。双方向 (成り立てば落ちる)。 */
  readonly exceptions: Readonly<Record<string, string>>;
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

export const FACET_AXIOMS: readonly FacetAxiom[] = [
  {
    id: 'remote-reads-credential',
    statement: '出所が remote なら、取得は資格情報を読む (credentialUse が fetch)。',
    holds: (f) => f.dataOrigin !== 'remote' || f.credentialUse === 'fetch',
    exceptions: {},
  },
  {
    id: 'fetch-credential-means-remote',
    statement: '取得が資格情報を読む (fetch) なら、出所は remote である。',
    holds: (f) => f.credentialUse !== 'fetch' || f.dataOrigin === 'remote',
    exceptions: {},
  },
  {
    id: 'action-credential-has-desktop-action',
    statement: '資格情報を書き込みだけが読む (action) なら、デスクトップ版に action が登録されている。',
    holds: (f) => f.credentialUse !== 'action' || f.actions.length > 0,
    exceptions: {},
  },
  {
    id: 'oauth-token-is-read',
    statement: 'OAuth を設定するサービスは、そのトークンをどこかで読む (credentialUse ≠ none)。',
    holds: (f) => !f.oauth || f.credentialUse !== 'none',
    exceptions: {},
  },
  {
    id: 'local-never-remote',
    statement: 'LOCAL_SERVICES に載るサービスの出所は remote ではない。',
    holds: (f) => !f.local || f.dataOrigin !== 'remote',
    exceptions: {},
  },
  {
    id: 'professional-placement',
    statement: '士業 8 種はサイドバーの「士業連携」に在り、「士業連携」に在るのは士業だけ。',
    holds: (f) => f.professional === (f.placement === 'professionals'),
    exceptions: {},
  },
  {
    id: 'consumed-is-not-remote',
    statement: '他の画面の中で消費されるだけのサービスは、資格情報で外へ取りに行かない。',
    holds: (f) => f.placement !== 'consumed' || f.dataOrigin !== 'remote',
    exceptions: {},
  },
  {
    id: 'browser-actions-subset',
    statement: 'ブラウザ版が実行できる action は、デスクトップ版の許可表の部分集合。',
    holds: (f) => f.webActions.every((a) => f.actions.includes(a)),
    exceptions: {},
  },
  {
    id: 'desktop-only-is-the-difference',
    statement: 'デスクトップ版に在ってブラウザ版に無い action は、種類つきの台帳 (DESKTOP_ONLY) にちょうど載っている。',
    holds: (f) =>
      sameSet(
        f.actions.filter((a) => !f.webActions.includes(a)),
        f.desktopOnly,
      ),
    exceptions: {},
  },
  {
    id: 'actions-need-reader-or-local',
    statement: 'action を持つサービスは、資格情報を読むか local である (どちらでもない書き込みは行き先が無い)。',
    holds: (f) => f.actions.length === 0 || f.credentialUse !== 'none' || f.local,
    exceptions: {},
  },
];

export type FacetViolation =
  | { readonly kind: 'broken'; readonly axiom: string; readonly id: string }
  | { readonly kind: 'stale-exception'; readonly axiom: string; readonly id: string }
  | { readonly kind: 'unknown-exception'; readonly axiom: string; readonly id: string };

/** 公理を実物に当てる。台帳は双方向に効く。 */
export function facetViolations(
  facets: readonly ServiceFacet[],
  axioms: readonly FacetAxiom[] = FACET_AXIOMS,
): FacetViolation[] {
  const out: FacetViolation[] = [];
  const ids = new Set<string>(facets.map((f) => f.id));
  for (const axiom of axioms) {
    for (const f of facets) {
      const ok = axiom.holds(f);
      const excused = Object.hasOwn(axiom.exceptions, f.id);
      if (!ok && !excused) out.push({ kind: 'broken', axiom: axiom.id, id: f.id });
      if (ok && excused) out.push({ kind: 'stale-exception', axiom: axiom.id, id: f.id });
    }
    for (const id of Object.keys(axiom.exceptions)) {
      if (!ids.has(id)) out.push({ kind: 'unknown-exception', axiom: axiom.id, id });
    }
  }
  return out;
}

/** facet 行列の集計 (文書の末尾に出す)。 */
export function facetTotals(facets: readonly ServiceFacet[]): {
  readonly byPlacement: Record<Placement, number>;
  readonly byOrigin: Record<DataOrigin, number>;
  readonly byCredential: Record<CredentialUse, number>;
  readonly local: number;
  readonly oauth: number;
  readonly withActions: number;
  readonly desktopOnlyActions: number;
} {
  const byPlacement: Record<Placement, number> = { featured: 0, professionals: 0, tools: 0, integrations: 0, consumed: 0 };
  const byOrigin: Record<DataOrigin, number> = { remote: 0, local: 0, sample: 0 };
  const byCredential: Record<CredentialUse, number> = { fetch: 0, action: 0, none: 0 };
  let local = 0;
  let oauth = 0;
  let withActions = 0;
  let desktopOnlyActions = 0;
  for (const f of facets) {
    byPlacement[f.placement] += 1;
    byOrigin[f.dataOrigin] += 1;
    byCredential[f.credentialUse] += 1;
    if (f.local) local += 1;
    if (f.oauth) oauth += 1;
    if (f.actions.length > 0) withActions += 1;
    desktopOnlyActions += f.desktopOnly.length;
  }
  return { byPlacement, byOrigin, byCredential, local, oauth, withActions, desktopOnlyActions };
}
