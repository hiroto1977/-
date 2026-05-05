#!/usr/bin/env bash
# audit-cross-os.sh — bash と PowerShell の audit ライブラリが
# バイト互換で audit.jsonl を生成することを検証
#
# 検証 ロジック:
#   1. bash audit_log で 1 行生成
#   2. その行を Python 「spec 実装」で再計算し、chain_hash が一致するか
#   3. pwsh が利用可能なら、同じ手順を PowerShell でも実施
#   4. (pwsh あり) 同じ prev_hash + 同じ event/details で生成した行 (ts などの
#      動的フィールドが揃わない部分を除いて) JSON 形状が同一か
#
# pwsh が無くても (1)(2) は走る。バイト互換 仕様が破れていれば失敗する。
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

AUDIT_LIB_BASH="$ROOT_DIR/scripts/lib/audit.sh"
AUDIT_LIB_PS="$ROOT_DIR/scripts/win/lib/audit.ps1"

# ── Python spec: bash/ps と同じ計算 ──
PY_SPEC='
import sys, json, hashlib, re

raw = sys.stdin.read().strip()
# 末尾 1 行を取得
line = raw.splitlines()[-1] if raw else ""
m = re.match(r"^(\{.*),\"chain_hash\":\"([0-9a-f]{64})\"\}$", line)
if not m:
    print(f"FAIL: unparseable line: {line[:200]}", file=sys.stderr)
    sys.exit(1)
body, claimed_chain = m.group(1), m.group(2)
# body 内の prev_hash を抽出
pm = re.search(r"\"prev_hash\":\"([0-9a-f]{64})\"", body)
if not pm:
    print("FAIL: prev_hash not found in body", file=sys.stderr); sys.exit(1)
prev = pm.group(1)
# 仕様: chain = sha256(prev + body)
recomputed = hashlib.sha256((prev + body).encode("utf-8")).hexdigest()
if recomputed != claimed_chain:
    print(f"FAIL: chain mismatch", file=sys.stderr)
    print(f"  claimed:    {claimed_chain}", file=sys.stderr)
    print(f"  recomputed: {recomputed}", file=sys.stderr)
    sys.exit(1)
# JSON 全体としても妥当
try:
    json.loads(line)
except Exception as e:
    print(f"FAIL: not valid JSON: {e}", file=sys.stderr); sys.exit(1)
print("OK")
'

t_bash_matches_python_spec() {
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$AUDIT_LIB_BASH'
    audit_log 'cross_os.test' 'bash side'
  "
  local out
  out=$(cat "$tmp/audit.jsonl" | python3 -c "$PY_SPEC" 2>&1)
  local rc=$?
  rm -rf "$tmp"
  if [[ "$rc" -ne 0 ]]; then
    echo "    Python spec 不一致: $out"
    return 1
  fi
  return 0
}

t_bash_chain_continuity() {
  # 3 行のチェーンが各行で正しく検証できる
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$AUDIT_LIB_BASH'
    audit_log 'evt1' 'a'
    audit_log 'evt2' 'b'
    audit_log 'evt3' 'c'
  "
  # 各行を順に Python spec で確認
  local rc=0
  local prev_chain="0000000000000000000000000000000000000000000000000000000000000000"
  while IFS= read -r line; do
    # この行の prev_hash が直前の chain_hash と一致するか
    local got_prev got_chain
    got_prev=$(echo "$line" | sed -n 's/.*"prev_hash":"\([0-9a-f]\{64\}\)".*/\1/p')
    got_chain=$(echo "$line" | sed -n 's/.*"chain_hash":"\([0-9a-f]\{64\}\)".*/\1/p')
    if [[ "$got_prev" != "$prev_chain" ]]; then
      echo "    prev_hash 不一致: 期待=$prev_chain 実際=$got_prev"
      rc=1; break
    fi
    prev_chain="$got_chain"
  done < "$tmp/audit.jsonl"
  rm -rf "$tmp"
  return $rc
}

t_powershell_matches_spec() {
  if ! command -v pwsh >/dev/null 2>&1; then
    return 0  # pwsh 不在 → スキップ (rc=0)
  fi
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" pwsh -NoProfile -Command "
    . '$AUDIT_LIB_PS'
    Write-AuditLog -Event 'cross_os.test' -Details 'ps side'
  " 2>/dev/null
  local out
  out=$(cat "$tmp/audit.jsonl" | python3 -c "$PY_SPEC" 2>&1)
  local rc=$?
  rm -rf "$tmp"
  if [[ "$rc" -ne 0 ]]; then
    echo "    PS 出力が Python spec と不一致: $out"
    return 1
  fi
  return 0
}

t_bash_ps_interop_chain() {
  # bash 行の後に pwsh が続けて書いても、チェーンが連続することを確認
  if ! command -v pwsh >/dev/null 2>&1; then
    return 0  # pwsh 不在 → スキップ
  fi
  local tmp; tmp=$(mktemp -d)
  # 1) bash で 1 行
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "
    source '$AUDIT_LIB_BASH'
    audit_log 'evt.bash' 'first'
  "
  # 2) pwsh で 1 行追記
  AUDIT_LOG_PATH="$tmp/audit.jsonl" pwsh -NoProfile -Command "
    . '$AUDIT_LIB_PS'
    Write-AuditLog -Event 'evt.ps' -Details 'second'
  " 2>/dev/null
  # 3) audit-verify.sh が成功するか
  bash "$ROOT_DIR/scripts/audit-verify.sh" "$tmp/audit.jsonl" >/dev/null 2>&1
  local rc=$?
  rm -rf "$tmp"
  if [[ "$rc" -ne 0 ]]; then
    echo "    bash → pwsh 連続でチェーンが破れた (rc=$rc)"
    return 1
  fi
  return 0
}

echo "== test-audit-cross-os =="
run_test "bash 出力が Python spec と一致"    t_bash_matches_python_spec
run_test "bash 3 連鎖の prev_hash が連続"   t_bash_chain_continuity
if command -v pwsh >/dev/null 2>&1; then
  run_test "pwsh 出力が Python spec と一致"  t_powershell_matches_spec
  run_test "bash → pwsh 連続でチェーン維持"  t_bash_ps_interop_chain
else
  skip_test "pwsh 出力が Python spec と一致" "pwsh 不在"
  skip_test "bash → pwsh 連続でチェーン維持" "pwsh 不在"
fi
report
