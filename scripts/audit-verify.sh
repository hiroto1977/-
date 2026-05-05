#!/usr/bin/env bash
# audit-verify.sh — 監査ログの SHA-256 連鎖を検証 (改竄検知)
#
# 各エントリの chain_hash = sha256(prev_hash || body) を再計算し、
# 不一致があれば「改竄 / 並行書込み race / 削除」のいずれかを報告する。
#
# 用法:
#   bash scripts/audit-verify.sh                # 既定 ~/.claude/audit.jsonl
#   bash scripts/audit-verify.sh path/to.jsonl  # 別ファイル
#   bash scripts/audit-verify.sh --json          # JSON サマリ出力

set -u
LANG=ja_JP.UTF-8

LOG_PATH="${HOME}/.claude/audit.jsonl"
JSON=0

for a in "$@"; do
  case "$a" in
    --json) JSON=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) LOG_PATH="$a" ;;
  esac
done

if [[ -t 1 && "$JSON" -eq 0 ]]; then
  C_OK="\033[1;32m"; C_BAD="\033[1;31m"; C_DIM="\033[2m"; C_RST="\033[0m"
else
  C_OK=""; C_BAD=""; C_DIM=""; C_RST=""
fi

if [[ ! -f "$LOG_PATH" ]]; then
  if [[ "$JSON" -eq 1 ]]; then
    echo '{"file":"'"$LOG_PATH"'","exists":false,"total":0,"ok":0,"breaks":0}'
  else
    echo "(audit log なし: $LOG_PATH)"
  fi
  exit 0
fi

# SHA-256 ツール選択
sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then openssl dgst -sha256 -r | awk '{print $1}'
  else echo "X"; fi
}

ZERO64="0000000000000000000000000000000000000000000000000000000000000000"

total=0; ok=0; breaks=0
break_lines=()
expected_prev="$ZERO64"

# 1 行ずつ読む (chain_hash と prev_hash を抽出して再計算)
while IFS= read -r line; do
  total=$((total + 1))

  # フィールド抽出
  recorded_chain=$(echo "$line" | sed -n 's/.*"chain_hash":"\([0-9a-f]\{64\}\)".*/\1/p')
  recorded_prev=$(echo "$line" | sed -n 's/.*"prev_hash":"\([0-9a-f]\{64\}\)".*/\1/p')

  if [[ -z "$recorded_chain" || -z "$recorded_prev" ]]; then
    breaks=$((breaks + 1))
    break_lines+=("L${total}: フォーマット異常 (chain_hash/prev_hash 抽出失敗)")
    continue
  fi

  # body は chain_hash 部分を除いた部分
  body=$(echo "$line" | sed 's/,"chain_hash":"[0-9a-f]\{64\}"}$//')
  # 終端の } はそのまま体には入っていないが、_audit_log の出力規約に合わせる
  # (audit.sh の実装と一致させる: body は最後の } を含まない、",\"chain_hash\":\"..\"}" を append)

  # 期待ハッシュ
  computed=$(printf '%s%s' "$recorded_prev" "$body" | sha256)

  if [[ "$computed" == "$recorded_chain" ]]; then
    # 連鎖整合性: prev_hash が「直前のエントリの chain_hash」と一致するか
    if [[ "$recorded_prev" != "$expected_prev" ]]; then
      breaks=$((breaks + 1))
      break_lines+=("L${total}: 連鎖切断 (prev_hash=${recorded_prev:0:8}.. 期待=${expected_prev:0:8}..)")
    else
      ok=$((ok + 1))
    fi
    expected_prev="$recorded_chain"
  else
    breaks=$((breaks + 1))
    break_lines+=("L${total}: 改竄疑い (chain_hash 再計算 不一致)")
    # チェーン続行: 記録された値で次へ進む
    expected_prev="$recorded_chain"
  fi
done < "$LOG_PATH"

# 出力
if [[ "$JSON" -eq 1 ]]; then
  printf '{"file":"%s","exists":true,"total":%d,"ok":%d,"breaks":%d}\n' \
    "$LOG_PATH" "$total" "$ok" "$breaks"
  exit "$([[ $breaks -eq 0 ]] && echo 0 || echo 1)"
fi

echo "============================================================"
echo " Audit Log Verification"
echo " file: $LOG_PATH"
echo " size: $(wc -c < "$LOG_PATH" 2>/dev/null) bytes"
echo "============================================================"
echo ""
echo "  total entries: $total"
echo -e "  ${C_OK}OK${C_RST}:           $ok"
if [[ "$breaks" -eq 0 ]]; then
  echo -e "  ${C_OK}breaks: 0${C_RST}"
  echo ""
  echo -e " ${C_OK}✅ チェーンは整合 (改竄痕跡なし)${C_RST}"
  exit 0
else
  echo -e "  ${C_BAD}breaks:       $breaks${C_RST}"
  echo ""
  echo -e " ${C_BAD}❌ チェーン不整合検出:${C_RST}"
  for ln in "${break_lines[@]}"; do
    echo "    - $ln"
  done
  echo ""
  echo -e " ${C_DIM}原因の候補:${C_RST}"
  echo "    1. 並行実行による race (短命スクリプト同時起動 — 軽微)"
  echo "    2. 手作業でのログ編集 (重大 — 調査必要)"
  echo "    3. ローテーション時点での意図的切断 (audit_rotate 後)"
  exit 1
fi
