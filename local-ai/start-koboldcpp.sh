#!/usr/bin/env bash
# KoboldCpp (OpenAI互換API /v1 + 独自UI) を 127.0.0.1:8083 で起動
set -euo pipefail
DIR="${KOBOLD_DIR:-$HOME/koboldcpp}"; TAG="${KOBOLD_TAG:-v1.124.2}"
GGUF="${GGUF:-$HOME/models/qwen2.5-1.5b-instruct-q4_k_m.gguf}"
PORT="${PORT:-8083}"; CTX="${CTX:-4096}"
mkdir -p "$DIR"
[ -x "$DIR/koboldcpp" ] || { curl -fL -o "$DIR/koboldcpp" \
  "https://github.com/LostRuins/koboldcpp/releases/download/$TAG/koboldcpp-linux-x64-nocuda"; chmod +x "$DIR/koboldcpp"; }
nohup "$DIR/koboldcpp" --model "$GGUF" --host 127.0.0.1 --port "$PORT" --contextsize "$CTX" \
  --threads "$(nproc)" --usecpu --quiet --skiplauncher >/tmp/koboldcpp.log 2>&1 &
echo "KoboldCpp 起動中: http://127.0.0.1:$PORT/v1 (ログ: /tmp/koboldcpp.log)"
