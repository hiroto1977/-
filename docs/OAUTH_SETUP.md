# OAuth code flow セットアップ

Service Hub の OAuth 機構は **PKCE-based Authorization Code (RFC 7636 + 8252)** で、
デスクトップアプリ向け。トークンを手動でコピペする代わりに「ブラウザで認証」ボタンを
クリック → 既定ブラウザで Google などの同意画面に遷移 → 戻ってきたらアプリが自動で
access / refresh token を保存します。期限切れ前に refresh も自動で走ります。

## 設定済みプロバイダ

| サービス | プロバイダ | 認可スコープ |
|---|---|---|
| Drive | Google | `drive` |
| Calendar | Google | `calendar`, `calendar.events` |
| Gmail | Google | `gmail.modify`, `gmail.compose` |

3 サービスは **共通の 1 つの Google OAuth クライアント** を使います。

## Google: クライアント ID を発行する手順（5 分）

1. https://console.cloud.google.com/apis/credentials を開く
2. プロジェクトを作成（既存のものでも可）
3. 左メニュー「OAuth 同意画面」→ ユーザータイプ「外部」→ アプリ名「Service Hub」など、
   メール / 連絡先を埋めて保存
4. 「Drive API」「Calendar API」「Gmail API」を「有効な API」に追加
5. 「認証情報」→ 「認証情報を作成」→「OAuth クライアント ID」
6. **アプリケーションの種類は必ず "Desktop app"** を選択
7. 名前を付けて作成 → 表示された **クライアント ID** をコピー（client secret は不要）

## アプリへの渡し方

クライアント ID は環境変数 `GOOGLE_OAUTH_CLIENT_ID` で渡します。

### 開発時

```bash
export GOOGLE_OAUTH_CLIENT_ID=123456789012-abc...xyz.apps.googleusercontent.com
npm run dev
```

### AppImage 実行時

```bash
GOOGLE_OAUTH_CLIENT_ID=123456789012-abc...xyz.apps.googleusercontent.com \
  ./release/Service\ Hub-0.1.0.AppImage
```

### .env ファイル（dev のみ、コミット禁止）

```
# .env
GOOGLE_OAUTH_CLIENT_ID=123456789012-abc...xyz.apps.googleusercontent.com
```

`.env` は `.gitignore` 済み。

## 動作フロー

1. ユーザが Drive / Calendar / Gmail タブの「ブラウザで認証」をクリック
2. main が 127.0.0.1 上にランダムポートでループバック HTTP サーバを起動
3. 既定ブラウザを `accounts.google.com/o/oauth2/v2/auth?...&redirect_uri=http://127.0.0.1:<port>/oauth/callback&code_challenge=...` で開く
4. ユーザが Google で同意 → ブラウザが `http://127.0.0.1:<port>/oauth/callback?code=...&state=...` にリダイレクト
5. main が code を受け取り、`access_type=offline` を要求しているので `prompt=consent` で必ず refresh_token を取得
6. `oauth2.googleapis.com/token` で code → tokens を交換
7. tokens を `safeStorage` で暗号化して保存
8. 該当タブが自動で `refresh()` を呼び、`Snapshot` → `Live` バッジに切り替わる

期限切れ前 60 秒以内に `getValidToken()` が呼ばれると refresh エンドポイントを自動で叩き、
新しい access_token を保存。refresh_token が失効していた場合は最後の access_token をそのまま返し、
上位の 401 をトリガに UI が再認証を促します。

## 既存の paste 式フローとの併用

OAuth が未設定 (= `GOOGLE_OAUTH_CLIENT_ID` 不在) のサービスは、これまで通り
「OAuth アクセストークン」ボタンから access_token を直接貼り付けて使えます。
Google OAuth Playground (https://developers.google.com/oauthplayground/) で取得した
トークンを貼り付ける運用も従来通り可能です（refresh 機構は paste では機能しません）。

## 他のプロバイダを追加する

`src/main/oauth.ts` の `OAUTH_CONFIGS` に 1 エントリ追加するだけ:

```ts
notion: {
  authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
  tokenUrl: 'https://api.notion.com/v1/oauth/token',
  clientId: process.env.NOTION_OAUTH_CLIENT_ID ?? '',
  scopes: [],
},
```

注意点:
- Notion / WordPress.com / Atlassian / Slack は **client_secret も必要** な OAuth 設計。
  デスクトップアプリだと完全に隠せないが、難読化 + 環境変数渡しでよくある妥協が可能。
- Slack は PKCE 非対応（v2 install flow）。
- Canva は PKCE 対応、Notion は対応していない（authorization code with secret）。

## 制約

- ループバックポートが他プロセスに占有されているとフローが失敗します（ポートは毎回ランダム）。
- 認証は **5 分以内に完了**する必要があります（タイムアウト後は再試行）。
- ブラウザの「同意して続行」を押さずに閉じた場合はサーバが永遠に待つ → タイムアウトで開放。
