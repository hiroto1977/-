#!/usr/bin/env bash
# pii-scan.sh — ファイル / ディレクトリから PII (個人情報) パターンを検出
#
# 用法:
#   bash scripts/pii-scan.sh <パス1> [パス2] ...
#   bash scripts/pii-scan.sh --staged           # git ステージ済の差分のみ
#   bash scripts/pii-scan.sh --diff             # git のすべての変更
#
# 検出対象 (パターン):
#   - マイナンバー風 (12 桁数字 ハイフンあり/なし)
#   - クレジットカード番号 (Luhn 検証あり)
#   - メールアドレス
#   - 日本の電話番号 (固定 / 携帯)
#   - 銀行口座 (7 桁)
#   - パスポート番号風
#   - API キー (sk-..., AIza..., ghp_..., xoxb-..., 一般的な Bearer)
#   - JWT
#
# 終了コード:
#   0: 検出なし (またはホワイトリスト一致)
#   1: 検出あり (CI で fail させる用)
#   2: 引数不正

set -u
LANG=ja_JP.UTF-8

# Audit logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$SCRIPT_DIR/lib/audit.sh" ]] && source "$SCRIPT_DIR/lib/audit.sh"
type audit_log >/dev/null 2>&1 || audit_log() { :; }
audit_log "pii_scan.start" "args=$*"

if [[ $# -lt 1 ]]; then
  echo "用法: $0 <パス1> [パス2] ..." >&2
  echo "      $0 --staged" >&2
  echo "      $0 --diff" >&2
  audit_log "pii_scan.usage" "missing args"
  exit 2
fi

# Colors
if [[ -t 1 ]]; then C_HIT="\033[1;31m"; C_INFO="\033[1;36m"; C_RST="\033[0m"
else C_HIT=""; C_INFO=""; C_RST=""; fi

# 対象ファイル収集
TARGETS=()
case "$1" in
  --staged)
    while IFS= read -r f; do TARGETS+=("$f"); done < <(git diff --cached --name-only --diff-filter=ACM)
    ;;
  --diff)
    while IFS= read -r f; do TARGETS+=("$f"); done < <(git diff --name-only --diff-filter=ACM HEAD)
    ;;
  *)
    for arg in "$@"; do
      if [[ -d "$arg" ]]; then
        while IFS= read -r f; do TARGETS+=("$f"); done < <(find "$arg" -type f \
          \( -name '*.md' -o -name '*.txt' -o -name '*.json' -o -name '*.csv' \
             -o -name '*.html' -o -name '*.js' -o -name '*.ts' -o -name '*.py' \
             -o -name '*.sh' -o -name '*.yml' -o -name '*.yaml' -o -name '*.env*' \) 2>/dev/null)
      elif [[ -f "$arg" ]]; then
        TARGETS+=("$arg")
      else
        echo "(スキップ: $arg は存在しない)" >&2
      fi
    done
    ;;
esac

if [[ "${#TARGETS[@]}" -eq 0 ]]; then
  echo "(走査対象ファイルなし)"
  exit 0
fi

echo -e "${C_INFO}走査対象: ${#TARGETS[@]} ファイル${C_RST}"

HIT=0

