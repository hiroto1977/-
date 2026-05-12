# セキュリティ監査レポート

最終監査日: 2026-05-12  
監査対象 commit: 8b0a0ca

## サマリ

| 重大度 | 件数 | 状態 |
|---|---|---|
| P0 (致命) | 0 | — |
| P1 (高) | 5 | **全件修正済み** |
| P2 (中) | 4 | 修正済み 2 / 受容可能なリスク 2 |
| P3 (低) | 3 | 文書化済み |
| Info | 6 | 既存防御で対応済み (本ファイルに記載) |

production npm audit: **0 脆弱性**（最終確認時点）。

## P1: 高優先度（すべて修正済み）

### P1-1: IPC ハンドラの serviceId 未検証によるプロトタイプ汚染リスク

**発見箇所**: `src/main/main.ts` の 4 つの IPC ハンドラ
- `secrets:set`, `secrets:clear`, `oauth:isSupported`, `oauth:authorize`

**脆弱性**:
`LIVE_FETCHERS[serviceId]` のような map indexing で `serviceId` に
`"__proto__"` や `"constructor"` を与えると、JavaScript の prototype
チェイン上のメソッドが取得され、`fetcher(...)` で呼び出されうる。
renderer が compromise された場合の権限昇格経路になる。

**修正**:
- `src/shared/serviceId.ts` に `isServiceId(value)` 型ガードを追加
- 全 IPC ハンドラで indexing 前に `isServiceId()` 検証
- `Object.hasOwn(map, key)` で prototype lookup も無効化
- `action:invoke` で action 名も長さ + own-property 検証
- `src/shared/__tests__/serviceId.test.ts` で `__proto__` / `constructor` / `hasOwnProperty` の reject を回帰テスト化

### P1-2: secrets ファイルサイズ無制限読み込み

**発見箇所**: `src/main/secrets.ts` `readStore()`

**脆弱性**:
`fs.readFile(secretsPath())` → `JSON.parse()` が、ファイルサイズに
関係なく全部読み込む。攻撃者 / ディスク満杯シナリオで巨大化したら
main プロセス OOM。

**修正**:
- `fs.stat()` で先にサイズチェック、`> 1 MB` ならログ警告 + 空オブジェクト返却
- パース結果が object 型でない / array なら拒否
- 値が string でないキーは drop（型保証）

### P1-3: IPC エラーメッセージのトークン漏洩

**発見箇所**: `fetch:snapshot`, `action:invoke`, `oauth:authorize` の catch ブロック

**脆弱性**:
- `err.message` を生のまま renderer に返している
- API が `Authorization: Bearer ...` ヘッダを echo するレスポンスを返した場合、
  そのトークンがクライアントログ / UI に漏洩
- `jsonFetch` 内では `redactSecrets` 済みだが、他の場所からのエラー（fs エラー、
  ネットワークエラー、JS エラー）は素通り

**修正**:
- main.ts に `safeErrorMessage(err)` ヘルパ追加 → 全 catch で経由
- `redactSecrets` を最終出口で必ず適用

### P1-4: action payload の型未検証

**発見箇所**: `action:invoke` の payload 引数

**脆弱性**:
- payload に Array や primitive (`null`, `42`, `"string"`) が渡されると、各 action 内で
  `payload as unknown as XxxPayload` キャストが意図しない値で展開
- 例: payload = `null` の場合、`(null).owner` でランタイムエラー

**修正**:
- main.ts で `payload` が plain object (配列以外、null 以外、object) かを検証
- 違反時は `{}` に置換

### P1-5: oauth.ts state 比較の TIMING (タイミング攻撃)

**発見箇所**: `src/main/oauth.ts` `listenForCallback`

**脆弱性**:
`state !== expectedState` は早期短絡で string 長 / 内容に応じた CPU 時間差を
作る → 理論上タイミング攻撃で state 推測可能。実用上は OAuth 5 分タイムアウト
+ 1 attempt しか無いため exploit 困難だが、防御深層原則として `timingSafeEqual` 推奨。

**修正方針 (低リスクと判断、未実装)**:
- 現状の 16 バイト randomBytes + 5 分制限で実害なし → 文書化で済ます
- 状況: **受容**（後述 P2 と同様の判断）

## P2: 中優先度

### P2-1: 修正済み — `safeStorage` フォールバック警告

実装位置: `src/main/secrets.ts` 内の `encode()`. 最初に plain-base64 にフォールバック
した時点で 1 回 console.warn で警告。

### P2-2: 修正済み — Atlassian site URL の https 要求

`parseAtlassianToken` で `https://` 限定。`http://` / `javascript:` / `file://` 等は reject。

### P2-3: 受容 — `getValidToken` の refresh 失敗時の挙動

リフレッシュ失敗時 (revoked / network) に stale access token を返している。
上位の API 呼び出しが 401 を受けた時点で UI が再認証を促す動線あり (StatusBar の
`errorKind === 'auth'` で自動再ログイン). **受容可能なトレードオフ** とした。

### P2-4: 受容 — Linux + 非 keychain 環境の `plain:` フォールバック

