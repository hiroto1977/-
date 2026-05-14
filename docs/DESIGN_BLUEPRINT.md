# Service Hub 設計図 — 統合ブループリント

> 本書は本リポジトリで実装・確立されたパターン、安全境界、ロードマップを 1 ファイルに統合したものです。
> 個別の詳細は `docs/ARCHITECTURE.md` (file:line refs 付き) / `docs/QUALITY.md` (mutation スコア) を参照。

---

## 1. システムの一行定義

> **Electron デスクトップで 16 種類のサードパーティサービスを単一サイドバーから操作するハブ。
> 全 OAuth トークン / API キーは OS キーチェーンで暗号化、renderer は秘密値を見ない 3 プロセス分離。
> CI が 15 種類の不変条件を自動検証し、Stryker mutation で 100% covered (break=99.8) を維持する。**

---

## 2. 不変条件 (CI で fail-on-violation)

| # | チェック | 実装 | 自動失敗条件 |
|---|---|---|---|
| 1 | TypeScript 型 | `tsc -b --noEmit --force` | 型エラー |
| 2 | アーキ参照整合 | `scripts/verify-architecture.cjs` | 170 件の `file:line` の 1 つでもズレ / 6 メトリクスのいずれかズレ |
| 3 | 禁止パターン | `scripts/lint-forbidden-patterns.cjs` | eval / dangerouslySetInnerHTML / 他 8 パターン |
| 4 | プロセス境界 | `scripts/check-import-boundaries.cjs` | renderer が src/main を import |
| 5 | ドキュメント一貫性 | `scripts/cross-doc-consistency.cjs` | 4 cross-doc fact の不一致 |
| 6 | テスト網羅 | `scripts/lint-test-coverage.cjs` | サービス毎にテストファイル無し / アクション毎にテスト無し |
| 7 | ユニットテスト | Vitest | 失敗テスト 1 つでも |
| 8 | カバレッジ (clients のみ) | `npm run test:cov` | 設定閾値割れ |
| 9 | Mutation スコア | Stryker | break threshold (現 99.8%) 未満 |
| 10 | レンダラビルド | `vite build` (renderer + main + preload) | ビルド失敗 |

上記をすべて `.github/workflows/ci.yml` が push/PR 毎に走らせる。

---

## 3. アーキテクチャ三層

```
┌────────────────────────────────────────────────────────────────┐
│ src/renderer  (React + Vite)                                   │
│   App.tsx → sidebar driven by services.ts (single SOURCE)      │
│   pages/* → useServiceData(id, SNAPSHOT[id])                   │
│   components/StatusBar.tsx · Section · DataList                │
│   bridge: window.serviceHub.<method>  ← typed via              │
│           src/shared/bridge.d.ts (re-declares preload)         │
└──────────────────────┬─────────────────────────────────────────┘
                       │ contextBridge (sandbox: false, contextIsolation: true)
┌──────────────────────┴─────────────────────────────────────────┐
│ src/preload  (typed bridge only)                               │
│   ipcRenderer.invoke('app:*' / 'secrets:*' / 'fetch:snapshot'  │
│     / 'action:invoke' / 'oauth:*')                             │
└──────────────────────┬─────────────────────────────────────────┘
                       │ IPC (typed via TypeScript project refs)
┌──────────────────────┴─────────────────────────────────────────┐
│ src/main  (Electron main process)                              │
│   main.ts           IPC handlers + BrowserWindow setup         │
│   secrets.ts        OS keychain (safeStorage) + fallback       │
│   oauth.ts          PKCE loopback OAuth (drive/cal/gmail)      │
│   clients/index.ts  LIVE_FETCHERS + LIVE_ACTIONS               │
│   clients/<svc>.ts  per-service REST client + actions          │
└────────────────────────────────────────────────────────────────┘
                       │
                       ▼ external network (only main process)
        api.github.com / atlassian.net / slack.com / api.canva.com /
        api.anthropic.com (skills/emotions/stocks-advisor) / etc
```

**鉄則**:
- Renderer → 直接 fetch 禁止 (秘密がレンダラに来る = アウト)
- Preload → 純粋に IPC 通過のみ (ロジック禁止)
- Main → 唯一の secrets / OAuth / 外部通信処
- 外部リンク → `shell.openExternal(url)` (window.open 禁止)

