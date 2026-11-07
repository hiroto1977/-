# Google ワークスペース連携セットアップ (Drive / Calendar / Gmail)

Service Hub の **Google Drive / Google Calendar / Gmail** は、Google の各 REST API を
使って読み取り（ファイル / 予定 / スレッド）と書き込み（フォルダ作成 / 予定作成 /
下書き作成）を行います。認証は OAuth 2.0（Authorization Code + PKCE・ループバック）。
**3 サービスは 1 つの OAuth クライアント ID を共有**します（スコープはサービスごと）。

> **重要:** 実際のサインインは **あなたの Google アカウントでのブラウザ認証** が必要で、
> 代行できません。以下で「サインインできる状態」まで整えたら、最後のサインインだけ
> ご自身で実行してください。
>
> ライブ接続（実データ取得・送信）は **デスクトップ版** の機能です。ブラウザ版
> （公開サイト / standalone.html）は同梱スナップショットを表示します。

## 手順

### 1. Google Cloud でプロジェクトと OAuth クライアントを作る
1. [Google Cloud Console「認証情報」](https://console.cloud.google.com/apis/credentials)
   を開く（プロジェクトがなければ新規作成）。
2. **OAuth 同意画面** を構成（User Type: 外部 / テスト ユーザーに自分の Google アカウントを追加）。
3. **認証情報を作成 → OAuth クライアント ID → アプリケーションの種類: デスクトップ アプリ**。
   - デスクトップ アプリ型はループバック（`http://127.0.0.1:<port>/oauth/callback`）への
     リダイレクトが自動で許可されるため、リダイレクト URI の手動登録は不要です。
4. 表示された **クライアント ID**（`…apps.googleusercontent.com`）を控えます。

### 2. 使う API を有効化する
[API ライブラリ](https://console.cloud.google.com/apis/library) で必要なものを有効化:

| サービス | API | スコープ（`oauth.ts` が要求） |
|---|---|---|
| Drive | Google Drive API | `auth/drive` |
| Calendar | Google Calendar API | `auth/calendar` + `auth/calendar.events` |
| Gmail | Gmail API | `auth/gmail.modify` + `auth/gmail.compose` |

### 3. クライアント ID をアプリに渡す（2 通り）

**A. アプリ内で貼り付け（推奨・かんたん）**
Drive / Calendar / Gmail いずれかのページの **「かんたん接続 (Google ワークスペース共通)」**
にクライアント ID を貼り付けて **Google でサインイン**。ID は共有キーで localStorage に
保存されるため **1 回貼れば 3 サービス共通** です（クライアント ID は公開識別子であり
秘密情報ではありません）。

**B. 環境変数（CI や常設環境向け）**
```bash
export GOOGLE_OAUTH_CLIENT_ID="1234…abcd.apps.googleusercontent.com"
```

### 4. サービスごとにサインインする（あなたの操作）
Drive / Calendar / Gmail の各ページで **🔐 Google でサインイン** → ブラウザで Google に
サインインし、そのサービスのスコープに同意します。アクセストークン（リフレッシュトークン
含む）は OS キーチェーン（`safeStorage`）に暗号化保存され、期限切れ前に自動更新されます
（`secrets.ts:getValidToken`）。

### （アプリ登録なしで今すぐ試す）OAuth Playground トークン
[OAuth 2.0 Playground](https://developers.google.com/oauthplayground) → 左の一覧で
必要なスコープを選択 → **Authorize APIs**（Google にサインイン）→
**Exchange authorization code for tokens** → `Access token` をコピー → 各ページの
「トークン設定」に貼り付け。クライアント ID 不要・約 1 時間有効（恒久利用には A/B を推奨）。

## できること（サインイン後）
- **Drive**: 最近のファイル一覧 + `create-folder`（フォルダ作成）
- **Calendar**: カレンダー / 予定一覧 + `create-event`（予定作成）
- **Gmail**: 受信スレッド / ラベル + `create-draft`（下書き作成。宛先ヘッダは CR/LF 注入を拒否）

## トラブルシュート
- **サインインボタンが無効** → かんたん接続にクライアント ID を貼るか `GOOGLE_OAUTH_CLIENT_ID` を設定。
- **`access_denied` / 確認されていないアプリ** → OAuth 同意画面の「テスト ユーザー」に
  自分のアカウントを追加（公開審査なしで使う場合はテスト ユーザーのみ利用可）。
- **`invalid_request: client_secret is missing`** → クライアントの種類が「ウェブ アプリケーション」に
  なっています。**「デスクトップ アプリ」型で作り直してください**（本アプリは PKCE のみで
  client_secret を送信しません）。
- **API が 403** → 手順 2 の API 有効化と、同意したスコープを確認（スコープ追加後は再サインイン）。

---
_本書はセットアップ手順のひな形です。Google Cloud の画面構成は変更される場合があります。_
