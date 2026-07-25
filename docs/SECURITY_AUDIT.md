# セキュリティ監査レポート

最終監査日: 2026-07-25 (第2ラウンド・5並列エージェント + 手動)  
監査対象 commit: 149adaea (第1ラウンド: 2026-05-12 / 8b0a0ca)

## サマリ

### 第2ラウンド (2026-07-25) — 全件修正済み

Electron main / OAuth+PKCE / プロキシ SSRF ガード / WebCrypto Vault / XSS・ビルド時
インジェクション の5面を並列監査し、**実在が確認できた指摘のみ**修正した (エージェント
の主張は全件こちらで再現・検証してから着手。再現できなかったものは修正していない)。

| # | 重大度 | 対象 | 内容 | 状態 |
|---|---|---|---|---|
| R2-1 | 中 (Windows では影響大) | `main.ts` `app:openPath` / `app:revealInFolder` | `$HOME` 配下の**任意ファイル**を OS 既定アプリで開けた (Windows では `.exe` 実行プリミティブ) | 修正 |
| R2-2 | 中 | `business/stocks/templates/teamradar` の `customPath` | `$HOME` 配下の任意 `.html/.md/.svg` を作成・上書きできた (R2-1 の材料設置に直結) | 修正 |
| R2-3 | 中 | `dataCrypto.ts` | PBKDF2-SHA256 の反復が **210,000** (OWASP SHA-256 基準は 600,000。210k は SHA-512 の行を誤記) → バックアップの総当り耐性が意図の 1/3 | 修正 |
| R2-4 | 中 | `vault.ts` | マスターパスワード最低 **8 文字** — `kcv`/`master-wrap` によりオフライン検証が可能なため、プロファイル窃取時の総当りに耐えない | 修正 (12 文字) |
| R2-5 | 中 | `proxy.ts` SSRF ガード | **末尾ドット** (`localhost.` / `metadata.google.internal.` / `x.internal.`) で名前ベースの全規則を回避できた (実測再現済み) | 修正 |
| R2-6 | 中 | `proxy.ts` | 検証したのは `parsed` なのに転送は**生文字列** — プロキシ側パーサ差分で SSRF (`https://public.com\@169.254.169.254/`) | 修正 (`parsed.href` 転送) |
| R2-7 | 低 | `assets/sw.js` | 全 GET を Cache Storage に平文保存 — CORS 対応第三者 API のレスポンス (業務データ) が Vault の暗号化・自動ロックを迂回して端末に残りうる | 修正 (同一オリジン限定) |
| R2-8 | 低 | `inline-html.cjs` CSP | `worker-src` 未指定 → `script-src` へフォールバックし **SW が一切登録できていなかった** (PWA オフライン/インストールが無効) | 修正 |
| R2-9 | 低 | `oauth.ts` | `state` 不一致もサーバ自己終了カウンタに算入 → ローカルプロセスが偽コールバック 50 発で正規フローを DoS 可能 (この分岐が防ぐはずの攻撃を再導入していた) | 修正 |
| R2-10 | 低 | `oauth.ts` | `tokenUrl` の https 未検証 / トークン交換エラー本文の redaction 漏れ | 修正 (多層防御) |
| R2-11 | 低 | `dataCrypto.ts` | 自己記述の `iterations` に上限なし → 悪意ある bundle で CPU-DoS | 修正 (10万〜400万にクランプ) |
| R2-12 | 低 | `vault.ts` | `clearToken` がロック中でも動作・`serviceId` 未検証 / `unlock()` の例外時に生マスター鍵を zero 化しない | 修正 |
| R2-13 | 低 | 書類メーカー3種 + landing | `JSON.stringify` を inline `<script>` に埋め込み `<` 未エスケープ → データに `</script>` が入るとページ崩壊 (2026-07-24 の Pages 事故と同型)。`replace(str,str)` の `$&` 解釈も同時に是正 | 修正 |

**修正しなかった (受容 / 上流責務)**:
- SSRF ガードは**ホスト名文字列のみ**を見るため、公開 DNS が私設 IP を返す形 (`169-254-169-254.sslip.io`, DNS リバインド) は原理的に client 側では防げない → プロキシ側の解決後 IP 再検査が本質的な防御線 (`docs/PROXY_EXAMPLE.md` §3 に明記済み・リダイレクト各ホップの再検査も同様)。
- リカバリー 24 語のクリップボード / 平文 `.txt` 保存は「書き留める」UX と不可分。
- `webauthn.ts` は未配線のまま。`verifyBiometric` は署名検証をしていなかったため **fail-closed 化済み** (認証器を呼ぶ前に throw し、誤って解錠ゲートに配線されても通らない)。将来実装する場合の不変条件 — マスターパスワード/派生鍵を生体解錠のために保存しないこと — をモジュール冒頭と `docs/SECURITY_CHAIN.md` §3 に明記した。
- `secrets.ts` の `plain:` フォールバック (keychain 不在 Linux) は第1ラウンドで受容済み。

