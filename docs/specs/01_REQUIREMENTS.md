# 要件定義書 — Service Hub

| 項目 | 内容 |
|---|---|
| ドキュメント | 要件定義書 (Requirements Specification) |
| 対象システム | Service Hub — 個人事業主〜中小企業向け 統合業務ダッシュボード |
| バージョン | 1.0 (現行ブランチ `claude/claude-md-docs-qqUAT` 時点) |
| 関連文書 | [基本設計書](./02_BASIC_DESIGN.md) / [詳細設計書](./03_DETAILED_DESIGN.md) / [プロジェクト計画書](./04_PROJECT_PLAN.md) / [docs/ARCHITECTURE.md](../ARCHITECTURE.md) |

> 本書は現行実装の実態を踏まえて遡及的に整理した要件定義である。**確定済みの要件**と
> **未充足/将来要件 (Phase 6+)** を区別して記述する。

---

## 1. 背景と目的

### 1.1 背景
個人事業主・中小企業のオーナーは、SaaS (GitHub / Notion / Slack / Google / Canva 等)、
EC・会計・SNS、士業との連携、KPI 管理、税務試算といった業務を **複数のサービス・タブを
行き来して** 行っており、認証情報の散在・全体像の把握困難という課題を抱える。

### 1.2 目的
- 62 サービスを **1 つのカテゴリ別サイドバー UI** で一元操作する。
- API キー/トークンを **暗号化してローカル保管** し、Web サイトへの再入力を不要にする。
- **エンジニア以外でも** ブラウザ単体 HTML をダブルクリックするだけで利用開始できる。
- 税務試算・節税制度案内など **計算系の業務支援** を、税理士法・安全性に配慮した範囲で提供する。

### 1.3 スコープ外 (Non-Goals)
- 納税・申告の **自動実行** (e-Tax 等は本人認証必須・税理士法の制約)。
- 個別の節税スキームの **自動設計・「否認されない」保証**。
- マルチユーザー同時編集・サーバーサイドのデータ集約 (ローカルファースト設計)。

---

## 2. ステークホルダー

| 区分 | 役割 | 主な関心事 |
|---|---|---|
| エンドユーザー (事業オーナー) | 日常利用 | 簡単な起動・全体像の把握・データ保護 |
| 開発者 | 実装・保守 | 型安全・テスト・アーキ不変条件の維持 |
| レビュアー | 品質保証 | CI ゲート (typecheck/test/lint/mutation) の green |
| 税理士・専門家 | 利用者の相談先 | アプリが助言・自動実行をしないこと (免責) |

---

## 3. 機能要件 (Functional Requirements)

採番規則: `FR-<領域>-<連番>`。状態: ✅ 実装済 / 🔶 部分 / ⬜ 未 (Phase 6+)。

### 3.1 サービス基盤
| ID | 要件 | 状態 |
|---|---|---|
| FR-CORE-01 | 62 サービスをカテゴリ (おすすめ/分析・ツール/外部サービス連携) 別サイドバーで一覧・遷移できる | ✅ |
| FR-CORE-02 | 各サービスは静的 snapshot を初期表示し、live REST 取得へ切替できる (`useServiceData`) | ✅ |
| FR-CORE-03 | サービス追加は scaffold + SoT (`serviceId.ts`) で一元管理し、欠落は起動時に検知 | ✅ |
| FR-CORE-04 | 主要 SaaS は実 API で読み取り + 書き込みアクション (`invoke`) を実行できる | 🔶 (GitHub/Notion/Slack/Google/Canva/Atlassian/Shopify/YouTube 等。残りは snapshot stub) |

### 3.2 認証・秘密情報
| ID | 要件 | 状態 |
|---|---|---|
| FR-SEC-01 | API トークンを暗号化保管 (Electron: safeStorage / Browser: WebCrypto Vault) | ✅ |
| FR-SEC-02 | マスターパスワード + 24 単語リカバリーキー (BIP-39) で復旧できる | ✅ |
| FR-SEC-03 | OAuth (Google: Drive/Calendar/Gmail) を PKCE で実行できる | ✅ |
| FR-SEC-04 | タブ非表示/無操作で自動ロックする | ✅ |
| FR-SEC-05 | トークンは renderer に渡さず、外部接続は main プロセスからのみ行う | ✅ |

### 3.3 業務支援
| ID | 要件 | 状態 |
|---|---|---|
| FR-BIZ-01 | 事業ダッシュボードで 10 事業カテゴリの KPI を可視化する | ✅ (mock データ) |
| FR-BIZ-02 | KPI / 売上 / チーム / プランを横断した経営サマリーを表示する | ✅ |
| FR-BIZ-03 | テンプレート/チームレーダーの成果物を生成しライブラリに保管する | ✅ |
| FR-BIZ-04 | 業務操作 (record-entry/advise) は `persisted:false` を明示し動作偽装を防ぐ | ✅ |

