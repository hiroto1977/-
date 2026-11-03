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
cd "$HERE"
setsid nohup "$DIR/.venv/bin/litellm" --config "$HERE/litellm-config.yaml" --host 127.0.0.1 --port "$PORT" \
  >/tmp/litellm.log 2>&1 &
echo "LiteLLM 起動中: http://127.0.0.1:$PORT/v1 (ログ: /tmp/litellm.log)"
