/**
 * ブラウザ版の「更新」が、同梱の内容を返す画面。
 *
 * `SERVICE_DATA_ORIGIN` が 'local' の画面は「更新」を押すと取得を呼ぶ ('sample' は呼ばない)。
 * デスクトップ版では主プロセスの fetcher が答えるが、ブラウザ版の `web-shim.ts` に枝が無いと
 * `not_implemented` へ落ち、画面は**赤い「エラー」と「ブラウザ版では live fetch を行いません」**を出す
 * (2026-11-19 実測: 事業ダッシュボード / 書類スタジオ / 資金調達レーダー / KPI / Linux / Skills /
 * テンプレートの 7 画面。事業ダッシュボードと Skills は API キーを保存すると開いただけで出た)。
 *
 * この 10 つは、ブラウザ版では**同梱の内容しか返せない**:
 *
 *   - business / docstudio / funding / kpi / templates —— デスクトップ版の fetcher も同梱の値を
 *     組み立てて返し、自分で `isMock: true` を名乗る。ブラウザ版も同じ中身 (`SNAPSHOT[id]`) を返す。
 *   - linux / skills / storage / obsidian / docker —— デスクトップ版は端末 (OS の情報・
 *     `~/.claude/skills`・ディスク・Obsidian の Vault・Docker Engine) を読む。ブラウザ版は
 *     単一 HTML で動くので端末を読めない。返せるのは同梱の内容 (Linux は見本の値・Skills は空の一覧) だけ。
 *     storage / obsidian / docker は 2026-11-21 の第4弾で 'local' 化したときに、この一覧へ足した
 *     (足さないまま 'local' にすると「更新」が `not_implemented` へ落ちる ——
 *     `browserRefreshReachable.test.ts` が鳴らした)。
 *
 * **返す物は必ず `isMock: true` を名乗る** —— 画面はそれを読んで注記か「同梱データ」の札を出す
 * (`shared/dataOrigin.ts` の `describeOrigin`: 緑の札は「実際に取ってきた」時だけ)。
 * 端末を読めていない Linux / Skills に緑の「ローカル」を付けない。
 */

/** ブラウザ版の取得が同梱の内容を返すサービス。 */
export const BROWSER_BUNDLED_FETCH_SERVICES: readonly string[] = Object.freeze([
  'business',
  'docstudio',
  'funding',
  'kpi',
  'linux',
  'skills',
  'templates',
  'docker',
  'obsidian',
  'storage',
]);

/** ブラウザ版の取得が同梱の内容を返すサービスか。 */
export function servesBundledInBrowser(serviceId: string): boolean {
  return BROWSER_BUNDLED_FETCH_SERVICES.includes(serviceId);
}

/**
 * ブラウザ版の取得が返す中身。同梱の内容の写しに、`isMock: true` を重ねる。
 *
 * 写しを返す (同梱の物そのものを渡さない) —— 受け取った側が書き換えても同梱の値は動かない。
 */
export function bundledPayloadForBrowser(
  serviceId: string,
  snapshots: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return { ...(snapshots[serviceId] as Record<string, unknown>), isMock: true };
}
