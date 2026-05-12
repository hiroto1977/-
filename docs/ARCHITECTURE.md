# Service Hub — システム設計図

最終更新: 2026-05-12 (commit `7684c12`)

Service Hub は **Electron + React + TypeScript** のデスクトップダッシュボードで、
14 のサービス (GitHub / WordPress.com / Atlassian / Notion / Google Drive・Calendar・Gmail /
Slack / Canva / Skills / Security / Cloudflare / Emotions / Ollama) をひとつのサイドバー
UI から横断操作できる。本書は実装の **全体図 / プロセス間境界 / セキュリティ境界 /
品質パイプライン / 配布パイプライン** を一望できるリファレンス。

---

## 1. 三プロセス構成 (High-level)

Electron は OS プロセスとして 3 種類のサブプロセスを生む。Service Hub では
**信頼境界 = この 3 プロセスの間** に置く。Renderer はサンドボックス内で動作し、
特権 API は Preload 経由でしか触れない。

```mermaid
graph TB
  subgraph "OS"
    A[End user]
    OS["OS keychain<br/>(safeStorage 暗号化先)"]
    FS["~/userData/<br/>service-hub-secrets.json"]
  end

  subgraph "Electron app process"
    subgraph "Renderer (React + Vite)"
      R1["sidebar<br/>services.ts (SSOT)"]
      R2["pages/*.tsx<br/>14 services"]
      R3["useServiceData hook<br/>snapshot ↔ live"]
      R4["window.serviceHub<br/>(typed bridge)"]
    end

    subgraph "Preload (contextBridge)"
      P1["exposeInMainWorld<br/>'serviceHub'"]
    end

    subgraph "Main process (Node)"
      M1["IPC handlers<br/>app:* secrets:* fetch:* action:* oauth:*"]
      M2["clients/<br/>(14 fetchers + actions)"]
      M3["secrets.ts<br/>(safeStorage + 1MB cap)"]
      M4["oauth.ts<br/>(PKCE loopback)"]
    end
  end

  subgraph "External"
    EX1["api.github.com<br/>api.notion.com<br/>... (14 hosts)"]
    EX2["accounts.google.com<br/>(OAuth PKCE)"]
    EX3["127.0.0.1:11434<br/>(Ollama, local only)"]
  end

  A -->|click / type| R2
  R2 --> R3
  R3 -->|fetch:snapshot<br/>action:invoke| R4
  R4 -->|IPC| P1
  P1 -->|invoke| M1
  M1 -->|dispatch| M2
  M1 -->|store / read| M3
  M3 -->|encryptString| OS
  M3 -->|fs.readFile/writeFile<br/>mode 0o600| FS
  M2 -->|HTTPS| EX1
  M4 -->|HTTPS + redirect| EX2
  M2 -->|HTTP local-only| EX3

  classDef renderer fill:#1e3a8a,color:#fff,stroke:#3b82f6
  classDef preload fill:#7c2d12,color:#fff,stroke:#ea580c
  classDef main fill:#14532d,color:#fff,stroke:#22c55e
  classDef ext fill:#581c87,color:#fff,stroke:#a855f7
  class R1,R2,R3,R4 renderer
  class P1 preload
  class M1,M2,M3,M4 main
  class EX1,EX2,EX3 ext
```

| プロセス | 権限 | 主責任 |
|---|---|---|
| **Renderer** | `nodeIntegration: false` + `sandbox: true` + `contextIsolation: true` + CSP | 表示・ユーザ入力。Node API 不可。外部 HTTP も `connect-src` で制限。 |
| **Preload** | contextIsolated bridge | `window.serviceHub` を最小 API で expose。型は `src/shared/bridge.d.ts`。 |
| **Main** | フル Node | IPC dispatch + `safeStorage` + 全 fetcher / action + OAuth loopback server + `shell.openExternal` (http/https only) |

---

## 2. ディレクトリ構成

