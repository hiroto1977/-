/**
 * 開発サーバ向けの origin を CSP へ**開発ビルドのときだけ**足す。
 *
 * `src/renderer/index.html` の CSP は Electron 版がそのまま同梱する。
 * 2026-08 の監査時点で、そこに Vite HMR 用の
 * `connect-src … http://localhost:5173 ws://localhost:5173` が**直接書かれて**いた。
 * 製品ビルドでも同じ meta が入るので、パッケージ版のレンダラは
 * 5173 を握っているローカルのプロセスへ fetch / WebSocket を張れた。
 *
 * これは 2026-07 の監査が**画面遷移側では既に塞いだ**のと同じ形である
 * (`main.ts` の `allowNavigation` は 5173 の例外を `isDev` で閉じている:
 * 「in a packaged build nothing of ours listens on 5173, so leaving it open only
 * let a compromised renderer aim the main window at whatever local process
 * happened to hold that port」)。通信側だけが静的な meta のまま残っていた。
 *
 * ## 向きを逆にする
 *
 * 「製品ビルドで**消す**」ではなく「開発ビルドで**足す**」にした。
 * 消す向きだと、消す処理が壊れたときに**製品側が黙って緩む**。
 * 足す向きなら、壊れたときに壊れるのは開発時の HMR だけで、
 * しかも即座に気付く。commit されている HTML が常に製品の方針そのものになる。
 *
 * ## 見つからなければ投げる
 *
 * CSP メタが無い / `connect-src` が無い場合は例外にする。黙って何もしないと
 * 「HMR が繋がらない理由が分からない」になり、さらに悪いことに
 * 「CSP を書き換えているつもり」だけが残る。
 */

const CSP_META_RE = /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/i;

/** 開発サーバの origin。HMR は WebSocket を張るので ws: も要る。 */
const DEV_CONNECT_ORIGINS = ['http://localhost:5173', 'ws://localhost:5173'];

/** CSP 文字列の `connect-src` へ origin を足す（重複は足さない）。 */
function addDevOriginsToDirective(policy) {
  const parts = policy.split(';').map((p) => p.trim());
  const index = parts.findIndex((p) => /^connect-src(\s|$)/i.test(p));
  if (index === -1) {
    throw new Error('dev-csp: CSP に connect-src がありません');
  }
  const existing = parts[index].split(/\s+/).slice(1);
  const missing = DEV_CONNECT_ORIGINS.filter((o) => !existing.includes(o));
  if (missing.length === 0) return policy;
  parts[index] = `${parts[index]} ${missing.join(' ')}`;
  return parts.join('; ');
}

/** index.html の CSP メタへ開発サーバの origin を足した HTML を返す。 */
function addDevOriginsToCsp(html) {
  if (!CSP_META_RE.test(html)) {
    throw new Error('dev-csp: CSP メタが見つかりません');
  }
  return html.replace(CSP_META_RE, (_m, head, policy, tail) =>
    `${head}${addDevOriginsToDirective(policy)}${tail}`,
  );
}

module.exports = { addDevOriginsToCsp, addDevOriginsToDirective, DEV_CONNECT_ORIGINS };
