# Service Hub

業務支援ダッシュボード。Electron デスクトップアプリ + ブラウザ単体 HTML の
2 通りの実行形態。

## サービス一覧 (79)

| 業務の区分 | サービス |
|---|---|
| **フロントオフィス** (集客・販売・発信, 14) | ワードプレス / キャンバ / セールスフォース / ショッピファイ / ベイス / トップセラー / エーハチネット / AIブログくん / アマゾン / アマゾン アソシエイト / ユーチューブ / ココナラ / ティックトック / グーグルアナリティクス |
| **センターオフィス** (問い合わせ・連絡・予定・受注, 7) | グーグルカレンダー / ジーメール / スラック / マイクロソフト 365 / ディスコード / ライン / 売上集計 |
| **ミドルオフィス** (契約・法務・審査・仕入, 8) | 弁護士 / 司法書士 / 行政書士 / 弁理士 / ネッシー / スーパーデリバリー / コンプライアンス / 書類スタジオ |
| **バックオフィス** (経理・税務・給与・人事, 13) | 感情ログ / チームレーダー / テンプレート / ストライプ / 税理士 / 公認会計士 / 社労士 / マネーフォワード / チーム管理 / 税務試算 / フリー会計 / 人材育成 / 専属カウンセラー |
| **開発・製造・現場** (開発・品質・運用・栽培, 10) | ギットハブ / アトラシアン / クラウドフレア / アサナ / リニア / セントリー / リナックス / ドッカー / カーソル / 水耕栽培・養蜂・養殖 |
| **経営・ガバナンス** (予実・指標・投資・資金, 11) | 経営指標・損益分岐点 / 株式 / 事業ダッシュボード / 不動産投資 / 投資信託 / 中小企業診断士 / 経営サマリー / 資金調達レーダー / 可視化 / ブリオ分析 / 見張りアシスタント |
| **共通基盤** (データ・AI・守り, 16) | ホーム / ノーション / グーグルドライブ / スキル / セキュリティ / オラマ / ライブラリ / 設定 / 品質ダッシュボード / ドロップボックス / ストレージ最適化 / コネクター / オブシディアン / AI アシスタント / AIの村 / グロック |

全 79 サービスがサイドバーに並ぶ (2026-11-27: 画面を持たなかったフードデリバリーの 2 つは取り除いた)。
並びはサイドバーと同じ業務の区分 (`src/renderer/data/businessArea.ts` が 1 か所で持つ)。士業 8 種は各ページに「担当領域 (事業仕分け)」ナビを持つ。

## 2 通りの動かし方

### 1. ブラウザだけで動かす (最速・インストール不要)

`dist/standalone.html` (単一ファイル・実測 約 11 MB) をブラウザでダブルクリックするだけ。
学術コーパスを外した軽量版 `npm run build:web:lite` (約 2.7 MB) もあります。
Node.js も Electron も不要、Chrome / Edge / Safari / Firefox どこでも動きます。

```bash
npm install
npm run build:web      # → dist/standalone.html を生成
```

初回起動: マスターパスワード設定 → 設定画面で API キー入力 → 各機能利用可。
保存ファイルはアプリ内ライブラリ + ブラウザのダウンロードフォルダ。

詳細は **[docs/BROWSER_REDESIGN.md](docs/BROWSER_REDESIGN.md)** 参照。

### 2. ネイティブ Electron アプリとして動かす (全機能・OS 統合)

```bash
npm install
npm run dev            # Vite + Electron をホットリロード起動
npm run build          # tsc -b + vite build + electron-builder で
                       # macOS .dmg / Windows .exe / Linux .AppImage 生成
```

## 開発

```bash
npm run typecheck         # tsc -b --noEmit
npm test                  # vitest run (2243 件)
npm run lint              # ESLint v9
npm run lint:imports      # main/preload/renderer の境界チェック
npm run lint:forbidden    # 禁止パターン (nodeIntegration: true など) 検出
npm run lint:test-coverage # 全サービスに test + action がある確認
npm run lint:docs         # cross-doc 一貫性
npm run verify:arch       # docs/ARCHITECTURE.md の file:line 参照 + 6 ライブメトリクス
npm run mutate            # Stryker mutation testing (30 modules, 100%)
npm run smoke             # xvfb + Electron で 61 ページ smoke screenshot
```

CI: `.github/workflows/ci.yml` が typecheck + test + build:renderer を push/PR 毎に実行。

## アーキテクチャ概要

### Electron 版 (3 プロセス)

