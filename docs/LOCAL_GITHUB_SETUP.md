# ローカル環境 — GitHub に載っている「記憶」を使う

このリポジトリを **GitHub から clone したローカル PC** で、Cloud Agent や別マシンと同じ文脈（ルール・MCP・学術コーパス）を使えるようにする手順です。

## GitHub 上に載っているもの（clone するだけで届く）

| 種類 | 場所 | 用途 |
| --- | --- | --- |
| Cursor ルール | `.cursor/rules/*.mdc` | エージェントへの常時注入（日本語・ゲート・境界） |
| 引継ぎ・残作業 | `CLAUDE.md` / `docs/SESSION_HANDOFF.md` | セッション開始時の文脈 |
| 学術コーパス | `knowledge-vault/` | Obsidian MCP / 社内ナレッジ（2,500+ ノート） |
| MCP 台帳（正本） | `.claude/settings.json` | 25 個の MCP サーバー定義（lint:mcp-servers が検査） |

**Cursor アカウントの Memories（設定 → Rules & Memories）** は Cursor 側でアカウント同期されます。同じ Cursor アカウントでログインすれば、別 PC でも同じ Memories が使えます（チャット履歴そのものは端末ローカルな点に注意）。

**MCP の `memory` サーバー**（`@modelcontextprotocol/server-memory`）は、エージェントがセッションをまたいで書き込んだメモを **その PC の MCP プロセス内** に保持します。GitHub とは別系統です。

## 最短手順（Linux / WSL / macOS）

```bash
git clone https://github.com/hiroto1977/-.git service-hub
cd service-hub

# 開発依存 + 診断（初回）
bash scripts/setup-linux.sh

# Cursor 用 MCP 設定を .claude/settings.json から生成
npm run mcp:sync-cursor

# GitHub API 用トークン（任意だが GitHub MCP を使うなら必須）
# .env.mcp.example を参照し、シェルに export GITHUB_TOKEN=ghp_...
source ~/.bashrc   # または ~/.zshrc

npm run mcp:check
```

その後 **Cursor / Claude Code を再起動** し、サイドバー **Customize → MCP** で `memory` / `github` / `git` などが有効になっていることを確認します。

## Windows（Cursor デスクトップ）

1. [Git for Windows](https://git-scm.com/download/win) で clone（パス例: `C:\Users\<ユーザー>\Projects\service-hub`）。
2. [Node.js 20+](https://nodejs.org/) を入れ、PowerShell で:

```powershell
cd C:\Users\<ユーザー>\Projects\service-hub
npm ci
npm run mcp:sync-cursor
```

3. **環境変数** `GITHUB_TOKEN` をユーザー環境変数に追加（値は [GitHub PAT](https://github.com/settings/tokens/new) · scopes: `repo`, `read:org`, `read:user`, `gist`）。テンプレートは `.env.mcp.example`。
4. Cursor を再起動 → **Customize → MCP** でサーバーが緑になるか確認。

WSL2 を使う場合は、上記 Linux 手順の方が Electron 開発（`npm run dev`）と揃いやすいです（`docs/LINUX_MIGRATION.md`）。

## 生成される `.cursor/mcp.json`

- `npm run mcp:sync-cursor` が `.claude/settings.json` から **Cursor 公式形式**（`type: "stdio"` + `${env:…}`）へ写します。
- ファイルは **git 管理外**（`.gitignore`）。clone 直後は無いので、必ず 1 回生成してください。
- 台帳を変えたとき（`.claude/settings.json` を pull したあと）も、同コマンドを再実行します。

## GitHub MCP で「リポジトリの記憶」を触る

`GITHUB_TOKEN` を設定したうえで、チャットから GitHub MCP ツールを使うと、Issue / PR / ファイル内容など **GitHub 上の情報** をエージェントが参照できます。Service Hub アプリ内の「GitHub サービス」ページ用トークンとは別枠です（アプリは Settings → 各サービスで Vault に保存）。

## トラブルシューティング

| 症状 | 対処 |
| --- | --- |
| MCP が全部オフ / 見えない | `npm run mcp:sync-cursor` → Cursor 再起動 |
| `github` だけ ❌ | `echo $GITHUB_TOKEN`（Windows: `echo %GITHUB_TOKEN%`）が空でないか |
| `uvx` / `npx` が無い | Node 再インストール、`npm run mcp:check` の 🔧 行を確認 |
| Obsidian MCP が空 | `knowledge-vault/` が clone に含まれているか（サブモジュールではない） |

MCP の詳細一覧: [`docs/MCP_SETUP.md`](MCP_SETUP.md)
