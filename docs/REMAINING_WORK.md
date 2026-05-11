# Service Hub — 残りの作業手順書

最終更新: 2026-05-11  
対象ブランチ: `claude/add-claude-documentation-F7HIa`

このドキュメントは、現在の状態から「自分のマシンで毎日使うレベル」までに必要な
作業をフェーズ別に並べたランブックです。各フェーズは独立しており、必要な順に
着手できます。所要時間は経験者基準。

---

## 現状

- [x] 9 サービスの UI + 実データスナップショット表示
- [x] 全 9 サービスのライブフェッチャー（main プロセスから REST 直叩き）
- [x] `safeStorage` によるトークン暗号化保存
- [x] Vitest 25 件合格・typecheck・build green
- [x] Linux x86-64 AppImage を git にチャンクコミット済み
- [x] PR #2 (draft) push 済み

未完了の主要タスク:
- [ ] 自分のマシンで起動して使う（Phase 0）
- [ ] PR レビュー → main マージ（Phase 1）
- [ ] スナップショット最新化（Phase 2）
- [ ] アイコン / ブランディング（Phase 3）
- [ ] OAuth code flow（Phase 4）
- [ ] サービスごとの機能拡張（Phase 5）
- [ ] Mac / Windows 用インストーラ生成（Phase 6）
- [ ] 配布署名 / 自動アップデート / CI（Phase 7）

---

## Phase 0: 今すぐ自分のデスクトップで起動する（5 分）

### Linux x86-64

```bash
git fetch origin
git checkout claude/add-claude-documentation-F7HIa
git pull
bash scripts/assemble-appimage.sh
./release/Service\ Hub-0.1.0.AppImage
```

ファイラから AppImage をダブルクリックでも可。FUSE が無い環境では:

```bash
"./release/Service Hub-0.1.0.AppImage" --appimage-extract
./squashfs-root/AppRun
```

### Mac / Windows / その他

```bash
git fetch origin
git checkout claude/add-claude-documentation-F7HIa
git pull
npm install
npm run dev        # ホットリロード開発モード
# または
npm run build      # release/ に .dmg / .exe を出力
```

### 動作確認チェックリスト

- [ ] Electron ウィンドウが開く
- [ ] サイドバーの 9 サービスが表示される
- [ ] 各タブをクリックしてスナップショットデータが表示される
- [ ] GitHub タブで「PAT を設定」 → PAT を貼り付け → 「保存」 → バッジが `Live` に変わる
- [ ] 「更新」ボタンで再フェッチ → 最新の自分の PR が表示される

---

## Phase 1: PR レビュー & main へマージ（30 分）

### 1-1. PR を ready にする

GitHub UI で PR #2 を開き、「Ready for review」をクリック。または:

```bash
gh pr ready 2     # gh CLI を使う場合
```

### 1-2. セルフレビュー観点

- `src/main/main.ts` の IPC ハンドラ群（`fetch:snapshot` の error 包装、`secrets:*` の入力検証）
- `src/main/secrets.ts` の `safeStorage` 不在時フォールバックの暗号強度（現在 plain base64 = 平文相当）
- 各 fetcher の URL ハードコーディング — `src/main/clients/*.ts`
- `tokenSetup` の placeholder に書いた認証情報フォーマットが正確か

### 1-3. main にマージ

レビュー OK なら GitHub UI から Squash merge。マージ後:

```bash
git checkout main
git pull
git branch -d claude/add-claude-documentation-F7HIa
```

### 1-4. GitHub Release 作成（任意）

`v0.1.0` タグを切って Release 化。AppImage を assets に添付:

```bash
git tag v0.1.0 && git push origin v0.1.0
gh release create v0.1.0 "release/Service Hub-0.1.0.AppImage" \
  --title "Service Hub v0.1.0" \
  --notes "Initial release: 9-service dashboard with live REST fetchers"
```

これで `dist-chunks/` を git から削除して履歴を綺麗にする選択肢が生まれる
（既存履歴の rewrite は別作業。BFG repo-cleaner を使う）。

---

## Phase 2: スナップショットを最新化する（10 分、必要時）

`src/renderer/data/snapshot.ts` は手動更新。Claude Code で各 MCP ツールを叩き、
結果を貼り直す:

| サービス | MCP ツール |
|---|---|
| GitHub | `mcp__github__get_me`, `mcp__github__list_pull_requests` |
| WordPress | `mcp__1162bffd...wpcom-user-sites` |
| Atlassian | `mcp__3245dd75...getAccessibleAtlassianResources` + `getVisibleJiraProjects` |
| Notion | `mcp__11127ca0...notion-search` |
| Drive | `mcp__8854cd8f...list_recent_files` |
| Calendar | `mcp__9789a00e...list_calendars`, `list_events` |
| Gmail | `mcp__9fcfcbe6...search_threads` |
| Slack | `mcp__d20bd3b1...slack_search_channels` |
| Canva | `mcp__c7c3b64a...search-designs`, `list-brand-kits` |

将来的にこの手動ステップを廃止するには Phase 5 の自動更新ジョブを参照。

---

