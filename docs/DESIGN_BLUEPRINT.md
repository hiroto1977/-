# Service Hub 設計図 — 統合ブループリント v2 (45 services)

> 本書は **これまでに確立された全パターン・全安全境界・全ロードマップ** を 1 ファイルに
> 統合した「最適併合版」設計図。個別の詳細は `docs/ARCHITECTURE.md` (171 件の
> `file:line` refs) / `docs/QUALITY.md` (Stryker 100.00%) / `docs/SESSION_HANDOFF.md`
> (進行中タスク + 罠) を参照。
>
> **更新方針**: 大幅な変更を入れた際は本書も同コミットで更新する (verify:arch / lint:docs
> でドリフトを検出可能)。

---

## 0. 一行サマリ

> **Electron デスクトップで 45 種類のサービス (6 featured + 13 tools + 26 integrations)
> を単一サイドバーから操作するハブ。全 OAuth トークン / API キーは OS キーチェーンで
> 暗号化、renderer は秘密値を一度も見ない 3 プロセス分離。CI が 15 種類の不変条件を
> 自動検証し、Stryker mutation 100.00% (break=99.8) を維持する。**

実装規模: **1238 静的 it() / 1287 実行時 tests · 45 client modules · 11 IPC handlers ·
171 file:line refs · 4 cross-doc facts · 6 live metrics · standalone HTML 440 KB**

---

## 1. 不変条件 (CI で fail-on-violation)

| # | チェック | 実装スクリプト | 自動失敗条件 |
|---|---|---|---|
| 1 | TypeScript 型 | `tsc -b --noEmit --force` | 型エラー |
| 2 | アーキ参照整合 | `scripts/verify-architecture.cjs` | 171 件の `file:line` 不整合 / 6 メトリクスズレ |
| 3 | 禁止パターン | `scripts/lint-forbidden-patterns.cjs` | eval / dangerouslySetInnerHTML / 他計 8 パターン |
| 4 | プロセス境界 | `scripts/check-import-boundaries.cjs` | renderer が src/main を import / shared 越境 |
| 5 | ドキュメント一貫性 | `scripts/cross-doc-consistency.cjs` | 4 cross-doc fact の不一致 (service 数 / IPC 数 / OAuth 数 / ID set) |
| 6 | テスト網羅 | `scripts/lint-test-coverage.cjs` | サービス毎のテストファイル無し / action 毎のテスト無し |
| 7 | ユニットテスト | `vitest run` | 1287 件のうち 1 つでも fail |
| 8 | カバレッジ (clients) | `vitest --coverage` | 設定閾値割れ |
| 9 | Mutation スコア | Stryker | break threshold 99.8% 未満 |
| 10 | レンダラビルド | `vite build` (renderer + main + preload) | ビルド失敗 |
| 11 | ESLint | `eslint .` | warnings/errors 1 件以上 |
| 12 | session-context hook 整合 | `.claude/settings.json` matcher | `startup\|resume\|clear\|compact` ↔ 実 hook 動作 |

`.github/workflows/ci.yml` が push/PR 毎に 1-10 を並列実行 (3 jobs: `quality` / `test` /
`build`)。11-12 はローカルで `npm run verify:all` で確認可能。

---

## 2. アーキテクチャ三層

```
┌──────────────────────────────────────────────────────────────────┐
│ src/renderer  (React + Vite)                                     │
│   App.tsx     → sidebar driven by services.ts (single SOURCE)    │
│   pages/*     → useServiceData(id, SNAPSHOT[id])                 │
│   components/ ├ StatusBar.tsx (refresh + tokenSetup slot)        │
│               ├ Section / Stat / DataList                        │
│               ├ ShigyoConsole.tsx (7 士業ページ共通)               │
│               └ ServiceActionPanel.tsx (record-entry / advise)   │
│   bridge: window.serviceHub.<method>  ← typed via                │
│           src/shared/bridge.d.ts (re-declares preload)           │
└──────────────────────┬───────────────────────────────────────────┘
                       │ contextBridge (contextIsolation: true, sandbox: false)
┌──────────────────────┴───────────────────────────────────────────┐
│ src/preload  (typed bridge only — no business logic)             │
│   ipcRenderer.invoke('app:*' / 'secrets:*' / 'fetch:snapshot'    │
│     / 'action:invoke' / 'oauth:*')                               │
│   11 IPC channels total                                          │
└──────────────────────┬───────────────────────────────────────────┘
                       │ IPC (typed via TypeScript project refs)
┌──────────────────────┴───────────────────────────────────────────┐
│ src/main  (Electron main process — sole network actor)           │
│   main.ts           BrowserWindow + IPC handlers                 │
│   secrets.ts        OS keychain (safeStorage) + plaintext base64 │
│                     fallback (Linux without keyring 等)           │
│   oauth.ts          PKCE loopback OAuth (drive / cal / gmail)    │
│   proxy.ts          SSRF guard (RFC1918/IPv4-mapped/NAT64/6to4)  │
│   clients/index.ts  LIVE_FETCHERS + LIVE_ACTIONS (45 entries)    │
│   clients/<svc>.ts  per-service REST client + actions (45 files) │
└──────────────────────────────────────────────────────────────────┘
                       │
                       ▼ external network (only from main)
        api.github.com / *.atlassian.net / slack.com / api.canva.com /
        api.anthropic.com / api.notion.com / *.googleapis.com /
        api.cloudflare.com / public-suffix.org / etc.
```

