# セキュリティ脅威モデル + 緩和策

Service Hub の脅威モデルと、それに対する具体的な防御。実装後の見直しは
GitHub Issues / PR ベースで運用。

## 脅威モデル

| 攻撃者 | 想定アクセスレベル | 目的 |
|---|---|---|
| **A1 ローカル非特権** | 同一マシン上の別ユーザ | 他ユーザのトークンを盗む |
| **A2 ローカル特権** | 同一マシンで該当ユーザのファイルを読める | トークン取得 |
| **A3 攻撃ウェブサイト** | ブラウザ経由 | XSS / redirect 経由でアプリ操作 |
| **A4 中間者 (MITM)** | ネットワーク経路 | API リクエストの傍受 / 改ざん |
| **A5 悪意あるサービスサイト** | サイト URL を保存させる | アプリ経由で別サイトに資格情報を送らせる |
| **A6 CVE のあるサードパーティ** | 依存ライブラリ経由 | 任意コード実行 |
| **A7 Ollama** | ローカル LLM サーバの既知 / 未パッチ脆弱性 | メモリ漏洩 / RCE / DoS |

## 緩和策一覧

### A1, A2: トークン保管

| 攻撃 | 緩和 | 実装場所 |
|---|---|---|
| 別ユーザによる secrets.json 読み取り | `mode: 0o600` (owner-only read) | `src/main/secrets.ts` `writeStore` |
| 同一ユーザのファイル流出 | OS keychain (`safeStorage`) で AES 暗号化 | `src/main/secrets.ts` `encode/decode` |
| keychain 非利用環境 | plain-base64 フォールバック（**警告: 暗号化ではない**） | 同上 |

**plain-base64 は実質平文**。Linux で gnome-keyring / kwallet が無い場合、
ファイルアクセスを得た攻撃者はトークンを即時取得可能。これを根本解決するには
ユーザパスフレーズによるキー導出が必要（未実装、roadmap）。

### A3: XSS / 悪意ある外部コンテンツ

| 攻撃 | 緩和 |
|---|---|
| Renderer での任意スクリプト実行 | Content-Security-Policy (`src/renderer/index.html`): `script-src 'self'` で外部・インラインスクリプト全拒否 |
| `<base>` タグ注入による相対 URL 乗っ取り | `base-uri 'self'` |
| `<form>` POST による情報抜き出し | `form-action 'none'` |
| `<iframe>` 経由クリックジャック | `frame-src 'none'` |
| `<object>` プラグイン | `object-src 'none'` |
| ノードアクセス権限剥奪 | `contextIsolation: true` + `nodeIntegration: false` + `sandbox: true` |
| renderer から file:// 等のスキーム経由でファイル読み出し | `app:openExternal` IPC が http(s) のみ受理 |
| 新 window 開放 | `setWindowOpenHandler` で全部 deny + `openExternal` 経由 |

### A7: Ollama (ローカル LLM サーバ)

| 攻撃 | 緩和 |
|---|---|
| Ollama 既知 CVE (Probllama / CVE-2024-37032 系統) | `MIN_SAFE_VERSION = 0.1.46` をクライアントにハードコード、起動時に `/api/version` で照合 → 古ければ警告バッジ |
| 未パッチ OOB read 脆弱性 (モデル/エンジンファイル形状由来) | `/api/pull` / `/api/create` / `/api/push` をクライアントから呼ばない設計。悪意あるモデルロードの経路を遮断 |
| 接続先改ざん (`OLLAMA_HOST` 設定や IPC 経由で別ホスト誘導) | URL を `http://127.0.0.1:11434` に **ハードコード**。renderer / IPC ペイロードでは変更不可 |
| モデル名へのパストラバーサル / コマンドインジェクション | `^[a-z0-9][a-z0-9._:/-]+$` 正規表現で sanitize、`..` 含有を別途 reject |
| 巨大レスポンスによる OOM / DoS | 30s timeout (AbortController)、10 MB レスポンス上限、stream:false 固定 |
| Ollama 自体のネットワーク露出 | 運用文書 (`docs/OLLAMA_SECURITY.md`) で `OLLAMA_HOST=127.0.0.1:11434` 固定 + firewall を推奨 |

