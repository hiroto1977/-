// Single source of truth for service IDs. Imported by:
//   - src/renderer/services.ts  (sidebar entries)
//   - src/main/clients/index.ts (LIVE_FETCHERS map)
//   - src/preload/preload.ts    (bridge types)
//
// Add new services via `npm run scaffold -- <id> "<Label>" <ICON>` which
// inserts before the SCAFFOLD marker below.

export const SERVICE_IDS = [
  'home',
  'github',
  'wordpress',
  'atlassian',
  'notion',
  'drive',
  'calendar',
  'gmail',
  'slack',
  'canva',
  'skills',
  'security',
  'cloudflare',
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
  'microsoft-365',
  'dropbox',
  'salesforce',
  'discord',
  'asana',
  'linear',
  'sentry',
  'shopify',
  'stripe',
  'line',
  'storage',
  'tax-accountant',
  'labor-consultant',
  'lawyer',
  'judicial-scrivener',
  'admin-scrivener',
  'sme-consultant',
  'patent-attorney',
  'base',
  'netsea',
  'super-delivery',
  'topseller',
  'a8net',
  'ai-blogkun',
  'moneyforward',
  'amazon',
  'amazon-associates',
  'sales',
  'team',
  'youtube',
  'overview',
  'coconala',
  // SCAFFOLD:ADD_SERVICE_ID_ABOVE
] as const;

export type ServiceId = (typeof SERVICE_IDS)[number];

const SERVICE_ID_SET = new Set<string>(SERVICE_IDS);

/** Type-narrowing guard. Validates that an untrusted string from
 *  IPC (or other untrusted source) is one of our known service ids.
 *  Use this BEFORE indexing any LIVE_FETCHERS / LIVE_ACTIONS / config
 *  map by the value — otherwise a string like "__proto__" or
 *  "constructor" could return prototype-chain entries.
 */
export function isServiceId(value: unknown): value is ServiceId {
  return typeof value === 'string' && SERVICE_ID_SET.has(value);
}
