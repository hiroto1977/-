#!/usr/bin/env bash
# test-inv3-audit-start.sh — INV-3 検証
# governance/12 §1.1 で定義された「ユーザー実行型 script」全てが
# 冒頭で audit_log "<name>.start" を呼んでいることを機械検証。
# INV: INV-3: user-script (8 本) が audit_log "*.start" を呼ぶ
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

# §1.1 で列挙された 8 本 (audit-verify は循環防止のため除外、これは仕様)
USER_SCRIPTS=(
  preflight.sh
  pii-scan.sh
  storage-health.sh
  storage-cleanup.sh
  storage-archive.sh
  storage-orchestrator.sh
  funding-deadline.sh
  install-hooks.sh
)

t_all_user_scripts_have_start_audit() {
  local fail=0
  for s in "${USER_SCRIPTS[@]}"; do
    local f="$ROOT_DIR/scripts/$s"
    if [[ ! -f "$f" ]]; then
      echo "    存在しない script: $s"
      fail=1
      continue
    fi
    # ファイル中に audit_log "*.start" 呼び出しがあるか (コメント以外で)
    if ! grep -E '^[[:space:]]*audit_log[[:space:]]+["'\''"][^"'\'']+\.start' "$f" >/dev/null; then
      echo "    INV-3 違反: $s に audit_log \"<name>.start\" がない"
      fail=1
    fi
  done
  return $fail
}

t_audit_verify_is_excluded() {
  # audit-verify.sh は逆に start audit を持たないこと (循環防止)
  local f="$ROOT_DIR/scripts/audit-verify.sh"
  assert_file_exists "$f" "audit-verify.sh 存在" || return 1
  if head -50 "$f" | grep -qE 'audit_log[[:space:]]+["'\''"][^"'\'']+\.start'; then
    echo "    audit-verify は start audit を持たないはず (循環)"
    return 1
  fi
  return 0
}

echo "== test-inv3-audit-start =="
run_test "8 本のユーザー実行型 script 全てに audit_log .start" t_all_user_scripts_have_start_audit
run_test "audit-verify.sh は start audit を持たない (例外)"   t_audit_verify_is_excluded
report
