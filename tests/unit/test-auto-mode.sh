#!/usr/bin/env bash
# test-auto-mode.sh — orchestrate.sh --auto <mode> の動作検証
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

ORCH="$ROOT_DIR/scripts/orchestrate.sh"

t_auto_no_arg_uses_bootstrap() {
  # mode 省略 → bootstrap (ただし bootstrap は重いので、ここでは呼ばずに mode 省略時の挙動だけ確認)
  # 引数なしで --auto を呼ぶと bootstrap が走るが、preflight + smoke も内部で実行される
  # → 実行はせず、cmd_auto 内のデフォルト分岐 を grep で確認
  grep -q 'mode="${1:-bootstrap}"' "$ORCH" || { echo "    cmd_auto デフォルト bootstrap 不在"; return 1; }
}

t_auto_pdca_runs() {
  local out
  out=$(bash "$ORCH" --auto pdca 2>&1)
  local rc=$?
  case "$rc" in 0|1) ;; *) echo "    予期せぬ exit $rc"; return 1 ;; esac
  assert_contains "$out" "PDCA 次の手" || return 1
  # §10 が空 or 課題あり、いずれにせよ何か提示される
  if echo "$out" | grep -qE "全課題 実装済|次の手"; then return 0; fi
  echo "    pdca 出力が想定外"
  return 1
}

t_auto_pdca_logs_to_audit() {
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --auto pdca >/dev/null 2>&1
  local content
  content=$(cat "$tmp/audit.jsonl" 2>/dev/null)
  rm -rf "$tmp"
  assert_contains "$content" 'orchestrate.auto.pdca' || return 1
}

t_auto_ooda_runs() {
  local out
  out=$(bash "$ORCH" --auto ooda 2>&1)
  local rc=$?
  case "$rc" in 0|1) ;; *) echo "    予期せぬ exit $rc"; return 1 ;; esac
  assert_contains "$out" "OODA" || return 1
  # healthy or breach のどちらか
  if echo "$out" | grep -qE "異常なし|breach 検出"; then return 0; fi
  echo "    ooda 出力が想定外"
  return 1
}

t_auto_ooda_breach_triggers_propose_response() {
  # 仕掛け: clean な audit.jsonl を tmp で作って renamed → tamper → ooda 実行
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$ROOT_DIR/scripts/lib/audit.sh'
    audit_log 'a' '1'
    audit_log 'b' 'original'
    audit_log 'c' '3'
  "
  sed -i '2s/original/TAMPERED/' "$tmp/audit.jsonl"
  local out
  out=$(AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --auto ooda 2>&1)
  local rc=$?
  rm -rf "$tmp"
  assert_exit_code "$rc" 1 "tamper 検出時 → exit 1" || return 1
  # 自動応答 が表示される
  assert_contains "$out" "OODA Decide" || return 1
  assert_contains "$out" "audit_chain_broken" || return 1
}

t_auto_unknown_mode_returns_2() {
  bash "$ORCH" --auto bogus_mode >/dev/null 2>&1
  assert_exit_code "$?" 2 "未知 mode → exit 2"
}

t_auto_bootstrap_function_exists() {
  # 重いので実行はせず、定義 だけ sniff
  grep -q '^auto_bootstrap()' "$ORCH" || { echo "    auto_bootstrap 関数 不在"; return 1; }
}

t_auto_monitor_function_exists() {
  grep -q '^auto_monitor()' "$ORCH" || { echo "    auto_monitor 関数 不在"; return 1; }
}

t_help_mentions_auto() {
  local out
  out=$(bash "$ORCH" --help 2>&1)
  assert_contains "$out" "--auto" || return 1
}

echo "== test-auto-mode =="
run_test "--auto デフォルト bootstrap"            t_auto_no_arg_uses_bootstrap
run_test "--auto pdca が動く"                      t_auto_pdca_runs
run_test "--auto pdca が audit に記録"            t_auto_pdca_logs_to_audit
run_test "--auto ooda が動く"                      t_auto_ooda_runs
run_test "--auto ooda が breach → propose-response" t_auto_ooda_breach_triggers_propose_response
run_test "--auto bogus → exit 2"                  t_auto_unknown_mode_returns_2
run_test "auto_bootstrap 関数 定義"               t_auto_bootstrap_function_exists
run_test "auto_monitor 関数 定義"                 t_auto_monitor_function_exists
run_test "--help が --auto を含む"                 t_help_mentions_auto
report