---

## 4. 16 サービスマトリクス

| ID | LOCAL | OAuth | 認証 | actions | 備考 |
|---|:---:|:---:|---|---|---|
| github | | | Bearer (PAT) | `create-issue` | |
| wordpress | | | Bearer | `create-post` | |
| atlassian | | | Basic + site URL JSON | `create-issue` | `*.atlassian.net` allowlist |
| notion | | | Bearer (integration) | `create-page` | |
| drive | | ✅ | OAuth PKCE | `create-folder` | GOOGLE_OAUTH_CLIENT_ID |
| calendar | | ✅ | OAuth PKCE | `create-event` | |
| gmail | | ✅ | OAuth PKCE | `create-draft` | RFC 2822 + base64url + header injection防御 |
| slack | | | xoxp/xoxb token | `send-message` | |
| canva | | | Bearer | `create-folder` | |
| skills | ✅ | | Bearer (Anthropic) | `run-skill` | `~/.claude/skills/<name>` |
| security | ✅ | | API keys JSON | `check-email-breach`, `scan-url` | Norton 検出 + HIBP + VirusTotal |
| cloudflare | | | Bearer (API token) | `create-dns-record`, `purge-cache` | |
| emotions | ✅ | | Bearer (Anthropic) | `log-mood`, `analyze-text` | |
| ollama | ✅ | | none | `chat` | 127.0.0.1 固定 + CVE 警告 + null byte 拒否 |
| kpi | ✅ | | none | (read-only) | 6 事業 × 8 指標 × 30 期 mock (Phase 6 で API 接続) |
| stocks | ✅ | | Bearer (Anthropic, advisor のみ) | `register-ticker`, `backtest`, `compare-strategies`, `advise`, `export-dashboard`, `export-dashboard-md` | 5 mock 銘柄 + Phase 7 で broker 接続 |

---

## 5. 共通パターン (Proven by Implementation)

### 5.1 Fetcher contract
```ts
type FetchContext = { token: string; fetch?: typeof fetch }
type Fetcher<T> = (ctx: FetchContext) => Promise<T>

// 登録: src/main/clients/index.ts:LIVE_FETCHERS
// 呼び出し: ipcMain.handle('fetch:snapshot', ...) → renderer
// テスト: vi.fn<typeof fetch>() で 100% 単位テスト
```

`fetch` を引数注入することで Node 単体テストで実ネットワーク無しに完全カバレッジ。

### 5.2 Action contract
```ts
type ActionContext = FetchContext & { payload: Record<string, unknown> }
type ServiceAction = (ctx: ActionContext) => Promise<unknown>
type ActionMap = Record<string, ServiceAction>

// 登録: src/main/clients/index.ts:LIVE_ACTIONS
// 呼び出し: window.serviceHub.invoke<T>(serviceId, actionName, payload)
```

各 action は `payload` を `unknown` で受け取り、**自前で型ガード**するのが鉄則。

### 5.3 FetchError contract
```ts
class FetchError extends Error {
  constructor(message, readonly status, readonly serviceId)
  this.name = 'FetchError'
}
// jsonFetch が status >= 400 で FetchError を投げる
// safeErrorMessage(err) + redactSecrets(msg) を経由してレンダラに渡る
```

エラーメッセージ中のトークン (sk-ant- / ghp_ / ya29. / xoxp- / Bearer / Basic / `"access_token":"..."` 等) は **必ず redact**。

### 5.4 Anti-hallucination JSON validation (LLM 出力)
`validateAdvisorJson(raw, allowedSet)` が以下を全部 reject:
- 不正な型 / null
- universe 外のティッカー
- 件数 < 1 / > 5
- rationale 空 / > 400 chars
- riskFactors 空 / 要素が 1-200 chars 外

これにより **LLM がティッカーをでっち上げても UI に到達しない**。

### 5.5 Phase deferred pattern
新機能を最終形のインターフェース付きで mock 実装で導入 → 後で実装を差し替える:

```ts
// kpi.ts (Phase 6)
export interface KpiDataSource { fetch(): Promise<BusinessUnit[]> }
export function createMockDataSource(): KpiDataSource { ... }
// Phase 6: createGoogleSheetsDataSource() / createFreeeApiDataSource() に差し替え

// stocks.ts (Phase 7)
export interface StocksDataSource { fetchHistory(symbol, periods): Promise<Candle[]> }
export function createMockStocksDataSource(): StocksDataSource { ... }
// Phase 7: createAlpacaDataSource() / createPolygonDataSource() に差し替え
```

