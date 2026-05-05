#!/usr/bin/env bash
# storage-archive.sh — クラス別アーカイブ (rclone 経由)
#
# governance/02_DATA_CLASSIFICATION.md と 10_STORAGE_HYGIENE.md §3 の方針に従い、
# データクラス別 に異なる宛先 + 暗号化要件で アーカイブ層 へ移動する。
#
# 用法:
#   storage-archive.sh --plan                    # アーカイブ計画を表示 (dry-run)
#   storage-archive.sh --class C2 --apply         # C2 のみ実行
#   storage-archive.sh --class C3 --apply         # C3 (暗号化必須)
#   storage-archive.sh --setup                   # rclone 初期設定ガイドを表示
#
# 設定ファイル: ~/.config/storage-archive.conf
# (ディレクトリ → クラス → リモート の対応)

set -u
LANG=ja_JP.UTF-8

# Audit logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$SCRIPT_DIR/lib/audit.sh" ]] && source "$SCRIPT_DIR/lib/audit.sh"
type audit_log >/dev/null 2>&1 || audit_log() { :; }
audit_log "storage_archive.start" "args=$*"

CONF="${HOME}/.config/storage-archive.conf"
DRY=1
TARGET_CLASS=""
SETUP=0

for a in "$@"; do
  case "$a" in
    --plan|--dry-run) DRY=1 ;;
    --apply) DRY=0 ;;
    --setup) SETUP=1 ;;
    --class) shift_next=1 ;;
    --class=*) TARGET_CLASS="${a#--class=}" ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *)
      if [[ "${shift_next:-0}" -eq 1 ]]; then
        TARGET_CLASS="$a"; shift_next=0
      else
        echo "未知: $a" >&2; exit 2
      fi
      ;;
  esac
done

if [[ -t 1 ]]; then
  C_OK="\033[1;32m"; C_W="\033[1;33m"; C_E="\033[1;31m"
  C_DIM="\033[2m"; C_BLD="\033[1m"; C_RST="\033[0m"
else
  C_OK=""; C_W=""; C_E=""; C_DIM=""; C_BLD=""; C_RST=""
fi

# ----- セットアップ ガイド -----
if [[ "$SETUP" -eq 1 ]]; then
cat <<EOF
${C_BLD}storage-archive.sh セットアップ ガイド${C_RST}

1. rclone インストール
   curl https://rclone.org/install.sh | sudo bash

2. 通常の クラウド リモート 作成 (例: Google Drive)
   rclone config
   → name: drive-raw
   → type: drive
   → 認証

3. クライアント側暗号化 レイヤ (C2/C3 用)
   rclone config
   → name: drive-crypt
   → type: crypt
   → remote: drive-raw:archive-encrypted
   → password: ${C_E}ランダム生成、パスワードマネージャ保存${C_RST}
   → password2 (salt): ${C_E}別のランダム値、別場所保存${C_RST}

   ${C_W}⚠️ 鍵を失うと永久復号不能${C_RST}
   ${C_W}   → パスワードマネージャ + 紙のオフライン控え${C_RST}

4. 設定ファイルを作成
   ~/.config/storage-archive.conf に以下を保存:

   ----- ここから -----
   # storage-archive 設定
   # 形式: <ローカルパス>|<データクラス>|<rclone リモート名>
   # 暗号化必須クラス (C3) は crypt リモート を指定
   # 公開可能クラス (C0/C1) は素のリモート で良い

   ${HOME}/work/C0_public/old|C0|drive-raw:archive-public
   ${HOME}/work/C1_internal/old|C1|drive-raw:archive-internal
   ${HOME}/work/C2_partner/old|C2|drive-crypt:partner
   ${HOME}/work/C3_confidential/old|C3|drive-crypt:confidential

   # C4 は クラウド禁止 — このスクリプトは触らない
   ----- ここまで -----

5. 計画を確認
   bash scripts/storage-archive.sh --plan

6. 実行
   bash scripts/storage-archive.sh --apply
EOF
exit 0
fi

# ----- rclone 存在確認 -----
if ! command -v rclone >/dev/null 2>&1; then
  echo -e "${C_E}❌ rclone が見つかりません${C_RST}"
  echo ""
  echo "インストール手順を確認するには: --setup"
  echo "  bash scripts/storage-archive.sh --setup"
  exit 1
fi

# ----- 設定ファイル -----
if [[ ! -f "$CONF" ]]; then
  echo -e "${C_W}⚠️  設定ファイルが見つかりません: $CONF${C_RST}"
  echo ""
  echo "セットアップ ガイドを表示: bash scripts/storage-archive.sh --setup"
  exit 1
