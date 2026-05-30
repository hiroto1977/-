# 基本設計書 — Service Hub

| 項目 | 内容 |
|---|---|
| ドキュメント | 基本設計書 (Basic / High-Level Design) |
| 対象 | Service Hub アーキテクチャ・サブシステム構成・データフロー |
| 関連 | [要件定義書](./01_REQUIREMENTS.md) / [詳細設計書](./03_DETAILED_DESIGN.md) / [docs/ARCHITECTURE.md](../ARCHITECTURE.md) |

> 本書はシステムを構成するサブシステムの責務・境界・連携を規定する。クラス/関数レベルの
> 仕様は[詳細設計書](./03_DETAILED_DESIGN.md)を参照。

---

## 1. アーキテクチャ方針

| 原則 | 内容 |
|---|---|
| ローカルファースト | データ・秘密情報は端末内に暗号化保管。サーバー集約をしない |
| 2 ターゲット 1 コードベース | Electron 版 (3 プロセス) と ブラウザ単体 HTML を同一ソースから生成 |
| 単一の真実源 (SoT) | サービス定義は `serviceId.ts` に集約し、型システムで欠落を検知 |
| 純粋関数中心 | 計算ロジック (税務/KPI) は副作用のない純粋関数。UI から分離し単体テスト可能に |
| 最小権限 | renderer は秘密情報に触れず、外部接続は main からのみ |
| 検証可能なドキュメント | アーキ記述は `verify:arch` で実コードと自動照合 |

---

## 2. システム構成

### 2.1 Electron 版 (3 プロセスモデル)
```
┌─────────────┐  IPC (contextBridge)  ┌──────────────┐  REST/OAuth  ┌─────────────┐
│  Renderer   │ ───────────────────▶ │     Main      │ ───────────▶ │ External    │
│ (React UI)  │ ◀─────────────────── │  (Node/Electron)│ ◀────────── │ SaaS / API  │
│ window.     │   typed bridge        │ IPC handlers   │              └─────────────┘
│  serviceHub │                       │ secrets/oauth  │
└─────────────┘                       │ clients/*      │
       ▲                              └──────────────┘
       │ preload (context-isolated)
       └── 秘密情報は renderer に渡さない
```

| プロセス | 責務 | 主なモジュール |
|---|---|---|
| Main (`src/main/`) | BrowserWindow 生成、IPC ハンドラ、秘密情報の暗号化保管、OAuth、live REST | `main.ts` / `secrets.ts` / `oauth.ts` / `clients/*` |
| Preload (`src/preload/`) | `contextBridge` で型付き `window.serviceHub` を公開 | `preload.ts` / `shared/bridge.d.ts` |
| Renderer (`src/renderer/`) | React UI、サービスページ、状態管理、純粋計算 | `App.tsx` / `pages/*` / `hooks/*` / `shared/*` |

### 2.2 ブラウザ単体版の追加レイヤー
| モジュール | 責務 |
|---|---|
| `web-shim.ts` | `window.serviceHub` の polyfill (main 不在を補う) |
| `security/vault.ts` | WebCrypto AES-GCM-256 + PBKDF2 600k の暗号化ストレージ |
| `library/library.ts` | IndexedDB Blob ストア |
| `network/proxy.ts` | CORS 回避用 BYO Cloudflare Worker プロキシ |
| `oauth/pkce.ts` | out-of-band paste PKCE フロー |
| `scripts/inline-html.cjs` | CSS/JS をインライン化し `dist/standalone.html` を生成 |

---

## 3. サブシステム一覧と責務

