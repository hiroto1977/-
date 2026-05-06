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
#
# v25 から: 内部実装を Python に切替 (bash で 2200 行 30s → Python 1s 未満)
#          出力フォーマット は完全互換、bash entry も維持

set -u
LANG=ja_JP.UTF-8

LOG_PATH="${HOME}/.claude/audit.jsonl"
JSON=0

for a in "$@"; do
  case "$a" in
    --json) JSON=1 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) LOG_PATH="$a" ;;
  esac
done

if [[ ! -f "$LOG_PATH" ]]; then
  if [[ "$JSON" -eq 1 ]]; then
    echo '{"file":"'"$LOG_PATH"'","exists":false,"total":0,"ok":0,"breaks":0}'
  else
    echo "(audit log なし: $LOG_PATH)"
  fi
  exit 0
fi

# Python が無い場合は (極稀) bash 実装にフォールバック
if ! command -v python3 >/dev/null 2>&1; then
  echo "warning: python3 がない、bash 実装にフォールバック (遅い)" >&2
  # bash フォールバック (旧実装と同じ)
  if [[ -t 1 && "$JSON" -eq 0 ]]; then
    C_OK="\033[1;32m"; C_BAD="\033[1;31m"; C_DIM="\033[2m"; C_RST="\033[0m"
  else
    C_OK=""; C_BAD=""; C_DIM=""; C_RST=""
  fi
  sha256() {
    if command -v sha256sum >/dev/null 2>&1; then sha256sum | awk '{print $1}'
    elif command -v shasum >/dev/null 2>&1; then shasum -a 256 | awk '{print $1}'
    elif command -v openssl >/dev/null 2>&1; then openssl dgst -sha256 -r | awk '{print $1}'
    else echo "X"; fi
  }
  ZERO64="0000000000000000000000000000000000000000000000000000000000000000"
  total=0; ok=0; breaks=0; break_lines=(); expected_prev="$ZERO64"
  while IFS= read -r line; do
    total=$((total + 1))
    recorded_chain=$(echo "$line" | sed -n 's/.*"chain_hash":"\([0-9a-f]\{64\}\)".*/\1/p')
    recorded_prev=$(echo "$line" | sed -n 's/.*"prev_hash":"\([0-9a-f]\{64\}\)".*/\1/p')
    if [[ -z "$recorded_chain" || -z "$recorded_prev" ]]; then
      breaks=$((breaks + 1))
      break_lines+=("L${total}: フォーマット異常")
      continue
    fi
    body=$(echo "$line" | sed 's/,"chain_hash":"[0-9a-f]\{64\}"}$//')
    computed=$(printf '%s%s' "$recorded_prev" "$body" | sha256)
    if [[ "$computed" == "$recorded_chain" ]]; then
      if [[ "$recorded_prev" != "$expected_prev" ]]; then
        breaks=$((breaks + 1))
        break_lines+=("L${total}: 連鎖切断 (prev_hash=${recorded_prev:0:8}.. 期待=${expected_prev:0:8}..)")
      else
        ok=$((ok + 1))
      fi
      expected_prev="$recorded_chain"
    else
      breaks=$((breaks + 1))
      break_lines+=("L${total}: 改竄疑い")
      expected_prev="$recorded_chain"
    fi
  done < "$LOG_PATH"
  if [[ "$JSON" -eq 1 ]]; then
    printf '{"file":"%s","exists":true,"total":%d,"ok":%d,"breaks":%d}\n' "$LOG_PATH" "$total" "$ok" "$breaks"
    exit "$([[ $breaks -eq 0 ]] && echo 0 || echo 1)"
  fi
  echo "============================================================"
  echo " Audit Log Verification (bash fallback)"
  echo " file: $LOG_PATH"
  echo "============================================================"
  echo "  total entries: $total"
  echo -e "  OK:           $ok"
  if [[ "$breaks" -eq 0 ]]; then
    echo "  breaks: 0"
    echo " ✅ チェーンは整合 (改竄痕跡なし)"
    exit 0
  else
    echo "  breaks:       $breaks"
    echo " ❌ チェーン不整合検出:"
    for ln in "${break_lines[@]}"; do echo "    - $ln"; done
    echo "    1. 並行実行による race (短命スクリプト同時起動 — 軽微)"
    echo "    2. 手作業でのログ編集 (重大 — 調査必要)"
    echo "    3. ローテーション時点での意図的切断 (audit_rotate 後)"
    exit 1
  fi
