#!/usr/bin/env bash
# storage-orchestrator.sh — ストレージ衛生 オーケストレータ
#
# health → cleanup --dry-run → ユーザー確認 → cleanup --apply → archive --plan
# の順で実行し、各ステップで AI/人間の判断ポイントを明示する。
#
# Claude Code 等のオーケストレーション AI から呼ばれることを想定:
#   - 単発実行で完結 (バックグラウンド常駐しない)
#   - 各ステップの結果を JSON / 表形式で集約出力
#   - 自動承認モード (--auto) はあえて狭い範囲のみに制限
#
# 用法:
#   bash scripts/storage-orchestrator.sh                  # インタラクティブ
#   bash scripts/storage-orchestrator.sh --dry-run         # 全部 計画のみ
#   bash scripts/storage-orchestrator.sh --auto-cleanup    # health→cleanup 自動 (archive はインタラクティブ)
#   bash scripts/storage-orchestrator.sh --json-report     # JSON 出力 のみ (cron 連携)
#   bash scripts/storage-orchestrator.sh --routine daily   # daily/weekly/monthly のルーティン

set -u
LANG=ja_JP.UTF-8

# Audit logging
SCRIPT_DIR_AUDIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$SCRIPT_DIR_AUDIT/lib/audit.sh" ]] && source "$SCRIPT_DIR_AUDIT/lib/audit.sh"
type audit_log >/dev/null 2>&1 || audit_log() { :; }
audit_log "storage_orchestrator.start" "args=$*"

DRY_ALL=0
AUTO_CLEANUP=0
JSON_REPORT=0
ROUTINE=""

for a in "$@"; do
  case "$a" in
    --dry-run) DRY_ALL=1 ;;
    --auto-cleanup) AUTO_CLEANUP=1 ;;
    --json-report) JSON_REPORT=1 ;;
    --routine) shift_next=1 ;;
    --routine=*) ROUTINE="${a#--routine=}" ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *)
      if [[ "${shift_next:-0}" -eq 1 ]]; then
        ROUTINE="$a"; shift_next=0
      else
        echo "未知: $a" >&2; exit 2
      fi
      ;;
  esac
done

if [[ -t 1 && "$JSON_REPORT" -eq 0 ]]; then
  C_OK="\033[1;32m"; C_W="\033[1;33m"; C_E="\033[1;31m"
  C_DIM="\033[2m"; C_BLD="\033[1m"; C_HDR="\033[1;36m"; C_RST="\033[0m"
else
  C_OK=""; C_W=""; C_E=""; C_DIM=""; C_BLD=""; C_HDR=""; C_RST=""
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${HOME}/.local/state/storage-orchestrator"
mkdir -p "$LOG_DIR" 2>/dev/null
TS=$(date +%Y%m%d-%H%M%S)
LOG="${LOG_DIR}/run-${TS}.log"

step() {
  local n="$1" title="$2"
  if [[ "$JSON_REPORT" -eq 0 ]]; then
    echo ""
    echo -e "${C_HDR}▶ Step $n  $title${C_RST}"
    echo -e "${C_DIM}─────────────────────────────────────────────${C_RST}"
  fi
}

ask_yn() {
  local prompt="$1" default="${2:-N}"
  local ans
  read -r -p "$prompt [y/N] " ans
  [[ -z "$ans" ]] && ans="$default"
  [[ "$ans" =~ ^[yY]$ ]]
}

