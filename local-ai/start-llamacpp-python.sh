#!/usr/bin/env bash
# llama-cpp-python[server] (OpenAI互換API) を 127.0.0.1:8082 で起動
set -euo pipefail
DIR="${LCP_DIR:-$HOME/llamacpp-python}"
GGUF="${GGUF:-$HOME/models/qwen2.5-1.5b-instruct-q4_k_m.gguf}"
PORT="${PORT:-8082}"; CTX="${CTX:-4096}"
mkdir -p "$DIR" && cd "$DIR"
command -v uv >/dev/null || { echo "uv が必要です（https://docs.astral.sh/uv/ を参照してインストール）" >&2; exit 1; }
[ -d .venv ] || { uv venv -p 3.11 .venv && uv pip install -p .venv "llama-cpp-python[server]" \
  --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu; }
nohup .venv/bin/python -m llama_cpp.server --model "$GGUF" --model_alias qwen2.5-1.5b-llamacpp-python \
  --host 127.0.0.1 --port "$PORT" --n_ctx "$CTX" --n_threads "$(nproc)" --chat_format chatml \
  >/tmp/llamacpp-python.log 2>&1 &
echo "llama-cpp-python 起動中: http://127.0.0.1:$PORT/v1 (ログ: /tmp/llamacpp-python.log)"
