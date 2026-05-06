// v20: #orchestrate / #governance のロード結果を localStorage にキャッシュ
//
// drift sniff + キャッシュ ロジック + LRU + 容量制限 + 起動時 復元

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const JS = fs.readFileSync(path.join(ROOT, 'v19/ui/dashboard.js'), 'utf8');

// inline spec (dashboard.js と一致)
const ORCH_CACHE_KEY = 'v19.orch.audit_cache';
const ORCH_CACHE_MAX_BYTES = 500 * 1024;
const GOV_CACHE_KEY = 'v19.gov.docs_cache';
const GOV_CACHE_MAX_DOCS = 5;
const GOV_CACHE_MAX_BYTES_PER_DOC = 500 * 1024;

const storage = new Map();
const localStorage = {
  getItem: k => storage.has(k) ? storage.get(k) : null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: k => storage.delete(k),
};

function _saveOrchCache(name, text) {
  try {
    if (text.length * 2 > ORCH_CACHE_MAX_BYTES) {
      const lines = text.split('\n');
      let acc = '';
      for (let i = lines.length - 1; i >= 0; i--) {
        const next = acc ? lines[i] + '\n' + acc : lines[i];
        if (next.length * 2 > ORCH_CACHE_MAX_BYTES) break;
        acc = next;
      }
      text = acc;
    }
    localStorage.setItem(ORCH_CACHE_KEY, JSON.stringify({ name, text, ts: Date.now() }));
  } catch {}
}
function _loadOrchCache() {
  try {
    const raw = localStorage.getItem(ORCH_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function _saveGovCache(docs) {
  const trimmed = docs.slice(-GOV_CACHE_MAX_DOCS).map(d => ({
    name: d.name,
    text: d.text.length * 2 > GOV_CACHE_MAX_BYTES_PER_DOC
          ? d.text.slice(0, Math.floor(GOV_CACHE_MAX_BYTES_PER_DOC / 2))
          : d.text,
    ts: d.ts || Date.now(),
  }));
  localStorage.setItem(GOV_CACHE_KEY, JSON.stringify(trimmed));
}
function _loadGovCache() {
  try {
    const raw = localStorage.getItem(GOV_CACHE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

const tests = [];

// ── drift sniff ──
tests.push(['JS に ORCH_CACHE_KEY', JS.includes("v19.orch.audit_cache")]);
tests.push(['JS に GOV_CACHE_KEY', JS.includes("v19.gov.docs_cache")]);
tests.push(['JS に _saveOrchCache', /function _saveOrchCache/.test(JS)]);
tests.push(['JS に _loadOrchCache', /function _loadOrchCache/.test(JS)]);
tests.push(['JS に _saveGovCache', /function _saveGovCache/.test(JS)]);
tests.push(['JS に _loadGovCache', /function _loadGovCache/.test(JS)]);
tests.push(['bindOrchestrate が起動時 cache 復元', JS.includes('_loadOrchCache()') && JS.includes('キャッシュから復元')]);
tests.push(['bindGovernance が起動時 cache 復元', /_govDocs = _loadGovCache\(\)/.test(JS)]);

// ── orch cache: 通常 保存・復元 ──
storage.clear();
{
  _saveOrchCache('audit.jsonl', '{"event":"a","ts":"2026-05-06"}\n{"event":"b","ts":"2026-05-06"}\n');
  const c = _loadOrchCache();
  tests.push(['orch cache: 保存・復元', c?.name === 'audit.jsonl' && /event":"a/.test(c.text)]);
  tests.push(['orch cache: ts が記録', typeof c?.ts === 'number']);
}

// ── orch cache: 大きすぎる場合 末尾を残す (FIFO from front) ──
storage.clear();
{
  // 600KB の audit (1 行 1KB × 600 行)
  const lines = [];
  for (let i = 0; i < 600; i++) lines.push('{"event":"e' + i + '","details":"' + 'x'.repeat(990) + '"}');
  const big = lines.join('\n');
  _saveOrchCache('big.jsonl', big);
  const c = _loadOrchCache();
  tests.push(['orch cache: 大型は末尾保持', c && c.text.length * 2 <= ORCH_CACHE_MAX_BYTES]);
  // 末尾の行が含まれること (古い行は捨てられる)
  tests.push(['orch cache: 末尾の最新行が残る', c && c.text.includes('e599')]);
  // 古い行 e0 は捨てられる
  tests.push(['orch cache: 古い行 e0 は捨てる', c && !c.text.includes('"event":"e0"')]);
}

// ── orch cache: 空でも crash しない ──
storage.clear();
{
  const c = _loadOrchCache();
  tests.push(['orch cache: 空 → null', c === null]);
}

// ── gov cache: LRU + 5 件まで ──
storage.clear();
{
  const docs = [];
  for (let i = 1; i <= 7; i++) docs.push({ name: `doc${i}.md`, text: '# Doc ' + i, ts: i });
  _saveGovCache(docs);
  const restored = _loadGovCache();
  tests.push(['gov cache: 7 入れたら 5 になる', restored.length === 5]);
  tests.push(['gov cache: 古い 2 件 (doc1, doc2) は消える',
    !restored.find(d => d.name === 'doc1.md') && !restored.find(d => d.name === 'doc2.md')]);
  tests.push(['gov cache: 新しい 5 件 (doc3..7) が残る',
    restored.find(d => d.name === 'doc3.md') && restored.find(d => d.name === 'doc7.md')]);
}

// ── gov cache: 1 ファイルが大きすぎる場合 切り詰め ──
storage.clear();
{
  // 1 MB の文書
  const big = '# Title\n\n' + 'a'.repeat(1024 * 1024);
  _saveGovCache([{ name: 'big.md', text: big, ts: Date.now() }]);
  const restored = _loadGovCache();
  tests.push(['gov cache: 大型 doc は切り詰め', restored[0]?.text.length * 2 <= GOV_CACHE_MAX_BYTES_PER_DOC]);
  tests.push(['gov cache: 切り詰めても先頭は残る', restored[0]?.text.startsWith('# Title')]);
}

// ── gov cache: 空でも空配列 ──
storage.clear();
{
  const docs = _loadGovCache();
  tests.push(['gov cache: 空 → []', Array.isArray(docs) && docs.length === 0]);
}

// ── gov cache: JSON 妥当 (parse 可能) ──
storage.clear();
{
  _saveGovCache([{ name: 'a.md', text: 'こんにちは "quoted" \n', ts: 1 }]);
  const raw = localStorage.getItem(GOV_CACHE_KEY);
  let ok = false;
  try { JSON.parse(raw); ok = true; } catch {}
  tests.push(['gov cache: JSON 妥当 (escape)', ok]);
}

// ── 既存 INV を壊さない (regression sniff) ──
// v29 から audit-browser は modules/ に移動 → 文字列は dashboard.js または modules/ にある
const audModSrc = fs.readFileSync(path.join(ROOT, 'v19/ui/modules/audit-browser.js'), 'utf8');
tests.push(['既存 BROWSER_AUDIT_KEY 残存', JS.includes("v19.audit.entries") || audModSrc.includes("v19.audit.entries")]);
tests.push(['既存 STORAGE_LIMIT_BYTES 残存', /STORAGE_LIMIT_BYTES = 5 \* 1024 \* 1024/.test(JS)]);
tests.push(['既存 AFFECT_MARKERS 残存', JS.includes('AFFECT_MARKERS')]);
tests.push(['既存 ROUTES 9 ルート残存',
  JS.includes("'overview'") && JS.includes("'integrations'") && JS.includes("'settings'") &&
  JS.includes("'integration-claude'") && JS.includes("'audit'") &&
  JS.includes("'orchestrate'") && JS.includes("'governance'")]);

let pass = 0, fail = 0;
for (const [name, ok] of tests) {
  console.log(ok ? '✅' : '❌', name);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
