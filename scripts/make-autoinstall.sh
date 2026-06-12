#!/usr/bin/env bash
# Service Hub — Ubuntu 無人インストール (autoinstall) 設定の生成
# (docs/LINUX_MIGRATION.md フェーズ2)
#
# Ubuntu 24.04 LTS のインストーラーは cloud-init NoCloud 形式の
# autoinstall 設定 (user-data / meta-data) を読み込み、言語・キーボード・
# ユーザー作成・パッケージ導入までを無人で実行できる。このスクリプトは
# その設定一式を生成する:
#
#   bash scripts/make-autoinstall.sh --user hiroto --hostname dev-linux [--out DIR]
#
# 生成物 (既定: ./autoinstall-usb/):
#   user-data   — autoinstall 本体 (日本語ロケール / JP キーボード /
#                 ibus-mozc・git・curl 導入 / 指定ユーザー)
#   meta-data   — 空ファイル (NoCloud 形式で必須)
#   README.txt  — USB への配置手順
#
# 使い方 (生成後):
#   1. ライブ USB とは別の USB メモリを FAT32 でフォーマットし、
#      ボリュームラベルを CIDATA にする
#   2. user-data / meta-data をそのルートにコピー
#   3. ライブ USB + CIDATA USB の両方を挿して起動すると、インストーラーが
#      設定を検出する (上書き確認が 1 回表示される場合がある)
#
# 注意: パスワードは SHA-512 ハッシュ (openssl passwd -6) で埋め込まれ、
#       平文はどこにも保存されない。生成された user-data もハッシュを含む
#       ため取り扱いに注意 (リポジトリにコミットしないこと)。

set -euo pipefail

info() { printf '\033[1;34m[auto]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ ok ]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

USERNAME=""
HOSTNAME_=""
OUT="./autoinstall-usb"
while [ $# -gt 0 ]; do
  case "$1" in
    --user)     USERNAME="${2:?--user requires NAME}"; shift 2 ;;
    --hostname) HOSTNAME_="${2:?--hostname requires NAME}"; shift 2 ;;
    --out)      OUT="${2:?--out requires DIR}"; shift 2 ;;
    *) die "unknown option: $1 (supported: --user / --hostname / --out)" ;;
  esac
done
[ -n "$USERNAME" ] || die "--user を指定してください (例: --user hiroto)"
[ -n "$HOSTNAME_" ] || HOSTNAME_="${USERNAME}-linux"
echo "$USERNAME" | grep -Eq '^[a-z_][a-z0-9_-]*$' || die "ユーザー名が不正です: $USERNAME"

command -v openssl >/dev/null 2>&1 || die "openssl が必要です (パスワードハッシュ生成に使用)"

# パスワードは echo されない。確認のため 2 回入力。
printf '新マシンのログインパスワード: '
read -rs pw1; echo
printf 'もう一度: '
read -rs pw2; echo
[ "$pw1" = "$pw2" ] || die "パスワードが一致しません"
[ "${#pw1}" -ge 8 ] || die "パスワードは 8 文字以上にしてください"
hash="$(openssl passwd -6 "$pw1")"
unset pw1 pw2

mkdir -p "$OUT"
umask 077

cat > "$OUT/user-data" <<EOF
#cloud-config
# Ubuntu autoinstall — Service Hub 開発マシン (scripts/make-autoinstall.sh 生成)
autoinstall:
  version: 1
  locale: ja_JP.UTF-8
  keyboard:
    layout: jp
  identity:
    hostname: ${HOSTNAME_}
    username: ${USERNAME}
    password: "${hash}"
  timezone: Asia/Tokyo
  updates: security
  packages:
    - git
    - curl
    - ibus-mozc
  late-commands:
    - echo 'autoinstall done' > /target/var/log/service-hub-autoinstall.log
EOF

: > "$OUT/meta-data"

cat > "$OUT/README.txt" <<EOF
Ubuntu 無人インストール用 USB の作り方
======================================
1. ライブ USB とは別の USB メモリを FAT32 でフォーマットし、
   ボリュームラベルを CIDATA にする (大文字)
2. この user-data と meta-data の 2 ファイルをルート直下にコピー
3. ライブ USB と CIDATA USB の両方を挿して新マシンを USB ブート
   → インストーラーが autoinstall 設定を検出する
   (ディスク消去の最終確認が 1 回表示される場合がある)
4. 完了後のログイン: ユーザー ${USERNAME} / 設定したパスワード
5. ログイン後:
     git clone <リポジトリ URL> service-hub && cd service-hub
     bash scripts/migrate.sh restore <アーカイブ>
     bash scripts/setup-linux.sh --verify

⚠ user-data はパスワードハッシュを含む。リポジトリにコミットしないこと。
EOF

ok "生成完了: $OUT/{user-data,meta-data,README.txt}"
info "次の一歩: $OUT/README.txt の手順で CIDATA USB を作成"
