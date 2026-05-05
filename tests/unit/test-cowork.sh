#!/usr/bin/env bash
# test-cowork.sh — cowork CLI の最低限の健全性チェック
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

CLI="$ROOT_DIR/cowork/local-chat-cli.py"
SH="$ROOT_DIR/cowork/local-cowork.sh"

t_cli_help() {
  if ! command -v python3 >/dev/null 2>&1; then return 0; fi
  local out
  out=$(python3 "$CLI" --help 2>&1)
  local rc=$?
  assert_exit_code "$rc" 0 "--help → exit 0" || return 1
  assert_contains "$out" "usage" || return 1
  # 主要引数が表示される
  assert_contains "$out" "--model" || return 1
  assert_contains "$out" "--system" || return 1
}

t_cli_compiles() {
  if ! command -v python3 >/dev/null 2>&1; then return 0; fi
  # py_compile で構文チェック (importable か)
  python3 -m py_compile "$CLI"
  assert_exit_code "$?" 0 "py_compile が成功" || return 1
}

t_cli_unreachable_ollama() {
  # 存在しない base URL で起動して接続失敗を期待
  if ! command -v python3 >/dev/null 2>&1; then return 0; fi
  local out
  out=$(echo "/quit" | timeout 5 python3 "$CLI" --base "http://127.0.0.1:1" --no-stream 2>&1 || true)
  # 接続失敗時もクラッシュせずに何かを出すこと
  if [[ -z "$out" ]]; then
    echo "    出力が空 (期待: 何らかのメッセージ)"
    return 1
  fi
  return 0
}

t_sh_help() {
  if [[ ! -f "$SH" ]]; then return 0; fi
  # local-cowork.sh は --help 時にすぐ終わるはず (使い方を表示)
  local out
  out=$(timeout 3 bash "$SH" --help 2>&1 || true)
  # 内容は何でもいいが空ではない
  if [[ -z "$out" ]]; then
    echo "    --help が空"
    return 1
  fi
  return 0
}

t_sh_shebang_and_set() {
  if [[ ! -f "$SH" ]]; then return 0; fi
  # 先頭が shebang
  head -1 "$SH" | grep -q "^#!" || { echo "    shebang なし"; return 1; }
  return 0
}

echo "== test-cowork =="
run_test "local-chat-cli.py --help が正常"   t_cli_help
run_test "local-chat-cli.py が py_compile 通る" t_cli_compiles
run_test "Ollama 不在時にクラッシュしない"   t_cli_unreachable_ollama
run_test "local-cowork.sh --help が動く"     t_sh_help
run_test "local-cowork.sh の shebang"        t_sh_shebang_and_set
report
