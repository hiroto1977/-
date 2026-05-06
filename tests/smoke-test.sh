#!/usr/bin/env bash
# smoke-test.sh — 全テストの統合ランナー
#
# 実行:  bash tests/smoke-test.sh           (全部)
#        bash tests/smoke-test.sh unit      (bash unit のみ)
#        bash tests/smoke-test.sh js        (JS 単体テストのみ)
#        bash tests/smoke-test.sh ps        (PowerShell 構造チェック)
#
# 全テスト合格 → exit 0 / 一つでも失敗 → exit 1
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -t 1 ]]; then
  C_OK="\033[1;32m"; C_FAIL="\033[1;31m"; C_BLD="\033[1m"; C_DIM="\033[2m"; C_RST="\033[0m"
else
  C_OK=""; C_FAIL=""; C_BLD=""; C_DIM=""; C_RST=""
fi

target="${1:-all}"

TOTAL_PASS=0
TOTAL_FAIL=0
FAILED_SUITES=()

run_suite() {
  local label="$1"; shift
  echo ""
  echo -e "${C_BLD}── $label ──${C_RST}"
  if "$@"; then
    TOTAL_PASS=$((TOTAL_PASS + 1))
  else
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    FAILED_SUITES+=("$label")
  fi
}

run_bash_unit() {
  local rc=0
  for f in "$SCRIPT_DIR"/unit/test-*.sh; do
    [[ -f "$f" ]] || continue
    if ! bash "$f"; then rc=1; fi
  done
  return $rc
}

run_integration() {
  local rc=0
  shopt -s nullglob
  for f in "$SCRIPT_DIR"/integration/*.sh; do
    [[ -f "$f" ]] || continue
    if ! bash "$f"; then rc=1; fi
  done
  shopt -u nullglob
  return $rc
}

run_regression() {
  local rc=0
  shopt -s nullglob
  for f in "$SCRIPT_DIR"/regression/*.sh; do
    [[ -f "$f" ]] || continue
    if ! bash "$f"; then rc=1; fi
  done
  shopt -u nullglob
  return $rc
}

run_js_tests() {
  if ! command -v node >/dev/null 2>&1; then
    echo -e "${C_DIM}node 未インストール → JS テストはスキップ${C_RST}"
    return 0
  fi
  local rc=0
  for f in "$SCRIPT_DIR"/js/test_*.mjs; do
    [[ -f "$f" ]] || continue
    echo ""
    echo "▶ $(basename "$f")"
    if ! node "$f"; then rc=1; fi
  done
  return $rc
}

run_ps_tests() {
  bash "$SCRIPT_DIR/ps/structural-check.sh"
}

echo "================================================="
echo " smoke-test : $(date '+%Y-%m-%d %H:%M:%S')"
echo " root       : $ROOT_DIR"
echo " target     : $target"
echo "================================================="

case "$target" in
  unit) run_suite "Bash Unit" run_bash_unit ;;
  js)   run_suite "JS Unit"   run_js_tests ;;
  ps)   run_suite "PS 構造"   run_ps_tests ;;
  integration) run_suite "Integration" run_integration ;;
  regression)  run_suite "Regression"  run_regression ;;
  all)
    run_suite "Bash Unit" run_bash_unit
    run_suite "JS Unit"   run_js_tests
    run_suite "PS 構造"   run_ps_tests
    run_suite "Integration" run_integration
    run_suite "Regression" run_regression
    ;;
  *)
    echo "未知のターゲット: $target  (使えるのは all|unit|js|ps|integration|regression)"
    exit 2
    ;;
esac

echo ""
echo "================================================="
if [[ "$TOTAL_FAIL" -eq 0 ]]; then
  echo -e " ${C_OK}${C_BLD}全 $TOTAL_PASS スイート 合格${C_RST}"
  exit 0
else
  echo -e " ${C_FAIL}${C_BLD}$TOTAL_FAIL スイート 失敗 / $TOTAL_PASS 合格${C_RST}"
  echo "  失敗:"
  for s in "${FAILED_SUITES[@]}"; do
    echo "    - $s"
  done
  exit 1
fi
