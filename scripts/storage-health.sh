#!/usr/bin/env bash
# storage-health.sh — ストレージ健康診断
#
# 用途: 毎週実行。governance/10_STORAGE_HYGIENE.md §1 の閾値で
#       現状を判定し、警告/目標/理想 をひと目で確認できる。
#
# 用法:
#   bash scripts/storage-health.sh                  # サマリ
#   bash scripts/storage-health.sh --verbose         # 詳細 (大型ファイル列挙等)
#   bash scripts/storage-health.sh --json            # JSON 出力 (cron 連携用)

set -u
LANG=ja_JP.UTF-8

# Audit logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$SCRIPT_DIR/lib/audit.sh" ]] && source "$SCRIPT_DIR/lib/audit.sh"
type audit_log >/dev/null 2>&1 || audit_log() { :; }

VERBOSE=0
JSON=0
TARGET="${HOME}"

for arg in "$@"; do
  case "$arg" in
    --verbose|-v) VERBOSE=1 ;;
    --json) JSON=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) TARGET="$arg" ;;
  esac
done

# Colors (TTY only)
if [[ -t 1 && "$JSON" -eq 0 ]]; then
  C_OK="\033[1;32m"; C_WARN="\033[1;33m"; C_BAD="\033[1;31m"
  C_DIM="\033[2m"; C_BLD="\033[1m"; C_RST="\033[0m"
else
  C_OK=""; C_WARN=""; C_BAD=""; C_DIM=""; C_BLD=""; C_RST=""
fi

# ----- ヘルパ -----
human_bytes() {
  local b="$1"
  awk -v b="$b" 'BEGIN{
    if (b < 1024) printf "%d B", b;
    else if (b < 1024*1024) printf "%.1f KB", b/1024;
    else if (b < 1024*1024*1024) printf "%.1f MB", b/1024/1024;
    else if (b < 1024*1024*1024*1024) printf "%.2f GB", b/1024/1024/1024;
    else printf "%.2f TB", b/1024/1024/1024/1024;
  }'
}

# Disk usage of $HOME's filesystem
disk_info() {
  # df -P でポータブル (Linux/Mac/BSD)
  df -P "$TARGET" | awk 'NR==2 {
    # Size, Used, Avail, Capacity
    used_pct = int($5);
    free_pct = 100 - used_pct;
    printf "%d %d %d %d", $2, $3, $4, free_pct;
  }'
}

# Memory info
mem_info() {
  case "$(uname)" in
    Linux)
      # MemAvailable in KB → bytes
      local avail
      avail=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
      echo $(( avail * 1024 ))
      ;;
    Darwin)
      # vm_stat returns pages; page size 16K on Apple Silicon
      local pagesize free inactive
      pagesize=$(pagesize 2>/dev/null || echo 4096)
      free=$(vm_stat | awk '/Pages free/ {gsub(/\./,""); print $3}')
      inactive=$(vm_stat | awk '/Pages inactive/ {gsub(/\./,""); print $3}')
      echo $(( (free + inactive) * pagesize ))
      ;;
    *)
      echo "0"
      ;;
  esac
}

# inode usage (Linux only meaningful)
inode_info() {
  if [[ "$(uname)" == "Linux" ]]; then
    df -i "$TARGET" 2>/dev/null | awk 'NR==2 {
      used_pct = int($5);
      free_pct = 100 - used_pct;
      print free_pct;
    }'
  else
    echo "100"
  fi
}

# Swap usage
swap_pct() {
  case "$(uname)" in
    Linux)
      awk '/^SwapTotal:/ {tot=$2} /^SwapFree:/ {free=$2}
           END { if (tot > 0) print int((tot-free)*100/tot); else print 0 }' /proc/meminfo
      ;;
    Darwin)
      # sysctl vm.swapusage
      sysctl vm.swapusage 2>/dev/null | awk '{
        for (i=1;i<=NF;i++) {
          if ($i == "total") tot=$(i+1);
          if ($i == "used") used=$(i+1);
        }
        gsub(/[A-Z]/,"",tot); gsub(/[A-Z]/,"",used);
        if (tot+0 > 0) print int(used*100/tot); else print 0;
      }'
      ;;
    *) echo "0" ;;
  esac
}

# /tmp size in bytes
tmp_size() {
  if [[ -d /tmp ]]; then
    du -sb /tmp 2>/dev/null | awk '{print $1}'
  else
    echo "0"
  fi
}

