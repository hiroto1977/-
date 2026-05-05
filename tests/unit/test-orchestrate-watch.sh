#!/usr/bin/env bash
# test-orchestrate-watch.sh
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

WATCH="$ROOT_DIR/scripts/orchestrate-watch.sh"
ORCH="$ROOT_DIR/scripts/orchestrate.sh"

t_help() {
  bash "$WATCH" --help >/dev/null 2>&1
  assert_exit_code "$?" 0 "--help → 0"
}

t_thresholds_show() {
  local out
  out=$(bash "$WATCH" --thresholds 2>&1)
  assert_contains "$out" "W2 chat.error" || return 1
  assert_contains "$out" "W4 PII" || return 1
}

t_once_clean_returns_0() {
  # 空の audit.jsonl を作って 4 項目すべて skip / ok になる
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$ROOT_DIR/scripts/lib/audit.sh'
    audit_log 'pii_scan.clean' 'files=1'
  "
  local out rc
  out=$(AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WATCH" --once 2>&1)
  rc=$?
  rm -rf "$tmp"
  assert_exit_code "$rc" 0 "クリーン状態で exit 0" || return 1
  assert_contains "$out" "全項目 OK" || return 1
}

t_once_detects_audit_tamper() {
  # チェーン破壊 → W1 で BREACH
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$ROOT_DIR/scripts/lib/audit.sh'
    audit_log 'a' '1'
    audit_log 'b' 'original'
    audit_log 'c' '3'
  "
  sed -i '2s/original/TAMPERED/' "$tmp/audit.jsonl"
  local out rc
  out=$(AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WATCH" --once 2>&1)
  rc=$?
  rm -rf "$tmp"
  assert_exit_code "$rc" 1 "tamper 検出 → exit 1" || return 1
  assert_contains "$out" "audit_chain_broken" || return 1
}

t_once_detects_chat_error_storm() {
  # chat.error を閾値以上 → W2 で BREACH
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$ROOT_DIR/scripts/lib/audit.sh'
    for i in 1 2 3 4 5 6; do audit_log 'chat.error' \"err\$i\"; done
  "
  local out rc
  out=$(WATCH_CHAT_ERROR_LIMIT=5 AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WATCH" --once 2>&1)
  rc=$?
  rm -rf "$tmp"
  assert_exit_code "$rc" 1 "storm 検出 → exit 1" || return 1
  assert_contains "$out" "chat_error_storm" || return 1
}

t_once_detects_inv12_violation() {
  # 同 issue を複数チームが scoped → W3 で BREACH
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --emit team.alpha.1.scoped "issue=999 priority=high" >/dev/null 2>&1
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --emit team.beta.1.scoped  "issue=999 priority=high" >/dev/null 2>&1
  local out rc
  out=$(AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WATCH" --once 2>&1)
  rc=$?
  rm -rf "$tmp"
  assert_exit_code "$rc" 1 "INV-12 違反 → exit 1" || return 1
  assert_contains "$out" "inv12_concurrent_scope" || return 1
}

t_breach_writes_incident_detected() {
  # breach 時に incident.detected が板に書かれる
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$ROOT_DIR/scripts/lib/audit.sh'
    audit_log 'a' '1'
    audit_log 'b' 'original'
  "
  sed -i '2s/original/TAMPERED/' "$tmp/audit.jsonl"
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WATCH" --once >/dev/null 2>&1 || true
  local content
  content=$(cat "$tmp/audit.jsonl")
  rm -rf "$tmp"
  assert_contains "$content" 'incident.detected' || return 1
  assert_contains "$content" 'audit_chain_broken' || return 1
}

t_unknown_arg_rejected() {
  bash "$WATCH" --bogus >/dev/null 2>&1
  assert_exit_code "$?" 2 "未知引数 → exit 2"
}

t_pii_stale_detected() {
  # PII クリーン 実行が 25h 前 (24h 制限超過) → W4 で BREACH
  # シミュレート: 古い ts の pii_scan.clean エントリを直接書く (チェーンは無視 — テスト目的)
  local tmp; tmp=$(mktemp -d)
  # 最初に 1 件 audit_log で書いてから、25h 前の ts に上書き
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$ROOT_DIR/scripts/lib/audit.sh'
    audit_log 'pii_scan.clean' 'old'
  "
  # ts を 25h 前に書き換え (Python で)
  python3 -c "
import sys, json, re
from datetime import datetime, timedelta, timezone
old_ts = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
with open('$tmp/audit.jsonl') as f: lines = f.readlines()
new = []
for line in lines:
    new.append(re.sub(r'\"ts\":\"[^\"]+\"', f'\"ts\":\"{old_ts}\"', line, count=1))
with open('$tmp/audit.jsonl', 'w') as f: f.writelines(new)
"
  local out rc
  out=$(WATCH_PII_CLEAN_MAX_HOURS=24 AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WATCH" --once 2>&1)
  rc=$?
  rm -rf "$tmp"
  # rc は 1 (PII stale + audit-verify が改竄として落ちる可能性も) どちらも breach
  if [[ "$rc" -ne 1 ]]; then
    echo "    PII stale で exit 1 期待、実際: $rc"
    return 1
  fi
  assert_contains "$out" "pii_scan_stale" || return 1
}

echo "== test-orchestrate-watch =="
run_test "--help → exit 0"                  t_help
run_test "--thresholds が閾値表示"           t_thresholds_show
run_test "クリーン状態で --once exit 0"      t_once_clean_returns_0
run_test "audit tamper を検出"               t_once_detects_audit_tamper
run_test "chat.error 嵐を検出"                t_once_detects_chat_error_storm
run_test "INV-12 違反を検出"                 t_once_detects_inv12_violation
run_test "breach 時に incident.detected 発火" t_breach_writes_incident_detected
run_test "未知引数 → exit 2"                 t_unknown_arg_rejected
run_test "PII クリーン 25h 経過で BREACH"     t_pii_stale_detected
report
