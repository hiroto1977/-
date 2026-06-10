import { fetchGithubSnapshot, ACTIONS as GITHUB_ACTIONS } from './github';
import { fetchNotionSnapshot, ACTIONS as NOTION_ACTIONS } from './notion';
import { fetchWordPressSnapshot, ACTIONS as WORDPRESS_ACTIONS } from './wordpress';
import { fetchSlackSnapshot, ACTIONS as SLACK_ACTIONS } from './slack';
import { fetchDriveSnapshot, ACTIONS as DRIVE_ACTIONS } from './drive';
import { fetchCalendarSnapshot, ACTIONS as CALENDAR_ACTIONS } from './calendar';
import { fetchGmailSnapshot, ACTIONS as GMAIL_ACTIONS } from './gmail';
import { fetchCanvaSnapshot, ACTIONS as CANVA_ACTIONS } from './canva';
import { fetchAtlassianSnapshot, ACTIONS as ATLASSIAN_ACTIONS } from './atlassian';
import { fetchSkillsSnapshot, ACTIONS as SKILLS_ACTIONS } from './skills';
import { fetchSecuritySnapshot, ACTIONS as SECURITY_ACTIONS } from './security';
import { fetchCloudflareSnapshot, ACTIONS as CLOUDFLARE_ACTIONS } from './cloudflare';
import { fetchEmotionsSnapshot, ACTIONS as EMOTIONS_ACTIONS } from './emotions';
import { fetchOllamaSnapshot, ACTIONS as OLLAMA_ACTIONS } from './ollama';
import { fetchKpiSnapshot } from './kpi';
import { fetchStocksSnapshot, ACTIONS as STOCKS_ACTIONS } from './stocks';
import { fetchBusinessOpsSnapshot, ACTIONS as BUSINESS_ACTIONS } from './business';
import { fetchTeamRadarSnapshot, ACTIONS as TEAMRADAR_ACTIONS } from './teamradar';
import { fetchTemplatesSnapshot, ACTIONS as TEMPLATES_ACTIONS } from './templates';
import { fetchHomeSnapshot } from './home';
import { fetchLibrarySnapshot } from './library';
import { fetchSettingsSnapshot } from './settings';
import { fetchUberEatsSnapshot, ACTIONS as UBER_EATS_ACTIONS } from './uber-eats';
import { fetchDemaeCanSnapshot, ACTIONS as DEMAE_CAN_ACTIONS } from './demae-can';
import { fetchRealEstateSnapshot, ACTIONS as REAL_ESTATE_ACTIONS } from './real-estate';
import { fetchMutualFundsSnapshot, ACTIONS as MUTUAL_FUNDS_ACTIONS } from './mutual-funds';
import { fetchQualitySnapshot } from './quality';
import { fetchMicrosoft365Snapshot, ACTIONS as MICROSOFT365_ACTIONS } from './microsoft-365';
import { fetchDropboxSnapshot } from './dropbox';
import { fetchSalesforceSnapshot } from './salesforce';
import { fetchDiscordSnapshot } from './discord';
import { fetchAsanaSnapshot } from './asana';
import { fetchLinearSnapshot } from './linear';
import { fetchSentrySnapshot } from './sentry';
import { fetchShopifySnapshot, ACTIONS as SHOPIFY_ACTIONS } from './shopify';
import { fetchStripeSnapshot } from './stripe';
import { fetchLineSnapshot } from './line';
import { fetchStorageSnapshot } from './storage';
import { fetchTaxAccountantSnapshot } from './tax-accountant';
import { fetchLaborConsultantSnapshot } from './labor-consultant';
import { fetchLawyerSnapshot } from './lawyer';
import { fetchJudicialScrivenerSnapshot } from './judicial-scrivener';
import { fetchAdminScrivenerSnapshot } from './admin-scrivener';
import { fetchSmeConsultantSnapshot } from './sme-consultant';
import { fetchPatentAttorneySnapshot } from './patent-attorney';
import { fetchBaseSnapshot } from './base';
import { fetchNetseaSnapshot } from './netsea';
import { fetchSuperDeliverySnapshot } from './super-delivery';
import { fetchTopsellerSnapshot } from './topseller';
import { fetchA8netSnapshot } from './a8net';
import { fetchAiBlogkunSnapshot } from './ai-blogkun';
import { fetchMoneyforwardSnapshot } from './moneyforward';
import { fetchAmazonSnapshot } from './amazon';
import { fetchAmazonAssociatesSnapshot } from './amazon-associates';
import { fetchSalesSnapshot } from './sales';
import { fetchTeamSnapshot } from './team';
import { fetchYoutubeSnapshot } from './youtube';
import { fetchOverviewSnapshot } from './overview';
import { fetchCoconalaSnapshot } from './coconala';
import { fetchTiktokSnapshot } from './tiktok';
import { fetchTaxSnapshot } from './tax';
import { fetchFundingSnapshot } from './funding';
import { fetchFreeeSnapshot } from './freee';
import { fetchConnectorsSnapshot } from './connectors';
// SCAFFOLD:ADD_FETCHER_IMPORT_ABOVE
import type { ActionMap, FetchContext } from './types';
import type { ServiceId } from '../../shared/serviceId';

