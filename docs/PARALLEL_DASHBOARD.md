# 並列処理ダッシュボード（tmux マルチペイン可視化）

Linux 端末で、並列に動いている作業の様子を **画面分割で一覧表示** し、
**各ペインを独立してスクロール** できるようにする、スモールスタートの可視化ツール。
追加依存は tmux のみ。

## 使い方

```bash
# 既定の4ペイン（このリポジトリの並列ワークフロー向け）で起動
bash scripts/parallel-dashboard.sh

# 任意のログ/コマンドを各ペインに割り当てる（引数1つ＝1ペイン）
bash scripts/parallel-dashboard.sh \
  /var/log/worker-a.log \
  /var/log/worker-b.log \
  "docker ps" \
  "git -C . log --oneline -10"

# セッション名を指定
bash scripts/parallel-dashboard.sh --session mywork ./a.log ./b.log
```

各 `PANE` 引数の扱い:
- **既存ファイル** → `tail -F` でリアルタイム追尾。
- **それ以外の文字列** → シェルコマンドとして約2秒間隔で繰り返し実行（`watch` があれば `watch`、無ければループ）。

引数を省略したときの既定4ペイン:
1. 直近のコミット/マージ（`git log`）
2. 学術概念の件数（`academicKnowledge.ts` の件数）
3. システム負荷（`uptime` / メモリ）
4. 対話用シェル

## スクロール操作（各画面を独立して）

- **マウスホイール** … カーソルのあるペインだけを独立してスクロール（自動でコピーモードに入る）。
- **キーボード** … `Ctrl-b [` でコピーモード → 矢印 / `PageUp` `PageDown` でスクロール、`q` で抜ける。
- **ペイン移動** … `Ctrl-b o`（順送り）または `Ctrl-b` + 方向キー。
- **ズーム**（1ペインを全画面化/戻す） … `Ctrl-b z`。
- **終了** … `Ctrl-b &` → `y`、または `tmux kill-session -t parallel-dash`。

スクロールバックは1ペインあたり 20,000 行を保持する。コマンドが終了してもペインは
閉じず `[dead]` 表示で残るため（`remain-on-exit on`）、出力を後からスクロールして確認できる。
終了したペインは `Ctrl-b +` で再実行できる。

## 仕組み

`scripts/parallel-dashboard.sh` は tmux セッションを作成し、各 `PANE` を
`split-window` で追加して **タイル状レイアウト**（`select-layout tiled`）に整列する。
`mouse on` と `history-limit` の設定により、各ペインがそれぞれ独立してスクロール可能になる。
端末（TTY）があればそのままアタッチし、無い場合はアタッチ用コマンドを案内する。

> スクリプトは strict-mode（`set -euo pipefail`）で、CI の `lint:shell`（`bash -n` 構文検査 +
> strict-mode 検査）を通過する。tmux 未導入時は導入コマンドを案内して終了する（破壊的操作なし）。
