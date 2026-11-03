#!/usr/bin/env bash
# Docker なしで Open WebUI を起動 (uv 使用)
set -euo pipefail
DIR="${WEBUI_DIR:-$HOME/open-webui}"
mkdir -p "$DIR" && cd "$DIR"
command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
[ -d .venv ] || { uv venv -p 3.11 .venv && uv pip install -p .venv open-webui; }
pgrep -x ollama >/dev/null || (nohup ollama serve >/tmp/ollama.log 2>&1 &)
OLLAMA_BASE_URL=http://127.0.0.1:11434 DATA_DIR="$DIR/data" WEBUI_AUTH="${WEBUI_AUTH:-False}" \
  nohup .venv/bin/open-webui serve --host 127.0.0.1 --port 8080 >/tmp/webui.log 2>&1 &
echo "Open WebUI 起動中: http://localhost:8080 (ログ: /tmp/webui.log)"
