# Service Hub — セッション引継ぎ

> このドキュメントは **新しい Claude Code セッションが開始した時点での
> プロジェクト状態 / 既存パターン / 未解決の follow-up / 既知の罠**
> を簡潔にまとめたものです。`SessionStart` hook が自動でこのファイルの
> 存在を案内します (`.claude/settings.json` + `scripts/session-context.cjs`)。
>
> 大幅な変更を加えた時は **このファイルも合わせて更新** してください。

## 現状サマリ (61 services)

| 区分 | サービス |
|---|---|
| 🌟 featured (9) | home / business / teamradar / templates / library / settings / sales (売上集計) / team (チーム管理) / overview (経営サマリー) |
| 🔧 tools (14) | skills / security / cloudflare / emotions / ollama / kpi / stocks / uber-eats / demae-can / real-estate / mutual-funds / quality / storage / tax (税務試算) |
| 🔗 integrations (38) | 既存 9 (GitHub/WordPress/Atlassian/Notion/Drive/Calendar/Gmail/Slack/Canva) + 連携先 10 (Microsoft 365/Dropbox/Salesforce/Discord/Asana/Linear/Sentry/Shopify/Stripe/LINE) + 士業 7 (税理士/社労士/弁護士/司法書士/行政書士/中小企業診断士/弁理士) + EC/仕入/集客 10 (BASE/NETSEA/スーパーデリバリー/TopSeller/A8.net/AIブログくん/マネーフォワード/Amazon/Amazon アソシエイト/YouTube) + ココナラ + TikTok |

**品質メトリクス:** 1389 静的 / 1438 実行時 tests passing · typecheck / ESLint clean · verify:all green (60 service tests + file:line refs + metrics + cross-doc facts) · standalone HTML 525 KB

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

### ✅ 解決済み (claude/claude-md-docs-qqUAT で対応)
- ~~**PR #6 R1 #2** — `CleanupTask.executable: false` literal~~ → `boolean` に開放 (commit 7dc3059)
- ~~**PR #6 R1 #3** — Storage `largeFolders` サイズ降順未ソート~~ → page で降順ソート (commit 7dc3059)
- ~~**PR #7 R1 #2** — 7 士業の interface 重複~~ → `src/shared/shigyoTypes.ts` + `src/main/clients/shigyo.ts` (createShigyoFetcher) に抽出
- ~~**PR #7 R1 #3** — 7 士業 Page のコピペ~~ → `components/ShigyoConsole.tsx` に抽出 (各 Page は数行の wrapper に。−1159 行)
- ~~**PR #7 R1 #4** — `as number` cast~~ → 士業 snapshot を `satisfies ShigyoSnapshot` に統一
- ~~**PR #7 R1 #5** — `example.jp` ドメイン + 弁護士/弁理士 disclaimer~~ → `example.com` 統一 + `ShigyoConsole` の `disclaimer` prop で法的注意書きバナー追加

- ~~**PR #6 R1 #1** — Storage メモリ使用率閾値の整合~~ → `MEMORY_WARN_PCT=80` 定数化 + 推奨文言を閾値と整合
- ~~**PR #4 R2-2** — `ServiceActionPanel` amount の locale 対応~~ → `parseAmountInput` (全角・カンマ区切り対応) + テスト
- ~~**PR #4 NIT** — `note` の制御文字チェック~~ → `sanitizeNote` (C0/C1 除去・trim・上限長) + テスト
- ~~**PR #4 R2-1** — `CrossServiceKpis` の `useServiceData` 経由化~~ → 5 サービスを hook 経由に
- ~~**PR #7 NIT** — ステータス色 `相談中`/`対応中` の tooltip~~ → `ShigyoConsole` に `STATUS_HINT` title
- ~~**横断 KPI に士業月次顧問料合計~~** → `sumShigyoMonthlyFees` + CrossServiceKpis に Stat 追加

- ~~**PR #4 R2-3** — `ServiceActionPanel` の useState を state machine 化~~ → serviceActionMachine.ts (reducer + 14 tests)
- ~~ドキュメント横断の古い数字 (45/22 services, 1190/1113 tests, 376/403KB)~~ → CLAUDE/USER_GUIDE/README/ARCHITECTURE/BROWSER_REDESIGN を 60 services 等に統一

### 🤖 オーケストレーション監査 (4 チーム並列) で対応した項目
- parseAmountInput を厳格 10 進 regex 化 ('++500'/'1e3'/'0x10'/'Infinity' 等を排除)
- 境界値テスト大量追加 (全角半角混在/制御文字境界/maxLen 端/逆遷移/負値)
- 新規 `shigyo.test.ts` (createShigyoFetcher 直接検証)
- 重複 jpy フォーマッタを `src/shared/formatters.ts` に集約 (6 箇所 → 1)
- CrossServiceKpis に Math.max(0,…) 防御ガード (Security Finding 3)

