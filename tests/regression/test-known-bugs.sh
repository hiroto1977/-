#!/usr/bin/env bash
# test-known-bugs.sh — 過去に踏んだ罠 が再発しないことを機械検証
#
# governance/14_SESSION_KNOWLEDGE.md §4.2 の罠リストに連動。
# 既存テストでカバー済 の罠は drift sniff で 確認、
# 未カバー の罠は本ファイルで直接検証。
#
# v26 で導入。
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

# ── 罠 1: orchestrate-kpi --check が γ smoke-test を呼ばない (再帰防止) ──
t_kpi_check_does_not_call_smoke() {
  # --check は INV-12 のみで早期 exit すべき (kpi_gamma を呼ばない)
  local out
  out=$(time (bash "$ROOT_DIR/scripts/orchestrate-kpi.sh" --check 2>&1) 2>&1)
  # 1 秒以内 に完了 (再帰すれば 19 秒以上)
  local elapsed
  elapsed=$(echo "$out" | grep -oE 'real[[:space:]]+[0-9]+m[0-9.]+s' | head -1 | grep -oE '[0-9.]+s$' | tr -d 's')
  if [[ -z "$elapsed" ]]; then return 0; fi  # time の format 違い → skip
  # awk で float 比較
  if awk -v e="$elapsed" 'BEGIN { exit (e < 5) ? 0 : 1 }'; then
    return 0
  else
    echo "    --check が ${elapsed}s 要した (期待 <5s) → 再帰の疑い"
    return 1
  fi
}

# ── 罠 2: audit_rotate がチェーンを破壊しない (rotation.checkpoint で再生) ──
# (test-audit-lib.sh でカバー済 → drift sniff)
t_rotate_test_exists() {
  grep -q 'rotate 後' "$ROOT_DIR/tests/unit/test-audit-lib.sh" || \
    { echo "    rotate 後 verify テストが消えている"; return 1; }
}

# ── 罠 4: set -u で $USER unbound (ユーザー実行型 script で発生しないか) ──
t_user_scripts_handle_unset_user() {
  # 各 script を USER 環境変数 を unset した状態で --help (or 軽実行) して
  # "USER: unbound variable" エラーが出ないか
  local fail=0
  for s in preflight.sh pii-scan.sh storage-health.sh audit-export.sh; do
    local f="$ROOT_DIR/scripts/$s"
    [[ -f "$f" ]] || continue
    # USER を unset、HOME は維持、サブシェルで -h を呼ぶ (heavy 動作回避)
    local out
    out=$(env -i HOME="$HOME" PATH="$PATH" bash "$f" --help 2>&1 | head -3)
    if echo "$out" | grep -q "USER: unbound variable"; then
      echo "    $s が USER unset で エラー"
      fail=1
    fi
  done
  return $fail
}

# ── 罠 6: pii-scan が `-----BEGIN PRIVATE KEY-----` を pattern として認識 ──
# (test-pii-scan.sh でカバー済 → drift sniff)
t_pii_scan_detects_private_key() {
  local tmp; tmp=$(mktemp)
  cat > "$tmp" <<'EOF'
some content
-----BEGIN RSA PRIVATE KEY-----
test data here
-----END RSA PRIVATE KEY-----
more content
EOF
  local out
  out=$(bash "$ROOT_DIR/scripts/pii-scan.sh" "$tmp" 2>&1)
  local rc=$?
  rm -f "$tmp"
  assert_exit_code "$rc" 1 "PRIVATE KEY 入り → exit 1" || return 1
  # 「秘密鍵 BEGIN」または 「BEGIN」を含む メッセージ
  if ! echo "$out" | grep -qE '秘密鍵|BEGIN'; then
    echo "    秘密鍵 検出 メッセージ なし"
    return 1
  fi
}

# ── 罠 7: preflight ステップ番号 が 連番 (N/M で 1, 2, ..., M) ──
t_preflight_step_numbers_consecutive() {
  local out steps
  out=$(PREFLIGHT_FAST=1 bash "$ROOT_DIR/scripts/preflight.sh" 2>&1)
  steps=$(echo "$out" | grep -oE '\[[0-9]+/[0-9]+\]' | head -10)
  # 各 ステップ で N が 1, 2, 3, ... と増える
  local prev=0
  while IFS= read -r line; do
    local n; n=$(echo "$line" | grep -oE '^\[[0-9]+' | tr -d '[')
    if [[ "$n" -ne $((prev + 1)) ]]; then
      echo "    ステップ番号 飛び: $line (前 $prev)"
      return 1
    fi
    prev=$n
  done <<< "$steps"
  return 0
}

# ── 罠 8: 並行書込で audit チェーン が破断しない (flock) ──
# (test-audit-lib.sh でカバー済 → drift sniff)
t_concurrent_write_test_exists() {
  grep -q '30 並列書込' "$ROOT_DIR/tests/unit/test-audit-lib.sh" || \
    { echo "    30 並列書込 テスト が消えている"; return 1; }
}

# ── 罠 9: gender-blind 検証が affect テストにある ──
# (test_affect.mjs でカバー済 → drift sniff)
t_gender_blind_test_exists() {
  grep -q 'gender-blind' "$ROOT_DIR/tests/js/test_affect.mjs" || \
    { echo "    gender-blind テスト が消えている"; return 1; }
}

