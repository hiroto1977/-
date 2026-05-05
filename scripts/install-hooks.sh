#!/usr/bin/env bash
# install-hooks.sh — git フックを `.git/hooks/` にインストール
#
# 使い方:
#   bash scripts/install-hooks.sh             # 既定 (pre-commit を入れる)
#   bash scripts/install-hooks.sh --uninstall # 取り外し
#   bash scripts/install-hooks.sh --status    # 現状確認
#
# CLAUDE.md ルール 2 「コミット内容の自己検査」を物理的に強制する。

set -u

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[[ -z "$ROOT" ]] && { echo "❌ git リポジトリ外"; exit 1; }

HOOKS_SRC="$ROOT/scripts/hooks"
HOOKS_DST="$ROOT/.git/hooks"

# 監査ログ
[[ -f "$ROOT/scripts/lib/audit.sh" ]] && source "$ROOT/scripts/lib/audit.sh"
type audit_log >/dev/null 2>&1 || audit_log() { :; }

# Colors
if [[ -t 1 ]]; then
  C_OK="\033[1;32m"; C_NG="\033[1;31m"; C_INFO="\033[1;36m"; C_DIM="\033[2m"; C_RST="\033[0m"
else
  C_OK=""; C_NG=""; C_INFO=""; C_DIM=""; C_RST=""
fi

MODE="install"
case "${1:-}" in
  --uninstall) MODE="uninstall" ;;
  --status)    MODE="status" ;;
  -h|--help)
    sed -n '2,9p' "$0"
    exit 0
    ;;
  "") ;;
  *) echo "未知のオプション: $1"; exit 2 ;;
esac

HOOKS=(pre-commit)

case "$MODE" in
  install)
    audit_log "install_hooks.start" ""
    for h in "${HOOKS[@]}"; do
      src="$HOOKS_SRC/$h"
      dst="$HOOKS_DST/$h"
      if [[ ! -f "$src" ]]; then
        echo -e "${C_NG}❌${C_RST} ソース $src が見つからない"
        continue
      fi
      # 既にインストール済かどうか (シンボリックリンクで判定)
      if [[ -L "$dst" && "$(readlink "$dst")" == "$src" ]]; then
        echo -e "${C_DIM}既に最新${C_RST} $h"
        continue
      fi
      # 既存フック (フレッシュ git init 直後の sample 以外) のバックアップ
      if [[ -e "$dst" && ! -L "$dst" ]]; then
        cp "$dst" "$dst.bak.$(date +%Y%m%d%H%M%S)"
        echo -e "${C_INFO}既存 $h をバックアップ${C_RST}"
      fi
      ln -sf "$src" "$dst"
      chmod +x "$src"
      echo -e "${C_OK}✅${C_RST} $h → $(realpath --relative-to="$ROOT" "$src")"
    done
    audit_log "install_hooks.done" "hooks=${HOOKS[*]}"
    echo ""
    echo "  これで commit 前に PII スキャンが自動実行されます。"
    echo "  解除: bash scripts/install-hooks.sh --uninstall"
    ;;

  uninstall)
    audit_log "install_hooks.uninstall" ""
    for h in "${HOOKS[@]}"; do
      dst="$HOOKS_DST/$h"
      if [[ -L "$dst" ]]; then
        rm -f "$dst"
        echo -e "${C_OK}✅${C_RST} $h を取り外し"
      else
        echo -e "${C_DIM}-${C_RST} $h は未インストール"
      fi
    done
    ;;

  status)
    for h in "${HOOKS[@]}"; do
      dst="$HOOKS_DST/$h"
      if [[ -L "$dst" ]]; then
        echo -e "${C_OK}✅${C_RST} $h → $(readlink "$dst")"
      elif [[ -e "$dst" ]]; then
        echo -e "${C_INFO}?${C_RST}  $h (このリポ管理外のフックが入っている)"
      else
        echo -e "${C_DIM}-${C_RST} $h は未インストール"
      fi
    done
    ;;
esac