```
service-hub-desktop/
├── src/
│   ├── main/                         # Electron main プロセス
│   │   ├── main.ts                   # ipcMain 登録 + BrowserWindow
│   │   ├── secrets.ts                # safeStorage + plain-base64 fallback + 1MB cap
│   │   ├── oauth.ts                  # PKCE + loopback HTTP server + Host header pin
│   │   └── clients/
│   │       ├── index.ts              # LIVE_FETCHERS / LIVE_ACTIONS / LOCAL_SERVICES
│   │       ├── types.ts              # jsonFetch + FetchError + redactSecrets
│   │       ├── github.ts             # PR 詳細取得時 api.github.com pin
│   │       ├── wordpress.ts
│   │       ├── atlassian.ts          # site URL は https:// 必須
│   │       ├── notion.ts
│   │       ├── drive.ts / calendar.ts / gmail.ts
│   │       ├── slack.ts
│   │       ├── canva.ts
│   │       ├── skills.ts             # ~/.claude/skills 配下 read-only + 名前 allowlist
│   │       ├── security.ts           # HIBP + VirusTotal + Norton detection
│   │       ├── cloudflare.ts
│   │       ├── emotions.ts           # mood journal + Anthropic API
│   │       └── ollama.ts             # 127.0.0.1:11434 hardcoded + endpoint allowlist
│   ├── preload/
│   │   └── preload.ts                # contextBridge.exposeInMainWorld
│   ├── renderer/
│   │   ├── App.tsx                   # sidebar router
│   │   ├── services.ts               # SSOT for ServiceId, label, icon
│   │   ├── pages/                    # 14 service pages
│   │   ├── components/               # DataList, StatusBar, ...
│   │   ├── hooks/useServiceData.ts   # snapshot ↔ live 切替
│   │   └── data/snapshot.ts          # 起動初期データ
│   └── shared/
│       ├── serviceId.ts              # ServiceId union + isServiceId() guard
│       ├── bridge.d.ts               # window.serviceHub の型
│       └── api/                      # 旧スタブ
├── docs/                             # 設計 / 監査 / 運用ドキュメント
├── scripts/                          # quality:report, triage, scaffold, ...
├── stryker.config.json               # 9-file mutation scope
├── vitest.config.ts                  # 300 tests
└── electron-builder.json             # mac/win/linux パッケージ
```

---

## 3. サービスレジストリ (14 services)

```mermaid
flowchart LR
  subgraph "認証スタイル"
    direction LR
    AUTH1["Bearer token<br/>(8 svc)"]
    AUTH2["Basic auth + site URL<br/>(JSON blob)"]
    AUTH3["OAuth PKCE<br/>(3 svc)"]
    AUTH4["API key<br/>(JSON blob)"]
    AUTH5["No auth<br/>(local only)"]
  end

  AUTH1 --> github
  AUTH1 --> wordpress
  AUTH1 --> notion
  AUTH1 --> slack
  AUTH1 --> canva
  AUTH1 --> cloudflare
  AUTH1 --> emotions["emotions<br/>(Anthropic)"]
  AUTH1 --> skills["skills<br/>(Anthropic)"]

  AUTH2 --> atlassian

  AUTH3 --> drive["drive*"]
  AUTH3 --> calendar["calendar*"]
  AUTH3 --> gmail["gmail*"]

  AUTH4 --> security["security<br/>{hibp, vt}"]

  AUTH5 --> ollama["ollama<br/>(local 127.0.0.1)"]

  subgraph "*GOOGLE_OAUTH_CLIENT_ID 必須"
    note["未設定時は Bearer token も受理"]
  end
```

**LIVE_FETCHERS** / **LIVE_ACTIONS** マップ (`src/main/clients/index.ts`) は `ServiceId` を key にして fetcher / actions を解決する。IPC ハンドラは `isServiceId()` で値を検証 → `Object.hasOwn()` で prototype lookup も無効化 → map 索引、の三段階。

```typescript
// src/main/clients/index.ts (concept)
export const LIVE_FETCHERS: Record<ServiceId, FetcherFn> = { github: fetchGithubSnapshot, ... };
export const LIVE_ACTIONS:  Record<ServiceId, ActionMap | undefined> = { gmail: GMAIL_ACTIONS, ... };
export const LOCAL_SERVICES: Set<ServiceId> = new Set(['skills', 'security']);
```

---

## 4. データフロー (snapshot ↔ live)

