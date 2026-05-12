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
// SCAFFOLD:ADD_FETCHER_IMPORT_ABOVE
import type { ActionMap, FetchContext } from './types';
import type { ServiceId } from '../../shared/serviceId';

export type { ServiceId };

export const LIVE_FETCHERS: Record<ServiceId, (ctx: FetchContext) => Promise<unknown>> = {
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
  // SCAFFOLD:ADD_FETCHER_ENTRY_ABOVE
};

/** Services whose snapshot fetcher reads local resources (filesystem,
 *  process state, etc.) and does not require any saved credentials. The
 *  IPC handler in main.ts still passes through any token the user has
 *  saved (security uses it for opt-in HIBP/VT calls), but a missing
 *  token is not an error here. */
export const LOCAL_SERVICES: ReadonlySet<ServiceId> = new Set<ServiceId>(['skills', 'security']);

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
  // SCAFFOLD:ADD_ACTIONS_ENTRY_ABOVE
};

export { FetchError } from './types';
