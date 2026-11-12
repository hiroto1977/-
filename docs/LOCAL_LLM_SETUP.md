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

## このリポジトリで学んだ規律を渡す (`npm run local-llm:handoff`)

`CLAUDE.md` は約 1.1 MB、`docs/SESSION_HANDOFF.md` と `docs/REMAINING_WORK.md` は各約 3 MB で、文脈 4K〜32K トークンのローカルモデルには**丸ごとは入らない**。
そこで「全部」ではなく**小さな文脈に畳んだ核**を、モデルの大きさ (tier) ごとの文字数予算に収めて出す。

```bash
npm run local-llm:handoff                      # 計画の表示だけ (何も書かない)
npm run local-llm:handoff -- --write           # reports/local-llm-handoff/ へ書く (tier 既定は medium)
npm run local-llm:handoff -- --write --tier large
```

| 出力 | 中身 |
| --- | --- |
| `SYSTEM.md` | 常駐させる核。規律 8 本・ローカルモデルとしての約束・作業の手順・既知の罠・実物から引いた事実 (サービス数・ゲート数・法則数・脅威台帳の件数)・読みに行く文書の道案内・余りの予算で法則の索引。**節は丸ごと入るか丸ごと外れる** (途中で切れた規則を残さない) |
| `Modelfile` | `FROM` は導入 script と同じ層のモデル・`num_ctx` は tier 別・`SYSTEM` に上の核 |
| `PLAYBOOK.md` | 手順・規律の詳細・罠 (RAG や Continue のルールに貼る用) |
| `laws-index.md` | 法則の id と名前の全件 (statement は `src/shared/ontology/laws.ts`) |
| `manifest.json` | tier・予算・入った節/入らなかった節・元ファイルと出力の sha256 |

| tier | モデル | `num_ctx` | SYSTEM の予算 |
| --- | --- | --- | --- |
| small | `qwen2.5-coder:3b` | 4096 | 2,400 字 (法則の索引なし) |
| medium | `qwen2.5-coder:7b` | 8192 | 6,000 字 |
| large | `qwen2.5-coder:14b` | 16384 | 14,000 字 |
| xlarge | `qwen2.5-coder:32b` | 32768 | 30,000 字 |

使い方 (このコマンドは自動では走らせない。出力の末尾にも同じ案内が出る):

```bash
ollama pull qwen2.5-coder:7b
cd reports/local-llm-handoff && ollama create service-hub-dev-medium -f Modelfile
ollama run service-hub-dev-medium
```

Continue など別のクライアントでは `SYSTEM.md` を system prompt に貼る (接続先は `127.0.0.1` のまま)。

守り: ネットワークに触らない・子プロセスを作らない・出力先はリポジトリの中だけ・既定は書かない・出力は決定論 (時刻を入れない)・
秘密の形を含まない。読めない物は 0 に倒さず「不明」と書く。規律の本文 (`CORE_RULES` ほか) は `scripts/lib/local-llm-handoff.cjs` に
手で選んだ物として置き、**数は書かない** (数は実物から引く)。

## 検証

導入そのものは利用者の機械でしか走らせられない。`src/shared/__tests__/localLlmSetup.test.ts` は、床が台帳と一致すること・
`--yes` 無しで何も変えないこと・外向きの `OLLAMA_HOST` で始めないこと・`127.0.0.1` 以外を設定に書かないことを毎回の
`npm test` で見る。

引継ぎパックは `src/shared/__tests__/localLlmHandoff.test.ts` が、予算・事実が実物と一致すること・読めない物は「不明」・決定論・秘密を含まない・
Modelfile の `SYSTEM` を壊さない・既定は書かない・出力先の外へ書かないことを毎回の `npm test` で見る。