fi

# ── Python 高速実装 (通常パス) ──
exec python3 - "$LOG_PATH" "$JSON" <<'PY'
import sys, hashlib, re, os
log_path = sys.argv[1]
json_mode = sys.argv[2] == "1"

ZERO64 = "0" * 64
RE_CHAIN = re.compile(r'"chain_hash":"([0-9a-f]{64})"')
RE_PREV = re.compile(r'"prev_hash":"([0-9a-f]{64})"')
RE_TAIL = re.compile(r',"chain_hash":"[0-9a-f]{64}"\}$')

# 色 (TTY のみ)
isatty = sys.stdout.isatty() and not json_mode
C_OK = "\033[1;32m" if isatty else ""
C_BAD = "\033[1;31m" if isatty else ""
C_DIM = "\033[2m" if isatty else ""
C_RST = "\033[0m" if isatty else ""

total = 0
ok = 0
breaks = 0
break_lines = []
expected_prev = ZERO64

with open(log_path, "r", encoding="utf-8") as f:
    for line in f:
        line = line.rstrip("\n")
        if not line:
            continue
        total += 1

        m_chain = RE_CHAIN.search(line)
        m_prev = RE_PREV.search(line)
        if not m_chain or not m_prev:
            breaks += 1
            break_lines.append(f"L{total}: フォーマット異常 (chain_hash/prev_hash 抽出失敗)")
            continue

        recorded_chain = m_chain.group(1)
        recorded_prev = m_prev.group(1)
        body = RE_TAIL.sub("", line)

        computed = hashlib.sha256((recorded_prev + body).encode("utf-8")).hexdigest()

        if computed == recorded_chain:
            if recorded_prev != expected_prev:
                breaks += 1
                break_lines.append(
                    f"L{total}: 連鎖切断 (prev_hash={recorded_prev[:8]}.. 期待={expected_prev[:8]}..)"
                )
            else:
                ok += 1
            expected_prev = recorded_chain
        else:
            breaks += 1
            break_lines.append(f"L{total}: 改竄疑い (chain_hash 再計算 不一致)")
            expected_prev = recorded_chain

if json_mode:
    print(f'{{"file":"{log_path}","exists":true,"total":{total},"ok":{ok},"breaks":{breaks}}}')
    sys.exit(0 if breaks == 0 else 1)

size = os.path.getsize(log_path)
print("============================================================")
print(" Audit Log Verification")
print(f" file: {log_path}")
print(f" size: {size} bytes")
print("============================================================")
print()
print(f"  total entries: {total}")
print(f"  {C_OK}OK{C_RST}:           {ok}")
if breaks == 0:
    print(f"  {C_OK}breaks: 0{C_RST}")
    print()
    print(f" {C_OK}✅ チェーンは整合 (改竄痕跡なし){C_RST}")
    sys.exit(0)

print(f"  {C_BAD}breaks:       {breaks}{C_RST}")
print()
print(f" {C_BAD}❌ チェーン不整合検出:{C_RST}")
for ln in break_lines:
    print(f"    - {ln}")
print()
print(f" {C_DIM}原因の候補:{C_RST}")
print("    1. 並行実行による race (短命スクリプト同時起動 — 軽微)")
print("    2. 手作業でのログ編集 (重大 — 調査必要)")
print("    3. ローテーション時点での意図的切断 (audit_rotate 後)")
sys.exit(1)
PY
