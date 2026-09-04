/**
 * MCP コネクタ・レジストリ (宣言的カタログ)。
 *
 * `docs/MCP_SETUP.md` に文書化された 25 個の MCP サーバーと、他の AI
 * エージェント (ChatGPT / LiteLLM 等) を接続するブリッジ手段を、UI
 * (ConnectorsPage) で可視化するための静的データ。ネットワーク I/O は
 * 一切行わない — 実際の MCP 接続は Claude Code / ChatGPT 等の
 * エージェント側ランタイムが `.mcp.json` / mcp-remote を介して行い、
 * 設定検証は `npm run mcp:check` (scripts/mcp-check.cjs) が担う。
 *
 * 真実源は docs/MCP_SETUP.md — サーバーを増減した場合は本レジストリと
 * ドキュメントを同時に更新する (mcpConnectors.test.ts が件数を固定)。
 */

// Stryker disable all — 宣言的カタログ (表示文字列 + 環境変数名の転記)。

export type McpAuthKind = 'none' | 'api-key' | 'oauth';

export interface McpConnector {
  /** MCP サーバー ID (docs/MCP_SETUP.md の表と一致)。 */
  id: string;
  label: string;
  description: string;
  auth: McpAuthKind;
  /** 必要な環境変数 (.env.mcp)。auth='none' では空。 */
  envKeys: readonly string[];
}

/** API キー不要 — すぐ使える MCP サーバー (12)。 */
export const MCP_CONNECTORS_FREE: readonly McpConnector[] = [
  { id: 'filesystem', label: 'Filesystem', description: 'プロジェクトファイル読み書き', auth: 'none', envKeys: [] },
  { id: 'git', label: 'Git', description: 'Git コマンド操作 (log/diff/commit/branch)', auth: 'none', envKeys: [] },
  { id: 'sqlite', label: 'SQLite', description: 'ローカル DB 読み書き (data/local.db)', auth: 'none', envKeys: [] },
  { id: 'time', label: 'Time', description: '時刻・タイムゾーン変換 (日本時間対応)', auth: 'none', envKeys: [] },
  { id: 'fetch', label: 'Fetch', description: 'HTTP リクエスト・外部 API アクセス', auth: 'none', envKeys: [] },
  { id: 'memory', label: 'Memory', description: 'セッション間の記憶・メモ', auth: 'none', envKeys: [] },
  { id: 'sequential-thinking', label: 'Sequential Thinking', description: '複雑な段階的推論', auth: 'none', envKeys: [] },
  { id: 'context7', label: 'Context7', description: 'npm/PyPI ライブラリの最新ドキュメント参照', auth: 'none', envKeys: [] },
  { id: 'playwright', label: 'Playwright', description: 'ブラウザ自動化・E2E テスト支援', auth: 'none', envKeys: [] },
  { id: 'docker', label: 'Docker', description: 'Docker コンテナ管理', auth: 'none', envKeys: [] },
  { id: 'obsidian', label: 'Obsidian', description: 'knowledge-vault/ の読み書き', auth: 'none', envKeys: [] },
  { id: 'shopify', label: 'Shopify Dev', description: 'Shopify 開発 (テーマ/アプリ)', auth: 'none', envKeys: [] },
];

/** API キー / OAuth が必要な MCP サーバー (13)。 */
export const MCP_CONNECTORS_AUTH: readonly McpConnector[] = [
  { id: 'github', label: 'GitHub', description: 'リポジトリ・Issue・PR 操作', auth: 'api-key', envKeys: ['GITHUB_TOKEN'] },
  { id: 'atlassian', label: 'Atlassian', description: 'Jira / Confluence', auth: 'api-key', envKeys: ['ATLASSIAN_SITE_URL', 'ATLASSIAN_EMAIL', 'ATLASSIAN_API_TOKEN'] },
  { id: 'notion', label: 'Notion', description: 'Notion DB・ページ', auth: 'api-key', envKeys: ['NOTION_API_KEY'] },
  { id: 'slack', label: 'Slack', description: 'チャンネル・メッセージ', auth: 'api-key', envKeys: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'] },
  { id: 'gdrive', label: 'Google Drive', description: 'ファイル・フォルダ', auth: 'oauth', envKeys: [] },
  { id: 'linear', label: 'Linear', description: 'チケット・プロジェクト', auth: 'api-key', envKeys: ['LINEAR_API_KEY'] },
  { id: 'sentry', label: 'Sentry', description: 'エラー・イベント', auth: 'api-key', envKeys: ['SENTRY_AUTH_TOKEN'] },
  { id: 'stripe', label: 'Stripe', description: '支払い・顧客', auth: 'api-key', envKeys: ['STRIPE_SECRET_KEY'] },
  { id: 'cloudflare', label: 'Cloudflare', description: 'Workers・DNS', auth: 'api-key', envKeys: ['CLOUDFLARE_API_TOKEN'] },
  { id: 'discord', label: 'Discord', description: 'チャンネル・メッセージ', auth: 'api-key', envKeys: ['DISCORD_BOT_TOKEN'] },
  { id: 'youtube', label: 'YouTube', description: '動画・チャンネル', auth: 'api-key', envKeys: ['YOUTUBE_API_KEY'] },
  { id: 'brave-search', label: 'Brave Search', description: 'Web リアルタイム検索', auth: 'api-key', envKeys: ['BRAVE_API_KEY'] },
  { id: 'google-maps', label: 'Google Maps', description: '地図・場所検索', auth: 'api-key', envKeys: ['GOOGLE_MAPS_API_KEY'] },
];

/** 全 MCP コネクタ (docs/MCP_SETUP.md の 25 個と一致)。 */
export const MCP_CONNECTORS: readonly McpConnector[] = [
  ...MCP_CONNECTORS_FREE,
  ...MCP_CONNECTORS_AUTH,
];

/** MCP を利用できる AI エージェント側の接続経路 (docs/MCP_SETUP.md §他のAIとの連携)。 */
export interface McpAgentBridge {
  id: string;
  label: string;
  description: string;
}

export const MCP_AGENT_BRIDGES: readonly McpAgentBridge[] = [
  {
    id: 'claude-code',
    label: 'Claude Code / Claude Desktop',
    description: '.mcp.json でネイティブ接続 (本リポジトリ同梱の 25 サーバーをそのまま利用)',
  },
  {
    id: 'chatgpt-mcp-remote',
    label: 'ChatGPT (mcp-remote ブリッジ)',
    description: 'mcp-remote で MCP サーバーを HTTP ブリッジし、ChatGPT のコネクタ/Actions から接続',
  },
  {
    id: 'litellm',
    label: 'LiteLLM (マルチ LLM ゲートウェイ)',
    description: '複数 LLM を一元管理する OpenAI 互換ゲートウェイ。AI アシスタントの「互換 API」設定で接続可能',
  },
];

/** id 検索 (見つからなければ null)。 */
export function findMcpConnector(id: string): McpConnector | null {
  return MCP_CONNECTORS.find((c) => c.id === id) ?? null;
}

/** auth 種別ごとの件数 (UI のサマリー用)。 */
export function mcpConnectorCounts(): { total: number; free: number; auth: number } {
  return {
    total: MCP_CONNECTORS.length,
    free: MCP_CONNECTORS_FREE.length,
    auth: MCP_CONNECTORS_AUTH.length,
  };
}
// Stryker restore all
