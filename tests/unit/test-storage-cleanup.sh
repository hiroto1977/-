#!/usr/bin/env bash
# test-storage-cleanup.sh
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

CLEANUP="$ROOT_DIR/scripts/storage-cleanup.sh"

t_dry_run_default() {
  local tmp; tmp=$(mktemp -d)
  mkdir -p "$tmp/.cache/foo"
  dd if=/dev/zero of="$tmp/.cache/foo/big.bin" bs=1024 count=10 2>/dev/null
  local out
  out=$(HOME="$tmp" bash "$CLEANUP" 2>&1)
  rm -rf "$tmp"
  assert_contains "$out" "DRY RUN" || return 1
  assert_contains "$out" "退避候補" || return 1
}

t_apply_moves_to_trash() {
  local tmp; tmp=$(mktemp -d)
  mkdir -p "$tmp/.cache/bar"
  dd if=/dev/zero of="$tmp/.cache/bar/file.bin" bs=1024 count=10 2>/dev/null
  HOME="$tmp" bash "$CLEANUP" --apply >/dev/null 2>&1
  # .cache が消えて trash に移動されたか
  if [[ -e "$tmp/.cache/bar/file.bin" ]]; then
    rm -rf "$tmp"
    echo "    元のファイルが残っている"
    return 1
  fi
  # trash バッチが存在
  if [[ ! -d "$tmp/.local/state/storage-hygiene/trash" ]]; then
    rm -rf "$tmp"
    echo "    trash ディレクトリが作成されていない"
    return 1
  fi
  local trash_files
  trash_files=$(find "$tmp/.local/state/storage-hygiene/trash" -type f -name "*.bin" 2>/dev/null | wc -l)
  rm -rf "$tmp"
  assert_eq "$trash_files" "1" "trash 配下に 1 ファイル退避" || return 1
}

t_restore_brings_back() {
  local tmp; tmp=$(mktemp -d)
  mkdir -p "$tmp/.cache/baz"
  dd if=/dev/zero of="$tmp/.cache/baz/restore-me.bin" bs=1024 count=10 2>/dev/null
  HOME="$tmp" bash "$CLEANUP" --apply >/dev/null 2>&1
  HOME="$tmp" bash "$CLEANUP" --restore >/dev/null 2>&1
  local restored=0
  [[ -f "$tmp/.cache/baz/restore-me.bin" ]] && restored=1
  rm -rf "$tmp"
  assert_eq "$restored" "1" "--restore で元の場所に戻る" || return 1
}

t_list_trash_runs() {
  local tmp; tmp=$(mktemp -d)
  HOME="$tmp" bash "$CLEANUP" --list-trash >/dev/null 2>&1
  local rc=$?
  rm -rf "$tmp"
  assert_exit_code "$rc" 0 "--list-trash は trash 空でも exit 0" || return 1
}

t_purge_trash_dry_run() {
  local tmp; tmp=$(mktemp -d)
  mkdir -p "$tmp/.local/state/storage-hygiene/trash/old-batch"
  # 古いバッチを擬似 (atime/mtime を 60 日前に)
  touch -t 202509010000 "$tmp/.local/state/storage-hygiene/trash/old-batch"
  local out
  out=$(HOME="$tmp" bash "$CLEANUP" --purge-trash 2>&1)
  rm -rf "$tmp"
  assert_contains "$out" "Purge" || return 1
}

echo "== test-storage-cleanup =="
run_test "dry-run is default (no rm)"         t_dry_run_default
run_test "--apply moves to trash (no rm)"     t_apply_moves_to_trash
run_test "--restore brings files back"        t_restore_brings_back
run_test "--list-trash exits 0 even if empty" t_list_trash_runs
run_test "--purge-trash dry-run"              t_purge_trash_dry_run
report
