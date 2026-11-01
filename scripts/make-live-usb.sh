#!/usr/bin/env bash
# Service Hub — Ubuntu ライブ USB 作成 (docs/LINUX_MIGRATION.md フェーズ1)
#
# Ubuntu 24.04 LTS desktop ISO のダウンロード・SHA256 検証・USB 書き込みを
# 1 コマンドに自動化する。書き込みはディスクを完全消去するため、
# 多重の安全ガードを通らない限り実行されない。
#
# Usage:
#   bash scripts/make-live-usb.sh                       # 候補 USB デバイス一覧を表示して終了
#   bash scripts/make-live-usb.sh --device /dev/sdX     # ISO 取得+検証+書き込み
#   bash scripts/make-live-usb.sh --device /dev/sdX --iso ~/Downloads/ubuntu.iso
#   bash scripts/make-live-usb.sh --device /dev/sdX --dry-run   # 実行内容の確認のみ
#
# 安全ガード:
#   0. --device を正規化する (readlink -f)。/dev/disk/by-id/… のような
#      シンボリックリンクのままだと、以下のガードが軒並み効かない
#   1. デバイスはブロックデバイスであること
#   2. **稼働中のシステムを載せているディスクは、いかなる場合も拒否**
#      (/ ・/boot ・/boot/efi の載る物理ディスクを LVM / LUKS を辿って解決する)。
#      --force-non-removable でも外れない
#   3. リムーバブル (RM=1) であること (--force-non-removable で明示上書き可 —
#      USB-NVMe エンクロージャ等が non-removable を名乗る場合のみ使う)
#   4. デバイス配下 (子パーティション・dm ホルダ含む) にマウント中の物が無いこと
#   5. 書き込み直前にデバイス名の再入力による確認 (--dry-run では何も書かない)
#
# 2026-08-26 の実測で、旧ガード 3 (`grep "^$DEVICE" /proc/mounts`) は
# **謳っていた「システムディスク誤爆防止」をしていなかった**:
#
#   - LUKS / by-uuid 構成では / も /boot も /proc/mounts に `/dev/sda…` として
#     現れない (`/dev/mapper/cryptroot` と `/dev/disk/by-uuid/…`) ので、
#     `/dev/sda` を撃っても素通りした
#   - `/dev/disk/by-id/…` を渡すと、/proc/mounts はカーネル名を載せているので
#     **どんな構成でも**一致せず素通りした
#
# どちらも「リムーバブルでない」ガードが受け止めていたが、そのガードは
# 上の行が利用者に外させている当のものである。**外させるガードに、別の
# ガードの仕事を負わせていた。** 稼働中のシステムディスクという事実は
# ヒューリスティックではないので、force では外れない位置へ移した。
#
# 判定は注入できる形 (`device_refusal_reason`) に切り出してあり、
# `bash scripts/make-live-usb.sh --self-test` で合成を流して確かめられる。
#
# 旧マシンが Windows の場合は WSL から実行するか、Rufus / balenaEtcher を使う。

set -euo pipefail

RELEASE_URL="https://releases.ubuntu.com/24.04"
DOWNLOAD_DIR="${HOME}/Downloads"

