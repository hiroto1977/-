// Inline all CSS + JS into dist/index.html → produces dist/standalone.html
// that opens directly in any browser via file:// (no server needed).
//
// Usage: node scripts/inline-html.cjs
//
// All logic lives in pure functions (inlineStandalone / inlineScriptSources /
// cspHash / buildCsp); the CLI part only does file I/O. Tests load this CJS
// directly via createRequire — see src/shared/__tests__/inlineHtml.test.ts.

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist');
const inHtml = path.join(DIST, 'index.html');
const outHtml = path.join(DIST, 'standalone.html');

// The tags Vite emits into dist/index.html. Both script passes below share this
// one global regex on purpose: `matchAll` species-constructs its own copy and
// `String.prototype.replace` resets `lastIndex`, so no state leaks between passes.
const SCRIPT_SRC_TAG = /<script\s+[^>]*src="\.?\/?(assets\/[^"]+)"[^>]*><\/script>/g;
const STYLESHEET_TAG = /<link\s+rel="stylesheet"[^>]*href="\.?\/?(assets\/[^"]+)"[^>]*\/?>/g;
const MODULEPRELOAD_TAG = /<link\s+rel="modulepreload"[^>]*>/g;
const CSP_META_TAG = /<meta\s+http-equiv="Content-Security-Policy"[^>]*>/;

const SCRIPT_CLOSE = '</script>';

/**
 * The exact text the browser will see as the <script> element's child text —
 * i.e. what it hashes for CSP. The wrapping newlines ARE part of it: unlike
 * <pre> / <textarea>, a newline right after `<script>` is NOT dropped by the
 * parser, so it must be hashed too.
 *
 * CRLF / lone CR are normalized to LF because the HTML input stream does that
 * *before* the tokenizer runs — the DOM text (and therefore the browser's hash)
 * is always LF-only. Writing the same normalized bytes we hash keeps the two in
 * sync; without it a CRLF checkout or CRLF-emitting toolchain would ship a hash
 * that can never match, and the browser would silently refuse the whole ~10 MB
 * bundle (blank page, no visible error except a console violation).
 */
function scriptSourceFor(js) {
  return `\n${js.replace(/\r\n?/g, '\n')}\n`;
}

/** CSP source expression pinning one inline script: `'sha256-<base64>'`. */
function cspHash(scriptSource) {
  // update(str, 'utf8') hashes the UTF-8 bytes — the bundle is ~6.2M chars but
  // ~10.4 MB of UTF-8 (Japanese knowledge corpus), and the browser hashes bytes.
  return `'sha256-${crypto.createHash('sha256').update(scriptSource, 'utf8').digest('base64')}'`;
}

/** A <script> whose type makes it executable (so CSP script-src applies to it). */
function isExecutableScriptTag(tag) {
  const m = /\stype\s*=\s*"([^"]*)"/i.exec(tag);
  if (!m) return true; // no type → classic script
  const type = m[1].trim().toLowerCase();
  // `application/ld+json` & friends are data blocks: never executed, never hashed.
  return type === '' || type === 'module' || /javascript|ecmascript/.test(type);
}

/**
 * Child text of every *inline* executable <script>, scanned the way the HTML
 * tokenizer does it: after a start tag the parser enters script-data state and
 * everything up to the FIRST `</script>` is text, so the scan must resume after
 * that closing tag.
 *
 * A naive "find every `<script`" would match strings *inside* the bundle — it
 * carries `'<script'` as data (securityRange.ts XSS payloads) — and hash a
 * bogus region. Same class of trap as the 2026-07-24 Pages incident, where a
 * plain indexOf('</head>') spliced tags into the middle of the bundle.
 */
function inlineScriptSources(html) {
  const out = [];
  let i = 0;
  for (;;) {
    const open = html.indexOf('<script', i);
    if (open === -1) return out;
    const tagEnd = html.indexOf('>', open);
    if (tagEnd === -1) return out;
    const close = html.indexOf(SCRIPT_CLOSE, tagEnd);
    if (close === -1) return out;
    const tag = html.slice(open, tagEnd + 1);
    if (!/\ssrc\s*=/i.test(tag) && isExecutableScriptTag(tag)) {
      out.push(html.slice(tagEnd + 1, close));
    }
    i = close + SCRIPT_CLOSE.length;
  }
}

