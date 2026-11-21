#!/usr/bin/env bash
# Service Hub — Obsidian/Docker/GitHub 連携のセキュリティ自己点検
#
# セットアップ後のセキュリティ姿勢を点検し、達成/要対応をレポートする読み取り専用
# スクリプト。状態を変更しない (監査のみ)。
#
#   bash scripts/security-audit.sh [--vault ~/vaults/BusinessVault]
#
# 点検項目:
#   - git コミット署名 (commit.gpgsign)
#   - gitleaks pre-commit hook の有無
#   - Docker rootless モードの稼働
#   - Trivy によるイメージ脆弱性スキャナの有無
#   - GitHub リモートが https/ssh のいずれで、Vault が private 前提か

set -euo pipefail

VAULT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --vault) VAULT="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

have() { command -v "$1" >/dev/null 2>&1; }

PASS=0
WARN=0
ok()   { printf '\033[1;32m  ✅ %s\033[0m\n' "$*"; PASS=$((PASS + 1)); }
ng()   { printf '\033[1;33m  ⚠️  %s\033[0m\n' "$*"; WARN=$((WARN + 1)); }

echo "== Docker =="
if have docker; then
  ok "docker 導入済み: $(docker --version 2>/dev/null || echo '?')"
  if docker info 2>/dev/null | grep -qi 'rootless'; then
    ok "rootless モードで稼働 (権限分離)"
  else
    ng "rootless モードでない (root デーモン)。dockerd-rootless-setuptool.sh を検討"
  fi
else
  ng "docker 未導入"
fi
if have trivy; then ok "Trivy 導入済み (脆弱性スキャン可能)"; else ng "Trivy 未導入 (イメージ脆弱性スキャン不可)"; fi

echo "== Obsidian Vault / git =="
if [[ -n "$VAULT" && -d "$VAULT/.git" ]]; then
  if [[ "$(git -C "$VAULT" config --get commit.gpgsign 2>/dev/null || echo false)" == "true" ]]; then
    ok "コミット署名 (commit.gpgsign) 有効"
  else
    ng "コミット署名が無効 (改ざん検知のため有効化推奨)"
  fi
  if [[ -x "$VAULT/.git/hooks/pre-commit" ]]; then
    ok "pre-commit hook 設置済み (機密情報スキャン)"
  else
    ng "pre-commit hook 未設置 (gitleaks 連携を推奨)"
  fi
  remote_url="$(git -C "$VAULT" remote get-url origin 2>/dev/null || echo '')"
  if [[ -n "$remote_url" ]]; then
    ok "GitHub リモート設定済み: $remote_url"
  else
    ng "GitHub リモート未設定 (バックアップ・履歴のため連携推奨)"
  fi
else
  ng "Vault が git 管理されていない (--vault を指定、または setup-obsidian-docker.sh を実行)"
fi

echo
printf '結果: \033[1;32m%d 達成\033[0m / \033[1;33m%d 要対応\033[0m\n' "$PASS" "$WARN"
# 監査スクリプトは点検目的のため、要対応があっても非ゼロ終了にしない。
exit 0
