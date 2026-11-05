# ローカル LLM 開発環境のセットアップ (Linux)

`npm run local-llm:setup` は、Ollama・VS Code・Continue・llama.cpp と、安全に使えるモデルを順に整える。
**既定は計画の表示だけ**で、`--yes` を付けたときだけ変更する。

```bash
npm run local-llm:setup                       # 計画を表示 (何も変えない)
npm run local-llm:setup -- --yes              # 導入する
npm run local-llm:setup -- --check            # 今の状態だけ報告
npm run local-llm:setup -- --yes --skip llamacpp,vscode
npm run local-llm:setup -- --tier large       # メモリの自動判定を上書き
```

## 何が入るか

| 部品 | 入れ方 | 守り |
| --- | --- | --- |
| Ollama | 既存の `scripts/ollama-setup.sh` (公式の導入 → 起動 → 1 往復) | 床 `0.31.2` 以上 (`src/shared/ollama.ts` の台帳の最大 `fixedIn` と一致を検査) |
| モデル | `ollama pull` (公式ライブラリのタグだけ) | 出所の分からない GGUF は取らない |
| VS Code | snap (無ければ公式の案内を表示) | — |
| Continue | `code --install-extension Continue.continue` と `~/.continue/config.yaml` | 接続先は `127.0.0.1` のみ・既存の設定は上書きしない |
| llama.cpp | 公式リポジトリの最新 `bNNNN` タグをソースから組む → `~/.local/bin/llama-server` | 床 `b8146` 以上 (GGUF 読み込みの整数オーバーフロー CVE-2026-27940 / CVE-2026-33298 の修正以降) |

### モデルの層 (メモリで自動選択)

モデルが載る量は、GPU があれば VRAM、無ければ RAM の 6 割。

| 層 | 量 | チャット/編集 | 補完 | 検索 (embed) |
| --- | --- | --- | --- | --- |
| small | 6 GB 未満 | `qwen2.5-coder:3b` | `qwen2.5-coder:1.5b` | `nomic-embed-text` |
| medium | 6–12 GB | `qwen2.5-coder:7b` | 同上 | 同上 |
| large | 12–24 GB | `qwen2.5-coder:14b` | 同上 | 同上 |
| xlarge | 24 GB 以上 | `qwen2.5-coder:32b` | 同上 | 同上 |

> 2026 年に出た新しい世代 (Qwen3 Coder など) の方が性能は上と報じられているが、このスクリプトは**タグの実在を確かめられた
> 安定した系列**だけを既定にしている。新しい世代は `ollama pull <タグ>` と `~/.continue/config.yaml` の `model:` を書き換えて試す。
> タグが無ければ導入は止まらず、警告だけ出して続ける (別名を推測しない)。

## 自動導入しないもの

- **Jan / LM Studio**: Linux では AppImage / .deb の配布で、このスクリプトが署名やチェックサムを検証できない。検証できない
  実行ファイルを黙って走らせない (規則 7) ので案内だけ出す。入れたら、接続先に Ollama の OpenAI 互換
  `http://127.0.0.1:11434/v1` を指定する。各アプリのローカル API も `127.0.0.1` のままにする。
- **Windows / macOS**: このスクリプトは Linux 専用。Windows は WSL2 の中で同じコマンドを実行する。

## 安全の規則 (スクリプトの冒頭にも同じ文)

1. 既定は計画の表示のみ。
2. 待ち受けは `127.0.0.1` だけ。`OLLAMA_HOST` が外向きなら中止する (認証の無い API を LAN に出さない)。
3. Ollama / llama.cpp は修正版の床以上だけ。
4. モデルは公式ライブラリのタグだけ。
5. 既存の Continue 設定は上書きしない (`config.local-llm.yaml` を隣に置く)。
6. 署名を検証できない配布物は実行しない。

Continue のテレメトリは VS Code の設定 `continue.telemetryEnabled` を `false` にする (自動では書き換えない)。

## 検証

導入そのものは利用者の機械でしか走らせられない。`src/shared/__tests__/localLlmSetup.test.ts` は、床が台帳と一致すること・
`--yes` 無しで何も変えないこと・外向きの `OLLAMA_HOST` で始めないこと・`127.0.0.1` 以外を設定に書かないことを毎回の
`npm test` で見る。
