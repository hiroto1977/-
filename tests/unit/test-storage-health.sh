#!/usr/bin/env bash
# test-storage-health.sh
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

HEALTH="$ROOT_DIR/scripts/storage-health.sh"

t_runs_clean() {
  local out
  out=$(bash "$HEALTH" 2>&1)
  local rc=$?
  # 警告 4+ で exit 1、それ以下は 0
  [[ "$rc" -eq 0 || "$rc" -eq 1 ]] || { echo "    unexpected exit $rc"; return 1; }
  assert_contains "$out" "Storage Health" || return 1
  assert_contains "$out" "ディスク 空き容量" || return 1
}

t_json_output() {
  local out
  out=$(bash "$HEALTH" --json 2>&1)
  local rc=$?
  [[ "$rc" -eq 0 || "$rc" -eq 1 ]] || return 1
  # JSON の主要フィールド
  assert_contains "$out" '"timestamp":' || return 1
  assert_contains "$out" '"disk":' || return 1
  assert_contains "$out" '"memory":' || return 1
  assert_contains "$out" '"overall_issues":' || return 1
  # python で JSON パース可能か
  echo "$out" | python3 -c 'import sys, json; json.load(sys.stdin)' || return 1
}

t_verbose_lists_files() {
  local out
  out=$(bash "$HEALTH" --verbose 2>&1)
  assert_contains "$out" "大型ファイル" || return 1
}

echo "== test-storage-health =="
run_test "runs and shows health summary"  t_runs_clean
run_test "--json outputs valid JSON"      t_json_output
run_test "--verbose lists large files"    t_verbose_lists_files
report