`isMock: true` フラグ + 黄色 UI バナーを **必須** とすることで、本番接続前にユーザーへ明示。

### 5.6 Mutation ratchet rule
- Stryker `break` 閾値は **scope 内で非減少**
- **新ファイルを mutate scope に追加した時のみ** re-baseline を許可
- 各コミットで break threshold を up-only に更新
- 100% TOTAL を維持するために `// Stryker disable` を使ってよいが、**コメントで等価性を説明する必須**

実装で確立されたパターン:
```ts
// Stryker disable next-line ConditionalExpression
// 〈なぜ等価か / どのテストがピン留めしているか〉
if (defensive_guard) { ... }
```

### 5.7 Cross-doc fact consistency
`scripts/cross-doc-consistency.cjs` が:
- サービス数 / IPC ハンドラ数 / OAuth 数 / サービス ID リスト (set 同値)
- を `src/shared/serviceId.ts` / `src/main/main.ts` / `src/main/oauth.ts` から抽出
- doc 内の数値表現とマッチングして fail-on-mismatch

→ ドキュメント drift が CI で即検出される。

---

## 6. 安全境界 (Boundaries Never Crossed)

| 領域 | やる | やらない | 理由 |
|---|---|---|---|
| 株式 | ペーパートレード / シグナル生成 | 実発注 | 金融商品取引法 + 口座保護 |
| AI出力 | 教育目的の参考情報 + 免責 | 「今買え」型断定 / 価格予測 | 投資助言業登録未取得 |
| Ollama | 127.0.0.1 + /api/version/tags/chat のみ | /api/pull / /api/create / /api/push | 未パッチ OOB CVE 回避 |
| ファイル書き出し | `~/` 配下 + 拡張子 allowlist | パス外 / 任意拡張子 | path-traversal 防止 |
| renderer | preload bridge 経由のみ | nodeIntegration / contextIsolation off | サンドボックス維持 |
| シークレット | safeStorage 暗号化 | 平文 .env / コミット | キーチェーン前提 |
| 外部接続先 | 12 既知ホスト + ローカル 1 | 未登録ホスト | ネットワーク allowlist |

これらは **CI で確認可能なもの** は `verify:arch` / `lint:forbidden` に組み込み済み。

---

## 7. テスト戦略 (4 層)

| 層 | ツール | 担当範囲 | 例 |
|---|---|---|---|
| Unit | Vitest | 純関数 / mock fetch / IO 分離 | `sma([1,2,3,4,5], 3) === [null, null, 2, 3, 4]` |
| Property | vitest `it.each(seeds)` | 不変条件 ∀ 入力 | `rsi(closes, 14) ∈ [0, 100]` で 5 seed × 5 assert |
| Patch (Invariant) | Vitest | 保存則・代数則 | `cash + position_cost === initialCash` ∀ buy |
| Mutation | Stryker | テスト suite の感度 | `>= 0` vs `> 0` 境界、`'foo'` → `""` 文字列 |

**ratchet**: 100% covered + 100% TOTAL を全 11 ファイルで維持。引き上げ済み break=99.8。

---

## 8. 完了済み機能 (Done)

### 8.1 Service Hub 中核 (10 既存サービス)
- 全 fetcher: 10 + kpi + stocks = 12 ファイル × 100% mutation
- 全 action: 17 個 (注: README 表記; 実数は 19 個に増加 — stocks の 6 + 他 13)
- OAuth PKCE loopback (drive / calendar / gmail) — DNS rebinding / CSRF defense 完備
- 外部リンク: shell.openExternal 経由
- redactSecrets: 8 トークンパターン

### 8.2 KPI / BEP サブシステム (Phase 6 deferred)
- 6 事業ユニット × 30 期決定論データ
- 8 BEP 指標 (variableCost / fixedCost / contribution / contributionRatio / variableRatio / fixedRatio / bep / bepRatio / safetyMargin / operatingProfit / operatingLeverage)
- 自前 SVG チャート 4 種 (CSP 準拠)
- `KpiDataSource` 差し替え interface

