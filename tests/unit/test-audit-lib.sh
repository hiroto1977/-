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

t_rotate_preserves_chain_integrity() {
  # rotate 後も audit-verify が通ること (v15 で修正)
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$AUDIT_LIB'
    audit_log 'old1' 'A'
    audit_log 'old2' 'B'
    audit_log 'recent' 'C'
  "
  python3 -c "
import re
from datetime import datetime, timedelta, timezone
old = (datetime.now(timezone.utc) - timedelta(days=400)).isoformat()
with open('$tmp/audit.jsonl') as f: lines = f.readlines()
for i in [0, 1]:
    lines[i] = re.sub(r'\"ts\":\"[^\"]+\"', f'\"ts\":\"{old}\"', lines[i], count=1)
with open('$tmp/audit.jsonl', 'w') as f: f.writelines(lines)
"
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$AUDIT_LIB'
    audit_rotate 365
  "
  bash "$AUDIT_VERIFY" "$tmp/audit.jsonl" >/dev/null 2>&1
  local rc=$?
  rm -rf "$tmp"
  assert_exit_code "$rc" 0 "rotate 後の verify が通る"
}

t_rotate_inserts_checkpoint() {
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$AUDIT_LIB'
    audit_log 'old' 'A'
    audit_log 'recent' 'B'
  "
  python3 -c "
import re
from datetime import datetime, timedelta, timezone
old = (datetime.now(timezone.utc) - timedelta(days=400)).isoformat()
with open('$tmp/audit.jsonl') as f: lines = f.readlines()
lines[0] = re.sub(r'\"ts\":\"[^\"]+\"', f'\"ts\":\"{old}\"', lines[0], count=1)
with open('$tmp/audit.jsonl', 'w') as f: f.writelines(lines)
"
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$AUDIT_LIB'
    audit_rotate 365
  "
  local first
  first=$(head -1 "$tmp/audit.jsonl")
  rm -rf "$tmp"
  assert_contains "$first" 'audit.rotation.checkpoint' || return 1
  assert_contains "$first" 'old_chain_last=' || return 1
  assert_contains "$first" '"prev_hash":"0000000000000000000000000000000000000000000000000000000000000000"' || return 1
}

t_rotate_noop_if_nothing_to_remove() {
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$AUDIT_LIB'
    audit_log 'a' '1'
    audit_log 'b' '2'
  "
  local before; before=$(wc -l < "$tmp/audit.jsonl")
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$AUDIT_LIB'
    audit_rotate 365
  "
  local after; after=$(wc -l < "$tmp/audit.jsonl")
  rm -rf "$tmp"
  assert_eq "$before" "$after" "no-op (削除対象なし)"
}

t_concurrent_writes_no_race() {
  # 30 並列書込でチェーンが破断しないこと (v17 flock)
  local tmp; tmp=$(mktemp -d)
  for i in $(seq 1 30); do
    AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
      source '$AUDIT_LIB'
      audit_log 'parallel.test' 'i=$i'
    " &
  done
  wait
  local lines
  lines=$(wc -l < "$tmp/audit.jsonl")
  bash "$AUDIT_VERIFY" "$tmp/audit.jsonl" >/dev/null 2>&1
  local rc=$?
  rm -rf "$tmp"
  assert_eq "$lines" "30" "30 行 書込まれた" || return 1
  assert_exit_code "$rc" 0 "30 並列でも verify 通過" || return 1
}

echo "== test-audit-lib =="
run_test "chain intact (3 entries)"           t_chain_intact
run_test "chain break on tamper"              t_chain_break_on_tamper
run_test "AUDIT_LOG_OFF=1 で記録抑止"          t_audit_log_off
run_test "genesis prev_hash = 64 zeros"        t_chain_genesis_zero
run_test "rotate 後 verify が通る"             t_rotate_preserves_chain_integrity
run_test "rotate が checkpoint event を挿入"   t_rotate_inserts_checkpoint
run_test "rotate no-op (削除対象なし)"         t_rotate_noop_if_nothing_to_remove
run_test "30 並列書込でチェーン破断なし"     t_concurrent_writes_no_race
report