### 3.4 税務試算 (重点領域)
| ID | 要件 | 状態 |
|---|---|---|
| FR-TAX-01 | 課税所得から所得税 (速算表+復興特別所得税) と住民税 (所得割+均等割+調整控除+非課税限度額) を計算 | ✅ |
| FR-TAX-02 | 額面年収から給与所得控除 (正式テーブル) を経て手取りを試算 | ✅ |
| FR-TAX-03 | 主要な所得控除 10 種を計算 (基礎/配偶者・特別/扶養/社保/生命保険【新旧】/地震保険/医療費/寄附金/障害者/寡婦・ひとり親/勤労学生) | ✅ |
| FR-TAX-04 | 税額控除を計算 (住宅ローン控除【居住年×性能区分】/配当控除【投信区分】/ふるさと納税住民税控除)、復興税の前に基準税額から差引 | ✅ |
| FR-TAX-05 | 退職所得を分離課税で試算 (退職所得控除/1/2課税/短期退職手当等/障害退職) | ✅ |
| FR-TAX-06 | 消費税 (標準10%/軽減8%) を計算 | ✅ |
| FR-TAX-07 | 節税制度カタログ (法人/個人事業主) と税務コンプライアンス・チェックリストを提示 | ✅ |
| FR-TAX-08 | 国税庁/e-Tax/会計ソフトの公式ツールへ `openExternal` で導線を提供 | ✅ |
| FR-TAX-09 | 一時所得 (総合課税1/2) ・譲渡所得 (申告分離: 短期/長期/居住用/上場株式) の計算 | ✅ |

---

## 4. 非機能要件 (Non-Functional Requirements)

| ID | 区分 | 要件 | 検証手段 |
|---|---|---|---|
| NFR-SEC-01 | セキュリティ | `contextIsolation:true` / `nodeIntegration:false` を維持。`window.serviceHub` 経由のみ main を呼ぶ | `lint:forbidden` / `lint:imports` |
| NFR-SEC-02 | セキュリティ | トークンは AES-GCM-256 + PBKDF2-SHA-256 600k iter、鍵は `extractable:false` | コードレビュー / `vault.ts` テスト |
| NFR-SEC-03 | セキュリティ | 外部リンクは `shell.openExternal` 経由 (`window.open` 禁止) | `lint:forbidden` |
| NFR-QUAL-01 | 品質 | ユニットテスト 1670 (静的) / 1719 (実行時) が全 pass | `npm test` (CI) |
| NFR-QUAL-02 | 品質 | 対象モジュールの Stryker mutation score ≥ 99.8% | `npm run mutate` |
| NFR-QUAL-03 | 品質 | typecheck / ESLint / 5 つの verify:all ゲートが green | `npm run verify:all` (CI) |
| NFR-QUAL-04 | 品質 | `docs/ARCHITECTURE.md` の file:line 参照 + メトリクスが実態と一致 | `verify:arch` / `lint:docs` |
| NFR-PORT-01 | 移植性 | 同一コードから Electron 版と ブラウザ単体 HTML (約 550 KB) を生成 | `npm run build` / `build:web` |
| NFR-USE-01 | 使用性 | 日本語 UI。非エンジニアがインストール不要で起動できる | `USER_GUIDE.md` |
| NFR-COMP-01 | 法令順守 | 税務は「概算試算+一般情報+公式導線」に留め、助言・自動納付をしない旨を明示 | 各 disclaimer / レビュー |
| NFR-PERF-01 | 性能 | 純粋計算は同期・O(入力規模)。snapshot は即時描画 | コードレビュー |

---

## 5. 制約条件

- **技術**: TypeScript / React 18 / Electron / Vite。外部ランタイム依存を持つ計算は不可 (純粋関数で実装)。
- **税務**: 税理士法により、税額計算の代行・個別助言・スキーム設計は提供しない (一般情報のみ)。
- **データ**: ローカルファースト。クラウド同期・サーバー保管はしない。
- **配布**: ブラウザ版は `file://` でも動作するため CSP は `'unsafe-inline'` を許容。

---

## 6. 受け入れ基準 (Acceptance Criteria)

1. `npm run verify:all` / `npm test` / `npm run build:web` がすべて green。
2. 全 62 サービスに対応するページ・client・テストが存在する (`lint:test-coverage`)。
3. 税務試算の各計算が国税庁の速算表・控除テーブルの境界値テストを満たす。
4. 税務・投資系の画面に免責 (disclaimer) が表示される。
5. CI 3 ジョブ (quality / test / build) が PR で success。

---

## 7. 用語

| 用語 | 定義 |
|---|---|
| SoT | Single Source of Truth。`src/shared/serviceId.ts` のサービス ID 配列 |
| snapshot | 各サービスの静的初期データ (`data/snapshot.ts`) |
| live fetch | 実 REST API からの取得 (`LIVE_FETCHERS`) |
| Vault | ブラウザ版の WebCrypto 暗号化ストレージ |
| 基準所得税額 | 復興特別所得税を乗じる前の算出所得税額 (税額控除はここから差引) |
