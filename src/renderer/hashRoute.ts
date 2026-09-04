import { isServiceId, type ServiceId } from '../shared/serviceId';

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
