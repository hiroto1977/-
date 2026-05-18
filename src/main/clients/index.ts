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
  'teamradar',
  'templates',
  'library',
  'settings',
  'uber-eats',
  'demae-can',
  'real-estate',
  'mutual-funds',
  'quality',
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
  // SCAFFOLD:ADD_ACTIONS_ENTRY_ABOVE
};

export { FetchError } from './types';
