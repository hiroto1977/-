# Browser-native Redesign — Service Hub Web Edition

> Status: **設計図 (Blueprint)** — 実装前のレビュー対象
> Target: 既存 Electron 版と同等機能をブラウザ単体 (no install, no server) で実現
> Scope: Phase A-D の 4 段階マイグレーション。

---

## 0. なぜ書き換えるか — 現行 web-shim.ts の限界

`src/renderer/web-shim.ts` (commit `97f7e83`) で「とりあえずブラウザで動く」段階は達成したが、3 つの本質的機能が落ちている。Electron の保護機構 (`safeStorage` / IPC sandbox / `shell.*`) に依存していた箇所が、ブラウザ環境では別設計が必要。

| 項目 | Electron 版 | 現 web-shim | 本設計後 |
|---|---|---|---|
| Anthropic API 経営アドバイザー | ✅ safeStorage に AES 暗号化 | ❌ disabled | ✅ Vault + 直接呼び出し |
| GitHub / Slack / Notion 連携 | ✅ safeStorage | ❌ disabled | ✅ Vault + 直接 / proxy |
| OAuth (Drive / Calendar / Gmail) | ✅ ローカルサーバ + state | ❌ disabled | ✅ PKCE in popup |
| 保存先フォルダを開く | ✅ shell.showItemInFolder | ❌ alert | ✅ In-app Library + File System Access API |
| エクスポート保管 | ✅ ファイルシステム | ⚠️ Downloads 任せ | ✅ IndexedDB Blob + ライブラリ画面 |

---

## 1. 問題点の徹底解析

### 1.1 AI 経営アドバイザー (Anthropic API)

**現状の依存:**
- 旧パス: `BusinessPage.tsx → serviceHub.invoke('business', 'advise', …) → main.ts → business.ts askBusinessAdvisorImpl → fetch('https://api.anthropic.com/v1/messages', { x-api-key: ctx.token })`
- トークンは `src/main/secrets.ts` で OS の Keychain / safeStorage に暗号化保管。

**ブラウザでの障壁:**

| 障壁 | 詳細 | 対策有無 |
|---|---|---|
| トークン保管の安全性 | `localStorage` は XSS で即漏洩。`sessionStorage` も同様だが寿命が短い。 | ✅ WebCrypto で AES-GCM 暗号化、マスターパスワード必須 |
| CORS | Anthropic API は 2024 末から `anthropic-dangerous-direct-browser-access: true` ヘッダー必須で直接呼び出しを許可 | ✅ ヘッダー追加 + 警告 UI |
| キー漏洩リスク | DevTools / fetch ログから素のキーが見える | ✅ 不可避だが「共用 PC で使わない」警告 + キーは平文では永続化しない |
| Origin policy | `file://` プロトコルで開くと一部 CORS pre-flight が失敗する場合がある | ✅ standalone HTML は file:// で動作確認済、connect-src CSP で許可 |

**結論:** Anthropic API は技術的にはブラウザから呼べる。**真の課題はキー保管の安全性。** Vault モジュールで解決。

### 1.2 外部 SaaS 連携 (GitHub / Slack / Notion / etc.)

**API ごとの直接呼び出し可否マトリクス:**

| Service | 認証 | CORS Browser 直接 | プロキシ必須? |
|---|---|---|---|
| GitHub | PAT (Bearer) | ✅ 公開 API は CORS 許可 | No |
| WordPress.com | Bearer | ✅ | No |
| Atlassian (Jira / Confluence) | Basic + Site URL | ❌ CORS なし | **Yes** |
| Notion | Bearer | ❌ `api.notion.com` は CORS なし | **Yes** |
| Google Drive / Calendar / Gmail | OAuth Bearer | ✅ `gapi` 互換、CORS 許可 | No |
| Slack | Bearer | ⚠️ 一部 endpoint のみ | 一部 Yes |
| Canva | Bearer | ⚠️ 確認中 (現状 `create-folder` のみ実装) | TBD |
| Anthropic (Skills / Emotions / Business advisor) | x-api-key | ✅ `dangerous-direct-browser-access` で可 | No |
| Cloudflare API | Bearer | ❌ CORS なし | **Yes** |
| HIBP (Security) | API key | ✅ CORS あり | No |
| VirusTotal | API key | ✅ | No |