info() { printf '\033[1;34m[usb ]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ ok ]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 判定 (注入できる形)
#
# ここを純粋にしておく理由は 1 つ ——**このスクリプトはリポジトリで最も
# 破壊的な行を持っており、それまで挙動の検査が 1 件も無かった** (`lint:shell`
# は `bash -n` と strict mode しか見ない)。合成を流して確かめられなければ、
# ガードが効いているかどうかは「読んで納得した」以上にならない。
# ---------------------------------------------------------------------------

# シンボリックリンクを実体へ。`/dev/disk/by-id/…` のままだと
# /proc/mounts (カーネル名) とも /sys/block とも一致しない。
canonical_device() { readlink -f "$1" 2>/dev/null || printf '%s' "$1"; }

# / ・/boot ・/boot/efi を載せている**物理ディスク名**を列挙する。
# `lsblk -s` は依存を逆向きに辿るので、LVM (dm → パーティション → ディスク) も
# LUKS も通り抜けられる。最後に出る名前が物理ディスク。
system_disk_names() {
  local mp src
  for mp in / /boot /boot/efi; do
    src="$(findmnt -no SOURCE "$mp" 2>/dev/null || true)"
    [ -n "$src" ] || continue
    lsblk -nsro NAME "$src" 2>/dev/null || true
  done | sort -u
}

# デバイス配下 (子パーティション・dm ホルダを含む) のマウント点。
# 空行は「マウントされていない行」なので落とす。
device_mountpoints() {
  local dev="$1" out
  out="$(lsblk -nro MOUNTPOINTS "$dev" 2>/dev/null || lsblk -nro MOUNTPOINT "$dev" 2>/dev/null || true)"
  printf '%s\n' "$out" | grep -v '^[[:space:]]*$' || true
}

# 拒否すべき理由を stdout へ出し 0 を返す。通してよければ何も出さず 1 を返す。
#
#   $1 正規化済みデバイス (例 /dev/sda)
#   $2 システムディスク名の一覧 (改行区切り・カーネル名。例 "sda")
#   $3 そのデバイス配下のマウント点 (改行区切り)
#   $4 /proc/mounts の中身 (旧ガード。lsblk が無い環境の保険)
#
# **`--force-non-removable` はここへ渡さない。** システムディスクであることは
# ヒューリスティックではなく事実なので、上書きさせる余地を作らない。
device_refusal_reason() {
  local dev="$1" sysdisks="$2" mounts="$3" procmounts="$4"
  local devname; devname="$(basename "$dev")"

  if printf '%s\n' "$sysdisks" | grep -qx -- "$devname"; then
    printf '%s は稼働中のシステム (/ ・/boot ・/boot/efi) を載せているディスクです。書き込めば起動しなくなります' "$dev"
    return 0
  fi
  if [ -n "$mounts" ]; then
    printf '%s の配下にマウント中の領域があります: %s — umount してから再実行してください' \
      "$dev" "$(printf '%s' "$mounts" | tr '\n' ' ')"
    return 0
  fi
  if printf '%s\n' "$procmounts" | grep -q -- "^$dev"; then
    printf '%s のパーティションがマウント中です。umount してから再実行してください' "$dev"
    return 0
  fi
  return 1
}

DEVICE=""
ISO=""
DRY_RUN=0
FORCE_NON_REMOVABLE=0
SELF_TEST=0
while [ $# -gt 0 ]; do
  case "$1" in
    --device) DEVICE="${2:?--device requires /dev/sdX}"; shift 2 ;;
    --iso)    ISO="${2:?--iso requires FILE}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --force-non-removable) FORCE_NON_REMOVABLE=1; shift ;;
    --self-test) SELF_TEST=1; shift ;;
    *) die "unknown option: $1 (supported: --device / --iso / --dry-run / --force-non-removable / --self-test)" ;;
  esac
done

