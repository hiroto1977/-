# MCP サーバー設定ガイド

このプロジェクトの Claude Code ローカル環境で使える MCP サーバーの導入手順。

## 設定ファイル

`.claude/settings.json` に `mcpServers` セクションを追加済み。  
API キーが必要なサーバーは環境変数で注入する（コードに書かない）。

## 導入済みMCPサーバー一覧

| サーバー | 用途 | API キー |
|---|---|---|
| **filesystem** | プロジェクトのファイル読み書き | 不要 |
| **fetch** | HTTP リクエスト・API 呼び出し | 不要 |
| **memory** | セッション間の記憶（メモ保存） | 不要 |
| **sequential-thinking** | 複雑な推論・段階的思考 | 不要 |
| **puppeteer** | ブラウザ自動化・スクリーンショット | 不要 |
| **github** | GitHub リポジトリ操作 | `GITHUB_TOKEN` |
| **notion** | Notion データベース・ページ操作 | `NOTION_API_KEY` |
| **slack** | Slack チャンネル・メッセージ操作 | `SLACK_BOT_TOKEN` + `SLACK_TEAM_ID` |
| **gdrive** | Google Drive ファイル操作 | OAuth 認証ファイル |
| **brave-search** | Web 検索 | `BRAVE_API_KEY` |
| **context7** | ライブラリドキュメント参照（@upstash） | 不要 |
| **mcp-commands** | シェルコマンド実行 | 不要 |

## セットアップ手順

### 1. 環境変数の設定

`~/.zshrc` または `~/.bash_profile` に追記（ローカル環境）:

```bash
# GitHub
export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"

# Notion
export NOTION_API_KEY="secret_xxxxxxxxxxxx"

# Slack
export SLACK_BOT_TOKEN="xoxb-xxxxxxxxxxxx"
export SLACK_TEAM_ID="T00000000"

# Brave Search
export BRAVE_API_KEY="BSAxxxxxxxxxxxx"
```

変更を反映:
```bash
source ~/.zshrc
```

### 2. API キーの取得方法

#### GitHub Token
1. https://github.com/settings/tokens/new
2. **Expiration**: No expiration（または任意）
3. **Scopes**: `repo`, `read:org`, `read:user`, `gist`
4. 生成されたトークンを `GITHUB_TOKEN` に設定

#### Notion API Key
1. https://www.notion.so/my-integrations にアクセス
2. 「+ New integration」→ 名前を入力
3. 「Submit」→ Internal Integration Token をコピー
4. 連携したいページ/DBを開き「...」→「Connections」→ 作成したIntegrationを追加

#### Slack Bot Token
1. https://api.slack.com/apps → 「Create New App」
2. 「From scratch」→ App Name入力 → Workspace選択
3. 「OAuth & Permissions」→ Scopes に以下を追加:
   - `channels:history`, `channels:read`, `chat:write`
   - `files:read`, `groups:history`, `im:history`, `mpim:history`
   - `users:read`
4. 「Install to Workspace」→ Bot User OAuth Token (`xoxb-...`) をコピー
5. Workspace ID: `https://app.slack.com/client/TXXXXXXXX` の T から始まる部分

#### Brave Search API Key
1. https://api.search.brave.com/register → 登録
2. ダッシュボード → API Keys → 新規作成
3. 無料プラン: 2,000 req/月

### 3. Google Drive 認証（OAuth）

```bash
# credentials ディレクトリを作成
mkdir -p ~/.config/mcp

# OAuth クライアントの作成
# 1. https://console.cloud.google.com/
# 2. APIs & Services → Credentials
# 3. OAuth 2.0 Client IDs → Desktop app → ダウンロード
# 4. ファイルを ~/.config/mcp/gdrive-credentials.json に配置

# 初回認証（ブラウザが開く）
npx -y @modelcontextprotocol/server-gdrive
# → ブラウザで Google ログイン → token が ~/.config/mcp/ に保存される
```

### 4. Claude Code を再起動して確認

```bash
# MCPサーバーの接続確認
claude mcp list

# 個別サーバーのテスト
claude mcp get filesystem
```

## ChatGPT / 他のLLMとのMCP連携

### mcp-remote でリモート接続（OpenAI / ChatGPT向け）

```bash
# mcp-remoteでMCPサーバーをHTTPエンドポイントとして公開
npx -y mcp-remote serve --config .claude/settings.json --port 3100
```

OpenAI Function Calling 形式でアクセス:
```
POST http://localhost:3100/v1/functions
```

### LiteLLM 経由（複数LLMで同じMCPを使う）

```bash
pip install litellm

# litellm.yaml
model_list:
  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: ${OPENAI_API_KEY}
  - model_name: claude-sonnet
    litellm_params:
      model: anthropic/claude-sonnet-4-6
      api_key: ${ANTHROPIC_API_KEY}

litellm --config litellm.yaml --port 4000
```

## トラブルシューティング

```bash
# 特定のMCPサーバーのログ確認
claude --mcp-debug

# npxキャッシュクリア
npx clear-npx-cache

# パッケージの手動インストール（npxが遅い場合）
npm install -g @modelcontextprotocol/server-filesystem
npm install -g @modelcontextprotocol/server-github
```

## Obsidian Vault との連携

このプロジェクトの `knowledge-vault/` を Obsidian から直接参照可能。  
`filesystem` MCPサーバーが起動中であれば Claude から vault ノートの読み書きが可能。

```
knowledge-vault/
├── notes/academic/    ← 2,501件の学術概念
├── MOC/               ← 目次マップ
└── org/roles/         ← 役員コンテキスト
```