```
src/main/              ← Electron main process
  main.ts                IPC handlers (11)
  secrets.ts             OS Keychain / safeStorage トークン保管
  oauth.ts               PKCE OAuth (Google)
  clients/               63 sub-clients (各 service の REST fetcher + actions)
src/preload/           ← contextBridge bridge
  preload.ts             window.serviceHub を公開
src/renderer/          ← React app
  App.tsx                サイドバー (カテゴリ 3 段折りたたみ)
  pages/                 63 個のサービスページ
  components/            StatusBar / DataList / ExportActions
  hooks/useServiceData   snapshot ↔ live fetch
  data/snapshot.ts       全 63 サービスの bundled 静的データ
```

### ブラウザ版の追加レイヤー

```
src/renderer/
  main.tsx               先頭で web-shim を import
  web-shim.ts            window.serviceHub の polyfill
                         (Vault / Library / Anthropic 直接呼び出し / Proxy)
  web-templates.ts       テンプレート SVG renderer (browser 版)
  security/
    vault.ts             WebCrypto AES-GCM-256 + PBKDF2-SHA-256 600k iter
    LockScreen.tsx       マスターパスワード入力モーダル
    autoLock.ts          visibilitychange + idle auto-lock
  library/
    library.ts           IndexedDB Blob ストア (50 MB / 100 件)
  network/
    proxy.ts             BYO Cloudflare Worker 経由の CORS 回避
  fs/
    fsa.ts               File System Access API ラッパー (Chrome/Edge)
  oauth/
    pkce.ts              Out-of-band paste PKCE フロー (Google)
scripts/
  inline-html.cjs        dist/standalone.html を生成 (CSS/JS inline)
```

### セキュリティモデル

- **トークン保管**: 全 API キーは Vault で AES-GCM-256 暗号化。マスター
  パスワードから PBKDF2-SHA-256 600,000 iter で派生鍵を生成し、
  `extractable: false` でメモリのみ保持。
- **Auto-lock**: タブが hidden 5 分超 / 操作 idle 15 分でロック。
- **CORS-blocked API** (Notion / Atlassian / Cloudflare): ユーザー自前の
  Cloudflare Worker 経由。docs/PROXY_EXAMPLE.md にリファレンス実装 (アローリスト +
  DoH による解決後 IP 再検査 + リダイレクト各ホップ再検査)。
- **OAuth**: file:// 環境では out-of-band paste、hosted では popup callback。
- **CSP**: standalone HTML は `'unsafe-inline'` (file:// 動作のため)。
  hosted 版は `sha256` ハッシュベース推奨。

## 品質ゲート

CI (`.github/workflows/ci.yml`) は PR と `main` への push のたびに、`npm run typecheck`・
`npm test` (+ `src/main/**` のカバレッジ)・`npm run verify:all` の **39 ゲート**・
`npm run build:web` を走らせる (ゲート数は `verify:arch` が `package.json` と突き合わせる)。
件数 (検査の数・サービス数・参照の数) は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) の
TL;DR が live metric として持つ —— ここに写すと必ず古びる。
この節は少なくとも 2026-08-31 から 2026-09-27 まで
「unit tests 2243」「63 services」「lint:forbidden 8 patterns」「mutation 100.00% (30 modules)」と
書いたままで、どの数も誰も検算していなかった。

変異検査 (Stryker) は **PR では走らない** —— `mutation.yml` が週次 (全件) と `main` への push
(変わったファイルだけ) で走る。[docs/QUALITY.md](docs/QUALITY.md) に載っている点数は
**2026-09-01 の報告**の物で、**今のコードを測った物ではない** —— 作り直しの状況は
[docs/REMAINING_WORK.md](docs/REMAINING_WORK.md) の「パス 494」、運用は
[docs/QUALITY_WORKFLOW.md](docs/QUALITY_WORKFLOW.md)。

## ドキュメント

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 全体設計 + 認証マトリクス + ライブメトリクス
- [docs/BUSINESS_PLATFORM.md](docs/BUSINESS_PLATFORM.md) — 事業プラットフォーム層 (プラン/売上/KPI/チーム/経営サマリー)
- [docs/DESIGN_BLUEPRINT.md](docs/DESIGN_BLUEPRINT.md) — 設計図 (16 セクション)
- [docs/BROWSER_REDESIGN.md](docs/BROWSER_REDESIGN.md) — ブラウザネイティブ再設計
- [docs/PROXY_EXAMPLE.md](docs/PROXY_EXAMPLE.md) — Cloudflare Worker サンプル
- [docs/QUALITY.md](docs/QUALITY.md) — テスト方針 + mutation 履歴
- [CLAUDE.md](CLAUDE.md) — Claude Code 用プロジェクトガイダンス

## ライセンス

(未設定 — 利用前にリポジトリオーナーにご確認ください)