production npm audit: **0 脆弱性**。dev 依存には 29 件 (electron-builder / vitest / vite 系) あるが
出荷物 (`standalone.html` / Electron ランタイム) の依存ツリー (react, react-dom) には 1 件も入らない。
**ただし Electron 本体は ^33 ピン留めで既知 CVE あり (最新は 43)** — メジャー更新は破壊的変更を伴うため
別タスクとして残す。

### 第1ラウンド (2026-05-12)

| 重大度 | 件数 | 状態 |
|---|---|---|
| P0 (致命) | 0 | — |
| P1 (高) | 5 | **全件修正済み** |
| P2 (中) | 4 | 修正済み 2 / 受容可能なリスク 2 |
| P3 (低) | 3 | 文書化済み |
| Info | 6 | 既存防御で対応済み (本ファイルに記載) |

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

## Defense-in-depth 強化 (2026-05-12 追加)

セキュリティレビューで「false-positive と判定したが hardening 価値あり」として
記録された 2 項目を実装:

### Skills: ファイル名 allowlist + パスコンテインメント

**実装位置**: `src/main/clients/skills.ts` `readSkillBody()` + `isSafeSkillName()`

- `isSafeSkillName(name)`: `^[A-Za-z0-9_-][A-Za-z0-9._-]*$` 限定 + length ≤ 128 + `..`
  reject + 先頭ドット reject。`/`, `\`, NUL, 空白, `:`, `;`, `|`, `` ` ``, `$` 全部禁止。
- `path.resolve(candidate).startsWith(path.resolve(base) + path.sep)` で belt-and-braces。
  Windows alternate separators / 短名 / シンボリックリンク等の platform quirk に対する保険。

テスト: 例ベース 8 件 + property-based 3 件 (500 ランダム名で `..` / `/` / `\` / NUL /
shell metachars が必ず reject されることを確認)。

### Gmail: RFC 2822 ヘッダ injection 拒否

**実装位置**: `src/main/clients/gmail.ts` `buildRfc2822()` + `isSafeHeaderValue()`

- `isSafeHeaderValue(value)`: `/[\r\n\0]/` を含む場合 false。`buildRfc2822` の冒頭で
  `to` を検証し、CRLF が含まれていれば throw。
- `subject` は base64 encoded なので安全 (検査不要)。
- 現状では `to` 以外の生連結ヘッダソースは存在しないが、追加された際は同じ check を通すこと。

テスト: 例ベース 7 件 + property-based 2 件 (400 ランダム値で `\r` / `\n` / `\0` 注入を
必ず拒否、それ以外は accept)。

## Ollama 未パッチ脆弱性に対する追加防御 (2026-05-12 追加)

外部報告された Ollama の model/engine file parser における OOB read 脆弱性
(ベンダー報告済み、公式パッチ未公開) に対する多層防御を追加:

- **`ALLOWED_ENDPOINTS` 集合** (`src/main/clients/ollama.ts`): `/api/version`,
  `/api/tags`, `/api/chat` のみ。`withTimeout()` ヘルパで fetch 直前に runtime 検証。
  将来開発者が `/api/pull|create|push|copy|delete|blobs|upload` を呼ぼうとすると
  `FetchError("ollama endpoint not in allowlist")` で即座に拒否。
- **`UNPATCHED_OOB_NOTICE`**: Ollama 起動中の毎リクエストで snapshot.warnings に追加し、
  ステータスバーで継続的にユーザへ「検証済みソースのみからモデル取得」を促す。
- **null byte rejection**: chat の prompt / system に `\0` が含まれる場合は
  ネットワーク呼び出し前に拒否 (上流パーサバグの典型的な foothold)。
- **property-based fuzz** (`src/main/__tests__/property.test.ts`):
  - 300 ランダム URL で write-side path / non-loopback host が allowlist 通らないことを検証
  - 200 ランダム model name で whitespace / shell metachars / null byte / 制御文字 / `..` を reject することを検証