## Phase 3: アイコン / ブランディング（30 分）

現状は Electron デフォルトアイコン (`default Electron icon is used` の警告)。

### 手順

1. `512x512` の PNG を `build/icon.png` に置く
2. `electron-builder.json` に追記:
   ```json
   "mac":   { "target": "dmg", "icon": "build/icon.png" },
   "win":   { "target": "nsis", "icon": "build/icon.png" },
   "linux": { "target": "AppImage", "icon": "build/icon.png" }
   ```
3. アプリ表示名やバンドル ID の調整: `package.json` の `author`、`electron-builder.json` の `productName` / `appId`
4. `npm run build` で再生成 → アイコンが反映される

### Mac の DMG 背景画像（任意）

`build/background.png` (540x380 推奨) を置き、`electron-builder.json` で
`"dmg": { "background": "build/background.png" }` を指定。

---

## Phase 4: OAuth code flow を実装する（大型・2〜4 日）

現状はユーザーが OAuth Playground 等で取得したアクセストークンをペーストする方式。
本格運用には main プロセスに OAuth 2.0 code flow を組み込み、「ブラウザで認証」
ボタンから完結させる必要があります。

### 4-1. サービスごとに OAuth クライアントを発行

各サービスのデベロッパーコンソールで OAuth クライアントを登録し、リダイレクト
URI を `http://127.0.0.1:<port>/oauth/callback` に設定。

| サービス | コンソール | スコープ例 |
|---|---|---|
| Google (Drive/Calendar/Gmail) | https://console.cloud.google.com/apis/credentials | `drive.readonly`, `calendar.readonly`, `gmail.readonly` |
| Slack | https://api.slack.com/apps | `channels:read`, `groups:read`, `chat:write`, `canvas:read` |
| Canva | https://www.canva.dev/docs/connect/connect-api-overview/ | `design:meta:read`, `brandtemplate:meta:read` |
| Notion | https://www.notion.so/profile/integrations | "public integration" を作る |
| WordPress.com | https://developer.wordpress.com/apps/ | `global` |
| Atlassian | https://developer.atlassian.com/console/myapps/ | `read:jira-work`, OAuth 2.0 (3LO) |

クライアント ID / シークレットは `.env`（gitignore 済み）で持つか、ビルド時環境変数で
バンドルに埋める（シークレットは PKCE で省略する選択肢あり）。

### 4-2. main プロセスに OAuth サーバを実装

新規ファイル: `src/main/oauth.ts`

```ts
import { BrowserWindow, shell } from 'electron';
import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';

interface OAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  scopes: string[];
  usePkce: boolean;
}

const CONFIGS: Record<string, OAuthConfig> = {
  drive: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: process.env.GOOGLE_CLIENT_ID!,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    usePkce: true,
  },
  // ... 各サービス分
};

export async function authorize(serviceId: string): Promise<{ accessToken: string; refreshToken?: string; expiresAt: number }> {
  const cfg = CONFIGS[serviceId];
  const state = randomBytes(16).toString('hex');
  const codeVerifier = randomBytes(64).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

  // 1. ローカルサーバを起動して redirect を待ち受け
  const port = await listenForRedirect(state); // 9000 番台で空きポートを探す

  // 2. ブラウザで認可ページを開く
  const authUrl = `${cfg.authorizeUrl}?` + new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: `http://127.0.0.1:${port}/oauth/callback`,
    response_type: 'code',
    scope: cfg.scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
  });
  shell.openExternal(authUrl);

  // 3. redirect で受け取った code をトークン交換
  const { code } = await port.promise; // listenForRedirect 内で resolve
  const tokenRes = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      redirect_uri: `http://127.0.0.1:${port.value}/oauth/callback`,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
  }).then((r) => r.json());

  return {
    accessToken: tokenRes.access_token,
    refreshToken: tokenRes.refresh_token,
    expiresAt: Date.now() + tokenRes.expires_in * 1000,
  };
}
```

### 4-3. リフレッシュトークン管理

`src/main/secrets.ts` を拡張して `{ accessToken, refreshToken, expiresAt }` を JSON で保存。
`fetch:snapshot` ハンドラの先頭で `expiresAt` を見て、期限切れなら自動で
refresh エンドポイントを叩き、新しい access token を保存して再試行。

### 4-4. レンダラ UI を「ブラウザで認証」ボタンに置換

`src/renderer/components/StatusBar.tsx` の `tokenSetup` を:

```tsx
{tokenSetup ? (
  <button onClick={() => window.serviceHub?.authorize(serviceId!)}>
    {isConfigured ? '再認証' : `${tokenSetup.label} (ブラウザで認証)`}
  </button>
) : null}
```

preload に `authorize(serviceId)` を追加し、main の `oauth:authorize` IPC を呼ぶ。

### 4-5. 注意点

- **クライアントシークレットの扱い**: デスクトップアプリでは PKCE 必須。Google / Slack / Canva は対応。Atlassian と WordPress.com はシークレットが必要なので、obfuscate しても完全には隠せない（業界標準では受容されている）。
- **ループバックリダイレクト**: Google は `http://127.0.0.1:<port>` を許可する。Slack も同様。一部の API（古い OAuth 1.0a など）はループバック不可なので別フロー（カスタム URI スキーム）が必要。
- **クロスサイト Cookie**: `BrowserWindow` 内認証だと Google が SafeBrowsing 警告を出す。`shell.openExternal` でデフォルトブラウザを使うのが標準。

