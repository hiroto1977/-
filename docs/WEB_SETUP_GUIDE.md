# Web版 セットアップガイド（外部サービス連携を使う）

このガイドは、ブラウザ版（https://hiroto1977.github.io/-/ や `standalone.html`）で
**GitHub / Notion / Slack などの外部サービス連携を実際に動かす**ための手順です。

外部連携には次の2つが必要です。

1. **各サービスのトークン（合鍵）** … サービスごとに発行して、アプリの「設定」に入力
2. **プロキシ（中継サーバー）** … GitHub 以外のほとんどのサービスで必要（ブラウザの CORS 制約を回避するため）

> どの情報も**あなたのブラウザ内に暗号化保存**され、外部には送られません（プロキシは
> あなた自身が用意したものだけを経由します）。

---

## 機能ごとの必要条件 早見表

| サービス / 機能 | トークン | プロキシ | 備考 |
|---|---|---|---|
| GitHub Issue 作成 | ✅ PAT | 不要 | GitHub は CORS 許可済み |
| Notion ページ作成 | ✅ | ✅ | |
| Slack メッセージ送信 | ✅ | ✅ | |
| Atlassian (Jira) 課題作成 | ✅ JSON | ✅ | 下記参照 + 許可リストにサイトhost |
| Google カレンダー予定 / Gmail 下書き / Drive フォルダ | ✅ OAuth | ✅ | |
| WordPress 下書き | ✅ | ✅ | |
| Canva フォルダ | ✅ | ✅ | |
| Cloudflare DNS / キャッシュ | ✅ APIトークン | ✅ | |
| メール漏洩チェック (HIBP) | ✅ | ✅ | 有料の HIBP キーが必要 |
| URL スキャン (VirusTotal) | ✅ | ✅ | 無料キーで可 |
| Stocks / Emotions / 記録入力 など | 一部 AI のみ | 不要 | 端末内で動作 |
| Skills 実行 | — | — | ブラウザ版では不可（ローカル実行が必要） |

> **まず GitHub だけ**試すのが一番簡単です（プロキシ不要）。

---

## STEP 1: プロキシ（Cloudflare Worker）を用意する

GitHub 以外を使う場合のみ必要です。詳しい手順とコードは
**[docs/PROXY_EXAMPLE.md](PROXY_EXAMPLE.md)** にあります（約5分）。

ざっくり:

1. https://workers.cloudflare.com/ で無料アカウントを作成
2. 「Create Worker」→ PROXY_EXAMPLE.md のコードを貼り付け
3. **使うサービスのホストを `UPSTREAM_ALLOWLIST` に入れる**（既定で主要ホストは記載済み。
   Atlassian を使う人は自分の `your-team.atlassian.net` を追加）
4. 「Deploy」→ 発行された `https://....workers.dev` の URL を控える
5. アプリの **設定 → プロキシ** にその URL を登録

> セキュリティ上、このプロキシは**自分専用**にしてください（第三者に URL を教えない）。
> 任意で `SHARED_SECRET` を設定するとより安全です。

---

## STEP 2: 各サービスのトークンを取得して設定に入力

アプリの各サービスページ（または設定）でトークンを入力します。取得先は以下のとおり。

- **GitHub**: Settings → Developer settings → Personal access tokens →
  `repo` 権限の PAT（`ghp_…`）
- **Notion**: https://www.notion.so/my-integrations で Integration を作成し
  「Internal Integration Secret」。対象ページに Integration を「接続」しておく
- **Slack**: api.slack.com でアプリを作成し Bot Token（`xoxb-…`）。
  `chat:write` 権限を付与し、対象チャンネルに Bot を招待
- **Atlassian (Jira)**: id.atlassian.com → API tokens で発行。設定には
  **JSON 形式**で保存:
  `{"email":"you@example.com","token":"<APIトークン>","site":"https://your-team.atlassian.net"}`
- **Google（カレンダー / Gmail / Drive）**: 各サービスページの「ブラウザで認証」から
  OAuth ログイン（アクセストークンが保存されます）
- **WordPress.com**: developer.wordpress.com で OAuth トークン（`Bearer`）
- **Canva**: Canva Developers で Connect API のトークン
- **Cloudflare**: ダッシュボード → My Profile → API Tokens（Zone 編集権限）
- **セキュリティ（HIBP / VirusTotal）**: 設定に **JSON 形式**で保存:
  `{"hibp":"<HIBPキー>","vt":"<VirusTotalキー>"}`
  （HIBP は https://haveibeenpwned.com/API/Key 、VT は virustotal.com のアカウント設定）

---

## STEP 3: 使ってみる

1. 対象サービスのページを開く
2. 入力欄（例: GitHub なら owner / repo / title）を埋める
3. 実行ボタンを押す

うまくいかないときに出る主なメッセージ:

- **「トークンが未設定です」** → STEP 2 のトークン入力を確認
- **「プロキシが必要です…URLを登録してください」** → STEP 1 を実施
- **「proxy 4xx/5xx」「API 4xx」** → トークンの権限不足、または allowlist にホスト未登録

---

## よくある質問

- **Q. プロキシを立てたくない。** → GitHub Issue 作成と、ローカル系（Stocks /
  Emotions / 記録入力など）はプロキシ無しで使えます。
- **Q. 情報は外部に漏れない？** → トークンは端末内に暗号化保存。通信は
  あなた自身のプロキシのみを経由します。アプリ運営側のサーバーには送られません。
- **Q. Skills は？** → ブラウザ版では実行できません（ローカルでのコマンド実行が
  必要なため）。デスクトップ（Electron）版をご利用ください。
