#!/usr/bin/env bash
# Service Hub — Linux 開発環境ワンコマンドセットアップ + 環境診断
#
# 新しい Ubuntu / Debian 系マシンでこのリポジトリを clone した直後に
# 1 回実行すれば、開発に必要なものが全て揃う:
#   - OS パッケージ (git / curl / build-essential / Electron 実行ライブラリ / xvfb)
#   - Node.js LTS (nvm 経由。既に Node >= 20 があればスキップ)
#   - npm 依存 (npm ci / npm install)
#   - 日本語入力 ibus-mozc (GNOME デスクトップ検出時のみ。入力ソース登録込み)
#   - 最後に環境診断 (doctor) を自動実行し、残課題を ✅/⚠/❌ で報告
#
# Usage:
#   bash scripts/setup-linux.sh            # セットアップ + 診断
#   bash scripts/setup-linux.sh --verify   # セットアップ + 品質ゲート + 診断
#   bash scripts/setup-linux.sh --doctor   # 診断のみ (何も変更しない)
#
# 何度実行しても安全 (冪等)。導入済みの手順は自動でスキップする。
# ネットワーク操作 (apt / nvm ダウンロード) は 3 回まで指数バックオフで再試行。
# 詳しい移行手順は docs/LINUX_MIGRATION.md を参照。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIN_NODE_MAJOR=20
MIN_FREE_DISK_GB=5
RUN_VERIFY=0
DOCTOR_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --verify) RUN_VERIFY=1 ;;
    --doctor) DOCTOR_ONLY=1 ;;
    *) echo "unknown option: $arg (supported: --verify / --doctor)" >&2; exit 1 ;;
  esac
done

