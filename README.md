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

## ビルド済み AppImage を使う（最速：Linux x86-64 のみ）

```bash
git clone <repo URL>
cd <repo>
git checkout claude/add-claude-documentation-F7HIa
bash scripts/assemble-appimage.sh         # dist-chunks/* を結合 → release/*.AppImage
"./release/Service Hub-0.1.0.AppImage"    # ダブルクリックでも起動可
```

SHA256 は `scripts/assemble-appimage.sh` 内の `EXPECTED_SHA256` がチャンク再構成時に自動検証します。
独立検証する場合は `sha256sum "release/Service Hub-0.1.0.AppImage"` の出力が当該スクリプトの
`EXPECTED_SHA256` と一致することを確認してください（README にハードコードしないのは、過去に
リビルドのたびに drift していたため）。

## ソースから動かす（全 OS 対応）

```bash
npm install
npm run dev      # Vite + Electron を開発モードで起動（ホットリロード）
npm run typecheck
npm test         # vitest run
npm run build    # tsc -b + vite build + electron-builder で各 OS のインストーラ生成
```

`npm run build` は macOS では `.dmg`、Windows では `.exe`、Linux では `.AppImage` を `release/` に出します。

## ステータス

各サービスタブには MCP 経由で取得した実データのスナップショットが表示されます。
ライブフェッチは全 9 サービスで実装済み — ステータスバーの「トークン設定」ボタンから
PAT / OAuth アクセストークンを保存すると、`Snapshot` バッジが `Live` に切り替わります。
