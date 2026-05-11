# Service Hub (Desktop)

Electron + React + TypeScript で構築されたデスクトップダッシュボードのスケルトン。
サイドバーから 9 つのサービスを切り替えて、各サービスの機能タブを表示します。

対応サービス:

- GitHub
- WordPress.com
- Atlassian (Jira / Confluence / Compass)
- Notion
- Google Drive
- Google Calendar
- Gmail
- Slack
- Canva

## 開発

```bash
npm install
npm run dev      # Vite + Electron を開発モードで起動
npm run typecheck
npm run build    # Renderer をビルドし electron-builder でパッケージング
```

`npm run dev` を実行すると Electron ウィンドウが起動し、ホットリロードが有効になります。

## ステータス

スケルトン段階です。各サービスページは機能タブをカードで表示するのみで、実際の API 呼び出しは未実装。
`src/shared/api/*` のクライアントは `isConfigured()` を返し、認証情報を受け取って公式 API を呼ぶ前提で
インターフェースだけ定義されています。
