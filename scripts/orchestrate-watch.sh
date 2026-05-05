#!/usr/bin/env bash
# orchestrate-watch.sh — オーケストレーション の自動監視 (auto-OODA trigger)
#
# 役割: INV / 失敗モード に対する閾値を一定間隔で確認し、breached なら
#       板 (audit.jsonl) に incident.detected を発火 + stderr 警告。
#       人間が気づくのを待たず、システムが自分で異常を発見する仕組み。
#
# 用法:
#   bash scripts/orchestrate-watch.sh --once          # 1 回チェック
#   bash scripts/orchestrate-watch.sh --loop 60       # 60 秒間隔で常駐 (Ctrl-C で停止)
#   bash scripts/orchestrate-watch.sh --thresholds    # 現在の閾値を表示
#
# チェック項目:
#   W1. audit-verify が exit 0          (INV-2 / INV-10)
#   W2. 過去 1h の chat.error が < 5    (失敗モード: クラウド AI 障害)
#   W3. INV-12 違反 (重複 scoped) = 0   (INV-12)
#   W4. 最終 PII クリーン実行が 24h 以内 (INV-6)
#
# 関連: governance/13_TEAM_ORCHESTRATION.md, governance/12_SYSTEM_DESIGN.md §10

set -u
LANG=ja_JP.UTF-8

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
[[ -f "$SCRIPT_DIR/lib/audit.sh" ]] && source "$SCRIPT_DIR/lib/audit.sh"
type audit_log >/dev/null 2>&1 || audit_log() { :; }
audit_log "orchestrate_watch.start" "args=$*"

# ── 閾値 (環境変数で上書き可) ──
WATCH_CHAT_ERROR_LIMIT="${WATCH_CHAT_ERROR_LIMIT:-5}"        # 1h で何件まで許容
WATCH_CHAT_ERROR_WINDOW_HOURS="${WATCH_CHAT_ERROR_WINDOW_HOURS:-1}"
WATCH_PII_CLEAN_MAX_HOURS="${WATCH_PII_CLEAN_MAX_HOURS:-24}" # PII クリーン実行 から N 時間

if [[ -t 1 ]]; then
  C_OK="\033[1;32m"; C_W="\033[1;33m"; C_E="\033[1;31m"
  C_DIM="\033[2m"; C_BLD="\033[1m"; C_RST="\033[0m"
else
  C_OK=""; C_W=""; C_E=""; C_DIM=""; C_BLD=""; C_RST=""
fi

MODE="once"
LOOP_INTERVAL=60
for a in "$@"; do
  case "$a" in
    --once) MODE="once" ;;
    --loop) MODE="loop" ;;
    --thresholds) MODE="thresholds" ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *)
      if [[ "$MODE" == "loop" && "$a" =~ ^[0-9]+$ ]]; then
        LOOP_INTERVAL="$a"
      else
        echo "未知: $a" >&2; exit 2
      fi
      ;;
  esac
done

if [[ "$MODE" == "thresholds" ]]; then
  echo "現在の閾値:"
  echo "  W2 chat.error 上限 / 1h     : $WATCH_CHAT_ERROR_LIMIT 件"
  echo "  W2 ウィンドウ                : $WATCH_CHAT_ERROR_WINDOW_HOURS 時間"
  echo "  W4 PII クリーン 期限 (h)     : $WATCH_PII_CLEAN_MAX_HOURS 時間以内"
  echo ""
  echo "上書き例:"
  echo "  WATCH_CHAT_ERROR_LIMIT=3 bash scripts/orchestrate-watch.sh --once"
  exit 0
fi

# ── チェック関数 ──
AUDIT_LOG="${AUDIT_LOG_PATH:-${HOME}/.claude/audit.jsonl}"
AUDIT_VERIFY="$ROOT_DIR/scripts/audit-verify.sh"
KPI="$ROOT_DIR/scripts/orchestrate-kpi.sh"

check_w1_audit_chain() {
  if [[ ! -f "$AUDIT_LOG" ]]; then echo "skip:no_log"; return 0; fi
  if [[ ! -f "$AUDIT_VERIFY" ]]; then echo "skip:no_verify"; return 0; fi
  if bash "$AUDIT_VERIFY" "$AUDIT_LOG" >/dev/null 2>&1; then
    echo "ok"
    return 0
  fi
  echo "BREACH:audit_chain_broken"
  return 1
}