各ページは **静的スナップショット** (`src/renderer/data/snapshot.ts`) で即時描画し、
ユーザがトークンを保存すると `fetch:snapshot` IPC で **ライブ取得** に切り替わる。

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant R as Renderer (page)
  participant H as useServiceData hook
  participant B as window.serviceHub (bridge)
  participant M as Main IPC
  participant C as clients/<svc>.ts
  participant API as External API

  U->>R: open <svc> tab
  R->>H: useServiceData(svc, SNAPSHOT[svc])
  H->>R: { data: snapshot, source: 'snapshot' }
  R-->>U: render (instant)

  U->>R: click "更新"
  R->>H: refresh()
  H->>B: fetchSnapshot(svc)
  B->>M: ipcRenderer.invoke('fetch:snapshot', svc)
  Note over M: isServiceId(svc) ✓<br/>Object.hasOwn(LIVE_FETCHERS, svc) ✓
  M->>M: getValidToken(svc)<br/>(OAuth refresh if needed)
  M->>C: fetcher({ token })
  C->>API: jsonFetch(...)
  API-->>C: JSON
  C-->>M: NormalizedSnapshot
  M-->>B: { ok: true, data }
  B-->>H: result
  H->>R: { data: live, source: 'live' }
  R-->>U: re-render
```

エラー時は `safeErrorMessage(err)` 経由で `redactSecrets()` を通過した文字列のみが
Renderer に返る (Bearer token / api_key / ya29 / sk-ant- 等が正規表現で `[REDACTED]` 化)。

---

## 5. セキュリティ境界と防御層

```mermaid
graph TB
  subgraph "Layer 0 — Electron 基礎防御"
    L0A["contextIsolation: true"]
    L0B["nodeIntegration: false"]
    L0C["sandbox: true"]
    L0D["CSP meta (script-src 'self', no eval)"]
    L0E["setWindowOpenHandler + will-navigate<br/>(http/https only)"]
  end

  subgraph "Layer 1 — IPC 境界"
    L1A["isServiceId() type guard"]
    L1B["Object.hasOwn() — proto lookup 無効"]
    L1C["action 名 length + own-property check"]
    L1D["payload が plain object (array/null/primitive reject)"]
    L1E["safeErrorMessage() → redactSecrets()"]
  end

  subgraph "Layer 2 — クライアント入力検証"
    L2A["Ollama: ALLOWED_ENDPOINTS 集合<br/>+ isSafeModelName + null-byte reject"]
    L2B["Skills: isSafeSkillName + path containment"]
    L2C["Gmail: isSafeHeaderValue (CR/LF/NUL reject)"]
    L2D["Atlassian: site URL https:// 必須 + /+$ strip"]
    L2E["GitHub PR detail: api.github.com pin"]
    L2F["URL 部分は encodeURIComponent"]
  end

  subgraph "Layer 3 — Secrets / OAuth"
    L3A["safeStorage (OS keychain)"]
    L3B["plain-base64 fallback<br/>+ console.warn"]
    L3C["secrets.json mode 0o600 + 1MB cap"]
    L3D["OAuth PKCE (RFC 8252) + 32B state"]
    L3E["Loopback callback: Host header pin<br/>(127.0.0.1 / localhost / [::1])"]
  end

  subgraph "Layer 4 — エラー出口"
    L4A["redactSecrets: Bearer / sk-ant- / ghp_<br/>/ xoxb- / ya29. / secret_ / JSON token-fields"]
    L4B["error body は jsonFetch 内で 200B 切り詰め"]
  end

  L0A --> L1A
  L1A --> L2A
  L2A --> L3A
  L3A --> L4A
```

### 攻撃面マトリクス

| 攻撃面 | 例 | 防御 |
|---|---|---|
| **プロトタイプ汚染** | `serviceId="__proto__"` | `isServiceId()` allowlist + `Object.hasOwn()` |
| **任意 URL の Ollama 接続** | renderer が他ホスト指定 | URL ハードコード `127.0.0.1:11434` + ALLOWED_ENDPOINTS |
| **モデル file OOB read (未パッチ)** | 悪意 GGUF ロード | `/api/pull|create|push|copy|delete|blobs|upload` 一切呼ばない設計 |
| **Skill name 経由パストラバーサル** | `name="../../etc/passwd"` | `isSafeSkillName()` + `path.resolve().startsWith()` containment |
| **RFC 2822 ヘッダ injection** | `to="x@y\r\nBcc: z"` | `isSafeHeaderValue()` で CR/LF/NUL reject |
| **token 漏洩 (error body echo)** | API が Authorization 反射 | `redactSecrets()` を全 catch で経由 |
| **Renderer XSS** | (理論) | CSP + React auto-escape + `dangerouslySetInnerHTML` 0 件 |
| **External URL 開封** | `javascript:` / `file:` | `app:openExternal` で `http/https` 限定 |
| **secrets.json 改竄/巨大化** | ディスク満杯 / 攻撃者 | 1MB cap + shape 検証 + plain-base64 警告 |

---

## 6. OAuth フロー (PKCE + Loopback)

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant R as Renderer
  participant M as Main
  participant L as Loopback HTTP server<br/>(127.0.0.1:RAND)
  participant B as System browser
  participant G as accounts.google.com

  U->>R: "Google でログイン"
  R->>M: oauth:authorize('drive')
  M->>M: generatePkce() → {verifier, challenge}
  M->>M: state = randomBytes(32)
  M->>L: listen on random port
  M->>B: shell.openExternal(buildAuthorizeUrl(...))
  B->>G: GET /o/oauth2/v2/auth?...&code_challenge=...&state=...
  U->>G: consent
  G->>B: 302 redirect → http://127.0.0.1:RAND/oauth/callback?code=...&state=...
  B->>L: GET /oauth/callback?...
  Note over L: Host header validation:<br/>only 127.0.0.1 / localhost / [::1]<br/>state === expectedState
  L-->>B: CALLBACK_HTML (静的 success page)
  M->>G: POST /token { code, code_verifier, ... }
  G-->>M: { access_token, refresh_token, expires_in }
  M->>M: setOAuthTokens(svc, tokens)<br/>(safeStorage 暗号化)
  M-->>R: { ok: true, data: { scope, expiresAt } }
```

