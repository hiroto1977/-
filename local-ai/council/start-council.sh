#!/usr/bin/env bash
# ローカルAI評議会デーモンをバックグラウンド起動（冪等）
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if pgrep -f "council/council.py" >/dev/null; then echo "council は起動済み"; exit 0; fi
mkdir -p "$HERE/logs"
nohup nice -n 10 python3 "$HERE/council.py" >>"$HERE/logs/daemon.out" 2>&1 &
echo "council 起動 (http://127.0.0.1:${COUNCIL_PORT:-8091})"
