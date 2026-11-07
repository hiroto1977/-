# 外注書類一式 — Service Hub システム開発委託

> 本ディレクトリは Service Hub の開発を外部委託（外注）する際に必要な書類一式です。
> 既存の技術文書（[`docs/specs/`](../specs/01_REQUIREMENTS.md) の要件定義書・基本設計書・
> 詳細設計書・プロジェクト計画書・AIカウンセラー仕様書）を**発注側の提示資料**として活用し、
> 本ディレクトリは**取引・契約・検収**に必要な書類を揃えます。
>
> ⚠️ **法的免責**: 契約書テンプレート（02/03/04）は一般的な雛形であり、法的助言ではありません。
> **締結前に必ず弁護士等の専門家のレビュー**を受けてください。請負契約書は印紙税の課税文書
> （第2号文書）となる場合があります。

---

## 書類一覧と使う順番

| # | 書類 | ファイル | 段階 |
|---|---|---|---|
| 1 | 提案依頼書 (RFP) | [01_RFP.md](./01_RFP.md) | ① 委託先選定 |
| 2 | 秘密保持契約書 (NDA) | [02_NDA.md](./02_NDA.md) | ① 委託先選定（詳細開示の前） |
| 3 | 見積依頼書・見積回答様式 | [03_ESTIMATE.md](./03_ESTIMATE.md) | ① 委託先選定 |
| 4 | 業務委託基本契約書 | [04_BASIC_CONTRACT.md](./04_BASIC_CONTRACT.md) | ② 契約 |
| 5 | 個別契約書 (SOW) ・注文書 | [05_SOW.md](./05_SOW.md) | ② 契約（案件ごと） |
| 6 | セキュリティ・データ保護要件書 | [06_SECURITY_REQUIREMENTS.md](./06_SECURITY_REQUIREMENTS.md) | ② 契約（別紙） |
| 7 | 体制図・役割分担表 (RACI) | [07_STRUCTURE_RACI.md](./07_STRUCTURE_RACI.md) | ③ 開発 |
| 8 | 変更管理・課題管理手順書 | [08_CHANGE_MANAGEMENT.md](./08_CHANGE_MANAGEMENT.md) | ③ 開発 |
| 9 | 検収基準書・検収書様式 | [09_ACCEPTANCE.md](./09_ACCEPTANCE.md) | ④ 納品・検収 |

### 発注側から提示する技術資料（既存・本リポジトリ）

| 資料 | 用途 |
|---|---|
| [要件定義書](../specs/01_REQUIREMENTS.md) | RFP 別紙。スコープの基準 |
| [基本設計書](../specs/02_BASIC_DESIGN.md) / [詳細設計書](../specs/03_DETAILED_DESIGN.md) | 実装方式の制約条件 |
| [プロジェクト計画書](../specs/04_PROJECT_PLAN.md) | フェーズ・WBS・リスクの共有 |
| [AIカウンセラー設計図&仕様書](../specs/05_AI_COUNSELOR.md) | 安全要件（変更不可の不変条件） |
| [docs/ARCHITECTURE.md](../ARCHITECTURE.md) / [docs/SECURITY.md](../SECURITY.md) | アーキ・セキュリティ詳細 |
| [docs/QUALITY.md](../QUALITY.md) / CI (`.github/workflows/ci.yml`) | **検収の客観的基準**（§09 参照） |

---

## 全体フロー

```
① 選定     NDA 締結 → RFP 提示 (+specs 別紙) → 見積依頼 → 提案/見積評価 → 委託先決定
② 契約     基本契約 締結 → 個別契約(SOW) + セキュリティ要件書(別紙) 締結
③ 開発     体制表/RACI 確定 → ブランチ運用・PR レビュー → 変更管理手順で変更を統制
④ 検収     納品物受領 → 検収基準書のとおり CI ゲート・受入テストで判定 → 検収書発行 → 支払
```

## 本プロジェクト特有の前提（全書類に共通）

- **品質ゲートが契約上の検収基準**: `npm run typecheck` / `npm test` / `npm run verify:all` /
  `npm run mutate`（Stryker 100%）/ `npm run build:web` の全グリーンを納品条件とする。
  主観に頼らない機械検証可能な検収。
- **安全不変条件は変更不可**: AIカウンセラーの危機検知・窓口提示（specs/05 §7）に関わる
  変更は、発注者の書面承認なく行ってはならない。
- **開発フロー**: main 直 push 禁止。フィーチャーブランチ → PR → 発注者レビュー → マージ。
- **秘密情報**: 実トークン・本番認証情報は委託先に渡さない（モック/テスト用のみ）。