# ----- ルーティン モード分岐 -----
case "$ROUTINE" in
  daily)
    [[ "$JSON_REPORT" -eq 0 ]] && echo -e "${C_BLD}■ Daily Routine${C_RST}: health のみ"
    bash "$ROOT_DIR/scripts/storage-health.sh" 2>&1 | tee -a "$LOG"
    exit ${PIPESTATUS[0]}
    ;;
  weekly)
    [[ "$JSON_REPORT" -eq 0 ]] && echo -e "${C_BLD}■ Weekly Routine${C_RST}: health → cleanup --dry-run"
    bash "$ROOT_DIR/scripts/storage-health.sh" 2>&1 | tee -a "$LOG"
    echo "" | tee -a "$LOG"
    bash "$ROOT_DIR/scripts/storage-cleanup.sh" --dry-run 2>&1 | tee -a "$LOG"
    exit 0
    ;;
  monthly)
    [[ "$JSON_REPORT" -eq 0 ]] && echo -e "${C_BLD}■ Monthly Routine${C_RST}: health → cleanup --apply --aggressive → archive --plan + audit rotate"
    AUTO_CLEANUP=1  # cleanup は自動実行
    # archive はインタラクティブのまま (人間判断必須)
    # 監査ログのローテーション (90 日より古い行を削除、チェーンは故意に切断される)
    if type audit_rotate >/dev/null 2>&1; then
      audit_log "audit.rotate.start" "retention_days=${AUDIT_LOG_RETENTION_DAYS:-365}"
      audit_rotate "${AUDIT_LOG_RETENTION_DAYS:-365}"
      audit_log "audit.rotate.done" ""
      [[ "$JSON_REPORT" -eq 0 ]] && echo -e "${C_DIM}  → audit.jsonl をローテーション (${AUDIT_LOG_RETENTION_DAYS:-365} 日)${C_RST}"
    fi
    ;;
  "")
    : # 通常モード
    ;;
  *)
    echo "未知のルーティン: $ROUTINE (daily / weekly / monthly のいずれか)" >&2
    exit 2
    ;;
esac

# ----- ヘッダ -----
if [[ "$JSON_REPORT" -eq 0 ]]; then
  echo "============================================================"
  echo -e "${C_BLD} Storage Orchestrator${C_RST}  $(date '+%Y-%m-%d %H:%M:%S')"
  echo -e " ログ: ${LOG}"
  echo -e " mode: ${ROUTINE:-interactive}  dry-all=${DRY_ALL}  auto-cleanup=${AUTO_CLEANUP}"
  echo "============================================================"
fi

# ----- Step 1: Health Check -----
step 1 "Health Check"
HEALTH_JSON="${LOG_DIR}/health-${TS}.json"
bash "$ROOT_DIR/scripts/storage-health.sh" --json > "$HEALTH_JSON" 2>/dev/null
HEALTH_EXIT=$?

# 抽出
ISSUES=$(grep -o '"overall_issues": [0-9]*' "$HEALTH_JSON" | awk '{print $2}')
DISK_PCT=$(grep -o '"free_pct": [0-9]*' "$HEALTH_JSON" | awk '{print $2}')
CACHE_BYTES=$(grep -o '"cache_bytes": [0-9]*' "$HEALTH_JSON" | awk '{print $2}')
TMP_BYTES=$(grep -o '"tmp_bytes": [0-9]*' "$HEALTH_JSON" | awk '{print $2}')

if [[ "$JSON_REPORT" -eq 0 ]]; then
  bash "$ROOT_DIR/scripts/storage-health.sh" 2>/dev/null | tail -25
fi

# ----- Step 2: Cleanup プラン -----
step 2 "Cleanup Plan (dry-run)"
CLEANUP_LOG="${LOG_DIR}/cleanup-plan-${TS}.log"
bash "$ROOT_DIR/scripts/storage-cleanup.sh" --dry-run > "$CLEANUP_LOG" 2>&1
FREEABLE=$(grep -oE '解放可能 \(見込\): [0-9.]+ [KMGT]?B' "$CLEANUP_LOG" | head -1 || echo "")

if [[ "$JSON_REPORT" -eq 0 ]]; then
  cat "$CLEANUP_LOG" | tail -20
fi

# ----- Step 3: Cleanup 実行判断 -----
should_apply=0
if [[ "$DRY_ALL" -eq 1 ]]; then
  should_apply=0
