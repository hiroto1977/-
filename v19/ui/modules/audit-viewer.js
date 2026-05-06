// v19/ui/modules/audit-viewer.js — #audit ルート の純粋分析層 (DOM 非依存)
// 対応 governance/12 §10 #38 (PDCA #26 v37): dashboard.js 最適化再構築 完結
//
// 設計原則:
//   - DOM 非依存 — Node から直接 import + テスト可能
//   - INV-2 / INV-10 (audit chain) の検証ロジック を ここに 集約
//   - sha256 / reconstructBody は audit-browser.js モジュール の関数を 注入
//     (循環参照 を避けつつ INV-2 境界を 単一実装 に保つ)

export const ZERO_HASH = '0'.repeat(64);

// 重大度推測 (governance/05 イベント名規約 と整合)
//   bad : blocked / aborted / threat / fail / tamper / alert
//   warn: warn / noteworthy / hits / protected
//   info: それ以外
export function auditEventSeverity(event) {
  const e = String(event || '').toLowerCase();
  if (/(blocked|aborted|threat|fail|tamper|alert)/.test(e)) return 'bad';
  if (/(warn|noteworthy|hits|protected)/.test(e)) return 'warn';
  return 'info';
}

// JSONL テキスト → { entries, parseErrors }
// 不正行は parseErrors に line 番号付きで記録 (続行可)
export function parseAuditJsonl(text) {
  const lines = String(text || '').split('\n').filter(l => l.trim());
  const entries = [];
  const parseErrors = [];
  lines.forEach((line, i) => {
    try { entries.push(JSON.parse(line)); }
    catch { parseErrors.push({ line: i + 1, content: line.slice(0, 80) }); }
  });
  return { entries, parseErrors };
}

// audit エントリ配列 → サマリ統計
//   { total, scriptCount, eventTypeCount, tsFirst, tsLast,
//     topScripts: [[name, n], ...8], maxScriptCount, topEvents: [[name, n], ...5] }
export function summarizeAuditEntries(entries) {
  if (!entries || !entries.length) {
    return {
      total: 0, scriptCount: 0, eventTypeCount: 0,
      tsFirst: '-', tsLast: '-',
      topScripts: [], maxScriptCount: 1, topEvents: [],
    };
  }
  const tsList = entries.map(e => e.ts).filter(Boolean).sort();
  const tsFirst = tsList[0] || '-';
  const tsLast = tsList[tsList.length - 1] || '-';
  const byScript = {};
  const byEvent = {};
  for (const e of entries) {
    byScript[e.script || '?'] = (byScript[e.script || '?'] || 0) + 1;
    byEvent[e.event || '?'] = (byEvent[e.event || '?'] || 0) + 1;
  }
  const topScripts = Object.entries(byScript).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topEvents = Object.entries(byEvent).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return {
    total: entries.length,
    scriptCount: Object.keys(byScript).length,
    eventTypeCount: Object.keys(byEvent).length,
    tsFirst, tsLast,
    topScripts,
    maxScriptCount: topScripts[0]?.[1] || 1,
    topEvents,
  };
}

// audit エントリ配列 → SHA-256 連鎖 整合検証 (async)
//   sha256Hex / reconstructBody は audit-browser.js から関数注入
//   戻り値: { total, ok, breaks: [{line, reason}, ...] }
//
// アルゴリズム:
//   - 各エントリで `sha256Hex(prev_hash + reconstructBody(e))` を再計算
//   - chain_hash が一致しない → 改竄疑い
//   - prev_hash が前エントリ chain_hash と一致しない → 連鎖切断
//   - 不正は breaks に蓄積、検証は最後まで続行 (UI で全件確認可能)
export async function verifyAuditChain(entries, { sha256Hex, reconstructBody }) {
  const breaks = [];
  let okCount = 0;
  if (!entries || !entries.length) return { total: 0, ok: 0, breaks };

  let prev = ZERO_HASH;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e.chain_hash || !e.prev_hash) {
      breaks.push({ line: i + 1, reason: 'chain_hash/prev_hash 抽出失敗' });
      prev = e.chain_hash || prev;
      continue;
    }
    const body_str = reconstructBody(e);
    const computed = await sha256Hex(prev + body_str);
    if (computed === e.chain_hash) {
      if (e.prev_hash !== prev) {
        breaks.push({ line: i + 1, reason: `連鎖切断 (prev=${e.prev_hash.slice(0, 8)}.. 期待=${prev.slice(0, 8)}..)` });
      } else {
        okCount++;
      }
    } else {
      breaks.push({ line: i + 1, reason: '改竄疑い (chain_hash 再計算 不一致)' });
    }
    prev = e.chain_hash;
  }
  return { total: entries.length, ok: okCount, breaks };
}

// イベント フィルタ + 件数 上限 (最新 N 件、降順)
//   eventQ / scriptQ は 大文字小文字不問 部分一致
export function filterAuditEntries(entries, { eventQ = '', scriptQ = '', limit = 100 } = {}) {
  const eq = String(eventQ || '').toLowerCase();
  const sq = String(scriptQ || '').toLowerCase();
  const filtered = (entries || []).filter(e => {
    if (eq && !String(e.event || '').toLowerCase().includes(eq)) return false;
    if (sq && !String(e.script || '').toLowerCase().includes(sq)) return false;
    return true;
  });
  return filtered.slice().reverse().slice(0, Math.max(0, limit | 0));
}

// ts (ISO 8601) → "YYYY-MM-DD HH:MM:SS" (テーブル表示用)
export function formatAuditTs(ts) {
  return String(ts || '').replace('T', ' ').slice(0, 19);
}