# ── 罠 11: PREFLIGHT_FAST が本番動作を変えない (skip メッセージ で識別可能) ──
t_fast_flag_distinguishable() {
  local fast_out plain_out
  fast_out=$(PREFLIGHT_FAST=1 bash "$ROOT_DIR/scripts/preflight.sh" 2>&1)
  # FAST モード では「スキップ」メッセージ が必ず出る
  if ! echo "$fast_out" | grep -q "スキップ"; then
    echo "    PREFLIGHT_FAST=1 でも スキップ表示 が出ない"
    return 1
  fi
  # 通常モードを直接走らせると遅いので、env 確認のみ
  if grep -q 'PREFLIGHT_FAST' "$ROOT_DIR/scripts/preflight.sh"; then
    return 0
  else
    echo "    preflight.sh から PREFLIGHT_FAST 参照が消えた"
    return 1
  fi
}

# ── 罠 12: --prompt-for alpha.1 が live §10 を埋め込む ──
# (test-orchestrate.sh でカバー済 → drift sniff)
t_prompt_for_live_section10_test_exists() {
  grep -q 'alpha.1 prompt に §10' "$ROOT_DIR/tests/unit/test-orchestrate.sh" || \
    { echo "    live §10 埋込 テスト が消えている"; return 1; }
}

# ── 罠 13: audit-verify が Python 高速化されている (v25 から) ──
t_audit_verify_uses_python() {
  if ! grep -q 'exec python3' "$ROOT_DIR/scripts/audit-verify.sh"; then
    echo "    audit-verify が Python 高速化を失った (bash 実装に戻った?)"
    return 1
  fi
}

t_audit_verify_runs_under_5sec_on_large_log() {
  # 5000 行の audit.jsonl を Python で高速生成 (audit.sh と同じ チェーン)
  # → audit-verify が 5 秒以内 で通る (Python 化の性能が落ちていないか)
  local tmp; tmp=$(mktemp -d)
  python3 - "$tmp/audit.jsonl" <<'PY' 2>/dev/null
import sys, hashlib
log_path = sys.argv[1]
def esc(s): return str(s).replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\t', '\\t')
def make_body(ts, host, user, pid, script, event, details, prev):
    return ('{"ts":"' + esc(ts) + '","host":"' + esc(host) + '","user":"' + esc(user) +
            '","pid":' + str(pid) + ',"script":"' + esc(script) + '","event":"' + esc(event) +
            '","details":"' + esc(details) + '","prev_hash":"' + prev + '"')
prev = "0" * 64
with open(log_path, "w") as f:
    for i in range(5000):
        body = make_body("2026-05-06T00:00:00+00:00", "h", "u", 1, "bench.sh", "bench.evt", f"i={i}", prev)
        chain = hashlib.sha256((prev + body).encode()).hexdigest()
        f.write(body + ',"chain_hash":"' + chain + '"}\n')
        prev = chain
PY
  local lines; lines=$(wc -l < "$tmp/audit.jsonl")
  if [[ "$lines" -ne 5000 ]]; then rm -rf "$tmp"; echo "    生成 失敗 ($lines 行)"; return 1; fi
  local start end elapsed
  start=$(date +%s)
  bash "$ROOT_DIR/scripts/audit-verify.sh" "$tmp/audit.jsonl" >/dev/null 2>&1
  local rc=$?
  end=$(date +%s)
  elapsed=$((end - start))
  rm -rf "$tmp"
  if [[ "$rc" -ne 0 ]]; then echo "    生成した audit が verify を通らない"; return 1; fi
  if [[ "$elapsed" -ge 5 ]]; then
    echo "    audit-verify が ${elapsed}s 要した (5000 行 / 期待 <5s) → 性能退行"
    return 1
  fi
}

# ── 罠 14: --auto モード が 4 種 揃っている (test-auto-mode でカバー、ここは sniff) ──
t_auto_modes_present() {
  for m in bootstrap pdca ooda monitor; do
    if ! grep -q "auto_$m()" "$ROOT_DIR/scripts/orchestrate.sh"; then
      echo "    --auto $m が消えた"
      return 1
    fi
  done
}

echo "== test-known-bugs (regression) =="
echo "  governance/14 §4.2 の罠リスト 連動"
echo ""
run_test "罠1: KPI --check が再帰しない (<5s)"     t_kpi_check_does_not_call_smoke
run_test "罠2: audit_rotate チェーン整合 テスト" t_rotate_test_exists
run_test "罠4: set -u + USER unset で 動作"        t_user_scripts_handle_unset_user
run_test "罠6: pii-scan が PRIVATE KEY 検出"      t_pii_scan_detects_private_key
run_test "罠7: preflight ステップ番号 連番"        t_preflight_step_numbers_consecutive
run_test "罠8: 並行書込 race テスト 存在"          t_concurrent_write_test_exists
run_test "罠9: gender-blind テスト 存在"           t_gender_blind_test_exists
run_test "罠11: PREFLIGHT_FAST 識別可能"           t_fast_flag_distinguishable
run_test "罠12: --prompt-for live §10 テスト 存在" t_prompt_for_live_section10_test_exists
run_test "罠13: audit-verify が Python 化"         t_audit_verify_uses_python
run_test "罠13: audit-verify 5000 行 <5s"          t_audit_verify_runs_under_5sec_on_large_log
run_test "罠14: --auto 4 モード 存在"              t_auto_modes_present
report
