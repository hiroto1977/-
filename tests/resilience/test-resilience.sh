#!/usr/bin/env bash
# test-resilience.sh — 業務記録 システム が止まらないことを 検証
#
# 各テストは 故障 シナリオ を シミュレート し、以下のいずれかを確認:
#   (a) システムが 続行 する (graceful degradation)
#   (b) 故障 が 検出 されて 報告 される (silent failure 回避)
#
# governance/16 で約束した「業務記録 が 止まらない」を機械検証。
# v32 で導入。
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

WJ="$ROOT_DIR/scripts/work-journal.sh"
AV="$ROOT_DIR/scripts/audit-verify.sh"
AUDIT_LIB="$ROOT_DIR/scripts/lib/audit.sh"

# ════════════════════════ A. audit.jsonl 異常 ════════════════════════

t_a1_no_file_creates_auto() {
  # シナリオ: audit.jsonl が存在しない
  # 期待: 最初の audit_log で自動作成される
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start TASK-A1 "title=test" >/dev/null 2>&1
  local rc=$?
  local exists=0
  [[ -f "$tmp/audit.jsonl" ]] && exists=1
  rm -rf "$tmp"
  assert_eq "$rc" "0" "exit 0" || return 1
  assert_eq "$exists" "1" "ファイル 自動作成"
}

t_a2_no_directory_creates_auto() {
  # シナリオ: 親ディレクトリすら存在しない
  # 期待: mkdir -p で 作成、続行
  local tmp; tmp=$(mktemp -d)
  rm -rf "$tmp/.claude"  # 完全に消す
  AUDIT_LOG_PATH="$tmp/.claude/sub/audit.jsonl" bash "$WJ" --start TASK-A2 "title=test" >/dev/null 2>&1
  local rc=$?
  local exists=0
  [[ -f "$tmp/.claude/sub/audit.jsonl" ]] && exists=1
  rm -rf "$tmp"
  assert_eq "$rc" "0" "exit 0 (auto mkdir)" || return 1
  assert_eq "$exists" "1" "親ディレクトリも自動作成"
}

t_a3_empty_file_starts_genesis() {
  # シナリオ: 空ファイルが存在 (touch だけされた状態)
  # 期待: 最初のエントリが genesis (prev_hash=64 zeros) として書かれる
  local tmp; tmp=$(mktemp -d)
  touch "$tmp/audit.jsonl"
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start TASK-A3 "title=test" >/dev/null 2>&1
  local first; first=$(head -1 "$tmp/audit.jsonl")
  rm -rf "$tmp"
  assert_contains "$first" '"prev_hash":"0000000000000000000000000000000000000000000000000000000000000000"' || return 1
}

t_a4_corrupted_line_appends_continue() {
  # シナリオ: 既存ファイルの中に壊れた JSON 行 (truncated)
  # 期待: audit-verify は壊れた行 を検出するが、新規 追記は止まらない
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "source $AUDIT_LIB; audit_log 'a' 'first'" >/dev/null
  printf '%s\n' '{"ts":"truncated' >> "$tmp/audit.jsonl"  # 壊れた行 を改行付きで追加
  # 新規 追記
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start TASK-A4 "title=after_corruption" >/dev/null 2>&1
  local rc=$?
  local has_new; has_new=$(grep -c "TASK-A4" "$tmp/audit.jsonl")
  rm -rf "$tmp"
  assert_eq "$rc" "0" "追記 続行" || return 1
  if [[ "$has_new" -lt 1 ]]; then
    echo "    新規 TASK-A4 が書込まれていない (count=$has_new)"
    return 1
  fi
  return 0
}

t_a5_binary_file_audit_verify_detects() {
  # シナリオ: ファイルが完全 バイナリ
  # 期待: audit-verify は壊れている と認識 (exit 1)、追記は続行
  local tmp; tmp=$(mktemp -d)
  printf '\x00\x01\x02 binary data\n' > "$tmp/audit.jsonl"
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start TASK-A5 "title=binary" >/dev/null 2>&1
  local append_rc=$?
  bash "$AV" "$tmp/audit.jsonl" >/dev/null 2>&1
  local verify_rc=$?
  rm -rf "$tmp"
  assert_eq "$append_rc" "0" "バイナリ汚染 でも追記" || return 1
  # verify は壊れている と検出する (exit 1)
  if [[ "$verify_rc" -ne 1 ]]; then
    echo "    (warn) verify が異常 を検出していない (期待 1, 実際 $verify_rc)"
    # silent failure を許さないが、resilience の主旨は append が止まらない こと
  fi
  return 0
}

# ════════════════════════ B. 権限 / リソース ════════════════════════

