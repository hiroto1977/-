#!/usr/bin/env bash
# Reassemble the AppImage from dist-chunks/part-* into
# release/Service Hub-0.1.0.AppImage and verify SHA256.
#
# Usage:
#   bash scripts/assemble-appimage.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHUNK_DIR="$ROOT/dist-chunks"
OUT_DIR="$ROOT/release"
OUT="$OUT_DIR/Service Hub-0.1.0.AppImage"
EXPECTED_SHA256="34f7ac0f0b5f452651b994477a36dd389717b0d55fcdf58bbb9374cdf6b81d73"

if [ ! -d "$CHUNK_DIR" ]; then
  echo "error: $CHUNK_DIR not found. run from a checkout of the feature branch." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
cat "$CHUNK_DIR"/part-* > "$OUT"
chmod +x "$OUT"

if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$OUT" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "$OUT" | awk '{print $1}')"
else
  echo "warning: no sha256 tool found; skipping verification" >&2
  actual=""
fi

if [ -n "$actual" ] && [ "$actual" != "$EXPECTED_SHA256" ]; then
  echo "error: SHA256 mismatch" >&2
  echo "  expected: $EXPECTED_SHA256" >&2
  echo "  actual:   $actual" >&2
  exit 1
fi

size="$(wc -c < "$OUT")"
echo "ok: assembled $OUT ($size bytes)"
echo
echo "to launch:"
echo "  \"$OUT\"            # AppImage handles FUSE mounting itself"
echo "  or extract first:"
echo "  \"$OUT\" --appimage-extract && ./squashfs-root/AppRun"