トークン refresh は `getValidToken()` 内で expires < 60s で自動実行。失敗時は stale
access token を返し、API 401 → UI が再ログインを促す動線へ。

---

## 7. 品質パイプライン

```mermaid
graph LR
  subgraph "Pre-commit (developer machine)"
    DEV1["npm run typecheck<br/>(tsc -b --noEmit)"]
    DEV2["npm test<br/>(vitest run, 300 tests)"]
    DEV3["npm run quality:report<br/>→ docs/QUALITY.md"]
  end

  subgraph "CI (.github/workflows/ci.yml)"
    CI1["typecheck"]
    CI2["test"]
    CI3["test:cov → coverage-summary.json"]
    CI4["build:renderer + main + preload"]
  end

  subgraph "Weekly (.github/workflows/mutation.yml)"
    MUT1["stryker run<br/>(9 files in scope)"]
    MUT2["triage-mutations.cjs<br/>→ top 20 survivors"]
  end

  subgraph "On tag push (.github/workflows/release.yml)"
    REL1["3-OS matrix<br/>(ubuntu/macos/windows)"]
    REL2["electron-builder<br/>→ .dmg / .exe / .AppImage"]
    REL3["chunked AppImage<br/>scripts/assemble-appimage.sh"]
    REL4["GitHub Release"]
  end

  DEV1 --> CI1
  DEV2 --> CI2
  DEV3 --> MUT1
  CI4 --> REL1
  MUT1 --> MUT2
```

### メトリクス現状 (commit `7684c12`)

| 指標 | 値 |
|---|---|
| TypeScript 型チェック | ✅ pass |
| ユニットテスト | **300 passing** (19 files) |
| Line coverage | ~72% (clients/oauth) |
| Mutation score (total) | **72.94%** |
| Mutation score (covered) | **82.81%** |
| Mutants killed | 770 |
| Mutants survived | 160 |
| `npm audit` (prod) | 0 vulnerabilities |

### 精度向上の方針

1. **Stryker 走らせる** → `npm run mutate` (~2 min)
2. **生存 mutant を triage** → `npm run mutate:triage` で top 20 をインパクト降順表示
3. **kill test を書く** → ConditionalExpression / ObjectLiteral / MethodExpression を優先
4. **`npm run quality:report`** → `docs/QUALITY.md` を更新
5. equivalent mutant (例: base64 `/=+$/` regex) は skip 判断する

---

## 8. 配布パイプライン (chunked AppImage)

サンドボックス VM ではユーザのデスクトップに大容量バイナリを直接配置できないため、
**AppImage を 30MB チャンクに分割して git に commit** する独自手順を採用。

```mermaid
graph LR
  subgraph "Build (release.yml on v* tag)"
    B1["npm run build"]
    B2["electron-builder<br/>→ release/*.AppImage"]
    B3["split -b 30M<br/>→ dist-chunks/part-00..03"]
    B4["sha256sum<br/>→ scripts/assemble-appimage.sh"]
  end

  subgraph "User machine"
    U1["git pull"]
    U2["scripts/assemble-appimage.sh"]
    U3["cat dist-chunks/part-* > AppImage"]
    U4["sha256 verify"]
    U5["chmod +x"]
    U6["./service-hub.AppImage"]
  end

  B1 --> B2 --> B3 --> B4
  U1 --> U2 --> U3 --> U4 --> U5 --> U6
```

