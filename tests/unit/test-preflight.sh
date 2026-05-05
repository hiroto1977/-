#!/usr/bin/env bash
# test-preflight.sh — preflight.sh の出力を検証
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

PREFLIGHT="$ROOT_DIR/scripts/preflight.sh"

t_runs_and_summarizes() {
  local out
  out=$(bash "$PREFLIGHT" 2>&1)
  local rc=$?
  # 0/1/2 いずれでも成立 (環境依存)
  case "$rc" in
    0|1|2) ;;
    *) echo "    unexpected exit $rc"; return 1 ;;
  esac
  assert_contains "$out" "preflight" || return 1
  assert_contains "$out" "Ollama" || return 1
  # Score 行 (PASS / WARN / FAIL を集計)
  assert_match "$out" "PASS|FAIL|WARN|合格|要対処" || return 1
}

t_sections_present() {
  local out
  out=$(bash "$PREFLIGHT" 2>&1)
  # 7 ステップのうち主要なものが出ているか
  assert_contains "$out" "[1/7]" || return 1
  assert_contains "$out" "[2/7]" || return 1
  assert_contains "$out" "CORS" || return 1
}

echo "== test-preflight =="
run_test "runs and produces summary"  t_runs_and_summarizes
run_test "step sections appear"       t_sections_present
report
