# Microsoft 365 連携セットアップ

Service Hub の **Microsoft 365** サービス（`microsoft-365`）は、Microsoft Graph API を
使って Outlook メール・カレンダー予定を読み取り、メール送信・予定作成を行います。
連携は OAuth 2.0（Microsoft Entra ID / 旧 Azure AD）で認証します。

> **重要:** 実際のサインインは **あなたの Microsoft アカウントでのブラウザ認証** が必要で、
> アプリ運営側やアシスタントが代行することはできません。以下の手順で「サインインできる状態」
> まで整えたら、最後のサインインだけご自身で実行してください。

## 必要なもの
- Microsoft 365 アカウント（個人 / 職場・学校のいずれか）
- Microsoft Entra 管理センター（[entra.microsoft.com](https://entra.microsoft.com)）にアクセスできること

## 手順

### 1. Entra でアプリを登録する
1. [Microsoft Entra 管理センター](https://entra.microsoft.com) → **ID > アプリの登録 > 新規登録**。
2. 名前（例: `Service Hub`）を入力。
3. **サポートされているアカウントの種類**: 個人利用なら「任意の組織ディレクトリ + 個人 Microsoft アカウント」。
4. **リダイレクト URI**: プラットフォーム「パブリック クライアント/ネイティブ」で、デスクトップ版が
   使うループバックを登録します。
   - デスクトップ（Electron）: `http://127.0.0.1:<port>/callback`（`oauth.ts` のループバック実装に合わせる）
   - ブラウザ版（`file://` PKCE 貼り付け）: アウトオブバンド方式（`docs/PROXY_EXAMPLE.md` / `oauth/pkce.ts` 参照）
5. 登録後の **アプリケーション (クライアント) ID** を控えます。

### 2. API アクセス許可を付与する
**API のアクセス許可 > アクセス許可の追加 > Microsoft Graph > 委任されたアクセス許可** で
以下を追加します（`src/main/oauth.ts` の `microsoft-365` スコープと一致）:

| スコープ | 用途 |
|---|---|
| `User.Read` | サインイン中ユーザーのプロフィール |
| `Mail.Read` | Outlook メールの読み取り |
| `Mail.Send` | メール送信（`send-mail` アクション） |
| `Calendars.Read` | カレンダー予定の読み取り |
| `Calendars.ReadWrite` | 予定作成（`create-event` アクション） |
| `offline_access` | リフレッシュトークン（再認証なしの更新） |

職場・学校アカウントで管理者の同意が必要な場合は **「管理者の同意を与える」** を実行してください。

### 3. クライアント ID をアプリに渡す
取得したクライアント ID を環境変数 `MS365_OAUTH_CLIENT_ID` に設定します。

```bash
# 例: 起動前にエクスポート（クラウド実行環境では環境設定の env に登録）
export MS365_OAUTH_CLIENT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

未設定の場合、`isOAuthConfigured('microsoft-365')` が `false` を返し、サインインボタンは
無効になります（`oauth.ts:isOAuthConfigured`）。

### 4. アプリ内でサインインする（あなたの操作）
1. サイドバーから **Microsoft 365** を開く。
2. 認証情報スロットの **サインイン**（OAuth）を実行 → ブラウザで Microsoft にサインインし同意。
3. 取得したアクセストークンは OS キーチェーン（`safeStorage`）に暗号化保存され、レンダラーには
   渡りません（`secrets.ts`）。

## できること（サインイン後）
- **読み取り**: プロフィール表示名、直近の Outlook メール（未読件数つき）、直近のカレンダー予定。
- **書き込み**:
  - `send-mail` — 宛先・件名・本文を指定して Outlook からメール送信。
  - `create-event` — 件名・開始/終了日時・場所を指定して予定を作成（タイムゾーンは `Tokyo Standard Time`）。

いずれも Microsoft Graph `v1.0` を使用します。書き込みは上記スコープの同意が前提です。

## トラブルシュート
- **サインインボタンが無効** → `MS365_OAUTH_CLIENT_ID` 未設定。手順 3 を確認。
- **403 / スコープ不足** → 手順 2 のアクセス許可（特に `Mail.Send` / `Calendars.ReadWrite`）と
  管理者同意を確認。スコープ追加後は再サインインが必要。
- **リダイレクト不一致** → 手順 1-4 のリダイレクト URI が `oauth.ts` のループバック設定と一致しているか確認。

---
_本書はセットアップ手順のひな形です。テナントのポリシーにより手順が前後する場合があります。_