info() { printf '\033[1;34m[setup]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ ok ]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }

# 失敗しうるネットワーク操作を 2s/4s バックオフ付きで最大 3 回試す
retry() {
  local n=1
  until "$@"; do
    if [ "$n" -ge 3 ]; then
      warn "3 回失敗: $*"
      return 1
    fi
    warn "失敗 (retry $n/2, $((2 ** n))s 待機): $*"
    sleep $((2 ** n))
    n=$((n + 1))
  done
}

node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

# ---------------------------------------------------------------------------
# doctor: 環境診断 (副作用なし)。❌ = 開発不能、⚠ = 機能制限あり。
# ---------------------------------------------------------------------------
DOCTOR_FAIL=0
DOCTOR_WARN=0
d_ok()   { printf '  ✅ %s\n' "$*"; }
d_warn() { printf '  ⚠  %s\n' "$*"; DOCTOR_WARN=$((DOCTOR_WARN + 1)); }
d_fail() { printf '  ❌ %s\n' "$*"; DOCTOR_FAIL=$((DOCTOR_FAIL + 1)); }

doctor() {
  DOCTOR_FAIL=0
  DOCTOR_WARN=0
  echo
  info "環境診断 (doctor)"

  # OS / ディストリビューション
  if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    d_ok "OS: ${PRETTY_NAME:-unknown}"
  else
    d_warn "/etc/os-release が読めません (非標準環境)"
  fi
  if grep -qi microsoft /proc/version 2>/dev/null; then
    d_warn "WSL を検出 — Electron の GUI 表示には WSLg (Windows 11 / WSL 2) が必要"
  fi

  # Node.js
  if command -v node >/dev/null 2>&1 && [ "$(node_major)" -ge "$MIN_NODE_MAJOR" ]; then
    d_ok "Node.js $(node --version) (>= v${MIN_NODE_MAJOR})"
  else
    d_fail "Node.js >= v${MIN_NODE_MAJOR} が見つかりません → bash scripts/setup-linux.sh で導入"
  fi

  # npm 依存
  if [ -d "$ROOT/node_modules" ]; then
    d_ok "npm 依存 導入済み (node_modules)"
  else
    d_fail "node_modules がありません → bash scripts/setup-linux.sh で導入"
  fi

  # Electron 実行に必要な共有ライブラリ
  local missing=()
  local lib
  for lib in libnss3.so libgtk-3.so.0 libasound.so.2 libgbm.so.1 \
             libxkbcommon.so.0 libatk-bridge-2.0.so.0 libdrm.so.2; do
    if ! ldconfig -p 2>/dev/null | grep -q "$lib"; then
      missing+=("$lib")
    fi
  done
  if [ "${#missing[@]}" -eq 0 ]; then
    d_ok "Electron 実行ライブラリ 全て検出 (ldconfig)"
  else
    d_fail "不足ライブラリ: ${missing[*]} → bash scripts/setup-linux.sh で導入"
  fi

  # xvfb (npm run smoke 用)
  if command -v Xvfb >/dev/null 2>&1; then
    d_ok "Xvfb あり (npm run smoke 実行可)"
  else
    d_warn "Xvfb なし — npm run smoke (ヘッドレススクリーンショット) が使えない"
  fi

  # キーリング (safeStorage の OS 暗号化が効くか)
  if command -v gnome-keyring-daemon >/dev/null 2>&1 || pgrep -x gnome-keyring-d >/dev/null 2>&1; then
    d_ok "gnome-keyring 検出 — トークンは safeStorage で OS 暗号化される"
  else
    d_warn "キーリング未検出 — トークンは base64 フォールバック保存 (src/main/secrets.ts)。GNOME 環境なら通常は自動で有効"
  fi

  # 日本語入力 (デスクトップ環境がある場合のみ)
  if dpkg -s gnome-shell >/dev/null 2>&1; then
    if dpkg -s ibus-mozc >/dev/null 2>&1; then
      d_ok "日本語入力 ibus-mozc 導入済み"
    else
      d_warn "ibus-mozc 未導入 — bash scripts/setup-linux.sh で自動導入 (フェーズ3)"
    fi
  fi

  # git ユーザー設定 (コミットに必須)
  if git config user.name >/dev/null 2>&1 && git config user.email >/dev/null 2>&1; then
    d_ok "git user.name / user.email 設定済み"
  else
    d_warn "git user.name / user.email 未設定 → git config --global で設定 (docs/LINUX_MIGRATION.md フェーズ4)"
  fi

  # ディスク空き (node_modules + Electron キャッシュ + ビルド成果物)
  local free_gb
  free_gb="$(df -BG --output=avail "$ROOT" 2>/dev/null | tail -1 | tr -dc '0-9' || echo '')"
  if [ -z "$free_gb" ]; then
    d_warn "空きディスク容量を取得できません"
  elif [ "$free_gb" -ge "$MIN_FREE_DISK_GB" ]; then
    d_ok "空きディスク ${free_gb}GB (>= ${MIN_FREE_DISK_GB}GB)"
  else
    d_warn "空きディスク ${free_gb}GB — ${MIN_FREE_DISK_GB}GB 以上を推奨"
  fi

  echo
  if [ "$DOCTOR_FAIL" -gt 0 ]; then
    warn "診断結果: ❌ ${DOCTOR_FAIL} 件 / ⚠ ${DOCTOR_WARN} 件 — ❌ を解消するまで開発できません"
    return 1
  fi
  if [ "$DOCTOR_WARN" -gt 0 ]; then
    info "診断結果: ✅ (⚠ ${DOCTOR_WARN} 件 — 機能制限はあるが開発可能)"
  else
    ok "診断結果: 全項目 ✅"
  fi
  return 0
}

if [ "$DOCTOR_ONLY" = "1" ]; then
  doctor
  exit $?
fi

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
export DEBIAN_FRONTEND=noninteractive

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
# 無関係な PPA が死んでいても主要リポジトリの index があれば
# install は成功するため、update の部分失敗では中断しない。
retry $SUDO apt-get update -qq || warn "リポジトリの index 更新に失敗 (続行します)"

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

retry $SUDO apt-get install -y -qq "${PKGS[@]}"
ok "OS パッケージ: ${PKGS[*]}"

# ---------------------------------------------------------------------------
# 2. Node.js (>= ${MIN_NODE_MAJOR}。無ければ nvm + LTS を導入)
# ---------------------------------------------------------------------------
if command -v node >/dev/null 2>&1 && [ "$(node_major)" -ge "$MIN_NODE_MAJOR" ]; then
  ok "Node.js $(node --version) を検出 (>= v${MIN_NODE_MAJOR} なのでそのまま使用)"
else
  info "Node.js >= v${MIN_NODE_MAJOR} が無いため nvm 経由で LTS を導入..."
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    retry bash -c 'curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash'
  fi
  # nvm.sh は nounset (set -u) 非対応 (PROVIDED_VERSION 等が未定義参照) のため、
  # ロード〜使用の間だけ -u を外す。実機 WSL で line 3885 unbound を確認済み。
  set +u
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  retry nvm install --lts
  nvm use --lts
  set -u
  ok "Node.js $(node --version) を導入"
fi

# ---------------------------------------------------------------------------
# 3. npm 依存
# ---------------------------------------------------------------------------
info "npm 依存を導入中 (${ROOT})..."
cd "$ROOT"
if [ -f package-lock.json ]; then
  retry npm ci
else
  retry npm install
fi
ok "npm 依存 導入完了"

# ---------------------------------------------------------------------------
# 4. 日本語入力 (Mozc) — GNOME デスクトップ検出時のみ (フェーズ3 の自動化)
# ---------------------------------------------------------------------------
if dpkg -s gnome-shell >/dev/null 2>&1; then
  if ! dpkg -s ibus-mozc >/dev/null 2>&1; then
    info "GNOME を検出 — 日本語入力 (ibus-mozc) を導入..."
    retry $SUDO apt-get install -y -qq ibus-mozc
  fi
  # 入力ソースへの登録は GUI セッション内 (DBus あり) でのみ可能
  if command -v gsettings >/dev/null 2>&1 && [ -n "${DBUS_SESSION_BUS_ADDRESS:-}" ] \
     && command -v python3 >/dev/null 2>&1; then
    current="$(gsettings get org.gnome.desktop.input-sources sources 2>/dev/null || echo '')"
    if [ -n "$current" ] && ! echo "$current" | grep -q "mozc-jp"; then
      # gsettings の GVariant リストは bash で安全に編集できないため python で追記
      new_sources="$(python3 -c "import ast,sys; s=ast.literal_eval(sys.argv[1]); s.append(('ibus','mozc-jp')); print(s)" "$current")"
      if gsettings set org.gnome.desktop.input-sources sources "$new_sources"; then
        ok "入力ソースに 日本語 (Mozc) を追加 (Super+Space で切替)"
      else
        warn "入力ソース登録に失敗 — 設定 → キーボードから手動で追加してください"
      fi
    else
      ok "日本語入力 (Mozc) は設定済み"
    fi
  else
    info "GUI セッション外のため入力ソース登録はスキップ (初回ログイン後に再実行すれば登録される)"
  fi
else
  info "デスクトップ (GNOME) 未検出 — 日本語入力セットアップをスキップ"
fi

# ---------------------------------------------------------------------------
# 5. (任意) 品質ゲート
# ---------------------------------------------------------------------------
if [ "$RUN_VERIFY" = "1" ]; then
  info "品質ゲートを実行中 (typecheck → test → verify:all)..."
  npm run typecheck
  npm test
  npm run verify:all
  ok "全品質ゲート green"
fi

# ---------------------------------------------------------------------------
# 6. 最終診断 + 次の一歩
# ---------------------------------------------------------------------------
doctor || warn "未解消の項目があります (上記 ❌ を参照)"

cat <<'EOS'

✅ セットアップ完了。次の一歩:

  npm run dev          # Electron デスクトップ版を起動
  npm run build:web    # ブラウザ単体版 dist/standalone.html を生成
  npm run smoke        # xvfb で全ページのスクリーンショット確認

⚠ 旧マシンで保存したサービストークンは引き継がれません
  (safeStorage の暗号鍵がマシン固有のため)。設定ページから再登録してください。
  SSH 鍵・git 設定の移行は scripts/migrate.sh (backup / restore) で自動化できます。
  詳細: docs/LINUX_MIGRATION.md
EOS
