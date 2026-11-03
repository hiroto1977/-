# local-ai: ローカルAIチャット環境

Ollama + Open WebUI で、ネット接続なしでも使えるチャットAIを手元で動かします。

## 構成
- **Ollama**: ローカルLLM実行エンジン (ポート 11434)
- **モデル**: `qwen2.5:1.5b` (日本語対応・CPUのみ・メモリ約2GBで動作)
- **Open WebUI**: ブラウザ用チャット画面 (http://localhost:8080)

## 使い方
```bash
cd local-ai
chmod +x setup.sh start.sh
./setup.sh            # Ollama導入 → モデル取得 → UI起動
```
別のモデルを使う場合: `MODEL=qwen2.5:3b ./setup.sh` (メモリ8GB以上推奨)

- Docker があれば `docker-compose.yml` で起動、なければ `start.sh` (uv + pip) で起動します。
- コマンドラインで試す: `ollama run qwen2.5:1.5b "こんにちは"`

## 停止
- Docker: `docker compose down`
- 非Docker: `pkill -f open-webui; pkill -x ollama`

## 注意
- `WEBUI_AUTH=False` はローカル専用の設定です。外部公開する場合は認証を有効にしてください。
