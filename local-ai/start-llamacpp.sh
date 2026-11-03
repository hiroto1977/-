#!/usr/bin/env bash
# llama.cpp の llama-server (OpenAI互換API) を CPU で起動 (127.0.0.1:8081)
set -euo pipefail
LLAMA_DIR="${LLAMA_DIR:-$HOME/llama.cpp}"
LLAMA_TAG="${LLAMA_TAG:-b12064}"
MODEL_DIR="${MODEL_DIR:-$HOME/models}"
MODEL_SIZE="${MODEL_SIZE:-1.5b}"   # 1.5b または 3b
case "$MODEL_SIZE" in
  3b|3B) _HF=Qwen/Qwen2.5-3B-Instruct-GGUF; _F=qwen2.5-3b-instruct-q4_k_m.gguf; _DP=8085 ;;
  7b|7B) _HF=bartowski/Qwen2.5-7B-Instruct-GGUF; _F=Qwen2.5-7B-Instruct-Q4_K_M.gguf; _DP=8086 ;;
  *)     _HF=Qwen/Qwen2.5-1.5B-Instruct-GGUF; _F=qwen2.5-1.5b-instruct-q4_k_m.gguf; _DP=8081 ;;
esac
GGUF="${GGUF:-$MODEL_DIR/$_F}"
ALIAS="${ALIAS:-qwen2.5-${MODEL_SIZE,,}-llamacpp}"
PORT="${PORT:-$_DP}"; CTX="${CTX:-4096}"
BIN="$LLAMA_DIR/llama-$LLAMA_TAG/llama-server"
if [ ! -x "$BIN" ]; then
  mkdir -p "$LLAMA_DIR"
  curl -fsSL "https://github.com/ggml-org/llama.cpp/releases/download/$LLAMA_TAG/llama-$LLAMA_TAG-bin-ubuntu-x64.tar.gz" | tar xz -C "$LLAMA_DIR"
fi
if [ ! -f "$GGUF" ]; then
  mkdir -p "$MODEL_DIR"
  curl -fL -o "$GGUF" "https://huggingface.co/$_HF/resolve/main/$_F"
fi
LD_LIBRARY_PATH="$(dirname "$BIN")" nohup "$BIN" -m "$GGUF" --host "${HOST:-127.0.0.1}" --port "$PORT" \
  -c "$CTX" -t "$(nproc)" --alias "$ALIAS" --jinja >"/tmp/llama-server-$PORT.log" 2>&1 &
echo "llama-server 起動中: http://127.0.0.1:$PORT/v1 (ログ: /tmp/llama-server-$PORT.log)"