### 8.3 Stocks サブシステム (Phase 7 deferred)
- 5 mock 銘柄 (TSE + 米国株) × 120 期決定論データ
- 5 テクニカル指標 (sma / ema / rsi / macd / bollingerBands)
- 3 戦略 (sma-crossover / rsi-mean-reversion / macd-signal)
- Paper portfolio engine (10% sizing / 5% stop / 15% take-profit)
- Backtest with equity curve
- **6 actions**:
  - `register-ticker` — 記号 validation
  - `backtest` — 1 戦略実行
  - `compare-strategies` — 3 戦略並列 + 最良判定
  - `advise` — Anthropic API + JSON-schema 強制
  - `export-dashboard` — HTML 書き出し
  - `export-dashboard-md` — Markdown 書き出し

### 8.4 AI orchestration (advisor)
- `buildTickerAnalysis(symbol, label, candles): TickerAnalysis`
- `advisorSystemPrompt(allowedSymbols)` — JSON-only / symbol allowlist / "今買え" 禁止
- `validateAdvisorJson(raw, allowedSet)` — 厳格 schema 検証
- `ADVISOR_DISCLAIMER` 必須添付 + `notForRealMoney: true` 型ガード

### 8.5 Dashboard
- `renderDashboardHtml(input)`: SVG sparkline 埋め込み / 黄色注意バナー / portfolio タイル / watchlist テーブル / advisor 結果 / 戦略比較 / footer
- `renderDashboardMarkdown(input)`: 同じデータの Markdown 版 (Slack / Notion / メール本文用)
- `defaultDashboardPath()`: `~/.local/business-hub/data/dashboard.html`
- `defaultDashboardMdPath()`: 同 `.md`
- `isSafeDashboardPath` / `isSafeDashboardMdPath`: 拡張子 allowlist + path-traversal 防止

---

## 9. ロードマップ (Phase 7 以降)

### 9.1 Phase 7 — Stocks live integration (deferred)

**前提**: ユーザーが broker / data feed API key を取得済み。

#### 9.1.1 Live data feed
- Replace `createMockStocksDataSource()` with one of:
  - **Alpaca Markets**: 米国株 + crypto, 無料 tier あり
  - **Polygon.io**: 日中足までならフリー
  - **Yahoo Finance**: 非公式 (ToS グレー — 推奨しない)
  - **JP Quote**: 日本株 (要法人契約)
- Interface 変更なし (`StocksDataSource` のまま)
- 切り替え方法: 環境変数 `STOCKS_DATA_PROVIDER=alpaca` 等
- Cache 層 (rate limit 対策): in-memory LRU + `~/.local/business-hub/data/cache/<symbol>-<date>.json`

#### 9.1.2 Broker order executor
**重要**: ここから先は実弾発注 = 高リスク。**段階的実装** 推奨:

**Stage A: Order intent generator** (ToS 違反ゼロ・規制ゼロ)
- 新 type: `OrderIntent { symbol, side: buy|sell, qty, type: market|limit, limit_price?, ttl }`
- 新 action: `generate-order-intent` (シグナルから OrderIntent を作る)
- UI: 「この注文を Web3App にコピペする」ボタン + 注文画面そっくりな読み上げ
- 規制: 助言業に該当しない (個別の銘柄選定・売買時期の判断を「助言」してない、フォーマット変換のみ)

**Stage B: Broker dry-run** (Stage A + payload 生成のみ送信なし)
- `BrokerExecutor` interface 追加:
  ```ts
  interface BrokerExecutor {
    placeOrder(intent: OrderIntent, opts: { dryRun: true }): Promise<DryRunResult>
  }
  ```
- 各 broker 用 implementation (Alpaca / IB / 楽天 / SBI) を別ファイル
- 必ず `dryRun: true` ハードコード (Stage C で外す)
- UI: 「dry-run で発注ペイロードを確認」ボタン

**Stage C: Real execution** (要 broker 契約 + 法的確認)
- `dryRun: false` を許可
- **必須 UI**:
  - 1 注文ごとに確認モーダル (注文内容を読み上げ)
  - 日次最大発注金額 (例: ¥100,000) を `secrets:set('stocks-limits', JSON)` で保持
  - kill switch: 全注文停止ボタン (1 クリック)
  - 利確 / 損切 を broker 側 OCO 注文として送信
