/*
 * Service Hub — PWA Service Worker (network-first)。
 *
 * GitHub Pages 公開版 (/-/) でのみ登録される。**network-first** 方針:
 * オンライン時は常に最新を取得し、取得成功分だけキャッシュへ反映。オフライン時のみ
 * キャッシュへフォールバックする。これにより「古い HTML を握り続けて更新が届かない」
 * という Service Worker の典型的な事故を避ける。キャッシュ名にバージョンを持たせ、
 * activate で旧バージョンを破棄する。
 *
 * キャッシュ対象は **同一オリジンの GET のみ** (2026-07 セキュリティ監査)。
 * 以前は全 GET を Cache Storage に書いていたため、CORS 対応の第三者 API
 * (GitHub / HIBP など) のレスポンス — 業務データや漏洩調査結果 — が
 * 平文で端末に無期限保存され、Vault (AES-GCM 暗号化・自動ロック) の保護を
 * 迂回しうる状態だった。アプリシェル (HTML/アイコン/manifest) だけを
 * キャッシュすれば PWA のオフライン起動には十分。
 */
const CACHE = 'service-hub-v2';
const PRECACHE = ['./app.html', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => undefined)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // 同一オリジン以外は素通し (キャッシュにも触れない)。third-party API の
  // レスポンスを端末へ平文保存しないための境界。
  let sameOrigin;
  try {
    sameOrigin = new URL(req.url).origin === self.location.origin;
  } catch {
    sameOrigin = false;
  }
  if (!sameOrigin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // 取得できたものを何でも保存すると、5xx や 404 をアプリシェルとして
        // 焼き付けてしまう。次にオフラインになったとき利用者に返るのはその
        // 5xx で、アプリが起動しなくなる。上の説明文は最初から
        // 「取得成功分だけキャッシュへ反映」と書いてあり、実装だけが
        // それに追いついていなかった。
        //
        // 応答自体は成否にかかわらずそのまま返す。ここで握り潰すと、
        // 404 を期待している呼び出し側が壊れる。
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy).catch(() => undefined));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit;
          // ナビゲーション (ページ遷移) だけアプリシェルへフォールバックする。
          // サブリソース要求に HTML を返すと、呼び出し側が HTML を JSON として
          // 解釈して不可解なエラーになるため。
          if (req.mode === 'navigate') return caches.match('./app.html');
          return Response.error();
        }),
      ),
  );
});
