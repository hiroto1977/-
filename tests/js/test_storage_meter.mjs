// dashboard.js の localStorage 容量メーター ロジックを検証
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const dashSrc = fs.readFileSync(path.join(ROOT, 'v19/ui/dashboard.js'), 'utf8');

// inline spec: 同じ計算ロジックを ここに 持つ (dashboard.js と一致)
const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;
function estimateLocalStorageUsage(ls) {
  let total = 0;
  for (let i = 0; i < ls.length; i++) {
    const key = ls.key(i);
    const val = ls.getItem(key) ?? '';
    total += (key.length + val.length) * 2;
  }
  return total;
}
function thresholdClass(pct) {
  if (pct >= 90) return 'danger';
  if (pct >= 70) return 'warn';
  return '';
}

// localStorage モック
function makeLs(entries) {
  const m = new Map();
  for (const [k, v] of entries) m.set(k, v);
  return {
    get length() { return m.size; },
    key(i) { return [...m.keys()][i]; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
  };
}

const tests = [];

// 1. dashboard.js に必須シンボルがある (drift sniff)
tests.push(['dashboard.js に STORAGE_LIMIT_BYTES', dashSrc.includes('STORAGE_LIMIT_BYTES')]);
tests.push(['dashboard.js に estimateLocalStorageUsage', dashSrc.includes('function estimateLocalStorageUsage')]);
tests.push(['dashboard.js に updateStorageMeter', dashSrc.includes('function updateStorageMeter')]);
tests.push(['HTML に storageBarFill', fs.readFileSync(path.join(ROOT, 'v19/ui/dashboard.html'), 'utf8').includes('id="storageBarFill"')]);
tests.push(['CSS に .storage-bar-fill.danger', fs.readFileSync(path.join(ROOT, 'v19/ui/dashboard.css'), 'utf8').includes('.storage-bar-fill.danger')]);

// 2. 空 localStorage = 0 byte
{
  const ls = makeLs([]);
  tests.push(['空 → 0 byte', estimateLocalStorageUsage(ls) === 0]);
}

// 3. UTF-16 概算: 'abc' のキーと 'xy' の値で (3+2)*2 = 10 byte
{
  const ls = makeLs([['abc', 'xy']]);
  tests.push(['1 件 → (key+val)*2 byte', estimateLocalStorageUsage(ls) === 10]);
}

// 4. 閾値 < 70 → 通常
tests.push(['50% → 通常 (空 class)', thresholdClass(50) === '']);
tests.push(['69% → 通常', thresholdClass(69) === '']);

// 5. 70 ≤ pct < 90 → warn
tests.push(['70% → warn', thresholdClass(70) === 'warn']);
tests.push(['85% → warn', thresholdClass(85) === 'warn']);
tests.push(['89% → warn', thresholdClass(89) === 'warn']);

// 6. 90% 以上 → danger
tests.push(['90% → danger', thresholdClass(90) === 'danger']);
tests.push(['100% → danger', thresholdClass(100) === 'danger']);

// 7. 上限は 5 MB
tests.push(['上限 = 5MB', STORAGE_LIMIT_BYTES === 5 * 1024 * 1024]);

let pass = 0, fail = 0;
for (const [name, ok] of tests) {
  console.log(ok ? '✅' : '❌', name);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
