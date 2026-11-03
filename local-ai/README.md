# local-ai: ローカルAIチャット環境

Ollama と llama.cpp の2つの実行環境を並行して動かし、Open WebUI からどちらのモデルでもチャットできます。

## 構成
| コンポーネント | ポート | 役割 |
|---|---|---|
| Ollama | 127.0.0.1:11434 | ローカルLLM実行エンジン (モデル `qwen2.5:1.5b`) |
| llama.cpp `llama-server` | 127.0.0.1:8081 | OpenAI互換API (`/v1`)、モデル名 `qwen2.5-1.5b-llamacpp` |
| Open WebUI | 127.0.0.1:8080 | ブラウザ用チャット画面 (両方のバックエンドを登録済み) |

- モデル: Qwen2.5-1.5B-Instruct (Q4_K_M, 約1.1GB)。日本語対応、CPUのみで動作。
- llama.cpp は同じ GGUF ファイル (`~/models/qwen2.5-1.5b-instruct-q4_k_m.gguf`) を使い、コンテキスト長は 4096 です。
- メモリ目安: 両方のモデルを読み込んだ状態で合計 約3〜3.5GB。

## 使い方
```bash
cd local-ai
chmod +x *.sh
./setup.sh              # Ollama導入 → モデル取得 → llama-server起動 → UI起動
```
個別に起動する場合:
- `./start-llamacpp.sh` … llama-server のみ (`PORT` `CTX` `GGUF` で変更可)
- `./start.sh` … Open WebUI のみ (Docker なし、Ollama + OpenAI互換接続を有効化)
- `docker compose up -d` … Docker 版 Open WebUI

> Docker 版では、コンテナからホストへ接続するため、Ollama/llama-server を `0.0.0.0` で待ち受ける必要がある場合があります (`OLLAMA_HOST=0.0.0.0`、`HOST=0.0.0.0`)。その場合はファイアウォールで外部公開しないよう注意してください。

## 動作確認
```bash
ollama run qwen2.5:1.5b "こんにちは"
curl http://127.0.0.1:8081/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{"model":"qwen2.5-1.5b-llamacpp","messages":[{"role":"user","content":"こんにちは"}]}'
```

## 停止
- `pkill -f "open-webui serve"; pkill -f llama-b; pkill -x ollama`
- Docker: `docker compose down`

## 注意
- `WEBUI_AUTH=False` はローカル専用の設定です。外部公開する場合は認証を有効にしてください。
- 1.5B の小型モデルのため、事実関係の誤りがあります。重要な情報は必ず確認してください。