# Luhn アルゴリズム検証 (クレカ番号判定の補強)
luhn_check() {
  local n="$1"
  n=${n//[^0-9]/}
  local len=${#n}
  if [[ $len -lt 13 || $len -gt 19 ]]; then return 1; fi
  local sum=0 alt=0
  for ((i=len-1; i>=0; i--)); do
    local d=${n:$i:1}
    if (( alt == 1 )); then
      d=$((d * 2))
      (( d > 9 )) && d=$((d - 9))
    fi
    sum=$((sum + d))
    alt=$((1 - alt))
  done
  (( sum % 10 == 0 ))
}

# パターン定義 (POSIX BRE/ERE)
declare -A PATTERNS=(
  ["マイナンバー風 (12 桁)"]="(^|[^0-9])[0-9]{4}[-]?[0-9]{4}[-]?[0-9]{4}([^0-9]|$)"
  ["メールアドレス"]="[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"
  ["日本の固定電話"]="(^|[^0-9])0[1-9][0-9]{0,3}-[0-9]{1,4}-[0-9]{4}([^0-9]|$)"
  ["日本の携帯電話"]="(^|[^0-9])0[789]0-[0-9]{4}-[0-9]{4}([^0-9]|$)"
  ["銀行口座 (7 桁)"]="(口座|普通|当座)[^0-9]{0,5}[0-9]{7}([^0-9]|$)"
  ["パスポート番号風"]="(^|[^A-Z0-9])[A-Z]{2}[0-9]{7}([^A-Z0-9]|$)"
  ["健康保険証 番号 / 記号"]="(保険者番号|健康保険|被保険者証)[^0-9]{0,10}[0-9]{6,8}"
  ["API キー: sk-... (Anthropic/OpenAI)"]="sk-(ant-)?[A-Za-z0-9_-]{20,}"
  ["API キー: AIza... (Google)"]="AIza[0-9A-Za-z_-]{35}"
  ["API キー: ghp_... (GitHub PAT)"]="gh[pousr]_[A-Za-z0-9]{36,}"
  ["API キー: xoxb-... (Slack)"]="xox[baprs]-[A-Za-z0-9-]{10,}"
  ["JWT トークン"]="eyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}"
  ["AWS Access Key ID"]="(AKIA|ASIA)[0-9A-Z]{16}"
  ["GCP Service Account JSON"]="\"type\"[[:space:]]*:[[:space:]]*\"service_account\""
  ["JKS keystore 設定"]="(keystoreType[[:space:]]*=[[:space:]]*JKS|keyStorePassword[[:space:]]*=|key[Ss]tore\\.path)"
  ["秘密鍵 BEGIN ブロック"]="-----BEGIN [A-Z ]*PRIVATE KEY-----"
)

# ホワイトリスト (誤検知パターン)
WHITELIST_REGEX='\.lock$|\.min\.js$|node_modules|\.git/|テスト[ _]太郎|0X0-XXXX-XXXX|\[氏名|example\.com|test@|0{32,}'

scan_file() {
  local f="$1"
  # ホワイトリスト パスはスキップ
  echo "$f" | grep -qE "$WHITELIST_REGEX" && return 0
  # バイナリは grep -aI でテキスト部のみ
  local label
  for label in "${!PATTERNS[@]}"; do
    local pattern="${PATTERNS[$label]}"
    local matches
    matches=$(grep -anHE -e "$pattern" "$f" 2>/dev/null | grep -vE "$WHITELIST_REGEX" || true)
    [[ -z "$matches" ]] && continue

    # クレカは Luhn で再検証
    if [[ "$label" == "クレジットカード番号 (Luhn)" ]]; then
      local filtered=""
      while IFS= read -r line; do
        local nums
        nums=$(echo "$line" | grep -oE '[0-9]{13,19}')
        for n in $nums; do
          if luhn_check "$n"; then filtered+="$line"$'\n'; break; fi
        done
      done <<< "$matches"
      matches="$filtered"
      [[ -z "$matches" ]] && continue
    fi

    while IFS= read -r m; do
      [[ -z "$m" ]] && continue
      echo -e "  ${C_HIT}[$label]${C_RST} $m"
      HIT=$((HIT+1))
    done <<< "$matches"
  done
}

# クレカパターンを別途追加 (Luhn 検証フィールド)
PATTERNS["クレジットカード番号 (Luhn)"]="[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}"

for f in "${TARGETS[@]}"; do
  scan_file "$f"
done

echo ""
if [[ "$HIT" -eq 0 ]]; then
  echo "✅ PII らしきパターンの検出なし"
  audit_log "pii_scan.clean" "files=${#TARGETS[@]}"
  exit 0
else
  echo "❌ ${HIT} 件の疑わしいパターンを検出"
  echo ""
  echo "対処:"
  echo "  - 検出値が本物の機密なら削除またはマスキング"
  echo "  - テスト用ダミーで誤検知なら governance/05_TEMPLATES.md の命名規則に置換"
  echo "  - ホワイトリストに追加すべきなら scripts/pii-scan.sh の WHITELIST_REGEX を更新"
  audit_log "pii_scan.hits" "files=${#TARGETS[@]} hits=$HIT"
  exit 1
fi
