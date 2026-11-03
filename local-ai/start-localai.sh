#!/usr/bin/env bash
# LocalAI (OpenAI互換API) を 127.0.0.1:8084 で起動。アイドル時はモデルを自動アンロード
set -euo pipefail
DIR="${LOCALAI_DIR:-$HOME/localai}"; TAG="${LOCALAI_TAG:-v4.12.1}"
GGUF="${GGUF:-$HOME/models/qwen2.5-1.5b-instruct-q4_k_m.gguf}"
PORT="${PORT:-8084}"
mkdir -p "$DIR/models"
[ -x "$DIR/local-ai" ] || { curl -fL -o "$DIR/local-ai" \
  "https://github.com/mudler/LocalAI/releases/download/$TAG/local-ai-$TAG-linux-amd64"; chmod +x "$DIR/local-ai"; }
ln -sf "$GGUF" "$DIR/models/qwen2.5-1.5b-instruct-q4_k_m.gguf"
cat > "$DIR/models/qwen2.5-1.5b-localai.yaml" <<YAML
name: qwen2.5-1.5b-localai
backend: llama-cpp
context_size: 4096
threads: $(nproc)
mmap: true
parameters:
  model: qwen2.5-1.5b-instruct-q4_k_m.gguf
template:
  use_tokenizer_template: true
YAML
cd "$DIR"
[ -d "$DIR/backends/cpu-llama-cpp" ] || ./local-ai backends install cpu-llama-cpp --backends-path "$DIR/backends"
LOCALAI_WATCHDOG_IDLE=true LOCALAI_WATCHDOG_IDLE_TIMEOUT=5m LOCALAI_SINGLE_ACTIVE_BACKEND=true \
  nohup ./local-ai run --address "127.0.0.1:$PORT" --models-path "$DIR/models" \
  --backends-path "$DIR/backends" >/tmp/localai.log 2>&1 &
echo "LocalAI 起動中: http://127.0.0.1:$PORT/v1 (ログ: /tmp/localai.log)"
