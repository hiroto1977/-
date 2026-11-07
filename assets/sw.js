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
/*
 * 版を v2 から上げてある (2026-09-26 / パス 480)。`activate` は名前の違う古い
 * キャッシュを捨てるので、**以前の precache が残した `app.html` (生 11.97 MB) を
 * 既存の端末から回収する**ため。回収するのは disk の都合だけではない ——
 * Cache Storage はそのオリジンの保存枠を食い、枠が尽きたときの立ち退きは
 * **暗号化されたトークンごと**持っていく (`storageDurability.ts` / パス 351)。
 * 1 度も開かれていないアプリ本体のために枠を埋めておくのは、その危険を
 * 何の見返りもなく上げることである。
 *
 * 代わりの費用も書く: アプリを実際に開いていた利用者は、次にオンラインで
 * 開いたときに 1 度だけ取り直す (network-first なので画面は変わらない)。
 *
 * **v3 → v4 (2026-09-26 / パス 485)**: 鍵の作り方を変えた (下の `cacheKey`) ので、
 * 以前の鍵で焼いた写し —— クエリ違いの `app.html?fbclid=…` が 1 つ 11.8 MB ずつ ——
 * は新しいコードからは**読まれも上書きもされない**。名前を変えて `activate` に捨てさせる。
 * (本番の `main` は 2026-09-26 時点で v2 で、同じ写しを v2 に持つ —— こちらは
 * パス 480 の版上げの時点で既に捨てられる。v4 が足すのは、この枝の SW を走らせた
 * 端末に残った v3 の写しの回収である。)
 */
const CACHE = 'service-hub-v4';
/**
 * **キャッシュの鍵はパスだけで作る —— クエリと断片は落とす** (2026-09-26 / パス 485)。
 *
 * 以前は `c.put(req, copy)` / `caches.match(req)` で、鍵は**要求の URL 全体**だった。
 * 配信は静的 (GitHub Pages) で、**同じファイルをどのクエリにも同じ中身で返す**のに、
 * 鍵はクエリごとに別になる。追跡パラメタ (`?fbclid=…` / `?utm_source=…` —— SNS や
 * 広告のリンクは 1 クリックごとに違う値を付ける) で開くたびに、**アプリ本体の写しが
 * 1 つずつ増えて上限が無かった**。実 chromium で実測 (2026-09-26 · `pages.yml` と同じ形に
 * 組んだ `_site` · `inject-pwa` 適用後):
 *
 * ```
 *   app.html を開き、?fbclid=… を 5 通り付けて開く
 *     → 同じ 11,831,187 B が 6 つ = Cache Storage 71,024,096 B
 *   ?utm_source=x でしか来ていない利用者がオフラインになる
 *     app.html               → ランディング (アプリは 11.8 MB 焼いてあるのに)
 *     app.html?utm_source=y  → ランディング
 *     app.html?utm_source=x  → アプリ (完全に同じ URL のときだけ)
 * ```
 *
 * つまり**費用は訪問ごとに積み上がり、オフラインの効き目はほぼ 0** だった。
 * 積み上がる枠は暗号化された保管庫と同じオリジンの物で、枠が尽きたときの立ち退きは
 * トークンごと持っていく (`storageDurability.ts` / パス 351)。
 *
 * 鍵をパスにすると、焼く物の数は**公開しているファイルの数**で頭打ちになり、
 * どのクエリで開いてもオフラインで同じ画面が開く。断片 (`#home`) は Cache の照合が
 * もともと無視するが、鍵を読みやすくするために落とす。
 * ★ **ここが正しいのは配信がクエリを見ないからである** —— クエリで中身を変える配信の
 * 後ろにこの SW を置くなら、この関数を先に見直すこと。
 */
