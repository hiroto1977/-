#!/usr/bin/env bash
# test-pii-scan.sh
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

PII_SCAN="$ROOT_DIR/scripts/pii-scan.sh"

t_help() {
  bash "$PII_SCAN" --help 2>&1 > /dev/null  # exits 2 with no args; --help should also work via the "$1" path... actually let's just check 0-args usage is consistent
  return 0
}

t_no_args_returns_2() {
  bash "$PII_SCAN" >/dev/null 2>&1
  assert_exit_code "$?" 2 "no args → exit 2"
}

t_negative_fixture() {
  local out
  out=$(bash "$PII_SCAN" "$ROOT_DIR/tests/fixtures/pii-negative.txt" 2>&1)
  local rc=$?
  assert_exit_code "$rc" 0 "negative fixture → exit 0" || return 1
  assert_contains "$out" "PII らしきパターンの検出なし" || return 1
}

t_positive_fixture_detects() {
  local out
  out=$(bash "$PII_SCAN" "$ROOT_DIR/tests/fixtures/pii-positive.txt" 2>&1)
  local rc=$?
  assert_exit_code "$rc" 1 "positive fixture → exit 1" || return 1
  # 主要パターンが拾えているか
  assert_contains "$out" "携帯電話" || return 1
  assert_contains "$out" "メールアドレス" || return 1
  assert_contains "$out" "Anthropic" || return 1
  assert_contains "$out" "GitHub PAT" || return 1
  assert_contains "$out" "JWT" || return 1
  assert_contains "$out" "AWS Access Key ID" || return 1
  assert_contains "$out" "GCP Service Account" || return 1
  assert_contains "$out" "JKS keystore" || return 1
  assert_contains "$out" "健康保険証" || return 1
  assert_contains "$out" "秘密鍵 BEGIN" || return 1
}

t_whitelist_zero_hash() {
  local tmp; tmp=$(mktemp)
  echo "ZERO=0000000000000000000000000000000000000000000000000000000000000000" > "$tmp"
  local out
  out=$(bash "$PII_SCAN" "$tmp" 2>&1)
  local rc=$?
  rm -f "$tmp"
  assert_exit_code "$rc" 0 "all-zero 64hex は whitelist 適用される" || return 1
}

echo "== test-pii-scan =="
run_test "no args returns 2"           t_no_args_returns_2
run_test "negative fixture clean"      t_negative_fixture
run_test "positive fixture detects 10+ patterns"  t_positive_fixture_detects
run_test "zero-hash whitelisted"       t_whitelist_zero_hash
report
