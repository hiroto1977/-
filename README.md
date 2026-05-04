# 業務向け Web ツールセット

ビルド不要・完全静的・プライバシー優先の Web アプリ集。
2 つの独立したシステムを同梱しています。

| パス | 内容 |
|---|---|
| **`/desktop/`** | みんなのデスクトップ — 6 つの業務アプリ統合（タスク / メモ / カレンダー / 電卓 / 連絡先 / タイマー） |
| **`/v19/ui/`** | v19 ダッシュボード — 複数の AI プロバイダ（Ollama / Anthropic / Google）と統一 UI で対話 |
| **`/governance/`** | ローカルファースト業務運用のガバナンス文書群（法制度・データ分類・運用・士業別ルール 他） |
| **`/scripts/`** | 業務開始前チェック (`preflight.sh`) と PII 検出 (`pii-scan.sh`) |
| **`/CLAUDE.md`** | AI 支援者（Claude Code 等）が従うルール |
| **`/LOCAL_LLM_GUIDE.md`** | Claude Code を含む全コミュニケーションをローカル LLM 化する選択肢 (A/B/C) |

## 起動

```bash
python3 -m http.server 8000   # リポジトリ ルートで実行
```

- みんなのデスクトップ: <http://127.0.0.1:8000/desktop/index.html>
- v19 ダッシュボード:    <http://127.0.0.1:8000/v19/ui/dashboard.html>
- Claude 連携画面に直接: <http://127.0.0.1:8000/v19/ui/dashboard.html#integration-claude>

両方とも純粋な HTML/CSS/JS のため、Nginx / Apache / S3 / GitHub Pages / Cloudflare Pages などの静的ホスティングへそのまま配置できます。

---

## 1. みんなのデスクトップ (`desktop/`)

PC 初心者から大企業の実務者まで、誰でも安心して使える業務用デスクトップ。

### 特徴
- **完全オフライン動作** — データは端末内のみ。インターネット送信なし
- **PWA 対応** — Service Worker でオフライン動作 / ホーム画面に追加可能
- **アクセシビリティ最優先** — 高コントラストテーマ、特大文字、キーボード操作、ARIA 対応
- **3 テーマ × 4 文字サイズ × 2 密度** の組み合わせ

### 同梱アプリ

| アプリ | 用途 |
|---|---|
| ✅ やること | タスク・ToDo 管理 |
| 📝 メモ | 自由なメモ帳（自動保存） |
| 📅 カレンダー | 予定とイベント管理 |
| 🧮 電卓 | 計算履歴プレビュー付き |
| 👥 連絡先 | 住所録・電話帳 |
| ⏱️ タイマー | タイマー＆ストップウォッチ |

### キーボードショートカット
| 操作 | キー |
|---|---|
| ホームへ戻る | `Esc` |
| ヘルプを開く | `F1` |
| 設定を開く | `Ctrl` + `,` |
| 新規追加（各アプリ） | `Ctrl` + `N` |

データは `localStorage`（5〜10 MB 目安）。設定からバックアップを JSON 書き出し / 復元できます。

---

## 2. v19 ダッシュボード (`v19/ui/`)

複数の AI プロバイダを切り替えながら使える対話コンソール。**API キー / プロンプト / 履歴は全てブラウザ内に閉じます**（中継サーバーなし）。

### 対応プロバイダ

| プロバイダ | 認証 | 既定モデル | CORS | 備考 |
|---|---|---|---|---|
| 🏠 **Ollama (ローカル)** | 不要 | `llama3.2` | — | **既定**。事前に `OLLAMA_ORIGINS=* ollama serve` |
| 🤖 Anthropic Claude | API キー | `claude-opus-4-7` | ✅ 直接通信 | 有償・最高品質 |
| ✨ Google Gemini | API キー | `gemini-2.5-flash` | ✅ 直接通信 | 無料枠あり |

OpenAI はブラウザ直叩きを禁じる CORS 設定（403）のため、現状未対応。プロキシ経由か、ローカルの Ollama 経由で互換モデルをご利用ください。

### 機能

- **マルチセッション**: ブラウザのタブ風 UI で複数の独立した会話を保持。タイトル自動生成 + ダブルクリックでリネーム
- **8 種のプロンプトプリセット**: 翻訳 / 要約 / 校正 / コードレビュー / コード解説 / ビジネスメール / ブレスト / 議事録整形
- **画像入力 (Vision)**: 📎 ボタン / クリップボード貼り付け / ドラッグ&ドロップ。複数枚（最大 5）対応。長辺 1568px に自動ダウンスケール
- **ストリーミング応答**: SSE / NDJSON を解析しトークン単位で表示。停止ボタンで中断可
- **Markdown 描画**: コードブロック（コピーボタン付）・箇条書き・見出し・リンク。XSS 安全
- **3 テーマ**: ライト / ダーク / 高コントラスト
- **完全クライアント側永続化**: チャット履歴・設定はブラウザに保存。書き出し / 全消去あり