export type { ServiceId };

export const LIVE_FETCHERS: Record<ServiceId, (ctx: FetchContext) => Promise<unknown>> = {
  home: fetchHomeSnapshot,
  github: fetchGithubSnapshot,
  wordpress: fetchWordPressSnapshot,
  atlassian: fetchAtlassianSnapshot,
  notion: fetchNotionSnapshot,
  drive: fetchDriveSnapshot,
  calendar: fetchCalendarSnapshot,
  gmail: fetchGmailSnapshot,
  slack: fetchSlackSnapshot,
  canva: fetchCanvaSnapshot,
  skills: fetchSkillsSnapshot,
  security: fetchSecuritySnapshot,
  cloudflare: fetchCloudflareSnapshot,
  emotions: fetchEmotionsSnapshot,
  ollama: fetchOllamaSnapshot,
  kpi: fetchKpiSnapshot,
  stocks: fetchStocksSnapshot,
  business: fetchBusinessOpsSnapshot,
  teamradar: fetchTeamRadarSnapshot,
  templates: fetchTemplatesSnapshot,
  library: fetchLibrarySnapshot,
  settings: fetchSettingsSnapshot,
  'uber-eats': fetchUberEatsSnapshot,
  'demae-can': fetchDemaeCanSnapshot,
  'real-estate': fetchRealEstateSnapshot,
  'mutual-funds': fetchMutualFundsSnapshot,
  quality: fetchQualitySnapshot,
  'microsoft-365': fetchMicrosoft365Snapshot,
  dropbox: fetchDropboxSnapshot,
  salesforce: fetchSalesforceSnapshot,
  discord: fetchDiscordSnapshot,
  asana: fetchAsanaSnapshot,
  linear: fetchLinearSnapshot,
  sentry: fetchSentrySnapshot,
  shopify: fetchShopifySnapshot,
  stripe: fetchStripeSnapshot,
  line: fetchLineSnapshot,
  storage: fetchStorageSnapshot,
  'tax-accountant': fetchTaxAccountantSnapshot,
  'labor-consultant': fetchLaborConsultantSnapshot,
  lawyer: fetchLawyerSnapshot,
  'judicial-scrivener': fetchJudicialScrivenerSnapshot,
  'admin-scrivener': fetchAdminScrivenerSnapshot,
  'sme-consultant': fetchSmeConsultantSnapshot,
  'patent-attorney': fetchPatentAttorneySnapshot,
  base: fetchBaseSnapshot,
  netsea: fetchNetseaSnapshot,
  'super-delivery': fetchSuperDeliverySnapshot,
  topseller: fetchTopsellerSnapshot,
  a8net: fetchA8netSnapshot,
  'ai-blogkun': fetchAiBlogkunSnapshot,
  moneyforward: fetchMoneyforwardSnapshot,
  amazon: fetchAmazonSnapshot,
  'amazon-associates': fetchAmazonAssociatesSnapshot,
  sales: fetchSalesSnapshot,
  team: fetchTeamSnapshot,
  youtube: fetchYoutubeSnapshot,
  overview: fetchOverviewSnapshot,
  coconala: fetchCoconalaSnapshot,
  tiktok: fetchTiktokSnapshot,
  tax: fetchTaxSnapshot,
  funding: fetchFundingSnapshot,
  freee: fetchFreeeSnapshot,
  connectors: fetchConnectorsSnapshot,
  // SCAFFOLD:ADD_FETCHER_ENTRY_ABOVE
};

