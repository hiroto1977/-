#!/usr/bin/env bash
# llama.cpp の llama-server (OpenAI互換API) を CPU で起動 (127.0.0.1:8081)
set -euo pipefail
LLAMA_DIR="${LLAMA_DIR:-$HOME/llama.cpp}"
LLAMA_TAG="${LLAMA_TAG:-b12064}"
MODEL_DIR="${MODEL_DIR:-$HOME/models}"
GGUF="${GGUF:-$MODEL_DIR/qwen2.5-1.5b-instruct-q4_k_m.gguf}"
PORT="${PORT:-8081}"; CTX="${CTX:-4096}"
BIN="$LLAMA_DIR/llama-$LLAMA_TAG/llama-server"
if [ ! -x "$BIN" ]; then
  mkdir -p "$LLAMA_DIR"
  curl -fsSL "https://github.com/ggml-org/llama.cpp/releases/download/$LLAMA_TAG/llama-$LLAMA_TAG-bin-ubuntu-x64.tar.gz" | tar xz -C "$LLAMA_DIR"
fi
if [ ! -f "$GGUF" ]; then
  mkdir -p "$MODEL_DIR"
  curl -fL -o "$GGUF" https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf
fi
LD_LIBRARY_PATH="$(dirname "$BIN")" nohup "$BIN" -m "$GGUF" --host "${HOST:-127.0.0.1}" --port "$PORT" \
  -c "$CTX" -t "$(nproc)" --alias qwen2.5-1.5b-llamacpp --jinja >/tmp/llama-server.log 2>&1 &
echo "llama-server 起動中: http://127.0.0.1:$PORT/v1 (ログ: /tmp/llama-server.log)"
