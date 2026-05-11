import { fetchGithubSnapshot } from './github';
import { fetchNotionSnapshot } from './notion';
import { fetchWordPressSnapshot } from './wordpress';
import { fetchSlackSnapshot } from './slack';
import { fetchDriveSnapshot } from './drive';
import { fetchCalendarSnapshot } from './calendar';
import { fetchGmailSnapshot } from './gmail';
import { fetchCanvaSnapshot } from './canva';
import { fetchAtlassianSnapshot } from './atlassian';
// SCAFFOLD:ADD_FETCHER_IMPORT_ABOVE
import type { FetchContext } from './types';
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

export { FetchError } from './types';
