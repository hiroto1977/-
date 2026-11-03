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

## 7Bモデル（Qwen2.5-7B-Instruct Q4_K_M, 約4.7GB）

```bash
MODEL_SIZE=7b ./start-llamacpp.sh   # 8086 / エイリアス qwen2.5-7b-llamacpp（GGUFは bartowski/Qwen2.5-7B-Instruct-GGUF から自動DL）
```

比較（temperature 0）: 日本一長い川 ✗「川崎」（正解は信濃川）/ 富士山 ✓ 3,776m / 首都 ✓ 東京。
速度は約9〜10 tok/s（1.5Bの約1/4）。llama-server のメモリ使用量は約8.5GB（RSS）で、全サービス起動時の空きは約5GBです。
RAMが足りない場合は `ENABLE_3B=0` で3Bを止めてください。

## 一括起動・停止と自動起動

```bash
./start-all.sh          # 全サービスを起動（冪等: 応答中のポートは再起動しない）
./start-all.sh --watch  # 起動後60秒ごとに監視し、落ちたサービスを再起動
./stop-all.sh           # 全サービス（監視ループ含む）を停止
ENABLE_3B=0 ENABLE_7B=0 ./start-all.sh   # 起動するモデルを選ぶ（既定はどちらも1）
```

起動対象: Ollama(11434) / llama-server 1.5B(8081)・3B(8085)・7B(8086) / LocalAI(8084) / Open WebUI(8080)。ログは `/tmp/local-ai-autostart.log`。

### 再起動後の自動起動について

この box は PID 1 が `tini` で、systemd も cron もありません。そこで `autostart-hook.sh` を使います。

```bash
./autostart-hook.sh install     # ~/.bashrc と ~/.profile にフックを1行追加
./autostart-hook.sh uninstall   # フックを削除
```

再起動後に最初のシェルが起動した時点で、`start-all.sh --watch` がバックグラウンドで立ち上がります。既に動いている場合は何もしません（flock で判定）。
シェルが1つも起動しないと自動起動はされません。その場合は `./start-all.sh --watch` を手動で実行してください。
systemd がある環境では、`ExecStart=/path/to/start-all.sh --watch` と `Restart=on-failure` を指定したユニットを使うのが確実です。

## ローカルオーケストレーション（LiteLLM + llama-swap）

`orchestrator/` に入っています。`start-all.sh` から自動で起動・監視されます（`ENABLE_LITELLM=0` / `ENABLE_EXTRAS=0` で無効化）。

| エンドポイント | 役割 |
|---|---|
| `http://127.0.0.1:4000/v1` | LiteLLM プロキシ（OpenAI互換）。キーは初回に生成して `~/litellm/master_key` (0600) に保存。リポジトリには含めない |
| `http://127.0.0.1:8090/v1` | llama-swap。追加モデルをリクエスト時に起動し、同時に常駐させるのは1つだけ。5分アイドルでアンロード |

### モデルグループ（`orchestrator/litellm-config.yaml`）

| 名前 | 中身 |
|---|---|
| `fast` | Qwen2.5-1.5B を llama.cpp(8081) / Ollama(11434) / LocalAI(8084) でランダム負荷分散 |
| `balanced` | Qwen2.5-3B（8085） |
| `smart` | Qwen2.5-7B（8086） |
| `auto` | `router_hook.py` がプロンプトで振り分け。400文字以上、またはコード・推論系のキーワード（コード, 実装, なぜ, 比較, 分析, python, ``` など）を含めば `smart`、それ以外は `fast` |

- フォールバック: `smart → balanced → fast`、`balanced → fast`、`auto → fast`
- リトライ: 2回。1回失敗したデプロイは30秒クールダウン
- タイムアウト: 60〜180秒（追加モデルは初回ロードがあるので600秒）
- バックグラウンドのヘルスチェック: 300秒ごと

```bash
K=$(cat ~/litellm/master_key)
curl -s 127.0.0.1:4000/v1/chat/completions -H "Authorization: Bearer $K" -H 'content-type: application/json' \
  -d '{"model":"auto","messages":[{"role":"user","content":"日本の首都は？"}]}' -D - | grep x-litellm-model-api-base