# ~/Downloads age
dl_age() {
  local dl="$HOME/Downloads"
  [[ ! -d "$dl" ]] && { echo "0"; return; }
  # 最古ファイルの何日経過
  local now oldest
  now=$(date +%s)
  oldest=$(find "$dl" -type f -printf '%T@\n' 2>/dev/null \
    | sort -n | head -1 | cut -d. -f1)
  [[ -z "$oldest" ]] && { echo "0"; return; }
  echo $(( (now - oldest) / 86400 ))
}

# Cache totals
cache_size() {
  local total=0 d
  for d in "$HOME/.cache" "$HOME/Library/Caches"; do
    [[ -d "$d" ]] || continue
    local s
    s=$(du -sb "$d" 2>/dev/null | awk '{print $1}')
    total=$(( total + ${s:-0} ))
  done
  echo "$total"
}

# Status helper: returns "OK" / "WARN" / "BAD" / color code
classify() {
  local val="$1" warn="$2" bad="$3" higher_better="${4:-1}"
  if [[ "$higher_better" -eq 1 ]]; then
    # higher = better
    if (( val < bad )); then echo "BAD"
    elif (( val < warn )); then echo "WARN"
    else echo "OK"; fi
  else
    # lower = better
    if (( val > bad )); then echo "BAD"
    elif (( val > warn )); then echo "WARN"
    else echo "OK"; fi
  fi
}

color_for() {
  case "$1" in
    OK) echo -n "$C_OK" ;;
    WARN) echo -n "$C_WARN" ;;
    BAD) echo -n "$C_BAD" ;;
  esac
}

# ----- 計測 -----
read -r DISK_TOTAL DISK_USED DISK_AVAIL DISK_FREE_PCT <<< "$(disk_info)"
DISK_TOTAL_B=$(( DISK_TOTAL * 1024 ))
DISK_AVAIL_B=$(( DISK_AVAIL * 1024 ))

MEM_AVAIL=$(mem_info)
INODE_FREE_PCT=$(inode_info)
SWAP_PCT=$(swap_pct)
TMP_SIZE=$(tmp_size)
DL_AGE=$(dl_age)
CACHE_SIZE=$(cache_size)

# 判定
S_DISK=$(classify "$DISK_FREE_PCT" 30 20 1)
# Memory: GB 単位で評価 (4GB=理想, 2GB=目標, 1GB=警告)
MEM_GB=$(( MEM_AVAIL / 1024 / 1024 / 1024 ))
S_MEM=$(classify "$MEM_GB" 2 1 1)
S_INODE=$(classify "$INODE_FREE_PCT" 20 5 1)
S_SWAP=$(classify "$SWAP_PCT" 20 50 0)
# /tmp: GB
TMP_GB=$(( TMP_SIZE / 1024 / 1024 / 1024 ))
S_TMP=$(classify "$TMP_GB" 1 5 0)
S_DL=$(classify "$DL_AGE" 30 90 0)
CACHE_GB=$(( CACHE_SIZE / 1024 / 1024 / 1024 ))
S_CACHE=$(classify "$CACHE_GB" 2 5 0)

# 全体スコア (BAD=2, WARN=1, OK=0 → 加算)
score=0
for s in "$S_DISK" "$S_MEM" "$S_INODE" "$S_SWAP" "$S_TMP" "$S_DL" "$S_CACHE"; do
  case "$s" in BAD) score=$((score+2));; WARN) score=$((score+1));; esac
done

# ----- 出力 -----
if [[ "$JSON" -eq 1 ]]; then
  cat <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "host": "$(hostname)",
  "target": "$TARGET",
  "disk": {
    "total_bytes": $DISK_TOTAL_B,
    "available_bytes": $DISK_AVAIL_B,
    "free_pct": $DISK_FREE_PCT,
    "status": "$S_DISK"
  },
  "memory": {
    "available_bytes": $MEM_AVAIL,
    "available_gb": $MEM_GB,
    "status": "$S_MEM"
  },
  "inode_free_pct": $INODE_FREE_PCT,
  "inode_status": "$S_INODE",
  "swap_used_pct": $SWAP_PCT,
  "swap_status": "$S_SWAP",
  "tmp_bytes": $TMP_SIZE,
  "tmp_status": "$S_TMP",
  "downloads_oldest_days": $DL_AGE,
  "downloads_status": "$S_DL",
  "cache_bytes": $CACHE_SIZE,
  "cache_status": "$S_CACHE",
  "overall_issues": $score
}
EOF
  exit "$([[ $score -gt 3 ]] && echo 1 || echo 0)"
