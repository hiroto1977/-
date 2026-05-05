#!/usr/bin/env bash
# audit.sh — 監査ログ ライブラリ (source して使う)
#
# 各スクリプトが「いつ・誰が・何のコマンドで・何をしたか」を 改竄検知可能 な
# JSONL ファイルに記録する。各エントリは SHA-256 で前のエントリと連鎖する。
#
# 使い方 (呼び出し側):
#   source "$(dirname "$0")/lib/audit.sh"
#   audit_log "event_name" "details (free text or JSON)"
#
# 環境変数:
#   AUDIT_LOG_PATH   既定: ~/.claude/audit.jsonl
#   AUDIT_LOG_OFF    1 を設定するとロギングを無効化 (テスト用)
#   AUDIT_LOG_RETENTION_DAYS  既定 365 (内部使用)
#
# ロックなし: 短命な単発スクリプトを想定。並行実行時の race 検出は audit-verify で行う。

# --- ガード: 既に source されている場合は再定義しない ---
[[ -n "${AUDIT_SH_LOADED:-}" ]] && return 0
AUDIT_SH_LOADED=1

# 既定値
AUDIT_LOG_PATH="${AUDIT_LOG_PATH:-${HOME}/.claude/audit.jsonl}"
AUDIT_LOG_RETENTION_DAYS="${AUDIT_LOG_RETENTION_DAYS:-365}"

# ----- ヘルパ: SHA-256 -----
_audit_sha256() {
  # stdin からハッシュ計算、64 文字 hex を出力
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 -r | awk '{print $1}'
  else
    # 利用可能なツールがないとチェーンが動かない
    echo "0000000000000000000000000000000000000000000000000000000000000000"
  fi
}

# 現在の chain_hash の取得 (最新エントリの chain_hash)
_audit_last_hash() {
  if [[ -f "$AUDIT_LOG_PATH" ]]; then
    # 最終行の "chain_hash":"..." を抽出
    tail -n 1 "$AUDIT_LOG_PATH" 2>/dev/null \
      | sed -n 's/.*"chain_hash":"\([0-9a-f]\{64\}\)".*/\1/p' \
      | head -1
  fi
}

# JSON 文字列の最小エスケープ
_audit_json_escape() {
  # \ → \\, " → \", 改行 → \n, タブ → \t
  printf '%s' "$1" \
    | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' \
    | tr '\n' '\1' | sed 's/\x01/\\n/g' \
    | tr '\t' '\1' | sed 's/\x01/\\t/g'
}

# ----- メイン: audit_log <event> [details] -----
audit_log() {
  [[ "${AUDIT_LOG_OFF:-0}" == "1" ]] && return 0

  local event="${1:-unknown}"
  local details="${2:-}"

  # ログディレクトリ作成
  mkdir -p "$(dirname "$AUDIT_LOG_PATH")" 2>/dev/null || return 0

  # 前のチェーン (なければゼロ)
  local prev
  prev=$(_audit_last_hash)
  [[ -z "$prev" ]] && prev="0000000000000000000000000000000000000000000000000000000000000000"

  # フィールド準備
  local ts host user pid script_name
  ts=$(date -Iseconds 2>/dev/null || date "+%Y-%m-%dT%H:%M:%S%z")
  host=$(hostname 2>/dev/null || echo unknown)
  user=$(id -un 2>/dev/null || echo unknown)
  pid=$$
  script_name="$(basename "${BASH_SOURCE[1]:-${0:-unknown}}")"

  # JSON 本体 (chain_hash を除く)
  local body
  body=$(printf '{"ts":"%s","host":"%s","user":"%s","pid":%d,"script":"%s","event":"%s","details":"%s","prev_hash":"%s"' \
    "$(_audit_json_escape "$ts")" \
    "$(_audit_json_escape "$host")" \
    "$(_audit_json_escape "$user")" \
    "$pid" \
    "$(_audit_json_escape "$script_name")" \
    "$(_audit_json_escape "$event")" \
    "$(_audit_json_escape "$details")" \
    "$prev")

  # 連鎖ハッシュ計算: sha256(prev_hash + body)
  local chain
  chain=$(printf '%s%s' "$prev" "$body" | _audit_sha256)

  # 完成 JSON 行 (1 行)
  printf '%s,"chain_hash":"%s"}\n' "$body" "$chain" >> "$AUDIT_LOG_PATH"

  return 0
}

# ----- ローテーション (古い行を削除) -----
audit_rotate() {
  local days="${1:-$AUDIT_LOG_RETENTION_DAYS}"
  [[ ! -f "$AUDIT_LOG_PATH" ]] && return 0

  local cutoff_epoch
  cutoff_epoch=$(date -d "$days days ago" +%s 2>/dev/null \
              || date -j -v-"${days}"d +%s 2>/dev/null \
              || echo 0)
  [[ "$cutoff_epoch" -eq 0 ]] && return 0

  # 各行の "ts" を読み、cutoff より新しいものだけ残す
  # 注意: このローテーションでチェーンは「切断」される (intentional)
  local tmp
  tmp=$(mktemp 2>/dev/null) || return 0

  awk -v cutoff="$cutoff_epoch" '
  {
    match($0, /"ts":"[^"]+"/);
    ts_str = substr($0, RSTART+6, RLENGTH-7);
    # ISO 8601 を epoch に変換するのは awk で困難なので、生 ts を比較
    # 簡易: 文字列比較で十分 (ISO 8601 は辞書順 = 時系列順)
    if (ts_str >= cutoff_iso) print;
  }' cutoff_iso="$(date -d @$cutoff_epoch -Iseconds 2>/dev/null || date -j -f %s $cutoff_epoch -Iseconds 2>/dev/null)" \
     "$AUDIT_LOG_PATH" > "$tmp" && mv "$tmp" "$AUDIT_LOG_PATH" || rm -f "$tmp"
}
