// 軽量・自己完結のランディングページを生成する (GitHub Pages 用)。
//
// 45 サービス全部入りの standalone.html (445KB) は匿名訪問者には重く、
// Vault / live fetch / トークン機能はクレデンシャル無しでは無意味。
// そこで Pages のルートには「概要 + サービス一覧 + フル版への導線」だけを
// 持つ高速な単一 HTML を置く。フル版は ./app.html に同梱する。
//
// データは src/renderer/services.ts (サービスの単一の真実) から抽出するため、
// サービスを増減してもランディングが自動追従しドリフトしない。さらに
// src/shared/serviceId.ts の正典カウントと照合し、parse 漏れ (page: の値が
// factory 呼び出しになった等) を **ビルド失敗** で検知する (回帰防止)。
//
// 出力: dist/landing.html  (Pages workflow が _site/index.html へコピー)
//       dist/og.svg        (OGP 画像のフォールバック)

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SERVICES_TS = path.join(ROOT, 'src/renderer/services.ts');
const SERVICEID_TS = path.join(ROOT, 'src/shared/serviceId.ts');
const OUT = path.join(ROOT, 'dist/landing.html');

const SITE_URL = 'https://hiroto1977.github.io/-/';
const REPO_URL = 'https://github.com/hiroto1977/-';
const OG_IMAGE = SITE_URL + 'og.png';
const DESCRIPTION_BASE =
  'サービスを 1 つのサイドバー UI に統合した業務支援ダッシュボード。Electron デスクトップ版とブラウザ単体 HTML 版、どちらでも動きます。';

const CATEGORY_LABEL = {
  featured: 'おすすめ',
  tools: '分析・ツール',
  integrations: '外部サービス連携',
};
const CATEGORY_ORDER = ['featured', 'tools', 'integrations'];

/** services.ts の SERVICES 配列から {id,label,icon,description,category} を抽出。 */
function parseServices() {
  const text = fs.readFileSync(SERVICES_TS, 'utf8');
  // page: の値は単純な識別子 (SomePage) と factory 呼び出し
  // (createConnectorStubPage('id', 'Label', SNAPSHOT.x)) の両方を取り得るので、
  // page: 〜 category: の間は非貪欲にスキップする (カンマ・括弧を含んでも可)。
  const entry =
    /id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*icon:\s*'([^']+)',\s*description:\s*'([^']*)',\s*page:[\s\S]*?category:\s*'([^']+)'/g;
  const out = [];
  let m;
  while ((m = entry.exec(text)) !== null) {
    out.push({ id: m[1], label: m[2], icon: m[3], description: m[4], category: m[5] });
  }
  if (out.length === 0) throw new Error('no services parsed from services.ts');
  return out;
}

/** serviceId.ts の SERVICE_IDS 件数 (正典)。parse 漏れ検知の基準。 */
function countCanonicalServices() {
  const text = fs.readFileSync(SERVICEID_TS, 'utf8');
  const m = text.match(/SERVICE_IDS\s*=\s*\[([\s\S]*?)\]/);
  if (!m) throw new Error('SERVICE_IDS not found in serviceId.ts');
  return (m[1].match(/'[a-z][a-z0-9-]*'/g) || []).length;
}