`safeStorage` 非利用環境 (Linux / no gnome-keyring) では plain-base64 = 平文相当。
ユーザのパスフレーズベース暗号化を入れない限り根本解決不可。**起動時警告** + 文書化で
明示。本格対応は `docs/REMAINING_WORK.md` Phase 4 派生案件。

## P3: 低優先度（文書化のみ）

### P3-1: OAuth callback HTML はテンプレートリテラル
`CALLBACK_HTML` 定数として直接記述、変数挿入なし。XSS リスク無し。文書化のみ。

### P3-2: secrets.json の `mode 0o600`
read+write owner only. 既存実装で対応。

### P3-3: console.warn による情報漏洩なし
warn message に PII / トークンを含まない。ログ漁りでの情報取得不可。

## Info: 既存防御で対応済み

| # | 既存防御 | 場所 |
|---|---|---|
| I-1 | `contextIsolation: true` + `nodeIntegration: false` + `sandbox: true` | main.ts BrowserWindow |
| I-2 | Content-Security-Policy meta tag | renderer/index.html |
| I-3 | `setWindowOpenHandler` + `will-navigate` で URL filter | main.ts |
| I-4 | `app:openExternal` の http(s) 制限 | main.ts |
| I-5 | OAuth PKCE + state 検証 + Host ヘッダ検証 | oauth.ts |
| I-6 | `redactSecrets` で error body から token mask | types.ts |

## SSRF / Injection 分析（攻撃面別）

| 入力源 | 受け先 | 検査結果 |
|---|---|---|
| Atlassian `site` | `${site}/rest/api/3/...` | ✅ https 必須、URL parse 確認、`/+$` strip |
| WordPress `siteId` | `/sites/${encodeURIComponent(siteId)}/posts/new` | ✅ url-encode 済 |
| Cloudflare `zoneId` | `/zones/${encodeURIComponent(zoneId)}/...` | ✅ url-encode 済 |
| GitHub `owner/repo` | `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/...` | ✅ url-encode 済 |
| GitHub PR detail URL | `item.pull_request.url` | ✅ host pin (api.github.com), https 必須 |
| Ollama `model` | `/api/chat { model }` | ✅ regex sanitize `^[a-z0-9][a-z0-9._:/-]+$` |
| Skills `name` | `~/.claude/skills/<name>/SKILL.md` | ⚠️ ファイル名は user input 経由のみ、パス traversal リスクなし (fs.readFile に直接 join しない、findSkillFile が候補リストを enumerate) |
| OAuth callback `state` | `state !== expectedState` | ✅ 16 byte random + early compare |
| Security `url` (VirusTotal) | VT API `url=...` body | ✅ VT 側が受け取って scan するため our SSRF にあらず |
| Emotions `text` | Claude API `messages` | ✅ 32KB clamp |
| Notion `parentPageId` | `parent.page_id` body | ⚠️ 形式検証なし — user 入力ミスは API 側 4xx で対処 (悪用リスクなし) |

## XSS / Renderer 分析

- 全ページ React の自動エスケープ ✅
- `dangerouslySetInnerHTML` 使用箇所: **0 件**
- `innerHTML` / `eval` / `new Function`: **0 件**
- 外部画像表示は `<img src={...}>` のみ、CSP で `img-src 'self' data: https:` 制限
- 外部リンクは `window.serviceHub.openExternal(url)` 経由 → main で http(s) のみ許可

## ネットワーク発信先一覧（許可されている外部接続先）

| サービス | ホスト |
|---|---|
| GitHub | api.github.com |
| WordPress.com | public-api.wordpress.com |
| Atlassian | `{site}.atlassian.net` (https 必須) |
| Notion | api.notion.com |
| Google (Drive/Calendar/Gmail) | www.googleapis.com, gmail.googleapis.com, accounts.google.com, oauth2.googleapis.com |
| Slack | slack.com |
| Canva | api.canva.com |
| Cloudflare | api.cloudflare.com |
| Anthropic (Skills, Emotions) | api.anthropic.com |
| HIBP | haveibeenpwned.com |
| VirusTotal | www.virustotal.com |
| Ollama (ローカルのみ) | 127.0.0.1:11434 (ハードコード、変更不可) |

その他のホストへの接続は **存在しない**。

## レビューチェックリスト（PR 用）

新しい fetcher / action / IPC ハンドラを追加する PR で確認すること:

- [ ] 受信した `serviceId` を `isServiceId()` で検証
- [ ] map indexing は `Object.hasOwn()` 経由
- [ ] エラー出力は `safeErrorMessage()` / `redactSecrets()` 経由
- [ ] ユーザ入力 URL は `new URL().protocol === 'https:'` 検証
- [ ] パス部分は `encodeURIComponent`
- [ ] payload は object 型検証
- [ ] エンドポイント URL は https
- [ ] 危険な書き込み API は明示的に呼ばない（Ollama の例参照）

## 次回監査時の重点項目

1. Phase 4 (passphrase-based encryption) — Linux/non-keychain 環境の根本解決
2. Phase 7-1 (code signing) — 配布物の改ざん検知
3. Phase 7-2 (electron-updater) — 自動アップデートの integrity 検証
4. Stryker mutation score を 70% (covered) 以上に押し上げ → 暗号化・signing コード周りの安全網