```

レスポンスヘッダ `x-litellm-model-api-base` で、実際に応答したバックエンドを確認できます。

### 中国系の追加モデル（llama-swap 経由、`orchestrator/extra-models.txt`）

| LiteLLM 名 | モデル | 日本語テスト（日本の首都） | 速度 |
|---|---|---|---|
| `deepseek-r1-1.5b` | DeepSeek-R1-Distill-Qwen-1.5B | △「东京や大阪」（思考は長く、日本語は弱い） | 約43 tok/s |
| `qwen3-1.7b` | Qwen3-1.7B | ✓ 東京（思考モードあり） | 約35 tok/s |
| `qwen3-4b` | Qwen3-4B | ✓ 東京（思考モードあり） | 約17 tok/s |
| `minicpm3-4b` | MiniCPM3-4B | ✓ 東京（4096トークンではメモリ不足で落ちるため `-c 2048`） | 約17 tok/s |
| `internlm2.5-1.8b` | InternLM2.5-1.8B-chat | ✓ 東京（冗長） | 約37 tok/s |
| `yi-1.5-6b` | Yi-1.5-6B-Chat | ✓ 東京 | 約13 tok/s |
| `glm-edge-1.5b` | GLM-Edge-1.5B-chat | ✓ 東京 | 約45 tok/s |

- 除外したもの:
  - DeepSeek-R1-Distill-Qwen-7B と GLM-4-9B: 7B を常駐させた状態では RAM が足りないため
  - MiniCPM4-8B: 同じくサイズの都合
- `EXTRA_MODELS="qwen3-1.7b glm-edge-1.5b"` で、使うモデルを絞れます。
- ⚠ 7B と全バックエンドが常駐していると空きは約1〜5GBです（Ollama と LocalAI は5分アイドルで解放）。3B以上の追加モデル（Yi / MiniCPM / Qwen3-4B）は、空きが少ないと OOM で起動に失敗します。その場合は数分待つか、`ENABLE_7B=0` で起動してください。
- 7B は空き RAM が `MIN_FREE_MB_7B`（既定 6000MB）未満だと起動しません。その場合 `smart` は 3B / 1.5B にフォールバックします。

### 多段デモ（下書き → 添削）

```bash
python3 orchestrator/demo_pipeline.py "日本で一番長い川と長さは？"   # fast で下書き → smart で改善
python3 orchestrator/demo_pipeline.py "質問" --draft qwen3-1.7b --review balanced
```

### Open WebUI

`start-all.sh` は LiteLLM（4000）も Open WebUI の接続先に加えます。`auto / fast / balanced / smart` と追加モデルがモデル一覧に表示されます。

### 変更点

`curl … | sh` 形式のインストールは廃止しました。`uv` や `ollama` が無い場合は、案内を表示して終了します。すべてのスクリプトの先頭に `set -euo pipefail` を入れています。

## ローカルAI評議会
複数モデルが常時議論する `council/` を同梱しています。3Dの村: http://127.0.0.1:8091 （詳細は council/README.md）

## 村ビューの追加機能
- `GET /api/person/<id>`: 住民のプロフィールと最近の発言（新しい順）を返す
- 住民は日本時間に合わせて動く（夜は帰宅、9〜18時は机で仕事、それ以外は散歩、会議の発言者はホールへ移動）。`?hour=19` のように時刻を指定して確認できる
- カメラ切替: 全体 / 会議ホール / 発言者を追う / 自由。ミニマップをクリックするとその場所へ移動
- 側面パネル: 掲示板 / 住民一覧 / プロフィール（「話しかける」「ついていく」ボタン付き）
- `?selftest` で移動とチャットを自己テスト。`?selftest=nochat` はチャットを省略
- 会議では直前と似た発言を検出して一度だけ言い直させる（ログに「言い直し」と出る）
- 描画の軽量化: ソフトウェア描画（SwiftShader/llvmpipe、`?lowgpu` でも可）を検出すると影を切り、解像度を下げる。カメラ操作中は解像度を一時的に下げ、操作後に戻す。遠くの住民は省略して描画し、ラベル更新は変化があったときだけ行う。`window.__perf()` で状態を確認できる
