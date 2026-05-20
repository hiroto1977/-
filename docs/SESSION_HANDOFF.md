# Service Hub — セッション引継ぎ

> このドキュメントは **新しい Claude Code セッションが開始した時点での
> プロジェクト状態 / 既存パターン / 未解決の follow-up / 既知の罠**
> を簡潔にまとめたものです。`SessionStart` hook が自動でこのファイルの
> 存在を案内します (`.claude/settings.json` + `scripts/session-context.cjs`)。
>
> 大幅な変更を加えた時は **このファイルも合わせて更新** してください。

## 現状サマリ (45 services)

| 区分 | サービス |
|---|---|
| 🌟 featured (6) | home / business / teamradar / templates / library / settings |
| 🔧 tools (13) | skills / security / cloudflare / emotions / ollama / kpi / stocks / uber-eats / demae-can / real-estate / mutual-funds / quality / storage |
| 🔗 integrations (26) | 既存 9 (GitHub/WordPress/Atlassian/Notion/Drive/Calendar/Gmail/Slack/Canva) + 連携先 10 (Microsoft 365/Dropbox/Salesforce/Discord/Asana/Linear/Sentry/Shopify/Stripe/LINE) + 士業 7 (税理士/社労士/弁護士/司法書士/行政書士/中小企業診断士/弁理士) |

**品質メトリクス:** 1238 静的 / 1287 実行時 tests passing · Stryker mutation **100.00%** · typecheck / ESLint clean · verify:all green (45 service tests + 171 file:line refs + 6 metrics + 4 cross-doc facts) · standalone HTML 440 KB

## 確立されたパターン

### A. 新規サービス追加 (3 系統で使い分け)

#### A-1: external SaaS (Bearer token 認証、Phase 6 で live 接続予定)
```bash
npm run scaffold -- <id> "<Label>" <ICON> bearer
```
→ `LIVE_FETCHERS` に登録、`LOCAL_SERVICES` には **登録しない**。`category: 'integrations'`。snapshot 専用 stub にリライト (HTTP 呼び出し削除、`STUB + Impl + wrapper` 二段構造)。

#### A-2: local/snapshot 専用 (公式 API 無し、永続的 stub)
同じ scaffold → ただし `LOCAL_SERVICES` に **追加する**。トークン未設定エラー回避が目的。例: 士業 7 / quality / storage / uber-eats / demae-can / real-estate / mutual-funds。

#### A-3: 実 API 接続 (例: GitHub / Notion / Slack)
scaffold 後、`<id>.ts` の HTTP 呼び出し部を実装 + `__tests__/<id>.test.ts` に mock fetch + boundary tests。

### B. snapshot-only stub の標準形 (`home.ts` パターン)
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

