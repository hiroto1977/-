/* Service Worker — minna-desktop
   オフライン対応のためのキャッシュファースト戦略
   バージョン管理: CACHE_VERSION を上げると古いキャッシュが activate 時に削除される */
const CACHE_VERSION = 'v2';  // 上げる度に旧キャッシュを破棄
const CACHE = `minna-desktop-${CACHE_VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      // 旧バージョンのキャッシュを全削除 ('minna-desktop-' で始まり、現バージョンと違うもの)
      Promise.all(
        keys
          .filter(k => k.startsWith('minna-desktop-') && k !== CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// クライアントから 'SKIP_WAITING' を受け取ったら即座に新 SW を有効化
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res.ok && new URL(req.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
