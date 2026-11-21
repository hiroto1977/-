#!/usr/bin/env bash
set -euo pipefail

# ローカル LLM 開発環境のセットアップ (Linux)。
#
#   npm run local-llm:setup                    # 計画を表示するだけ (何も変えない)
#   npm run local-llm:setup -- --yes           # 計画どおりに導入する
#   npm run local-llm:setup -- --check         # 今の状態だけ報告する
#   npm run local-llm:setup -- --yes --skip llamacpp,vscode   # 一部だけ飛ばす
#   npm run local-llm:setup -- --tier medium   # メモリの自動判定を上書きする
#
# 対象: Ollama / VS Code / Continue (拡張) / llama.cpp / 安全に使えるモデル。
# Jan と LM Studio は**自動導入しない** (理由は docs/LOCAL_LLM_SETUP.md)。接続先だけを案内する。
#
# ## 守っている安全の規則 (どれも「なぜ」を持つ)
#
#   1. 既定は計画の表示のみ。`--yes` を付けたときだけ変更する (勝手に入れない)。
#   2. 待ち受けは 127.0.0.1 だけ。OLLAMA_HOST が外向きなら導入を止める (認証の無い API を LAN へ出さない)。
#   3. Ollama は**修正版の床**以上だけを使う (src/shared/ollama.ts の台帳の最大 fixedIn と一致させる)。
#   4. llama.cpp は**ソースから公式タグを取って**組む。床 b8146 未満は使わない
#      (GGUF 読み込みの整数オーバーフロー CVE-2026-27940 / CVE-2026-33298 の修正版以降)。
#   5. モデルは Ollama の公式ライブラリからだけ取る。出所の分からない GGUF を自動で取らない
#      (GGUF の解析器は繰り返し脆弱性が出た面)。
#   6. 既存の Continue 設定は上書きしない (別名で隣に置く)。
#   7. 署名・チェックサムを検証できない配布物 (AppImage など) を黙って実行しない。

OLLAMA_MIN_VERSION="0.31.2" # src/shared/ollama.ts の台帳の最大 fixedIn と一致させること (検査が見る)
LLAMACPP_MIN_BUILD=8146     # CVE-2026-27940 (GHSA-3p4r-fq3f-q74v) の修正版
LLAMACPP_REPO="https://github.com/ggml-org/llama.cpp"
OLLAMA_PORT=11434

DO_APPLY=0
CHECK_ONLY=0
TIER="auto"
SKIP=""

usage() {
  cat <<'EOF'
ローカル LLM 開発環境のセットアップ (Linux)

  npm run local-llm:setup                計画を表示するだけ (何も変えない)
  npm run local-llm:setup -- --yes       計画どおりに導入する
  npm run local-llm:setup -- --check     今の状態だけ報告する
  --tier small|medium|large|xlarge       メモリの自動判定を上書き
  --skip ollama,vscode,continue,llamacpp 一部を飛ばす (カンマ区切り)

終了コード: 0 = 完了 (または計画の表示) / 1 = 失敗 (理由を表示) / 2 = 引数エラー
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --yes) DO_APPLY=1; shift ;;
    --check) CHECK_ONLY=1; shift ;;
    --tier) TIER="${2:-}"; shift 2 ;;
    --skip) SKIP="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "不明な引数: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$TIER" in
  auto|small|medium|large|xlarge) ;;
  *) echo "❌ --tier は auto / small / medium / large / xlarge: $TIER" >&2; exit 2 ;;
esac
case ",${SKIP}," in
  *[!a-z,]*) echo "❌ --skip の値が不正です: $SKIP" >&2; exit 2 ;;
esac

step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  ✅ %s\n' "$1"; }
warn() { printf '  ⚠  %s\n' "$1"; }
note() { printf '  · %s\n' "$1"; }
die()  { printf '  ❌ %s\n' "$1" >&2; exit 1; }

skipped() { case ",${SKIP}," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }
have() { command -v "$1" >/dev/null 2>&1; }

# ---- 前提 -----------------------------------------------------------------

if [ "$(uname -s)" != "Linux" ]; then
  die "このスクリプトは Linux 専用です (今は $(uname -s))。"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 版の比較: $1 >= $2 なら 0。数字とドットだけを読み、足りない桁は 0 とする。
