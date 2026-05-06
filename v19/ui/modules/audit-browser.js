// v19/ui/modules/audit-browser.js — ブラウザ側 audit ログ (governance/12 §10 #1)
//
// localStorage に SHA-256 連鎖で記録、上限 2000 件 FIFO、
// JSONL export で audit-verify.sh と完全互換。
// bash/PS audit.sh と同じ body 形式 でバイト互換。

export const BROWSER_AUDIT_KEY = 'v19.audit.entries';
export const BROWSER_AUDIT_MAX = 2000;

// audit.sh の _audit_json_escape と一致
export function auditJsonEscape(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

// audit.sh の body フォーマット と一致 (バイト互換)
export function reconstructAuditBody(e) {
  return '{"ts":"' + auditJsonEscape(e.ts) + '","host":"' + auditJsonEscape(e.host) +
    '","user":"' + auditJsonEscape(e.user) + '","pid":' + e.pid +
    ',"script":"' + auditJsonEscape(e.script) + '","event":"' + auditJsonEscape(e.event) +
    '","details":"' + auditJsonEscape(e.details) + '","prev_hash":"' + e.prev_hash + '"';
}

// SubtleCrypto による SHA-256 (browser native)
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function _load() {
  try {
    const raw = localStorage.getItem(BROWSER_AUDIT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function _save(arr) {
  try {
    if (arr.length > BROWSER_AUDIT_MAX) arr = arr.slice(arr.length - BROWSER_AUDIT_MAX);
    localStorage.setItem(BROWSER_AUDIT_KEY, JSON.stringify(arr));
  } catch (e) { /* QuotaExceeded 等は黙殺 (UI 操作を阻害しない) */ }
}

// 主関数: 1 行を追記
export async function auditLogBrowser(event, details = '') {
  try {
    const entries = _load();
    const prev = entries.length
      ? entries[entries.length - 1].chain_hash
      : '0000000000000000000000000000000000000000000000000000000000000000';
    const ts = new Date().toISOString();
    const e = {
      ts,
      host: 'browser',
      user: navigator.userAgent.slice(0, 60).replace(/[^\w\s\.\-/]/g, '_'),
      pid: 0,
      script: 'dashboard.js',
      event: String(event || 'unknown'),
      details: String(details || ''),
      prev_hash: prev,
    };
    const body = reconstructAuditBody(e);
    e.chain_hash = await sha256Hex(prev + body);
    entries.push(e);
    _save(entries);
  } catch (err) {
    if (typeof console !== 'undefined') console.warn('audit failed:', err);
  }
}

// JSONL として export (audit-verify.sh で検証可能な形式)
export function exportBrowserAuditAsJsonl() {
  const entries = _load();
  const lines = entries.map(e => reconstructAuditBody(e) + ',"chain_hash":"' + e.chain_hash + '"}');
  return lines.join('\n') + (lines.length ? '\n' : '');
}

export function loadBrowserAudit() { return _load(); }
export function clearBrowserAudit() { localStorage.removeItem(BROWSER_AUDIT_KEY); }