fi

# ----- ヘッダ -----
echo "============================================================"
if [[ "$DRY" -eq 1 ]]; then
  echo -e "${C_BLD} Storage Archive  ${C_W}[PLAN]${C_RST}${C_BLD}  $(date '+%Y-%m-%d %H:%M:%S')${C_RST}"
  echo -e " 実行するには ${C_BLD}--apply${C_RST}"
else
  echo -e "${C_BLD} Storage Archive  ${C_OK}[APPLY]${C_RST}${C_BLD}  $(date '+%Y-%m-%d %H:%M:%S')${C_RST}"
fi
echo "============================================================"

if [[ -n "$TARGET_CLASS" ]]; then
  echo -e " 対象クラス: ${C_BLD}$TARGET_CLASS${C_RST}"
fi
echo ""

# ----- 設定読み込み + 実行 -----
total_size=0
total_jobs=0
processed=0

while IFS='|' read -r path class remote; do
  # 空行・コメント スキップ
  [[ -z "$path" || "${path:0:1}" == "#" ]] && continue
  total_jobs=$((total_jobs + 1))

  # クラス フィルタ
  if [[ -n "$TARGET_CLASS" && "$class" != "$TARGET_CLASS" ]]; then
    continue
  fi

  # C4 ガード
  if [[ "$class" == "C4" ]]; then
    echo -e " ${C_E}❌ C4 はクラウド禁止 — スキップ: $path${C_RST}"
    continue
  fi

  # ソースが存在するか
  if [[ ! -e "$path" ]]; then
    echo -e " ${C_DIM}・ ソース未存在: $path${C_RST}"
    continue
  fi

  # 暗号化チェック
  needs_crypt=0
  if [[ "$class" == "C2" || "$class" == "C3" ]]; then
    needs_crypt=1
    if [[ "$remote" != *crypt* ]]; then
      echo -e " ${C_E}❌ $class は暗号化リモート必須だが '$remote' は crypt に見えない: $path${C_RST}"
      continue
    fi
  fi

  # サイズ
  size=$(du -sb "$path" 2>/dev/null | awk '{print $1}')
  human=$(awk -v b="$size" 'BEGIN{
    if (b<1024*1024) printf "%.1f KB",b/1024;
    else if (b<1024*1024*1024) printf "%.1f MB",b/1024/1024;
    else printf "%.2f GB",b/1024/1024/1024;
  }')
  total_size=$((total_size + size))

  printf " ${C_BLD}[%s]${C_RST} %s\n" "$class" "$path"
  printf "    → %s\n" "$remote"
  printf "    %s%s%s%s\n" "$C_DIM" "$human" "$( [[ $needs_crypt -eq 1 ]] && echo " / 暗号化"; )" "$C_RST"

  if [[ "$DRY" -eq 0 ]]; then
    # アーカイブ実行
    echo -e "    ${C_OK}実行中…${C_RST}"
    if rclone copy "$path" "$remote" --progress --transfers 4 --checkers 8; then
      echo -e "    ${C_OK}✅ アップロード完了${C_RST}"
      audit_log "storage_archive.copy" "class=$class src=$path remote=$remote bytes=$size"
      # ローカル コピーは削除しない (3-2-1 の原則: アーカイブは追加)
      # 削除する場合は別途人間判断で。
      processed=$((processed + 1))
    else
      echo -e "    ${C_E}❌ rclone 失敗${C_RST}"
      audit_log "storage_archive.failed" "class=$class src=$path remote=$remote"
    fi
  fi
  echo ""
done < "$CONF"

# ----- サマリ -----
human_total=$(awk -v b="$total_size" 'BEGIN{
  if (b<1024*1024*1024) printf "%.1f MB",b/1024/1024;
  else printf "%.2f GB",b/1024/1024/1024;
}')

echo "============================================================"
if [[ "$DRY" -eq 1 ]]; then
  echo -e " 計画: ${C_BLD}${total_jobs}${C_RST} ジョブ / 合計 ${C_BLD}${human_total}${C_RST}"
  echo -e " ${C_DIM}実行は --apply を付加${C_RST}"
else
  echo -e " 完了: ${C_BLD}${processed}/${total_jobs}${C_RST} ジョブ"
fi
echo "============================================================"

# 注意書き
if [[ "$DRY" -eq 0 && "$processed" -gt 0 ]]; then
  echo ""
  echo -e " ${C_W}重要:${C_RST} アーカイブ後にローカル削除する場合は人間が判断してください"
  echo "        (3-2-1 の "1" として残しておくのが原則)"
fi
