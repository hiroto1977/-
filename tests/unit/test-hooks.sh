#!/usr/bin/env bash
# test-hooks.sh — install-hooks.sh と pre-commit の動作確認
# INV: INV-6: PII を含む commit は pre-commit hook が阫止
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/assert.sh"

INSTALLER="$ROOT_DIR/scripts/install-hooks.sh"
PRE_COMMIT="$ROOT_DIR/scripts/hooks/pre-commit"

# 各テストは隔離した一時 git repo で実行する
make_repo() {
  local d
  d=$(mktemp -d)
  (
    cd "$d" || exit 1
    git init -q -b main
    git config user.email "test@example.com"
    git config user.name  "Test"
    git config commit.gpgsign false
    git config tag.gpgsign false
  )
  # 本リポのスクリプト一式を symlink で持ってきて、install-hooks が動く形にする
  mkdir -p "$d/scripts/lib" "$d/scripts/hooks"
  ln -sf "$ROOT_DIR/scripts/pii-scan.sh"     "$d/scripts/pii-scan.sh"
  ln -sf "$ROOT_DIR/scripts/audit-verify.sh" "$d/scripts/audit-verify.sh"
  ln -sf "$ROOT_DIR/scripts/lib/audit.sh"    "$d/scripts/lib/audit.sh"
  ln -sf "$ROOT_DIR/scripts/hooks/pre-commit" "$d/scripts/hooks/pre-commit"
  cp "$INSTALLER" "$d/scripts/install-hooks.sh"
  chmod +x "$d/scripts/install-hooks.sh"
  echo "$d"
}

t_install_status_uninstall() {
  local d; d=$(make_repo)
  local out
  # status: 未インストール
  out=$(cd "$d" && bash scripts/install-hooks.sh --status 2>&1)
  assert_contains "$out" "未インストール" || { rm -rf "$d"; return 1; }
  # install
  out=$(cd "$d" && bash scripts/install-hooks.sh 2>&1)
  assert_contains "$out" "pre-commit" || { rm -rf "$d"; return 1; }
  assert_file_exists "$d/.git/hooks/pre-commit" "pre-commit がインストールされている" || { rm -rf "$d"; return 1; }
  [[ -L "$d/.git/hooks/pre-commit" ]] || { echo "    シンボリックリンクではない"; rm -rf "$d"; return 1; }
  # status: 入っている
  out=$(cd "$d" && bash scripts/install-hooks.sh --status 2>&1)
  assert_contains "$out" "✅" || assert_contains "$out" "→" || { rm -rf "$d"; return 1; }
  # uninstall
  (cd "$d" && bash scripts/install-hooks.sh --uninstall >/dev/null 2>&1)
  if [[ -e "$d/.git/hooks/pre-commit" ]]; then
    rm -rf "$d"; echo "    --uninstall 後にもファイルが残っている"; return 1
  fi
  rm -rf "$d"
}

t_pre_commit_blocks_pii() {
  local d; d=$(make_repo)
  cd "$d" || return 1
  bash scripts/install-hooks.sh >/dev/null 2>&1
  # PII を含むファイルをステージ
  cat > secret.txt <<EOF
電話: 080-1234-5678
EOF
  git add secret.txt
  # commit を試す → pre-commit でブロックされる
  if git commit -m "should be blocked" >/tmp/commit-out.$$ 2>&1; then
    cat /tmp/commit-out.$$
    rm -f /tmp/commit-out.$$
    cd "$ROOT_DIR" && rm -rf "$d"
    echo "    PII 入りファイルが commit されてしまった"
    return 1
  fi
  rm -f /tmp/commit-out.$$
  cd "$ROOT_DIR" && rm -rf "$d"
  return 0
}

t_pre_commit_allows_clean() {
  local d; d=$(make_repo)
  cd "$d" || return 1
  bash scripts/install-hooks.sh >/dev/null 2>&1
  cat > clean.md <<EOF
# 普通のドキュメント
特に機密はない。テスト 太郎 くらい。
EOF
  git add clean.md
  if ! git commit -m "clean commit" >/tmp/commit-out.$$ 2>&1; then
    cat /tmp/commit-out.$$
    rm -f /tmp/commit-out.$$
    cd "$ROOT_DIR" && rm -rf "$d"
    echo "    PII の無いファイルなのに commit がブロックされた"
    return 1
  fi
  rm -f /tmp/commit-out.$$
  cd "$ROOT_DIR" && rm -rf "$d"
  return 0
}

t_pre_commit_no_verify_bypass() {
  local d; d=$(make_repo)
  cd "$d" || return 1
  bash scripts/install-hooks.sh >/dev/null 2>&1
  cat > secret.txt <<EOF
sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAA
EOF
  git add secret.txt
  if ! git commit --no-verify -m "bypass" >/dev/null 2>&1; then
    cd "$ROOT_DIR" && rm -rf "$d"
    echo "    --no-verify でも commit できなかった"
    return 1
  fi
  cd "$ROOT_DIR" && rm -rf "$d"
  return 0
}

t_pre_commit_skips_gitleaks_when_disabled() {
  # DISABLE_GITLEAKS=1 のとき、gitleaks があってもスキップされること
  if ! command -v gitleaks >/dev/null 2>&1; then
    return 0  # gitleaks 不在 → 動作確認できないがスキップで OK
  fi
  local d; d=$(make_repo)
  cd "$d" || return 1
  bash scripts/install-hooks.sh >/dev/null 2>&1
  cat > clean.md <<EOF
# 普通のドキュメント (PII なし)
EOF
  git add clean.md
  if ! DISABLE_GITLEAKS=1 git commit -m "skip gitleaks" >/dev/null 2>&1; then
    cd "$ROOT_DIR" && rm -rf "$d"
    echo "    DISABLE_GITLEAKS=1 でも commit が通らなかった"
    return 1
  fi
  cd "$ROOT_DIR" && rm -rf "$d"
  return 0
}

t_pre_commit_optional_gitleaks_block() {
  # gitleaks ロジックの存在 (sniff): スクリプトに DISABLE_GITLEAKS と gitleaks コマンド呼び出しがあるか
  local pc="$ROOT_DIR/scripts/hooks/pre-commit"
  assert_file_exists "$pc" "pre-commit 存在" || return 1
  grep -q "DISABLE_GITLEAKS" "$pc" || { echo "    DISABLE_GITLEAKS フラグなし"; return 1; }
  grep -q "command -v gitleaks" "$pc" || { echo "    gitleaks 検出ロジックなし"; return 1; }
  grep -q "gitleaks protect" "$pc" || { echo "    gitleaks protect 呼び出しなし"; return 1; }
  return 0
}

echo "== test-hooks =="
run_test "install / status / uninstall サイクル"  t_install_status_uninstall
run_test "pre-commit が PII 入り commit を阻止"   t_pre_commit_blocks_pii
run_test "pre-commit がクリーン commit を許可"     t_pre_commit_allows_clean
run_test "--no-verify で緊急回避できる"            t_pre_commit_no_verify_bypass
run_test "gitleaks ロジックがフックに存在 (sniff)" t_pre_commit_optional_gitleaks_block
run_test "DISABLE_GITLEAKS=1 で gitleaks をスキップ" t_pre_commit_skips_gitleaks_when_disabled
report
