#!/usr/bin/env bash
# test-funding-deadline.sh
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

FUNDING="$ROOT_DIR/scripts/funding-deadline.sh"

t_init_creates_csv() {
  local tmp; tmp=$(mktemp -d)
  bash "$FUNDING" --init --csv "$tmp/test.csv" >/dev/null 2>&1
  assert_file_exists "$tmp/test.csv" "--init で CSV 生成" || { rm -rf "$tmp"; return 1; }
  rm -rf "$tmp"
}

t_classifies_dates() {
  local tmp; tmp=$(mktemp -d)
  local TODAY PAST SOON WARN LATER
  TODAY=$(date +%Y-%m-%d)
  PAST=$(date -d "$TODAY - 5 days" +%Y-%m-%d 2>/dev/null || date -j -v-5d -f "%Y-%m-%d" "$TODAY" +%Y-%m-%d)
  SOON=$(date -d "$TODAY + 3 days" +%Y-%m-%d 2>/dev/null || date -j -v+3d -f "%Y-%m-%d" "$TODAY" +%Y-%m-%d)
  WARN=$(date -d "$TODAY + 20 days" +%Y-%m-%d 2>/dev/null || date -j -v+20d -f "%Y-%m-%d" "$TODAY" +%Y-%m-%d)
  LATER=$(date -d "$TODAY + 90 days" +%Y-%m-%d 2>/dev/null || date -j -v+90d -f "%Y-%m-%d" "$TODAY" +%Y-%m-%d)
  cat > "$tmp/test.csv" <<EOF
案件名,種別,期限,状態,担当者,メモ
過去案件,補助金,$PAST,期限切れ,自分,テスト
緊急,助成金,$SOON,提出直前,自分,3 日後
注意,融資,$WARN,書類整備,自分,20 日後
通常,補助金,$LATER,検討開始,自分,90 日後
EOF
  local out
  out=$(bash "$FUNDING" --csv "$tmp/test.csv" 2>&1)
  rm -rf "$tmp"
  assert_contains "$out" "期限超過" || return 1
  assert_contains "$out" "急ぎ" || return 1
  assert_contains "$out" "注意" || return 1
  assert_contains "$out" "余裕あり" || return 1
}

t_exit_1_on_urgent() {
  local tmp; tmp=$(mktemp -d)
  local TODAY SOON
  TODAY=$(date +%Y-%m-%d)
  SOON=$(date -d "$TODAY + 1 days" +%Y-%m-%d 2>/dev/null || date -j -v+1d -f "%Y-%m-%d" "$TODAY" +%Y-%m-%d)
  cat > "$tmp/test.csv" <<EOF
案件名,種別,期限,状態,担当者,メモ
緊急案件,補助金,$SOON,提出直前,自分,1 日後
EOF
  bash "$FUNDING" --csv "$tmp/test.csv" >/dev/null 2>&1
  local rc=$?
  rm -rf "$tmp"
  assert_exit_code "$rc" 1 "急ぎ案件あり → exit 1" || return 1
}

echo "== test-funding-deadline =="
run_test "--init creates sample CSV"             t_init_creates_csv
run_test "classifies past/urgent/warn/normal"    t_classifies_dates
run_test "exit 1 when urgent items exist"        t_exit_1_on_urgent
report