version_ge() {
  local a="${1%%-*}" b="${2%%-*}" i
  local IFS=.
  # shellcheck disable=SC2206
  local av=($a) bv=($b)
  for i in 0 1 2; do
    local x="${av[$i]:-0}" y="${bv[$i]:-0}"
    case "$x$y" in *[!0-9]*) return 1 ;; esac
    if [ "$x" -gt "$y" ]; then return 0; fi
    if [ "$x" -lt "$y" ]; then return 1; fi
  done
  return 0
}

# ---- 機械の判定 -----------------------------------------------------------

ram_gb() {
  awk '/^MemTotal:/ { printf "%d", $2 / 1024 / 1024 }' /proc/meminfo
}

vram_gb() {
  if have nvidia-smi; then
    nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null \
      | awk 'NR == 1 { printf "%d", $1 / 1024 }' || true
  fi
}

RAM="$(ram_gb)"
VRAM="$(vram_gb)"
VRAM="${VRAM:-0}"
# モデルが載る量: GPU があれば VRAM、無ければ RAM の 6 割 (OS と編集器の分を残す)。
if [ "$VRAM" -gt 0 ]; then BUDGET="$VRAM"; else BUDGET=$(( RAM * 6 / 10 )); fi

pick_tier() {
  if [ "$TIER" != "auto" ]; then echo "$TIER"; return; fi
  if [ "$BUDGET" -lt 6 ]; then echo small
  elif [ "$BUDGET" -lt 12 ]; then echo medium
  elif [ "$BUDGET" -lt 24 ]; then echo large
  else echo xlarge
  fi
}
TIER="$(pick_tier)"

# 層ごとのモデル。Ollama の公式ライブラリのタグだけ (規則 5)。
#   chat    : 会話・編集・適用 (Continue の chat / edit / apply)
#   auto    : 補完 (小さく速いもの)
#   embed   : コードの検索 (Continue の embed)
case "$TIER" in
  small)  CHAT="qwen2.5-coder:3b"  ;;
  medium) CHAT="qwen2.5-coder:7b"  ;;
  large)  CHAT="qwen2.5-coder:14b" ;;
  xlarge) CHAT="qwen2.5-coder:32b" ;;
esac
AUTOCOMPLETE="qwen2.5-coder:1.5b"
EMBED="nomic-embed-text"

# ---- パッケージ管理 ---------------------------------------------------------

PKG=""
if have apt-get; then PKG="apt"
elif have dnf; then PKG="dnf"
elif have pacman; then PKG="pacman"
fi

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if have sudo; then SUDO="sudo"; fi
fi

# ---- 状態の確認 (--check) -----------------------------------------------------

ollama_version() {
  have ollama || return 1
  ollama --version 2>/dev/null | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?' | head -1
}

llamacpp_build() {
  have llama-server || return 1
  llama-server --version 2>&1 | grep -Eo 'version: [0-9]+' | grep -Eo '[0-9]+' | head -1
}

report() {
  step "現状"
  note "メモリ: RAM ${RAM} GB / VRAM ${VRAM} GB → 層 ${TIER} (チャット ${CHAT})"
  local v
  if v="$(ollama_version)" && [ -n "$v" ]; then
    if version_ge "$v" "$OLLAMA_MIN_VERSION"; then ok "Ollama ${v} (床 ${OLLAMA_MIN_VERSION} 以上)"
    else warn "Ollama ${v} は床 ${OLLAMA_MIN_VERSION} 未満です —— 既知の脆弱性が残ります。更新してください"; fi
  else
    note "Ollama: 未導入"
  fi
  if have code; then ok "VS Code: 導入済み"; else note "VS Code: 未導入"; fi
  if have code && code --list-extensions 2>/dev/null | grep -qix 'continue.continue'; then
    ok "Continue 拡張: 導入済み"
  else
    note "Continue 拡張: 未導入"
  fi
  local b
  if b="$(llamacpp_build)" && [ -n "$b" ]; then
    if [ "$b" -ge "$LLAMACPP_MIN_BUILD" ]; then ok "llama.cpp b${b} (床 b${LLAMACPP_MIN_BUILD} 以上)"
    else warn "llama.cpp b${b} は床 b${LLAMACPP_MIN_BUILD} 未満です —— GGUF 解析の脆弱性が残ります"; fi
  else
    note "llama.cpp: 未導入"
  fi
  if [ -n "${OLLAMA_HOST:-}" ]; then
    case "$OLLAMA_HOST" in
      127.0.0.1*|localhost*|\[::1\]*) ok "OLLAMA_HOST=${OLLAMA_HOST} (ループバック)" ;;
      *) warn "OLLAMA_HOST=${OLLAMA_HOST} は外向きです —— 認証の無い API が LAN に出ます" ;;
    esac
  fi
}

