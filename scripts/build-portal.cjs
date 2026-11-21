#!/usr/bin/env node
'use strict';

/**
 * 社外向けポータルの単一 HTML を組む (2026-11-11)。
 *
 *   node scripts/build-portal.cjs partner            → dist/portal-partner.html
 *   node scripts/build-portal.cjs customer           → dist/portal-customer.html
 *   node scripts/build-portal.cjs partner customer   → 両方
 *
 * 社内版 (`npm run build:web` → dist/standalone.html) とは**入口が別**である:
 * `src/renderer/portal-<名前>.html` → `src/renderer/portal/<名前>Main.tsx`。入口が取り込むのは、台帳
 * `src/shared/portal.mamori` に名指しした画面だけ —— 社内版の入口 (main.tsx)・橋 (web-shim.ts)・保管庫・
 * 外部サービスへの経路は束に入らない (取り込みの閉包は
 * `src/renderer/portal/__tests__/portalBundleClosure.test.ts` が毎回の npm test で数える)。
 *
 * ## 社内版のビルドと混ぜない理由
 *
 * - `vite.config.ts` は Electron の主プロセスと preload も組む。ポータルには要らない。
 * - 社内版の vite build は `dist/` を掃除する (`emptyOutDir`)。ここは**一時の出力先**へ組んでから
 *   仕上がった 1 ファイルだけを `dist/` へ置くので、`dist/standalone.html` を消さない
 *   (逆に、社内版を組み直すとポータルの HTML は消える —— ポータルは社内版の後に組む)。
 *
 * ## CSP は社内版より狭い
 *
 * ポータルは網へ出ない (`connect-src 'none'`)。スクリプトは畳み込んだ 1 本のハッシュだけ、Worker も枠も無し。
 * 畳み込みと「スクリプトのハッシュが CSP に載っているか」の確認は `scripts/inline-html.cjs` の関数を借りる
 * (同じ規則を 2 度書かない)。
 *
 * ## 組んだ物の確認 (selfCheck)
 *
 * 仕上がった HTML に、社内版だけが持つ文面 (保管庫・社内版の橋・設定画面・AI へ送る経路) が 1 つも無いことを
 * 見てから書く。見つかれば書かずに落ちる。針が的に当たること (その文面が実際にその社内のモジュールに在ること) は
 * 上の検査が原文で確かめる。
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inlineStandalone, inlineScriptSources, cspHash, assertPinnedScripts } = require('./inline-html.cjs');

const ROOT = path.join(__dirname, '..');
const RENDERER = path.join(ROOT, 'src', 'renderer');
const DIST = path.join(ROOT, 'dist');

/** 組めるポータル。名前は雛形 `portal-<名前>.html` と出力 `dist/portal-<名前>.html` に使う。 */
const PORTAL_NAMES = ['partner', 'customer'];

const CSP_META_TAG = /<meta\s+http-equiv="Content-Security-Policy"[^>]*>/;

/**
 * 社内版だけが持つ文面。配る HTML に 1 つでも在れば、社内のモジュールが束に入っている。
 * `module` はその文面を持つ社内のモジュール (検査が原文で確かめる)。
 */
const INTERNAL_MARKERS = [
  { marker: 'ブラウザ版では live fetch を行いません', module: 'src/renderer/web-shim.ts' },
  { marker: 'Vault がロックされています', module: 'src/renderer/security/vault.ts' },
  { marker: 'すべてのデータを削除', module: 'src/renderer/pages/SettingsPage.tsx' },
  { marker: 'がテキスト応答を返しませんでした', module: 'src/shared/ai/chat.ts' },
  { marker: 'サービスを検索', module: 'src/renderer/App.tsx' },
];

/** ポータルの CSP。網へ出ない・スクリプトは畳み込んだ物だけ。 */
function buildPortalCsp(scriptHashes) {
  if (scriptHashes.length === 0) {
    throw new Error('build-portal: インラインスクリプトが 0 件 — script-src を空にできない');
  }
  const policy = [
    "default-src 'none'",
    `script-src ${scriptHashes.join(' ')}`,
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    "connect-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
}

/** 畳み込んだ HTML の CSP を、ポータルの CSP へ置き換える。 */
function applyPortalCsp(html) {
  if (!CSP_META_TAG.test(html)) throw new Error('build-portal: CSP メタタグが見つかりません');
  const out = html.replace(CSP_META_TAG, () => buildPortalCsp(inlineScriptSources(html).map(cspHash)));
  assertPinnedScripts(out);
  return out;
}

/** 仕上がった HTML の確認。問題の一覧を返す (空なら良い)。 */
function selfCheck(html) {
  const problems = [];
  if (/<script\s+[^>]*src=/i.test(html)) problems.push('外のスクリプトを読む <script src> が残っている');
  if (/<link\s+[^>]*rel="stylesheet"/i.test(html)) problems.push('外のスタイルシートを読む <link> が残っている');
  if (!html.includes("connect-src 'none'")) problems.push("CSP が connect-src 'none' を持たない");
  if (html.length < 50_000) problems.push(`HTML が小さすぎる (${html.length} 字) — 画面が束に入っていない`);
  for (const { marker, module: mod } of INTERNAL_MARKERS) {
    if (html.includes(marker)) problems.push(`社内版だけの文面「${marker}」が入っている (${mod} が束に入った)`);
  }
  return problems;
}

async function buildOne(name) {
  if (!PORTAL_NAMES.includes(name)) {
    throw new Error(`build-portal: 知らないポータル「${name}」 (組めるのは ${PORTAL_NAMES.join(' / ')})`);
  }
  const input = path.join(RENDERER, `portal-${name}.html`);
  if (!fs.existsSync(input)) throw new Error(`build-portal: 雛形が無い: ${input}`);
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `service-hub-portal-${name}-`));
  try {
    const { build } = await import('vite');
    const react = (await import('@vitejs/plugin-react')).default;
    await build({
      configFile: false,
      root: RENDERER,
      logLevel: 'warn',
      plugins: [react()],
      // PostCSS の設定は空に固定する (vite.config.ts と同じ理由 —— 直下の設定ファイルを探して走らせない)。
      css: { postcss: {} },
      build: {
        outDir,
        emptyOutDir: true,
        rollupOptions: { input },
      },
    });
    const built = path.join(outDir, `portal-${name}.html`);
    const inlined = inlineStandalone(fs.readFileSync(built, 'utf8'), (rel) =>
      fs.readFileSync(path.join(outDir, rel), 'utf8'),
    );
    const html = applyPortalCsp(inlined);
    const problems = selfCheck(html);
    if (problems.length > 0) {
      throw new Error(`build-portal: ${name} の HTML を書きません:\n  - ${problems.join('\n  - ')}`);
    }
    fs.mkdirSync(DIST, { recursive: true });
    const out = path.join(DIST, `portal-${name}.html`);
    fs.writeFileSync(out, html);
    console.log('Wrote', out, '(' + Math.round(fs.statSync(out).size / 1024) + ' KB)');
    return out;
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

async function main(argv) {
  const names = argv.length > 0 ? argv : PORTAL_NAMES;
  for (const name of names) await buildOne(name);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

module.exports = { PORTAL_NAMES, INTERNAL_MARKERS, buildPortalCsp, applyPortalCsp, selfCheck, buildOne };
