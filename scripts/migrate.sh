#!/usr/bin/env bash
# Service Hub — 開発環境の移行ペイロード backup / restore
#
# docs/LINUX_MIGRATION.md フェーズ0 (旧マシン) とフェーズ4 (新マシン) の
# 手作業だった部分を自動化する:
#
#   旧マシン:  bash scripts/migrate.sh backup [--out FILE] [--scan DIR] [--encrypt]
#     - ~/.ssh / ~/.gitconfig / ~/.config/git を tar.gz に収集 (権限保持)
#     - --scan DIR (既定 $HOME, 深さ4) 配下の git リポジトリを走査し、
#       未コミット変更・stash・未 push コミットを manifest に列挙
#       → 「push 漏れがないか全リポジトリで確認」を機械化
#     - アーカイブは秘密鍵を含むため chmod 600 + SHA256 を表示
#     - --encrypt: AES-256-CBC + PBKDF2 (60万回) でパスフレーズ暗号化した
#       .tar.gz.enc を生成 → Google Drive 等のクラウドストレージ経由で
#       USB なしに移送できる (パスフレーズは非保存・忘れると復元不能)
#
#   新マシン:  bash scripts/migrate.sh restore ARCHIVE [--force]
#     - .enc 拡張子なら自動でパスフレーズを尋ねて復号
#     - $HOME に展開 (既存ファイルは --force 無しでは上書きしない)
#     - ~/.ssh は 700、鍵は 600 に正規化
#     - manifest (push 漏れ警告) を再表示
#
# Windows が旧マシンの場合は Git Bash か WSL から実行する。
# サービストークンは対象外 (safeStorage のマシン固有鍵で復号不能なため、
# 新マシンで再登録する — docs/LINUX_MIGRATION.md フェーズ5)。

set -euo pipefail

info() { printf '\033[1;34m[migrate]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[  ok  ]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[ warn ]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[ fail ]\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 1
}

MODE="${1:-}"
shift || true

# ---------------------------------------------------------------------------
# backup
# ---------------------------------------------------------------------------
do_backup() {
  local out="" scan="$HOME" encrypt=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --out)  out="${2:?--out requires FILE}"; shift 2 ;;
      --scan) scan="${2:?--scan requires DIR}"; shift 2 ;;
      --encrypt) encrypt=1; shift ;;
      *) die "unknown option: $1" ;;
    esac
  done
  [ -n "$out" ] || out="$HOME/service-hub-migration-$(date +%Y%m%d-%H%M%S).tar.gz"
  if [ "$encrypt" = "1" ]; then
    command -v openssl >/dev/null 2>&1 || die "--encrypt には openssl が必要です"
    case "$out" in *.enc) ;; *) out="${out}.enc" ;; esac
  fi

  # trap は関数 return 後 (スクリプト終了時) に走るため local にしない
  stage="$(mktemp -d)"
  trap 'rm -rf "$stage"' EXIT
  mkdir -p "$stage/payload"

  # --- 1. 設定ファイル収集 (存在するものだけ・権限保持) -------------------
  local collected=0
  local p
  for p in .ssh .gitconfig .config/git; do
    if [ -e "$HOME/$p" ]; then
      mkdir -p "$stage/payload/$(dirname "$p")"
      cp -a "$HOME/$p" "$stage/payload/$(dirname "$p")/"
      info "収集: ~/$p"
      collected=$((collected + 1))
    fi
  done
  [ "$collected" -gt 0 ] || warn "収集対象が 1 つも見つかりません (~/.ssh も ~/.gitconfig も無い)"

  # --- 2. git リポジトリ走査 → push 漏れ manifest --------------------------
  local manifest="$stage/payload/MIGRATION_MANIFEST.txt"
  {
    echo "# Service Hub 移行 manifest — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "# 旧マシンで push 漏れの可能性があるリポジトリ一覧 (走査: $scan, 深さ4)"
    echo
  } > "$manifest"

  local dirty_count=0 repo gitdir
  while IFS= read -r gitdir; do
    repo="$(dirname "$gitdir")"
    local issues=()
    [ -n "$(git -C "$repo" status --porcelain 2>/dev/null)" ] && issues+=("未コミット変更")
    [ "$(git -C "$repo" stash list 2>/dev/null | wc -l)" -gt 0 ] && issues+=("stash あり")
    # upstream 比較で先行コミット (= 未 push) を検出。upstream 無し branch も列挙
    local br
    while IFS= read -r br; do
      if git -C "$repo" rev-parse --abbrev-ref "$br@{upstream}" >/dev/null 2>&1; then
        [ "$(git -C "$repo" rev-list --count "$br@{upstream}..$br" 2>/dev/null || echo 0)" -gt 0 ] \
          && issues+=("未push: $br")
      else
        issues+=("upstream無し: $br")
      fi
    done < <(git -C "$repo" for-each-ref --format='%(refname:short)' refs/heads 2>/dev/null)
    if [ "${#issues[@]}" -gt 0 ]; then
      # IFS はマルチバイト文字を扱えないため ASCII の " / " で連結
      local joined
      joined="$(printf '%s / ' "${issues[@]}")"
      printf '%s\n  - %s\n' "$repo" "${joined% / }" >> "$manifest"
      dirty_count=$((dirty_count + 1))
    fi
  done < <(find "$scan" -maxdepth 4 -name .git -type d 2>/dev/null)

  if [ "$dirty_count" -eq 0 ]; then
    echo "(全リポジトリ clean — push 漏れなし)" >> "$manifest"
    ok "git リポジトリ走査: push 漏れなし"
  else
    warn "push 漏れの可能性: ${dirty_count} リポジトリ (manifest 参照 — 移行前に push 推奨)"
    sed -n '4,30p' "$manifest" >&2
  fi

  # --- 3. アーカイブ生成 (秘密鍵入りのため 600) ----------------------------
  if [ "$encrypt" = "1" ]; then
    # クラウドストレージ経由の移送用: AES-256-CBC + PBKDF2 (60万回) で暗号化。
    # パスフレーズはどこにも保存されない — 忘れると復元不能。
    local pp1 pp2
    printf '暗号化パスフレーズ: '
    read -rs pp1; echo
    printf 'もう一度: '
    read -rs pp2; echo
    [ "$pp1" = "$pp2" ] || die "パスフレーズが一致しません"
    [ "${#pp1}" -ge 8 ] || die "パスフレーズは 8 文字以上にしてください"
    # env 経由で渡し、ps の引数からパスフレーズが見えないようにする
    export MIGRATE_PASSPHRASE="$pp1"
    if ! tar -cz -C "$stage/payload" . \
        | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt \
            -pass env:MIGRATE_PASSPHRASE -out "$out"; then
      unset MIGRATE_PASSPHRASE
      die "暗号化に失敗しました"
    fi
    unset MIGRATE_PASSPHRASE pp1 pp2
  else
    tar -czf "$out" -C "$stage/payload" .
  fi
  chmod 600 "$out"
  local sha
  if command -v sha256sum >/dev/null 2>&1; then
    sha="$(sha256sum "$out" | awk '{print $1}')"
  else
    sha="$(shasum -a 256 "$out" | awk '{print $1}')"
  fi
  ok "作成: $out"
  ok "SHA256: $sha"
  if [ "$encrypt" = "1" ]; then
    cat <<EOS

