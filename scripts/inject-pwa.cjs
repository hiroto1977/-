#!/usr/bin/env node
'use strict';

/*
 * PWA タグ注入 — GitHub Pages デプロイ時に HTML へ PWA メタを差し込む。
 *
 * 標準の単一ファイル standalone.html (デスクトップ/配布物) は変更せず、Pages の
 * `_site/*.html` にだけ manifest / theme-color / apple-touch-icon / Service Worker 登録を
 * 注入する。これにより「ホーム画面に追加」(PWA インストール) が公開サイトで有効になる。
 *
 * 純関数 injectPwaTags(html) を中核に持ち (冪等)、CLI 部はファイル入出力と自己検証のみ。
 *
 * 使い方: node scripts/inject-pwa.cjs _site/index.html _site/app.html
 */

const fs = require('node:fs');

const PWA_HEAD_TAGS = [
  '<link rel="manifest" href="./manifest.webmanifest">',
  '<meta name="theme-color" content="#0e0f13">',
  '<link rel="apple-touch-icon" href="./icon.svg">',
  "<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('./sw.js').catch(function(){})});}</script>",
].join('');

/** HTML の </head> 直前に PWA タグを冪等に注入する (既に注入済みなら無変更)。 */
function injectPwaTags(html) {
  if (html.includes('rel="manifest"')) return html;
  const idx = html.indexOf('</head>');
  if (idx === -1) throw new Error('inject-pwa: <head> が見つかりません');
  return `${html.slice(0, idx)}${PWA_HEAD_TAGS}${html.slice(idx)}`;
}

function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('usage: node scripts/inject-pwa.cjs <html...>');
    process.exit(1);
  }
  for (const file of files) {
    const before = fs.readFileSync(file, 'utf8');
    const after = injectPwaTags(before);
    fs.writeFileSync(file, after);
    if (!after.includes('rel="manifest"')) {
      console.error(`inject-pwa: 注入に失敗 (${file})`);
      process.exit(1);
    }
    console.log(`inject-pwa: ${file} に PWA タグを注入${before === after ? ' (既存・無変更)' : ''}`);
  }
}

if (require.main === module) main();

module.exports = { injectPwaTags, PWA_HEAD_TAGS };
