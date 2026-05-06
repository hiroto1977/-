#!/usr/bin/env bash
# test-orchestrate-kpi.sh — INV-12 (排他着手) と 4 KPI 計算を検証
# INV: INV-12: 同 issue ID を複数チームが同時 scoped 不可
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

KPI="$ROOT_DIR/scripts/orchestrate-kpi.sh"
ORCH="$ROOT_DIR/scripts/orchestrate.sh"

t_runs_clean() {
  local out
  out=$(ORCHESTRATE_KPI_NO_GAMMA=1 bash "$KPI" 2>&1)
  local rc=$?
  case "$rc" in
    0|1) ;;
    *) echo "    予期しない exit: $rc"; return 1 ;;
  esac
  assert_contains "$out" "INV カバレッジ" || return 1
  assert_contains "$out" "サイクル中央時間" || return 1
  assert_contains "$out" "テスト pass 率" || return 1
  assert_contains "$out" "文書 鮮度" || return 1
}

t_json_valid() {
  local out
  out=$(ORCHESTRATE_KPI_NO_GAMMA=1 bash "$KPI" --json 2>&1)
  echo "$out" | python3 -c 'import sys, json; d = json.load(sys.stdin)
assert "alpha_inv_coverage" in d
assert "beta_cycle_time" in d
assert "gamma_test_pass" in d
assert "delta_doc_freshness" in d
assert "inv12_violations" in d
' || return 1
}

t_detects_concurrent_scope() {
  # INV-12: 同 issue を異なるチームが scoped → check で違反検出
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --emit team.alpha.1.scoped "issue=99 priority=high" >/dev/null 2>&1
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --emit team.beta.1.scoped  "issue=99 priority=high" >/dev/null 2>&1
  local rc
  AUDIT_LOG_PATH="$tmp/audit.jsonl" ORCHESTRATE_KPI_NO_GAMMA=1 bash "$KPI" --check >/dev/null 2>&1
  rc=$?
  rm -rf "$tmp"
  assert_exit_code "$rc" 1 "INV-12 違反 → exit 1" || return 1
}

t_clean_state_passes_check() {
  # 異なる issue を異なるチームが scoped する分には OK
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --emit team.alpha.1.scoped "issue=100 priority=high" >/dev/null 2>&1
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$ORCH" --emit team.beta.1.scoped  "issue=101 priority=high" >/dev/null 2>&1
  local rc
  AUDIT_LOG_PATH="$tmp/audit.jsonl" ORCHESTRATE_KPI_NO_GAMMA=1 bash "$KPI" --check >/dev/null 2>&1
  rc=$?
  rm -rf "$tmp"
  assert_exit_code "$rc" 0 "重複なし → exit 0" || return 1
}

t_alpha_inv_count_matches_design() {
  # α KPI の "全 INV 数" が governance/12 §4 の INV 行数と一致
  local out
  out=$(ORCHESTRATE_KPI_NO_GAMMA=1 bash "$KPI" --json 2>&1)
  local total
  total=$(echo "$out" | python3 -c 'import sys, json; print(json.load(sys.stdin)["alpha_inv_coverage"]["total"])')
  local design_count
  design_count=$(grep -cE '^\| \*\*INV-[0-9]+\*\*' "$ROOT_DIR/governance/12_SYSTEM_DESIGN.md")
  assert_eq "$total" "$design_count" "design の INV 数と一致" || return 1
}

t_gamma_key_exists() {
  # NO_GAMMA=1 でも gamma_test_pass キー自体は出力に含まれる (整合性)
  local out
  out=$(ORCHESTRATE_KPI_NO_GAMMA=1 bash "$KPI" --json 2>&1)
  assert_contains "$out" '"gamma_test_pass"' || return 1
  # JSON として valid
  echo "$out" | python3 -c 'import sys, json; json.load(sys.stdin)' || return 1
}

t_delta_counts_governance_docs() {
  # δ の doc_count は governance 配下の md 数 (>= 13 のはず)
  local out cnt
  out=$(ORCHESTRATE_KPI_NO_GAMMA=1 bash "$KPI" --json 2>&1)
  cnt=$(echo "$out" | python3 -c 'import sys, json; print(json.load(sys.stdin)["delta_doc_freshness"]["doc_count"])')
  if [[ "$cnt" -lt 13 ]]; then
    echo "    governance 文書数が想定 (>=13) より少ない: $cnt"
    return 1
  fi
  return 0
}

t_check_only_no_violation_passes() {
  bash "$KPI" --check >/dev/null 2>&1
  # 本リポの板で実際に違反が無いか (現サイクルで issue=12 を α だけが scoped しているはず)
  # 違反が出る場合はテスト失敗 (実際の運用 KPI として有用)
  assert_exit_code "$?" 0 "現状 INV-12 違反なし" || return 1
}

t_unknown_arg_rejected() {
  bash "$KPI" --bogus >/dev/null 2>&1
  assert_exit_code "$?" 2 "未知引数 → exit 2" || return 1
}

echo "== test-orchestrate-kpi =="
run_test "通常実行で 4 KPI を表示"          t_runs_clean
run_test "--json が valid JSON"             t_json_valid
run_test "INV-12 違反 検出 (--check)"       t_detects_concurrent_scope
run_test "重複なしなら --check 通過"        t_clean_state_passes_check
run_test "α KPI の総 INV が design と一致"  t_alpha_inv_count_matches_design
run_test "γ KPI キー存在 + JSON 妥当"       t_gamma_key_exists
run_test "δ KPI が governance 文書をカウント" t_delta_counts_governance_docs
run_test "--check 違反なしなら exit 0"      t_check_only_no_violation_passes
run_test "未知引数 → exit 2"                t_unknown_arg_rejected
report
