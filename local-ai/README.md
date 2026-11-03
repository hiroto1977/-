# local-ai: ローカルAIチャット環境 (マルチランタイム)

5種類のローカルLLM実行環境を並行して動かし、Open WebUI からどれでもチャットできます。
すべて CPU のみ・Docker 不要で、同じ GGUF モデルファイルを共有します。

## 構成 (すべて 127.0.0.1 のみで待ち受け)
| ポート | ランタイム | API | Open WebUI 上のモデル名 | 起動スクリプト |
|---|---|---|---|---|
| 8080 | Open WebUI | ブラウザUI | — | `start.sh` / `docker-compose.yml` |
| 11434 | Ollama | Ollama API | `qwen2.5:1.5b` | `setup.sh` |
| 8081 | llama.cpp `llama-server` | OpenAI互換 `/v1` | `qwen2.5-1.5b-llamacpp` | `start-llamacpp.sh` |
| 8082 | llama-cpp-python[server] | OpenAI互換 `/v1` | `qwen2.5-1.5b-llamacpp-python` | `start-llamacpp-python.sh` |
| 8083 | KoboldCpp | OpenAI互換 `/v1` (+独自UI) | `koboldcpp/qwen2.5-1.5b-instruct-q4_k_m` | `start-koboldcpp.sh` |
| 8084 | LocalAI | OpenAI互換 `/v1` | `qwen2.5-1.5b-localai` | `start-localai.sh` |

- モデル: Qwen2.5-1.5B-Instruct (Q4_K_M, 約1.1GB) を `~/models/qwen2.5-1.5b-instruct-q4_k_m.gguf` に1つだけ置き、全ランタイムで共有 (mmap)。コンテキスト長は 4096。
- Open WebUI には `OPENAI_API_BASE_URLS` (セミコロン区切り) と `OPENAI_API_KEYS` で 8081〜8084 を登録しています。

## 使い方
```bash
cd local-ai
chmod +x *.sh
./setup.sh      # 全ランタイム + Open WebUI を起動
```
個別起動: `./start-llamacpp.sh` などを実行 (`PORT` `CTX` `GGUF` 環境変数で変更可)。
不要なランタイムは `setup.sh` の該当行を消すか、`OPENAI_API_BASE_URLS` / `OPENAI_API_KEYS` から外してください (URLとキーの数は揃えること)。

## メモリについて
- 全部起動すると合計 約8GB 前後 (モデルファイル部分は共有) を使います。空きメモリが少ない場合は使わないランタイムを停止してください。
- Ollama と LocalAI はアイドル5分でモデルを自動アンロードします (LocalAI: `LOCALAI_WATCHDOG_IDLE=true`)。
- 他の3つ (llama.cpp / llama-cpp-python / KoboldCpp) は起動中ずっとモデルを保持します。

## 動作確認
```bash
ollama run qwen2.5:1.5b "こんにちは"
curl http://127.0.0.1:8082/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{"model":"qwen2.5-1.5b-llamacpp-python","messages":[{"role":"user","content":"こんにちは"}]}'
```

## 停止
```bash
pkill -f "open-webui serve"; pkill -f llama-b; pkill -f llama_cpp.server
pkill -f koboldcpp; pkill -f "local-ai"; pkill -x ollama
```

## 補足
- vLLM (CPU版) は導入サイズとメモリ消費が大きく、この規模の環境には不向きのため含めていません。
- Docker 版では、コンテナからホストへ接続するため各サーバーを `0.0.0.0` で待ち受ける必要がある場合があります。外部公開しないよう注意してください。
- `WEBUI_AUTH=False` はローカル専用の設定です。
- 1.5B の小型モデルのため、事実関係の誤りが多いです。重要な情報は必ず確認してください。

## 3Bモデル（Qwen2.5-3B-Instruct Q4_K_M）

`start-llamacpp.sh` は環境変数 `MODEL_SIZE` でモデルを切り替えられます（既定は `1.5b`）。

| MODEL_SIZE | GGUF | 既定ポート | エイリアス |
|---|---|---|---|
| `1.5b` | qwen2.5-1.5b-instruct-q4_k_m.gguf (約1.1GB) | 8081 | qwen2.5-1.5b-llamacpp |
| `3b` | qwen2.5-3b-instruct-q4_k_m.gguf (約2.1GB) | 8085 | qwen2.5-3b-llamacpp |

```bash
MODEL_SIZE=3b ./start-llamacpp.sh          # 8085で3Bを起動（GGUFが無ければ自動DL）
MODEL_SIZE=3b PORT=8081 ./start-llamacpp.sh  # 1.5Bの代わりに8081で3Bを使う場合
```

`PORT` / `ALIAS` / `GGUF` を個別に上書きできます。ログは `/tmp/llama-server-<PORT>.log`。

Open WebUI の既定の接続先は 8081(1.5B) / 8085(3B) / 8084(LocalAI) です。
llama-cpp-python(8082) と KoboldCpp(8083) はRAM節約のため既定では起動しません（スクリプトは残しています）。
使う場合は `OPENAI_API_BASE_URLS` と `OPENAI_API_KEYS` に追加してから `./start.sh` を実行してください。

### 比較結果（CPUのみ、temperature 0）

| 質問 | 1.5B | 3B |
|---|---|---|
| 日本一長い川 | ✗ 長良川 | ✗ 肥後川（正解は信濃川） |
| 富士山の高さ | ✓ 3,776m | ✓ 3,776m |
| 日本の首都 | ✓ 東京 | ✓ 東京 |
| 生成速度 | 約40〜44 tok/s | 約20〜24 tok/s |

3Bはメモリ使用量が約2倍、速度は約半分です。どちらも小さいモデルなので、事実に関する回答は必ず確認してください。