check_w2_chat_errors() {
  if [[ ! -f "$AUDIT_LOG" ]]; then echo "skip:no_log"; return 0; fi
  local count
  count=$(python3 - "$AUDIT_LOG" "$WATCH_CHAT_ERROR_WINDOW_HOURS" <<'PY' 2>/dev/null
import sys, json, re
from datetime import datetime, timedelta, timezone
log_path, hours = sys.argv[1], int(sys.argv[2])
cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
n = 0
with open(log_path) as f:
    for line in f:
        try: e = json.loads(line)
        except: continue
        if e.get('event') == 'chat.error':
            try:
                ts = datetime.fromisoformat(re.sub(r'\.\d+', '', e['ts']))
                if ts.tzinfo is None: ts = ts.replace(tzinfo=timezone.utc)
                if ts >= cutoff: n += 1
            except: pass
print(n)
PY
)
  count="${count:-0}"
  if [[ "$count" -lt "$WATCH_CHAT_ERROR_LIMIT" ]]; then
    echo "ok:$count"
    return 0
  fi
  echo "BREACH:chat_error_storm:$count"
  return 1
}

check_w3_inv12_violations() {
  if [[ ! -f "$KPI" ]]; then echo "skip:no_kpi"; return 0; fi
  if ORCHESTRATE_KPI_NO_GAMMA=1 bash "$KPI" --check >/dev/null 2>&1; then
    echo "ok"
    return 0
  fi
  echo "BREACH:inv12_concurrent_scope"
  return 1
}

check_w4_pii_clean_recent() {
  if [[ ! -f "$AUDIT_LOG" ]]; then echo "skip:no_log"; return 0; fi
  local hours_since
  hours_since=$(python3 - "$AUDIT_LOG" <<'PY' 2>/dev/null
import sys, json, re
from datetime import datetime, timezone
log_path = sys.argv[1]
latest = None
with open(log_path) as f:
    for line in f:
        try: e = json.loads(line)
        except: continue
        if e.get('event') == 'pii_scan.clean':
            try:
                ts = datetime.fromisoformat(re.sub(r'\.\d+', '', e['ts']))
                if ts.tzinfo is None: ts = ts.replace(tzinfo=timezone.utc)
                if latest is None or ts > latest: latest = ts
            except: pass
if latest is None:
    print("never")
else:
    delta = datetime.now(timezone.utc) - latest
    print(int(delta.total_seconds() / 3600))
PY
)
  if [[ "$hours_since" == "never" ]]; then
    # 最初の commit 前は PII スキャンが走っていなくても OK
    echo "skip:never_run"
    return 0
  fi
  if [[ "$hours_since" -le "$WATCH_PII_CLEAN_MAX_HOURS" ]]; then
    echo "ok:${hours_since}h"
    return 0
  fi
  echo "BREACH:pii_scan_stale:${hours_since}h"
  return 1
}

# ── 1 巡 ──
run_once() {
  local breached=0
  local r

  echo -e "${C_BLD}── orchestrate-watch (single check) ──${C_RST}"
  echo "  実行時刻: $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""

  for chk in w1_audit_chain w2_chat_errors w3_inv12_violations w4_pii_clean_recent; do
    r=$(check_$chk)
    if [[ "$r" == BREACH:* ]]; then
      breached=$((breached + 1))
      echo -e "  ${C_E}❌ $chk : $r${C_RST}"
      audit_log "incident.detected" "watch=$chk reason=$r"
    elif [[ "$r" == skip:* ]]; then
      echo -e "  ${C_DIM}- $chk : $r${C_RST}"
    else
      echo -e "  ${C_OK}✓${C_RST} $chk : $r"
    fi
  done

  echo ""
  if [[ "$breached" -gt 0 ]]; then
    echo -e "${C_E}━━ ⚠️  $breached 件の breach 検出 ━━${C_RST}"
    echo -e "  次の手: bash scripts/orchestrate.sh --cycle ooda --trigger watch"
    audit_log "orchestrate_watch.breach" "count=$breached"
    return 1
  else
    echo -e "${C_OK}━━ ✓ 全項目 OK ━━${C_RST}"
    audit_log "orchestrate_watch.ok" "checks=4"
    return 0
  fi
}

# ── ループ モード ──
if [[ "$MODE" == "loop" ]]; then
  echo "ループ監視 開始 (${LOOP_INTERVAL} 秒間隔、Ctrl-C で停止)"
  trap 'audit_log "orchestrate_watch.stopped" ""; exit 0' INT TERM
  while true; do
    run_once || true
    echo ""
    echo -e "${C_DIM}次回まで ${LOOP_INTERVAL} 秒...${C_RST}"
    sleep "$LOOP_INTERVAL"
  done
else
  run_once
fi
