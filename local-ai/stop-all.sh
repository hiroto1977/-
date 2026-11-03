#!/usr/bin/env bash
# 全サービスを停止（監視ループも停止）。冪等。
set -euo pipefail
pkill -f "start-all.sh --watch" 2>/dev/null || true
pkill -f "open-webui serve" 2>/dev/null || true
pkill -f "llama-b.*/llama-server" 2>/dev/null || true
pkill -f "local-ai run" 2>/dev/null || true
pkill -f "localai/backends" 2>/dev/null || true
pkill -x ollama 2>/dev/null || true
pkill -f "ollama runner" 2>/dev/null || true
pkill -f "llama_cpp.server" 2>/dev/null || true
pkill -f koboldcpp 2>/dev/null || true
fuser -k /tmp/local-ai-start-all.lock >/dev/null 2>&1 || true
echo "停止しました"
