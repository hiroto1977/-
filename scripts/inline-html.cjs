// Inline all CSS + JS into dist/index.html → produces dist/standalone.html
// that opens directly in any browser via file:// (no server needed).
//
// Usage: node scripts/inline-html.cjs

const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist');
const inHtml = path.join(DIST, 'index.html');
const outHtml = path.join(DIST, 'standalone.html');

let html = fs.readFileSync(inHtml, 'utf8');

// 1. Inline external CSS: <link rel="stylesheet" href="./assets/foo.css">
html = html.replace(/<link\s+rel="stylesheet"[^>]*href="\.?\/?(assets\/[^"]+)"[^>]*\/?>/g, (_, rel) => {
  const css = fs.readFileSync(path.join(DIST, rel), 'utf8');
  return '<style>\n' + css + '\n</style>';
});

// 2. Inline external JS: <script type="module" crossorigin src="./assets/bar.js"></script>
html = html.replace(/<script\s+[^>]*src="\.?\/?(assets\/[^"]+)"[^>]*><\/script>/g, (_, rel) => {
  const js = fs.readFileSync(path.join(DIST, rel), 'utf8');
  // type="module" lets us use ES module imports if any, but Vite's bundled
  // output is a single IIFE — either works. Keep module for safety.
  return '<script type="module">\n' + js + '\n</script>';
});

// 3. Strip any prefetch/preload modulepreload (they would 404 over file://).
html = html.replace(/<link\s+rel="modulepreload"[^>]*>/g, '');

// 4. Replace the Electron-oriented CSP with one suitable for the
//    standalone single-file HTML. The original CSP uses `script-src 'self'`
//    which blocks our inlined <script>; relax to allow inline + data URIs
//    for the previews. No remote network calls are made by the web shim,
//    so this is still tight in practice.
html = html.replace(
  /<meta\s+http-equiv="Content-Security-Policy"[^>]*>/,
  '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob: https:; connect-src \'none\'; object-src \'none\'; frame-src \'none\'; base-uri \'self\'; form-action \'none\'">',
);

fs.writeFileSync(outHtml, html);
console.log('Wrote', outHtml, '(' + Math.round(fs.statSync(outHtml).size / 1024) + ' KB)');
