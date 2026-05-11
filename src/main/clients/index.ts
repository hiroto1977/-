import { fetchGithubSnapshot } from './github';
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

export const LIVE_FETCHERS: Partial<Record<ServiceId, (ctx: FetchContext) => Promise<unknown>>> = {
  github: fetchGithubSnapshot,
};

export { FetchError } from './types';
