# ローカル LLM 完全移行ガイド

「Anthropic（クラウド）に何も送らずに、AI 支援を受けられる開発・対話環境を整える」ための実践ガイド。

選択肢は 3 系統あります。順番に正直度の高い評価をつけて並べます。

| 系統 | 概要 | 体験品質 | プライバシー |
|---|---|---|---|
| **A. Claude Code CLI + ルーター → Ollama** | Anthropic 製の CLI を、間にプロキシを挟んでローカル LLM に流す | ⚠️ 大幅劣化（特にツール使用） | ✅ 完全ローカル |
| **B. 最初からローカル LLM 用に設計された別 CLI** | Aider / OpenCodex / Codex CLI / gptme など | ◎ ローカル LLM 用に最適化されており安定 | ✅ 完全ローカル |
| **C. v19 ダッシュボード + 「ローカル専用モード」** | 本リポジトリの Web UI を使った会話。コード編集はせず対話のみ | ○ 対話 UX は良い／コード編集は別途必要 | ✅ 完全ローカル |

**多くの場合、現実解は B または C** です。A は「Claude Code に慣れた手触りを保ちたい」という強い動機がある場合のみ。

---

## A. Claude Code CLI + ルーター → Ollama

Anthropic の Claude Code CLI そのものを、ルーター（プロキシ）経由で Ollama に向けます。

### A-1. インストール

```sh
# Claude Code CLI 本体
npm install -g @anthropic-ai/claude-code

# Claude Code Router (CCR) — コミュニティ製のプロキシ
npm install -g @musistudio/claude-code-router

# Ollama (まだの場合)
curl -fsSL https://ollama.com/install.sh | sh
```

### A-2. ツール使用に強いモデルを取得

ローカルで Claude Code 風に動かすには「**JSON ベースの tool_use を安定して出せる**」モデルが必要です。
小さい汎用モデルではほぼ確実に失敗するため、**コーディング特化モデル**を選びます。

```sh
ollama pull qwen2.5-coder:32b      # 推奨・コード特化・tool use 比較的安定 (~20GB)
ollama pull deepseek-r1:32b         # 推論強化型 (~20GB)
ollama pull qwen2.5-coder:14b       # 中サイズ (~9GB) — RAM 少ない場合の妥協案
```

> **VRAM/RAM の目安**: 32B 量子化版で約 20GB。GPU メモリが不足する場合は CPU 推論に落ちて極端に遅くなります。M2/M3 Pro/Max、RTX 4090 級が現実的最低ライン。

### A-3. ルーターを設定

`~/.claude-code-router/config.json` を作成:

```json
{
  "PROVIDERS": {
    "ollama": {
      "api_base_url": "http://localhost:11434/v1",
      "api_key": "ollama",
      "models": ["qwen2.5-coder:32b", "deepseek-r1:32b"]
    }
  },
  "Router": {
    "default": "ollama,qwen2.5-coder:32b",
    "background": "ollama,qwen2.5-coder:14b",
    "think": "ollama,deepseek-r1:32b",
    "longContext": "ollama,qwen2.5-coder:32b"
  }
}
```

### A-4. 起動

```sh
# Ollama を CORS 許可付きで起動 (別ターミナル)
OLLAMA_ORIGINS='*' ollama serve

# ルーター起動 (別ターミナル)
ccr start

# Claude Code をルーター経由で起動
ccr code
```

### A-5. 期待される劣化と対処

| 症状 | 原因 | 対処 |
|---|---|---|
| Read/Edit ツールが暴走、ファイルを破壊 | tool_use の JSON 形式が崩れた応答を CLI が誤解釈 | より大きなモデル（70B+）に切替 / ツール無効化 |
| 「I'll help you with that」とだけ返ってくる | エージェントループが回らない | system プロンプトを短くするか、`--no-mcp` で MCP を切る |
| 巨大なコンテキストで応答が空になる | コンテキスト窓溢れ | `OLLAMA_CONTEXT_LENGTH=131072 ollama serve` で拡張、または分割 |
| 反応が極端に遅い (10s+/トークン) | CPU 推論にフォールバック | `nvidia-smi` / `ps aux | grep ollama` で GPU 使用確認 |

> **正直なところ**: Claude Sonnet 4.6 / Opus 4.7 と同等の体験には**程遠い**です。コード読解・複数ファイル編集・長期記憶を伴う作業では Claude が桁違いに優秀。「動くけど常用は厳しい」程度の到達点と思ってください。

---

## B. 最初からローカル LLM 用に設計された別 CLI

A の劣化が大きい根本原因は「Claude 用に書かれた CLI を別の頭で動かす」ミスマッチです。
最初から Ollama / ローカル LLM を想定して作られたツールを使うほうが、安定性も使い勝手も上です。

### B-1. Aider — コード編集に特化（最有力候補）

```sh
pip install aider-chat
cd your-project
aider --model ollama/qwen2.5-coder:32b
```

