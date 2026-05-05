#!/usr/bin/env bash
# preflight.sh — 業務開始前の自動チェック
# 用途: 朝の業務開始前に実行し、ローカル AI 環境がガバナンス要件を
#       満たしているかを 30 秒で確認する。

set -u
LANG=ja_JP.UTF-8

# Audit logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$SCRIPT_DIR/lib/audit.sh" ]] && source "$SCRIPT_DIR/lib/audit.sh"
type audit_log >/dev/null 2>&1 || audit_log() { :; }
audit_log "preflight.start" ""

# Colors (TTY のみ)
if [[ -t 1 ]]; then
  C_OK="\033[1;32m"; C_NG="\033[1;31m"; C_WARN="\033[1;33m"; C_RST="\033[0m"
else
  C_OK=""; C_NG=""; C_WARN=""; C_RST=""
fi
PASS=0; FAIL=0; WARN=0
ok()    { echo -e "${C_OK}✅${C_RST} $*"; PASS=$((PASS+1)); }
ng()    { echo -e "${C_NG}❌${C_RST} $*"; FAIL=$((FAIL+1)); }
warn()  { echo -e "${C_WARN}⚠️${C_RST}  $*"; WARN=$((WARN+1)); }

echo "==============================="
echo " preflight: $(date '+%Y-%m-%d %H:%M:%S')"
echo " host: $(hostname)"
echo "==============================="

# 1) Ollama サーバ稼働確認
echo ""
echo "[1/7] Ollama (ローカル LLM)"
OLLAMA_URL="${OLLAMA_HOST:-http://localhost:11434}"
if curl -fsS -o /dev/null --max-time 3 "${OLLAMA_URL}/api/tags"; then
  ok "Ollama 稼働中 (${OLLAMA_URL})"
  models=$(curl -fsS --max-time 3 "${OLLAMA_URL}/api/tags" | grep -oE '"name":"[^"]+"' | sed 's/"name":"//;s/"$//' | head -10)
  if [[ -n "$models" ]]; then
    echo "    取得済モデル:"
    echo "$models" | sed 's/^/      - /'
  else
    warn "モデル未取得 — 'ollama pull llama3.2' などを実行"
  fi
else
  ng "Ollama に到達不可 (${OLLAMA_URL})"
  echo "    対処: ターミナルで 'OLLAMA_ORIGINS=* ollama serve' を起動"
fi

# 2) OLLAMA_ORIGINS の設定確認 (環境変数 or 既知の起動コマンド)
echo ""
echo "[2/7] CORS 設定 (OLLAMA_ORIGINS)"
if [[ -n "${OLLAMA_ORIGINS:-}" ]]; then
  ok "OLLAMA_ORIGINS=${OLLAMA_ORIGINS}"
else
  warn "環境変数 OLLAMA_ORIGINS 未設定 — ブラウザから利用するなら設定推奨"
  echo "    対処: 'export OLLAMA_ORIGINS=*' または systemd/launchd で設定"
fi

# 3) 静的サーバが動作しているか (v19 ダッシュボード)
echo ""
echo "[3/7] v19 ダッシュボード (静的サーバ)"
if curl -fsS -o /dev/null --max-time 2 http://127.0.0.1:8000/v19/ui/dashboard.html; then
  ok "ダッシュボード配信中 (http://127.0.0.1:8000/v19/ui/dashboard.html)"
else
  warn "静的サーバ未起動 — 'python3 -m http.server 8000' をリポジトリ ルートで実行"
fi

# 4) ディスク暗号化の状態 (OS 別)
echo ""
echo "[4/7] ディスク暗号化"
case "$(uname)" in
  Darwin)
    if fdesetup status 2>/dev/null | grep -q "FileVault is On"; then
      ok "FileVault: ON"
    else
      ng "FileVault: OFF — システム設定 → プライバシーとセキュリティ から有効化"
    fi
    ;;
  Linux)
    if lsblk -o NAME,TYPE,FSTYPE 2>/dev/null | grep -qE "crypt|LUKS"; then
      ok "LUKS / dm-crypt 検出"
    else
      warn "ディスク暗号化が検出できず — LUKS 等の利用を推奨"
    fi
    ;;
  MINGW*|MSYS*|CYGWIN*)
    warn "Windows: BitLocker の状態は別途確認 (manage-bde -status)"
    ;;
  *)
    warn "OS 不明: 暗号化状態を手動確認"
    ;;
esac

# 5) git の状態 (リポジトリ内なら未コミット変更を警告)
echo ""
echo "[5/7] git の状態"
if git -C "$(pwd)" rev-parse --git-dir > /dev/null 2>&1; then
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  uncomm=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$uncomm" -eq 0 ]]; then
    ok "クリーン (${branch})"
  else
    warn "未コミット変更 ${uncomm} 件 (${branch})"
  fi
else
  warn "git リポジトリではない (or 未認識)"
fi

# 6) 必要コマンドの存在
echo ""
echo "[6/7] 必須コマンド"
for cmd in python3 curl git; do
  if command -v "$cmd" > /dev/null; then
    ok "$cmd: $(command -v $cmd)"
  else
    ng "$cmd: 未インストール"
  fi
done

# 7) ガバナンス文書の存在
echo ""
echo "[7/7] ガバナンス文書"
ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
for f in governance/02_DATA_CLASSIFICATION.md governance/03_OPERATIONS.md CLAUDE.md; do
  if [[ -f "$ROOT_DIR/$f" ]]; then
    ok "$f"
  else
    ng "$f が見つからない (cwd 配下に governance/ があるか確認)"
  fi
done

echo ""
echo "==============================="
echo "  PASS: $PASS  /  WARN: $WARN  /  FAIL: $FAIL"
echo "==============================="

audit_log "preflight.summary" "pass=$PASS warn=$WARN fail=$FAIL"

if [[ "$FAIL" -gt 0 ]]; then
  echo ""
  echo "❌ 業務開始前に上記 FAIL を解消してください。"
  exit 1
elif [[ "$WARN" -gt 0 ]]; then
  echo ""
  echo "⚠️  WARN は致命的ではないが、扱う最大データクラスに応じて対処を検討。"
  exit 0
else
  echo ""
  echo "✅ 全項目クリア。業務開始 OK。"
  exit 0
fi
