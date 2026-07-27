#!/usr/bin/env bash
set -euo pipefail

# Ollama を「使える状態」まで一気に持っていくセットアップ。
#
#   npm run ollama:setup                       # 導入 → モデル取得 → 起動 → 動作確認
#   npm run ollama:setup -- --origin https://claude.ai   # ブラウザ版から使う許可も入れる
#   npm run ollama:setup -- --check            # 何も変更せず現状だけ報告
#
# ## なぜこれが要るのか
#
# 「つながらない」の原因は 1 つではなく、①Ollama が入っていない ②起動していない
# ③モデルが 1 つも無い ④ブラウザからの読み取りが許可されていない —— のどれか。
# 手順書を読んで 1 つずつ潰すのは、詰まっている段階が分からないと難しい。
# ここでは **上から順に判定して、足りないものだけを埋める**。
#
# 最後に必ず /api/chat を 1 往復させる。バージョンが読めるだけでは「使える」と
# 言えない (モデルが無ければ生成は失敗する) ので、実際に応答が返ることを確認する。

MODEL="llama3.2:1b" # src/shared/ollama.ts の DEFAULT_SETUP_MODEL と一致させること
PORT=11434
ORIGIN=""
DO_INSTALL=1
CHECK_ONLY=0
STARTED_SERVER=0

usage() {
  cat <<'EOF'
Ollama セットアップ — 足りないものだけを埋めて、最後に 1 往復して確認します

  npm run ollama:setup                     導入 → モデル取得 → 起動 → 動作確認
  npm run ollama:setup -- --origin <URL>   ブラウザ版から使う許可も設定する
  npm run ollama:setup -- --check          何も変更せず現状だけ報告
  npm run ollama:setup -- --model <名前>   入れるモデルを変える (既定 llama3.2:1b)
  npm run ollama:setup -- --port <番号>    ポートを変える (既定 11434)
  npm run ollama:setup -- --no-install     未導入でも自動導入しない

終了コード: 0 = 使える状態 / 1 = 失敗 (理由を表示) / 2 = 引数エラー
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --model) MODEL="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --origin) ORIGIN="${2:-}"; shift 2 ;;
    --no-install) DO_INSTALL=0; shift ;;
    --check) CHECK_ONLY=1; DO_INSTALL=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "不明な引数: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$PORT" in
  ''|*[!0-9]*) echo "❌ ポート番号が不正です: $PORT" >&2; exit 2 ;;
esac

BASE="http://127.0.0.1:${PORT}"

if ! command -v curl >/dev/null 2>&1; then
  echo "❌ curl が見つかりません。先に curl を入れてください。" >&2
  exit 1
fi

step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  ✅ %s\n' "$1"; }
warn() { printf '  ⚠  %s\n' "$1"; }
die()  { printf '  ❌ %s\n' "$1" >&2; exit 1; }

# サーバが応答するか (到達性のみ。中身は見ない)
server_up() {
  curl -fsS --max-time 3 "${BASE}/api/version" >/dev/null 2>&1
}

# 後始末: このスクリプトが起動したサーバだけ止める。元から動いていたものは触らない。
cleanup() {
  if [ "$STARTED_SERVER" = "1" ] && [ -n "${SERVE_PID:-}" ]; then
    kill "$SERVE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# --- 1. Ollama 本体 -------------------------------------------------------
step "1. Ollama が入っているか"
if command -v ollama >/dev/null 2>&1; then
  ok "見つかりました ($(command -v ollama))"
elif [ "$DO_INSTALL" = "0" ]; then
  warn "見つかりません (--check / --no-install のため導入はしません)"
else
  case "$(uname -s)" in
    Linux)
      warn "見つかりません。公式スクリプトで導入します (curl -fsSL https://ollama.com/install.sh | sh)"
      curl -fsSL https://ollama.com/install.sh | sh
      command -v ollama >/dev/null 2>&1 || die "導入に失敗しました"
      ok "導入しました"
      ;;
    Darwin)
      die "macOS は https://ollama.com/download から Ollama.app を入れて一度起動してください (ここだけ手作業です)"
      ;;
    *)
      die "この OS では自動導入できません。https://ollama.com/download から入れてください"
      ;;
  esac
fi

# --- 2. サーバの起動 ------------------------------------------------------
step "2. サーバが動いているか (${BASE})"
if server_up; then
  ok "応答しました"
elif [ "$CHECK_ONLY" = "1" ]; then
  warn "応答しません (--check のため起動はしません)"
