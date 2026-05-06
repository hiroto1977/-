// SW のバージョン管理ロジックを検証
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const SW = fs.readFileSync(path.join(ROOT, 'desktop/sw.js'), 'utf8');

const tests = [];

// 1. CACHE_VERSION 定数がある (drift sniff)
tests.push(['CACHE_VERSION 定数あり', /CACHE_VERSION\s*=\s*['"]/.test(SW)]);

// 2. CACHE 名が CACHE_VERSION を使う
tests.push(['CACHE が CACHE_VERSION を使う', SW.includes('minna-desktop-${CACHE_VERSION}')]);

// 3. activate で 旧キャッシュを削除する prefix-match ロジック
tests.push(['activate に prefix match', SW.includes("startsWith('minna-desktop-')")]);
tests.push(['現バージョン以外を削除', SW.includes('k !== CACHE')]);

// 4. SKIP_WAITING メッセージ ハンドラ
tests.push(['message: SKIP_WAITING', SW.includes("'SKIP_WAITING'") && SW.includes('skipWaiting')]);

// 5. fetch ハンドラはまだ動く
tests.push(['fetch handler 残存', SW.includes("addEventListener('fetch'")]);
tests.push(['caches.match を使用 (オフライン fallback)', SW.includes('caches.match')]);

// v39 (PDCA #28): stale-while-revalidate 戦略
tests.push(['SWR: staleWhileRevalidate 関数あり', /function\s+staleWhileRevalidate/.test(SW)]);
tests.push(['SWR: cached || networkPromise の即時返却',
  /cached\s*\|\|\s*networkPromise/.test(SW)]);
tests.push(['SWR: ナビゲーション fallback (index.html)',
  SW.includes("caches.match('./index.html')") || SW.includes('navigationFallback')]);
tests.push(['SWR: cross-origin は介入なし',
  /url\.origin\s*!==\s*location\.origin/.test(SW)]);
tests.push(['CACHE_VERSION が v3 以降 (改善後)',
  /CACHE_VERSION\s*=\s*['"]v[3-9]['"]/.test(SW)
  || /CACHE_VERSION\s*=\s*['"]v\d{2,}['"]/.test(SW)]);
tests.push(['SWR: req.method !== GET なら return (POST 等を skip)',
  /req\.method\s*!==\s*['"]GET['"]/.test(SW)]);

let pass = 0, fail = 0;
for (const [name, ok] of tests) {
  console.log(ok ? '✅' : '❌', name);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
