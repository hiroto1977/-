#!/usr/bin/env bash
# test-knowledge-doc.sh — governance/14_SESSION_KNOWLEDGE.md が現状を反映しているか
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

DOC="$ROOT_DIR/governance/14_SESSION_KNOWLEDGE.md"

t_doc_exists() {
  assert_file_exists "$DOC" "knowledge doc 存在"
}

t_reflects_current_design_version() {
  # 現行 governance/12 のバージョン (v21) が知識文書にも反映されているか
  local design_v
  design_v=$(grep -oE 'v[0-9]+ \(PDCA #[0-9]+' "$ROOT_DIR/governance/12_SYSTEM_DESIGN.md" | head -1 | grep -oE 'v[0-9]+')
  if [[ -z "$design_v" ]]; then echo "    design version 抽出失敗"; return 1; fi
  if ! grep -q "設計図 \*\*$design_v\*\*" "$DOC"; then
    echo "    knowledge が design version $design_v を反映していない"
    return 1
  fi
}

t_mentions_v18_v21_features() {
  # v18-v21 の主要機能 が言及されている (新セッション が概要を掴める)
  for keyword in "affect-aware" "gender-blind" "#orchestrate" "#governance" "PREFLIGHT_FAST" "localStorage キャッシュ"; do
    if ! grep -q "$keyword" "$DOC"; then
      echo "    キーワード未言及: $keyword"
      return 1
    fi
  done
}

t_lessons_recent_pitfalls() {
  # 最近のサイクルで踏んだ罠 が §4.2 に追加されている
  for trap in "並行書込" "flock" "男女別" "APPI" "ESM 分割" "PREFLIGHT_FAST"; do
    if ! grep -q "$trap" "$DOC"; then
      echo "    罠未記載: $trap"
      return 1
    fi
  done
}

t_inv_count_consistent() {
  # INV テーブルが design と整合 (uniq な INV-N 番号で比較)
  local design_uniq
  design_uniq=$(grep -oE 'INV-[0-9]+' "$ROOT_DIR/governance/12_SYSTEM_DESIGN.md" | sort -u | wc -l)
  local know_uniq
  know_uniq=$(grep -oE 'INV-[0-9]+' "$DOC" | sort -u | wc -l)
  if [[ "$design_uniq" -ne "$know_uniq" ]]; then
    echo "    INV uniq 数 不一致: design=$design_uniq, knowledge=$know_uniq"
    return 1
  fi
}

t_ethics_guard_referenced() {
  # governance/15 (倫理ガード) が言及され、protected attribute 禁止が明記
  assert_contains "$(cat "$DOC")" "governance/15" || return 1
  assert_contains "$(cat "$DOC")" "protected attribute" || return 1
  assert_contains "$(cat "$DOC")" "性別" || return 1
}

t_bootstrap_30sec_check_intact() {
  # 「30 秒で起動チェック」セクション の主要コマンド が壊れていない
  for cmd in "preflight.sh" "orchestrate.sh --status" "orchestrate-kpi.sh" "orchestrate-watch.sh" "smoke-test.sh"; do
    if ! grep -q "$cmd" "$DOC"; then
      echo "    起動チェック コマンド 欠如: $cmd"
      return 1
    fi
  done
}

echo "== test-knowledge-doc =="
run_test "knowledge doc 存在"                   t_doc_exists
run_test "現行 design version 反映"             t_reflects_current_design_version
run_test "v18-v21 主要機能 言及"                t_mentions_v18_v21_features
run_test "最近の罠 (§4.2) 反映"                 t_lessons_recent_pitfalls
run_test "INV 件数 design と一致"               t_inv_count_consistent
run_test "倫理ガード (governance/15) 参照"      t_ethics_guard_referenced
run_test "起動チェック コマンド 不変"           t_bootstrap_30sec_check_intact
report