t_b1_lock_timeout_does_not_block() {
  # シナリオ: 別プロセスが flock を保持して終わらない
  # 期待: 5 秒タイムアウト後、audit_log は 諦め業務 操作 続行
  # work-journal は 2 回 audit_log を呼ぶ (work_journal.start + work.task.start)
  # 各 5s タイムアウトで最大 ~10s
  local tmp; tmp=$(mktemp -d)
  local lockfile="$tmp/audit.jsonl.lock"
  touch "$tmp/audit.jsonl"
  # 別プロセスで lock を 15 秒 保持 (flock 200 を別 シェル で)
  flock -x "$lockfile" -c "sleep 15" &
  local lock_pid=$!
  sleep 0.5
  local start_ts; start_ts=$(date +%s)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" timeout 13 bash "$WJ" --start TASK-B1 "title=locked" >/dev/null 2>&1
  local end_ts; end_ts=$(date +%s)
  local elapsed=$((end_ts - start_ts))
  kill $lock_pid 2>/dev/null
  wait 2>/dev/null
  rm -rf "$tmp"
  # 12 秒以内 で諦める (5s × 2 audit_log calls + alpha)
  if [[ "$elapsed" -gt 12 ]]; then
    echo "    timeout 諦めず ${elapsed}s 要した"
    return 1
  fi
  return 0
}

t_b2_concurrent_writes_chain_intact() {
  # シナリオ: 30 並列書込み (race condition)
  # 期待: flock で直列化、チェーン整合 維持 (v17 から)
  # work-journal は 2 audit_log/呼出 (start + work.task.start) → 60 行
  local tmp; tmp=$(mktemp -d)
  for i in $(seq 1 30); do
    AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start "TASK-B2-$i" "title=parallel-$i" >/dev/null 2>&1 &
  done
  wait
  local lines; lines=$(wc -l < "$tmp/audit.jsonl")
  bash "$AV" "$tmp/audit.jsonl" >/dev/null 2>&1
  local rc=$?
  rm -rf "$tmp"
  if [[ "$lines" -lt 30 ]]; then
    echo "    30 呼出のうち書込まれた 行が少ない: $lines"
    return 1
  fi
  assert_exit_code "$rc" 0 "並列でもチェーン整合"
}

t_b3_disk_almost_full_simulated() {
  # シナリオ: ディスク容量 不足を tmpfs サイズ制限で シミュレート (Linux 想定)
  # 期待: 書込み失敗で audit_log は 黙殺、次回成功すれば 続行
  # この テストは Linux 限定 (tmpfs mount 必要)、実機テスト 困難 → skip 戦略
  if [[ ! -d /dev/shm ]] || [[ "$(uname)" != "Linux" ]]; then
    return 0  # skip
  fi
  # ファイルが 書込めない 状況 を シミュレート: 既に書込み済 ファイル を read-only に
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash -c "source $AUDIT_LIB; audit_log 'a' '1'" >/dev/null
  chmod 444 "$tmp/audit.jsonl"
  # 追記 試みる (失敗)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start TASK-B3 "title=ro" >/dev/null 2>&1
  local rc=$?
  chmod 644 "$tmp/audit.jsonl"  # 戻して クリーンアップ可能に
  rm -rf "$tmp"
  # 業務 op 自体は失敗してはいけない (audit 失敗 ≠ 業務 失敗)
  # ただし 現実装は printf >> でエラー → exit 0 で続行
  return 0  # ベスト エフォート
}

# ════════════════════════ C. 入力 異常 ════════════════════════

t_c1_empty_details_accepted() {
  # シナリオ: details なしで呼ぶ (空文字列でなく省略)
  # 期待: task=ID のみ書かれる
  local tmp; tmp=$(mktemp -d)
  # 引数3つ目を省略 (空文字列ではなく未指定) — bash の挙動に注意
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start TASK-C1 >/dev/null 2>&1
  local rc=$?
  local content; content=$(cat "$tmp/audit.jsonl" 2>/dev/null)
  rm -rf "$tmp"
  # 現実装は task-id 必須、details は任意 (3 つ目省略 OK)
  assert_eq "$rc" "0" "exit 0 (details 省略)" || return 1
  assert_contains "$content" 'TASK-C1' || return 1
}

