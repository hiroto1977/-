#!/usr/bin/env bash
# storage-cleanup.sh — 安全削除 (trash-first)
#
# 既定は --dry-run。実削除は --apply (= ゴミ箱に「移動」)。
# rm -rf は使わず、~/.local/state/storage-hygiene/trash/<ts>/ に移動して
# 30 日 (CLEANUP_TRASH_RETENTION_DAYS) 保管後に永久削除。
#
# 用法:
#   bash scripts/storage-cleanup.sh                  # dry-run
#   bash scripts/storage-cleanup.sh --apply           # ゴミ箱へ移動
#   bash scripts/storage-cleanup.sh --apply --aggressive  # node_modules 等も
#   bash scripts/storage-cleanup.sh --purge-trash      # 30+ 日経過の trash を完全削除
#   bash scripts/storage-cleanup.sh --restore          # 直近の trash を復元
#   bash scripts/storage-cleanup.sh --list-trash       # trash の中身一覧
#
# 削除対象 (governance/10_STORAGE_HYGIENE.md §6-1):
#   ~/.cache, ~/Library/Caches, /tmp, npm/pip/brew キャッシュ,
#   Docker 不要, ブラウザキャッシュ, 90+日 経過の log
#
# 削除しないもの (governance/10 §6-2/§6-3 参照):
#   ~/.ssh, ~/Documents, ~/Desktop, Ollama models, git リポジトリ

set -u
LANG=ja_JP.UTF-8

# Audit logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$SCRIPT_DIR/lib/audit.sh" ]] && source "$SCRIPT_DIR/lib/audit.sh"
type audit_log >/dev/null 2>&1 || audit_log() { :; }

# Trash 設定
TRASH_ROOT="${HOME}/.local/state/storage-hygiene/trash"
CLEANUP_TRASH_RETENTION_DAYS="${CLEANUP_TRASH_RETENTION_DAYS:-30}"
TS=$(date +%Y%m%d-%H%M%S)
THIS_TRASH="${TRASH_ROOT}/${TS}"

DRY=1
AGGRESSIVE=0
QUIET=0
PURGE=0
RESTORE=0
LIST_TRASH=0

for a in "$@"; do
  case "$a" in
    --apply) DRY=0 ;;
    --dry-run) DRY=1 ;;
    --aggressive) AGGRESSIVE=1 ;;
    -q|--quiet) QUIET=1 ;;
    --purge-trash) PURGE=1 ;;
    --restore) RESTORE=1 ;;
    --list-trash) LIST_TRASH=1 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "未知: $a" >&2; exit 2 ;;
  esac
done

audit_log "storage_cleanup.start" "dry=$DRY aggressive=$AGGRESSIVE purge=$PURGE restore=$RESTORE"

if [[ -t 1 ]]; then
  C_OK="\033[1;32m"; C_W="\033[1;33m"; C_E="\033[1;31m"; C_DIM="\033[2m"; C_BLD="\033[1m"; C_RST="\033[0m"
else
  C_OK=""; C_W=""; C_E=""; C_DIM=""; C_BLD=""; C_RST=""
fi

TOTAL_FREED=0

# ===== Trash 管理モード (一気にここで処理) =====

