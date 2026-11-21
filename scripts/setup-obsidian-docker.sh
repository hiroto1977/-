#!/usr/bin/env bash
# Service Hub — Obsidian + Docker + GitHub 連携セットアップ (業務効率化の仕組み化)
#
# Linux 上で「ローカル知識ベース (Obsidian Vault)」と「コンテナ基盤 (Docker)」を、
# GitHub と連携させながらセキュリティを強化した状態で構築する冪等スクリプト。
# 実機 (ユーザーの Linux) 上での実行を想定。CI ではシンタックス検査のみ。
#
#   bash scripts/setup-obsidian-docker.sh \
#     --vault ~/vaults/BusinessVault \
#     --remote git@github.com:USER/business-vault.git \
#     [--rootless] [--dry-run]
#
# 行うこと:
#   1. Docker (rootless 推奨) の導入確認とイメージ脆弱性スキャナ (Trivy) 準備
#   2. Obsidian Vault ディレクトリを git 化し GitHub プライベートリポジトリへ連携
#   3. コミット署名 (GPG/SSH) と秘密情報スキャン (gitleaks) の pre-commit 設定
#   4. Vault の自動同期 (cron / systemd timer) と Docker ボリュームバックアップの雛形配置
#
# 破壊的操作は行わず、未導入のものは「導入手順を提示」して終了する (安全側)。

set -euo pipefail

# --- 引数 -------------------------------------------------------------------
VAULT=""
REMOTE=""
ROOTLESS=0
DRY_RUN=0

usage() {
  sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --vault) VAULT="${2:-}"; shift 2 ;;
    --remote) REMOTE="${2:-}"; shift 2 ;;
    --rootless) ROOTLESS=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

log()  { printf '\033[1;36m[setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
run()  {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '\033[1;90m[dry-run]\033[0m %s\n' "$*"
  else
    "$@"
  fi
}

have() { command -v "$1" >/dev/null 2>&1; }

# --- 1. Docker --------------------------------------------------------------
setup_docker() {
  log "Docker の確認"
  if ! have docker; then
    warn "docker 未導入。導入: https://docs.docker.com/engine/install/ (rootless: dockerd-rootless-setuptool.sh install)"
    return 0
  fi
  log "docker: $(docker --version 2>/dev/null || echo '不明')"

  if [[ "$ROOTLESS" -eq 1 ]]; then
    if [[ "${XDG_RUNTIME_DIR:-}" == "" ]]; then
      warn "rootless 推奨だが XDG_RUNTIME_DIR が未設定。'dockerd-rootless-setuptool.sh install' を確認"
    else
      log "rootless モード向け環境変数を確認 (DOCKER_HOST=unix://\$XDG_RUNTIME_DIR/docker.sock)"
    fi
  fi

  if ! have trivy; then
    warn "Trivy (イメージ脆弱性スキャナ) 未導入。導入: https://aquasecurity.github.io/trivy/"
  else
    log "Trivy: $(trivy --version 2>/dev/null | head -1)"
  fi
}

# --- 2. Obsidian Vault を git 化 -------------------------------------------
setup_vault() {
  [[ -n "$VAULT" ]] || { warn "--vault 未指定のため Vault セットアップをスキップ"; return 0; }
  log "Vault: $VAULT"
  run mkdir -p "$VAULT"

  if [[ ! -d "$VAULT/.git" ]]; then
    log "git リポジトリを初期化"
    run git -C "$VAULT" init -q
  else
    log "git リポジトリは既存"
  fi

  # Obsidian の作業ファイル・秘密情報を追跡対象から除外 (冪等)
  local gi="$VAULT/.gitignore"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    {
      echo '.obsidian/workspace*.json'
      echo '.trash/'
      echo '*.secret'
      echo '.env'
    } >"$gi"
  fi
  log ".gitignore を整備 ($gi)"

  if [[ -n "$REMOTE" ]]; then
    if git -C "$VAULT" remote get-url origin >/dev/null 2>&1; then
      run git -C "$VAULT" remote set-url origin "$REMOTE"
    else
      run git -C "$VAULT" remote add origin "$REMOTE"
    fi
    log "GitHub リモートを設定: $REMOTE (push は手動で実施)"
  else
    warn "--remote 未指定のため GitHub 連携はスキップ"
  fi
}

# --- 3. セキュリティ強化 ----------------------------------------------------
setup_security() {
  [[ -n "$VAULT" && -d "$VAULT/.git" ]] || return 0
  log "コミット署名の確認"
  if git -C "$VAULT" config --get commit.gpgsign >/dev/null 2>&1; then
    log "commit.gpgsign は設定済み"
  else
    warn "コミット署名が未設定。'git config commit.gpgsign true' と署名鍵 (GPG/SSH) を設定推奨"
  fi

  # gitleaks (秘密情報スキャン) の pre-commit hook を冪等に設置
  local hook="$VAULT/.git/hooks/pre-commit"
  if have gitleaks; then
    if [[ "$DRY_RUN" -eq 0 ]]; then
      cat >"$hook" <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail
# Vault への機密情報混入を防ぐ
exec gitleaks protect --staged --redact
HOOK
      chmod +x "$hook"
    fi
    log "gitleaks pre-commit hook を設置 ($hook)"
  else
    warn "gitleaks 未導入。導入: https://github.com/gitleaks/gitleaks (機密情報の混入防止)"
  fi
}

# --- 4. 自動化の雛形 --------------------------------------------------------
setup_automation() {
  [[ -n "$VAULT" ]] || return 0
  log "自動同期・バックアップの雛形を提示"
  cat <<'TIP'
  # Vault を 15 分毎に自動コミット & push (crontab -e):
  #   */15 * * * * cd ~/vaults/BusinessVault && git add -A && git commit -qm "auto" && git push -q
  # Docker 永続ボリュームの暗号化バックアップ (compose):
  #   offen/docker-volume-backup を compose に追加し BACKUP_CRON_EXPRESSION を設定
TIP
}

main() {
  log "Obsidian + Docker + GitHub 連携セットアップ開始 (dry-run=$DRY_RUN)"
  setup_docker
  setup_vault
  setup_security
  setup_automation
  log "完了。詳細手順は docs/OBSIDIAN_DOCKER_SETUP.md を参照"
}

main "$@"
