# Service Hub

業務支援ダッシュボード。Electron デスクトップアプリ + ブラウザ単体 HTML の
2 通りの実行形態。

## サービス一覧 (22)

| カテゴリ | サービス |
|---|---|
| **おすすめ** (常時表示) | ホーム / 事業ダッシュボード / チームレーダー / Canva テンプレート / ライブラリ / 設定 |
| **分析・ツール** | Skills / Security / Cloudflare / Emotions / Ollama / KPI / Stocks |
| **外部 SaaS 連携** | GitHub / WordPress.com / Atlassian / Notion / Google Drive / Google Calendar / Gmail / Slack / Canva |

## 2 通りの動かし方

### 1. ブラウザだけで動かす (最速・インストール不要)

`dist/standalone.html` (376 KB の単一ファイル) をブラウザでダブルクリックするだけ。
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
npm test                  # vitest run (1086 件)
npm run lint              # ESLint v9
npm run lint:imports      # main/preload/renderer の境界チェック
npm run lint:forbidden    # 禁止パターン (nodeIntegration: true など) 検出
npm run lint:test-coverage # 全サービスに test + action がある確認
npm run lint:docs         # cross-doc 一貫性
npm run verify:arch       # docs/ARCHITECTURE.md の file:line 参照 + 6 ライブメトリクス
npm run mutate            # Stryker mutation testing (15 modules, 100%)
npm run smoke             # xvfb + Electron で 22 ページ smoke screenshot
```

CI: `.github/workflows/ci.yml` が typecheck + test + build:renderer を push/PR 毎に実行。

## アーキテクチャ概要

### Electron 版 (3 プロセス)

```
src/main/              ← Electron main process
  main.ts                IPC handlers (11)
  secrets.ts             OS Keychain / safeStorage トークン保管
  oauth.ts               PKCE OAuth (Google)
  clients/               22 sub-clients (各 service の REST fetcher + actions)
src/preload/           ← contextBridge bridge
  preload.ts             window.serviceHub を公開
src/renderer/          ← React app
  App.tsx                サイドバー (カテゴリ 3 段折りたたみ)
  pages/                 22 個のサービスページ
  components/            StatusBar / DataList / ExportActions
  hooks/useServiceData   snapshot ↔ live fetch
  data/snapshot.ts       全 22 サービスの bundled 静的データ
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
  Cloudflare Worker 経由。docs/PROXY_EXAMPLE.md に 30 行リファレンス実装。
- **OAuth**: file:// 環境では out-of-band paste、hosted では popup callback。
- **CSP**: standalone HTML は `'unsafe-inline'` (file:// 動作のため)。
  hosted 版は `sha256` ハッシュベース推奨。

## 品質ゲート

すべて CI で実行:

| ゲート | 状態 |
|---|---|
| typecheck (`tsc -b`) | 100% pass |
| unit tests (`vitest`) | 1086 / 1086 ✅ |
| eslint | 0 errors |
| lint:imports | 246 imports, 全境界 OK |
| lint:forbidden | 8 patterns scanned, 全 clean |
| lint:test-coverage | 22 services, 全 test 存在 |
| verify:arch | 170 file:line refs + 6 metrics 一致 |
| mutation (Stryker) | **100.00%** (15 modules) |

## ドキュメント

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 全体設計 + 22 services 認証マトリクス
- [docs/DESIGN_BLUEPRINT.md](docs/DESIGN_BLUEPRINT.md) — 設計図 (16 セクション)
- [docs/BROWSER_REDESIGN.md](docs/BROWSER_REDESIGN.md) — ブラウザネイティブ再設計
- [docs/PROXY_EXAMPLE.md](docs/PROXY_EXAMPLE.md) — Cloudflare Worker サンプル
- [docs/QUALITY.md](docs/QUALITY.md) — テスト方針 + mutation 履歴
- [CLAUDE.md](CLAUDE.md) — Claude Code 用プロジェクトガイダンス

## ライセンス

(未設定 — 利用前にリポジトリオーナーにご確認ください)
