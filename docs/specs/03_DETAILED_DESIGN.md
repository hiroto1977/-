# 詳細設計書 — Service Hub

| 項目 | 内容 |
|---|---|
| ドキュメント | 詳細設計書 (Detailed / Low-Level Design) |
| 対象 | モジュール/関数/IPC/データ構造のレベルの仕様 |
| 関連 | [要件定義書](./01_REQUIREMENTS.md) / [基本設計書](./02_BASIC_DESIGN.md) / [プロジェクト計画書](./04_PROJECT_PLAN.md) / [docs/ARCHITECTURE.md](../ARCHITECTURE.md) |

> 本書はコードと 1:1 で対応する。関数シグネチャは実装 (`src/shared/*`, `src/main/*`) を
> 正とし、変更時は本書も更新する (`lint:docs` / `verify:arch` が乖離を検知)。

---

## 1. サービスレジストリ (単一の真実源)

### 1.1 型と定数
```ts
// src/shared/serviceId.ts
export const SERVICE_IDS = [ /* 63 個の文字列リテラル */ ] as const;
export type ServiceId = (typeof SERVICE_IDS)[number];
```

### 1.2 派生マップ (`src/main/clients/index.ts`)
| 名称 | 型 | 不変条件 |
|---|---|---|
| `LIVE_FETCHERS` | `Record<ServiceId, Fetcher>` (total) | module load 時に全 `ServiceId` の存在を assert。欠落で throw |
| `LOCAL_SERVICES` | `Set<ServiceId>` | ローカル資源を読むため token 不要 |
| `LIVE_ACTIONS` | `Partial<Record<ServiceId, ActionMap>>` | renderer の `invoke()` から呼ぶ書き込み操作 |

### 1.3 Fetcher 契約
```ts
type Fetcher = (args: { token?: string; fetch?: typeof fetch }) => Promise<unknown>;
// 返り値は SNAPSHOT[id] と同形。fetch 注入で Node 単体テスト可能。
// stub は createSnapshotStub(id) / 士業は createShigyoFetcher(...) に集約。
```

### 1.4 カテゴリ
`ServiceCategory = 'featured' | 'tools' | 'integrations'` (おすすめ / 分析・ツール / 外部サービス連携)。

---

## 2. IPC インターフェース (`src/main/main.ts`)

| チャネル | 引数 | 返り値 | 説明 |
|---|---|---|---|
| `app:getVersion` | — | `string` | アプリバージョン |
| `app:openExternal` | `url: string` | `void` | `shell.openExternal` (スキーム検証あり) |
| `app:revealInFolder` | `filePath` | `void` | ファイルを OS で表示 |
| `app:openPath` | `filePath` | `void` | パスを既定アプリで開く |
| `secrets:set` | `serviceId, token` | `void` | `safeStorage` 暗号化保管 |
| `secrets:clear` | `serviceId` | `void` | トークン削除 |
| `secrets:list` | — | `ServiceId[]` | 設定済みサービス一覧 |
| `fetch:snapshot` | `serviceId` | `unknown` | `LIVE_FETCHERS[id]` を実行 |
| `invoke` | `serviceId, action, payload` | `Result` | `LIVE_ACTIONS` の書き込み操作 |
| `oauth:isSupported` | `serviceId` | `boolean` | OAuth 対応可否 |
| `oauth:authorize` | `serviceId` | `TokenResult` | Authorization Code + PKCE |

すべて `ipcMain.handle` (invoke/return)。引数は `unknown` で受け、main 側で型ガード。

---

## 3. データ取得層 — `useServiceData`

```ts
function useServiceData<T>(serviceId: ServiceId, snapshot: T): {
  data: T;
  source: 'snapshot' | 'live';
  status: 'idle' | 'loading' | 'error';
  errorMessage?: string;
  refresh: () => Promise<void>;
};
```
- 初期 `data = snapshot`, `source = 'snapshot'`。
- `refresh()` → `serviceHub.fetchSnapshot(id)`。成功で `source='live'`、失敗で `status='error'` + 分類。

---

## 4. 税務計算エンジン (純粋関数)

副作用なし・同期・決定的。すべて `src/shared/tax*.ts`。境界値は各 `__tests__` で検証。