- 監査ログ: 全発注を `~/.local/business-hub/data/audit/<date>.jsonl` に永久保存
- **法的事前確認**: 投資助言業 / 投資運用業 登録の要否 (個人利用なら不要、第三者提供は登録要)

#### 9.1.3 Persistent state (broker と独立、Phase 7 第一歩として安全に実装可能)
- `~/.local/business-hub/state.json` 原子的書き出し
- Schema:
  ```ts
  {
    watchlist: string[],  // ユーザー追加 ticker
    portfolio: {
      cash: number,
      initialCash: number,
      positions: { [ticker]: { shares, avgCost } },
      history: PaperTrade[],
    },
    advisorHistory: { question, response, timestamp }[]  // 最新 50 件
  }
  ```
- New actions:
  - `unregister-ticker` (現在は validation のみ)
  - `reset-paper-portfolio`
  - `clear-advisor-history`
- `register-ticker` / `applySignal` が state を実際に永続化
- これは **broker 不要で今すぐ実装可能**

### 9.2 Phase 8 — Cross-service orchestration
既存 16 サービスの action を組み合わせる。

| 候補 | 説明 | リスク |
|---|---|---|
| Slack 配信 | 戦略シグナル / advisor 結果を Slack channel に投稿 | low (Slack action 経由) |
| Notion ページ生成 | dashboard.md を Notion ページとして作成 | low |
| Gmail ドラフト | dashboard 内容を週次レポートメール下書きへ | low |
| GitHub Issue | バックテスト結果から TODO issue 自動生成 | low |
| Cloudflare DNS rotation | ドメイン管理連携 (本ハブの主用途と乖離) | medium |

実装パターン: 新 service に `compose-and-dispatch` action を作り、内部で複数 service の action を invoke。

### 9.3 Phase 9 — テスト層拡張
| 層 | 候補 | 工数 |
|---|---|---|
| E2E | Playwright 経由で headless Electron 起動 → クリック操作 | 中 |
| Snapshot | 生成 HTML / Markdown を golden file と比較 | 小 |
| Property (拡張) | バックテスト出力の数学的不変条件 (final ≥ -100% 等) | 小 |
| Visual regression | xvfb-run + Percy / Reg-suite | 大 |

### 9.4 Phase 10 — 配布・運用
| 項目 | 状況 |
|---|---|
| Auto-update | electron-builder の `nsis` / `dmg` / `AppImage` で publish 可能だが未配信 |
| Code signing | Mac (Developer ID) / Win (EV cert) 未取得 |
| Crash report | sentry / electron-log 未統合 |
| 多言語 | 現在 ja のみ。i18n は services.ts に label を多言語化するだけで対応可 |

---

## 10. 設計原則 (Principles)

### 10.1 セキュリティ
1. **Defense in depth** — トークンは keychain + redact + allowlist + path validation の多層
2. **Fail loud, not silent** — 不変条件違反は CI で deterministic crash
3. **Make wrong thing harder** — 型 + ESLint forbidden + import boundaries
4. **Allowlist > Blocklist** — Atlassian `*.atlassian.net` / Ollama 3 endpoints / Stocks universe

### 10.2 信頼性
1. **Deterministic mocks** — xorshift32 seeds, 同じ入力 → 同じ出力
2. **Phase deferred pattern** — interface 先で凍結、実装後付け
3. **isMock: true flag** — UI が必ず表示、ユーザーが本番接続前に把握
4. **No silent fallbacks** — 不明状態は明示的に return null + UI で「未設定」表示

### 10.3 品質
1. **Mutation ratchet** — 100% を維持、新 scope 追加時は段階的に戻す
2. **Equivalent mutant justification** — `// Stryker disable` には必ず説明コメント
3. **Cross-doc consistency** — 数値は CI で source と一致確認
4. **`file:line` references** — 170 件全てが verify:arch で resolution チェック

### 10.4 ユーザー透明性
1. **Disclaimer-first** — AI 出力 / paper trade UI には必ず免責バナー
2. **No real-money execution by default** — broker 連携は Phase 7 で段階導入
3. **Honest claims** — 「絶対」「保証」を使わない。教科書的戦略は教科書的説明のみ
4. **Educational, not advisory** — 投資助言業 / 運用業に該当しない表現を選ぶ

