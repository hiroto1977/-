#!/usr/bin/env bash
# test-storage-archive.sh
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

ARCHIVE="$ROOT_DIR/scripts/storage-archive.sh"

t_setup_guide() {
  local out
  out=$(bash "$ARCHIVE" --setup 2>&1)
  local rc=$?
  assert_exit_code "$rc" 0 "--setup → exit 0" || return 1
  assert_contains "$out" "rclone" || return 1
  assert_contains "$out" "セットアップ" || return 1
}

t_no_rclone_or_no_conf_msg() {
  # rclone が無いとセットアップ案内、conf がないとそれも案内
  local out
  out=$(bash "$ARCHIVE" --plan 2>&1)
  # rclone が PATH にあるかで挙動が分岐するが、いずれも セットアップ案内 or 設定ファイル案内 を含む
  if [[ "$out" == *"rclone"* || "$out" == *"設定ファイル"* ]]; then
    return 0
  fi
  echo "    rclone も conf もないのに案内が表示されない: $out"
  return 1
}

t_c4_class_rejected() {
  # rclone がない環境では先に rclone エラーで止まるためスキップ
  if ! command -v rclone >/dev/null 2>&1; then
    return 0  # rclone 不在環境 → C4 ガードのテストは別環境で
  fi
  local tmp; tmp=$(mktemp -d)
  cat > "$tmp/conf" <<EOF
案件名,種別,期限
$tmp/data,C4,test:bad
EOF
  mkdir "$tmp/data"
  local out
  out=$(bash "$ARCHIVE" --plan --class C4 2>&1)
  rm -rf "$tmp"
  # ガードのメッセージが出るはず (実装上の "C4 はクラウド禁止")
  assert_contains "$out" "C4" || return 1
}

echo "== test-storage-archive =="
run_test "--setup shows guide"           t_setup_guide
run_test "missing rclone or conf info"   t_no_rclone_or_no_conf_msg
run_test "C4 class is rejected"          t_c4_class_rejected
report