**結論:** 大半は直接呼び出し可。CORS ブロックされる **Atlassian / Notion / Cloudflare** のみ、ユーザー指定の **BYO Proxy URL** (Cloudflare Worker / Vercel Function 等) を経由する設計が必要。

### 1.3 「保存先フォルダを開く」

**現状の依存:**
- `shell.showItemInFolder(path)` (Electron main) — OS の Finder / Explorer を起動

**Web Platform で取れる選択肢:**

| 選択肢 | 対応ブラウザ | UX | 永続性 |
|---|---|---|---|
| `<a download>` (現状) | 全 | 都度 Downloads フォルダへ。ユーザーは OS で探す必要あり | × アプリ内では追えない |
| File System Access API | Chrome 86+ / Edge 86+ / Opera 72+。Safari / Firefox ✗ | ユーザーが 1 回フォルダを許可すれば、以降そこに自動保存 | ◯ 許可は永続 |
| Origin Private File System (OPFS) | 全モダンブラウザ | アプリ専用 sandbox。ユーザーには見えない | ◯ |
| IndexedDB (Blob) | 全モダンブラウザ | アプリ内ライブラリで管理 | ◯ ブラウザのデータ削除で消える |

**結論:**「OS フォルダを開く」発想自体をブラウザ側に持ち込まない。**アプリ内ライブラリ** が答え:
- 全エクスポートを **IndexedDB に Blob で保管**
- 「ライブラリ」ページから一覧 / プレビュー / 再ダウンロード / 削除 / Canva へ送信
- File System Access API 対応ブラウザでは **追加で**「保存先フォルダに同期」オプション

---

## 2. 設計原則

1. **Zero Trust client-side crypto** — トークンは必ず暗号化 (`WebCrypto AES-GCM-256`)
2. **No clear-text persistence** — 平文の secret は IndexedDB / localStorage / sessionStorage どこにも書かない
3. **Master password derivation** — ユーザー入力 → `PBKDF2-SHA256` 600k 回 → AES 鍵
4. **In-memory key handle only** — 復号鍵は `crypto.subtle.importKey({extractable: false})`、メモリのみ
5. **Auto-lock** — タブ切替・スリープ復帰時に自動ロック (configurable)
6. **No OS dependency** — `shell.*` / `process.*` / `fs.*` 一切使わない
7. **Graceful degradation** — File System Access API 非対応でも完全動作
8. **Single HTML deliverable** — `dist/standalone.html` 1 ファイルで全機能動作
9. **CSP no `unsafe-inline`** — ホスト版は SHA-256 hash でインライン script を許可

---

## 3. アーキテクチャ

### 3.1 Credential Vault (`src/renderer/security/vault.ts`)

```typescript
export interface Vault {
  isInitialized(): Promise<boolean>;    // IndexedDB に salt が存在するか
  isUnlocked(): boolean;                 // メモリに鍵があるか
  initialize(password: string): Promise<void>;  // 初回: salt 生成 + masterKey 派生
  unlock(password: string): Promise<void>;       // 既存 salt で派生 + 検証 (KCV)
  lock(): void;                          // メモリから鍵を破棄

  setToken(serviceId: ServiceId, token: string): Promise<void>;
  getToken(serviceId: ServiceId): Promise<string | null>;
  clearToken(serviceId: ServiceId): Promise<void>;
  listConfigured(): Promise<ServiceId[]>;
}
```

**実装:**
- IndexedDB store `vault`:
  ```
  vault.meta:   { salt: Uint8Array(32), kcv: Uint8Array, iterations: 600000 }
  vault.tokens: { serviceId: { iv: Uint8Array(12), ciphertext: Uint8Array } }
  ```
