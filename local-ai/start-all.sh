#!/usr/bin/env bash
# 全サービスを起動（冪等: 応答済みのポートは起動しない）。
#   ./start-all.sh          … 1回だけ起動
#   ./start-all.sh --watch  … 起動後も60秒ごとに監視し、落ちたサービスを再起動（restart-on-failure 相当）
# 起動対象は ENABLE_3B / ENABLE_7B (1/0) で切替。
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export PATH="/home/box/ollama/bin:$HOME/.local/bin:$PATH"
ENABLE_3B="${ENABLE_3B:-1}"; ENABLE_7B="${ENABLE_7B:-1}"
LOG=/tmp/local-ai-autostart.log
up() { curl -s -m 3 -o /dev/null "http://127.0.0.1:$1${2:-/}" ; }
log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }
start_all() {
  up 11434 || { log "start ollama"; nohup ollama serve >/tmp/ollama.log 2>&1 & sleep 3; }
  up 8081 /health || { log "start llama 1.5b"; MODEL_SIZE=1.5b "$HERE/start-llamacpp.sh" >>"$LOG" 2>&1 || true; }
  if [ "$ENABLE_3B" = 1 ]; then up 8085 /health || { log "start llama 3b"; MODEL_SIZE=3b "$HERE/start-llamacpp.sh" >>"$LOG" 2>&1 || true; }; fi
  if [ "$ENABLE_7B" = 1 ]; then up 8086 /health || { log "start llama 7b"; MODEL_SIZE=7b "$HERE/start-llamacpp.sh" >>"$LOG" 2>&1 || true; }; fi
  up 8084 /readyz || { log "start localai"; "$HERE/start-localai.sh" >>"$LOG" 2>&1 || true; }
  if ! up 8080 /health; then
    urls="http://127.0.0.1:8081/v1"; keys="none"
    [ "$ENABLE_3B" = 1 ] && { urls+=";http://127.0.0.1:8085/v1"; keys+=";none"; }
    [ "$ENABLE_7B" = 1 ] && { urls+=";http://127.0.0.1:8086/v1"; keys+=";none"; }
    urls+=";http://127.0.0.1:8084/v1"; keys+=";none"
    log "start open-webui ($urls)"
    OPENAI_API_BASE_URLS="$urls" OPENAI_API_KEYS="$keys" "$HERE/start.sh" >>"$LOG" 2>&1 || true
  fi
}
# 多重起動防止
exec 9>/tmp/local-ai-start-all.lock
flock -n 9 || { echo "start-all は既に実行中です"; exit 0; }
start_all 9>&-
if [ "${1:-}" = "--watch" ]; then
  while sleep 60 9>&-; do
    # 起動直後(WebUIは~30秒かかる)の誤検知を避けるため、落ちているものだけ再起動
    start_all 9>&-
  done
fi