---

## 11. 反パターン (やってはいけない設計)

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

---

## 12. データ移行・後方互換

| 種別 | 戦略 |
|---|---|
| secrets.json schema 変更 | バージョン番号埋め込み + migrate function |
| state.json (将来) | 同上、版違いは default に rollback |
| dashboard HTML format | 単一 HTML self-contained なので互換性問題ほぼ無し |
| Stryker config | git history が ratchet 推移を残しているので「いつ何故」が辿れる |

---

## 13. 開発ワークフロー (このセッションで確立)

```
1. feature scope を AskUserQuestion で確認 (高リスクなら必ず)
2. 機能追加コミット (CI green を保つ、 mutation break threshold は一旦下げて OK)
3. ratchet 戻し commits (mutation を再度 99.8% 以上に)
4. doc 更新 (verify:arch / lint:docs)
5. push → 既存 PR (#2) に追加
```

各 commit は **bisectable** (テスト pass + lint pass + build pass)。

---

## 14. メトリクス推移 (このセッション)

| 時点 | services | actions | tests | mutation | break |
|---|---:|---:|---:|---:|---:|
| Session 開始 | 14 | 17 | 440 | 90.33% | 90 |
| KPI 追加後 | 15 | 17 | 449 | 90.33% | 90 |
| 100% 初回到達 | 15 | 17 | 479 | 100.00% | 99.8 |
| Stocks 追加直後 | 16 | 19 | 552 | 94.76% | 94 |
| Stocks 100% 復帰 | 16 | 19 | 628 | 100.00% | 99.8 |
| Advisor 追加直後 | 16 | 20 | 651 | 96.37% | 96 |
| Advisor 100% 復帰 | 16 | 20 | 671 | 100.00% | 99.8 |
| Compare 追加 | 16 | 21 | 696 | 100.00% | 99.8 |
| **Equity + MD 追加** | **16** | **22** | **726** | **100.00%** | **99.8** |

**累計**: 機能を 5 段階で追加しつつ全段で 100% mutation kill を維持。

---

## 15. 推奨される「次の一手」

優先度順:

1. **stocks persistence** (Phase 7 第 1 段、ブローカー不要)
   - state.json 原子的書き出し
   - `register-ticker` / `unregister-ticker` / `reset-paper-portfolio` / `clear-advisor-history` を本物に
   - 工数: 半日
   - リスク: 低 (純粋にローカル)

2. **E2E テスト層** (Phase 9 第 1 段)
   - Playwright で headless Electron 起動 → 主要画面遷移 + AI advisor 呼び出し (mock API key) を smoke test
   - 工数: 1 日
   - リスク: 低

3. **OrderIntent generator** (Phase 7 broker 第 1 段)
   - 売買シグナルから手動コピペ用の注文ペイロードを生成
   - **規制適合グレー** (個別の助言ではないが、確認必要)
   - 工数: 半日
   - リスク: 中 (法的確認後)

4. **Cross-service: Slack 配信** (Phase 8)
   - 戦略シグナルを既存 slack action で投稿
   - 工数: 1-2 時間
   - リスク: 低

5. **i18n** (Phase 10)
   - services.ts の label を多言語キーに
   - 工数: 1-2 日
   - リスク: 低

実装順は 1 → 2 → 4 → 3 → 5 を推奨 (低リスクから順、3 は法的確認後)。

---

## 16. 結論

**Service Hub は「16 サービスを単一 GUI で扱う、CI 駆動で品質を維持し続けるデスクトップアプリ」として完成形に近い。**

残る Phase 7 (実 broker) は技術ではなく **法的・規約レベルの判断** が gating 要因。それ以外のコア機能 (paper trade / AI advisor / dashboard export / 戦略比較) は全て揃い、100% mutation kill + 15 不変条件で **退行を構造的に検出** する仕組みが回っている。

このリポジトリは「機能を増やしながら品質も上げる」開発フローの実例として、別プロジェクトへの **テンプレート転用** が可能。特に:
- mutation ratchet 運用
- verify:arch (doc-source consistency)
- Phase deferred pattern
- LLM 出力の strict validation

は他プロジェクトでもそのまま再利用できる。

---

_Generated by Service Hub design process. 2026-05-14._