---

## Phase 5: サービスごとの機能拡張（オープンエンド）

現在は読み取りのみ。書き込み・操作系を順次追加:

| サービス | 候補機能 | 関連 MCP / API |
|---|---|---|
| GitHub | Issue 作成、PR review、CI 状態 | `POST /repos/{o}/{r}/issues`, `/check-runs` |
| WordPress | 投稿のドラフト作成、メディアアップロード | `POST /sites/{id}/posts/new` |
| Atlassian | Jira issue 作成・遷移、Confluence ページ更新 | `POST /rest/api/3/issue`, `PUT /rest/api/3/issue/{id}/transitions` |
| Notion | ページ作成、データベース更新 | `POST /v1/pages`, `PATCH /v1/databases/{id}` |
| Drive | アップロード、共有設定変更 | `POST /upload/drive/v3/files` |
| Calendar | 予定作成・変更、招待応答 | `POST /calendars/{id}/events` |
| Gmail | ドラフト作成、送信、ラベル付与 | `POST /users/me/drafts`, `/labels` |
| Slack | メッセージ送信、Canvas 作成・編集 | `POST /chat.postMessage`, `/canvases.create` |
| Canva | デザイン生成、エクスポート | `POST /v1/designs`, `/v1/exports` |

### 追加方法のパターン

1. `src/main/clients/<service>.ts` に新関数を追加（例: `createJiraIssue`）
2. `LIVE_FETCHERS` とは別の `LIVE_ACTIONS` マップを定義し、`ipcMain.handle('action:invoke', ...)` を main に追加
3. preload に `invokeAction(serviceId, action, payload)` を公開
4. レンダラ各ページに専用の入力フォーム / ボタン

または、シンプルに `serviceHub.action('jira:create', payload)` 形式の単一 IPC で受けて
main 側で分岐する設計でも良い。

---

## Phase 6: Mac / Windows 用インストーラ（OS ごと 30 分）

`electron-builder` は **動作させる OS と同じターゲット** をネイティブビルドする
のが安定運用。

### Mac (Apple Silicon と Intel 両方)

Mac 上で:
```bash
npm run build
# release/Service Hub-0.1.0-arm64.dmg と release/Service Hub-0.1.0.dmg
```

### Windows

Windows 上で:
```bash
npm run build
# release/Service Hub Setup 0.1.0.exe (Nullsoft NSIS)
```

### クロスビルドする場合（非推奨だが可能）

Linux から Windows を作る:
```bash
sudo apt-get install wine64
npm run build -- --win
```

Mac は Apple のライセンスで他 OS からのビルドが事実上不可。

---

## Phase 7: 配布・自動アップデート・CI（数日）

### 7-1. コード署名

| OS | 署名証明書 | 必要性 |
|---|---|---|
| Mac | Apple Developer ID ($99/年) + 公証 | 配布で必須（Gatekeeper） |
| Windows | EV コード署名証明書 ($200〜400/年) | SmartScreen 警告回避 |
| Linux | 不要 | AppImage に署名は任意 |

`electron-builder` の `mac.identity`, `win.certificateFile` で設定。

### 7-2. 自動アップデート

`electron-updater` を依存追加し、`src/main/main.ts` に:

```ts
import { autoUpdater } from 'electron-updater';
app.whenReady().then(() => {
  autoUpdater.checkForUpdatesAndNotify();
});
```

GitHub Releases 上のメタファイル (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`)
を自動で読みに行く。Release を作るたびに electron-builder が自動で生成。

### 7-3. GitHub Actions CI

`.github/workflows/build.yml`:

```yaml
name: build
on:
  push:
    tags: ['v*']
jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm test
      - run: npm run typecheck
      - run: npm run build
      - uses: softprops/action-gh-release@v2
        with:
          files: release/*
```

タグを push するだけで 3 OS のインストーラが GitHub Release に上がる。

### 7-4. クラッシュレポート / メトリクス（任意）

Sentry / Datadog の Electron SDK を main / renderer 両方に組み込み、起動回数や
エラーを集める。デスクトップアプリは Web と違いログが取れないので、最低限の
オプトインテレメトリは入れた方が運用しやすい。

---

## 優先順位の推奨

「自分で使いたい」が目的なら:

1. **Phase 0**（5 分）→ 即動かす
2. **Phase 2**（10 分）→ データを最新化して見やすく
3. **Phase 3**（30 分）→ ドックでアイコンが映える
4. **Phase 1**（30 分）→ main に取り込んで歴史を整理
5. **Phase 6**（OS 別 30 分）→ 自分の OS 向けインストーラ作る

ここまでで「個人ツールとして毎日使う」レベル。さらに「家族や友人にも配る」「公開する」
段階で Phase 4 / Phase 7 が必要になります。