/**
 * The standalone CSP. Only `script-src` differs from the previous policy.
 *
 * script-src = sha256 ハッシュのアローリスト。以前は 'unsafe-inline' で、これは
 * 「自分のバンドル」だけでなく **注入された任意の inline <script>** も同じ許可で
 * 実行できることを意味していた (2026-07 監査)。バイト単位で一致するスクリプトのみ
 * 許可すれば、万一インジェクション点が生まれてもブラウザ側で実行を止められる。
 * 'unsafe-inline' は併記しない: ハッシュが 1 つでもあると CSP2 以降のブラウザは
 * 'unsafe-inline' を無視するため併記は無意味で、ハッシュ非対応の旧ブラウザにだけ
 * 「全 inline 許可」の抜け穴を残すだけになる。
 *
 * worker-src 'self': 未指定だと worker-src は script-src (= ハッシュのみ) へ
 * フォールバックし、Pages 版が自分の Service Worker を登録できなくなる
 * (2026-07 監査 R2-8: 以前これで PWA のオフライン/インストールが黙って無効だった)。
 * ハッシュ化で script-src がさらに狭まるぶん、この行の重要性は増している。
 *
 * connect-src: the web shim DOES make remote calls — AI エージェント
 * (api.anthropic.com / api.openai.com / generativelanguage.googleapis.com /
 * ユーザー指定の互換 API), GitHub 直接呼び出し, そして BYO プロキシ
 * (ユーザー運用の Cloudflare Worker, 任意ドメイン)。プロキシ・互換 API の
 * ホストは実行時にユーザーが設定するため個別列挙はできず、https: 全体 +
 * ローカル (Ollama / LM Studio / LiteLLM) を許可する。トークンは Vault
 * (AES-GCM) 管理・送信先はコード上のアローリスト & SSRF ガードで統制。
 */
function buildCsp(scriptHashes) {
  if (scriptHashes.length === 0) {
    // An empty `script-src` directive blocks *all* scripts, so a build that
    // inlined nothing must fail here instead of shipping a dead page.
    throw new Error('inline-html: インラインスクリプトが 0 件 — script-src を空にできない');
  }
  const policy = [
    "default-src 'self'",
    `script-src ${scriptHashes.join(' ')}`,
    "worker-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
}

/**
 * Last line of defence: re-derive the hashes from the finished document exactly
 * as the browser will parse it, and assert every one of them is pinned in the
 * CSP. This is what catches the silent killers — a stray whitespace change
 * around the script text, or a bundle that starts carrying a literal
 * `</script>` (which would end the element early and change what gets hashed).
 */
function assertPinnedScripts(html) {
  const meta = CSP_META_TAG.exec(html);
  if (!meta) throw new Error('inline-html: CSP メタタグが見当たりません');
  const sources = inlineScriptSources(html);
  if (sources.length === 0) throw new Error('inline-html: インラインスクリプトが 0 件');
  for (const source of sources) {
    const hash = cspHash(source);
    if (!meta[0].includes(hash)) {
      throw new Error(`inline-html: inline script が CSP に未ピン留め (${hash}) — 実行されません`);
    }
  }
}

/**
 * dist/index.html → standalone HTML.
 *
 * `readAsset(relPath)` returns the text of `dist/<relPath>` (injected so tests
 * run without a real build). Order matters: every regex runs while the document
 * is still ~2 KB, and the multi-MB bundle is spliced in LAST — no pattern is
 * ever matched against bundle text, which is where past incidents came from.
 */
function inlineStandalone(html, readAsset) {
  // 1. Inline external CSS: <link rel="stylesheet" href="./assets/foo.css">
  html = html.replace(STYLESHEET_TAG, (_, rel) => `<style>\n${readAsset(rel)}\n</style>`);

  // 2. Strip any prefetch/preload modulepreload (they would 404 over file://).
  html = html.replace(MODULEPRELOAD_TAG, '');

  // 3. Read the JS that step 5 will inline, and pin its hash. Hashing the very
  //    string we are about to write out is what keeps hash and bytes identical.
  const sources = [...html.matchAll(SCRIPT_SRC_TAG)].map((m) => scriptSourceFor(readAsset(m[1])));

  // 4. Replace the Electron-oriented CSP (script-src 'self', connect-src for the
  //    dev server) with the standalone one, now pinned to those hashes.
  if (!CSP_META_TAG.test(html)) throw new Error('inline-html: CSP メタタグが見つかりません');
  html = html.replace(CSP_META_TAG, () => buildCsp(sources.map(cspHash)));

  // 5. Inline external JS: <script type="module" crossorigin src="./assets/bar.js">
  //    type="module" lets us use ES module imports if any, but Vite's bundled
  //    output is a single IIFE — either works. Keep module for safety.
  //    (Function replacers throughout: `replace(str, str)` would interpret `$&`
  //    and friends inside the bundle. 2026-07 監査 R2-13 と同型の罠。)
  let next = 0;
  html = html.replace(SCRIPT_SRC_TAG, () => `<script type="module">${sources[next++]}${SCRIPT_CLOSE}`);

  assertPinnedScripts(html);
  return html;
}

function main() {
  const html = inlineStandalone(fs.readFileSync(inHtml, 'utf8'), (rel) =>
    fs.readFileSync(path.join(DIST, rel), 'utf8'),
  );
  fs.writeFileSync(outHtml, html);
  console.log('Wrote', outHtml, '(' + Math.round(fs.statSync(outHtml).size / 1024) + ' KB)');
}

if (require.main === module) main();

module.exports = {
  inlineStandalone,
  inlineScriptSources,
  isExecutableScriptTag,
  scriptSourceFor,
  cspHash,
  buildCsp,
  assertPinnedScripts,
};
