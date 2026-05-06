// v19/ui/modules/orchestrate.js — #orchestrate ルート の純粋ロジック層
// 対応 governance/12 §10 #36 (PDCA #25 v36): dashboard.js 最適化再構築
//
// 設計原則 (35 反復 学び):
//   - 純粋関数 のみ (DOM 非依存) — Node から直接 import + テスト
//   - escapeHtml は 呼出側 (dashboard.js) の責務 — INV-8 境界 維持
//   - state は 引数 経由 のみ受取り、global なし
//   - 名前は L8 オーケストレーション 概念 (governance/13) と 1:1 対応

// JSONL 1 行 → object | null (parse 失敗・空行で null)
export function parseAuditLineSimple(line) {
  if (!line || !line.trim()) return null;
  try { return JSON.parse(line); } catch { return null; }
}

// audit events 配列 → 4 チーム KPI ({alpha, beta, gamma, delta})
// α: PDCA cycle 完遂数 + INV-12 違反検出
// β: scoped → cycle.complete の中央経過秒
// γ: incident.contained / incident.* の比
// δ: 完遂数 + 進行中 incident の合計
export function computeOrchestrateKPI(events) {
  const cycles = events.filter(e => e.event === 'pdca.cycle.complete').length;
  const incidents = events.filter(e => (e.event || '').startsWith('incident.')).length;
  const containedIncidents = events.filter(
    e => e.event === 'incident.contained' || e.event === 'incident.resolved'
  ).length;

  // β: 各 scoped → 直後の cycle.complete までの経過秒
  const scoped = [];
  const completed = [];
  for (const e of events) {
    const t = Date.parse(e.ts);
    if (!Number.isFinite(t)) continue;
    if ((e.event || '').endsWith('.1.scoped')) scoped.push(t);
    if (e.event === 'pdca.cycle.complete') completed.push(t);
  }
  const deltas = [];
  let ci = 0;
  for (const s of scoped) {
    while (ci < completed.length && completed[ci] < s) ci++;
    if (ci < completed.length) { deltas.push((completed[ci] - s) / 1000); ci++; }
  }
  deltas.sort((a, b) => a - b);
  const beta_median = deltas.length
    ? Math.round(deltas[Math.floor(deltas.length / 2)])
    : 0;

  // γ: INV-12 違反 (同 issue を複数チームが scoped)
  const inv12_violations = countInv12Violations(events);

  return {
    alpha: { label: `${cycles} サイクル完遂`,
             sub: `INV-12: ${inv12_violations === 0 ? 'OK' : '⚠️ ' + inv12_violations}` },
    beta:  { label: `${deltas.length} 件 / 中央 ${beta_median}s`,
             sub: 'PDCA scope→complete' },
    gamma: { label: `${containedIncidents}/${incidents} 解消`,
             sub: 'インシデント' },
    delta: { label: `${cycles + Math.max(0, incidents - containedIncidents)} 活動件`,
             sub: '完遂 + 進行中' },
  };
}

// INV-12: 同じ issue= に対し team.alpha/beta/gamma/delta のうち複数が
// 1.scoped を出していたら違反 (governance/13 §INV-12)
export function countInv12Violations(events) {
  const issues = {};
  for (const e of events) {
    const m = (e.event || '').match(/^team\.(\w+)\.1\.scoped$/);
    if (!m) continue;
    const team = m[1];
    const im = (e.details || '').match(/issue=(\S+)/);
    if (!im) continue;
    const id = im[1];
    if (!issues[id]) issues[id] = new Set();
    issues[id].add(team);
  }
  return Object.values(issues).filter(s => s.size > 1).length;
}

// 板 (board) フィルタ — 直近 30 件、降順
// flags: { team, handoff, incident, cycle } すべて bool
export function filterBoardEvents(events, flags) {
  const f = flags || {};
  return events.filter(e => {
    const ev = e.event || '';
    if (ev.startsWith('team.')     && f.team)     return true;
    if (ev.startsWith('handoff.')  && f.handoff)  return true;
    if (ev.startsWith('incident.') && f.incident) return true;
    if (/cycle/.test(ev)           && f.cycle)    return true;
    return false;
  }).slice(-30).reverse();
}

// イベント → 板 row CSS クラス (incident > handoff > team の優先順)
export function boardRowClass(event) {
  const ev = event || '';
  if (ev.startsWith('incident.')) return 'board-incident';
  if (ev.startsWith('handoff.'))  return 'board-handoff';
  return 'board-team';
}

// OODA Decide: 4 breach パターン → IR Playbook + 60 秒手順
// (scripts/orchestrate.sh --propose-response の ブラウザ再現)
export const OODA_RESPONSES = {
  audit_chain_broken: {
    cat: '監査ログ 改竄疑い (INV-10 違反)',
    ir: 'governance/09_INCIDENT_PLAYBOOK.md (該当 シナリオなし → 即興 IR)',
    steps: [
      '別端末で最新 backup を verify (audit-export.sh)',
      'audit-verify.sh で改竄行を特定 (連鎖切断 行番号確認)',
      '~/.claude/audit-backups/ から復旧 (03_OPERATIONS D-4 参照)',
    ],
  },
  chat_error_storm: {
    cat: 'クラウド AI 障害 or CORS 失効',
    ir: 'governance/09 I-2 周辺',
    steps: [
      'ローカル専用モードに即切替 (設定 → ローカル専用 ON)',
      '直近の chat.error 内容確認 (#audit ビューアでフィルタ)',
      'preflight で OLLAMA_ORIGINS / API キー確認',
    ],
  },
  inv12_concurrent_scope: {
    cat: '重複着手 (INV-12 違反 / 運用問題)',
    ir: 'governance/13 §9 失敗モード',
    steps: [
      '重複 issue を特定 (board の team.*.1.scoped を確認)',
      '後発チームに撤退要請 (team.<TEAM>.1.bounce イベント)',
      'α1 が再分担',
    ],
  },
  pii_scan_stale: {
    cat: 'PII セカンドラインの 鮮度 低下 (INV-6 関連)',
    ir: 'governance/09 I-1 周辺',
    steps: [
      'pii-scan.sh --diff を即実行',
      'pii-scan.sh --staged で 直前 commit 候補も走査',
      'gitleaks があれば二次防御として走らせる',
    ],
  },
};

// ts (ISO 8601) → "YYYY-MM-DD HH:MM:SS" (board 表示用)
export function formatBoardTs(ts) {
  return (ts || '').replace('T', ' ').slice(0, 19);
}
