#!/usr/bin/env bash
# test-storage-orchestrator.sh
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

ORCH="$ROOT_DIR/scripts/storage-orchestrator.sh"

t_help() {
  local out
  out=$(bash "$ORCH" --help 2>&1)
  local rc=$?
  # --help は 0 で抜ける
  assert_exit_code "$rc" 0 "--help → exit 0" || return 1
  assert_contains "$out" "storage-orchestrator" || return 1
  assert_contains "$out" "routine" || return 1
}

t_unknown_routine_rejected() {
  bash "$ORCH" --routine bogus >/dev/null 2>&1
  local rc=$?
  # 未知のルーティンは拒否される (exit 2)
  assert_exit_code "$rc" 2 "未知ルーティン → exit 2" || return 1
}

t_routine_daily_runs_health() {
  # daily は health のみを呼ぶ。出力に Storage Health の文字列があれば成功
  local out
  out=$(bash "$ORCH" --routine daily 2>&1)
  local rc=$?
  # health が exit 1 を返してもオーケストレータは継続するので 0/1 どちらも可
  case "$rc" in
    0|1) ;;
    *) echo "    予期しない exit: $rc"; return 1 ;;
  esac
  assert_contains "$out" "Storage Health" || return 1
}

t_dry_run_does_not_delete() {
  # --dry-run で起動し、ホームディレクトリに何かが消えていないことを確認
  local tmp; tmp=$(mktemp -d)
  mkdir -p "$tmp/.cache/marker"
  touch "$tmp/.cache/marker/keep.bin"
  HOME="$tmp" timeout 30 bash "$ORCH" --dry-run --routine weekly >/dev/null 2>&1 || true
  if [[ ! -f "$tmp/.cache/marker/keep.bin" ]]; then
    rm -rf "$tmp"; echo "    --dry-run でファイルが消えた"; return 1
  fi
  rm -rf "$tmp"
}

t_monthly_block_includes_audit() {
  # コードレベル sniff: monthly ブロックに audit_rotate と audit.backup が含まれる
  grep -A 30 "monthly)" "$ORCH" | head -30 > /tmp/orch_monthly.$$
  if ! grep -q "audit_rotate\|audit.rotate" /tmp/orch_monthly.$$; then
    rm -f /tmp/orch_monthly.$$; echo "    monthly に audit_rotate なし"; return 1
  fi
  if ! grep -q "audit.jsonl.bak\|audit.backup" /tmp/orch_monthly.$$; then
    rm -f /tmp/orch_monthly.$$; echo "    monthly に audit backup なし"; return 1
  fi
  rm -f /tmp/orch_monthly.$$
  return 0
}

echo "== test-storage-orchestrator =="
run_test "--help が usage を出す"            t_help
run_test "未知 routine → exit 2"             t_unknown_routine_rejected
run_test "daily が storage-health を呼ぶ"   t_routine_daily_runs_health
run_test "--dry-run でファイルが消えない"   t_dry_run_does_not_delete
run_test "monthly に audit rotate + backup" t_monthly_block_includes_audit
report
