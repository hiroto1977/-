import { isServiceId, type ServiceId } from '../shared/serviceId';
import { isPortalId, type PortalId } from '../shared/portal';

/**
 * URL ハッシュ ↔ サービスのルーティング (純関数 — DOM 非依存でテスト可能)。
 *
 * 公開済み Web アプリ (GitHub Pages) で、`/-/#stocks` のような直リンク・共有・
 * ブラウザの戻る/進むを可能にする。App.tsx が activeId ↔ location.hash を
 * これらの純関数で双方向同期する。
 */

/** location.hash ("#stocks" / "#/stocks") から ServiceId を取り出す。不正なら null。 */
export function serviceIdFromHash(hash: string): ServiceId | null {
  const raw = hash.replace(/^#\/?/, '').trim();
  return isServiceId(raw) ? raw : null;
}

/** ServiceId を hash 文字列 ("#stocks") にする。 */
export function hashForService(id: ServiceId): string {
  return `#${id}`;
}

/** ポータルの一覧を指す hash の接頭辞 (`#portal/partner`)。ServiceId に `/` は入らないので取り違えない。 */
const PORTAL_HASH_PREFIX = 'portal/';

/** location.hash ("#portal/partner") からポータルの id を取り出す。ポータルの hash でなければ null。 */
export function portalIdFromHash(hash: string): PortalId | null {
  const raw = hash.replace(/^#\/?/, '').trim();
  if (!raw.startsWith(PORTAL_HASH_PREFIX)) return null;
  const id = raw.slice(PORTAL_HASH_PREFIX.length);
  return isPortalId(id) ? id : null;
}

/** ポータルの id を hash 文字列 ("#portal/partner") にする。 */
export function hashForPortal(id: PortalId): string {
  return `#${PORTAL_HASH_PREFIX}${id}`;
}
