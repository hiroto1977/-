/**
 * 社外向けポータルの橋 —— `window.serviceHub` の**最小の実装** (2026-11-11)。
 *
 * 社内版のブラウザ用の橋 (`renderer/web-shim.ts`) は保管庫・外部サービスへの書き込み・AI の経路を
 * まるごと持つ。社外へ配る HTML にそれを入れない: この橋は**資格情報を預からず、網へ出ず、
 * 端末の外へ何も送らない**。画面 (`useServiceData` / `StatusBar`) が呼ぶ口には、失敗を戻り値で答える。
 *
 * - `fetchSnapshot`: 入口の関門 `portalScreenOrNull` を通る画面だけに「同梱の見本を使う」と答え、
 *   それ以外 (このポータルに無い画面) は断る。どちらも網へ出ない。
 * - `invoke`: どの action も実行しない (社外向けのポータルは書き込みを 1 つも持たない)。
 * - `setToken` / `authorize`: 断る。`listConfigured` は常に空 —— 預かっていないので。
 * - `openExternal`: 社内版と同じ関門 (`externalUrlOrNull`) と包み (`openWindowVetted`) を通す。
 * - `eraseAll`: 何も消さない (`allDeleted: false`)。同じオリジンに社内版が在っても巻き込まない ——
 *   このポータルが端末に残す物の消し方は `PortalEraseHatch` が別に持つ。
 *
 * 版は名乗らない (社外向けのポータルに版の表示は無い)。身元の接尾辞だけを付けるので、
 * 画面は「ブラウザ版」として振る舞う (`isWebBuildVersion`)。
 *
 * この橋が保管庫・網・社内の画面を取り込んでいないことは
 * `src/renderer/portal/__tests__/portalBundleClosure.test.ts` が取り込みの閉包で数える。
 */
import type { ActionResult, FetchResult, OAuthResult, OsOpResult, StorageProtection, TokenSaveResult } from '../../preload/bridgeTypes';
import { WEB_BUILD_SUFFIX } from '../../shared/buildDestinations';
import type { BrowserEraseReport } from '../../shared/eraseReport';
import { externalUrlOrNull } from '../../shared/externalUrlGate';
import { PORTALS, portalScreenOrNull } from '../../shared/portal';
import type { UpdateVerdict } from '../../shared/updateCheck';
import { openWindowVetted } from '../vettedSinks';

export type ExternalPortalId = 'partner' | 'customer';

/** この橋が名乗る版。数は持たない —— 接尾辞だけで「ブラウザ版」と分かる。 */
export const PORTAL_BUILD_VERSION = 'portal' + WEB_BUILD_SUFFIX;

export const PORTAL_NOT_INCLUDED = 'この機能は、このポータルには入っていません。';
export const PORTAL_SNAPSHOT_ONLY = 'このポータルは外部から取得しません。同梱の内容を表示します。';
export const PORTAL_NO_CREDENTIALS = 'このポータルは API キーやトークンを預かりません。';
export const PORTAL_NO_OS = 'このポータルからは、ファイルを OS で開けません。';

function portalLabel(portal: ExternalPortalId): string {
  return PORTALS.find((p) => p.id === portal)?.label ?? 'ポータル';
}

/** 社外向けポータルの橋を組む。副作用は無い (据え付けは `installPortalBridge`)。 */
export function createPortalBridge(portal: ExternalPortalId) {
  const noOs = (): Promise<OsOpResult> => Promise.resolve({ ok: false, message: PORTAL_NO_OS });
  return {
    getVersion: (): Promise<string> => Promise.resolve(PORTAL_BUILD_VERSION),
    checkUpdate: (): Promise<UpdateVerdict> =>
      Promise.resolve({ status: 'unknown', current: PORTAL_BUILD_VERSION, latest: null, url: null }),
    openExternal: (url: string): Promise<void> => {
      const safe = externalUrlOrNull(url);
      if (safe !== null) openWindowVetted(safe);
      return Promise.resolve();
    },
    revealInFolder: noOs,
    openPath: noOs,
    setColorScheme: (): Promise<OsOpResult> => Promise.resolve({ ok: true }),
    setToken: (): Promise<TokenSaveResult> =>
      Promise.resolve({ ok: false, code: 'invalid_service', message: PORTAL_NO_CREDENTIALS }),
    clearToken: (): Promise<OsOpResult> => Promise.resolve({ ok: true }),
    listConfigured: (): Promise<string[]> => Promise.resolve([]),
    storageProtection: (): Promise<StorageProtection> =>
      Promise.resolve({
        encrypted: false,
        plainCount: 0,
        file: portalLabel(portal) + ' (資格情報を預からない)',
        mechanism: 'obfuscated',
        durability: 'best-effort',
      }),
    eraseAll: (): Promise<BrowserEraseReport> =>
      Promise.resolve({
        kind: 'browser',
        indexeddb: {},
        localStorage: 'unavailable',
        sessionStorage: 'unavailable',
        cacheStorage: 'unavailable',
        allDeleted: false,
      }),
    fetchSnapshot: <T,>(serviceId?: unknown): Promise<FetchResult<T>> =>
      Promise.resolve(
        portalScreenOrNull(portal, serviceId) === null
          ? { ok: false, code: 'fetch_failed', message: PORTAL_NOT_INCLUDED }
          : { ok: false, code: 'not_implemented', message: PORTAL_SNAPSHOT_ONLY },
      ),
    invoke: <T,>(): Promise<ActionResult<T>> =>
      Promise.resolve({ ok: false, code: 'action_not_found', message: PORTAL_NOT_INCLUDED }),
    oauthSupported: (): Promise<boolean> => Promise.resolve(false),
    authorize: (): Promise<OAuthResult> =>
      Promise.resolve({ ok: false, code: 'not_supported', message: PORTAL_NO_CREDENTIALS }),
  };
}

export type PortalBridge = ReturnType<typeof createPortalBridge>;

/** 橋を据え付ける。既に橋が在れば触らない (検査の代役を上書きしない)。 */
export function installPortalBridge(portal: ExternalPortalId): void {
  if (typeof window === 'undefined') return;
  const host = window as unknown as { serviceHub?: unknown };
  if (host.serviceHub !== undefined) return;
  host.serviceHub = createPortalBridge(portal);
}
