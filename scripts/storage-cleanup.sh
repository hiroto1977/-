#!/usr/bin/env bash
# storage-cleanup.sh — 安全削除 (キャッシュ / 一時ファイル / 古いログ)
#
# 既定は --dry-run (削除候補の列挙のみ)。実削除は --apply 必須。
#
# 用法:
#   bash scripts/storage-cleanup.sh                # dry-run (推奨)
#   bash scripts/storage-cleanup.sh --apply         # 実削除
#   bash scripts/storage-cleanup.sh --apply --aggressive  # node_modules 等も
#
# 削除対象 (governance/10_STORAGE_HYGIENE.md §6-1):
#   ~/.cache, ~/Library/Caches, /tmp, npm/pip/brew キャッシュ,
#   Docker 不要, ブラウザキャッシュ (Chromium 系), 90+日 経過の log
#
# 削除しないもの:
#   ~/.ssh, ~/Documents, ~/Desktop, Ollama models, git リポジトリ
#   (governance/10_STORAGE_HYGIENE.md §6-2/§6-3 参照)

set -u
LANG=ja_JP.UTF-8

DRY=1
AGGRESSIVE=0
QUIET=0

for a in "$@"; do
  case "$a" in
    --apply) DRY=0 ;;
    --dry-run) DRY=1 ;;
    --aggressive) AGGRESSIVE=1 ;;
    -q|--quiet) QUIET=1 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "未知: $a" >&2; exit 2 ;;
  esac
done

if [[ -t 1 ]]; then
  C_OK="\033[1;32m"; C_W="\033[1;33m"; C_DIM="\033[2m"; C_BLD="\033[1m"; C_RST="\033[0m"
else
  C_OK=""; C_W=""; C_DIM=""; C_BLD=""; C_RST=""
fi

TOTAL_FREED=0

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

clean_path() {
  local label="$1" path="$2"
  [[ ! -e "$path" ]] && return 0
  local size
  size=$(size_of "$path")
  [[ "$size" -lt 1024 ]] && return 0  # < 1KB はスキップ

  local human_size
  human_size=$(human "$size")

  if [[ "$DRY" -eq 1 ]]; then
    printf "  %s[DRY]%s  削除候補: %-50s %s\n" "$C_W" "$C_RST" "$label" "$human_size"
  else
    if rm -rf "$path" 2>/dev/null; then
      printf "  %s[OK]%s   削除完了: %-50s %s\n" "$C_OK" "$C_RST" "$label" "$human_size"
    else
      printf "  %s[ERR]%s  削除失敗: %s\n" "$C_W" "$C_RST" "$path"
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
      rm -rf "$f" 2>/dev/null
    fi
  done
  if (( count > 0 )); then
    local hs; hs=$(human "$total")
    if [[ "$DRY" -eq 1 ]]; then
      printf "  %s[DRY]%s  削除候補: %-40s %d 件 / %s\n" "$C_W" "$C_RST" "$label" "$count" "$hs"
    else
      printf "  %s[OK]%s   削除完了: %-40s %d 件 / %s\n" "$C_OK" "$C_RST" "$label" "$count" "$hs"
    fi
    TOTAL_FREED=$(( TOTAL_FREED + total ))
  fi
}

# ----- ヘッダ -----
echo "============================================================"
if [[ "$DRY" -eq 1 ]]; then
  echo -e "${C_BLD} Storage Cleanup  ${C_W}[DRY RUN]${C_RST}${C_BLD}  $(date '+%Y-%m-%d %H:%M:%S')${C_RST}"
  echo -e " 実削除するには ${C_BLD}--apply${C_RST} を付けて再実行"
else
  echo -e "${C_BLD} Storage Cleanup  ${C_OK}[APPLY]${C_RST}${C_BLD}  $(date '+%Y-%m-%d %H:%M:%S')${C_RST}"
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
  echo -e " 解放可能 (見込): ${C_BLD}$(human $TOTAL_FREED)${C_RST}"
  echo ""
  echo -e " 実削除する場合: ${C_BLD}bash scripts/storage-cleanup.sh --apply${C_RST}"
else
  echo -e " 解放完了: ${C_BLD}$(human $TOTAL_FREED)${C_RST}"
fi
echo "============================================================"