if [ "$CHECK_ONLY" = "1" ]; then
  report
  exit 0
fi

# ---- 計画 -------------------------------------------------------------------

step "計画 (層 ${TIER} · RAM ${RAM} GB · VRAM ${VRAM} GB)"
skipped ollama   || note "Ollama を導入/確認 (床 ${OLLAMA_MIN_VERSION} 以上) → ${CHAT} / ${AUTOCOMPLETE} / ${EMBED} を取得"
skipped vscode   || note "VS Code を導入 (未導入のとき · ${PKG:-パッケージ管理が見つからない})"
skipped continue || note "Continue 拡張を導入し、~/.continue/config.yaml を 127.0.0.1 の Ollama へ向ける (既存は上書きしない)"
skipped llamacpp || note "llama.cpp を公式タグ (b${LLAMACPP_MIN_BUILD} 以上の最新) からソース導入 → ~/.local/bin/llama-server"
note "Jan / LM Studio は自動導入しない (案内のみ · docs/LOCAL_LLM_SETUP.md)"

if [ "$DO_APPLY" != "1" ]; then
  printf '\n  これは計画の表示だけです。実行するには --yes を付けてください。\n'
  exit 0
fi

# ---- 実行 -------------------------------------------------------------------

# 規則 2: 外向きの OLLAMA_HOST では始めない。
if [ -n "${OLLAMA_HOST:-}" ]; then
  case "$OLLAMA_HOST" in
    127.0.0.1*|localhost*|\[::1\]*) ;;
    *) die "OLLAMA_HOST=${OLLAMA_HOST} は外向きです。認証の無い API を LAN へ出さないため中止します (unset してください)。" ;;
  esac
fi

install_pkgs() {
  # $@ = パッケージ名 (apt の名前)。無ければ警告して続ける。
  case "$PKG" in
    apt) $SUDO apt-get install -y "$@" ;;
    dnf) $SUDO dnf install -y "$@" ;;
    pacman) $SUDO pacman -S --noconfirm "$@" ;;
    *) return 1 ;;
  esac
}

# 1. Ollama —— 既存の ollama-setup.sh (導入 → 取得 → 起動 → 1 往復) を使う。
if ! skipped ollama; then
  step "1/4 Ollama"
  bash "${SCRIPT_DIR}/ollama-setup.sh" --model "$AUTOCOMPLETE" --port "$OLLAMA_PORT"
  v="$(ollama_version || true)"
  if [ -z "$v" ]; then die "Ollama の版が読めません。"; fi
  if ! version_ge "$v" "$OLLAMA_MIN_VERSION"; then
    die "Ollama ${v} は床 ${OLLAMA_MIN_VERSION} 未満です。既知の脆弱性が残るため中止します。公式の手順で更新してください。"
  fi
  ok "Ollama ${v}"
  # 取りに行くのは公式ライブラリのタグだけ。タグが無ければ警告して続ける (別名を推測しない)。
  for m in "$CHAT" "$EMBED"; do
    if ollama pull "$m"; then ok "モデル ${m}"; else warn "モデル ${m} を取得できませんでした (タグが無い/網の不調)。後で: ollama pull ${m}"; fi
  done
fi

# 2. VS Code
if ! skipped vscode; then
  step "2/4 VS Code"
  if have code; then
    ok "VS Code は導入済み"
  elif have snap; then
    $SUDO snap install code --classic && ok "VS Code (snap)" || warn "snap で入りませんでした。https://code.visualstudio.com/ から公式の .deb/.rpm を入れてください"
  else
    warn "snap が無いので自動導入しません。https://code.visualstudio.com/ から公式の .deb/.rpm を入れてください"
  fi