次の一歩:
  1. $out を Google Drive / Dropbox 等のクラウドストレージにアップロード
  2. 新マシンでダウンロードし SHA256 が上と一致することを確認
  3. bash scripts/migrate.sh restore $(basename "$out")  (パスフレーズを入力)
⚠ パスフレーズはどこにも保存されない — 忘れると復元不能。
EOS
  else
    cat <<EOS

次の一歩 (新マシンで):
  bash scripts/migrate.sh restore $(basename "$out")
  → SHA256 が上と一致することを確認してから展開すること。
⚠ このアーカイブは SSH 秘密鍵を含む (平文)。クラウドに置く場合は
  --encrypt で暗号化バックアップを作り直すこと。
EOS
  fi
}

# ---------------------------------------------------------------------------
# restore
# ---------------------------------------------------------------------------
do_restore() {
  local archive="${1:-}" force=0
  [ -n "$archive" ] || usage
  shift
  while [ $# -gt 0 ]; do
    case "$1" in
      --force) force=1; shift ;;
      *) die "unknown option: $1" ;;
    esac
  done
  [ -f "$archive" ] || die "アーカイブが見つかりません: $archive"

  # trap は関数 return 後 (スクリプト終了時) に走るため local にしない
  stage="$(mktemp -d)"
  trap 'rm -rf "$stage"' EXIT
  case "$archive" in
    *.enc)
      command -v openssl >/dev/null 2>&1 || die "暗号化アーカイブの復号には openssl が必要です"
      local pp
      printf '暗号化パスフレーズ: '
      read -rs pp; echo
      export MIGRATE_PASSPHRASE="$pp"
      if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
          -pass env:MIGRATE_PASSPHRASE -in "$archive" \
          | tar -xz -C "$stage"; then
        unset MIGRATE_PASSPHRASE
        die "復号に失敗しました (パスフレーズ誤り、またはファイル破損)"
      fi
      unset MIGRATE_PASSPHRASE pp
      ;;
    *)
      tar -xzf "$archive" -C "$stage"
      ;;
  esac

  # 既存ファイルを壊さない: --force 無しでは存在しないものだけ配置
  local restored=0 skipped=0 f rel dest
  while IFS= read -r f; do
    rel="${f#"$stage"/}"
    dest="$HOME/$rel"
    if [ -e "$dest" ] && [ "$force" = "0" ]; then
      warn "スキップ (既存): ~/$rel  (--force で上書き)"
      skipped=$((skipped + 1))
    else
      mkdir -p "$(dirname "$dest")"
      cp -a "$f" "$dest"
      restored=$((restored + 1))
    fi
  done < <(find "$stage" -type f ! -name MIGRATION_MANIFEST.txt)

  # SSH 権限の正規化 (緩いと ssh が鍵を拒否する)
  if [ -d "$HOME/.ssh" ]; then
    chmod 700 "$HOME/.ssh"
    find "$HOME/.ssh" -type f ! -name '*.pub' -exec chmod 600 {} +
    find "$HOME/.ssh" -type f -name '*.pub' -exec chmod 644 {} +
    ok "~/.ssh の権限を正規化 (700 / 600 / pub=644)"
  fi

  ok "展開: ${restored} ファイル (スキップ: ${skipped})"
  if [ -f "$stage/MIGRATION_MANIFEST.txt" ]; then
    echo
    info "旧マシンの push 漏れ manifest:"
    cat "$stage/MIGRATION_MANIFEST.txt"
  fi
  cat <<'EOS'

次の一歩:
  bash scripts/setup-linux.sh --verify   # 開発環境セットアップ + 品質ゲート
  bash scripts/setup-linux.sh --doctor   # 環境診断のみ
EOS
}

case "$MODE" in
  backup)  do_backup "$@" ;;
  restore) do_restore "$@" ;;
  *) usage ;;
esac