### Ollama (ローカル LLM) の最短手順

```bash
# 1. インストール
curl -fsSL https://ollama.com/install.sh | sh

# 2. ブラウザからの呼び出しを許可しつつ起動
OLLAMA_ORIGINS='*' ollama serve

# 3. 使うモデルを取得
ollama pull llama3.2                  # 軽量・テキスト用
ollama pull llama3.2-vision           # 画像入力対応
```

ブラウザで v19 ダッシュボードを開き、プロバイダ「🏠 Ollama (ローカル)」が選択された状態で送信してください。

### 🔒 ローカル専用モード

設定 → プライバシー → 「ローカル専用モード」をオンにすると、Anthropic / Google のプロバイダが UI から消え、Ollama のみが選択可能になります。機密データを扱う場面で、誤ってクラウド API へ送信するのを防げます。

### Claude Code 自体をローカル LLM 化したい場合

「ブラウザでの対話」ではなく **Claude Code CLI そのもの** をローカル LLM で動かしたい・あるいは Claude Code 以外の代替 (Aider / Continue / gptme / opencode 等) を使いたい場合は、[**LOCAL_LLM_GUIDE.md**](LOCAL_LLM_GUIDE.md) に 3 系統の選択肢と実践手順をまとめています。

### ファイル構成

```
v19/ui/
├── dashboard.html      # エントリポイント
├── dashboard.css       # スタイル（テーマ含む）
└── dashboard.js        # アプリ本体（ESモジュール）
```

### データ保存とプライバシー

- すべて `localStorage` に保存（API キー / 履歴 / 添付画像のサムネイル）
- 「保存しない」を選ぶとプロバイダ別に API キーをセッション中だけ保持
- 設定 → 全データ削除 で完全クリア
- 通信: **ユーザーが選んだプロバイダの API エンドポイント以外には何も送信しません**

### テスト

ヘッドレスでロジックを検証する単体テストが付属（API キー不要）:

```bash
node /path/to/test_*.mjs
```

検証内容: プロバイダ別リクエスト形状 / SSE・NDJSON ストリーム解析 / セッション分離 / プリセット解決 / Markdown 描画 + XSS / 画像マーシャリング。

---

## ガバナンス文書 (`governance/`)

業務で AI を使う際のルールと仕組みを言語化。日本法 + 士業別 + 実務テンプレ。

| ファイル | 内容 |
|---|---|
| [`governance/README.md`](governance/README.md) | 哲学・ナビゲーション・5 つの原則 |
| [`governance/01_LEGAL_FRAMEWORK.md`](governance/01_LEGAL_FRAMEWORK.md) | 関連する日本法 (APPI / マイナンバー / 不正競争防止 / 著作権 / 労基 / 電帳 / GDPR) |
| [`governance/02_DATA_CLASSIFICATION.md`](governance/02_DATA_CLASSIFICATION.md) | 5 段階データ分類 + 取扱マトリクス + 50 ケース集 (**最初に読む**) |
| [`governance/03_OPERATIONS.md`](governance/03_OPERATIONS.md) | 日常運用ルール・ファイル管理・ログ・**インシデント対応 (報告期限含む)** |
| [`governance/04_VENDOR_REVIEW.md`](governance/04_VENDOR_REVIEW.md) | クラウド AI ベンダ評価チェックリスト |
| [`governance/05_TEMPLATES.md`](governance/05_TEMPLATES.md) | プロンプト・チェックリストのテンプレ集 |
| [`governance/06_ONBOARDING.md`](governance/06_ONBOARDING.md) | 新メンバー オンボーディング手順 |
| [`governance/07_PROFESSIONAL_RULES.md`](governance/07_PROFESSIONAL_RULES.md) | **士業別ルールとスキーム** (弁護士/会計士/税理士/司法書士/行政書士/社労士/弁理士/不動産鑑定士/中小企業診断士/土地家屋調査士/医師 他) |

⚠️ **法的免責**: 本ドキュメント群は一般的整理であり、解釈・適用は必ず有資格専門家へ。

### 実行可能スクリプト

```bash
bash scripts/preflight.sh                  # 業務開始前の自動チェック (Ollama / 暗号化 / git / コマンド / 文書)
bash scripts/pii-scan.sh path/to/file.txt  # ファイル内の PII 検出
bash scripts/pii-scan.sh --staged           # git ステージ済の差分のみ
bash scripts/pii-scan.sh --diff             # git のすべての変更
```

## ライセンス

MIT