# --list-trash: 中身を表示
if [[ "$LIST_TRASH" -eq 1 ]]; then
  echo "Trash root: $TRASH_ROOT"
  if [[ ! -d "$TRASH_ROOT" ]]; then
    echo "(空)"; exit 0
  fi
  total=$(du -sb "$TRASH_ROOT" 2>/dev/null | awk '{print $1}')
  echo "合計: $(awk -v b="$total" 'BEGIN{printf "%.1f MB",b/1024/1024}')"
  echo ""
  for d in "$TRASH_ROOT"/*; do
    [[ -d "$d" ]] || continue
    s=$(du -sb "$d" 2>/dev/null | awk '{print $1}')
    cnt=$(find "$d" -type f 2>/dev/null | wc -l)
    age=$(( ($(date +%s) - $(stat -c %Y "$d" 2>/dev/null || stat -f %m "$d" 2>/dev/null)) / 86400 ))
    printf "  %s  %d files  %s  (%d 日前)\n" "$(basename "$d")" "$cnt" \
      "$(awk -v b="$s" 'BEGIN{printf "%.1f MB",b/1024/1024}')" "$age"
  done
  exit 0
fi

# --restore: 最新の trash バッチを元の場所に戻す
if [[ "$RESTORE" -eq 1 ]]; then
  if [[ ! -d "$TRASH_ROOT" ]]; then
    echo "trash 空"; exit 0
  fi
  latest=$(ls -1t "$TRASH_ROOT" 2>/dev/null | head -1)
  if [[ -z "$latest" ]]; then
    echo "trash 空"; exit 0
  fi
  manifest="$TRASH_ROOT/$latest/.manifest"
  if [[ ! -f "$manifest" ]]; then
    echo -e "${C_E}❌ manifest 不在: $manifest${C_RST}"
    exit 1
  fi
  echo -e "${C_BLD}復元: $latest${C_RST}"
  while IFS=$'\t' read -r src_in_trash original_path; do
    dest_dir="$(dirname "$original_path")"
    mkdir -p "$dest_dir" 2>/dev/null
    if mv "$src_in_trash" "$original_path" 2>/dev/null; then
      printf "  ${C_OK}✓${C_RST} %s\n" "$original_path"
    else
      printf "  ${C_E}✗${C_RST} %s\n" "$original_path"
    fi
  done < "$manifest"
  audit_log "storage_cleanup.restore" "batch=$latest"
  exit 0
fi

# --purge-trash: retention 経過分を完全削除
if [[ "$PURGE" -eq 1 ]]; then
  if [[ ! -d "$TRASH_ROOT" ]]; then
    echo "trash 空"; exit 0
  fi
  echo -e "${C_BLD}Purge: ${CLEANUP_TRASH_RETENTION_DAYS}+ 日経過の trash を完全削除${C_RST}"
  freed=0
  count=0
  for d in "$TRASH_ROOT"/*; do
    [[ -d "$d" ]] || continue
    age=$(( ($(date +%s) - $(stat -c %Y "$d" 2>/dev/null || stat -f %m "$d" 2>/dev/null)) / 86400 ))
    if (( age >= CLEANUP_TRASH_RETENTION_DAYS )); then
      s=$(du -sb "$d" 2>/dev/null | awk '{print $1}')
      if [[ "$DRY" -eq 1 ]]; then
        printf "  ${C_W}[DRY]${C_RST} %s (%d 日)  %s\n" "$(basename "$d")" "$age" \
          "$(awk -v b="$s" 'BEGIN{printf "%.1f MB",b/1024/1024}')"
      else
        rm -rf "$d" && {
          printf "  ${C_OK}[OK]${C_RST}  %s (%d 日)  %s\n" "$(basename "$d")" "$age" \
            "$(awk -v b="$s" 'BEGIN{printf "%.1f MB",b/1024/1024}')"
          freed=$((freed + s))
          count=$((count + 1))
        }
      fi
    fi
  done
  echo ""
  if [[ "$DRY" -eq 0 ]]; then
    audit_log "storage_cleanup.purge" "batches=$count bytes=$freed"
    echo -e " ${C_OK}解放: $(awk -v b="$freed" 'BEGIN{printf "%.1f MB",b/1024/1024}') / $count バッチ${C_RST}"
  else
    echo -e " ${C_DIM}実行: --purge-trash --apply${C_RST}"
  fi
  exit 0
fi

# ----- ヘルパ -----
human() {
  awk -v b="$1" 'BEGIN{
    if (b<1024) printf "%d B",b;
    else if (b<1024*1024) printf "%.1f KB",b/1024;
    else if (b<1024*1024*1024) printf "%.1f MB",b/1024/1024;
    else printf "%.2f GB",b/1024/1024/1024;
  }'
}

size_of() {
  local p="$1"
  [[ -e "$p" ]] || { echo "0"; return; }
  du -sb "$p" 2>/dev/null | awk '{print $1}'
}

# --apply モードのとき、初回のみ trash バッチ ディレクトリを作成
_ensure_trash_batch() {
  [[ "$DRY" -eq 1 ]] && return 0
  if [[ ! -d "$THIS_TRASH" ]]; then
    mkdir -p "$THIS_TRASH" 2>/dev/null
    : > "$THIS_TRASH/.manifest"
    audit_log "storage_cleanup.batch_open" "batch=$TS dir=$THIS_TRASH"
  fi
}

# trash へ移動 (rm -rf の代わり)。manifest に記録して --restore 可能に
_trash_move() {
  local src="$1"
  _ensure_trash_batch
  # 元パスを safe な相対パスに変換: /home/user/.cache → home_user_.cache
  local rel
  rel=$(echo "$src" | sed 's|^/||; s|/|__|g')
  local dest="$THIS_TRASH/$rel"
  mkdir -p "$(dirname "$dest")" 2>/dev/null
  if mv "$src" "$dest" 2>/dev/null; then
    printf '%s\t%s\n' "$dest" "$src" >> "$THIS_TRASH/.manifest"
    return 0
  else
    return 1
  fi
}

clean_path() {
  local label="$1" path="$2"
  [[ ! -e "$path" ]] && return 0
  local size
  size=$(size_of "$path")
  [[ "$size" -lt 1024 ]] && return 0  # < 1KB はスキップ

  local human_size
  human_size=$(human "$size")

  if [[ "$DRY" -eq 1 ]]; then
    printf "  %s[DRY]%s  退避候補: %-50s %s\n" "$C_W" "$C_RST" "$label" "$human_size"
  else
    if _trash_move "$path"; then
      printf "  %s[OK]%s   trash 退避: %-48s %s\n" "$C_OK" "$C_RST" "$label" "$human_size"
      audit_log "storage_cleanup.trashed" "path=$path bytes=$size batch=$TS"
    else
      printf "  %s[ERR]%s  退避失敗: %s\n" "$C_E" "$C_RST" "$path"
      return 1
    fi
  fi
  TOTAL_FREED=$(( TOTAL_FREED + size ))
  return 0
}

clean_glob() {
  local label="$1" pattern="$2"
  local total=0 count=0 f
  for f in $pattern; do
    [[ -e "$f" ]] || continue
    local s
    s=$(size_of "$f")
    total=$((total + s))
    count=$((count + 1))
    if [[ "$DRY" -eq 0 ]]; then
      _trash_move "$f" || continue
    fi
  done
  if (( count > 0 )); then
    local hs; hs=$(human "$total")
    if [[ "$DRY" -eq 1 ]]; then
      printf "  %s[DRY]%s  退避候補: %-40s %d 件 / %s\n" "$C_W" "$C_RST" "$label" "$count" "$hs"
    else
      printf "  %s[OK]%s   trash 退避: %-38s %d 件 / %s\n" "$C_OK" "$C_RST" "$label" "$count" "$hs"
      audit_log "storage_cleanup.trashed_glob" "label=$label count=$count bytes=$total batch=$TS"
    fi
    TOTAL_FREED=$(( TOTAL_FREED + total ))
  fi
}

# ----- ヘッダ -----
echo "============================================================"
if [[ "$DRY" -eq 1 ]]; then
  echo -e "${C_BLD} Storage Cleanup  ${C_W}[DRY RUN]${C_RST}${C_BLD}  $(date '+%Y-%m-%d %H:%M:%S')${C_RST}"
  echo -e " 実行 (trash 退避): ${C_BLD}--apply${C_RST}"
else
  echo -e "${C_BLD} Storage Cleanup  ${C_OK}[APPLY → trash-first]${C_RST}${C_BLD}  $(date '+%Y-%m-%d %H:%M:%S')${C_RST}"
  echo -e " trash: ${C_DIM}${THIS_TRASH}${C_RST}"
fi
echo "============================================================"

# ----- 1. 汎用 キャッシュ -----
echo ""
echo -e "${C_BLD}■ 汎用キャッシュ${C_RST}"
clean_path "~/.cache (Linux/Generic)"           "$HOME/.cache"
clean_path "~/Library/Caches (macOS user)"      "$HOME/Library/Caches"

# ----- 2. /tmp -----
echo ""
echo -e "${C_BLD}■ /tmp${C_RST}"
clean_glob "/tmp/* (current user 所有)"          "/tmp/$USER-*"
# /tmp/* 全体は権限の関係で慎重に
clean_glob "/tmp/tmp.*"                          "/tmp/tmp.*"
clean_glob "/tmp/*.log"                          "/tmp/*.log"

# ----- 3. パッケージ マネージャ キャッシュ -----
echo ""
echo -e "${C_BLD}■ パッケージ マネージャ${C_RST}"
clean_path "npm キャッシュ (~/.npm)"             "$HOME/.npm/_cacache"
clean_path "npm logs (~/.npm/_logs)"             "$HOME/.npm/_logs"
clean_path "yarn キャッシュ"                      "$HOME/.cache/yarn"
clean_path "pip キャッシュ"                       "$HOME/.cache/pip"
clean_path "pip wheels"                           "$HOME/.cache/wheels"
clean_path "Cargo registry (~/.cargo/registry)"  "$HOME/.cargo/registry/cache"
clean_path "Go ビルドキャッシュ (~/.cache/go-build)" "$HOME/.cache/go-build"
clean_path "Gradle キャッシュ"                    "$HOME/.gradle/caches"
clean_path "Maven local"                          "$HOME/.m2/repository"

# Homebrew (実コマンドで)
if command -v brew >/dev/null 2>&1; then
  if [[ "$DRY" -eq 1 ]]; then
    local_brew_size=$(brew --cache 2>/dev/null | xargs du -sb 2>/dev/null | awk '{print $1}')
    [[ -n "$local_brew_size" ]] && printf "  %s[DRY]%s  brew cleanup --prune=all                            %s\n" "$C_W" "$C_RST" "$(human ${local_brew_size:-0})"
  else
    brew cleanup --prune=all 2>/dev/null | tail -1
    printf "  %s[OK]%s   brew cleanup 実行\n" "$C_OK" "$C_RST"
  fi
fi

# ----- 4. ブラウザ キャッシュ (慎重に - cookie/履歴は残す) -----
echo ""
echo -e "${C_BLD}■ ブラウザ キャッシュ${C_RST}"
# Chrome / Chromium / Edge / Brave は ~/Library や ~/.config 配下
for browser in \
  "$HOME/.cache/google-chrome/Default/Cache" \
  "$HOME/.cache/chromium/Default/Cache" \
  "$HOME/.cache/microsoft-edge/Default/Cache" \
  "$HOME/.cache/BraveSoftware/Brave-Browser/Default/Cache" \
  "$HOME/Library/Caches/Google/Chrome/Default" \
  "$HOME/Library/Caches/com.brave.Browser" \
  "$HOME/Library/Caches/com.microsoft.edgemac"; do
  [[ -e "$browser" ]] && clean_path "$(basename $(dirname $browser))/Cache" "$browser"
done

# ----- 5. ログファイル -----
echo ""
echo -e "${C_BLD}■ ログ (90+ 日 経過)${C_RST}"
# 90 日以上前のログを find で
if [[ -d "$HOME/.local/share" ]]; then
  count=0
  total=0
  while IFS= read -r -d '' f; do
    s=$(size_of "$f")
    total=$((total + s))
    count=$((count + 1))
    [[ "$DRY" -eq 0 ]] && rm -f "$f" 2>/dev/null
  done < <(find "$HOME/.local/share" -type f -name '*.log' -mtime +90 -print0 2>/dev/null)
  if (( count > 0 )); then
    if [[ "$DRY" -eq 1 ]]; then
      printf "  %s[DRY]%s  削除候補: ~/.local/share/**/*.log (90+日) %d 件 / %s\n" "$C_W" "$C_RST" "$count" "$(human $total)"
    else
      printf "  %s[OK]%s   削除完了: ~/.local/share/**/*.log %d 件 / %s\n" "$C_OK" "$C_RST" "$count" "$(human $total)"
    fi
    TOTAL_FREED=$((TOTAL_FREED + total))
  fi
