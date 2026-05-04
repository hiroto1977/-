#!/usr/bin/env bash
# local-cowork.sh — ローカル Chat 環境の自動起動
#
# 1. Ollama 稼働確認 (必要なら起動方法を案内)
# 2. デフォルトモデルの取得確認 (なければ pull 提案)
# 3. v19 静的サーバーをバックグラウンド起動
# 4. ブラウザで開く (--no-browser で抑制)
# 5. CLI チャットを起動 (--no-cli で抑制)

set -u
LANG=ja_JP.UTF-8

if [[ -t 1 ]]; then
  C_OK="\033[1;32m"; C_NG="\033[1;31m"; C_W="\033[1;33m"; C_I="\033[1;36m"; C_R="\033[0m"
else C_OK=""; C_NG=""; C_W=""; C_I=""; C_R=""; fi
ok()   { echo -e "${C_OK}✅${C_R} $*"; }
ng()   { echo -e "${C_NG}❌${C_R} $*"; }
warn() { echo -e "${C_W}⚠️${C_R}  $*"; }
info() { echo -e "${C_I}ℹ️${C_R}  $*"; }

# --- オプション ---
DO_BROWSER=1
DO_CLI=1
PORT=8000
MODEL="${OLLAMA_MODEL:-llama3.2}"
OLLAMA_URL="${OLLAMA_HOST:-http://localhost:11434}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-browser) DO_BROWSER=0; shift ;;
    --no-cli)     DO_CLI=0; shift ;;
    --port)       PORT="$2"; shift 2 ;;
    --model)      MODEL="$2"; shift 2 ;;
    --base)       OLLAMA_URL="$2"; shift 2 ;;
    -h|--help)
      cat <<EOF
使い方: bash cowork/local-cowork.sh [options]
  --no-browser    ブラウザを開かない
  --no-cli        CLI を起動しない (静的サーバーのみ)
  --port N        v19 用ポート (default 8000)
  --model NAME    Ollama モデル (default llama3.2)
  --base URL      Ollama URL (default http://localhost:11434)
EOF
      exit 0 ;;
    *) warn "未知のオプション: $1"; shift ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "================================================"
info "local-cowork: $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================"

# === 1. Ollama 確認 ===
echo ""
echo "[1/4] Ollama サーバーの確認"
if curl -fsS -o /dev/null --max-time 3 "${OLLAMA_URL}/api/tags"; then
  ok "Ollama 稼働中 (${OLLAMA_URL})"
else
  ng "Ollama に到達不可 (${OLLAMA_URL})"
  echo ""
  warn "別ターミナルで以下を実行してから本スクリプトを再実行してください:"
  echo "    OLLAMA_ORIGINS='*' ollama serve"
  exit 1
fi

# === 2. モデル確認 ===
echo ""
echo "[2/4] モデル '${MODEL}' の確認"
if curl -fsS --max-time 3 "${OLLAMA_URL}/api/tags" | grep -q "\"name\":\"${MODEL}\""; then
  ok "モデル '${MODEL}' 取得済"
else
  warn "モデル '${MODEL}' が未取得"
  echo "   以下で取得してから再実行してください (回線次第で 1〜10 分):"
  echo "    ollama pull ${MODEL}"
  echo ""
  read -r -p "   そのまま続行しますか? [y/N] " ans
  [[ "$ans" != "y" && "$ans" != "Y" ]] && exit 1
fi

# === 3. 静的サーバー (v19) 起動 ===
echo ""
echo "[3/4] v19 ダッシュボード サーバー (port ${PORT})"
if curl -fsS -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/"; then
  ok "サーバーは既に稼働中"
  STARTED_HERE=0
else
  python3 -m http.server "$PORT" --bind 127.0.0.1 > /tmp/local-cowork-server.log 2>&1 &
  SERVER_PID=$!
  STARTED_HERE=1
  sleep 1
  if curl -fsS -o /dev/null --max-time 3 "http://127.0.0.1:${PORT}/"; then
    ok "サーバー起動 (PID ${SERVER_PID})"
  else
    ng "サーバー起動失敗。/tmp/local-cowork-server.log を確認"
    exit 1
  fi
fi

URL="http://127.0.0.1:${PORT}/v19/ui/dashboard.html#integration-claude"

# ブラウザを開く
if [[ "$DO_BROWSER" -eq 1 ]]; then
  case "$(uname)" in
    Darwin) open "$URL" 2>/dev/null || true ;;
    Linux)
      if command -v xdg-open >/dev/null; then xdg-open "$URL" 2>/dev/null || true
      elif [[ -n "${BROWSER:-}" ]]; then "$BROWSER" "$URL" 2>/dev/null || true
      fi ;;
    MINGW*|MSYS*|CYGWIN*) start "$URL" 2>/dev/null || true ;;
  esac
  ok "ブラウザを開きました: $URL"
else
  info "ブラウザ起動はスキップしました。次の URL で開けます: $URL"
fi

# === 4. CLI 起動 ===
echo ""
echo "[4/4] CLI チャット"
if [[ "$DO_CLI" -eq 1 ]]; then
  echo ""
  info "Ctrl+C または '/quit' で CLI 終了。バックグラウンド サーバーは継続します。"
  echo ""
  python3 cowork/local-chat-cli.py --base "$OLLAMA_URL" --model "$MODEL"
  echo ""
  if [[ "${STARTED_HERE:-0}" -eq 1 ]]; then
    info "サーバー (PID ${SERVER_PID}) は稼働中です。停止: kill ${SERVER_PID}"
  fi
else
  info "CLI 起動はスキップ。下記で起動可能:"
  echo "    python3 cowork/local-chat-cli.py --base ${OLLAMA_URL} --model ${MODEL}"
fi