// Runtime invariant: every SERVICE_ID must have a fetcher.
// This trips at module load (= app start) if a new ID was added to
// SERVICE_IDS but its fetcher was forgotten — surfaces the bug as a
// loud, deterministic crash rather than an opaque "unknown service id"
// at first user interaction.
{
  // Import lazily to avoid widening the circular-import surface.
   
  const { SERVICE_IDS } = require('../../shared/serviceId') as typeof import('../../shared/serviceId');
  for (const id of SERVICE_IDS) {
    if (!Object.hasOwn(LIVE_FETCHERS, id)) {
      throw new Error(
        `[clients] missing LIVE_FETCHERS entry for service "${id}". ` +
          `Add it before shipping — SERVICE_IDS and LIVE_FETCHERS must be in sync.`,
      );
    }
  }
}

/** Services whose snapshot fetcher reads local resources (filesystem,
 *  process state, etc.) and does not require any saved credentials. The
 *  IPC handler in main.ts still passes through any token the user has
 *  saved (security uses it for opt-in HIBP/VT calls), but a missing
 *  token is not an error here. */
export const LOCAL_SERVICES: ReadonlySet<ServiceId> = new Set<ServiceId>([
  'home',
  'skills',
  'security',
  'emotions',
  'ollama',
  'kpi',
  'stocks',
  'business',
  'funding',
  'teamradar',
  'templates',
  'library',
  'settings',
  'uber-eats',
  'demae-can',
  'real-estate',
  'mutual-funds',
  'quality',
  'storage',
  // 士業: 個別の専門家連携で公式 API なし、永続的に snapshot-only。
  'tax-accountant',
  'labor-consultant',
  'lawyer',
  'judicial-scrivener',
  'admin-scrivener',
  'sme-consultant',
  'patent-attorney',
  // EC 仕入れ/卸/ASP/AI 執筆: 公開 API なし or パートナー限定で snapshot-only。
  'netsea',
  'super-delivery',
  'topseller',
  'a8net',
  'ai-blogkun',
  // クラウド会計 (公式 API はパートナー登録 + OAuth 必須) で snapshot-only。
  'moneyforward',
  // Amazon セラー (SP-API) / アソシエイト: 要パートナー承認で snapshot-only。
  'amazon',
  'amazon-associates',
  // 売上集計: データは renderer の record store に保存、認証不要。
  'sales',
  // チーム管理: メンバーは renderer の record store に保存、認証不要。
  'team',
  // 経営サマリー: 既存機能の集約のみ。認証不要。
  'overview',
  // ココナラ: 公開 API なしで snapshot-only。
  'coconala',
  // TikTok: 公式 API はパートナー審査 + OAuth 前提で snapshot-only。
  'tiktok',
  // 税務試算: 計算のみ・公式ツールへ導線。納付は手動。snapshot-only。
  'tax',
  // コネクター/自動化: 無料(認証不要)カタログの可視化のみ。snapshot-only。
  'connectors',
]);

/** Per-service write-side actions. Each service may register one or more
 *  named actions; renderer invokes them via `serviceHub.invoke()`. */
export const LIVE_ACTIONS: Partial<Record<ServiceId, ActionMap>> = {
  github: GITHUB_ACTIONS,
  notion: NOTION_ACTIONS,
  slack: SLACK_ACTIONS,
  calendar: CALENDAR_ACTIONS,
  atlassian: ATLASSIAN_ACTIONS,
  wordpress: WORDPRESS_ACTIONS,
  gmail: GMAIL_ACTIONS,
  skills: SKILLS_ACTIONS,
  drive: DRIVE_ACTIONS,
  canva: CANVA_ACTIONS,
  security: SECURITY_ACTIONS,
  cloudflare: CLOUDFLARE_ACTIONS,
  emotions: EMOTIONS_ACTIONS,
  ollama: OLLAMA_ACTIONS,
  stocks: STOCKS_ACTIONS,
  business: BUSINESS_ACTIONS,
  teamradar: TEAMRADAR_ACTIONS,
  templates: TEMPLATES_ACTIONS,
  'uber-eats': UBER_EATS_ACTIONS,
  'demae-can': DEMAE_CAN_ACTIONS,
  'real-estate': REAL_ESTATE_ACTIONS,
  'mutual-funds': MUTUAL_FUNDS_ACTIONS,
  shopify: SHOPIFY_ACTIONS,
  'microsoft-365': MICROSOFT365_ACTIONS,
  // SCAFFOLD:ADD_ACTIONS_ENTRY_ABOVE
};

export { FetchError } from './types';
