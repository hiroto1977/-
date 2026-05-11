import { fetchGithubSnapshot, ACTIONS as GITHUB_ACTIONS } from './github';
import { fetchNotionSnapshot } from './notion';
import { fetchWordPressSnapshot } from './wordpress';
import { fetchSlackSnapshot } from './slack';
import { fetchDriveSnapshot } from './drive';
import { fetchCalendarSnapshot } from './calendar';
import { fetchGmailSnapshot } from './gmail';
import { fetchCanvaSnapshot } from './canva';
import { fetchAtlassianSnapshot } from './atlassian';
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
  // SCAFFOLD:ADD_FETCHER_ENTRY_ABOVE
};

/** Per-service write-side actions. Each service may register one or more
 *  named actions; renderer invokes them via `serviceHub.invoke()`. */
export const LIVE_ACTIONS: Partial<Record<ServiceId, ActionMap>> = {
  github: GITHUB_ACTIONS,
  // SCAFFOLD:ADD_ACTIONS_ENTRY_ABOVE
};

export { FetchError } from './types';