else
  command -v ollama >/dev/null 2>&1 || die "Ollama が無いため起動できません"
  warn "応答しません。バックグラウンドで起動します"
  # ORIGIN 指定時は許可を載せて起動する (このプロセス限定。永続化は手順 5)。
  if [ -n "$ORIGIN" ]; then
    OLLAMA_ORIGINS="$ORIGIN" ollama serve >/dev/null 2>&1 &
  else
    ollama serve >/dev/null 2>&1 &
  fi
  SERVE_PID=$!
  STARTED_SERVER=1
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    server_up && break
    sleep 1
  done
  server_up || die "起動できませんでした (別のプロセスが ${PORT} を使っていないか確認してください)"
  ok "起動しました (PID ${SERVE_PID})"
fi

if ! server_up; then
  echo ""
  echo "サーバが応答しないため、ここで終了します。"
  exit 1
fi

# --- 3. モデル ------------------------------------------------------------
step "3. モデル ${MODEL} があるか"
TAGS="$(curl -fsS --max-time 10 "${BASE}/api/tags" || echo '')"
if printf '%s' "$TAGS" | grep -q "\"${MODEL}\""; then
  ok "あります"
elif [ "$CHECK_ONLY" = "1" ]; then
  warn "ありません (--check のため取得はしません)"
else
  command -v ollama >/dev/null 2>&1 || die "Ollama CLI が無いためモデルを取得できません"
  warn "ありません。取得します (約 1.3 GB・回線によっては数分かかります)"
  ollama pull "$MODEL" || die "モデルの取得に失敗しました"
  ok "取得しました"
fi

# --- 4. 実際に 1 往復して確認 --------------------------------------------
step "4. 実際に 1 往復してみる"
if [ "$CHECK_ONLY" = "1" ]; then
  warn "--check のため送信しません"
else
  REQ="$(printf '{"model":"%s","stream":false,"messages":[{"role":"user","content":"1+1は？数字だけで答えて"}]}' "$MODEL")"
  # -f は付けない。Ollama は失敗を「HTTP エラー + {"error": "…"} の本文」で返すため、
  # -f を付けると本文ごと捨てられ、原因が分からないまま「応答なし」と誤診してしまう
  # (self-test で 500 + メモリ不足の封筒が握り潰されるのを検出した)。
  REPLY="$(curl -sS --max-time 180 -H 'content-type: application/json' -d "$REQ" "${BASE}/api/chat" 2>/dev/null || true)"
  if [ -z "$REPLY" ]; then
    die "応答がありませんでした (サーバが途中で落ちた可能性があります)"
  fi
  if printf '%s' "$REPLY" | grep -q '"error"'; then
    die "Ollama がエラーを返しました: $(printf '%s' "$REPLY" | head -c 300)"
  fi
  if ! printf '%s' "$REPLY" | grep -q '"message"'; then
    die "想定外の応答でした: $(printf '%s' "$REPLY" | head -c 300)"
  fi
  ok "応答が返りました"
  printf '     %s\n' "$(printf '%s' "$REPLY" | head -c 200)"
fi

# --- 5. ブラウザ版から使う許可 -------------------------------------------
if [ -n "$ORIGIN" ]; then
  step "5. ブラウザ版から使う許可 (OLLAMA_ORIGINS)"
  echo "  この設定だけは OS ごとに永続化の方法が違うため、実行はあなたに任せます:"
  case "$(uname -s)" in
    Darwin)
      echo "    launchctl setenv OLLAMA_ORIGINS \"${ORIGIN}\""
      echo "    killall ollama 2>/dev/null; open -a Ollama"
      ;;
    Linux)
      echo "    sudo mkdir -p /etc/systemd/system/ollama.service.d"
      echo "    printf '[Service]\\nEnvironment=\"OLLAMA_ORIGINS=${ORIGIN}\"\\n' \\"
      echo "      | sudo tee /etc/systemd/system/ollama.service.d/origins.conf"
      echo "    sudo systemctl daemon-reload && sudo systemctl restart ollama"
      ;;
    *)
      echo "    OLLAMA_ORIGINS=\"${ORIGIN}\" ollama serve"
      ;;
  esac
  echo "  ※ ターミナルから使うだけならこの設定は不要です (CORS はブラウザだけの制約)。"
fi

step "結果"
if [ "$CHECK_ONLY" = "1" ]; then
  echo "  現状の確認のみ行いました。埋めるには --check を外して実行してください。"
else
  echo "  使える状態です。"
  echo ""
  echo "  ターミナルから:  npm run ollama -- chat ${MODEL} \"こんにちは\""
  echo "  画面から:        Ollama ページで「接続テスト」→「チャット」"
fi
if [ "$STARTED_SERVER" = "1" ]; then
  echo ""
  echo "  ※ このスクリプトが起動したサーバは終了時に止まります。"
  echo "     常駐させるには別のターミナルで \`ollama serve\` を実行してください。"
fi
