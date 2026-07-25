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

/**
 * 実際の </head> 終了タグの位置を返す。
 *
 * standalone.html は数 MB の JS バンドルを <head> 内にインライン化しており、その中の
 * テンプレート文字列 (Stocks/事業ダッシュボードの HTML エクスポート等) に文字列としての
 * "</head>" が含まれる。単純な indexOf だとバンドル内の文字列にヒットし、PWA タグ
 * (実 </script> を含む) を JS の真ん中へ splice してモジュールスクリプトを破壊する
 * (2026-07-24 の Pages 障害: アプリが「大量のコード表示」になる)。
 *
 * 公開対象の HTML はすべてスクリプトを <head> 内にのみ持つため、「最後の </script>
 * より後にある最初の </head>」が実タグ。スクリプトが無い HTML は最初の </head> でよい。
 */
function findRealHeadClose(html) {
  const lastScriptClose = html.lastIndexOf('</script>');
  return html.indexOf('</head>', lastScriptClose === -1 ? 0 : lastScriptClose);
}

/** <script type="module"> から直後の実 </script> までの領域 (注入で壊れていないかの検証用)。 */
function moduleScriptRegion(html) {
  const open = html.indexOf('<script type="module"');
  if (open === -1) return null;
  return html.slice(open, html.indexOf('</script>', open));
}

/** HTML の実 </head> 直前に PWA タグを冪等に注入する (既に注入済みなら無変更)。 */
function injectPwaTags(html) {
  if (html.includes('rel="manifest"')) return html;
  const idx = findRealHeadClose(html);
  if (idx === -1) throw new Error('inject-pwa: </head> が見つかりません');
  const out = `${html.slice(0, idx)}${PWA_HEAD_TAGS}${html.slice(idx)}`;
  if (moduleScriptRegion(out) !== moduleScriptRegion(html)) {
    throw new Error('inject-pwa: 注入がモジュールスクリプトを破壊しました (注入位置バグ)');
  }
  return out;
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

module.exports = { injectPwaTags, findRealHeadClose, moduleScriptRegion, PWA_HEAD_TAGS };
