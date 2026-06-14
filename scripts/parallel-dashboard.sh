#!/usr/bin/env bash
# Service Hub — 並列処理ダッシュボード (Linux 端末の tmux マルチペイン可視化)
#
# Linux 上で並列に動いている作業の様子を、tmux で画面を分割して一覧表示し、
# 各ペインを独立してスクロールできるようにする「スモールスタート」スクリプト。
#
#   bash scripts/parallel-dashboard.sh [--session NAME] [PANE ...]
#
# 各 PANE 引数は1つのペインになる:
#   - 既存ファイルパス  → そのログを `tail -F` で追尾表示
#   - それ以外の文字列  → シェルコマンドとして約2秒間隔で繰り返し実行 (watch 風)
#
# 引数を省略すると、このリポジトリの並列ワークフロー向けの既定4ペインを表示する:
#   (1) 直近のコミット/マージ (git log)   (2) 学術概念の件数の推移
#   (3) システム負荷 (uptime / メモリ)     (4) 対話用シェル
#
# スクロール操作: マウスホイールで、カーソルのあるペインを独立してスクロール
# (tmux のコピーモードに入る)。キーボードなら  Ctrl-b [  でコピーモード →
# 矢印 / PageUp/PageDown でスクロール、q で抜ける。ペイン移動は Ctrl-b o。
# 終了は  Ctrl-b & → y  または `tmux kill-session -t <session>`。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION="parallel-dash"
PANES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --session) SESSION="${2:-parallel-dash}"; shift 2 ;;
    -h|--help) sed -n '2,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) PANES+=("$1"); shift ;;
  esac
done

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux が見つかりません。導入してください: 例) sudo apt-get install -y tmux" >&2
  exit 1
fi

# 既定ペイン (引数なしのとき): このリポジトリの並列ワークフローを可視化
if [[ ${#PANES[@]} -eq 0 ]]; then
  PANES=(
    "cd '$ROOT' && git log --oneline -12 --decorate"
    "printf '学術概念 件数: '; grep -c \"id: '\" '$ROOT/src/renderer/data/academicKnowledge.ts'"
    "uptime; echo; (free -h 2>/dev/null | head -2) || true"
    "cd '$ROOT' && exec \${SHELL:-bash}"
  )
fi

# 各ペインに与えるコマンドを組み立てる。
# ファイルなら tail -F、コマンドなら 2 秒間隔ループ(watch があれば watch)。
pane_command() {
  local spec="$1"
  if [[ -f "$spec" ]]; then
    printf 'tail -n 200 -F %q' "$spec"
  elif [[ "$spec" == *"exec "* ]]; then
    # 対話シェル等はそのまま実行
    printf '%s' "$spec"
  elif command -v watch >/dev/null 2>&1; then
    printf 'watch -t -n 2 -- bash -lc %q' "$spec"
  else
    printf 'while true; do clear; bash -lc %q; sleep 2; done' "$spec"
  fi
}

# 既存セッションがあれば作り直す
tmux has-session -t "$SESSION" 2>/dev/null && tmux kill-session -t "$SESSION"

# 1ペイン目を作成し、以降を split-window で追加 → タイル状に整列
first="$(pane_command "${PANES[0]}")"
# 大きめの既定サイズで作成 (デタッチ状態でも全ペインがタイル配置できるように)。
# アタッチ時は端末サイズに自動追従する。
tmux new-session -d -s "$SESSION" -n monitor -x 220 -y 50 "$first"
# コマンドが終了してもペインを閉じない (ダッシュボードのペインが消えないように)。
# 終了したペインは [dead] 表示になり、Ctrl-b + で再実行できる。
tmux set-option -t "$SESSION" remain-on-exit on >/dev/null

idx=1
while [[ $idx -lt ${#PANES[@]} ]]; do
  tmux split-window -t "$SESSION" "$(pane_command "${PANES[$idx]}")"
  tmux select-layout -t "$SESSION" tiled >/dev/null
  idx=$((idx + 1))
done
tmux select-layout -t "$SESSION" tiled >/dev/null

# 各ペインを独立スクロール可能に: マウス有効化 + 大きめのスクロールバック
tmux set-option -t "$SESSION" mouse on >/dev/null
tmux set-option -t "$SESSION" history-limit 20000 >/dev/null
tmux set-option -t "$SESSION" pane-border-status top >/dev/null 2>&1 || true
tmux select-pane -t "$SESSION".0 >/dev/null

echo "tmux セッション '$SESSION' を起動しました。"
echo "アタッチ: tmux attach -t $SESSION   /   スクロール: マウスホイール または Ctrl-b ["

# 端末(TTY)があればそのままアタッチ。なければ案内のみ。
if [[ -t 1 ]]; then
  exec tmux attach -t "$SESSION"
fi
