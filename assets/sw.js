/*
 * Service Hub — PWA Service Worker (network-first)。
 *
 * GitHub Pages 公開版 (/-/) でのみ登録される。**network-first** 方針:
 * オンライン時は常に最新を取得し、取得成功分だけキャッシュへ反映。オフライン時のみ
 * キャッシュへフォールバックする。これにより「古い HTML を握り続けて更新が届かない」
 * という Service Worker の典型的な事故を避ける。キャッシュ名にバージョンを持たせ、
 * activate で旧バージョンを破棄する。
 */
const CACHE = 'service-hub-v1';
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
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy).catch(() => undefined));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./app.html'))),
  );
});
