/* Service Worker — minna-desktop
   v3 (v39、PDCA #28): stale-while-revalidate (SWR) 戦略
   - ナビゲーション + 同オリジン 静的アセット は SWR (即座にキャッシュ返答 → 裏で更新)
   - その他 (cross-origin、API、HEAD/POST 等) は 通常通り (キャッシュなし)
   - オフライン時: キャッシュがあれば返す、なければ index.html (SPA 風 fallback)
   バージョン管理: CACHE_VERSION を上げると古いキャッシュが activate 時に削除される */
const CACHE_VERSION = 'v3';
const CACHE = `minna-desktop-${CACHE_VERSION}`;
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('minna-desktop-') && k !== CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// SWR: cache を即座に返しつつ、裏で fetch + cache 更新
function staleWhileRevalidate(req) {
  return caches.open(CACHE).then(cache =>
    cache.match(req).then(cached => {
      const networkPromise = fetch(req).then(res => {
        // 成功時のみ cache 更新 (ok = 200-299)
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);  // ネット失敗時は cache を返す
      // cache があれば即座に返し、裏で更新 (= stale-while-revalidate)
      return cached || networkPromise;
    })
  );
}

// ナビゲーション 用 fallback: SWR で取れない時は cache の index.html
function navigationFallback(req) {
  return staleWhileRevalidate(req).catch(() =>
    caches.match('./index.html')
  );
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 同オリジン のみ キャッシュ対象 (cross-origin は SW 介入なし)
  if (url.origin !== location.origin) return;

  // ナビゲーション (HTML ドキュメント): SWR + fallback
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(navigationFallback(req));
    return;
  }
  // 静的アセット (CSS / JS / 画像 / フォント / manifest): SWR
  e.respondWith(staleWhileRevalidate(req));
});
