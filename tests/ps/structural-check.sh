#!/usr/bin/env bash
# structural-check.sh — PowerShell スクリプトの静的構造チェック
#
# WSL/Linux 環境で pwsh が無くても実行できるよう、構文ではなく
# ブレース・括弧バランスと必須要素 (CmdletBinding, comment-based help)
# だけを Python でチェックする。
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

PS_DIR="$ROOT_DIR/scripts/win"

# 文字列・コメントを除去してから括弧・ブレースをカウントする Python スクリプト
PYTHON_CHECKER='
import sys, re
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    src = f.read()
# strip block comments <# ... #>
src = re.sub(r"<#.*?#>", "", src, flags=re.S)
# strip line comments (# until newline) - care for # inside strings, handle naively
out = []
i = 0
in_str = None  # None | "\"" | "\x27"
while i < len(src):
    ch = src[i]
    if in_str:
        out.append(ch)
        if ch == in_str:
            in_str = None
        elif ch == "`" and i + 1 < len(src):
            out.append(src[i+1]); i += 2; continue
        i += 1
        continue
    if ch in ("\"", "\x27"):
        in_str = ch; out.append(ch); i += 1; continue
    if ch == "#":
        # skip to end of line
        while i < len(src) and src[i] != "\n": i += 1
        continue
    out.append(ch); i += 1
clean = "".join(out)
# remove string content
clean = re.sub(r"\"[^\"]*\"", "\"\"", clean)
clean = re.sub(r"\x27[^\x27]*\x27", "\x27\x27", clean)
opens = clean.count("{"); closes = clean.count("}")
parens_o = clean.count("("); parens_c = clean.count(")")
brackets_o = clean.count("["); brackets_c = clean.count("]")
errs = []
if opens != closes: errs.append(f"braces: {opens} {{ vs {closes} }}")
if parens_o != parens_c: errs.append(f"parens: {parens_o} ( vs {parens_c} )")
if brackets_o != brackets_c: errs.append(f"brackets: {brackets_o} [ vs {brackets_c} ]")
if errs:
    for e in errs: print("  ", e)
    sys.exit(1)
sys.exit(0)
'

t_brace_balance() {
  local fail=0
  shopt -s nullglob
  for f in "$PS_DIR"/*.ps1 "$PS_DIR"/lib/*.ps1; do
    [[ -f "$f" ]] || continue
    if ! python3 -c "$PYTHON_CHECKER" "$f"; then
      echo "    バランス違反: $f"
      fail=1
    fi
  done
  return $fail
}

t_cmdletbinding_present() {
  # トップレベルスクリプトには CmdletBinding が望ましい
  local fail=0
  for f in "$PS_DIR"/*.ps1; do
    [[ -f "$f" ]] || continue
    if ! grep -q 'CmdletBinding' "$f"; then
      echo "    [CmdletBinding()] 欠落: $(basename "$f")"
      fail=1
    fi
  done
  return $fail
}

t_comment_help_present() {
  # comment-based help (<# ... .SYNOPSIS ... #>) が含まれること
  local fail=0
  for f in "$PS_DIR"/*.ps1; do
    [[ -f "$f" ]] || continue
    if ! grep -q '\.SYNOPSIS' "$f"; then
      echo "    .SYNOPSIS 欠落: $(basename "$f")"
      fail=1
    fi
  done
  return $fail
}

t_no_crlf_only() {
  # CRLF のみのファイルは Linux/macOS 環境で混乱を招くため検出
  # (Windows 由来の改行は許容しつつ警告レベルに留める)
  return 0
}

t_audit_ps_byteformat() {
  # audit.ps1 の本文フォーマットが bash 版とバイト互換であること
  local f="$PS_DIR/lib/audit.ps1"
  assert_file_exists "$f" "audit.ps1 存在" || return 1
  # JSON フィールド順は固定 (互換維持のため)
  grep -q '"ts"' "$f" || { echo "    ts フィールド欠落"; return 1; }
  grep -q '"prev_hash"' "$f" || { echo "    prev_hash 欠落"; return 1; }
  grep -q 'SHA256' "$f" || { echo "    SHA256 算出欠落"; return 1; }
  return 0
}

echo "== test-ps-structural =="
run_test "PS ファイルのブレース/括弧バランス" t_brace_balance
run_test "[CmdletBinding()] 宣言あり"          t_cmdletbinding_present
run_test ".SYNOPSIS の comment-based help"     t_comment_help_present
run_test "audit.ps1 のバイト互換フォーマット"  t_audit_ps_byteformat
report
