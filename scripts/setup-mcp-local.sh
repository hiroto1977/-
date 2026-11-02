#!/usr/bin/env bash
# Service Hub — ローカル MCP セットアップ (GitHub 上の .claude/settings.json をそのまま使う)
#
# リポジトリを clone した端末で 1 回実行すると:
#   - uv / uvx (git, sqlite, time, fetch MCP 用)
#   - .env.mcp.local (API キー。git には載せない)
#   - .mcp.json (Claude Code が読むプロジェクト MCP。git には載せない)
#   - data/local.db (sqlite MCP 用の空 DB)
#   - npm run mcp:check で状態確認
#
# Usage (リポジトリ root):
#   bash scripts/setup-mcp-local.sh
#   source .env.mcp.local   # シェルに export を載せる (任意)
#
# Windows: Git Bash / WSL から同じコマンド。PowerShell だけの場合は docs/MCP_SETUP.md を参照。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_LOCAL="${ROOT}/.env.mcp.local"
EXAMPLE="${ROOT}/.env.mcp.example"
SETTINGS="${ROOT}/.claude/settings.json"
MCP_JSON="${ROOT}/.mcp.json"
DATA_DB="${ROOT}/data/local.db"

info() { printf '\033[1;34m[mcp-setup]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ ok ]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }

# ---------------------------------------------------------------------------
# 1. uvx (Python 系 MCP)
# ---------------------------------------------------------------------------
install_uv() {
  if command -v uvx >/dev/null 2>&1; then
    ok "uvx あり ($(uvx --version 2>/dev/null | head -1))"
    return 0
  fi
  if [ -x "${HOME}/.local/bin/uvx" ]; then
    export PATH="${HOME}/.local/bin:${PATH}"
    ok "uvx あり (${HOME}/.local/bin/uvx)"
    return 0
  fi
  info "uv を導入中 (mcp-server-git / sqlite / time / fetch)..."
  curl -fsSL https://astral.sh/uv/install.sh | sh
  # shellcheck disable=SC1091
  [ -f "${HOME}/.local/bin/env" ] && . "${HOME}/.local/bin/env"
  if ! command -v uvx >/dev/null 2>&1; then
    warn "uvx の導入後も PATH に無い — シェルを開き直すか ~/.local/bin を PATH に足してください"
    exit 1
  fi
  ok "uvx を導入"
}

install_uv

# ---------------------------------------------------------------------------
# 2. .env.mcp.local
# ---------------------------------------------------------------------------
if [ ! -f "$ENV_LOCAL" ]; then
  if [ ! -f "$EXAMPLE" ]; then
    warn ".env.mcp.example が見つかりません"
    exit 1
  fi
  cp "$EXAMPLE" "$ENV_LOCAL"
  ok ".env.mcp.local を .env.mcp.example から作成"
else
  ok ".env.mcp.local は既にあります (上書きしません)"
fi

# gh ログイン済みなら GITHUB_TOKEN を gh のトークンで埋める (プレースホルダのときだけ)
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  if grep -q 'GITHUB_TOKEN="<REPLACE_WITH_GITHUB_TOKEN>"' "$ENV_LOCAL" 2>/dev/null; then
    TOKEN="$(gh auth token)"
    # sed 区切りに | を使う (トークンに / が含まれうる)
    sed -i "s|export GITHUB_TOKEN=\"<REPLACE_WITH_GITHUB_TOKEN>\"|export GITHUB_TOKEN=\"${TOKEN}\"|" "$ENV_LOCAL"
    ok "GITHUB_TOKEN を gh auth token で設定 (.env.mcp.local)"
  else
    info "GITHUB_TOKEN は手入力済み — gh では上書きしません"
  fi
else
  warn "gh 未ログイン — GITHUB_TOKEN は .env.mcp.local を手で編集してください"
fi

# ---------------------------------------------------------------------------
# 3. .mcp.json (追跡しない。settings.json の mcpServers を写す)
# ---------------------------------------------------------------------------
if [ ! -f "$SETTINGS" ]; then
  warn ".claude/settings.json がありません"
  exit 1
fi

node - "$SETTINGS" "$MCP_JSON" <<'NODE'
const fs = require('fs');
const settingsPath = process.argv[2];
const outPath = process.argv[3];
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
const payload = { mcpServers: settings.mcpServers ?? {} };
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
NODE
ok ".mcp.json を .claude/settings.json から生成 (gitignore 対象)"

# ---------------------------------------------------------------------------
# 4. sqlite DB
# ---------------------------------------------------------------------------
mkdir -p "${ROOT}/data"
if [ ! -f "$DATA_DB" ]; then
  : > "$DATA_DB"
  ok "data/local.db を作成 (空ファイル — MCP が初回に初期化)"
else
  ok "data/local.db は既にあります"
fi

# ---------------------------------------------------------------------------
# 5. 検証
# ---------------------------------------------------------------------------
info "環境変数を読み込んで mcp:check を実行..."
# shellcheck disable=SC1090
set -a
# shellcheck source=/dev/null
source "$ENV_LOCAL"
set +a
export PATH="${HOME}/.local/bin:${PATH}"

cd "$ROOT"
npm run mcp:check

echo
ok "完了 — 毎回のシェルで: source ${ENV_LOCAL}"
info "Claude Code / Cursor: リポジトリ root で起動すると .claude/settings.json と .mcp.json が使われます"
info "GitHub 上のルール: .cursor/rules/*.mdc と CLAUDE.md は clone 済みならそのまま有効です"
info "MCP memory (セッション間の記憶): memory サーバーがローカルに知識グラフを保持します"