elif [[ "$AUTO_CLEANUP" -eq 1 && "$ISSUES" -ge 2 ]]; then
  # 警告 2 件以上なら自動 cleanup
  should_apply=1
  [[ "$JSON_REPORT" -eq 0 ]] && echo -e "${C_OK}▶ 警告 ${ISSUES} 件 検出 → 自動 cleanup 実行${C_RST}"
elif [[ "$AUTO_CLEANUP" -eq 1 ]]; then
  [[ "$JSON_REPORT" -eq 0 ]] && echo -e "${C_DIM}▶ 警告少 — cleanup スキップ${C_RST}"
elif [[ "$JSON_REPORT" -eq 0 ]]; then
  echo ""
  if ask_yn "  上記の cleanup を実行しますか?" N; then
    should_apply=1
  fi
fi

# ----- Step 4: Cleanup 実行 -----
if [[ "$should_apply" -eq 1 ]]; then
  step 4 "Cleanup Execute"
  bash "$ROOT_DIR/scripts/storage-cleanup.sh" --apply 2>&1 | tee -a "$LOG"
fi

# ----- Step 5: Archive プラン -----
step 5 "Archive Plan"
ARCHIVE_LOG="${LOG_DIR}/archive-plan-${TS}.log"
bash "$ROOT_DIR/scripts/storage-archive.sh" --plan > "$ARCHIVE_LOG" 2>&1
ARCHIVE_EXIT=$?

if [[ "$JSON_REPORT" -eq 0 ]]; then
  if [[ $ARCHIVE_EXIT -eq 0 ]]; then
    cat "$ARCHIVE_LOG" | tail -15
  else
    echo -e "${C_DIM}  archive プランニング スキップ (rclone 未設定 or 設定ファイル なし)${C_RST}"
    echo -e "${C_DIM}  セットアップ: bash scripts/storage-archive.sh --setup${C_RST}"
  fi
fi

# Archive は AI 自動承認しない (governance/02 上、人間判断必須)
[[ "$JSON_REPORT" -eq 0 ]] && echo ""
[[ "$JSON_REPORT" -eq 0 ]] && echo -e "${C_DIM}  ※ archive --apply は人間判断のため自動化しない (governance/02 準拠)${C_RST}"

# ----- 統合 サマリ -----
if [[ "$JSON_REPORT" -eq 1 ]]; then
  cat <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "host": "$(hostname)",
  "routine": "${ROUTINE:-interactive}",
  "log_dir": "$LOG_DIR",
  "health": {
    "issues": ${ISSUES:-0},
    "disk_free_pct": ${DISK_PCT:-0},
    "cache_bytes": ${CACHE_BYTES:-0},
    "tmp_bytes": ${TMP_BYTES:-0}
  },
  "cleanup_plan": "$CLEANUP_LOG",
  "cleanup_applied": $should_apply,
  "archive_plan_exit": $ARCHIVE_EXIT
}
EOF
  exit 0
fi

echo ""
echo "============================================================"
echo -e "${C_BLD} 実行完了${C_RST}"
echo "============================================================"
printf " %-25s %s\n" "ヘルス警告:"          "${ISSUES:-?} 件"
printf " %-25s %s\n" "ディスク 空き:"        "${DISK_PCT:-?}%"
printf " %-25s %s\n" "解放可能 見込:"        "${FREEABLE:-不明}"
printf " %-25s %s\n" "cleanup 実行:"        "$([ "$should_apply" -eq 1 ] && echo はい || echo いいえ)"
printf " %-25s %s\n" "archive 計画:"        "$([ "$ARCHIVE_EXIT" -eq 0 ] && echo "ok ($ARCHIVE_LOG)" || echo "未設定")"
printf " %-25s %s\n" "ログ:"                "$LOG_DIR"
echo "============================================================"
echo ""
echo -e "${C_DIM}  governance/10_STORAGE_HYGIENE.md §5 のルーティンに従い${C_RST}"
echo -e "${C_DIM}  日次: --routine daily / 週次: --routine weekly / 月次: --routine monthly${C_RST}"
