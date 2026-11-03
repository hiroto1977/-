#!/usr/bin/env bash
# ローカルAIチャット環境セットアップ (Ollama + Open WebUI)
set -euo pipefail
MODEL="${MODEL:-qwen2.5:1.5b}"
if ! command -v ollama >/dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
fi
if ! pgrep -x ollama >/dev/null; then nohup ollama serve >/tmp/ollama.log 2>&1 & sleep 3; fi
ollama pull "$MODEL"
if command -v docker >/dev/null; then
  docker compose -f "$(dirname "$0")/docker-compose.yml" up -d
else
  "$(dirname "$0")/start.sh"
fi
echo "ブラウザで http://localhost:8080 を開いてください"