- **強み**: git diff ベースの編集、テスト連動、リポジトリマップを LLM に提示する仕組み
- **弱み**: 対話 UI は質素
- **推奨モデル**: `qwen2.5-coder:32b` / `deepseek-coder-v3` / `gpt-oss:20b`

### B-2. gptme — シェル統合の汎用アシスタント

```sh
pipx install gptme
gptme --model ollama/qwen2.5
```

- **強み**: Bash 実行・ファイル編集・Web 検索を統合、プロンプトテンプレート豊富
- **弱み**: コード専門ではない
- **用途**: 雑用全般 (調査、シェル作業、ちょい開発)

### B-3. Continue — VS Code / JetBrains 拡張

VS Code から:
1. 拡張機能「Continue」をインストール
2. 設定 (`~/.continue/config.json`) で Ollama を指定:

```json
{
  "models": [{
    "title": "Qwen Coder 32B (Local)",
    "provider": "ollama",
    "model": "qwen2.5-coder:32b",
    "apiBase": "http://localhost:11434"
  }]
}
```

- **強み**: エディタネイティブ、補完・チャット・Apply 編集が一体
- **用途**: 普段 VS Code で開発している人なら最速で「ローカル AI ペアプロ」体験

### B-4. Open Interpreter — 対話型コード実行

```sh
pip install open-interpreter
interpreter --local
```

- **強み**: 「データ分析やって」と頼むと自分で Python を書いて実行
- **弱み**: 安全装置が弱め（任意コード実行のため隔離環境推奨）

### B-5. opencode (open-source の Claude Code 風)

GitHub: https://github.com/opencode-ai/opencode (URL は確認推奨)

- Claude Code に近い TUI 体験を、最初からマルチモデル対応で提供
- Ollama 直結が標準サポート

### B 系統のおすすめ選択フロー

```
コード編集が中心？
├── Yes、エディタ常駐 → Continue (B-3)
├── Yes、ターミナル派 → Aider (B-1)
└── No、雑用全般       → gptme (B-2)
```

---

## C. v19 ダッシュボード（本リポジトリ）+ ローカル専用モード

すでに本リポジトリに同梱されています。コード編集機能はありませんが、**対話のみで完結する用途**には最適です。

### セットアップ

[`README.md`](README.md) の「Ollama (ローカル LLM) の最短手順」を実行。

### ローカル専用モードの使い方

1. ブラウザで <http://127.0.0.1:8000/v19/ui/dashboard.html#settings> を開く
2. 「プライバシー」セクションの **🔒 ローカル専用モード** をオン
3. 上部に **🔒 ローカル専用** バッジが常時表示
4. 連携サービス選択画面から Anthropic / Google が消え、Ollama のみ
5. 万が一クラウドプロバイダ選択中だった場合は自動で Ollama に切り替わる

### v19 が向いているケース

- 機密文書の翻訳・要約・校正（プリセット 8 種が便利）
- 試行錯誤のブレスト
- 画像（スクショ・図・写真）について質問する
- Claude Code を使う前のラフな下書き

### v19 が向かないケース

- リポジトリ全体の編集（A や B のほうが向く）
- 複数ファイルを跨ぐリファクタ
- ターミナル操作の自動化

---

## 推奨の組み合わせ

実務的には次の使い分けが最もコスパが良いと考えます:

| 状況 | ツール |
|---|---|
| 大きいコード変更・複雑なリファクタ・調査 | **Claude Code (クラウド)** — 課金してでも品質が桁違い |
| 機密文書/個人情報を含む対話・翻訳・要約 | **v19 ダッシュボード (ローカル専用モード)** |
| ローカル PC でのコード補完・小さな修正 | **Continue (B-3)** または **Aider (B-1)** |

「全部ローカル」を貫く必要が本当にあるか、一度立ち止まって考える価値はあります。

---

## トラブル切り分け（共通）

| 症状 | 原因の候補 |
|---|---|
| `ECONNREFUSED 127.0.0.1:11434` | Ollama 未起動 |
| ブラウザから 403 / CORS エラー | `OLLAMA_ORIGINS` 未設定 |
| `model 'xxx' not found` | `ollama pull` 忘れ |
| GPU を使ってくれない | `OLLAMA_GPU_LAYERS=999` を設定、ドライバ確認 |
| 回答品質が低い | より大きなモデル / 量子化を Q5_K_M 以上 / コーディング特化を選ぶ |
| ツール使用 (Read/Edit/Bash) が動かない | モデルが tool_use に未対応・小さすぎる。最低でも 14B、推奨 32B+ |

---

## ライセンス・更新

このガイドは v19 ダッシュボードと一体で MIT。第三者ツール（Aider / Continue / CCR 等）の URL や挙動は時期により変わるため、リンク切れの場合は各プロジェクトの公式リポジトリを直接ご確認ください。