- 鍵派生: `PBKDF2(password, salt, 600000, SHA-256) → 256-bit key`
- KCV (Key Confirmation Value): 派生鍵で固定平文 `"service-hub-v1"` を暗号化 → 復号できなければパスワード違い
- 暗号化: AES-GCM-256, IV はトークンごとに `crypto.getRandomValues(new Uint8Array(12))`
- 鍵は `importKey({extractable: false})` でメモリ保持、`lock()` で参照破棄 → GC 回収

**自動ロック:**
- `document.visibilitychange` で非表示 5 分超 → `lock()`
- `setTimeout` で idle 15 分 → `lock()`

### 3.2 In-app Library (`src/renderer/pages/LibraryPage.tsx`)

新規の 21 番目サービス。エクスポート結果の保管庫。

**IndexedDB store `library`:**
```
{
  id: string                  // uuid v4
  filename: string            // 'presentation-cover-1731589200.svg'
  mime: string                // 'image/svg+xml' | 'text/html' | 'text/markdown'
  blob: Blob                  // 実体
  createdAt: number
  serviceId: ServiceId        // 'templates' | 'teamradar' | 'business'
  templateId?: string
  thumbnail?: string          // 最大 320×180 PNG の data URL (SVG なら直接 dataURL)
  size: number                // blob.size のキャッシュ
}
```

**機能:**
- 一覧: 直近順、サービス別フィルタ、検索
- 各アイテム: ▶ プレビュー / ⬇️ ダウンロード / 📋 URL コピー (blob: URL) / 🎨 Canva に送る (新タブ) / 🗑️ 削除
- 保存上限: 50 MB / 100 件超過時は古いものから自動削除
- 「全て一括 zip ダウンロード」ボタン (JSZip 等で zip 化)

**エクスポートフローの変更:**
```diff
- await window.serviceHub.invoke('templates', 'export-template', payload);
- → 即 download

+ const result = await window.serviceHub.invoke('templates', 'export-template', payload);
+ → IndexedDB に保管 + 通知バナー「ライブラリに保存しました [ライブラリで見る]」
+   オプションで即 download も併用 (ユーザー設定)
```

### 3.3 PKCE OAuth in browser (`src/renderer/oauth/pkce.ts`)

```typescript
export async function authorizeGoogle(
  scopes: readonly string[],
): Promise<{ accessToken: string; expiresAt: number; scope: string }> { ... }
```

**フロー:**
1. `code_verifier = base64url(crypto.getRandomValues(64bytes))`
2. `code_challenge = base64url(SHA-256(code_verifier))`
3. `state = base64url(crypto.getRandomValues(32bytes))`
4. `window.open('https://accounts.google.com/o/oauth2/v2/auth?...', '_blank', popup)` (1024×768)
5. リダイレクト先 `https://<host>/oauth-callback.html` (standalone HTML には含めない — ホスト版のみ)
   - `file://` 配信の場合は **不可** → ホスト版限定機能として明示
6. callback HTML が `window.opener.postMessage({code, state}, origin)` を呼ぶ
7. 親 window で state 検証 → token exchange (PKCE なので client_secret 不要)
8. token を Vault に保存

**`file://` 環境での代替:**
- Manual paste: ユーザーが OAuth Playground / Google Cloud Console でトークンを取得して貼る (現状の Electron 版 UX と同じ)
- 「Hosted 版で使う」案内バナー

### 3.4 BYO Proxy (`src/renderer/network/proxy.ts`)

CORS ブロックされる API (Atlassian / Notion / Cloudflare) 用。

```typescript
export interface ProxyConfig {
  url: string;                          // 'https://my-worker.example.com/proxy'
  sharedSecret?: string;                // optional HMAC
}

export async function proxiedFetch(
  targetUrl: string,
  init: RequestInit,
  proxy: ProxyConfig,
): Promise<Response> {
  // POST to proxy with {url: targetUrl, ...init} as body
  // Proxy forwards and returns the response 1:1
}
```

設定ページで:
- 「Notion / Atlassian / Cloudflare はブラウザ直接呼び出しできません」
- 「自前のプロキシ URL を入力」
- リファレンス実装: Cloudflare Worker テンプレート (docs/PROXY_EXAMPLE.md)