### C. ServiceActionPanel + ServiceAdvisorResponse
- write action は `{ ok: true, recordedAt, persisted: false }` shape を持たせて UI に「Phase 6 まで保存されません」を構造的に強制 (PR #4 BLOCKING-3)
- AI advise は `src/shared/advisorTypes.ts` の共通 `ServiceAdvisorResponse` 型 (`{ recommendations, disclaimer, notForRealMoney: true, phase: 'stub' | 'live' }`) を返す。投資系 (real-estate / mutual-funds) は disclaimer に「投資助言ではありません」必須

### D. 独立レビュー サイクル
1. 直近 commits を base..HEAD で diff
2. `Agent` (Opus) で並列レビュー → 🔴 BLOCKING / 🟡 SHOULD-FIX / 🟢 NIT 分類
3. inline コメント + Comment レビューを PR に投稿 (自己 PR は REQUEST_CHANGES 不可)
4. BLOCKING は即修正、SHOULD-FIX は条件次第、NIT は follow-up
5. R1 → R2 → R3 ... で「指摘なし」になるまで継続

### E. ARCHITECTURE.md 同期 (verify:arch invariant)
`docs/ARCHITECTURE.md` には 170+ の `file:line` 参照 + 6 live metrics (service count / test count / IPC / OAuth / verify:arch ref count / client モジュール数) があり、`npm run verify:arch` で自動チェック。**新サービス / テスト / コード移動の度に同期更新が必要**。失敗パターン:
- サービス数を増やしたら ARCHITECTURE.md の数字 + §3.1 表に行追加 + CLAUDE.md / USER_GUIDE.md の "N services" も全部
- IPC handler 追加 / `LIVE_FETCHERS` 行範囲変更時の line ref 追従

## 既知の罠

### 罠 1: scaffold ハイフン + 数字 ID で camelCase collapse (修正済)
旧 `scaffold-service.cjs` は `microsoft-365` → `microsoft365` (camelCase で hyphen 消失) で LIVE_FETCHERS / LIVE_ACTIONS のキーを生成していた。これは ServiceId (`'microsoft-365'`) と mismatch して typecheck で気付くが、修正に時間を取られた。

**修正:** `idKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(id) ? id : `'${id}'`` を導入 (PR #7 で根本修正)。将来の hyphen + digit ID も自動で quoted key になる。

### 罠 2: Stryker 100% 維持
追加した fetcher は `stryker.config.json` の `mutate` 配列に **必ず追加**。さらに UX content (advise の disclaimer / recommendations、record-entry の validation) は StringLiteral / ObjectLiteral mutation が大量に発生するため `// Stryker disable all` / `// Stryker restore all` で block-level に囲む (next-line では多行カバー不能)。

### 罠 3: スタック PR の merge order
複数 PR を base 関係で積み上げた場合 (PR #4 base=PR #3 branch、PR #5 base=PR #4 branch、…)、最初の PR が main に merge されると後続 PR の base が dangling になる可能性がある。GitHub は通常 auto-rebase するが、**順序が崩れると後続 PR の merge が間違った branch に対して行われる**ことがあった。本 PR (#8) は claude/shigyo-integrations から直接 main に向けることで一括反映。

**回避策:** スタック化したら **同時に並列で merge せず、base から 1 つずつ確認しながら**。あるいは最終 head から main 向けの consolidated PR を作る (本 PR の方式)。

### 罠 4: verify:arch のテスト数 drift
`ARCHITECTURE.md` のテスト件数は `grep -rE "^\s*it\(" src/` の実数と一致必須。新規テスト追加 / scaffold 出力で **常に drift する** ので、毎 commit 後に `npm run verify:arch` で確認。

### 罠 5: literal type narrowing in snapshot.ts
`monthlyFee: 22_000` 等が `22000` literal type に narrow される問題。`as number` cast は anti-pattern 指摘あり (PR #7 R1)。将来は親 object に `satisfies` 句または `as const` 戦略統一を推奨。

## 未解決 follow-up (優先度順)

### ✅ 解決済 (PR #9 で一括反映 — `claude/followup-cleanup`)
- ~~PR #6 R1 #1~~ — メモリ閾値 `< 80%` → `< 75%` に修正
- ~~PR #6 R1 #2~~ — `CleanupTask.executable: false` → `boolean` に緩和
- ~~PR #6 R1 #3~~ — `largeFolders` をサイズ降順ソート (`[...largeFolders].sort((a, b) => b.sizeGb - a.sizeGb)`)
- ~~PR #7 R1 #2~~ — 28 重複 interface を `src/shared/shigyoTypes.ts` に集約
- ~~PR #7 R1 #3~~ — 7 士業ページ 882 行を `components/ShigyoConsole.tsx` (178 行) に抽出 → 各ページ 5 行ラッパへ
- ~~PR #7 R1 #4~~ — `as number` キャスト 14 箇所を削除し `satisfies ShigyoSnapshot` で literal narrowing 回避
- ~~PR #7 R1 #5~~ — `example.jp` → `example.com` (8 箇所)、弁護士 / 弁理士に `disclaimer` prop 追加
- ~~PR #7 NIT (13)~~ — ステータス色 tooltip 追加 (`STATUS_TOOLTIP` in `ShigyoConsole.tsx`)

### ✅ 解決済 (`/loop` セッションで一括反映 — `claude/followup-cleanup` 追加 commits)
- ~~PR #4 NIT~~ — `note` の XSS / control-char チェック (`serviceActionPanelUtils.ts:sanitizeNote` + 9 tests)
- ~~PR #4 R2-2~~ — `ServiceActionPanel` の amount に locale 対応 (`serviceActionPanelUtils.ts:normalizeAmount` + 11 tests、全角 / カンマ / 桁区切り対応)
- ~~PR #6 NIT~~ — storage `recommendations` を `pages/storageRecommendations.ts` で動的生成 (閾値ベース + 12 tests、disks/performance/cleanupTasks から導出)
- ~~PR #4 R2-3~~ — `ServiceActionPanel` useState 7 個 → `useReducer` state machine (`serviceActionPanelReducer.ts` + 13 tests、discriminated union で排他化)
- ~~PR #4 R2-1~~ — `CrossServiceKpis` を `useServiceData` 経由化 (live モード時不整合解消)

直近セッションの SHOULD-FIX / NIT は **すべてクローズ** — 残作業はアーキテクチャ拡張のみ。

### 📐 アーキテクチャ拡張案
1. Phase 6: 4 業務サービス (uber-eats / demae-can / real-estate / mutual-funds) と 7 士業の `record-entry` を IndexedDB 永続化に切替 → `persisted: true` に更新
2. Phase 6: `advise` の Anthropic API 接続 (現状は静的 stub)
3. 連携先 10 SaaS (Stripe / Shopify / etc.) の live REST 接続実装
4. Storage: Electron main プロセスで `os` / `fs` 経由の実 OS 統計取得
5. quality dashboard の数値を `scripts/quality-report.cjs` から自動生成 (現状ハードコード)
6. ~~横断 KPI ウィジェットに士業の月次顧問料合計を追加~~ ✅ `/loop` セッションで対応 (5 stats → `BusinessPage.tsx:CrossServiceKpis`)

## クイック検証チェックリスト (新セッション開始時)

```bash
# 1. ブランチ + 状態確認
git status && git log --oneline -5

# 2. 基本品質ゲート
npm run typecheck && npm test && npm run verify:all

# 3. ESLint clean か
npm run lint

# 4. 必要に応じて Stryker (5 分かかる)
npm run mutate

# 5. ブラウザ版動作確認 (オプション)
npm run build:web   # dist/standalone.html 生成
```

すべて green なら作業開始 OK。1 つでも fail なら、まず原因を調査してから新規作業に入る。

## 参考: 主要ドキュメント

- `CLAUDE.md` — プロジェクト概要 + Claude Code 用ガイダンス
- `docs/ARCHITECTURE.md` — 設計詳細、サービスレジストリ §3.1、Action payload schema、egress マトリクス、不変条件 15 個
- `docs/BROWSER_REDESIGN.md` — Vault / Library / OAuth / Proxy / FSA のブラウザネイティブ再設計
- `docs/USER_GUIDE.md` — エンドユーザー (非エンジニア) 向け 1 冊目
- `docs/PROXY_EXAMPLE.md` — Cloudflare Worker SSRF guard サンプル
- `docs/QUALITY.md` — テスト方針 + mutation 履歴