fi

# ----- 6. Docker (要 docker コマンド) -----
if command -v docker >/dev/null 2>&1; then
  echo ""
  echo -e "${C_BLD}■ Docker${C_RST}"
  if docker info >/dev/null 2>&1; then
    if [[ "$DRY" -eq 1 ]]; then
      docker_size=$(docker system df 2>/dev/null | awk 'NR>1 {gsub(/[A-Z]/,"",$NF); sum+=$NF} END {print sum*1024*1024*1024}')
      printf "  %s[DRY]%s  docker system prune -af --volumes (推定 %s)\n" "$C_W" "$C_RST" "$(human ${docker_size:-0})"
      printf "          %s※ 実行中のコンテナは保護される%s\n" "$C_DIM" "$C_RST"
    else
      printf "  実行: docker system prune -af --volumes\n"
      docker system prune -af --volumes 2>&1 | tail -3 | sed 's/^/    /'
    fi
  else
    printf "  %s[skip]%s  docker daemon が起動していない\n" "$C_DIM" "$C_RST"
  fi
fi

# ----- 7. Aggressive モード -----
if [[ "$AGGRESSIVE" -eq 1 ]]; then
  echo ""
  echo -e "${C_BLD}■ ${C_W}Aggressive${C_RST}${C_BLD} (要注意 — node_modules 等)${C_RST}"
  # ホーム配下の node_modules で 30+ 日 atime 経過
  count=0
  total=0
  while IFS= read -r -d '' d; do
    s=$(size_of "$d")
    total=$((total + s))
    count=$((count + 1))
    [[ "$DRY" -eq 0 ]] && rm -rf "$d" 2>/dev/null
  done < <(find "$HOME" -maxdepth 5 -type d -name 'node_modules' -atime +30 -prune -print0 2>/dev/null)
  if (( count > 0 )); then
    label="node_modules (30+ 日 未使用)"
    if [[ "$DRY" -eq 1 ]]; then
      printf "  %s[DRY]%s  %-50s %d 件 / %s\n" "$C_W" "$C_RST" "$label" "$count" "$(human $total)"
    else
      printf "  %s[OK]%s   %-50s %d 件 / %s\n" "$C_OK" "$C_RST" "$label" "$count" "$(human $total)"
    fi
    TOTAL_FREED=$((TOTAL_FREED + total))
  fi
fi

# ----- サマリ -----
echo ""
echo "============================================================"
if [[ "$DRY" -eq 1 ]]; then
  echo -e " 退避候補 合計: ${C_BLD}$(human $TOTAL_FREED)${C_RST}"
  echo ""
  echo -e " 実行する場合: ${C_BLD}bash scripts/storage-cleanup.sh --apply${C_RST}"
else
  echo -e " trash 退避 完了: ${C_BLD}$(human $TOTAL_FREED)${C_RST}"
  echo -e " ${C_DIM}復元: --restore  /  完全削除: --purge-trash --apply (${CLEANUP_TRASH_RETENTION_DAYS}+ 日経過分)${C_RST}"
  audit_log "storage_cleanup.summary" "trashed_bytes=$TOTAL_FREED batch=$TS"
fi
echo "============================================================"
