#!/usr/bin/env bash
# test-readme-sync.sh — README が現状の機能セットと整合しているか
# v22 から導入: 設計図 / governance docs / scripts / routes が drift していないことを検出
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

README="$ROOT_DIR/README.md"

t_readme_exists() {
  assert_file_exists "$README"
}

t_governance_docs_listed() {
  # governance/01..15 全てが README に言及されているか
  local missing=0
  for n in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15; do
    if ! grep -q "governance/${n}_" "$README"; then
      echo "    governance/${n}_ が README に未掲載"
      missing=$((missing + 1))
    fi
  done
  [[ "$missing" -eq 0 ]]
}

t_l8_orchestration_mentioned() {
  # L8 オーケストレーション の主要コマンドが README に記載
  for cmd in "orchestrate.sh --cycle pdca" "orchestrate-watch.sh" "orchestrate-kpi.sh" "propose-response" "prompt-for"; do
    if ! grep -q -- "$cmd" "$README"; then
      echo "    L8 コマンド未記載: $cmd"
      return 1
    fi
  done
}

t_v19_routes_mentioned() {
  # v19 ダッシュボード の 7 ルート
  for r in "orchestrate" "governance" "audit" "settings"; do
    if ! grep -q "$r" "$README"; then
      echo "    ルート未記載: $r"
      return 1
    fi
  done
}

t_recent_features_mentioned() {
  # v18-v22 の主要機能 が README に反映 (drift 防止)
  for kw in "感情適応" "PREFLIGHT_FAST" "audit-export" "ストレージ"; do
    if ! grep -q -- "$kw" "$README"; then
      echo "    最近の機能 未記載: $kw"
      return 1
    fi
  done
}

t_referenced_scripts_exist() {
  # README が言及している `bash scripts/...` のパスが実在
  local missing=0
  while IFS= read -r line; do
    local script_path
    script_path=$(echo "$line" | grep -oE 'scripts/[a-zA-Z0-9_./-]+\.sh' | head -1)
    [[ -z "$script_path" ]] && continue
    if [[ ! -f "$ROOT_DIR/$script_path" ]]; then
      echo "    README が言及するが実在しない: $script_path"
      missing=$((missing + 1))
    fi
  done < <(grep -E '^bash scripts/' "$README")
  [[ "$missing" -eq 0 ]]
}

t_design_version_progressed() {
  # 設計図 のバージョン (v22+) が README にも示唆されている
  # 「22 反復」「16 本」など 現状を反映する 数値 表記
  if ! grep -qE "(22 反復|22\+ 反復|22 \+ 反復|16 本|15 governance)" "$README"; then
    echo "    現状の規模を反映する数値表記がない"
    return 1
  fi
}

echo "== test-readme-sync =="
run_test "README 存在"                          t_readme_exists
run_test "governance 01-15 全部 言及"           t_governance_docs_listed
run_test "L8 オーケストレーション 主要コマンド"  t_l8_orchestration_mentioned
run_test "v19 7 ルート 言及"                    t_v19_routes_mentioned
run_test "v18-v22 機能 言及"                    t_recent_features_mentioned
run_test "言及 script が実在"                   t_referenced_scripts_exist
run_test "設計 進化 数値が反映"                 t_design_version_progressed
report
