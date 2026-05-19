# Cloudflare タブ セットアップ

Service Hub の **Cloudflare** タブは、自分の Cloudflare アカウントに紐づくゾーン
（ドメイン）の状態を一覧表示し、よく使う 2 つの書き込み操作を 1 クリックで実行
できる UI を提供します。

| 機能 | API |
|---|---|
| ゾーン一覧表示 | `GET /user` + `GET /zones?per_page=50` |
| DNS レコード作成 | `POST /zones/{id}/dns_records` |
| キャッシュパージ | `POST /zones/{id}/purge_cache` |

## API トークンの作成

1. https://dash.cloudflare.com/profile/api-tokens を開く
2. 「Create Token」→「Custom token」
3. 名前を「Service Hub」など分かりやすく
4. **Permissions** に以下 3 つを追加:
   - **Zone** → **Zone** → **Read**
   - **Zone** → **DNS** → **Edit**         （DNS レコード作成に必要）
   - **Zone** → **Cache Purge** → **Purge**（キャッシュパージに必要）
5. **Zone Resources**: `All zones` か、特定ゾーンに絞る
6. 「Continue to summary」→「Create Token」
7. 表示された **40 文字の API トークン** をコピー（再表示不可、必ず控える）

レガシーの「Global API Key」は対応していません。スコープを絞れる API トークンの方が
セキュリティ的に圧倒的に安全。

## アプリへの設定

Cloudflare タブの **「API トークン」** ボタンに上記トークンを貼り付け → 「保存」。
バッジが `Snapshot` → `Live` に切り替わり、自分のゾーン一覧が表示されます。

## できること

### Zones セクション

各ゾーンを以下の情報で表示:
- ドメイン名
- ステータス (`active` / `pending` / `paused`)
- プラン (`Free` / `Pro` / `Business` / `Enterprise`)
- アカウント名
- ネームサーバ (上位 2 件)
- 開発モード状態（オン時は残り分数を表示）
- クリックでダッシュボードを開く

### DNS レコード作成

ゾーンを選んで以下を入力:
- **Type**: A / AAAA / CNAME / TXT / MX
- **Name**: `@` (root) / `www` / `api` / FQDN
- **Content**: IP アドレス、ターゲット FQDN、TXT 値など
- **Proxy** (A/AAAA/CNAME のみ): Cloudflare プロキシ経由（オレンジ雲）にするか

`TTL` は常に `1`（automatic）で送信。

業務応用例:
- デプロイ後の `api.example.com` 切り替え
- メール認証用 SPF/DKIM/DMARC レコードの追加
- Let's Encrypt の DNS-01 challenge 用 TXT レコード

### キャッシュパージ

2 モード:
- **URL を指定**: 改行区切りで複数 URL を入力 → それらだけ強制 invalidate
- **ゾーン全体**（破壊的）: ゾーン内の全キャッシュを削除（CDN が origin から再取得し始める）

業務応用例:
- 静的アセット (`/style.css`, `/app.js`) のリビジョン更新後に該当 URL だけパージ
- サイト全面リニューアル時に全キャッシュを paint

## 制約

- 1 ページの zones 取得は最大 50（`?per_page=50`）。それ以上のゾーンを持つアカウント
  は次ページネーションが必要 — 現実装では未対応。
- `Cloudflare for Teams` (Zero Trust) や `R2` は別 API スコープ。本タブには含めていない。
- API トークンは安全な保管が前提。`safeStorage` で OS keychain 暗号化済み。