### 3.5 File System Access API (`src/renderer/fs/fsa.ts`)

Chrome/Edge 限定。Optional enhancement。

```typescript
export interface FsaHandle {
  pickFolder(): Promise<FileSystemDirectoryHandle | null>;
  writeFile(handle: FileSystemDirectoryHandle, name: string, blob: Blob): Promise<void>;
  storedHandle(): Promise<FileSystemDirectoryHandle | null>;  // IndexedDB に保持
}
```

設定ページ:
- 「ブラウザのライブラリに保存 (デフォルト)」
- ▶ 「PC のフォルダに同期する」 (Chrome/Edge のみ表示)
  - クリック → `showDirectoryPicker()` → handle を IndexedDB に保管
  - 以降のエクスポートはこのフォルダにも書き出し

非対応ブラウザ:
- 「お使いのブラウザはフォルダ書き込み非対応です。Library で管理 + 都度ダウンロードしてください」

---

## 4. セキュリティモデル

### 4.1 Threat Model

| 脅威 | 攻撃シナリオ | 対策 | 残余リスク |
|---|---|---|---|
| **XSS でトークン漏洩** | 第三者スクリプト挿入 → localStorage 読み取り | Vault: 平文 secret は IndexedDB に書かない | XSS でメモリ内の復号鍵を読まれる可能性 → CSP で外部 script ブロック |
| **マスターパスワード brute force** | 攻撃者が IndexedDB を窃取 | PBKDF2 600k iter (約 1 秒/試行) | 弱パスワードは突破される → 12 字以上推奨 UI |
| **IndexedDB の盗難** | 別ユーザーがブラウザプロファイルアクセス | パスワード不明では復号不可 | パスワードキャッシュなし。Auto-lock 必須 |
| **API キーの DevTools 漏洩** | ユーザー本人 or ショルダーハッキング | API 呼び出し時のみメモリに展開、UI には表示しない | 不可避 → 「共用 PC では使わない」警告 |
| **CSRF (OAuth)** | state を予測した攻撃 | `state = 32 bytes random` + PKCE code_verifier | 攻撃面なし |
| **Proxy 経路の改竄** | ユーザーが BYO した proxy を attacker が運営 | optional HMAC + TLS | ユーザー責任。ドキュメントで警告 |
| **Anthropic キー流出** | ユーザーが accidental DevTools 公開 | キーは Vault 暗号化、API 呼び出し時のみ展開 | DevTools fetch ログには映る → 不可避 |

### 4.2 CSP (production hosted)

```
default-src 'self';
script-src 'self';                                     /* no unsafe-inline */
style-src 'self' 'unsafe-inline';                      /* React inline styles */
img-src 'self' data: blob:;
connect-src 'self'
  https://api.anthropic.com
  https://api.github.com
  https://public-api.wordpress.com
  https://oauth2.googleapis.com
  https://www.googleapis.com
  https://slack.com
  https://api.canva.com
  https://api.cloudflare.com
  https://haveibeenpwned.com
  https://www.virustotal.com
  /* + ユーザー設定の BYO Proxy URL を動的追加 */ ;
object-src 'none';
frame-src 'none';
base-uri 'self';
form-action 'none';
```

### 4.3 standalone HTML (file://) の制約

- `file://` プロトコルでは fetch CORS が厳しい (Chrome は許可、Safari は拒否)
- 妥協:
  - **Anthropic / GitHub / HIBP / VT** 等の `Access-Control-Allow-Origin: *` API は file:// でも動作
  - **Google OAuth** は file:// では callback リダイレクトできない → 手動 token paste にフォールバック
  - **OPFS / IndexedDB** は file:// で完全動作 → Vault と Library に問題なし

---

## 5. マイグレーション計画

### Phase A: Vault + Library (Electron 共用、2-3 commit)

