# 事業プラットフォーム層 (Business Platform)

> Service Hub は「45+ サービスのダッシュボード」から出発したが、その上に
> **個人事業主〜大企業まで使える経営システム**としての層を段階的に構築した。
> 本書はその層の全体像・データフロー・使い方・現実的な限界をまとめる。
> サービス数などの生メトリクスは [`ARCHITECTURE.md`](./ARCHITECTURE.md) を正とする。

## 1. 何ができるか (実データで動く機能)

| 機能 | 画面 | 内容 |
|---|---|---|
| プラン階層 | サイドバー下部 | Free / Pro / Business / Enterprise。同時利用サービス数・シート数・機能フラグを切替 |
| 売上集計 | 売上集計 | EC チャネル横断 (Amazon/Shopify/BASE/楽天/メルカリ/その他) の売上・AOV・構成比・月次推移 |
| KPI / BEP | KPI / BEP | 月次実績入力 → 限界利益率・損益分岐点・営業利益・安全余裕率を実データで算出 |
| チーム管理 | チーム管理 | メンバー招待・役割 (オーナー/管理者/メンバー) ・プランのシート上限と連動 (RBAC) |
| 経営サマリー | 経営サマリー | 上記すべてを 1 画面に集約した経営概況 (黒字/赤字・シート状況) |
| CSV 入出力 | 売上集計 / KPI | 実績を Excel・会計ソフトと CSV でやり取り (UTF-8 BOM) |
| バックアップ/復元 | 設定 | ローカルの業務データ全体を JSON で書き出し / 取り込み (端末移行・災害復旧) |
| Shopify 連携 | Shopify | 注文を Slack/Discord/LINE/Gmail/Notion/Salesforce/Stripe へ送信 + 売上集計へ取り込み |

## 2. データフロー

```
[各 EC チャネル]                     [手入力 / CSV / Shopify取込]
   Amazon / Shopify / BASE …                    │
                                                ▼
                                   売上集計 (sales-entries)
                                                │  ← orderToSalesEntry (Shopify)
                                                │  ← salesCsv (CSV取込)
                          売上集計から月次売上を取込 │
                                                ▼
                                   KPI 実績 (kpi-actuals)
                                                │  computeKpiMetrics → BEP / 営業利益
                                                ▼
   プラン (localStorage) ┐                経営サマリー (overview)
   チーム (team-members) ┴───────────────────▶  buildBusinessOverview
                                                │
                                          バックアップ (全コレクション → JSON)
```

すべてローカル完結 (サーバー不要)。永続化は **IndexedDB** (`data/store.ts` のレコード
ストア) と **localStorage** (プランのみ)。

## 3. モジュール地図

### 純粋ロジック (UI 非依存・単体テスト対象)
- `src/shared/plan.ts` — プラン定義・entitlement (機能フラグ / シート上限)
- `src/shared/team.ts` — RBAC (Role / Capability / 権限昇格防止 / 最後のオーナー保護 / シート計算)
- `src/renderer/data/sales.ts` — 売上エントリ検証・チャネル別集計・月次集計
- `src/renderer/data/kpiActuals.ts` — KPI 実績検証・集計・損益分岐点計算
- `src/renderer/data/salesKpiBridge.ts` — 売上 → KPI 実績 (月次売上の取込)
- `src/renderer/data/shopifyImport.ts` — Shopify 注文 → 売上エントリ
- `src/renderer/data/overview.ts` — 上記を合成した経営概況
- `src/renderer/data/csv.ts` — 汎用 CSV (RFC4180 風) パーサ/シリアライザ
- `src/renderer/data/salesCsv.ts` / `kpiActualsCsv.ts` — ドメイン ↔ CSV
- `src/renderer/data/backup.ts` — バックアップ JSON エンベロープ
- `src/renderer/data/members.ts` — メンバー検証

### 永続化・配線
- `src/renderer/data/store.ts` — IndexedDB レコードストア (collection 単位の CRUD +
  `exportAll` / `importAll`)。コレクション: `sales-entries` / `kpi-actuals` / `team-members`
- `src/renderer/data/useCollection.ts` — コレクション購読 React フック
- `src/renderer/plan/usePlan.ts` — プランの localStorage 永続化 + タブ間同期

### 画面 (`src/renderer/pages/`)
`SalesPage` / `KpiPage` / `TeamPage` / `OverviewPage` / `SettingsPage` (`BackupPanel`)。
サイドバーのプラン選択とサービスのロック表示は `App.tsx`。

## 4. 使い方 (典型フロー)

1. **プランを選ぶ** — サイドバー下部のセレクタ。個人なら Free/Pro、組織なら Business/Enterprise。
2. **売上を記録** — 「売上集計」でチャネル別に入力、または CSV インポート。Shopify ページの
   「注文を売上集計に記録」からも投入できる。
3. **KPI を算出** — 「KPI / BEP」で「売上集計から取り込む」→ 費用 (原価・広告・販管・償却) を入力
   → 損益分岐点・営業利益が出る。
4. **チームを招待** — Business 以上で「チーム管理」からメンバー・役割を追加 (シート上限まで)。
5. **俯瞰する** — 「経営サマリー」で売上・収益性・組織を 1 画面で確認。
6. **バックアップ** — 「設定」から JSON で書き出し、別端末で復元。

## 5. 実連携の現状と限界

- **実 API 連携済み**: BASE (公式 OAuth API)、YouTube (Data API v3)。設定でキー/トークンを
  入れると実データに切替わる。Shopify の送信系コネクタは実 API エンドポイントに対し
  注入可能な `fetch` で配線済み (トークンは payload 経由)。
- **仮想データ稼働**: NETSEA / スーパーデリバリー / TopSeller / A8.net / AIブログくん /
  マネーフォワード / Amazon (SP-API) / Amazon アソシエイト。これらは**公開 REST API が無い**、
  または AWS 署名・パートナー承認が必要なため、現実的に実 API 化できない。各 fetcher は
  同じ shape の仮想データを返し、UI・集計はそのまま動く (実 API 化する際は fetcher 内を
  差し替えるだけ)。
- 認証情報・決済事業者契約・サーバー同期はこの環境では完結しない。

## 6. 残りのロードマップ

- [ ] チームメンバーの CSV 入出力 (汎用 `csv.ts` の横展開)
- [ ] 売上 → 会計 (マネーフォワード等) への自動仕訳連携 (API 開通後)
- [ ] マルチデバイス同期 (要バックエンド)
- [ ] 課金 (要決済事業者) — プラン階層は実装済み、課金面のみ未配線
