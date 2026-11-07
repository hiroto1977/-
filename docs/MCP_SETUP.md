# MCP サーバー設定ガイド

このプロジェクトで使える MCP サーバーの完全導入手順。  
Claude Code ローカル環境で `npm run mcp:check` を実行して設定状態を確認できる。

## 設定状態の確認

```bash
npm run mcp:check
```

出力例:
```
📋 設定済みMCPサーバー: 25個

🟢 API不要（即使用可能）: 12個
🔑 APIキー設定済み: 2個
⚠️  APIキー未設定: 11個
```

---

## 全MCPサーバー一覧（25個）

### API不要（すぐ使える）

| サーバー名 | 用途 | 実装 |
|---|---|---|
| `filesystem` | プロジェクトファイル読み書き | uvx |
| `git` | Gitコマンド操作（log/diff/commit/branch） | uvx |
| `sqlite` | ローカルDB読み書き（`data/local.db`） | uvx |
| `time` | 時刻・タイムゾーン変換（日本時間対応） | uvx |
| `fetch` | HTTPリクエスト・外部APIアクセス | uvx |
| `memory` | セッション間の記憶・メモ | npx |
| `sequential-thinking` | 複雑な段階的推論 | npx |
| `context7` | npm/PyPIライブラリの最新ドキュメント参照 | npx |
| `playwright` | ブラウザ自動化・E2Eテスト支援 | npx |
| `docker` | Dockerコンテナ管理 | npx |
| `obsidian` | `knowledge-vault/` の読み書き（2,501+ノート） | npx |
| `shopify` | Shopify開発（テーマ/アプリ） | npx |

### APIキーが必要なサーバー

