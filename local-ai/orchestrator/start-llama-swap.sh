#!/usr/bin/env bash
# 中国系の追加モデルを llama-swap（127.0.0.1:8090）でオンデマンド提供する。
# リクエストされたモデルだけを llama-server で起動し、同時に常駐させるのは1つだけ（swap）。
# 5分アイドルでアンロードする（ttl）。GGUFが無ければ Hugging Face から取得する。
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SWAP_DIR="${SWAP_DIR:-$HOME/llama-swap}"; SWAP_TAG="${SWAP_TAG:-269}"
MODEL_DIR="${MODEL_DIR:-$HOME/models}"
LLAMA_BIN="${LLAMA_BIN:-$HOME/llama.cpp/llama-b12064/llama-server}"
PORT="${PORT:-8090}"; TTL="${TTL:-300}"; CTX="${CTX:-4096}"
ONLY="${EXTRA_MODELS:-}"   # 例: EXTRA_MODELS="deepseek-r1-1.5b qwen3-1.7b"（空なら全部）
mkdir -p "$SWAP_DIR" "$MODEL_DIR"
if [ ! -x "$SWAP_DIR/llama-swap" ]; then
  tmp="$(mktemp)"
  curl -fsSL -o "$tmp" "https://github.com/mostlygeek/llama-swap/releases/download/v${SWAP_TAG}/llama-swap_${SWAP_TAG}_linux_amd64.tar.gz"
  tar xzf "$tmp" -C "$SWAP_DIR" && rm -f "$tmp"
fi
CFG="$SWAP_DIR/config.yaml"
{
  echo "healthCheckTimeout: 300"
  echo "models:"
  grep -v '^#' "$HERE/extra-models.txt" | while IFS='|' read -r name repo file local args; do
    [ -n "$name" ] || continue
    if [ -n "$ONLY" ] && ! grep -qw -- "$name" <<<"$ONLY"; then continue; fi
    if [ ! -s "$MODEL_DIR/$local" ]; then
      echo "ダウンロード: $name" >&2
      curl -fsSL -o "$MODEL_DIR/$local.part" "https://huggingface.co/$repo/resolve/main/$file" \
        && mv "$MODEL_DIR/$local.part" "$MODEL_DIR/$local" || { echo "失敗: $name" >&2; rm -f "$MODEL_DIR/$local.part"; continue; }
    fi
    echo "  \"$name\":"
    echo "    cmd: env LD_LIBRARY_PATH=$(dirname "$LLAMA_BIN") $LLAMA_BIN --host 127.0.0.1 --port \${PORT} -m $MODEL_DIR/$local -c $CTX -np 1 -t $(nproc) --jinja --alias $name ${args:-}"
    echo "    ttl: $TTL"
  done
} >"$CFG"
setsid nohup "$SWAP_DIR/llama-swap" --config "$CFG" --listen "127.0.0.1:$PORT" >/tmp/llama-swap.log 2>&1 < /dev/null &
echo "llama-swap 起動中: http://127.0.0.1:$PORT/v1 (設定: $CFG, ログ: /tmp/llama-swap.log)"