/** src 配下の *.test.ts の静的 it( 件数を数える (品質メトリクス用)。 */
function countTests() {
  let total = 0;
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.test\.ts$/.test(e.name)) {
        total += (fs.readFileSync(full, 'utf8').match(/^\s*it\(/gm) || []).length;
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  return total;
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** インライン SVG favicon (data URI)。外部ファイル不要。 */
function faviconDataUri() {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="7" fill="#4f7cff"/>` +
    `<text x="16" y="22" font-size="18" font-family="sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">S</text>` +
    `</svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/** OGP 用の 1200x630 ブランドカード (SVG)。PNG が無い環境のフォールバック。 */
function buildOgSvg(services) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0f1117"/><stop offset="1" stop-color="#1a2238"/>
  </linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect x="64" y="80" width="64" height="64" rx="14" fill="#4f7cff"/>
  <text x="96" y="126" font-size="36" font-family="sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">S</text>
  <text x="148" y="128" font-size="34" font-family="sans-serif" font-weight="700" fill="#99a0ad">SERVICE HUB</text>
  <text x="64" y="300" font-size="84" font-family="sans-serif" font-weight="800" fill="#e6e8ee">業務を、ひとつの画面に。</text>
  <text x="64" y="380" font-size="34" font-family="sans-serif" fill="#99a0ad">${services.length} サービス · Electron + ブラウザ単体 HTML</text>
  <text x="64" y="540" font-size="28" font-family="sans-serif" fill="#4f7cff">hiroto1977.github.io/-</text>
</svg>`;
}

function buildHtml(services, tests) {
  const byCat = (cat) => services.filter((s) => s.category === cat);
  const counts = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, byCat(c).length]));
  const description = `${services.length} ${DESCRIPTION_BASE}`;
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Service Hub',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, Windows, macOS, Linux',
    description,
    url: SITE_URL,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
  });

  const card = (s) => `
        <article class="card">
          <span class="chip" aria-hidden="true">${esc(s.icon)}</span>
          <div class="card-body">
            <h3>${esc(s.label)}</h3>
            <p>${esc(s.description)}</p>
          </div>
        </article>`;

  const section = (cat) => `
      <section class="cat" aria-labelledby="cat-${cat}">
        <h2 id="cat-${cat}">${esc(CATEGORY_LABEL[cat])} <span class="count">${counts[cat]}</span></h2>
        <div class="grid">${byCat(cat).map(card).join('')}</div>
      </section>`;

  const year = new Date().getFullYear();

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Service Hub — 業務支援ダッシュボード</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index,follow">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0f1117">
<link rel="canonical" href="${SITE_URL}">
<link rel="icon" href="${faviconDataUri()}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Service Hub">
<meta property="og:title" content="Service Hub — 業務支援ダッシュボード">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE_URL}">
<meta property="og:image" content="${OG_IMAGE}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Service Hub — 業務支援ダッシュボード">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<script type="application/ld+json">${jsonLd}</script>
<style>
  :root {
    --bg: #0f1117; --elev: #171a22; --elev2: #1e222c; --border: #2a2f3a;
    --text: #e6e8ee; --mute: #99a0ad; --accent: #4f7cff; --accent-2: #22c55e;
    --radius: 12px; --maxw: 1100px;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Kaku Gothic ProN",
      "Noto Sans JP", Meiryo, sans-serif; line-height: 1.6; -webkit-font-smoothing: antialiased;
  }
  a { color: var(--accent); text-decoration: none; }
  .wrap { max-width: var(--maxw); margin: 0 auto; padding: 0 20px; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }

  /* a11y: キーボードで本文へ飛べるスキップリンク */
  .skip-link {
    position: absolute; left: 8px; top: -48px; background: var(--accent); color: #fff;
    padding: 10px 16px; border-radius: 8px; font-weight: 700; z-index: 100; transition: top .15s;
  }
  .skip-link:focus { top: 8px; }

  /* hero */
  header.hero {
    background: radial-gradient(1200px 400px at 50% -100px, rgba(79,124,255,0.18), transparent 70%);
    padding: 72px 0 48px; text-align: center; border-bottom: 1px solid var(--border);
  }
  .logo { font-size: 13px; letter-spacing: 3px; color: var(--mute); text-transform: uppercase; font-weight: 700; }
  h1 { font-size: clamp(34px, 6vw, 56px); margin: 12px 0 8px; line-height: 1.1; }
  .tagline { color: var(--mute); font-size: clamp(15px, 2.5vw, 19px); max-width: 680px; margin: 0 auto 28px; }
  .cta { display: inline-flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
  .btn {
    display: inline-flex; align-items: center; gap: 8px; padding: 12px 22px; border-radius: 10px;
    font-weight: 700; font-size: 15px; border: 1px solid transparent; cursor: pointer;
  }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { filter: brightness(1.08); }
  .btn-ghost { background: transparent; border-color: var(--border); color: var(--text); }
  .btn-ghost:hover { background: var(--elev); }

  /* metrics */
  .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: -28px auto 0; position: relative; }
  .metric { background: var(--elev); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 16px; text-align: center; }
  .metric .num { font-size: 28px; font-weight: 800; color: #fff; }
  .metric .lbl { font-size: 12px; color: var(--mute); margin-top: 2px; }

  /* categories */
  main { padding: 48px 0 24px; }
  .cat { margin-bottom: 40px; }
  .cat h2 { font-size: 20px; margin: 0 0 16px; display: flex; align-items: center; gap: 10px; }
  .cat h2 .count {
    font-size: 12px; font-weight: 700; color: var(--mute); background: var(--elev2);
    border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px;
  }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .card {
    display: flex; gap: 12px; background: var(--elev); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 14px; transition: border-color .15s, transform .15s;
  }
  .card:hover { border-color: var(--accent); transform: translateY(-2px); }
  .chip {
    flex: 0 0 auto; width: 40px; height: 40px; display: grid; place-items: center;
    background: var(--elev2); border: 1px solid var(--border); border-radius: 10px;
    font-weight: 800; font-size: 13px; color: var(--accent); letter-spacing: .5px;
  }
  .card-body h3 { margin: 0 0 3px; font-size: 15px; }
  .card-body p { margin: 0; font-size: 12.5px; color: var(--mute); }

  /* features */
  .features { background: var(--elev); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 40px 0; }
  .features h2 { text-align: center; font-size: 22px; margin: 0 0 24px; }
  .fgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
  .feat h3 { font-size: 15px; margin: 0 0 4px; }
  .feat p { font-size: 13px; color: var(--mute); margin: 0; }

  footer { padding: 32px 0 48px; text-align: center; color: var(--mute); font-size: 13px; }
  footer a { margin: 0 8px; }
  .note { font-size: 11.5px; opacity: .8; margin-top: 12px; }

  @media (max-width: 640px) { .metrics { grid-template-columns: repeat(2, 1fr); } }

  /* a11y: モーション低減設定を尊重 */
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    *, *::before, *::after { transition: none !important; animation: none !important; }
    .card:hover { transform: none; }
  }
</style>
</head>
<body>
  <a class="skip-link" href="#main">本文へスキップ</a>
  <header class="hero">
    <div class="wrap">
      <div class="logo">Service Hub</div>
      <h1>業務を、ひとつの画面に。</h1>
      <p class="tagline">${esc(services.length)} のサービス（SaaS 連携・分析ツール・士業・業務操作）を統合した業務支援ダッシュボード。Electron デスクトップ版とブラウザ単体 HTML 版、どちらでも動きます。</p>
      <nav class="cta" aria-label="主要アクション">
        <a class="btn btn-primary" href="./app.html">▶ フル版をブラウザで開く</a>
        <a class="btn btn-ghost" href="${REPO_URL}" target="_blank" rel="noopener">GitHub で見る</a>
      </nav>
    </div>
  </header>

  <div class="wrap">
    <div class="metrics">
      <div class="metric"><div class="num">${services.length}</div><div class="lbl">サービス</div></div>
      <div class="metric"><div class="num">${tests}</div><div class="lbl">ユニットテスト</div></div>
      <div class="metric"><div class="num">100%</div><div class="lbl">Mutation スコア</div></div>
      <div class="metric"><div class="num">2</div><div class="lbl">実行形態</div></div>
    </div>
  </div>

  <main class="wrap" id="main">
${CATEGORY_ORDER.map(section).join('')}
  </main>

  <div class="features">
    <div class="wrap">
      <h2>仕組み</h2>
      <div class="fgrid">
        <div class="feat"><h3>🔐 Credential Vault</h3><p>API トークンを AES-GCM-256 + PBKDF2 (60 万回) で暗号化保管。鍵はメモリのみ・非抽出。</p></div>
        <div class="feat"><h3>🗂 In-app Library</h3><p>生成物 (HTML/MD/SVG/PNG) を IndexedDB に保管。プレビュー・再 DL・Canva 送信。</p></div>
        <div class="feat"><h3>🔑 PKCE OAuth</h3><p>Google 系はループバック認可コードフロー。ブラウザ版は out-of-band paste。</p></div>
        <div class="feat"><h3>🛡 自動ロック</h3><p>非表示 5 分 / 無操作 15 分で自動ロック。再パスワードで復号。</p></div>
        <div class="feat"><h3>🌐 BYO Proxy</h3><p>CORS ブロックされる API を自前 Cloudflare Worker 経由で取得 (SSRF ガード付き)。</p></div>
        <div class="feat"><h3>🖥 2 形態 1 コード</h3><p>同一コードから Electron デスクトップとブラウザ単体 HTML を生成。</p></div>
      </div>
    </div>
  </div>

  <footer>
    <div class="wrap">
      <nav aria-label="フッターリンク">
        <a href="./app.html">フル版を開く</a> ·
        <a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a> ·
        <a href="${REPO_URL}/blob/main/docs/ARCHITECTURE.md" target="_blank" rel="noopener">アーキテクチャ</a>
      </nav>
      <p class="note">※ 各サービスの数値は説明用のスナップショットです。実データはフル版でトークンを設定すると取得できます（一部は Phase 6 以降で実 API 接続）。</p>
      <p class="note">© ${year} Service Hub</p>
    </div>
  </footer>
</body>
</html>
`;
}

/** 生成 HTML の自己検証 — 回帰を即ビルド失敗にする。 */
function selfCheck(html, services, canonicalCount) {
  // 1. parse 件数が正典 (SERVICE_IDS) と一致するか
  if (services.length !== canonicalCount) {
    throw new Error(
      `service parse mismatch: services.ts から ${services.length} 件 parse したが ` +
        `serviceId.ts の SERVICE_IDS は ${canonicalCount} 件。正規表現の取りこぼしの可能性。`,
    );
  }
  // 2. カードが全サービス分描画されたか
  const cards = (html.match(/class="card"/g) || []).length;
  if (cards !== services.length) {
    throw new Error(`card count ${cards} != services ${services.length}`);
  }
  // 3. レンダリングが外部リソースに依存していないか (script/stylesheet)
  const external = (html.match(/src=["']https?:|<link[^>]+rel=["']stylesheet/gi) || []).length;
  if (external > 0) {
    throw new Error(`landing must be self-contained but has ${external} external script/stylesheet ref(s)`);
  }
}

function main() {
  const services = parseServices();
  const canonicalCount = countCanonicalServices();
  const tests = countTests();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  const html = buildHtml(services, tests);
  selfCheck(html, services, canonicalCount);
  fs.writeFileSync(OUT, html);
  fs.writeFileSync(path.join(ROOT, 'dist/og.svg'), buildOgSvg(services));

  console.log(
    `Wrote ${OUT} (${(html.length / 1024).toFixed(1)} KB) — ${services.length}/${canonicalCount} services, ${tests} tests`,
  );
}

main();
