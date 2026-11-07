#!/usr/bin/env bash
# Docker なしで Open WebUI を起動 (uv 使用)。Ollama + OpenAI互換4種 (llama.cpp / llama-cpp-python / KoboldCpp / LocalAI) に接続
set -euo pipefail
DIR="${WEBUI_DIR:-$HOME/open-webui}"
mkdir -p "$DIR" && cd "$DIR"
command -v uv >/dev/null || { echo "uv が必要です（https://docs.astral.sh/uv/ を参照してインストール）" >&2; exit 1; }
[ -d .venv ] || { uv venv -p 3.11 .venv && uv pip install -p .venv open-webui; }
if ! pgrep -x ollama >/dev/null; then nohup ollama serve >/tmp/ollama.log 2>&1 & sleep 3; fi
pkill -f "open-webui serve" 2>/dev/null && sleep 2 || true
ENABLE_PERSISTENT_CONFIG=False \
ENABLE_OLLAMA_API=True OLLAMA_BASE_URL=http://127.0.0.1:11434 \
ENABLE_OPENAI_API=True \
OPENAI_API_BASE_URLS="${OPENAI_API_BASE_URLS:-http://127.0.0.1:8081/v1;http://127.0.0.1:8085/v1;http://127.0.0.1:8084/v1}" \
OPENAI_API_KEYS="${OPENAI_API_KEYS:-none;none;none}" \
DATA_DIR="$DIR/data" WEBUI_AUTH="${WEBUI_AUTH:-False}" \
  nohup .venv/bin/open-webui serve --host 127.0.0.1 --port 8080 >/tmp/webui.log 2>&1 &
echo "Open WebUI 起動中: http://localhost:8080 (ログ: /tmp/webui.log)"
