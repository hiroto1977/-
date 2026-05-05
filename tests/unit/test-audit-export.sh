#!/usr/bin/env bash
# test-audit-export.sh
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

EXPORT="$ROOT_DIR/scripts/audit-export.sh"

t_no_args_returns_2() {
  bash "$EXPORT" >/dev/null 2>&1
  assert_exit_code "$?" 2 "no args → exit 2"
}

t_creates_tarball() {
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$ROOT_DIR/scripts/lib/audit.sh'
    audit_log 'sample.evt' 'detail'
  "
  HOME="$tmp" AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$EXPORT" "$tmp/out" >/dev/null 2>&1
  local rc=$?
  if [[ "$rc" -ne 0 ]]; then
    rm -rf "$tmp"; echo "    export 失敗 (rc=$rc)"; return 1
  fi
  local arch
  arch=$(find "$tmp/out" -name "audit-export-*.tar.gz" | head -1)
  if [[ -z "$arch" ]]; then
    rm -rf "$tmp"; echo "    アーカイブが作成されていない"; return 1
  fi
  # manifest sidecar も存在
  local mani
  mani=$(find "$tmp/out" -name "*.manifest.json" | head -1)
  if [[ -z "$mani" ]]; then
    rm -rf "$tmp"; echo "    manifest sidecar が無い"; return 1
  fi
  # 中身チェック: audit.jsonl が含まれている
  local has_audit
  has_audit=$(tar -tzf "$arch" | grep -c "audit.jsonl$")
  if [[ "$has_audit" -lt 1 ]]; then
    rm -rf "$tmp"; echo "    アーカイブに audit.jsonl が無い"; return 1
  fi
  rm -rf "$tmp"
  return 0
}

t_includes_backups() {
  local tmp; tmp=$(mktemp -d)
  # ダミーの audit.jsonl と バックアップを 2 件作る
  mkdir -p "$tmp/.claude/audit-backups"
  echo '{"ts":"2026-01-01","event":"x"}' > "$tmp/.claude/audit.jsonl"
  echo '{"ts":"2025-11-01","event":"old1"}' > "$tmp/.claude/audit-backups/audit.jsonl.bak.202511"
  echo '{"ts":"2025-12-01","event":"old2"}' > "$tmp/.claude/audit-backups/audit.jsonl.bak.202512"
  HOME="$tmp" AUDIT_LOG_PATH="$tmp/.claude/audit.jsonl" bash "$EXPORT" "$tmp/out" >/dev/null 2>&1
  local arch
  arch=$(find "$tmp/out" -name "audit-export-*.tar.gz" | head -1)
  local count
  count=$(tar -tzf "$arch" | grep -c "audit.jsonl.bak.")
  rm -rf "$tmp"
  assert_eq "$count" "2" "月次 .bak が 2 件含まれる" || return 1
}

t_manifest_has_sha256() {
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$ROOT_DIR/scripts/lib/audit.sh'
    audit_log 'a' 'b'
  "
  HOME="$tmp" AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$EXPORT" "$tmp/out" >/dev/null 2>&1
  local mani
  mani=$(find "$tmp/out" -name "*.manifest.json" | head -1)
  local out
  out=$(cat "$mani")
  rm -rf "$tmp"
  assert_contains "$out" '"sha256"' || return 1
  assert_contains "$out" '"exported_at"' || return 1
  # JSON として妥当
  echo "$out" | python3 -c 'import sys, json; json.load(sys.stdin)' || return 1
}

echo "== test-audit-export =="
run_test "no args returns 2"         t_no_args_returns_2
run_test "tarball + manifest 出力"   t_creates_tarball
run_test "月次 .bak が含まれる"      t_includes_backups
run_test "manifest に sha256 + JSON 妥当" t_manifest_has_sha256
report
