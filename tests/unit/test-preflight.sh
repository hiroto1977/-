#!/usr/bin/env bash
# test-preflight.sh — preflight.sh の出力を検証
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

PREFLIGHT="$ROOT_DIR/scripts/preflight.sh"

t_runs_and_summarizes() {
  local out
  out=$(PREFLIGHT_FAST=1 bash "$PREFLIGHT" 2>&1)
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
  out=$(PREFLIGHT_FAST=1 bash "$PREFLIGHT" 2>&1)
  # 8 ステップのうち主要なものが出ているか
  assert_contains "$out" "[1/8]" || return 1
  assert_contains "$out" "[2/8]" || return 1
  assert_contains "$out" "[8/8]" || return 1
  assert_contains "$out" "CORS" || return 1
  assert_contains "$out" "監査ログ" || return 1
}

t_audit_verify_step_detects_clean_chain() {
  # クリーンな audit.jsonl で preflight を実行 → step 8 が ✅
  # (audit-verify を実行する必要があるので SKIP_NET だけ ON、SKIP_AUDIT は OFF)
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$ROOT_DIR/scripts/lib/audit.sh'
    audit_log 'first' 'a'
    audit_log 'second' 'b'
  "
  local out
  out=$(PREFLIGHT_SKIP_NET=1 AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$PREFLIGHT" 2>&1)
  rm -rf "$tmp"
  assert_contains "$out" "audit.jsonl チェーン整合" || return 1
  assert_not_contains "$out" "改竄疑い" || return 1
}

t_audit_verify_step_detects_tamper() {
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$ROOT_DIR/scripts/lib/audit.sh'
    audit_log 'a' 'first'
    audit_log 'b' 'original'
    audit_log 'c' 'last'
  "
  sed -i '2s/original/TAMPERED/' "$tmp/audit.jsonl"
  local out
  out=$(PREFLIGHT_SKIP_NET=1 AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$PREFLIGHT" 2>&1)
  rm -rf "$tmp"
  assert_contains "$out" "改竄疑い" || return 1
  assert_contains "$out" "IR-3" || return 1
}

t_fast_flag_skips_net_and_audit() {
  # PREFLIGHT_FAST=1 でネット + audit-verify 両方 skip
  local out
  out=$(PREFLIGHT_FAST=1 bash "$PREFLIGHT" 2>&1)
  assert_contains "$out" "Ollama 接続チェック スキップ" || return 1
  assert_contains "$out" "監査ログ チェーン整合 スキップ" || return 1
  assert_contains "$out" "[1/8]" || return 1
  assert_contains "$out" "[8/8]" || return 1
}

t_fast_runs_quickly() {
  # PREFLIGHT_FAST=1 で 5 秒未満で完了
  local start end elapsed
  start=$(date +%s)
  PREFLIGHT_FAST=1 bash "$PREFLIGHT" >/dev/null 2>&1
  end=$(date +%s)
  elapsed=$((end - start))
  if [[ "$elapsed" -ge 5 ]]; then
    echo "    PREFLIGHT_FAST=1 でも ${elapsed}s かかった (期待: <5s)"
    return 1
  fi
  return 0
}

echo "== test-preflight =="
run_test "runs and produces summary"            t_runs_and_summarizes
run_test "8 step sections appear"               t_sections_present
run_test "step 8: clean audit chain detected"   t_audit_verify_step_detects_clean_chain
run_test "step 8: tamper detected + IR-3 hint"  t_audit_verify_step_detects_tamper
run_test "PREFLIGHT_FAST=1 でネット+audit skip" t_fast_flag_skips_net_and_audit
run_test "PREFLIGHT_FAST=1 で <5s 完了"        t_fast_runs_quickly
report