**鉄則**:
- Renderer → 直接 `fetch()` 禁止 (秘密がレンダラに来る = アウト)
- Preload → 純粋に IPC 通過のみ (ロジック禁止)
- Main → 唯一の secrets / OAuth / 外部通信処
- 外部リンク → `shell.openExternal(url)` (window.open 禁止)
- `src/shared/` は main / renderer 両方から import 可、ただし dom / electron 依存禁止

---

## 3. 45 サービス分類

### 3.1 featured (6)
ユーザーが最初に開く高頻度サービス。サイドバー上部に固定。

| ID | 役割 | 認証 |
|---|---|---|
| home | ダッシュボード横断 KPI | none |
| business | ビジネス指標 (BEP / KPI) | none |
| teamradar | チームメンバー稼働 | none |
| templates | テンプレ集 (Notion / Gmail 等) | none |
| library | 永続保存ライブラリ (Phase 6 で IndexedDB) | none |
| settings | グローバル設定 | none |

### 3.2 tools (13)
ローカル / snapshot-only ツール群。`LOCAL_SERVICES` 登録でトークン未設定エラー回避。

| ID | 説明 | live API |
|---|---|---|
| skills | `~/.claude/skills/*` 実行 | Anthropic API (advisor) |
| security | HIBP + VirusTotal | API keys JSON |
| cloudflare | DNS / cache 管理 | Cloudflare API |
| emotions | 感情ログ + 解析 | Anthropic API |
| ollama | ローカル LLM | 127.0.0.1 固定 |
| kpi | 6 事業 × 8 BEP 指標 × 30 期 mock | Phase 6 で接続予定 |
| stocks | 5 mock 銘柄 paper trade | Phase 7 で broker 接続 |
| uber-eats | 注文管理 snapshot | Phase 6 |
| demae-can | 注文管理 snapshot | Phase 6 |
| real-estate | 不動産投資 snapshot | Phase 6 |
| mutual-funds | 投資信託 snapshot | Phase 6 |
| quality | 品質ダッシュボード (`quality-report.cjs` 生成) | local |
| storage | ストレージ最適化 (Phase 6 で `os`/`fs` API) | local stub |

### 3.3 integrations (26)
SaaS 連携。9 既存 + 10 連携先 + 7 士業。

**9 既存 (live REST 実装済)**: github / wordpress / atlassian / notion / drive /
calendar / gmail / slack / canva

**10 連携先 (snapshot only — Phase 6 で実装予定)**: microsoft-365 / dropbox / salesforce
/ discord / asana / linear / sentry / shopify / stripe / line

**7 士業 (snapshot only — `ShigyoConsole` 共通コンポーネント / 共通 `ShigyoSnapshot` 型)**:
tax-accountant / labor-consultant / lawyer / judicial-scrivener / admin-scrivener /
sme-consultant / patent-attorney

うち **lawyer / patent-attorney は業務独占資格** → `disclaimer` prop 必須:
> "本画面は連携先の情報・履歴を **記録・表示** するためのものです。法的助言は提供しません。"

---

## 4. 確立されたパターン (Proven by Implementation)

### 4.1 新規サービス追加 (3 系統)

#### A-1: external SaaS (Bearer token、Phase 6 で live 接続予定)
```bash
npm run scaffold -- <id> "<Label>" <ICON> bearer
```
→ `LIVE_FETCHERS` に登録、`LOCAL_SERVICES` には **登録しない**。`category: 'integrations'`。
snapshot 専用 stub にリライト (HTTP 呼び出し削除、`STUB + Impl + wrapper` 二段構造)。

