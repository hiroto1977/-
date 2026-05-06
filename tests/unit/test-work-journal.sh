#!/usr/bin/env bash
# test-work-journal.sh
# INV: governance/16 work journal — 業務 引継ぎ Free システム
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

WJ="$ROOT_DIR/scripts/work-journal.sh"
AV="$ROOT_DIR/scripts/audit-verify.sh"
AUDIT_LIB="$ROOT_DIR/scripts/lib/audit.sh"

t_help_no_args() {
  bash "$WJ" 2>&1 | grep -q "用法\|--start" || { echo "    --help 表示なし"; return 1; }
}

t_unknown_cmd_returns_2() {
  bash "$WJ" --bogus >/dev/null 2>&1
  assert_exit_code "$?" 2 "未知 → exit 2"
}

t_start_writes_audit_event() {
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start TASK-1 "title=Test stakeholder=X" >/dev/null
  local content; content=$(cat "$tmp/audit.jsonl")
  rm -rf "$tmp"
  assert_contains "$content" 'work.task.start' || return 1
  assert_contains "$content" 'task=TASK-1' || return 1
  assert_contains "$content" 'title=Test' || return 1
}

t_all_8_event_types() {
  local tmp; tmp=$(mktemp -d)
  local AL="$tmp/audit.jsonl"
  AUDIT_LOG_PATH="$AL" bash "$WJ" --start    T1 "title=A" >/dev/null
  AUDIT_LOG_PATH="$AL" bash "$WJ" --decision T1 "chose=B why=test" >/dev/null
  AUDIT_LOG_PATH="$AL" bash "$WJ" --comm     T1 "with=X summary=Y" >/dev/null
  AUDIT_LOG_PATH="$AL" bash "$WJ" --artifact T1 "path=/tmp/x.txt status=draft" >/dev/null
  AUDIT_LOG_PATH="$AL" bash "$WJ" --block    T1 "reason=待ち needs=承認" >/dev/null
  AUDIT_LOG_PATH="$AL" bash "$WJ" --resume   T1 "note=承認OK" >/dev/null
  AUDIT_LOG_PATH="$AL" bash "$WJ" --handoff  T1 "next=月曜 open=値引" >/dev/null
  AUDIT_LOG_PATH="$AL" bash "$WJ" --complete T1 "outcome=受注 retro=OK" >/dev/null
  local count; count=$(grep -c '"event":"work\.task\.' "$AL")
  rm -rf "$tmp"
  assert_eq "$count" "8" "8 イベント全部 記録される"
}

t_chain_intact_after_journaling() {
  # 業務記録後も audit chain が verify を通る (INV-2 / INV-10 継承)
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start    T1 "title=A" >/dev/null
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --comm     T1 "with=X summary=Y" >/dev/null
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --handoff  T1 "next=N" >/dev/null
  bash "$AV" "$tmp/audit.jsonl" >/dev/null 2>&1
  local rc=$?
  rm -rf "$tmp"
  assert_exit_code "$rc" 0 "verify 通過"
}

t_show_returns_chronological() {
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start TASK-A "title=First" >/dev/null
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --comm  TASK-A "summary=Second" >/dev/null
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --handoff TASK-A "next=Third" >/dev/null
  local out; out=$(AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --show TASK-A 2>&1)
  rm -rf "$tmp"
  assert_contains "$out" "First" || return 1
  assert_contains "$out" "Second" || return 1
  assert_contains "$out" "Third" || return 1
  assert_contains "$out" "合計 3" || return 1
}

t_show_filters_by_task_id() {
  # task=A のイベント を見ると、task=B の イベントは出ない
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start TASK-A "title=AAA" >/dev/null
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start TASK-B "title=BBB" >/dev/null
  local out; out=$(AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --show TASK-A 2>&1)
  rm -rf "$tmp"
  assert_contains "$out" "AAA" || return 1
  assert_not_contains "$out" "BBB" || return 1
}