function cacheKey(url) {
  const u = new URL(url);
  u.search = '';
  u.hash = '';
  return u.href;
}
/*
 * **install で取るのは小さなシェルだけ。アプリ本体は入れない。** (2026-09-26 / パス 480)
 *
 * ここは 2026-07 から `['./app.html', './index.html', './manifest.webmanifest', './icon.svg']`
 * だった。上の説明文は「アプリシェル (HTML/アイコン/manifest) だけをキャッシュすれば
 * PWA のオフライン起動には十分」と述べているが、**その一覧の 1 件目はアプリ本体**で、
 * gzip の実測は次のとおりである (2026-09-26):
 *
 * ```
 *   app.html                4,056,514 B (gzip)   ← precache 全体の 99.76%
 *   index.html                  8,906 B
 *   manifest.webmanifest          355 B
 *   icon.svg                      309 B
 *   合計                    4,066,084 B
 * ```
 *
 * `install` は**公開サイトの根 (`index.html`) を開いただけで走る** (`inject-pwa.cjs` が
 * ランディングにも登録スクリプトを差し込む) ので、アプリを 1 度も開いていない訪問者が
 * 背景で 3.87 MiB を取っていた。この repo 自身が `pages.yml` で
 * 「スマホ用ライト版: /lite.html (10MB のフル版はスマホ回線で開けないため)」と
 * 述べているのだから、**その開けない版を全訪問者に先渡しするのは自分の判断と矛盾する。**
 *
 * ★ **しかも `Cache.addAll` は原子的である** —— 実 chromium で測った (2026-09-26・
 *   仕様の引用ではない):
 *
 * ```
 *   addAll(['ok.txt','big.txt'])    全部成功 → 2 件ともキャッシュへ
 *   addAll(['ok.txt','boom'])       1 件が 500 → TypeError: Failed to execute 'addAll'
 *                                   on 'Cache': Request failed ・**キャッシュは 0 件**
 *   add() を個別に allSettled       fulfilled / rejected ・**ok.txt は残る**
 * ```
 *
 * つまり回線が細くて `app.html` の取得が落ちる場面 —— まさにこの precache が要ると
 * された場面 —— では、9.6 KiB のシェルまで一緒に捨てられていた。**費用は払い終えて、
 * 効き目は 0 である。** シェルだけに絞れば、3 件とも小さいので原子性は罠にならない。
 *
 * アプリ本体は network-first の `fetch` ハンドラが**実際に開かれた時点で**焼く
 * (2xx の同一オリジン GET)。利用者は自分が実際に読み込んだ物に対してだけ
 * オフラインの利益を得る、という形になる。
 *
 * **失う物も書く**: ランディングから PWA を導入して、アプリを 1 度も開かずに
 * オフラインにした利用者は、初回だけ通信が要る。以前はそこで `app.html` が
 * キャッシュに在りえた (取得が成功していれば) —— ただし上の実測どおり、
 * 落ちた場合は何も残らなかった。
 */
const PRECACHE = ['./index.html', './manifest.webmanifest', './icon.svg'];
/**
 * オフラインの遷移で返す代替を、**手元に在る物の順**に並べる。
 * `app.html` を 1 度でも開いていればそれを返し (以前と同じ)、開いていなければ
 * ランディング (precache に在る) を返す。以前は `app.html` ただ 1 つだったので、
 * precache が落ちた端末ではオフラインの遷移が素の網エラーになっていた。
 */
const NAVIGATE_FALLBACKS = ['./app.html', './index.html'];

/**
 * 一覧を順に当てて、**最初に手元に在った物**を返す。どれも無ければ `undefined` を返し、
 * 呼び手が `Response.error()` を選べるようにする (ここで代わりを捏造しない)。
 *
 * 宣言なので巻き上げられる —— 下のハンドラより後ろに置いても呼べるが、
 * `const` の矢印関数にすると読み込み時に TDZ で落ちる (パス 371 で踏んだ罠)。
 */
function matchFirst(urls) {
  return urls.reduce(
    (acc, url) => acc.then((hit) => (hit ? hit : caches.match(url))),
    Promise.resolve(undefined),
  );
}

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
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return; // 読めない URL は別オリジンと同じ扱い (fail-closed)
  }
  if (url.origin !== self.location.origin) return;
  const key = cacheKey(url);

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
          caches.open(CACHE).then((c) => c.put(key, copy).catch(() => undefined));
        }
        return res;
      })
      .catch(() =>
        caches.match(key).then((hit) => {
          if (hit) return hit;
          // ナビゲーション (ページ遷移) だけアプリシェルへフォールバックする。
          // サブリソース要求に HTML を返すと、呼び出し側が HTML を JSON として
          // 解釈して不可解なエラーになるため。
          if (req.mode === 'navigate') return matchFirst(NAVIGATE_FALLBACKS);
          return Response.error();
        }),
      ),
  );
});
