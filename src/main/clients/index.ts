import { fetchGithubSnapshot } from './github';
import { fetchNotionSnapshot } from './notion';
import { fetchWordPressSnapshot } from './wordpress';
import { fetchSlackSnapshot } from './slack';
import { fetchDriveSnapshot } from './drive';
import { fetchCalendarSnapshot } from './calendar';
import { fetchGmailSnapshot } from './gmail';
import { fetchCanvaSnapshot } from './canva';
import { fetchAtlassianSnapshot } from './atlassian';
import type { FetchContext } from './types';

export type ServiceId =
  | 'github'
  | 'wordpress'
  | 'atlassian'
  | 'notion'
  | 'drive'
  | 'calendar'
  | 'gmail'
  | 'slack'
  | 'canva';

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
};

export { FetchError } from './types';
