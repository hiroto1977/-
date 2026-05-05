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
tests.push(['cache-first 戦略', SW.includes('caches.match')]);

let pass = 0, fail = 0;
for (const [name, ok] of tests) {
  console.log(ok ? '✅' : '❌', name);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