### 4.1 所得税・住民税・消費税 (`taxCalc.ts`)
| 関数 | シグネチャ | 役割 |
|---|---|---|
| `calcBaseIncomeTax` | `(taxableIncome: number) => number` | 速算表による**復興税前**の基準所得税額 |
| `calcFinalIncomeTax` | `(baseIncomeTax, incomeTaxCredits) => number` | `max(0, base − credits) × 1.021` |
| `calcIncomeTax` | `(taxableIncome) => number` | `base × 1.021` (控除なし簡易) |
| `calcSalaryIncomeDeduction` | `(grossAnnual) => number` | 給与所得控除 (正式 6 区分テーブル) |
| `calcBasicDeduction` | `(totalIncome) => number` | 基礎控除 (480k→逓減→0) |
| `calcResidentBasicDeduction` | `(totalIncome) => number` | 住民税基礎控除 (430k→逓減→0) |
| `calcResidentTax` | `(taxableIncome) => number` | 住民税 所得割 10% + 均等割 |
| `calcResidentAdjustmentCredit` | `(income, humanDeductionDiff) => number` | 調整控除 |
| `residentTaxExemption` | `(income, dependents) => { perCapitaExempt, incomeLevyExempt }` | 非課税限度額判定 |
| `calcFurusatoResidentCredit` | `(donation, taxableIncome, ...) => number` | ふるさと納税 住民税控除 (基本+特例) |
| `calcConsumptionTax` | `(netAmount, rate=0.1) => number` | 消費税 (標準/軽減) |
| `marginalIncomeTaxRate` | `(taxableIncome) => number` | 限界税率 |
| `calcSalaryWithDeductions` | `(gross, dedIncome, dedResident, donation=0, humanDiff=0, dependentCount=0) => FullSalaryResult` | 額面→課税所得→基準所得税→住民税の統合計算 |

`FullSalaryResult` は `baseIncomeTax / adjustmentCredit / residentIncomeLevy / takeHome` 等の内訳を保持。

### 4.2 所得控除 (`taxDeductions.ts`)
| 関数 | シグネチャ | 備考 |
|---|---|---|
| `calcSpouseDeduction` | `(...) => DeductionPair` | 配偶者控除・特別控除 |
| `calcDependentDeduction` | `(kinds: DependentKind[]) => DeductionPair` | 一般/特定/老人/同居老親 |
| `calcLifeInsuranceDeduction` | `(p: LifeInsurancePremiums) => DeductionPair` | 新旧制度の有利選択 (各 4万 / 旧 5万、合算上限) |
| `calcEarthquakeInsuranceDeduction` | `(premium) => DeductionPair` | 地震保険料控除 |
| `calcMedicalDeduction` | `(...) => DeductionPair` | 医療費控除 (10万 or 所得5%) |
| `calcDonationDeduction` | `(donation, totalIncome) => DeductionPair` | 寄附金控除 |
| `disabilityDeduction` | `(kind: DisabilityKind) => DeductionPair` | 障害者控除 |
| `calcAllDeductions` | `(input: DeductionInput) => DeductionBreakdown` | 全控除集計 + `humanDeductionDiff` |

`DeductionPair = { incomeTax: number; residentTax: number }`。所得税と住民税で控除額が異なるため両建てで保持し、その差額合計 `humanDeductionDiff` を調整控除へ渡す。

### 4.3 税額控除 (`taxCredits.ts`)
| 関数 | シグネチャ | 備考 |
|---|---|---|
| `resolveMortgageParams` | `(year, performance: HousingPerformance) => { rate, balanceCap }` | 令和2-3=1.0% / 令和4+=0.7%、性能区分で上限。2024+ 非適合=0 |
| `calcMortgageCredit` | `(input: MortgageCreditInput) => MortgageCreditResult` | 残高×率、所得税控除しきれない分を住民税へ (上限 5% / 97,500円) |
| `calcDividendCredit` | `(input: DividendCreditInput) => DividendCreditResult` | 配当控除 (株式/投信/外貨投信) |
| `calcAllTaxCredits` | `(input: TaxCreditInput) => TaxCreditBreakdown` | 住宅ローン+配当+ふるさと納税 |
| `applyTaxCreditsWithSurtax` | `(baseIncomeTax, residentBefore, credits, surtaxRate) => ...` | **税額控除を基準税額から差引→復興税** (正しい順序) |
| `applyTaxCredits` | `(...) =>` | 旧版 (後方互換) |

> 重要: 復興特別所得税 2.1% は税額控除を差し引いた**後**の基準所得税額に乗じる
> (確定申告書 B の順序)。`applyTaxCreditsWithSurtax` がこの順序を保証する。

