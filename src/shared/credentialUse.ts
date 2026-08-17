import type { ServiceId } from './serviceId';

/**
 * その資格情報が **実際に読まれるのか** をサービス単位で宣言する。
 *
 * 2026-08 監査で見つけた状態: `asana` / `discord` / `dropbox` / `line` /
 * `linear` / `salesforce` / `sentry` / `stripe` の 8 画面は
 *
 * 1. fetcher が stub で通信しない (`dataOrigin` が 'sample')、
 * 2. `LIVE_ACTIONS` に登録が無く write 側でも使わない、
 * 3. `src/shared/api/` にもクライアントが無い、
 *
 * のに `StatusBar` の `tokenSetup` でトークン入力欄を出し、入力すれば
 * `safeStorage` (ブラウザ版は WebCrypto の Vault) で暗号化して保存していた。
 * **読み手のいない資格情報を預かること自体が漏えい面の追加**である。
 * Stripe の秘密鍵や LINE のチャネルトークンを、使う予定が来るまで
 * 手元に置いておく理由は無い。利用者から見れば「入れれば繋がる」という
 * 誤解にもなる (実際は入れても何も起きない)。
 *
 * 判定は `dataOrigin` と同じく規則で決まる (`scripts/lint-credential-use.cjs`
 * が双方向で照合する):
 *
 * - `fetch`  — `dataOrigin` が 'remote' で、client モジュールが `token` を参照する。
 *              取得そのものに資格情報が要る。
 * - `action` — 取得には要らないが、write アクションを持ち client モジュールが
 *              `token` を参照する (security の HIBP/VT・emotions の LLM 等)。
 * - `none`   — どの経路でも読まれない。**入力欄を出してはいけない**。
 *
 * ゲートが見ているのは「client モジュールが `token` という名前に触るか」で、
 * データフロー解析ではない。したがって「触るが実は使っていない」形は通る。
 * それでも、**触りもしないのに預かる**という今回の形は確実に落ちる。
 */
export type CredentialUse = 'fetch' | 'action' | 'none';

export const SERVICE_CREDENTIAL_USE: Record<ServiceId, CredentialUse> = {
  home: 'none',
  village: 'none',
  github: 'fetch',
  wordpress: 'fetch',
  atlassian: 'fetch',
  notion: 'fetch',
  drive: 'fetch',
  calendar: 'fetch',
  gmail: 'fetch',
  slack: 'fetch',
  canva: 'fetch',
  skills: 'action',
  security: 'action',
  cloudflare: 'fetch',
  emotions: 'action',
  ollama: 'none',
  kpi: 'none',
  stocks: 'action',
  business: 'action',
  teamradar: 'action',
  templates: 'none',
  library: 'none',
  settings: 'none',
  'uber-eats': 'none',
  'demae-can': 'none',
  'real-estate': 'none',
  'mutual-funds': 'none',
  charts: 'none',
  quality: 'none',
  'microsoft-365': 'fetch',
  dropbox: 'none',
  salesforce: 'none',
  discord: 'none',
  asana: 'none',
  linear: 'none',
  sentry: 'none',
  shopify: 'action',
  stripe: 'none',
  line: 'none',
  storage: 'none',
  'tax-accountant': 'none',
  'labor-consultant': 'none',
  lawyer: 'none',
  'judicial-scrivener': 'none',
  'admin-scrivener': 'none',
  'sme-consultant': 'none',
  'patent-attorney': 'none',
  cpa: 'none',
  base: 'fetch',
  netsea: 'none',
  'super-delivery': 'none',
  topseller: 'none',
  a8net: 'none',
  'ai-blogkun': 'none',
  moneyforward: 'none',
  amazon: 'none',
  'amazon-associates': 'none',
  sales: 'none',
  team: 'none',
  youtube: 'fetch',
  overview: 'none',
  coconala: 'none',
  tiktok: 'none',
  tax: 'none',
  funding: 'none',
  freee: 'fetch',
  connectors: 'none',
  linux: 'none',
  compliance: 'none',
  obsidian: 'none',
  docker: 'none',
  assistant: 'action',
  docstudio: 'none',
  cursor: 'fetch',
};

/** 宣言された用途。未知の id は最も慎重な側 (`none` = 預からない) に倒す。 */
export function credentialUseOf(id: ServiceId): CredentialUse {
  if (!Object.hasOwn(SERVICE_CREDENTIAL_USE, id)) return 'none';
  return SERVICE_CREDENTIAL_USE[id];
}

/** 資格情報を求めてよいか。`none` は読み手がいないので求めてはいけない。 */
export function collectsCredential(use: CredentialUse): boolean {
  return use !== 'none';
}

/**
 * 読み手のいないサービスに保存済みの資格情報。設定画面が掃除に使う。
 *
 * 「入力欄を出さない」だけでは、**過去に保存された分が残る**。入力欄が消えた
 * ことで消し方も画面から消えるため、掃除の導線は別に要る。
 */
export function unusedStoredCredentials(configured: readonly ServiceId[]): readonly ServiceId[] {
  return configured.filter((id) => !collectsCredential(credentialUseOf(id)));
}
