#!/usr/bin/env bash
# この box は PID 1 が tini で systemd / cron が使えないため、
# シェル起動時 (~/.bashrc, ~/.profile) にこのフックを呼び、
# 再起動後の最初のシェルで start-all.sh --watch をバックグラウンド起動する。
# 監視ループが既に動いていれば何もしない（flock で判定）。
#   インストール: ./autostart-hook.sh install    解除: ./autostart-hook.sh uninstall
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
LINE="[ -x $HERE/autostart-hook.sh ] && $HERE/autostart-hook.sh run >/dev/null 2>&1  # local-ai autostart"
case "${1:-run}" in
  install) for f in ~/.bashrc ~/.profile; do grep -q "local-ai autostart" "$f" 2>/dev/null || echo "$LINE" >>"$f"; done; echo installed ;;
  uninstall) for f in ~/.bashrc ~/.profile; do [ -f "$f" ] && sed -i '/local-ai autostart/d' "$f" || true; done; echo uninstalled ;;
  run) flock -n /tmp/local-ai-start-all.lock true || exit 0
       setsid nohup "$HERE/start-all.sh" --watch >/dev/null 2>&1 < /dev/null & ;;
esac
