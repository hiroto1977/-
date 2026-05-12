// Single source of truth for service IDs. Imported by:
//   - src/renderer/services.ts  (sidebar entries)
//   - src/main/clients/index.ts (LIVE_FETCHERS map)
//   - src/preload/preload.ts    (bridge types)
//
// Add new services via `npm run scaffold -- <id> "<Label>" <ICON>` which
// inserts before the SCAFFOLD marker below.

export const SERVICE_IDS = [
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
  // SCAFFOLD:ADD_SERVICE_ID_ABOVE
] as const;

export type ServiceId = (typeof SERVICE_IDS)[number];