| サーバー名 | 対応サービス | 必要な環境変数 | 取得先 |
|---|---|---|---|
| `github` | GitHub | `GITHUB_TOKEN` | [settings/tokens](https://github.com/settings/tokens/new) |
| `atlassian` | Jira / Confluence | `ATLASSIAN_SITE_URL`, `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN` | [api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) |
| `notion` | Notion DB・ページ | `NOTION_API_KEY` | [my-integrations](https://www.notion.so/my-integrations) |
| `slack` | Slackチャンネル・メッセージ | `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID` | [api.slack.com/apps](https://api.slack.com/apps) |
| `gdrive` | Google Drive | OAuth認証ファイル | Google Cloud Console |
| `linear` | Linearチケット・プロジェクト | `LINEAR_API_KEY` | [linear.app/settings/api](https://linear.app/settings/api) |
| `sentry` | Sentryエラー・イベント | `SENTRY_AUTH_TOKEN` | [sentry.io/api-tokens](https://sentry.io/settings/account/api/auth-tokens/) |
| `stripe` | Stripe支払い・顧客 | `STRIPE_SECRET_KEY` | [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) |
| `cloudflare` | Cloudflare Workers・DNS | `CLOUDFLARE_API_TOKEN` | [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) |
| `discord` | Discordチャンネル・メッセージ | `DISCORD_BOT_TOKEN` | [discord.com/developers](https://discord.com/developers/applications) |
| `youtube` | YouTube動画・チャンネル | `YOUTUBE_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/) |
| `brave-search` | Webリアルタイム検索 | `BRAVE_API_KEY` | [api.search.brave.com](https://api.search.brave.com/register) |
| `google-maps` | 地図・場所検索 | `GOOGLE_MAPS_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/) |

---

## セットアップ手順

### 1. 環境変数を設定する

`.env.mcp.example` をテンプレートとして使用:

```bash
# テンプレートを確認
cat .env.mcp.example

# ~/.zshrc に追記（ローカルのmacOS/Linux）
cat .env.mcp.example >> ~/.zshrc
# → 各 "xxx..." をリアルなAPIキーに置き換える

source ~/.zshrc
```

### 2. 設定を検証する

```bash
npm run mcp:check
```

### 3. Claude Codeを再起動

設定変更後は Claude Code を再起動するとMCPサーバーが自動起動します。

---

## 各サービスのAPIキー取得手順

### GitHub Token
```
https://github.com/settings/tokens/new
→ Expiration: 1 year
→ Scopes: repo, read:org, read:user, gist
→ Generate token → GITHUB_TOKEN に設定
```

### Atlassian (Jira/Confluence)
```
https://id.atlassian.com/manage-profile/security/api-tokens
→ Create API token → 名前を入力
→ ATLASSIAN_API_TOKEN に設定
→ ATLASSIAN_SITE_URL = https://yourcompany.atlassian.net
→ ATLASSIAN_EMAIL = ログインメールアドレス
```

### Notion
```
https://www.notion.so/my-integrations
→ + New integration → 名前入力 → Submit
→ Internal Integration Token を NOTION_API_KEY に設定
→ 連携したいページ: ページを開く → ... → Connections → Integrationを追加
```

### Slack
```
https://api.slack.com/apps → Create New App → From scratch
→ OAuth & Permissions → Scopes に追加:
  channels:history, channels:read, chat:write
  files:read, groups:history, im:history
  mpim:history, users:read
→ Install to Workspace → Bot User OAuth Token を SLACK_BOT_TOKEN に設定
→ SLACK_TEAM_ID: https://app.slack.com/client/TXXXXXXXX の T始まり部分
```

### Google Drive (OAuth)
```bash
# 1. Google Cloud Console でプロジェクト作成
#    https://console.cloud.google.com/
# 2. APIs & Services → Enable: Google Drive API
# 3. Credentials → OAuth 2.0 Client IDs → Desktop app → Download JSON
mkdir -p ~/.config/mcp
mv ~/Downloads/client_secret_*.json ~/.config/mcp/gdrive-credentials.json

# 4. 初回認証（ブラウザが開く）
npx -y @modelcontextprotocol/server-gdrive
# → ブラウザでGoogleログイン → ~/.config/mcp/ にtokenが保存される
```

### Stripe
```
https://dashboard.stripe.com/apikeys
→ テスト環境の場合: sk_test_xxx を STRIPE_SECRET_KEY に設定
→ 本番環境の場合: sk_live_xxx を設定（要注意）
```

### Cloudflare
```
https://dash.cloudflare.com/profile/api-tokens
→ Create Token → Edit Cloudflare Workers テンプレート
→ CLOUDFLARE_API_TOKEN に設定
```

### Linear
```
https://linear.app/settings/api
→ Personal API Keys → + New API key
→ LINEAR_API_KEY に設定
```

### Sentry
```
https://sentry.io/settings/account/api/auth-tokens/
→ Create New Token → scopes: project:read, org:read, event:read
→ SENTRY_AUTH_TOKEN に設定
```

### Discord
```
https://discord.com/developers/applications
→ New Application → Bot → Reset Token
→ DISCORD_BOT_TOKEN に設定
→ Privileged Gateway Intents: Message Content Intent をON
→ サーバーに招待: OAuth2 → URL Generator (bot, applications.commands)
```

### YouTube Data API v3
```
https://console.cloud.google.com/
→ APIs & Services → + Enable APIs → YouTube Data API v3
→ Credentials → + Create Credentials → API Key
→ YOUTUBE_API_KEY に設定
```

### Brave Search API
```
https://api.search.brave.com/register
→ 登録 → ダッシュボード → API Keys → New Key
→ 無料プラン: 2,000 req/月
→ BRAVE_API_KEY に設定
```

---

## 他のAI（ChatGPT等）との連携

### mcp-remote でHTTPブリッジを立てる

```bash
# MCPサーバーをOpenAI Function Calling互換のHTTP APIとして公開
npx -y mcp-remote http ./node_modules/.bin/claude-mcp-proxy --port 3100
```

### LiteLLM で複数LLMを一元管理

```bash
pip install litellm
```

`litellm.yaml`:
```yaml
model_list:
  - model_name: claude-sonnet
    litellm_params:
      model: anthropic/claude-sonnet-4-6
      api_key: ${ANTHROPIC_API_KEY}
  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: ${OPENAI_API_KEY}

mcp_servers:
  - name: filesystem
    command: uvx
    args: [mcp-server-filesystem, .]
```

```bash
litellm --config litellm.yaml --port 4000
```

---

## トラブルシューティング

```bash
# 現在の設定状態を確認
npm run mcp:check

# MCP サーバーのデバッグモード
claude --mcp-debug

# npxキャッシュクリア（サーバーが古い場合）
npx clear-npx-cache

# uvxキャッシュクリア
uv cache clean

# 特定サーバーを手動起動してテスト
npx -y @modelcontextprotocol/server-github
uvx mcp-server-filesystem .
```

---

## Obsidian Vault 連携について

`obsidian` MCPサーバーは `knowledge-vault/` に直接アクセスします。

```
knowledge-vault/
├── notes/academic/       ← 2,501件の学術概念ノート
├── MOC/                  ← 目次マップ（学術概念・組織）
└── org/roles/            ← 役員コンテキスト（CFO/CIO/COO等）
```

Claude から `@obsidian` ツールでノートを検索・読み書き可能になります。