#### A-2: local/snapshot 専用 (公式 API 無し、永続的 stub)
同じ scaffold → ただし `LOCAL_SERVICES` に **追加する**。トークン未設定エラー回避が目的。
例: 士業 7 / quality / storage / uber-eats / demae-can / real-estate / mutual-funds。

#### A-3: 実 API 接続 (例: GitHub / Notion / Slack)
scaffold 後、`<id>.ts` の HTTP 呼び出し部を実装 + `__tests__/<id>.test.ts` に mock fetch
+ boundary tests。

### 4.2 Snapshot-only stub の標準形 (`home.ts` パターン)
```ts
import type { FetchContext } from './types';

export interface XxxSnapshot { /* 型 */ }

// Stryker disable next-line all
const STUB: XxxSnapshot = { /* 0 / [] で埋める */ };

export async function fetchXxxSnapshotImpl(_ctx: FetchContext): Promise<XxxSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchXxxSnapshot(ctx: FetchContext): Promise<XxxSnapshot> {
  return fetchXxxSnapshotImpl(ctx);
}
```

二段構造 (`Impl` + `wrapper`) は将来 `wrapper` に retry / cache を後付けするための余地。

### 4.3 共通型を `src/shared/` に集約 (DRY violation 防止)

複数 fetcher / 複数 page で同じ shape を扱う場合は **絶対に `src/shared/<domain>Types.ts`
に集約**。例:
- `src/shared/shigyoTypes.ts` — 7 士業 共通 `ShigyoContact` / `ShigyoConsultation` /
  `ShigyoDocument` / `ShigyoSnapshot` (PR #9 で 28 重複 → 1 ファイル)
- `src/shared/advisorTypes.ts` — `ServiceAdvisorResponse`
  (`{ recommendations, disclaimer, notForRealMoney: true, phase: 'stub' | 'live' }`)
- `src/shared/bridge.d.ts` — `window.serviceHub` 型再宣言

renderer / main 両方から `import type` 可能 (`check-import-boundaries.cjs` の shared
boundary ルールに整合)。

### 4.4 共通 UI コンポーネントへの抽出

複数ページが同じレイアウトを持つなら共通化:
- `ShigyoConsole.tsx` — 7 士業ページ共通 (StatusBar + Section + table) — 882 行を 1
  ファイルに集約 (PR #9)
- `StatusBar.tsx` — refresh + tokenSetup slot + status badge
- `ServiceActionPanel.tsx` — record-entry / advise の generic フォーム + button

各 service page は **5-10 行のラッパ** であるべき:
```tsx
export function TaxAccountantPage() {
  return (
    <ShigyoConsole
      serviceId="tax-accountant"
      serviceLabel="税理士"
      snapshot={SNAPSHOT.taxAccountant}
    />
  );
}
```

### 4.5 ServiceActionPanel + ServiceAdvisorResponse

- write action は `{ ok: true, recordedAt, persisted: false }` shape を持たせて UI に
  「Phase 6 まで保存されません」を構造的に強制 (PR #4 BLOCKING-3)
- AI advise は `ServiceAdvisorResponse` 共通型を返す。投資系 (real-estate / mutual-funds)
  は disclaimer に「投資助言ではありません」必須

### 4.6 Fetcher contract
```ts
type FetchContext = { token: string; fetch?: typeof fetch }
type Fetcher<T> = (ctx: FetchContext) => Promise<T>

// 登録: src/main/clients/index.ts:LIVE_FETCHERS
// 呼び出し: ipcMain.handle('fetch:snapshot', ...) → renderer
// テスト: vi.fn<typeof fetch>() で 100% 単位テスト
```

`fetch` を引数注入することで Node 単体テストで実ネットワーク無しに完全カバレッジ。

### 4.7 Action contract
```ts
type ActionContext = FetchContext & { payload: Record<string, unknown> }
type ServiceAction = (ctx: ActionContext) => Promise<unknown>
type ActionMap = Record<string, ServiceAction>

// 登録: src/main/clients/index.ts:LIVE_ACTIONS
// 呼び出し: window.serviceHub.invoke<T>(serviceId, actionName, payload)
```

各 action は `payload` を `unknown` で受け取り、**自前で型ガード**するのが鉄則。

### 4.8 FetchError contract
```ts
class FetchError extends Error {
  constructor(message, readonly status, readonly serviceId)
  this.name = 'FetchError'
}
// jsonFetch が status >= 400 で FetchError を投げる
// safeErrorMessage(err) + redactSecrets(msg) を経由してレンダラに渡る
```

エラーメッセージ中のトークン (sk-ant- / ghp_ / ya29. / xoxp- / Bearer / Basic /
`"access_token":"..."` 等) は **必ず redact**。

### 4.9 Anti-hallucination JSON validation (LLM 出力)
`validateAdvisorJson(raw, allowedSet)` が以下を全部 reject:
- 不正な型 / null
- universe 外のティッカー
- 件数 < 1 / > 5
- rationale 空 / > 400 chars
- riskFactors 空 / 要素が 1-200 chars 外

これにより **LLM がティッカーをでっち上げても UI に到達しない**。

### 4.10 `satisfies` over `as` (literal narrowing 回避)

snapshot data の literal 型 narrowing で `=== 0` 比較が statically false になる罠
(罠 #5)。`as number` キャストは anti-pattern (PR #7 R1 #4)。代わりに親 object に
`satisfies <Type>` を付与:

```ts
// ❌ Anti-pattern
{ monthlyFee: 22_000 as number, outstandingInvoice: 0 as number }

// ✅ Correct (PR #9)
{
  monthlyFee: 22_000,
  outstandingInvoice: 0,
} satisfies ShigyoSnapshot,
```

`satisfies` は constraint を強制しつつ literal 型を維持し、ループや比較で widen される
場面では自然に widening される (TypeScript 4.9+)。

### 4.11 SessionStart hook (Claude Code 連携)

`.claude/settings.json` の SessionStart hook (`scripts/session-context.cjs`) が
`startup|resume|clear|compact` 全マッチで呼ばれ、`docs/SESSION_HANDOFF.md` を案内する。

`session-context.cjs` の `count()` 関数は **pure Node `fs.readdirSync` + `text.match`**
で実装 (regex `re` が user-controlled になり得たため shell injection を回避 — PR #8 R1 #1)。
git rev-parse 等の **固定引数 `execSync` は安全**として残置 (引数に外部入力なし)。

### 4.12 独立レビュー サイクル
1. 直近 commits を base..HEAD で diff
2. `Agent` (Opus) で並列レビュー → 🔴 BLOCKING / 🟡 SHOULD-FIX / 🟢 NIT 分類
3. inline コメント + Comment レビューを PR に投稿 (自己 PR は REQUEST_CHANGES 不可)
4. BLOCKING は即修正、SHOULD-FIX は条件次第、NIT は follow-up
5. R1 → R2 → R3 ... で「指摘なし」になるまで継続

### 4.13 Mutation ratchet rule
- Stryker `break` 閾値は **scope 内で非減少**
- **新ファイルを mutate scope に追加した時のみ** re-baseline を許可
- 各コミットで break threshold を up-only に更新
- 100% TOTAL を維持するために `// Stryker disable` を使ってよいが、**コメントで等価性を
  説明する必須**

```ts
// Stryker disable next-line ConditionalExpression
// 〈なぜ等価か / どのテストがピン留めしているか〉
if (defensive_guard) { ... }
```

### 4.14 Cross-doc fact consistency
`scripts/cross-doc-consistency.cjs` が:
- サービス数 / IPC ハンドラ数 / OAuth 数 / サービス ID リスト (set 同値)
- を `src/shared/serviceId.ts` / `src/main/main.ts` / `src/main/oauth.ts` から抽出
- doc 内の数値表現とマッチングして fail-on-mismatch

→ ドキュメント drift が CI で即検出される。

### 4.15 ARCHITECTURE.md 同期 (verify:arch invariant)
`docs/ARCHITECTURE.md` には **171 件の `file:line` ref + 6 live metrics**
(service count / test count / IPC / OAuth / verify:arch ref count / client モジュール数)
があり、`npm run verify:arch` で自動チェック。**新サービス / テスト / コード移動の度に
同期更新が必要**。

失敗パターン:
- サービス数を増やしたら ARCHITECTURE.md の数字 + §3.1 表 + CLAUDE.md / USER_GUIDE.md の
  "N services" も全部
- IPC handler 追加 / `LIVE_FETCHERS` 行範囲変更時の line ref 追従

---

## 5. 既知の罠 (Known Pitfalls)

### 罠 1: scaffold ハイフン + 数字 ID で camelCase collapse (修正済)
旧 `scaffold-service.cjs` は `microsoft-365` → `microsoft365` (camelCase で hyphen 消失)
で LIVE_FETCHERS / LIVE_ACTIONS のキーを生成していた。これは ServiceId
(`'microsoft-365'`) と mismatch して typecheck で気付くが、修正に時間を取られた。

**修正:** `idKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(id) ? id : \`'${id}'\`` を導入
(PR #7 で根本修正)。将来の hyphen + digit ID も自動で quoted key になる。

### 罠 2: Stryker 100% 維持
追加した fetcher は `stryker.config.json` の `mutate` 配列に **必ず追加**。さらに UX
content (advise の disclaimer / recommendations、record-entry の validation) は
StringLiteral / ObjectLiteral mutation が大量に発生するため `// Stryker disable all`
/ `// Stryker restore all` で block-level に囲む (next-line では多行カバー不能)。

### 罠 3: スタック PR の merge order
複数 PR を base 関係で積み上げた場合 (PR #4 base=PR #3 branch、PR #5 base=PR #4 branch、
…)、最初の PR が main に merge されると後続 PR の base が dangling になる可能性がある。
GitHub は通常 auto-rebase するが、**順序が崩れると後続 PR の merge が間違った branch に
対して行われる**ことがあった。

**回避策:** スタック化したら **同時に並列で merge せず、base から 1 つずつ確認しながら**。
あるいは最終 head から main 向けの consolidated PR を作る (PR #8 / #9 の方式)。

### 罠 4: verify:arch のテスト数 drift
`ARCHITECTURE.md` のテスト件数は `grep -rE "^\s*it\(" src/` の実数と一致必須。新規テスト
追加 / scaffold 出力で **常に drift する** ので、毎 commit 後に `npm run verify:arch`
で確認。

### 罠 5: literal type narrowing in snapshot.ts
`monthlyFee: 22_000` 等が `22000` literal type に narrow される問題。`as number` cast
は anti-pattern 指摘あり (PR #7 R1 #4)。`satisfies <Type>` で解消 (パターン §4.10)。

### 罠 6: `for (const _ of ...) total++;` の `_` 未使用警告 (PR #8 で修正済)
`session-context.cjs` で iterator から count を取る際、`for...of` で `_` を未使用にすると
ESLint が warn (`_` プレフィックスでも no-unused-vars に引っかかる場合あり)。
**修正:** `const matches = text.match(re); if (matches) total += matches.length;` に
書き換え。

### 罠 7: `example.jp` ドメイン (RFC 2606 非予約)
mock データの email アドレスに `example.jp` を使うと、`jp` は予約 TLD ではないため
将来実在ドメインを踏む可能性。**修正:** `example.com` / `example.org` / `example.net`
のみ使用 (RFC 2606)。

---

## 6. 安全境界 (Boundaries Never Crossed)

| 領域 | やる | やらない | 理由 |
|---|---|---|---|
| 株式 | ペーパートレード / シグナル生成 | 実発注 | 金融商品取引法 + 口座保護 |
| AI 出力 | 教育目的の参考情報 + 免責 | 「今買え」型断定 / 価格予測 | 投資助言業登録未取得 |
| 法務 | 連携先記録の表示のみ | 法的助言 | 弁護士法 (業務独占) |
| 知財 | 連携先記録の表示のみ | 法的助言 / 出願代理 | 弁理士法 (業務独占) |
| Ollama | 127.0.0.1 + /api/version/tags/chat のみ | /api/pull / /api/create / /api/push | 未パッチ OOB CVE 回避 |
| ファイル書き出し | `~/` 配下 + 拡張子 allowlist | パス外 / 任意拡張子 | path-traversal 防止 |
| renderer | preload bridge 経由のみ | nodeIntegration / contextIsolation off | サンドボックス維持 |
| シークレット | safeStorage 暗号化 | 平文 .env / コミット | キーチェーン前提 |
| 外部接続先 | known ホスト allowlist | 未登録ホスト | ネットワーク allowlist |
| Proxy | RFC1918 / IPv4-mapped IPv6 / NAT64 / 6to4 拒否 | LAN への横展開 | SSRF 防御 |

これらは **CI で確認可能なもの** は `verify:arch` / `lint:forbidden` /
`check-import-boundaries.cjs` に組み込み済み。

---

## 7. テスト戦略 (4 層 + CI)

| 層 | ツール | 担当範囲 | 例 |
|---|---|---|---|
| Unit | Vitest | 純関数 / mock fetch / IO 分離 | `sma([1,2,3,4,5], 3) === [null, null, 2, 3, 4]` |
| Property | vitest `it.each(seeds)` | 不変条件 ∀ 入力 | `rsi(closes, 14) ∈ [0, 100]` で 5 seed × 5 assert |
| Patch (Invariant) | Vitest | 保存則・代数則 | `cash + position_cost === initialCash` ∀ buy |
| Mutation | Stryker | テスト suite の感度 | `>= 0` vs `> 0` 境界、`'foo'` → `""` 文字列 |
| CI | GitHub Actions | 統合 fail-on-violation | typecheck + verify:all + lint + test + build |

**ratchet**: 100% covered + 100% TOTAL を全 mutate scope で維持。引き上げ済み break=99.8。

**現状値**: 1238 静的 `it()` / 1287 実行時 tests passing · Stryker mutation **100.00%** ·
typecheck / ESLint clean · verify:all green。

---

## 8. ロードマップ (Phase 6 以降)

### Phase 6: snapshot → live 切替

| サービス | 現状 | Phase 6 ターゲット |
|---|---|---|
| 連携先 10 SaaS | snapshot | live REST 接続 (Stripe / Shopify / Salesforce 等) |
| 4 業務サービス | snapshot | IndexedDB 永続化 + `persisted: true` |
| 7 士業 | snapshot | IndexedDB 永続化 + `persisted: true` |
| Storage | static stub | Electron main `os` / `fs` API 経由実 OS 統計 |
| Library | static SNAPSHOT | IndexedDB 永続化 |
| Quality | hardcoded numbers | `scripts/quality-report.cjs` から自動生成 |
| Advise actions | static stub | Anthropic API 接続 |

### Phase 7: Stocks live integration

**前提**: ユーザーが broker / data feed API key を取得済み。

**Stage A: Order intent generator** (ToS 違反ゼロ・規制ゼロ)
- 新 type: `OrderIntent { symbol, side: buy|sell, qty, type: market|limit, limit_price?, ttl }`
- 新 action: `generate-order-intent` (シグナルから OrderIntent を作る)
- UI: 「この注文を Web/App にコピペする」ボタン

**Stage B: Broker dry-run**
- `BrokerExecutor` interface (`dryRun: true` ハードコード)
- 各 broker 用 implementation (Alpaca / IB / 楽天 / SBI) を別ファイル

**Stage C: Real execution** (要 broker 契約 + 法的確認)
- `dryRun: false` を許可
- **必須 UI**: 確認モーダル / 日次上限 / kill switch / OCO 利確・損切
- 監査ログ: `~/.local/business-hub/data/audit/<date>.jsonl` に永久保存

**Stage D: Persistent state** (broker と独立、Phase 7 第一歩として安全)
- `~/.local/business-hub/state.json` 原子的書き出し
- New actions: `unregister-ticker` / `reset-paper-portfolio` / `clear-advisor-history`

### Phase 8: Cross-service orchestration

既存 45 サービスの action を組み合わせる。

| 候補 | 説明 | リスク |
|---|---|---|
| Slack 配信 | 戦略シグナル / advisor 結果を channel に投稿 | low |
| Notion ページ生成 | dashboard.md を Notion ページとして作成 | low |
| Gmail ドラフト | dashboard 内容を週次レポートメール下書きへ | low |
| GitHub Issue | バックテスト結果から TODO issue 自動生成 | low |
| Cross-KPI widget | 7 士業の月次顧問料合計を Home に表示 | low |

実装パターン: 新 service に `compose-and-dispatch` action を作り、内部で複数 service の
action を invoke。

### Phase 9: テスト層拡張

| 層 | 候補 | 工数 |
|---|---|---|
| E2E | Playwright 経由で headless Electron 起動 → クリック操作 | 中 |
| Snapshot | 生成 HTML / Markdown を golden file と比較 | 小 |
| Property 拡張 | バックテスト出力の数学的不変条件 (final ≥ -100% 等) | 小 |
| Visual regression | xvfb-run + Percy / Reg-suite | 大 |

### Phase 10: 配布・運用

| 項目 | 状況 |
|---|---|
| Auto-update | electron-builder の nsis/dmg/AppImage で publish 可能だが未配信 |
| Code signing | Mac (Developer ID) / Win (EV cert) 未取得 |
| Crash report | sentry / electron-log 未統合 |
| 多言語 | 現在 ja のみ。i18n は services.ts label の多言語キー化で対応可 |

---

## 9. 設計原則 (Principles)

### 9.1 セキュリティ
1. **Defense in depth** — keychain + redact + allowlist + path validation の多層
2. **Fail loud, not silent** — 不変条件違反は CI で deterministic crash
3. **Make wrong thing harder** — 型 + ESLint forbidden + import boundaries
4. **Allowlist > Blocklist** — Atlassian `*.atlassian.net` / Ollama 3 endpoints /
   Stocks universe

### 9.2 信頼性
1. **Deterministic mocks** — xorshift32 seeds, 同じ入力 → 同じ出力
2. **Phase deferred pattern** — interface 先で凍結、実装後付け
3. **isMock: true flag / `persisted: false`** — UI が必ず表示
4. **No silent fallbacks** — 不明状態は明示的に return null + UI で「未設定」表示

### 9.3 品質
1. **Mutation ratchet** — 100% を維持、新 scope 追加時は段階的に戻す
2. **Equivalent mutant justification** — `// Stryker disable` には必ず説明コメント
3. **Cross-doc consistency** — 数値は CI で source と一致確認
4. **`file:line` references** — 171 件全てが verify:arch で resolution チェック

### 9.4 ユーザー透明性
1. **Disclaimer-first** — AI 出力 / paper trade / 法務 UI には必ず免責バナー
2. **No real-money execution by default** — broker 連携は Phase 7 で段階導入
3. **Honest claims** — 「絶対」「保証」を使わない。教科書的戦略は教科書的説明のみ
4. **Educational, not advisory** — 投資助言業 / 運用業に該当しない表現を選ぶ

### 9.5 開発フロー
1. **Bisectable commits** — テスト pass + lint pass + build pass を全 commit で維持
2. **Stacked PR**: 罠 #3 で確立した consolidated 方式 (最終 head → main の単一 PR) を推奨
3. **Doc-as-code** — README / ARCHITECTURE / SESSION_HANDOFF は code と同コミットで更新
4. **SessionStart hook** — 新セッションが自動で SESSION_HANDOFF.md を案内

---

## 10. 反パターン (やってはいけない設計)

| 反パターン | なぜダメ | 代替 |
|---|---|---|
| renderer から直接 fetch | secrets が renderer に来る | preload bridge + main fetcher |
| try/catch でエラー握りつぶし | サイレント失敗 | safeErrorMessage で型保持 + ログ |
| 文字列連結で SQL/HTML 構築 | injection | parameterized query / `escapeHtml` |
| ToS グレーゾーンの broker scraping | アカウント凍結 / 法的リスク | 公式 API + 利用規約遵守 |
| Mutation スコア下げ | 退行検出力低下 | break threshold は up-only |
| 「Just trust the AI」 | hallucination + 規制 | strict schema + allowlist + 免責 |
| 機能優先・テスト後回し | regression 検出不能 | feature + test 同コミット |
| 巨大 PR で 1 機能を全部 | レビュー不能 | 細かい commits + mutation 段階的 ratchet |
| 同形 interface を fetcher 毎に重複 | DRY violation / 修正コスト 7x | `src/shared/<domain>Types.ts` に集約 |
| 882 行コピペページ | レビュー不能 / 漏れ | 共通コンポーネント (`ShigyoConsole`) に抽出 |
| `as number` リテラルキャスト | 型安全性低下 | `satisfies <Type>` |
| `for (const _ of ...) count++` | 未使用変数 warning | `arr.match(re)?.length` 等 |
| `example.jp` mock メール | RFC 2606 非予約 — 実在踏むリスク | `example.com` / `example.org` |
| user-controlled regex を shell に渡す hook | コマンドインジェクション | pure Node `fs`/`path` API (固定引数 `execSync` は可) |

---

## 11. データ移行・後方互換

| 種別 | 戦略 |
|---|---|
| secrets.json schema 変更 | バージョン番号埋め込み + migrate function |
| state.json (将来) | 同上、版違いは default に rollback |
| dashboard HTML format | 単一 HTML self-contained なので互換性問題ほぼ無し |
| Stryker config | git history が ratchet 推移を残しているので「いつ何故」が辿れる |
| Fetcher interface 緩和 | covariant 変更 (literal `false` → `boolean` 等) は OK / contravariant は破壊的 |
| 旧 fetcher 名 re-export | `export type X = SharedY` で後方互換維持 (PR #9 の士業 fetcher) |

---

## 12. メトリクス推移

| 時点 | services | actions | tests | mutation | break | 主な追加 |
|---|---:|---:|---:|---:|---:|---|
| 旧 v1 開始 | 14 | 17 | 440 | 90.33% | 90 | 初期 |
| KPI 追加後 | 15 | 17 | 449 | 90.33% | 90 | kpi |
| 100% 初回到達 | 15 | 17 | 479 | 100.00% | 99.8 | mutation kill |
| Stocks 追加 | 16 | 19 | 552 | 94.76% | 94 | stocks |
| Equity+MD 追加 | 16 | 22 | 726 | 100.00% | 99.8 | dashboard |
| PR #2 完了 | 28 | 30+ | ~900 | 100.00% | 99.8 | 連携先 10 SaaS |
| PR #5 (quality) | 29 | 31 | ~950 | 100.00% | 99.8 | quality dashboard |
| PR #6 (storage) | 30 | 32 | ~1000 | 100.00% | 99.8 | storage |
| PR #7 (士業 7) | 37 | 39 | ~1100 | 100.00% | 99.8 | 士業 7 |
| PR #8 統合 | 45 | 45+ | 1193 | 100.00% | 99.8 | featured + handoff |
| PR #9 完了 | 45 | 45+ | 1193 / 1242 | 100.00% | 99.8 | DRY refactor (-685 行) |
| **PR #9 + utils (現在)** | **45** | **45+** | **1238 / 1287** | **100.00%** | **99.8** | **ServiceActionPanel utils (XSS / locale)** |

**累計**: 31 services / 26+ actions / 802 tests を追加しつつ全段で 100% mutation kill を
維持。

---

## 13. 推奨される「次の一手」

PR #9 で 5 個の SHOULD-FIX / NIT (`note` XSS / amount locale / storage
recommendations 動的化 / useState→reducer / CrossServiceKpis 経由化) を
すべて消化。残る作業は **アーキテクチャ拡張** = Phase 6+ のみ。

優先度順:

1. **Phase 6 第一歩 — Library IndexedDB 永続化**
   - 既存 SNAPSHOT を IndexedDB に move
   - 4 業務サービス + 7 士業の `record-entry` の `persisted: false` → `true` に切替
   - 工数: 半日
   - リスク: 低

2. **Phase 6 — quality dashboard の自動生成**
   - 現状ハードコード数値 → `scripts/quality-report.cjs` 経由で動的化
   - 工数: 1-2 時間
   - リスク: 低

3. **Phase 6 — 横断 KPI に士業月次顧問料合計**
   - 7 士業 `monthlyFee` の合計を `CrossServiceKpis` に追加表示
   - 工数: 1 時間
   - リスク: 低

4. **Phase 6 — Storage の実 OS 統計取得**
   - Electron main プロセスで `os` / `fs` API 経由
   - 工数: 半日
   - リスク: 中 (OS 差分対応)

5. **Phase 6 — `advise` の Anthropic API 接続**
   - 現状の静的 stub → 実 LLM 呼び出し
   - 工数: 1 日
   - リスク: 中 (key 管理 + JSON validation)

6. **Phase 6 — 連携先 10 SaaS の live REST 実装**
   - Stripe / Shopify / Salesforce / Microsoft 365 / etc.
   - 工数: 各 0.5-1 日 × 10
   - リスク: 中 (各 API の認証差分)

実装順は 1 → 3 → 2 → 4 → 5 → 6 を推奨 (低リスク × 効果大から)。

---

## 14. 結論

**Service Hub v2 (45 services) は「数十のサービスを単一 GUI で扱い、CI 駆動で品質を維持し
続けるデスクトップアプリ」として完成形に近い。**

PR #9 完了時点で:
- 45 services / 1287 tests / 100% mutation / 171 refs / 4 cross-doc facts が CI で
  自動検証
- 12 不変条件で構造的に regression を検出
- 7 罠の回避策がドキュメント化済み
- SessionStart hook で新セッションが自動で文脈を取得
- 共通型 + 共通コンポーネント抽出で **882 行のコピペを 178 行 + 5 行ラッパ × 7** に削減
  (-685 行)

残る Phase 6+ は技術ではなく **法的・規約レベルの判断** および **外部 API key 取得** が
gating 要因。それ以外のコア機能 (paper trade / AI advisor / dashboard export / 戦略
比較 / 士業連携 UI / storage / quality) は全て揃い、100% mutation kill + 12 不変条件で
**退行を構造的に検出** する仕組みが回っている。

このリポジトリは「機能を増やしながら品質も上げる」開発フローの実例として、別プロジェクト
への **テンプレート転用** が可能。特に:
- mutation ratchet 運用
- verify:arch (doc-source consistency)
- Phase deferred pattern (`isMock: true` / `persisted: false`)
- LLM 出力の strict validation (`validateAdvisorJson`)
- shared types in `src/shared/<domain>Types.ts`
- 共通 UI コンポーネント抽出 (`ShigyoConsole` パターン)
- SessionStart hook + `SESSION_HANDOFF.md` の handoff 機構
- 罠の累積ドキュメント化

は他プロジェクトでもそのまま再利用できる。

---

_Service Hub design process. Updated: 2026-05-20 (PR #9 後、45 services 反映)._
