#!/usr/bin/env bash
# audit-export.sh — 監査ログ (本体 + 月次 .bak) を外部媒体にエクスポート
#
# 用途: 端末紛失/破損時の全消失リスクに対する オフライン バックアップ。
#       USB / 外付け SSD / 別端末 の任意のマウント先にアーカイブを出力する。
#
# 用法:
#   bash scripts/audit-export.sh /Volumes/USB/audit-bak
#   bash scripts/audit-export.sh ~/Desktop/audit-export
#
# 出力:
#   <dst>/audit-export-YYYYMMDDHHMMSS.tar.gz
#     ├─ audit.jsonl                       (現行)
#     ├─ audit-backups/audit.jsonl.bak.*   (月次 .bak 全て)
#     └─ audit-export-manifest.json        (sha256 + ファイル一覧)
#
# 取り込み 検証:
#   bash scripts/audit-verify.sh <展開先>/audit.jsonl
#   sha256sum -c <展開先>/audit-export-manifest.json (要 jq)

set -u
LANG=ja_JP.UTF-8

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$SCRIPT_DIR/lib/audit.sh" ]] && source "$SCRIPT_DIR/lib/audit.sh"
type audit_log >/dev/null 2>&1 || audit_log() { :; }
audit_log "audit_export.start" "args=$*"

if [[ -t 1 ]]; then
  C_OK="\033[1;32m"; C_NG="\033[1;31m"; C_W="\033[1;33m"; C_DIM="\033[2m"; C_RST="\033[0m"
else
  C_OK=""; C_NG=""; C_W=""; C_DIM=""; C_RST=""
fi

ok()   { echo -e "${C_OK}✅${C_RST} $*"; }
ng()   { echo -e "${C_NG}❌${C_RST} $*"; }
warn() { echo -e "${C_W}⚠️${C_RST}  $*"; }

# 引数 確認
if [[ $# -lt 1 ]]; then
  echo "用法: $0 <出力先 ディレクトリ>"
  echo ""
  echo "例:"
  echo "  $0 /Volumes/USB/audit-bak       (macOS USB)"
  echo "  $0 /media/\$USER/USB/audit-bak    (Linux USB)"
  echo "  $0 ~/Desktop/audit-export        (一旦デスクトップ → 後で外部媒体へ)"
  exit 2
fi

DST="$1"
AUDIT_LOG_PATH="${AUDIT_LOG_PATH:-${HOME}/.claude/audit.jsonl}"
BAK_DIR="${HOME}/.claude/audit-backups"

# 出力先 確認
if ! mkdir -p "$DST" 2>/dev/null; then
  ng "出力先 ディレクトリを作成できない: $DST"
  audit_log "audit_export.fail" "reason=mkdir_failed dst=$DST"
  exit 1
fi

# ソース 存在 確認
if [[ ! -f "$AUDIT_LOG_PATH" ]]; then
  warn "audit.jsonl が存在しない: $AUDIT_LOG_PATH (空のエクスポートを作成)"
fi

TS=$(date +%Y%m%d%H%M%S)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# ファイルを集める
mkdir -p "$WORK/audit-export"
[[ -f "$AUDIT_LOG_PATH" ]] && cp -p "$AUDIT_LOG_PATH" "$WORK/audit-export/audit.jsonl"
if [[ -d "$BAK_DIR" ]]; then
  mkdir -p "$WORK/audit-export/audit-backups"
  # 月次 .bak をコピー (無くてもエラーにしない)
  shopt -s nullglob
  for f in "$BAK_DIR"/audit.jsonl.bak.*; do
    cp -p "$f" "$WORK/audit-export/audit-backups/"
  done
  shopt -u nullglob
fi

# manifest 生成
MANIFEST="$WORK/audit-export/audit-export-manifest.json"
{
  echo '{'
  echo '  "exported_at": "'$(date -Iseconds)'",'
  echo '  "host": "'$(hostname)'",'
  echo '  "user": "'$(whoami)'",'
  echo '  "files": ['
  first=1
  while IFS= read -r -d '' f; do
    rel="${f#$WORK/audit-export/}"
    [[ "$rel" == "audit-export-manifest.json" ]] && continue
    sha=$(sha256sum "$f" | awk '{print $1}')
    sz=$(wc -c < "$f")
    [[ "$first" -eq 1 ]] && first=0 || echo ','
    printf '    {"path": "%s", "size": %d, "sha256": "%s"}' "$rel" "$sz" "$sha"
  done < <(find "$WORK/audit-export" -type f -print0 | sort -z)
  echo ''
  echo '  ]'
  echo '}'
} > "$MANIFEST"

# tarball 作成
ARCHIVE="$DST/audit-export-${TS}.tar.gz"
if ! tar -C "$WORK" -czf "$ARCHIVE" audit-export; then
  ng "アーカイブ作成 失敗"
  audit_log "audit_export.fail" "reason=tar_failed dst=$DST"
  exit 1
fi

# サイズと sha256 を出力
ARCH_SHA=$(sha256sum "$ARCHIVE" | awk '{print $1}')
ARCH_SIZE=$(wc -c < "$ARCHIVE")
ok "エクスポート完了"
echo "    出力先: $ARCHIVE"
echo "    サイズ: $(numfmt --to=iec "$ARCH_SIZE" 2>/dev/null || echo "$ARCH_SIZE B")"
echo "    sha256: $ARCH_SHA"

# manifest を別ファイルとしても置く (アーカイブ展開不要で検証可能に)
cp "$MANIFEST" "$DST/audit-export-${TS}.manifest.json"
echo "    検証用 manifest: $DST/audit-export-${TS}.manifest.json"

audit_log "audit_export.done" "dst=$ARCHIVE sha256=$ARCH_SHA size=$ARCH_SIZE"

echo ""
echo -e "${C_DIM}次のステップ (推奨):${C_RST}"
echo "  1. 上記アーカイブを USB / 外付け SSD / 別端末 にコピー"
echo "  2. アンマウントして物理的に分離"
echo "  3. 取り込み時: tar -xzf <archive> && bash scripts/audit-verify.sh audit-export/audit.jsonl"