**A1: Vault モジュール**
- 新規 `src/shared/vault/vault.ts` (renderer/main 共用)
- Web 実装: WebCrypto + IndexedDB
- Electron 実装: safeStorage 経由 (既存 secrets.ts のラッパー)
- インターフェース統一

**A2: Library ページ**
- 21 番目のサービス `library`
- IndexedDB store
- `LibraryPage.tsx` UI

**A3: エクスポートの Library 統合**
- TemplatesPage / TeamRadarPage / BusinessPage / HomePage のエクスポートを Library 経由に変更

### Phase B: web-shim 拡張 (1 commit)

- `web-shim.ts` から「Vault が動かない」スタブを削除
- `app:revealInFolder` の代わりに「ライブラリへ遷移」を発火

### Phase C: PKCE OAuth in browser (2 commit)

**C1: PKCE モジュール + popup callback**
- `src/renderer/oauth/pkce.ts`
- `public/oauth-callback.html`

**C2: 認証フロー統合**
- Drive / Calendar / Gmail の設定 UI から PKCE を呼ぶ
- 取得した token を Vault に保管

### Phase D: BYO Proxy + File System Access API (1 commit)

- `src/renderer/network/proxy.ts`
- 設定ページに Proxy URL 入力
- File System Access API オプション
- `docs/PROXY_EXAMPLE.md` に Cloudflare Worker サンプル

### Total

6-7 コミット、全段階で `100% mutation` + `verify:arch` 緑維持。

---

## 6. アクセプタンス基準

### Phase A 完了
- [ ] マスターパスワードでトークン保管 → ブラウザ再起動後にロック画面が出る
- [ ] パスワード入力 → 既存トークン復号 → 各サービス利用可
- [ ] 別ブラウザに IndexedDB をコピー → パスワード不明 → 復号失敗を確認
- [ ] AES-GCM, PBKDF2 600k 回, salt 32 bytes, IV 12 bytes すべて pinned
- [ ] Auto-lock が visibilitychange + idle で発火
- [ ] Library に 100 件超のエクスポート → 古いものから自動削除
- [ ] Library の zip 一括ダウンロード動作

### Phase B 完了
- [ ] standalone HTML 単体で Vault + Library 動作
- [ ] エクスポート → Library に保存 → 「ライブラリで見る」 ボタンで遷移

### Phase C 完了
- [ ] hosted 版で Google OAuth が popup で完結
- [ ] state + PKCE で CSRF 対策テスト pass
- [ ] file:// では「手動 paste」フォールバック動作

### Phase D 完了
- [ ] BYO Proxy 設定で Notion API 呼び出し成功
- [ ] Chrome/Edge で「フォルダ同期」設定 → エクスポートが指定フォルダにも書き出し
- [ ] Safari/Firefox では設定 UI が「非対応」と表示

---

## 7. 既存設計図 (DESIGN_BLUEPRINT.md) との関係

- 本書は DESIGN_BLUEPRINT.md の **§Web Edition** 拡張。
- Electron 版の Phase 6 (実 API 接続) と並行可能。
- Vault モジュールは両環境で共通インターフェース → Electron 版にも逆輸入する。

---

## 8. 非目標 (Non-goals)

- **完全な off-line PWA**: Service Worker 化は本フェーズでは対象外。要望次第で Phase E として追加。
- **マルチユーザー共有**: 1 ブラウザ = 1 ユーザー前提。チームでの token 共有は Vault export/import (暗号化済 JSON) で対応。
- **Mobile (iOS Safari)**: File System Access API 非対応のため一部機能制限。基本表示は動作する想定だが UX 最適化は Phase F。

---

## 8. Phase C / D の詳細問題分析 (実装直前)

### 8.1 Phase C — PKCE OAuth の現実的制約