# ---------------------------------------------------------------------------
# self-test —— 合成を流して、ガードが**実際に**その入力で鳴ることを見る
#
# 陽性 (鳴るべき) と陰性 (鳴ってはいけない) を両方置く。陰性が無いと
# 「常に拒否する」実装でも全部通ってしまう。
# ---------------------------------------------------------------------------
if [ "$SELF_TEST" = "1" ]; then
  st_bad=0
  st_case() { # $1 ラベル / $2 期待 (deny|allow) / $3.. 引数
    local label="$1" want="$2"; shift 2
    local got reason
    if reason="$(device_refusal_reason "$@")"; then got="deny"; else got="allow"; reason="(通す)"; fi
    if [ "$got" = "$want" ]; then
      printf '  \033[1;32m✓\033[0m %s: %s\n' "$label" "$got"
    else
      printf '  \033[1;31m✗\033[0m %s: %s (期待 %s) — %s\n' "$label" "$got" "$want" "$reason"
      st_bad=$((st_bad + 1))
    fi
  }

  # 2026-08-26 に旧実装で実測した 2 つの素通り。どちらもここで鳴らねばならない。
  st_case 'LUKS+by-uuid のシステムディスクを撃つ (旧実装は素通りした)' deny \
    /dev/sda 'sda' '' '/dev/mapper/cryptroot / ext4 rw 0 0'
  st_case 'by-id で指したシステムディスク (正規化後・旧実装は素通りした)' deny \
    /dev/sda 'sda' '' '/dev/sda2 /boot ext4 rw 0 0'

  st_case 'LVM のシステムディスク (dm を辿って解決)' deny \
    /dev/nvme0n1 'nvme0n1' '' '/dev/mapper/ubuntu--vg-ubuntu--lv / ext4 rw 0 0'
  st_case '配下にマウント中の領域がある' deny \
    /dev/sdb 'sda' '/media/user/USB' ''
  st_case '旧ガード (lsblk が無くても /proc/mounts で拾う)' deny \
    /dev/sdb 'sda' '' '/dev/sdb1 /mnt ext4 rw 0 0'

  # --- 陰性対照 ---
  st_case '陰性: 未マウントの外付け USB は通す' allow \
    /dev/sdb 'sda' '' '/dev/sda2 /boot ext4 rw 0 0'
  st_case '陰性: 名前の前方一致で巻き込まない (sda ≠ sdb)' allow \
    /dev/sdb 'sda' '' '/dev/sda1 / ext4 rw 0 0'
  # `grep -qx` の `-x` を留める。**外すと誤って拒否する側へ倒れる** ——
  # 安全側ではあるが、正しい USB を「システムディスクだ」と言って断るのは
  # 利用者にとってはただの故障で、--force を探しに行かせる分むしろ危ない。
  # (最初に書いた 'sd' vs 'sdb' の対照は -x を外しても鳴らなかった。
  #  藁と針が逆で、あの向きでは -x が働く余地が無い。)
  st_case '陰性: devname がシステムディスク名の一部でも拒否しない (sda ⊂ sdaa)' allow \
    /dev/sda 'sdaa' '' ''
  st_case '陰性: マウント点が空白だけの行は無視' allow \
    /dev/sdb 'sda' '' ''

  # --- 正規化そのもの ---
  if [ "$(canonical_device /dev/null)" = "/dev/null" ]; then
    printf '  \033[1;32m✓\033[0m canonical_device: 実体パスはそのまま\n'
  else
    printf '  \033[1;31m✗\033[0m canonical_device: 実体パスを変えた\n'; st_bad=$((st_bad + 1))
  fi
  st_link="$(mktemp -u)"; ln -s /dev/null "$st_link"
  if [ "$(canonical_device "$st_link")" = "/dev/null" ]; then
    printf '  \033[1;32m✓\033[0m canonical_device: シンボリックリンクを実体へ解決\n'
  else
    printf '  \033[1;31m✗\033[0m canonical_device: リンクを解決していない\n'; st_bad=$((st_bad + 1))
  fi
  rm -f "$st_link"

  if [ "$st_bad" -gt 0 ]; then die "self-test 不一致 $st_bad 件"; fi
  ok "self-test 全件一致"
  exit 0
fi

# ---------------------------------------------------------------------------
# デバイス未指定 → 候補一覧を表示して終了 (何も変更しない)
# ---------------------------------------------------------------------------
if [ -z "$DEVICE" ]; then
  info "書き込み先デバイスを --device で指定してください。候補 (RM=1 がリムーバブル):"
  lsblk -d -o NAME,SIZE,RM,TYPE,MODEL | sed 's/^/  /'
  echo
  info "例: bash scripts/make-live-usb.sh --device /dev/sdX"
  exit 0
fi

# ---------------------------------------------------------------------------
# 安全ガード
# ---------------------------------------------------------------------------
[ -b "$DEVICE" ] || die "ブロックデバイスではありません: $DEVICE"

# ガード 0 —— **他の全ガードがこれに依存している。**
RAW_DEVICE="$DEVICE"
DEVICE="$(canonical_device "$DEVICE")"
[ "$DEVICE" = "$RAW_DEVICE" ] || info "デバイスを実体へ解決: $RAW_DEVICE → $DEVICE"
DEVNAME="$(basename "$DEVICE")"

