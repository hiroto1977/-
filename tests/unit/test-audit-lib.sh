#!/usr/bin/env bash
# test-audit-lib.sh — lib/audit.sh + audit-verify.sh のラウンドトリップ
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

AUDIT_LIB="$ROOT_DIR/scripts/lib/audit.sh"
AUDIT_VERIFY="$ROOT_DIR/scripts/audit-verify.sh"

t_chain_intact() {
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$AUDIT_LIB'
    audit_log 'test.start' 'first'
    audit_log 'test.work' 'with \"quotes\"'
    audit_log 'test.end' 'final'
  "
  assert_eq "$(wc -l < "$tmp/audit.jsonl")" "3" "3 行記録される" || { rm -rf "$tmp"; return 1; }
  bash "$AUDIT_VERIFY" "$tmp/audit.jsonl" >/dev/null 2>&1
  local rc=$?
  rm -rf "$tmp"
  assert_exit_code "$rc" 0 "verify: 改竄前 exit 0" || return 1
}

t_chain_break_on_tamper() {
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$AUDIT_LIB'
    audit_log 'evt1' 'a'
    audit_log 'evt2' 'original'
    audit_log 'evt3' 'b'
  "
  # 行 2 を改竄
  sed -i '2s/original/TAMPERED/' "$tmp/audit.jsonl"
  bash "$AUDIT_VERIFY" "$tmp/audit.jsonl" >/dev/null 2>&1
  local rc=$?
  local out
  out=$(bash "$AUDIT_VERIFY" "$tmp/audit.jsonl" 2>&1)
  rm -rf "$tmp"
  assert_exit_code "$rc" 1 "verify: 改竄後 exit 1" || return 1
  assert_contains "$out" "改竄疑い" || return 1
}

t_audit_log_off() {
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" AUDIT_LOG_OFF=1 bash -c "
    source '$AUDIT_LIB'
    audit_log 'should_be_skipped' 'detail'
  "
  if [[ -f "$tmp/audit.jsonl" ]]; then
    rm -rf "$tmp"
    echo "    AUDIT_LOG_OFF=1 でもログが書かれた"
    return 1
  fi
  rm -rf "$tmp"
  return 0
}

t_chain_genesis_zero() {
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$AUDIT_LIB'
    audit_log 'first' 'entry'
  "
  local first_line
  first_line=$(head -1 "$tmp/audit.jsonl")
  rm -rf "$tmp"
  # 初回エントリの prev_hash は 64 連続のゼロ
  assert_contains "$first_line" '"prev_hash":"0000000000000000000000000000000000000000000000000000000000000000"' || return 1
}

echo "== test-audit-lib =="
run_test "chain intact (3 entries)"           t_chain_intact
run_test "chain break on tamper"              t_chain_break_on_tamper
run_test "AUDIT_LOG_OFF=1 で記録抑止"          t_audit_log_off
run_test "genesis prev_hash = 64 zeros"        t_chain_genesis_zero
report
