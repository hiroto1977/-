#!/usr/bin/env bash
# ローカルAIチャット環境セットアップ (Ollama + llama.cpp + llama-cpp-python + KoboldCpp + LocalAI + Open WebUI)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MODEL="${MODEL:-qwen2.5:1.5b}"
command -v ollama >/dev/null || curl -fsSL https://ollama.com/install.sh | sh
if ! pgrep -x ollama >/dev/null; then nohup ollama serve >/tmp/ollama.log 2>&1 & sleep 3; fi
ollama pull "$MODEL"
"$HERE/start-llamacpp.sh"
MODEL_SIZE=3b "$HERE/start-llamacpp.sh"
# 任意（RAMに余裕がある場合）: "$HERE/start-llamacpp-python.sh" / "$HERE/start-koboldcpp.sh"
"$HERE/start-localai.sh"
if command -v docker >/dev/null; then
  docker compose -f "$HERE/docker-compose.yml" up -d
else
  "$HERE/start.sh"
fi
echo "ブラウザで http://localhost:8080 を開いてください"
