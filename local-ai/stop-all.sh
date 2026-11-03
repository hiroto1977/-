#!/usr/bin/env bash
# 全サービスを停止（監視ループも停止）。冪等。
set -euo pipefail
stop() { pkill -f "$1" 2>/dev/null || true; }
stop "start-all.sh --watch"
stop "council/council.py"
stop "open-webui serve"
stop "litellm --config"
stop "llama-swap/llama-swap"
stop "llama-b.*/llama-server"
stop "local-ai run"; stop "localai/backends"
pkill -x ollama 2>/dev/null || true; stop "ollama runner"
stop "llama_cpp.server"; stop koboldcpp
fuser -k /tmp/local-ai-start-all.lock >/dev/null 2>&1 || true
echo "停止しました"