fi

# 3. Continue 拡張と設定
if ! skipped continue; then
  step "3/4 Continue"
  if have code; then
    code --install-extension Continue.continue >/dev/null 2>&1 && ok "Continue 拡張" || warn "Continue 拡張を入れられませんでした: code --install-extension Continue.continue"
  else
    warn "code コマンドが無いので拡張は後で: code --install-extension Continue.continue"
  fi
  CONF_DIR="${HOME}/.continue"
  mkdir -p "$CONF_DIR"
  CONF="${CONF_DIR}/config.yaml"
  if [ -e "$CONF" ]; then
    CONF="${CONF_DIR}/config.local-llm.yaml"
    warn "既存の config.yaml は上書きしません。${CONF} に書いたので、必要な部分を取り込んでください。"
  fi
  cat > "$CONF" <<EOF
name: Local LLM (Ollama · 127.0.0.1)
version: 1.0.0
schema: v1
models:
  - name: ${CHAT}
    provider: ollama
    model: ${CHAT}
    apiBase: http://127.0.0.1:${OLLAMA_PORT}
    roles:
      - chat
      - edit
      - apply
  - name: ${AUTOCOMPLETE} (補完)
    provider: ollama
    model: ${AUTOCOMPLETE}
    apiBase: http://127.0.0.1:${OLLAMA_PORT}
    roles:
      - autocomplete
  - name: ${EMBED}
    provider: ollama
    model: ${EMBED}
    apiBase: http://127.0.0.1:${OLLAMA_PORT}
    roles:
      - embed
EOF
  ok "Continue の設定: ${CONF}"
  note "テレメトリを切る: VS Code の設定で continue.telemetryEnabled を false に"
fi

# 4. llama.cpp —— 公式タグからソースで組む (規則 4)。
if ! skipped llamacpp; then
  step "4/4 llama.cpp"
  for t in git cmake make g++; do
    have "$t" || die "${t} が見つかりません。先に入れてください (apt: build-essential cmake git)。"
  done
  TAG="$(git ls-remote --tags --refs "$LLAMACPP_REPO" 'refs/tags/b*' \
    | sed 's#.*refs/tags/##' | grep -E '^b[0-9]+$' | sort -V | tail -1 || true)"
  [ -n "$TAG" ] || die "llama.cpp のタグを取得できません (網の不調)。"
  BUILD_NO="${TAG#b}"
  if [ "$BUILD_NO" -lt "$LLAMACPP_MIN_BUILD" ]; then
    die "最新タグ ${TAG} が床 b${LLAMACPP_MIN_BUILD} 未満です。想定外なので中止します。"
  fi
  PREFIX="${HOME}/.local/share/llama.cpp"
  SRC="${PREFIX}/src-${TAG}"
  mkdir -p "$PREFIX" "${HOME}/.local/bin"
  if [ ! -d "$SRC" ]; then
    git clone --depth 1 --branch "$TAG" "$LLAMACPP_REPO" "$SRC"
  fi
  cmake -S "$SRC" -B "${SRC}/build" -DCMAKE_BUILD_TYPE=Release
  cmake --build "${SRC}/build" --config Release -j "$(nproc)" --target llama-server llama-cli
  ln -sf "${SRC}/build/bin/llama-server" "${HOME}/.local/bin/llama-server"
  ln -sf "${SRC}/build/bin/llama-cli" "${HOME}/.local/bin/llama-cli"
  ok "llama.cpp ${TAG} → ~/.local/bin/llama-server"
  note "起動は必ず待ち受けを絞る: llama-server --host 127.0.0.1 --port 8080 -m <信頼できる GGUF>"
  note "GGUF は公式配布元で SHA256 を確かめてから (出所の分からない GGUF は読ませない)"
fi

step "Jan / LM Studio"
note "自動導入はしません。入れたら、接続先に http://127.0.0.1:${OLLAMA_PORT}/v1 (OpenAI 互換) を指定してください。"
note "Jan: https://jan.ai/  /  LM Studio: https://lmstudio.ai/  (導入後は各アプリのローカル API も 127.0.0.1 のままにする)"

report
printf '\n完了。\n'