t_list_shows_active_tasks() {
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start T-OPEN "title=Open" >/dev/null
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start T-DONE "title=Done" >/dev/null
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --complete T-DONE "outcome=ok" >/dev/null
  local out; out=$(AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --list 2>&1)
  rm -rf "$tmp"
  assert_contains "$out" "T-OPEN" || return 1
  # complete は --all なしでは隠れる
  assert_not_contains "$out" "T-DONE" || return 1
}

t_list_all_includes_complete() {
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start T-X "title=X" >/dev/null
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --complete T-X "outcome=ok" >/dev/null
  local out; out=$(AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --list --all 2>&1)
  rm -rf "$tmp"
  assert_contains "$out" "T-X" || return 1
  assert_contains "$out" "complete" || return 1
}

t_export_markdown() {
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start TASK-EXP "title=Export" >/dev/null
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --artifact TASK-EXP "path=docs/x.pdf status=final" >/dev/null
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --handoff TASK-EXP "next=N" >/dev/null
  local md; md=$(AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --export TASK-EXP 2>&1)
  rm -rf "$tmp"
  assert_contains "$md" "# Task TASK-EXP" || return 1
  assert_contains "$md" "## 時系列" || return 1
  assert_contains "$md" "## 引継ぎチェック" || return 1
  assert_contains "$md" "成果物" || return 1
  assert_contains "$md" "docs/x.pdf" || return 1
}

t_audit_filter_outputs_only_work_events() {
  # --audit は work.task.* のみ抽出
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "source $AUDIT_LIB; audit_log 'sys.event' 'noise'" >/dev/null
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start T-1 "title=X" >/dev/null
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "source $AUDIT_LIB; audit_log 'sys.other' 'more'" >/dev/null
  local out; out=$(AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --audit)
  rm -rf "$tmp"
  assert_contains "$out" "work.task.start" || return 1
  assert_not_contains "$out" "sys.event" || return 1
  assert_not_contains "$out" "sys.other" || return 1
}

t_handoff_shows_in_export_checklist() {
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start TASK-NO-HO "title=NoHandoff" >/dev/null
  local md; md=$(AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --export TASK-NO-HO 2>&1)
  rm -rf "$tmp"
  assert_contains "$md" "handoff イベントなし" || return 1
}

t_governance_16_exists() {
  assert_file_exists "$ROOT_DIR/governance/16_WORK_JOURNAL.md"
}

t_audit_log_start_called() {
  # INV-3: work-journal.sh が audit_log "*.start" を呼ぶ
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start TASK-INV3 "title=X" >/dev/null
  local content; content=$(cat "$tmp/audit.jsonl")
  rm -rf "$tmp"
  assert_contains "$content" 'work_journal.start' || return 1
}

echo "== test-work-journal =="
run_test "--help / 引数なしで usage"            t_help_no_args
run_test "未知コマンド → exit 2"               t_unknown_cmd_returns_2
run_test "--start が audit に記録"              t_start_writes_audit_event
run_test "8 イベント種類 全部記録"              t_all_8_event_types
run_test "チェーン整合 維持 (INV-2/10 継承)"    t_chain_intact_after_journaling
run_test "--show が時系列で表示"                t_show_returns_chronological
run_test "--show が task ID で フィルタ"        t_show_filters_by_task_id
run_test "--list は active のみ表示"            t_list_shows_active_tasks
run_test "--list --all で complete も表示"      t_list_all_includes_complete
run_test "--export Markdown 形式"               t_export_markdown
run_test "--audit は work.task.* のみ"          t_audit_filter_outputs_only_work_events
run_test "handoff なし時の export 警告"         t_handoff_shows_in_export_checklist
run_test "governance/16 が存在 (drift sniff)"  t_governance_16_exists
run_test "INV-3: audit_log .start 呼出"         t_audit_log_start_called
report
