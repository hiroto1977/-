#!/usr/bin/env bash
# Service Hub — Linux 開発環境ワンコマンドセットアップ
#
# 新しい Ubuntu / Debian 系マシンでこのリポジトリを clone した直後に
# 1 回実行すれば、開発に必要なものが全て揃う:
#   - OS パッケージ (git / curl / build-essential / Electron 実行ライブラリ / xvfb)
#   - Node.js LTS (nvm 経由。既に Node >= 20 があればスキップ)
#   - npm 依存 (npm ci / npm install)
#   - (--verify 付きなら) typecheck + テスト + verify:all で全 green を確認
#
# Usage:
#   bash scripts/setup-linux.sh            # セットアップのみ
#   bash scripts/setup-linux.sh --verify   # セットアップ + 品質ゲート実行
#
# 何度実行しても安全 (冪等)。導入済みの手順は自動でスキップする。
# 詳しい移行手順は docs/LINUX_MIGRATION.md を参照。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIN_NODE_MAJOR=20
RUN_VERIFY=0
for arg in "$@"; do
  case "$arg" in
    --verify) RUN_VERIFY=1 ;;
    *) echo "unknown option: $arg (supported: --verify)" >&2; exit 1 ;;
  esac
done

info() { printf '\033[1;34m[setup]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ ok ]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }

# ---------------------------------------------------------------------------
# 1. OS パッケージ (apt 系のみ対応)
# ---------------------------------------------------------------------------
if ! command -v apt-get >/dev/null 2>&1; then
  warn "apt-get が見つかりません。このスクリプトは Ubuntu / Debian 系専用です。"
  warn "他ディストリの場合は docs/LINUX_MIGRATION.md の依存一覧を手動で導入してください。"
  exit 1
fi

SUDO="sudo"
if [ "$(id -u)" = "0" ]; then SUDO=""; fi

# Ubuntu 24.04 で libasound2 → libasound2t64 等にリネームされたため、
# 候補を順に試して最初に存在するものを選ぶ。
pick_pkg() {
  for cand in "$@"; do
    if apt-cache show "$cand" >/dev/null 2>&1; then
      echo "$cand"
      return 0
    fi
  done
  return 1
}

info "OS パッケージを確認中..."
$SUDO apt-get update -qq

PKGS=(git curl ca-certificates build-essential xvfb)
for spec in \
  "libasound2t64 libasound2" \
  "libgtk-3-0t64 libgtk-3-0" \
  "libnss3" \
  "libatk-bridge2.0-0t64 libatk-bridge2.0-0" \
  "libdrm2" \
  "libgbm1" \
  "libxkbcommon0"; do
  # shellcheck disable=SC2086 — spec は意図的に空白区切りの候補リスト
  if pkg="$(pick_pkg $spec)"; then
    PKGS+=("$pkg")
  else
    warn "パッケージ候補が見つかりません: $spec (スキップ)"
  fi
done

$SUDO apt-get install -y -qq "${PKGS[@]}"
ok "OS パッケージ: ${PKGS[*]}"

# ---------------------------------------------------------------------------
# 2. Node.js (>= ${MIN_NODE_MAJOR}。無ければ nvm + LTS を導入)
# ---------------------------------------------------------------------------
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

if command -v node >/dev/null 2>&1 && [ "$(node_major)" -ge "$MIN_NODE_MAJOR" ]; then
  ok "Node.js $(node --version) を検出 (>= v${MIN_NODE_MAJOR} なのでそのまま使用)"
else
  info "Node.js >= v${MIN_NODE_MAJOR} が無いため nvm 経由で LTS を導入..."
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install --lts
  nvm use --lts
  ok "Node.js $(node --version) を導入"
fi

# ---------------------------------------------------------------------------
# 3. npm 依存
# ---------------------------------------------------------------------------
info "npm 依存を導入中 (${ROOT})..."
cd "$ROOT"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
ok "npm 依存 導入完了"

# ---------------------------------------------------------------------------
# 4. (任意) 品質ゲート
# ---------------------------------------------------------------------------
if [ "$RUN_VERIFY" = "1" ]; then
  info "品質ゲートを実行中 (typecheck → test → verify:all)..."
  npm run typecheck
  npm test
  npm run verify:all
  ok "全品質ゲート green"
fi

cat <<'EOS'

✅ セットアップ完了。次の一歩:

  npm run dev          # Electron デスクトップ版を起動
  npm run build:web    # ブラウザ単体版 dist/standalone.html を生成
  npm run smoke        # xvfb で全ページのスクリーンショット確認

⚠ 旧マシンで保存したサービストークンは引き継がれません
  (safeStorage の暗号鍵がマシン固有のため)。設定ページから再登録してください。
  詳細: docs/LINUX_MIGRATION.md
EOS
