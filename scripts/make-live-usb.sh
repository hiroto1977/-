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
#   1. デバイスはブロックデバイスであること
#   2. リムーバブル (RM=1) であること (--force-non-removable で明示上書き可 —
#      USB-NVMe エンクロージャ等が non-removable を名乗る場合のみ使う)
#   3. マウント中のパーティションを含むデバイスは拒否 (システムディスク誤爆防止)
#   4. 書き込み直前にデバイス名の再入力による確認 (--dry-run では何も書かない)
#
# 旧マシンが Windows の場合は WSL から実行するか、Rufus / balenaEtcher を使う。

set -euo pipefail

RELEASE_URL="https://releases.ubuntu.com/24.04"
DOWNLOAD_DIR="${HOME}/Downloads"

info() { printf '\033[1;34m[usb ]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ ok ]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

DEVICE=""
ISO=""
DRY_RUN=0
FORCE_NON_REMOVABLE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --device) DEVICE="${2:?--device requires /dev/sdX}"; shift 2 ;;
    --iso)    ISO="${2:?--iso requires FILE}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --force-non-removable) FORCE_NON_REMOVABLE=1; shift ;;
    *) die "unknown option: $1 (supported: --device / --iso / --dry-run / --force-non-removable)" ;;
  esac
done

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
DEVNAME="$(basename "$DEVICE")"

removable="$(cat "/sys/block/$DEVNAME/removable" 2>/dev/null || echo 0)"
if [ "$removable" != "1" ] && [ "$FORCE_NON_REMOVABLE" != "1" ]; then
  die "$DEVICE はリムーバブルではありません。内蔵ディスクの可能性があるため拒否します
       (USB エンクロージャ等で確信がある場合のみ --force-non-removable)"
fi

if grep -q "^$DEVICE" /proc/mounts; then
  die "$DEVICE のパーティションがマウント中です。umount してから再実行してください"
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
