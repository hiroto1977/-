#!/usr/bin/env bash
# ローカルAIチャット環境セットアップ (Ollama + llama.cpp + Open WebUI)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MODEL="${MODEL:-qwen2.5:1.5b}"
command -v ollama >/dev/null || curl -fsSL https://ollama.com/install.sh | sh
if ! pgrep -x ollama >/dev/null; then nohup ollama serve >/tmp/ollama.log 2>&1 & sleep 3; fi
ollama pull "$MODEL"
"$HERE/start-llamacpp.sh"
if command -v docker >/dev/null; then
  docker compose -f "$HERE/docker-compose.yml" up -d
else
  "$HERE/start.sh"
fi
echo "ブラウザで http://localhost:8080 を開いてください"
