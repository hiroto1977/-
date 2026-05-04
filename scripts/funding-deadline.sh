#!/usr/bin/env bash
# funding-deadline.sh — 補助金 / 助成金 / 融資の期限を追跡し、近づいた期限を通知
#
# 用途:
#   週次で実行 (cron 推奨)。期限が指定日数以内のものをハイライト。
#   データソース: ~/.funding-deadlines.csv (ユーザー編集)
#
# CSV フォーマット (1 行 1 案件):
#   案件名,種別,期限(YYYY-MM-DD),状態,担当者,メモ
#   例:
#   ものづくり補助金 2026Q2,補助金,2026-06-30,申請準備,山田,事業計画書 80% 完成
#   IT 導入補助金 通常枠,補助金,2026-07-15,検討中,田中,要事業者選定
#   公庫設備資金,融資,2026-05-20,書類準備,自分,残高 1500 万円分
#
# 用法:
#   bash scripts/funding-deadline.sh                  # デフォルト 30 日以内を表示
#   bash scripts/funding-deadline.sh 7                 # 7 日以内
#   bash scripts/funding-deadline.sh --csv path.csv    # 別 CSV 指定
#   bash scripts/funding-deadline.sh --init            # サンプル CSV 作成

set -u
LANG=ja_JP.UTF-8

CSV="${HOME}/.funding-deadlines.csv"
WARN_DAYS=30

# Colors
if [[ -t 1 ]]; then
  C_RED="\033[1;31m"; C_YEL="\033[1;33m"; C_GRN="\033[1;32m"
  C_DIM="\033[2m"; C_BLD="\033[1m"; C_RST="\033[0m"
else
  C_RED=""; C_YEL=""; C_GRN=""; C_DIM=""; C_BLD=""; C_RST=""
fi

# 引数処理
while [[ $# -gt 0 ]]; do
  case "$1" in
    --csv) CSV="$2"; shift 2 ;;
    --init) shift; INIT=1 ;;
    -h|--help)
      sed -n '2,30p' "$0"; exit 0 ;;
    [0-9]*) WARN_DAYS="$1"; shift ;;
    *) echo "未知のオプション: $1" >&2; exit 2 ;;
  esac
done

# 初期化モード
if [[ "${INIT:-0}" -eq 1 ]]; then
  if [[ -f "$CSV" ]]; then
    echo "既に存在します: $CSV"
    exit 1
  fi
  cat > "$CSV" <<'EOF'
# 補助金/助成金/融資 期限管理
# 1 行 1 案件、# で始まる行はコメント
# フォーマット: 案件名,種別,期限,状態,担当者,メモ
案件名,種別,期限,状態,担当者,メモ
ものづくり補助金 2026Q2,補助金,2026-06-30,申請準備,山田,事業計画書 80% 完成
IT 導入補助金 通常枠,補助金,2026-07-15,検討中,田中,要事業者選定
公庫設備資金,融資,2026-05-20,書類準備,自分,残高 1500 万円分
キャリアアップ助成金 (正社員化),助成金,2026-08-31,計画届提出済,佐藤,A さん 6 ヶ月経過後
EOF
  echo "サンプル CSV を作成しました: $CSV"
  echo "編集してから 'bash $0' を再実行してください。"
  exit 0
fi

if [[ ! -f "$CSV" ]]; then
  echo -e "${C_YEL}⚠️${C_RST}  期限 CSV が存在しません: $CSV"
  echo "    'bash $0 --init' でサンプルを作成できます。"
  exit 1
fi

TODAY=$(date +%Y-%m-%d)

echo "============================================================"
echo -e "${C_BLD} 資金調達 期限ダッシュボード${C_RST}"
echo "  本日: $TODAY  /  警告閾値: ${WARN_DAYS} 日以内"
echo "  ソース: $CSV"
echo "============================================================"

# 集計
URGENT=()    # 7 日以内
WARN=()      # 警告閾値以内
NORMAL=()    # それ以遠
PAST=()      # 期限超過

while IFS=, read -r name kind due status owner memo; do
  # スキップ条件: コメント行、ヘッダ、空行
  [[ -z "${name:-}" ]] && continue
  [[ "$name" == \#* ]] && continue
  [[ "$name" == "案件名" ]] && continue

  # 期限のパース
  if ! due_epoch=$(date -d "$due" +%s 2>/dev/null) && \
     ! due_epoch=$(date -j -f "%Y-%m-%d" "$due" +%s 2>/dev/null); then
    echo -e "${C_DIM}(skip: 日付パース失敗 $due  $name)${C_RST}"
    continue
  fi
  today_epoch=$(date +%s)
  diff_days=$(( (due_epoch - today_epoch) / 86400 ))

  line=$(printf "  %-12s %s  [%s] %s\n      → %s (%s)" \
    "$kind" "$due (${diff_days}日)" "${status:-}" "$name" "${owner:-}" "${memo:-}")

  if (( diff_days < 0 )); then
    PAST+=("$line")
  elif (( diff_days <= 7 )); then
    URGENT+=("$line")
  elif (( diff_days <= WARN_DAYS )); then
    WARN+=("$line")
  else
    NORMAL+=("$line")
  fi
done < "$CSV"

# 出力
print_section() {
  local title="$1" color="$2"
  shift 2
  if [[ $# -gt 0 ]]; then
    echo ""
    echo -e "${color}${title}${C_RST}"
    for ln in "$@"; do echo -e "$ln"; done
  fi
}

print_section "🚨 期限超過 (要 即時対応)"      "$C_RED" "${PAST[@]:-}"
print_section "🔥 急ぎ (7 日以内)"               "$C_RED" "${URGENT[@]:-}"
print_section "⚠️  注意 (${WARN_DAYS} 日以内)"   "$C_YEL" "${WARN[@]:-}"
print_section "✅ 余裕あり"                      "$C_GRN" "${NORMAL[@]:-}"

# 集計サマリ
echo ""
echo "============================================================"
echo -e " 件数: 期限超過 ${#PAST[@]} / 急ぎ ${#URGENT[@]} / 注意 ${#WARN[@]} / 余裕 ${#NORMAL[@]}"
echo "============================================================"

# 異常 (期限超過 or 急ぎ) があれば exit 1 で cron アラート連動可
if [[ ${#PAST[@]} -gt 0 || ${#URGENT[@]} -gt 0 ]]; then
  exit 1
fi
exit 0