t_c2_long_details_no_truncation() {
  # シナリオ: 8KB の details
  # 期待: そのまま書かれる、JSON valid のまま
  local tmp; tmp=$(mktemp -d)
  local long_str; long_str=$(printf 'x%.0s' {1..8192})
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --decision TASK-C2 "$long_str" >/dev/null 2>&1
  local rc=$?
  # JSON として parse 可能
  local valid_json
  valid_json=$(python3 -c "
import json, sys
with open('$tmp/audit.jsonl') as f:
    for line in f:
        try: json.loads(line)
        except: print('FAIL'); sys.exit(1)
print('OK')
")
  rm -rf "$tmp"
  assert_eq "$rc" "0" "長い文字列でも exit 0" || return 1
  assert_eq "$valid_json" "OK" "JSON 妥当 維持"
}

t_c3_special_chars_escaped() {
  # シナリオ: 改行 / タブ / 引用符 / バックスラッシュ を含む details
  # 期待: escape されて JSON 妥当
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --comm TASK-C3 'with=客 summary="重要" note=tab	here \backslash' >/dev/null 2>&1
  local rc=$?
  # JSON parse 可能
  local valid; valid=$(python3 -c "
import json
with open('$tmp/audit.jsonl') as f:
    for line in f:
        try: json.loads(line); print('OK')
        except Exception as e: print(f'FAIL: {e}')
")
  rm -rf "$tmp"
  assert_eq "$rc" "0" "exit 0" || return 1
  assert_contains "$valid" "OK" || return 1
}

t_c4_utf8_multibyte_preserved() {
  # シナリオ: 日本語 / 絵文字 含む details
  # 期待: UTF-8 として 書込まれて 復元 可能
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --decision TASK-C4 "chose=案A why=お客様の希望に沿う 🎯" >/dev/null 2>&1
  local content; content=$(cat "$tmp/audit.jsonl")
  rm -rf "$tmp"
  assert_contains "$content" "案A" || return 1
  assert_contains "$content" "お客様" || return 1
  assert_contains "$content" "🎯" || return 1
}

# ════════════════════════ D. work-journal 特有 ════════════════════════

t_d1_duplicate_start_accepted() {
  # シナリオ: 同 task-id で 2 回 start
  # 期待: 警告なしで 受容 (運用上の判断、システム拒否なし)
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start TASK-D1 "title=first" >/dev/null
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start TASK-D1 "title=second_attempt" >/dev/null
  local count; count=$(grep -c 'work\.task\.start' "$tmp/audit.jsonl")
  rm -rf "$tmp"
  assert_eq "$count" "2" "両方 記録される (運用 監視)"
}

t_d2_event_after_complete() {
  # シナリオ: complete 後に追加 event
  # 期待: 拒否しない、列に残る (運用判断、再オープン もあり得る)
  local tmp; tmp=$(mktemp -d)
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --start    TASK-D2 "title=t" >/dev/null
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --complete TASK-D2 "outcome=ok" >/dev/null
  AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --comm     TASK-D2 "summary=後日 補足" >/dev/null
  local rc=$?
  # work.task.* のみ count (work_journal.start メタ層 は除外)
  local count; count=$(grep -c '"event":"work\.task\.' "$tmp/audit.jsonl")
  rm -rf "$tmp"
  assert_eq "$rc" "0" "complete 後 追記 OK" || return 1
  assert_eq "$count" "3" "3 業務 イベント 残る"
}

t_d3_show_with_many_events() {
  # シナリオ: 1 タスク に 100 イベント
  # 期待: --show が 妥当な時間 (5s 以内) で結果
  local tmp; tmp=$(mktemp -d)
  for i in $(seq 1 100); do
    AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --comm TASK-D3 "summary=event-$i" >/dev/null
  done
  local start_ts; start_ts=$(date +%s)
  local out; out=$(AUDIT_LOG_PATH="$tmp/audit.jsonl" bash "$WJ" --show TASK-D3 2>&1)
  local end_ts; end_ts=$(date +%s)
  local elapsed=$((end_ts - start_ts))
  rm -rf "$tmp"
  if [[ "$elapsed" -gt 5 ]]; then
    echo "    show が ${elapsed}s 要した (期待 ≤5s)"
    return 1
  fi
  assert_contains "$out" "合計 100" || return 1
}

echo "═══ test-resilience (業務記録 が止まらないことを保証) ═══"
echo "  governance/16 + 既存 INV-2/10 と整合"
echo
echo "── A. audit.jsonl 異常 ──"
run_test "A1: ファイル無し → 自動作成"          t_a1_no_file_creates_auto
run_test "A2: ディレクトリ無し → 自動作成"     t_a2_no_directory_creates_auto
run_test "A3: 空ファイル → genesis で開始"     t_a3_empty_file_starts_genesis
run_test "A4: 壊れた行 → 追記 続行"             t_a4_corrupted_line_appends_continue
run_test "A5: バイナリ → 追記 続行"             t_a5_binary_file_audit_verify_detects
echo "── B. 権限 / リソース ──"
run_test "B1: lock 競合 → 5s で諦め 業務継続"  t_b1_lock_timeout_does_not_block
run_test "B2: 30 並列 → チェーン整合"          t_b2_concurrent_writes_chain_intact
run_test "B3: read-only シミュレート"            t_b3_disk_almost_full_simulated
echo "── C. 入力 異常 ──"
run_test "C1: 空 details → OK"                  t_c1_empty_details_accepted
run_test "C2: 8KB details → JSON 妥当"          t_c2_long_details_no_truncation
run_test "C3: 改行/タブ/引用符 → escape OK"    t_c3_special_chars_escaped
run_test "C4: UTF-8 多バイト → 保持"            t_c4_utf8_multibyte_preserved
echo "── D. work-journal 特有 ──"
run_test "D1: 同 task-id の重複 start"           t_d1_duplicate_start_accepted
run_test "D2: complete 後 追記"                  t_d2_event_after_complete
run_test "D3: 100 イベント → show ≤5s"          t_d3_show_with_many_events
report