| サブシステム | 責務 | 入出力 |
|---|---|---|
| サービスレジストリ | 62 サービスの ID/ラベル/カテゴリ/ページの管理 | SoT → サイドバー/fetcher/snapshot |
| データ取得層 (`useServiceData`) | snapshot ↔ live の切替、status/error 管理 | (serviceId, snapshot) → {data, source, status, refresh} |
| 秘密情報管理 | トークンの暗号化保管・取得・削除 | setToken/clearToken/listConfigured |
| アクション層 (`invoke`) | 各サービスの書き込み操作 | (serviceId, action, payload) → Result |
| 税務計算エンジン | 所得税/住民税/消費税/控除/税額控除/退職所得 | 入力値 → 税額・手取り (純粋) |
| 業務支援 | KPI/経営サマリー/テンプレート/チームレーダー | record store → 集約結果 |
| 品質ゲート | typecheck/lint/verify/mutation の自動検証 | scripts/*.cjs |

---

## 4. データフロー (代表例)

### 4.1 サービスデータ表示
```
ページ mount → useServiceData(id, SNAPSHOT[id])
  → 初期: source='snapshot' で即時描画
  → refresh(): window.serviceHub.fetchSnapshot(id)
      → (Electron) IPC 'fetch:snapshot' → LIVE_FETCHERS[id](token,fetch) → REST
      → (Browser)  web-shim が同等処理 (proxy 経由可)
  → 成功: source='live' に更新 / 失敗: status='error' + errorKind 分類
```

### 4.2 税務試算 (純粋・同期)
```
ユーザー入力 (額面/控除/扶養…)
  → calcAllDeductions(input)            … 所得控除の集計 (所得税/住民税別 + 人的控除差)
  → calcSalaryWithDeductions(...)        … 給与所得控除→課税所得→基準所得税→住民税
       └ residentTaxExemption / calcResidentAdjustmentCredit / calcFurusatoResidentCredit
  → calcAllTaxCredits + applyTaxCreditsWithSurtax  … 税額控除を基準税額から差引→復興税
  → 画面に内訳 + 最終税額 + 手取りを表示
退職所得は別系統: calcRetirementTax(severance, years, opts)
```

---

## 5. 外部インターフェース

| 種別 | 相手 | 方式 | 備考 |
|---|---|---|---|
| SaaS REST | GitHub/Notion/Slack/Google/Canva/Atlassian/Shopify/YouTube 等 | HTTPS (Bearer/Basic/OAuth) | main からのみ。egress マトリクスで管理 |
| OAuth | Google | Authorization Code + PKCE (loopback) | drive/calendar/gmail |
| 公式ツール導線 | 国税庁/e-Tax/弥生 等 | `shell.openExternal` | 税務ページ |
| プロキシ (Browser) | ユーザー自前 Cloudflare Worker | HTTPS | Notion/Atlassian/Cloudflare の CORS 回避 |

---

## 6. 品質・運用設計

| 項目 | 設計 |
|---|---|
| CI | `.github/workflows/ci.yml` の 3 ジョブ (quality/test/build) を push/PR で実行 |
| 不変条件 | `LIVE_FETCHERS` の total record / import 境界 / 禁止パターンを scripts で検査 |
| ミューテーション | Stryker で対象モジュールを 99.8% 閾値で検証 (`mutation.yml`) |
| ドキュメント整合 | `verify:arch` (file:line + メトリクス) / `lint:docs` (cross-doc) |
| リリース | `release.yml` が `v*` タグで Mac/Win/Linux インストーラを生成 |

---

## 7. 設計上の重要判断 (ADR 抜粋)

| 判断 | 理由 |
|---|---|
| 税務は計算+案内のみ・自動納付しない | 税理士法・e-Tax 本人認証・不可逆操作のリスク |
| 税額控除は基準所得税額から差引→復興税 | 確定申告書 B の正しい順序 (控除額×2.1%の過大課税を回避) |
| business.ts を分割しない | ファイル分割で render テンプレートの mutation 帰属が外れ 100%→93.6% 低下を実測 (撤退) |
| stub を `createSnapshotStub` に集約 | 21 client の boilerplate を 1 行化 (DRY) |
| 士業 7 種を `ShigyoConsole` に共通化 | interface/Page の重複を −1159 行で解消 |
