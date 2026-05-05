#!/usr/bin/env bash
# test-orchestrate.sh
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

ORCH="$ROOT_DIR/scripts/orchestrate.sh"

t_help() {
  local out
  out=$(bash "$ORCH" --help 2>&1)
  assert_exit_code "$?" 0 "--help → 0" || return 1
  assert_contains "$out" "PDCA" || return 1
  assert_contains "$out" "OODA" || return 1
}

t_emit_writes_to_audit() {
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --emit team.alpha.1.scoped "issue=42 priority=high" >/dev/null 2>&1
  local rc=$?
  if [[ "$rc" -ne 0 ]]; then rm -rf "$tmp"; echo "    --emit が exit $rc"; return 1; fi
  if [[ ! -f "$tmp/audit.jsonl" ]]; then rm -rf "$tmp"; echo "    audit.jsonl が作られない"; return 1; fi
  local content
  content=$(cat "$tmp/audit.jsonl")
  rm -rf "$tmp"
  assert_contains "$content" 'team.alpha.1.scoped' || return 1
  assert_contains "$content" 'issue=42' || return 1
}

t_handoff_records_team_pair() {
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --handoff alpha.2 beta.1 "issue=42 design done" >/dev/null 2>&1
  local content
  content=$(cat "$tmp/audit.jsonl")
  rm -rf "$tmp"
  # handoff.alpha.beta が記録されること
  assert_contains "$content" 'handoff.alpha.beta' || return 1
  assert_contains "$content" 'from=alpha.2' || return 1
  assert_contains "$content" 'to=beta.1' || return 1
}

t_status_shows_counts() {
  local tmp; tmp=$(mktemp -d)
  # 3 イベント書く
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --emit team.alpha.1.scoped "x" >/dev/null 2>&1
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --handoff alpha.1 alpha.2 "y" >/dev/null 2>&1
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --emit incident.detected "z" >/dev/null 2>&1
  local out
  out=$(AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --status 2>&1)
  rm -rf "$tmp"
  assert_contains "$out" "全イベント" || return 1
  assert_contains "$out" "チーム活動" || return 1
  assert_contains "$out" "ハンドオフ" || return 1
  assert_contains "$out" "インシデント" || return 1
}

t_status_no_board() {
  # 板が無い時の挙動
  local tmp; tmp=$(mktemp -d)
  local out
  out=$(AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --status 2>&1)
  rm -rf "$tmp"
  assert_contains "$out" "未作成" || return 1
}

t_board_tail() {
  local tmp; tmp=$(mktemp -d)
  for i in 1 2 3 4 5; do
    AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --emit "evt.$i" "data=$i" >/dev/null 2>&1
  done
  local out
  out=$(AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --board --tail 3 2>&1)
  rm -rf "$tmp"
  assert_contains "$out" "evt.5" || return 1
  assert_contains "$out" "evt.4" || return 1
  assert_contains "$out" "evt.3" || return 1
  # tail 3 なので 1, 2 は出ない (ヘッダ "板" 以外で)
  echo "$out" | grep -q "evt.1  data=1" && { echo "    tail 3 なのに evt.1 が出た"; return 1; }
  return 0
}

t_cycle_pdca_starts() {
  local tmp; tmp=$(mktemp -d)
  local out
  out=$(AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --cycle pdca 2>&1)
  local content
  content=$(cat "$tmp/audit.jsonl" 2>/dev/null)
  rm -rf "$tmp"
  assert_contains "$out" "PDCA" || return 1
  assert_contains "$content" 'pdca.cycle.start' || return 1
}

t_cycle_ooda_starts() {
  local tmp; tmp=$(mktemp -d)
  local out
  out=$(AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --cycle ooda --trigger preflight 2>&1)
  local content
  content=$(cat "$tmp/audit.jsonl" 2>/dev/null)
  rm -rf "$tmp"
  assert_contains "$out" "OODA" || return 1
  assert_contains "$content" 'ooda.cycle.start' || return 1
  assert_contains "$content" 'trigger=preflight' || return 1
}

t_cycle_unknown_rejected() {
  bash "$ORCH" --cycle bogus >/dev/null 2>&1
  assert_exit_code "$?" 2 "未知 cycle → exit 2"
}

t_prompt_for_alpha1() {
  local out
  out=$(bash "$ORCH" --prompt-for alpha.1 2>&1)
  assert_exit_code "$?" 0 "--prompt-for → 0" || return 1
  assert_contains "$out" "α1" || return 1
  assert_contains "$out" "Strategist" || return 1
  assert_contains "$out" "scripts/orchestrate.sh --emit" || return 1
}

t_prompt_for_each_team() {
  for team in alpha beta gamma delta; do
    local out
    out=$(bash "$ORCH" --prompt-for "${team}.1" 2>&1)
    if ! echo "$out" | grep -qE "Team [αβγδ]"; then
      echo "    $team の prompt が出ない"
      return 1
    fi
  done
  return 0
}

t_audit_chain_intact() {
  # orchestrate が書く板自体が audit-verify で通ること
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --emit a "1" >/dev/null
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --handoff alpha.1 alpha.2 "x" >/dev/null
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --emit b "2" >/dev/null
  bash "$ROOT_DIR/scripts/audit-verify.sh" "$tmp/audit.jsonl" >/dev/null 2>&1
  local rc=$?
  rm -rf "$tmp"
  assert_exit_code "$rc" 0 "audit-verify 通過" || return 1
}

echo "== test-orchestrate =="
run_test "--help が PDCA/OODA を含む"      t_help
run_test "--emit で audit.jsonl に記録"     t_emit_writes_to_audit
run_test "--handoff が handoff.X.Y を出す"  t_handoff_records_team_pair
run_test "--status が 4 種カウンタ表示"     t_status_shows_counts
run_test "板未作成時の --status 案内"        t_status_no_board
run_test "--board --tail N が末尾 N 件"     t_board_tail
run_test "--cycle pdca が起動 + audit 記録" t_cycle_pdca_starts
run_test "--cycle ooda が起動 + trigger 反映" t_cycle_ooda_starts
run_test "未知 cycle → exit 2"               t_cycle_unknown_rejected
run_test "--prompt-for alpha.1 が α1 で出る" t_prompt_for_alpha1
run_test "全 4 チームの prompt-for が動く"  t_prompt_for_each_team
run_test "板 自身が audit-verify で通る"    t_audit_chain_intact
report