詳細は `docs/OLLAMA_SECURITY.md`。

### A4: MITM

| 攻撃 | 緩和 |
|---|---|
| API トラフィック傍受 | 全 fetcher が https のみ使用 |
| Atlassian の Basic auth が http で送られる | `parseAtlassianToken` が **`https://` 必須**、`http://` を hard reject |
| OAuth リダイレクト改ざん | PKCE (RFC 7636) で `code` を verifier 必須化 — code を傍受しても token 交換不可 |
| OAuth state CSRF | `randomBytes(16)` 由来の state を検証 |
| OAuth callback ホスト偽装 | ループバックサーバが `Host` ヘッダを 127.0.0.1/localhost/[::1] のみ許可 |

### A5: 悪意ある保存先 URL

| 攻撃 | 緩和 |
|---|---|
| Atlassian site に攻撃サイトを保存 → 認証情報送信 | `parseAtlassianToken` が `https://` + 解釈可能な URL を要求 |
| WordPress site_id にスクリプト | `encodeURIComponent` で path escape |
| Cloudflare zone id にスクリプト | 同上 |
| openExternal を javascript: 等で誘導 | http(s) のみ許可 |

### A6: サプライチェーン

| 攻撃 | 緩和 |
|---|---|
| 既知 CVE のあるパッケージ | `npm audit --omit=dev` で **production 0 件** を維持。dev deps の CVE は run-time に影響しないため許容 |
| 不審な新規依存追加 | PR ごとの diff レビュー、`package-lock.json` 同梱 |
| build chain の改ざん | `electron-builder` を pin (`^25.1.8`) |

## ネットワーク呼び出しの全リスト

すべて https。各サービスがアクセスするドメインを明示:

| サービス | アクセス先 |
|---|---|
| GitHub | `api.github.com` |
| WordPress.com | `public-api.wordpress.com` |
| Atlassian | `{site}.atlassian.net` (https のみ) |
| Notion | `api.notion.com` |
| Google (Drive/Calendar/Gmail) | `www.googleapis.com`, `gmail.googleapis.com`, `accounts.google.com`, `oauth2.googleapis.com` |
| Slack | `slack.com` |
| Canva | `api.canva.com` |
| Skills (Anthropic) | `api.anthropic.com` |
| Security (HIBP/VT) | `haveibeenpwned.com`, `www.virustotal.com` |
| Cloudflare | `api.cloudflare.com` |
| Emotions (Anthropic) | `api.anthropic.com` |

`shell.openExternal` 経由でユーザブラウザに開かれる URL は別管理 — 各サービスタブの
「開く」ボタン経由のみ、http(s) のみ許可。

## 残課題（roadmap）

1. **パスフレーズベース暗号化** — keychain 非利用環境でも本物の AES 暗号化
2. **電子署名** — macOS Developer ID + Windows EV 証明書（`docs/REMAINING_WORK.md` Phase 7-1）
3. **自動アップデートの TLS 検証** — `electron-updater` 導入時にコード署名で integrity 確認
4. **CSP nonce** — 現状 `'self'` 一括許可、将来的に script に nonce を付ける
5. **Subresource Integrity** — 外部 CDN を使わない設計なので現状不要だが、追加時は SRI 必須

## レビューチェックリスト

新しい fetcher / action を追加する PR で確認するもの:

- [ ] エンドポイント URL は https
- [ ] ユーザ入力の URL は `new URL().protocol === 'https:'` で検証
- [ ] ユーザ入力の path 部分は `encodeURIComponent`
- [ ] `Authorization` ヘッダを log 出力していない
- [ ] エラーメッセージで API キーを echo していない (`message.slice(0, 200)` のみ)
- [ ] OAuth フローは PKCE + state 検証 を満たす

## 関連

法令を踏まえたトラブル防止ルール（個人情報保護法／不正アクセス禁止法／各士業法／景表法 等
への対応と担保状況）は [docs/COMPLIANCE_RULES.md](./COMPLIANCE_RULES.md) を参照。