| 障壁 | 詳細 | 対策 |
|---|---|---|
| **file:// で redirect 不可** | OAuth provider は事前登録された redirect_uri が必要。`file:///path/to/...` は登録不可 | Out-of-band paste 方式: 認証 URL を新規タブで開く → ユーザーが手動で code/token を貼る |
| **state / verifier の保持** | PKCE は code_verifier をブラウザに残しておく必要 | sessionStorage に「OAuth フロー中」フラグ + verifier を保管。完了で破棄 |
| **refresh token** | Confidential client 専用。PKCE public client は新規 grant 毎に再認証 | 短時間で expire するため受け入れる。expiresAt を Vault に同梱保管 |
| **token 受け取り後の検証** | UserInfo endpoint で sanity check | `scope` 検証 + 任意の `/userinfo` 呼び出し |

**実装方針:** `src/renderer/oauth/pkce.ts` で PKCE 機能を実装。Settings ページで Google 用フォームを提供:
1. 「Drive / Calendar / Gmail を有効化する」ボタン押下
2. 内部で code_verifier 生成、authorize URL を新規タブで開く
3. ユーザーが Google でログイン → リダイレクト先 (Google の OOB ページ) で表示される code をコピー
4. アプリのテキストエリアに貼り付け → token 取得 → Vault に保存

ホスト版 (HTTPS) なら popup + postMessage で完全自動化可能だが、本フェーズでは標準フローとして手動 paste を採用。

### 8.2 Phase D1 — BYO Proxy の設計

| 障壁 | 詳細 | 対策 |
|---|---|---|
| **CORS ブロック** | Notion / Atlassian / Cloudflare API は `Access-Control-Allow-Origin` を出さない | ユーザーが運営するプロキシ経由 |
| **プロキシの認可** | URL がバレると誰でも使える | Optional HMAC ヘッダー (`X-Proxy-Auth`) または「自分専用に運営する」前提 |
| **HTTP メソッド網羅** | GET/POST 以外も必要 | リクエストエンベロープ方式: POST body に `{url, method, headers, body}` |
| **エラーの透過** | upstream の 4xx/5xx をそのまま返す | proxy が 200 で raw response を JSON 化 (status/headers/bodyText) して返す |
| **streaming 不要** | 我々の API はすべて一括 JSON | 一括レスポンスで OK |

**プロトコル:**
```
client → proxy: POST /
  Content-Type: application/json
  body: {"url": "https://api.notion.com/v1/...", "method": "POST",
         "headers": {...}, "body": "..."}

proxy → upstream: 透過呼び出し

proxy → client: 200 OK with envelope
  {"status": 200, "headers": {...}, "body": "..."}
```

リファレンス実装は `docs/PROXY_EXAMPLE.md` に Cloudflare Worker テンプレートを掲載。

### 8.3 Phase D2 — File System Access API

| 障壁 | 詳細 | 対策 |
|---|---|---|
| **対応ブラウザ限定** | Chrome/Edge 86+ のみ。Safari/Firefox 不可 | `'showDirectoryPicker' in window` で feature detection + 非対応時は UI 非表示 |
| **file:// で動作しない** | Chrome は HTTPS 必須 (file:// は許可されている場合あり、要検証) | hosted 版で recommend。file:// では fallback Library のみ |
| **permission 永続性** | handle は structured-clonable で IndexedDB 保管可。再訪時 `queryPermission` 必要 | 起動時に re-grant 用ボタン表示。`granted` なら自動同期 |
| **atomic 書き込み** | `createWritable()` + close で OS の atomic rename が走る | デフォルトで安全 |

**実装方針:** `src/renderer/fs/fsa.ts` で feature detection + handle 永続化。Library に保存する際に handle があれば並行書き込み。Settings に「PC のフォルダに同期する」ボタン。



実装着手前に確認したい点:

1. **マスターパスワード忘れの救済** — リカバリーキー (24 字 mnemonic) を初回生成するか、それとも「忘れたら全データ消去」とするか?
2. **Proxy デプロイの責務** — Cloudflare Worker のサンプル提供で十分か、それともホスト済みプロキシを別途用意するか?
3. **Library の保存上限** — 50 MB / 100 件で十分か、それとも quota.usage API で動的に拡張するか?
4. **Anthropic キーの警告強度** — 「OK」ボタン押下を毎セッション必須にするか、初回のみとするか?

→ 回答次第で Phase A の細部を調整。