---

## 9. レイヤ別の主要モジュール

```mermaid
classDiagram
  class IpcHandlers {
    +secrets:set(serviceId, token)
    +secrets:clear(serviceId)
    +secrets:list()
    +fetch:snapshot(serviceId)
    +action:invoke(serviceId, action, payload)
    +oauth:isSupported(serviceId)
    +oauth:authorize(serviceId)
    +app:openExternal(url)
    +app:getVersion()
  }

  class SecretsStore {
    -MAX_STORE_SIZE: 1MB
    +setToken(id, token)
    +getToken(id) ~safeStorage decrypt~
    +clearToken(id)
    +setOAuthTokens(id, TokenSet)
    +getValidToken(id) ~auto-refresh~
  }

  class OAuthHelper {
    +OAUTH_CONFIGS: drive/calendar/gmail
    +generatePkce()
    +buildAuthorizeUrl()
    +buildTokenExchangeBody()
    +buildRefreshBody()
    +authorize(config) ~loopback HTTP~
    +refresh(config, tokens)
  }

  class Client {
    <<interface>>
    +FETCHER: (ctx) => Promise~Snapshot~
    +ACTIONS: Record~string, ActionFn~
  }

  class ServiceIdGuard {
    +SERVICE_IDS: readonly tuple
    +isServiceId(value): value is ServiceId
  }

  class FetchUtils {
    +jsonFetch~T~(url, init, ctx)
    +FetchError
    +redactSecrets(text)
  }

  IpcHandlers ..> ServiceIdGuard : validates serviceId
  IpcHandlers ..> SecretsStore : store/retrieve
  IpcHandlers ..> OAuthHelper : authorize/refresh
  IpcHandlers ..> Client : dispatch fetcher/action
  Client ..> FetchUtils : jsonFetch
  SecretsStore ..> OAuthHelper : refresh expired
```

---

## 10. 設計の不変条件 (invariants)

新しい機能を追加する PR でこれらを破ってはいけない:

1. **Renderer は Node API を直接呼ばない** — 必ず `window.serviceHub` 経由。
2. **Renderer に raw token は届かない** — `secrets:list` は ID のみ返す。
3. **IPC で受けた serviceId は indexing 前に `isServiceId()` 検証** — `Object.hasOwn()` も併用。
4. **Error message は `safeErrorMessage()` / `redactSecrets()` を必ず通る**。
5. **外部 URL は `app:openExternal` 経由のみ** — http(s) 限定。
6. **fetcher / action の URL path 中の動的部分は `encodeURIComponent`** — 例外: Ollama の `model` (regex sanitize 済) と Atlassian `site` (https:// validated, host only)。
7. **Ollama は `127.0.0.1:11434` 以外には接続しない** — `ALLOWED_ENDPOINTS` で enforce。
8. **dangerouslySetInnerHTML / eval / new Function 禁止**。
9. **新規 client は CLAUDE.md の "ServiceClient contract" を満たす + `LIVE_FETCHERS` / `SERVICES` 両方に登録**。
10. **追加した PR で `npm run typecheck && npm test` が green**。理想的には `npm run quality:report` で mutation 数値も維持・改善。

---

## 11. 関連ドキュメント

| ドキュメント | 目的 |
|---|---|
| `docs/SECURITY.md` | 脅威モデル A1-A7 |
| `docs/SECURITY_AUDIT.md` | 監査ログ (P0-P3 findings + defense-in-depth 追加) |
| `docs/OLLAMA_SECURITY.md` | Ollama CVE + 未パッチ OOB read 対策 |
| `docs/OAUTH_SETUP.md` | GOOGLE_OAUTH_CLIENT_ID 設定手順 |
| `docs/EMOTIONS_SETUP.md` | Anthropic API key 設定 |
| `docs/SECURITY_SETUP.md` | HIBP / VirusTotal キー設定 |
| `docs/CLOUDFLARE_SETUP.md` | Cloudflare API key 設定 |
| `docs/QUALITY.md` | (自動生成) coverage / mutation dashboard |
| `docs/QUALITY_WORKFLOW.md` | 品質運用 playbook |
| `docs/ADDING_A_SERVICE.md` | 新サービス追加チェックリスト |
| `docs/REMAINING_WORK.md` | Phase 4-7 ロードマップ |
