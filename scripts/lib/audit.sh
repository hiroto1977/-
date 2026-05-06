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

  # 並行書込 レース 防止 (INV-2 強化、v17)
  # flock で read-prev → compute-chain → write を一度に直列化
  local lockfile="${AUDIT_LOG_PATH}.lock"
  exec 200>>"$lockfile"
  if command -v flock >/dev/null 2>&1; then
    # 5 秒以内にロックが取れなければスキップ (audit が業務を阻害しないように)
    flock -w 5 200 || { exec 200>&-; return 0; }
  fi

  # 前のチェーン (なければゼロ) ─ ロック内で最新行を読む
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

  # ロック解放 (fd を閉じる → flock も解除される)
  exec 200>&-

  return 0
}

# ----- ローテーション (古い行を削除 + 残行を 再チェーン化) -----
# v15 で改修: 削除後に (1) audit.rotation.checkpoint を新 genesis として挿入、
# (2) 残行の prev_hash / chain_hash を 再計算。これにより rotate 後も
# audit-verify が通る (INV-2 / INV-10 を維持)。
# checkpoint の details に旧チェーンの最終 chain_hash を記録 → forensic 継続性。
audit_rotate() {
  local days="${1:-$AUDIT_LOG_RETENTION_DAYS}"
  [[ ! -f "$AUDIT_LOG_PATH" ]] && return 0

  local cutoff_epoch
  cutoff_epoch=$(date -d "$days days ago" +%s 2>/dev/null \
              || date -j -v-"${days}"d +%s 2>/dev/null \
              || echo 0)
  [[ "$cutoff_epoch" -eq 0 ]] && return 0

  local cutoff_iso
  cutoff_iso=$(date -d "@$cutoff_epoch" -Iseconds 2>/dev/null \
            || date -j -f %s $cutoff_epoch -Iseconds 2>/dev/null \
            || echo "")
  [[ -z "$cutoff_iso" ]] && return 0

  # Python で 1) cutoff より古い行を集め最終 chain_hash を取得
  #          2) checkpoint event を 新 genesis として先頭に挿入
  #          3) 残行の prev_hash/chain_hash を再計算 (バイト互換維持)
  python3 - "$AUDIT_LOG_PATH" "$cutoff_iso" <<'PY' || return 0
import sys, json, hashlib, os, tempfile
from datetime import datetime, timezone
log_path = sys.argv[1]
cutoff_iso = sys.argv[2]
ZERO = '0' * 64

def escape(s):
    return str(s if s is not None else '').replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\t', '\\t')

def reconstruct_body(e, prev_hash):
    return ('{"ts":"' + escape(e['ts']) + '","host":"' + escape(e.get('host', '')) +
            '","user":"' + escape(e.get('user', '')) + '","pid":' + str(e.get('pid', 0)) +
            ',"script":"' + escape(e.get('script', '')) + '","event":"' + escape(e.get('event', '')) +
            '","details":"' + escape(e.get('details', '')) + '","prev_hash":"' + prev_hash + '"')

keep, last_old_hash = [], None
with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        line = line.rstrip('\n')
        if not line: continue
        try:
            e = json.loads(line)
        except Exception:
            continue
        if e.get('ts', '') >= cutoff_iso:
            keep.append(e)
        else:
            last_old_hash = e.get('chain_hash')

# 削除対象なし → no-op
if last_old_hash is None:
    sys.exit(0)

# 1) 新 genesis: rotation checkpoint
ts_now = datetime.now(timezone.utc).astimezone().isoformat(timespec='seconds')
checkpoint = {
    'ts': ts_now,
    'host': (os.uname().nodename if hasattr(os, 'uname') else 'unknown'),
    'user': os.environ.get('USER', os.environ.get('USERNAME', 'unknown')),
    'pid': os.getpid(),
    'script': 'audit.sh',
    'event': 'audit.rotation.checkpoint',
    'details': f'old_chain_last={last_old_hash} retained={len(keep)} cutoff={cutoff_iso}',
}

# 2) チェーン構築
new_lines = []
prev = ZERO
body = reconstruct_body(checkpoint, prev)
chain = hashlib.sha256((prev + body).encode('utf-8')).hexdigest()
new_lines.append(body + ',"chain_hash":"' + chain + '"}')
prev = chain

for e in keep:
    body = reconstruct_body(e, prev)
    chain = hashlib.sha256((prev + body).encode('utf-8')).hexdigest()
    new_lines.append(body + ',"chain_hash":"' + chain + '"}')
    prev = chain

# 3) atomic write
dir_ = os.path.dirname(log_path) or '.'
tmp_fd, tmp_path = tempfile.mkstemp(prefix='audit-rot-', dir=dir_)
with os.fdopen(tmp_fd, 'w', encoding='utf-8') as f:
    for l in new_lines:
        f.write(l + '\n')
os.replace(tmp_path, log_path)
PY
}