### 4.4 退職所得 (分離課税, `taxRetirement.ts`)
| 関数 | シグネチャ | 備考 |
|---|---|---|
| `retirementDeduction` | `(yearsOfService, disability=false) => number` | 退職所得控除 (20年以下40万/年・超過70万/年、障害+100万) |
| `calcRetirementTaxableIncome` | `(severance, years, { shortTerm, disability }) => number` | 1/2 課税。短期退職手当等 300万超の特例 |
| `calcRetirementTax` | `(severance, years, opts) => RetirementTaxResult` | `{ deduction, taxableIncome, incomeTax, residentTax, takeHome }` |

### 4.5 制度カタログ・コンプライアンス (`taxCalc.ts`)
- `taxSchemeCatalog() / schemesForEntity(entity)` — 法人/個人事業主の節税制度メタデータ (一般情報)。
- `complianceChecklist(topic) / COMPLIANCE_TOPICS` — 税務コンプライアンス・チェックリスト。
- `suggestTaxTips(taxableIncome)` — 課税所得に応じた一般的なヒント。

> これらは**一般情報の提示のみ**。個別スキーム設計・「否認されない」保証・自動申告は行わない。

---

## 5. セキュリティ設計

### 5.1 Electron 版
- `secrets.ts`: `safeStorage` (OS キーチェーン) で暗号化。鍵が無い Linux dev は base64 フォールバック。
- `oauth.ts`: Authorization Code + PKCE (RFC 7636/8252)。loopback `127.0.0.1` HTTP サーバで code 受領。純粋ヘルパ (PKCE 生成 / URL 構築 / token request body) を export しテスト。

### 5.2 ブラウザ版
- `security/vault.ts`: WebCrypto AES-GCM-256。鍵は PBKDF2-SHA-256 600k iter でマスターパスワードから導出、`extractable:false`・メモリのみ。
- `LockScreen.tsx` + `autoLock.ts`: タブ非表示 / 無操作でロック。
- リカバリー: 24 単語 (BIP-39) でマスターパスワード復旧。
- `oauth/pkce.ts`: `file://` 用 out-of-band paste PKCE。

### 5.3 不変条件 (CI で強制)
| ルール | 検査 |
|---|---|
| `contextIsolation:true` / `nodeIntegration:false` | `lint:forbidden` |
| renderer は秘密情報に触れない / import 境界 | `lint:imports` |
| 外部リンクは `openExternal` のみ (`window.open` 禁止) | `lint:forbidden` |

---

## 6. ページ構成 — 税務ページ (`pages/TaxPage.tsx`)

| セクション | 入力 | 出力 |
|---|---|---|
| ① 課税所得→税額 | 課税所得 | 所得税 (復興税込) / 住民税 |
| ② 額面→手取り | 額面年収・控除・扶養 | 給与所得控除→課税所得→手取り |
| ③ 全控除込み精密試算 | 各種控除入力 | 内訳 + 最終税額 + 手取り |
| ④ 退職所得 | 退職金・勤続年数・区分 | 控除 / 課税対象 / 税額 / 手取り |
| ⑤ 一時所得 | 総収入・経費 | 一時所得 / 課税算入額 (×1/2) |
| ⑥ 譲渡所得 | 収入・取得費・譲渡費用・区分 | 譲渡益 / 課税譲渡所得 / 所得税・住民税 |
| 消費税 | 税抜金額・税率 | 税額 |
| 節税カタログ / チェックリスト | 区分選択 | 制度一覧・確認項目 |
| 公式ツール導線 | — | 国税庁/e-Tax/会計ソフトへ `openExternal` |

入力は `parseAmountInput` (strict `/^[+-]?\d+(\.\d+)?$/`) で検証、`jpy` で整形。各セクションに免責表示。

---

## 7. テスト設計

| 観点 | 手法 |
|---|---|
| 純粋計算 | 境界値テスト (速算表の各境界・控除しきい値・1/2課税の特例境界) |
| Fetcher | `fetch` 注入のモック (`vi.fn<typeof fetch>()`) |
| プロパティ | `fast-check` (`test:property`) |
| 不変条件 | `LIVE_FETCHERS` total record の起動時 assert |
| ミューテーション | Stryker。閾値 99.8% (対象モジュール) |

現状: 静的 `it()` 1679 / 実行時 1728。新規税務ロジックは mutation 100% を達成 (taxCalc/taxDeductions/taxCredits/taxRetirement は equivalent-mutant の都合で stryker mutate 配列に未追加 — `SESSION_HANDOFF.md` 参照)。
