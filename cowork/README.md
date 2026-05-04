# cowork — ローカル AI と Chat する最短ルート

「ご自身の PC で Claude / Code / 共同作業 を **完全ローカル** で行う」ための実行可能な道具一式。

## 提供する 3 つの道具

| ツール | 何ができるか | 起動 |
|---|---|---|
| **`local-chat-cli.py`** | ターミナルから対話。マルチターン・履歴保存・モデル切替・コードハイライト | `python3 cowork/local-chat-cli.py` |
| **`v19 ダッシュボード`** | ブラウザで GUI 対話。8 プリセット・画像入力・複数セッション | `python3 -m http.server 8000` → `http://127.0.0.1:8000/v19/ui/dashboard.html` |
| **`local-cowork.sh`** | 全部まとめて起動 (Ollama 起動確認 + サーバー + ブラウザ) | `bash cowork/local-cowork.sh` |

## 前提

- Ollama がローカルでインストール済 (`ollama --version` で確認)
- 任意のモデルが取得済 (`ollama list` に表示される)
  - 推奨: `ollama pull llama3.2` (~2GB) 最小構成
  - コード用: `ollama pull qwen2.5-coder:14b` (~9GB)
  - Vision: `ollama pull llama3.2-vision` (~8GB)

未セットアップなら [`../LOCAL_LLM_GUIDE.md`](../LOCAL_LLM_GUIDE.md) または [`../README.md`](../README.md) の Ollama 章を先に。

## 即時 起動 (3 つのうちどれか)

### A. ターミナルで chat だけ
```sh
python3 cowork/local-chat-cli.py
```

### B. ブラウザで GUI
```sh
python3 -m http.server 8000   # 別ターミナル
# その後 ブラウザで:
# http://127.0.0.1:8000/v19/ui/dashboard.html#integration-claude
```

### C. ワンショット起動 (全自動)
```sh
bash cowork/local-cowork.sh
```

このスクリプトが:
1. Ollama の稼働確認 (停止していれば `OLLAMA_ORIGINS=* ollama serve` を提案)
2. デフォルトモデルの取得確認
3. 静的サーバーをバックグラウンド起動
4. CLI チャット を立ち上げる (オプションでブラウザも自動オープン)

## 使い分け

| シーン | 推奨ツール |
|---|---|
| 短い質問・調べ物・スクリプト生成 | CLI |
| 長文の翻訳・要約・校正 | ブラウザ (プリセット) |
| 画像を見せて質問 | ブラウザ (📎 添付) |
| コードレビュー・複数ファイル | CLI を使うか、Aider (LOCAL_LLM_GUIDE.md B-1) |
| 複数の話題を並行 | ブラウザ (セッションタブ) |

## ファイル

```
cowork/
├── README.md             # この文書
├── local-chat-cli.py     # Python 製の対話 CLI (Ollama API 直叩き)
└── local-cowork.sh       # 全部まとめて起動
```

## トラブル

- **CLI が「Ollama に接続できません」**: `ollama serve` を起動してから再実行
- **CLI 起動時に「No module named ‘requests’」**: 不要 (標準ライブラリのみ使用)
- **モデル未取得 エラー**: `ollama pull <モデル名>` で取得後再実行
- **応答が遅い**: 初回はモデルロードで 30 秒前後。2 回目以降高速化
- **ブラウザ版で 403**: `OLLAMA_ORIGINS='*' ollama serve` で再起動

それでも詰まる場合は `../LOCAL_LLM_GUIDE.md` 末尾の トラブル切り分け表 を参照。