### 🤖 オーケストレーション監査 後続対応 (2nd wave)
- ~~汎用 stub ファクトリ統一~~ → `src/main/clients/snapshotStub.ts` (createSnapshotStub) に
  21 client を集約 (commit 5d685d2、−99 行)。士業は別途 createShigyoFetcher。
- ~~lint:docs を CLAUDE/README/USER_GUIDE にも拡張~~ → service count の drift を CI 自動検知
  (commit c370376)

### 🤖 オーケストレーション監査 後続対応 (3rd wave)
- ~~SNAPSHOT 型厳格化で `as unknown` 排除~~ → page-level の `as unknown as XSnapshot`
  5 箇所を全廃 (Home/Stocks/Templates/TeamRadar/Business、interface を readonly 化、commit ed528c1)
- ~~新規ロジックの mutation 100%~~ → serviceActionUtils/Machine/formatters/snapshotStub で
  生存ミュータントを全 kill (commit e4f15a3)

### 🟡 follow-up (税務試算サービス)
- `src/shared/taxCalc.ts` ほか税務 3 モジュール (taxCalc / taxDeductions / taxCredits) は
  強い behavioral + 境界値テスト (合計 150+ 件) を持つが、**stryker.config の mutate 配列には
  未登録**。等価ミュータント (`<= 0` ガード等) の pragma 抑制がキャッシュ的にぶれるため。
  clean CI 環境で再追加し 100% 確認すること。

### 🟢 税額計算の残論点 (並列監査で整理)
✅ 実装済 (89913c9):
- 住宅ローン控除の **居住年×住宅性能区分** (resolveMortgageParams: 令和2-3年1.0%/令和4年以降
  0.7%、限度額を長期優良5,000万〜中古3,000万・2024年以降の非適合新築は0)。
- **住民税の調整控除** (calcResidentAdjustmentCredit + humanDeductionDiff)。
- **配当控除の投信区分** (DividendKind: 株式/投信/外貨建等で率を1/2・1/4)。
✅ d179dfe: 復興特別所得税の適用順序バグ修正。配偶者特別控除の本人所得段階は factor で実装済。

✅ c785055: 住民税の **非課税限度額** (residentTaxExemption)・生命保険料控除の **旧制度**
   (lifeInsuranceOld + 新旧併用) を実装。社保はセクション③が実額入力のため概算不要。

✅ c913321: **退職所得** (分離課税) を taxRetirement.ts に実装 (退職所得控除/1/2課税/
   2022年改正の短期退職手当等/障害退職、TaxPage セクション④)。

残り (要設計判断・スコープ大):
- **一時所得・譲渡所得 (申告分離)** (給与+配当+退職に特化中。一時所得は1/2総合課税、
  譲渡は分離15-20%で別計算。着手前に方針確認を推奨)。
- 社会保険料の **標準報酬月額テーブル** 化 (概算セクション② のみ。③は実額入力で回避済で優先度低)。
- 住民税の自治体差 (均等割の超過課税・調整控除の地域差等)。実用上は標準額で十分。

### ⛔ 試行して撤退した案 (再挑戦は慎重に)
- **business.ts の責務分割** — kpi/advisor/export の 3 モジュール + バレル化を実装し
  typecheck/全テスト(112)/lint/verify/build まで green になったが、**フル mutation
  (`npm run mutate`) で 100% → 93.63% に低下**して撤退 (commit せず revert)。
  render テンプレート (HTML/CSS/SVG) の StringLiteral が、モノリスでは perTest
  coverage で kill されるのに、別ファイルに移すと Stryker の coverage 帰属が外れて
  NoCoverage/Survived 化する。回避には装飾 render に StringLiteral disable を被せる
  必要があり、それは「実シグナルを隠す」副作用がある。**分割の利得 (行数削減) より
  mutation 精度の劣化が勝る**と判断。stocks.ts も同じ render-template 構造なので
  同様のリスク大。分割するなら mutation 設計の合意が前提。

### 🟢 NIT (残・低優先)
- PR #6: storage `recommendations` 固定文字列の usagePct ハードコード (静的 snapshot text のため
  低優先 — 実 OS 統計は Phase 6 で動的化されるので、それまで据え置き)
- Docs 監査の追加案: lint:docs / verify:arch に HTML size の drift 検知も追加

### 📐 アーキテクチャ拡張案 (Phase 6 — 実 API/永続化が要るため独立タスク)
- Phase 6: 4 業務サービス + 7 士業の `record-entry` を IndexedDB 永続化 → `persisted: true`
- Phase 6: `advise` の Anthropic API 接続 (現状は静的 stub)
- 連携先 SaaS の live REST 接続実装
- Storage: Electron main で `os` / `fs` 経由の実 OS 統計取得
- quality dashboard の数値を `scripts/quality-report.cjs` から自動生成

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
