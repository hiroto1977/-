#!/usr/bin/env bash
# assert.sh — テスト 共通ヘルパ (source して使う)
#
# 提供: assert_eq / assert_contains / assert_not_contains / assert_exit_code /
#       assert_file_exists / assert_match / setup_tmp / teardown_tmp /
#       run_test / report
#
# 各ユニット テストは:
#   source "$(dirname "$0")/../lib/assert.sh"
#   run_test "test_name" test_function
#   ...
#   report

[[ -n "${ASSERT_SH_LOADED:-}" ]] && return 0
ASSERT_SH_LOADED=1

# Colors
if [[ -t 1 ]]; then
  TC_OK="\033[1;32m"; TC_FAIL="\033[1;31m"; TC_DIM="\033[2m"; TC_BLD="\033[1m"; TC_RST="\033[0m"
else
  TC_OK=""; TC_FAIL=""; TC_DIM=""; TC_BLD=""; TC_RST=""
fi

# 集計
TEST_PASS=0
TEST_FAIL=0
TEST_SKIP=0
TEST_FAILED_NAMES=()

# ----- アサーション -----
assert_eq() {
  local actual="$1" expected="$2" msg="${3:-値の比較}"
  if [[ "$actual" == "$expected" ]]; then return 0; fi
  echo -e "    ${TC_FAIL}assert_eq 失敗:${TC_RST} $msg"
  echo "      期待: '$expected'"
  echo "      実際: '$actual'"
  return 1
}

assert_contains() {
  local haystack="$1" needle="$2" msg="${3:-文字列包含}"
  if [[ "$haystack" == *"$needle"* ]]; then return 0; fi
  echo -e "    ${TC_FAIL}assert_contains 失敗:${TC_RST} $msg"
  echo "      探した: '$needle'"
  echo "      対象 (head): '${haystack:0:100}...'"
  return 1
}

assert_not_contains() {
  local haystack="$1" needle="$2" msg="${3:-文字列非包含}"
  if [[ "$haystack" != *"$needle"* ]]; then return 0; fi
  echo -e "    ${TC_FAIL}assert_not_contains 失敗:${TC_RST} $msg"
  echo "      含まれてはいけない: '$needle'"
  return 1
}

assert_exit_code() {
  local actual="$1" expected="$2" msg="${3:-exit code}"
  if [[ "$actual" -eq "$expected" ]]; then return 0; fi
  echo -e "    ${TC_FAIL}assert_exit_code 失敗:${TC_RST} $msg"
  echo "      期待: $expected"
  echo "      実際: $actual"
  return 1
}

assert_file_exists() {
  local path="$1" msg="${2:-ファイル存在}"
  if [[ -e "$path" ]]; then return 0; fi
  echo -e "    ${TC_FAIL}assert_file_exists 失敗:${TC_RST} $msg ($path)"
  return 1
}

assert_match() {
  local text="$1" pattern="$2" msg="${3:-正規表現マッチ}"
  if echo "$text" | grep -qE "$pattern"; then return 0; fi
  echo -e "    ${TC_FAIL}assert_match 失敗:${TC_RST} $msg"
  echo "      pattern: '$pattern'"
  echo "      対象 (head): '${text:0:100}...'"
  return 1
}

# ----- 一時環境 -----
setup_tmp() {
  TEST_TMP=$(mktemp -d)
  export ORIG_HOME="$HOME"
  export ORIG_AUDIT_LOG_PATH="${AUDIT_LOG_PATH:-}"
  echo "$TEST_TMP"
}

teardown_tmp() {
  [[ -n "${TEST_TMP:-}" && -d "$TEST_TMP" ]] && rm -rf "$TEST_TMP"
  export HOME="$ORIG_HOME"
  if [[ -n "$ORIG_AUDIT_LOG_PATH" ]]; then
    export AUDIT_LOG_PATH="$ORIG_AUDIT_LOG_PATH"
  else
    unset AUDIT_LOG_PATH
  fi
}

# ----- 個別 test の実行 -----
run_test() {
  local name="$1"
  local fn="$2"
  printf "  %-55s " "$name"
  if "$fn" 2>&1; then
    echo -e "${TC_OK}PASS${TC_RST}"
    TEST_PASS=$((TEST_PASS + 1))
  else
    echo -e "${TC_FAIL}FAIL${TC_RST}"
    TEST_FAIL=$((TEST_FAIL + 1))
    TEST_FAILED_NAMES+=("$name")
  fi
}

skip_test() {
  local name="$1" reason="${2:-}"
  printf "  %-55s ${TC_DIM}SKIP${TC_RST}  %s\n" "$name" "$reason"
  TEST_SKIP=$((TEST_SKIP + 1))
}

# ----- 集計 -----
report() {
  local total=$((TEST_PASS + TEST_FAIL + TEST_SKIP))
  echo ""
  echo "  ─────────────────────────────────────────"
  if [[ "$TEST_FAIL" -eq 0 ]]; then
    echo -e "  ${TC_OK}${TC_BLD}結果: $TEST_PASS pass${TC_RST} / 0 fail / $TEST_SKIP skip / $total total"
  else
    echo -e "  ${TC_FAIL}${TC_BLD}結果: $TEST_PASS pass / $TEST_FAIL fail${TC_RST} / $TEST_SKIP skip / $total total"
    echo "  失敗:"
    for n in "${TEST_FAILED_NAMES[@]}"; do
      echo "    - $n"
    done
  fi

  [[ "$TEST_FAIL" -eq 0 ]]
}