# ガード 2 —— 稼働中のシステムディスク。force では外れない。
# ガード 4 —— 配下のマウント (旧 /proc/mounts の前方一致も保険として残す)。
if refusal="$(device_refusal_reason \
      "$DEVICE" "$(system_disk_names)" "$(device_mountpoints "$DEVICE")" "$(cat /proc/mounts)")"; then
  die "$refusal"
fi

# ガード 3 —— リムーバブル。ここだけが --force-non-removable で緩む。
removable="$(cat "/sys/block/$DEVNAME/removable" 2>/dev/null || echo 0)"
if [ "$removable" != "1" ] && [ "$FORCE_NON_REMOVABLE" != "1" ]; then
  die "$DEVICE はリムーバブルではありません。内蔵ディスクの可能性があるため拒否します
       (USB エンクロージャ等で確信がある場合のみ --force-non-removable)"
fi

size_gb="$(( $(cat "/sys/block/$DEVNAME/size" 2>/dev/null || echo 0) * 512 / 1024 / 1024 / 1024 ))"
[ "$size_gb" -ge 6 ] || warn "デバイス容量 ${size_gb}GB — Ubuntu ISO には 6GB 以上を推奨"

# ---------------------------------------------------------------------------
# ISO 取得 + SHA256 検証
# ---------------------------------------------------------------------------
if [ -z "$ISO" ]; then
  info "SHA256SUMS を取得して desktop-amd64 の最新ポイントリリース名を解決..."
  sums="$(curl -fsSL "$RELEASE_URL/SHA256SUMS")"
  iso_name="$(echo "$sums" | grep -o 'ubuntu-24\.04[0-9.]*-desktop-amd64\.iso' | head -1)"
  [ -n "$iso_name" ] || die "SHA256SUMS から desktop ISO 名を解決できません"
  ISO="$DOWNLOAD_DIR/$iso_name"
  mkdir -p "$DOWNLOAD_DIR"
  info "ダウンロード (再開可能): $RELEASE_URL/$iso_name → $ISO"
  if [ "$DRY_RUN" = "1" ]; then
    info "(dry-run) curl -fL -C - -o $ISO $RELEASE_URL/$iso_name"
  else
    curl -fL -C - -o "$ISO" "$RELEASE_URL/$iso_name"
    info "SHA256 検証中..."
    expected="$(echo "$sums" | grep " \*$iso_name\$" | awk '{print $1}')"
    actual="$(sha256sum "$ISO" | awk '{print $1}')"
    [ "$expected" = "$actual" ] || die "SHA256 不一致 — ダウンロード破損の可能性。ISO を削除して再実行してください
       expected: $expected
       actual:   $actual"
    ok "SHA256 検証 OK"
  fi
else
  [ -f "$ISO" ] || die "ISO が見つかりません: $ISO"
  warn "--iso 指定のため SHA256 検証をスキップ (公式 SHA256SUMS との照合を推奨)"
fi

# ---------------------------------------------------------------------------
# 書き込み (最終確認 → dd)
# ---------------------------------------------------------------------------
echo
warn "$DEVICE (${size_gb}GB) の内容は完全に消去されます。"
lsblk "$DEVICE" -o NAME,SIZE,FSTYPE,LABEL,MOUNTPOINT 2>/dev/null | sed 's/^/  /' || true

if [ "$DRY_RUN" = "1" ]; then
  info "(dry-run) sudo dd if=$ISO of=$DEVICE bs=4M status=progress conv=fsync"
  ok "(dry-run) ここまで全ガードを通過 — 実行する場合は --dry-run を外す"
  exit 0
fi

printf '本当に書き込むならデバイス名 (%s) をもう一度入力: ' "$DEVICE"
read -r confirm
[ "$confirm" = "$DEVICE" ] || die "確認入力が一致しません — 中止しました"

SUDO="sudo"
if [ "$(id -u)" = "0" ]; then SUDO=""; fi
info "書き込み中 (数分かかります)..."
$SUDO dd if="$ISO" of="$DEVICE" bs=4M status=progress conv=fsync
sync
ok "完了。USB を新マシンに挿し、起動時に F12/F2 等でブートメニューから USB を選択してください。"
info "無人インストールにする場合: bash scripts/make-autoinstall.sh (docs/LINUX_MIGRATION.md フェーズ2)"
