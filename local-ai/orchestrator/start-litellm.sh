#!/usr/bin/env bash
# LiteLLM プロキシ（OpenAI互換, 127.0.0.1:4000）を起動。モデル: auto / fast / balanced / smart
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DIR="${LITELLM_DIR:-$HOME/litellm}"
PORT="${PORT:-4000}"
command -v uv >/dev/null || { echo "uv が必要です: https://docs.astral.sh/uv/ を参照してインストールしてください" >&2; exit 1; }
mkdir -p "$DIR"
[ -x "$DIR/.venv/bin/litellm" ] || { uv venv -p 3.11 "$DIR/.venv" && uv pip install -p "$DIR/.venv" 'litellm[proxy]'; }
# マスターキーはリポジトリに置かず、初回にランダム生成して $DIR/master_key (0600) に保存
KEY_FILE="$DIR/master_key"
[ -s "$KEY_FILE" ] || { (umask 077; python3 -c 'import secrets;print("sk-local-"+secrets.token_hex(16))' >"$KEY_FILE"); }
LITELLM_MASTER_KEY="$(cat "$KEY_FILE")"; export LITELLM_MASTER_KEY
# 多重起動防止: ポートが LISTEN 中、または同じポートの litellm プロセスが起動途中なら何もしない
# （起動に20秒以上かかる／推論中にヘルスチェックが3秒でタイムアウトする、のが重複起動の原因だった）
if ss -ltn "sport = :$PORT" 2>/dev/null | grep -q LISTEN || pgrep -f "litellm .*--port $PORT" >/dev/null; then
  echo "LiteLLM は起動済み/起動中 (port $PORT)"; exit 0
fi
cd "$HERE"
setsid nohup "$DIR/.venv/bin/litellm" --config "$HERE/litellm-config.yaml" --host 127.0.0.1 --port "$PORT" \
  >/tmp/litellm.log 2>&1 &
echo "LiteLLM 起動中: http://127.0.0.1:$PORT/v1 (ログ: /tmp/litellm.log)"
