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
EXPECTED_SHA256="829db59e883c7b753debf97f638bdc752fb0661152522cd2a1f0c47222184cbf"

if [ ! -d "$CHUNK_DIR" ]; then
  echo "error: $CHUNK_DIR not found. run from a checkout of the feature branch." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
cat "$CHUNK_DIR"/part-* > "$OUT"
# NOTE: do NOT chmod +x yet — verify the SHA256 first so a tampered
# binary never sits on disk in an executable state.

if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$OUT" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "$OUT" | awk '{print $1}')"
else
  echo "error: no sha256 tool found (sha256sum / shasum). refusing to install an unverifiable binary." >&2
  rm -f "$OUT"
  exit 2
fi

if [ "$actual" != "$EXPECTED_SHA256" ]; then
  echo "error: SHA256 mismatch — refusing to chmod" >&2
  echo "  expected: $EXPECTED_SHA256" >&2
  echo "  actual:   $actual" >&2
  rm -f "$OUT"
  exit 1
fi

# Only now is the file marked executable.
chmod +x "$OUT"

size="$(wc -c < "$OUT")"
echo "ok: assembled $OUT ($size bytes)"
echo
echo "to launch:"
echo "  \"$OUT\"            # AppImage handles FUSE mounting itself"
echo "  or extract first:"
echo "  \"$OUT\" --appimage-extract && ./squashfs-root/AppRun"