fi

echo "============================================================"
echo -e "${C_BLD} Storage Health  $(date '+%Y-%m-%d %H:%M:%S')  ($(hostname))${C_RST}"
echo -e " 対象: $TARGET"
echo "============================================================"

print_metric() {
  local label="$1" value="$2" status="$3" target="$4"
  local color
  color=$(color_for "$status")
  printf "  %s%-7s%s  %-32s  %s\n" "$color" "[$status]" "$C_RST" "$label" "$value"
  [[ -n "$target" ]] && printf "          %s└ 目標: %s%s\n" "$C_DIM" "$target" "$C_RST"
}

echo ""
echo -e "${C_BLD}■ ストレージ${C_RST}"
print_metric "ディスク 空き容量" "$(human_bytes $DISK_AVAIL_B) / $(human_bytes $DISK_TOTAL_B) (${DISK_FREE_PCT}% 空)" "$S_DISK" "≥30% (理想 50%)"
print_metric "inode 空き" "${INODE_FREE_PCT}%" "$S_INODE" "≥20% (Linux のみ意味あり)"

echo ""
echo -e "${C_BLD}■ メモリ${C_RST}"
print_metric "RAM 空き" "$(human_bytes $MEM_AVAIL)" "$S_MEM" "≥2 GB (理想 4 GB)"
print_metric "swap 使用率" "${SWAP_PCT}%" "$S_SWAP" "<20% (理想 <5%)"

echo ""
echo -e "${C_BLD}■ 一時 / キャッシュ${C_RST}"
print_metric "/tmp サイズ" "$(human_bytes $TMP_SIZE)" "$S_TMP" "<1 GB (理想 <500 MB)"
print_metric "汎用キャッシュ (~/.cache + ~/Library/Caches)" "$(human_bytes $CACHE_SIZE)" "$S_CACHE" "<2 GB (理想 <1 GB)"

echo ""
echo -e "${C_BLD}■ ファイル衛生${C_RST}"
print_metric "Downloads 最古ファイル経過" "${DL_AGE} 日" "$S_DL" "<30 日 (理想 <7 日)"

# ----- Verbose: 大型ファイル / 古いファイル -----
if [[ "$VERBOSE" -eq 1 ]]; then
  echo ""
  echo -e "${C_BLD}■ ${TARGET} 配下の 大型ファイル (上位 10)${C_RST}"
  find "$TARGET" -type f -size +100M 2>/dev/null \
    | xargs -I{} du -h "{}" 2>/dev/null \
    | sort -hr | head -10 | sed 's/^/  /'

  echo ""
  echo -e "${C_BLD}■ ${TARGET} 配下の 大型 ディレクトリ (上位 10)${C_RST}"
  du -h -d 2 "$TARGET" 2>/dev/null | sort -hr | head -11 | tail -10 | sed 's/^/  /'

  echo ""
  echo -e "${C_BLD}■ 180 日 以上 触られていない 大型ファイル (Linux/Mac)${C_RST}"
  find "$TARGET" -type f -size +50M -atime +180 2>/dev/null \
    | head -10 | sed 's/^/  /'
fi

# ----- アクション提案 -----
echo ""
echo "============================================================"
echo -e " 全体: ${C_BLD}${score} 件の警告${C_RST}"
echo "============================================================"

if [[ "$score" -eq 0 ]]; then
  echo -e " ${C_OK}✅ 全項目クリア${C_RST}"
elif [[ "$score" -le 3 ]]; then
  echo -e " ${C_WARN}⚠️  軽度な警告。週次の cleanup で対応可能${C_RST}"
  echo "    bash scripts/storage-cleanup.sh --dry-run"
else
  echo -e " ${C_BAD}❌ 改善必要。governance/10_STORAGE_HYGIENE.md §5-§6 を参照${C_RST}"
  echo "    bash scripts/storage-cleanup.sh"
fi

audit_log "storage_health" "issues=$score disk_free=${DISK_FREE_PCT}% mem_gb=${MEM_GB} swap=${SWAP_PCT}%"

# 警告 4 件以上 で exit 1 (cron アラート連動)
if [[ "$score" -gt 3 ]]; then exit 1; fi
exit 0
