# Service Hub — 残りの作業手順書

最終更新: 2026-07-30
対象ブランチ: `claude/eager-brown-7cev3c`（既定ブランチは `main`）

このドキュメントは「今の状態から先に何が残っているか」を並べたランブックです。
**2026-05-12 版は 10 サービス / PR #2 draft を前提にしていて 2 か月半ズレていた**ため、
実測値で書き直しました。以後もズレたら実測で直してください（件数の一部は
`npm run lint:docs` が機械照合します）。

---

## 現状（2026-07-30 実測）

- [x] **72 サービス**の UI + スナップショット表示（おすすめ / 士業連携 / 分析・ツール / 外部サービス連携）
- [x] 全 72 サービスのライブフェッチャー（`LIVE_FETCHERS` は総和型。欠けたら起動時に落ちる）
- [x] write アクション（`LIVE_ACTIONS`）+ `lint:test-coverage` が全サービスのテストとアクションを強制
- [x] OAuth 2.0 + PKCE code flow — **5 プロバイダ配線済み**（drive / calendar / gmail / freee / microsoft-365）
- [x] `safeStorage` によるトークン暗号化保存 + 自動 refresh
- [x] **テスト 6,064 件合格**・typecheck・`verify:all` 13 ゲート green
- [x] ブラウザ単体版 `dist/standalone.html`（10.0 MB）と LITE 版 `standalone-lite.html`（2.2 MB）
- [x] **GitHub Release v0.1.0 を 4 資産で配布済み**（2026-07-27）
      — AppImage / `.deb` / arm64 `.dmg` / Windows `.exe`
- [x] GitHub Pages 配信（landing + デモ 3 種 + lite）
- [x] 知識コーパス **4,141 項目**（学術 3,519 / 法令実務 393 / 補助金 140 / 経済史 86 / 相談窓口 3）
      + Obsidian vault 7,535 ノート + knowledge-graph（nodes 4,141 / edges 20,925）
- [x] 重複疑いキュー **3 系列すべて 0 件** / 出典ベースライン **0 件**

未完了の主要タスク（優先度順）:
- [x] **知識コーパスの増強バックログ 0 件 — 完走**（学術 0 / 法令実務 0）
      — `npm run knowledge:auto` が「✅ 全て最新 — LLM 作業なし」を出力。増強・再検証・asOf・重複疑い 3 系列・
      出典衛生・リンク切れの **8 キューすべて 0 件**。以後は監査で新規に積まれた分だけを消化すればよい
- [ ] **単発誤 DOI の掃討** — `lint:citations` は同一 DOI に年の矛盾があるときだけ落ちるので、
      **1 回しか引かれていない DOI の誤りは原理的に検出できない**（2,449 引用の大半が単発）。
      接頭辞と誌名/出版社の整合は機械判定できるので、そこを検査するゲートが次の恒久対策
- [x] **dev 依存の脆弱性を 15 件 → 2 件へ削減**（2026-08-11 実測。**本番依存は従来どおり 0 件**）。
      二段で処理した:
      1. `npm audit fix`（非破壊・semver 互換のみ）で 7 件解消 —
         postcss / undici / brace-expansion / fast-uri / js-yaml / nanoid / @babel/core
      2. **vitest 2.1.9 → 4.1.10 のメジャー更新**で残る 6 件（critical 2 含む）を解消。
         vitest / @vitest/coverage-v8 / vite / vite-node / esbuild / @vitest/mocker の鎖は
         メジャー更新でしか塞げなかった。`vitest.config.ts` は environment / include /
         isolate / pool / timeout / retry しか使っておらず、v3・v4 の破壊的変更
         （workspace・environmentMatchGlobs 等）に触れていないため無改修で通った
      検証: 270 ファイル 6,748 テスト green（実行時間 **86 秒 → 42 秒**に半減）/
      `test:cov` のカバレッジ取得 OK / Stryker（peer は `vitest >=2.0.0`）も
      dry-run で 27,618 mutant の計装と 6,286 テストの初回実行に成功
- [ ] **残る 2 件は上流待ち**（moderate 2）— いずれも
      `@stryker-mutator/core` → `typed-rest-client` → `qs` の推移依存で、
      Stryker 側がリリースするまで手元では塞げない。`npm audit` は最新の
      アドバイザリを都度取得するため件数は変動する — 数える前に実行すること
- [ ] **Intel Mac (x64) の `.dmg`** — v0.1.0 は arm64 のみ
- [ ] OAuth: 他プロバイダ（Notion / Slack / Canva / WordPress / Atlassian）の config 追加
- [ ] 配布コード署名（Phase 7-1）/ 自動アップデート（Phase 7-2）
- [x] **リポジトリ肥大の増加を停止**（追跡除外・非破壊）— `.git` の実測内訳は
      `dist/standalone.html` 362MB（327 版）/ `academicKnowledge.ts` 306MB（本体ソース・不可避）/
      `dist-chunks/part-*` 106MB / knowledge-graph の education 176MB。
      このうち **ビルド生成物の 2 つを追跡から外した**（`git rm --cached`・作業ツリーは保持）:
      `dist/standalone.html` は CI と Pages が `build:web` で毎回作り直すため追跡版は未使用、
      `dist-chunks/` は v0.1.0 Release が AppImage を直接配布するため冗長。
      knowledge-graph / knowledge-vault は `vault:check` / `verify:graph` が
      本体データとの byte 一致を検査する**検証対象の成果物**なので追跡を維持する
- [ ] **`.git` 1.3 GB 自体の縮小は未実施**（履歴書き換えが必要なため別判断）。
      `git filter-repo` / BFG で上記 blob を履歴から削れば約 470MB 減る見込みだが、
      全コミット SHA が変わり force-push で既存クローンと PR が壊れる。破壊的なので保留
- [ ] `e2e` / `e2e:lite` / `e2e:ollama` / `perf` / `smoke` は実ブラウザ・Electron が要るため **CI 外**。
      renderer や起動性能を触ったらローカルで回すこと

---

## Phase 0: 今すぐ自分のデスクトップで起動する（5 分）

### Linux x86-64

AppImage は **GitHub Release から直接ダウンロード**する（リポジトリを clone する必要はない）:

```bash
# v0.1.0 の資産一覧: https://github.com/hiroto1977/-/releases/tag/v0.1.0
curl -L -o ServiceHub.AppImage \
  "https://github.com/hiroto1977/-/releases/download/v0.1.0/Service.Hub-0.1.0.AppImage"
chmod +x ServiceHub.AppImage
./ServiceHub.AppImage
```

ファイラから AppImage をダブルクリックでも可。FUSE が無い環境では:

```bash
./ServiceHub.AppImage --appimage-extract
./squashfs-root/AppRun
```

> **注**: 以前は `dist-chunks/part-*` を git に載せて `scripts/assemble-appimage.sh` で
> 再結合していたが、Release が AppImage を直接配布するようになったため
> `dist-chunks/`（106MB）は追跡対象から外した。過去のコミットを checkout すれば
> 従来手順も使える。

### ブラウザ版（インストール不要・最速）

```
https://hiroto1977.github.io/-/app.html      # フル版
https://hiroto1977.github.io/-/lite.html     # モバイル用ライト版（約 2MB）
```

ローカルで作る場合は `npm run build:web` → `dist/standalone.html`
（生成物のため git では追跡していない）。

### Mac / Windows / その他

```bash
git fetch origin
git checkout claude/add-claude-documentation-F7HIa
git pull
npm install
npm run dev        # ホットリロード開発モード
# または
npm run build      # release/ に .dmg / .exe を出力
```

### 動作確認チェックリスト

- [ ] Electron ウィンドウが開く
- [ ] サイドバーに 72 サービスがカテゴリ別（おすすめ / 士業連携 / 分析・ツール / 外部サービス連携）で表示される
- [ ] 各タブをクリックしてスナップショットデータが表示される
- [ ] GitHub タブで「PAT を設定」 → PAT を貼り付け → 「保存」 → バッジが `Live` に変わる
- [ ] 「更新」ボタンで再フェッチ → 最新の自分の PR が表示される

---

## Phase 1: PR レビュー & main へマージ（30 分）

### 1-1. PR を ready にする

GitHub UI で PR #2 を開き、「Ready for review」をクリック。または:

```bash
gh pr ready 2     # gh CLI を使う場合
```

### 1-2. セルフレビュー観点

- `src/main/main.ts` の IPC ハンドラ群（`fetch:snapshot` の error 包装、`secrets:*` の入力検証）
- `src/main/secrets.ts` の `safeStorage` 不在時フォールバックの暗号強度（現在 plain base64 = 平文相当）
- 各 fetcher の URL ハードコーディング — `src/main/clients/*.ts`
- `tokenSetup` の placeholder に書いた認証情報フォーマットが正確か

### 1-3. main にマージ

レビュー OK なら GitHub UI から Squash merge。マージ後:

```bash
git checkout main
git pull
git branch -d claude/add-claude-documentation-F7HIa
```

### 1-4. GitHub Release 作成（任意）

`v0.1.0` タグを切って Release 化。AppImage を assets に添付:

```bash
git tag v0.1.0 && git push origin v0.1.0
gh release create v0.1.0 "release/Service Hub-0.1.0.AppImage" \
  --title "Service Hub v0.1.0" \
  --notes "Initial release: 9-service dashboard with live REST fetchers"
```

これで `dist-chunks/` を git から削除して履歴を綺麗にする選択肢が生まれる
（既存履歴の rewrite は別作業。BFG repo-cleaner を使う）。

---

## Phase 2: スナップショットを最新化する（10 分、必要時）

`src/renderer/data/snapshot.ts` は手動更新。Claude Code で各 MCP ツールを叩き、
結果を貼り直す:

| サービス | MCP ツール |
|---|---|
| GitHub | `mcp__github__get_me`, `mcp__github__list_pull_requests` |
| WordPress | `mcp__1162bffd...wpcom-user-sites` |
| Atlassian | `mcp__3245dd75...getAccessibleAtlassianResources` + `getVisibleJiraProjects` |
| Notion | `mcp__11127ca0...notion-search` |
| Drive | `mcp__8854cd8f...list_recent_files` |
| Calendar | `mcp__9789a00e...list_calendars`, `list_events` |
| Gmail | `mcp__9fcfcbe6...search_threads` |
| Slack | `mcp__d20bd3b1...slack_search_channels` |
| Canva | `mcp__c7c3b64a...search-designs`, `list-brand-kits` |

将来的にこの手動ステップを廃止するには Phase 5 の自動更新ジョブを参照。

---

## Phase 3: アイコン / ブランディング（30 分）

現状は Electron デフォルトアイコン (`default Electron icon is used` の警告)。

### 手順

1. `512x512` の PNG を `build/icon.png` に置く
2. `electron-builder.json` に追記:
   ```json
   "mac":   { "target": "dmg", "icon": "build/icon.png" },
   "win":   { "target": "nsis", "icon": "build/icon.png" },
   "linux": { "target": "AppImage", "icon": "build/icon.png" }
   ```
3. アプリ表示名やバンドル ID の調整: `package.json` の `author`、`electron-builder.json` の `productName` / `appId`
4. `npm run build` で再生成 → アイコンが反映される

### Mac の DMG 背景画像（任意）

`build/background.png` (540x380 推奨) を置き、`electron-builder.json` で
`"dmg": { "background": "build/background.png" }` を指定。

---

## Phase 4: OAuth code flow ✅ 基盤実装済み

PKCE-based Authorization Code (RFC 7636 + RFC 8252) を main プロセスに実装。
ループバックサーバ・state 検証・token refresh まで含む完全フロー。
**10 プロバイダ配線済み** — Google 3 種 (Drive / Calendar / Gmail、単一 client ID で
3 サービスをカバー) + freee / Microsoft 365 / Slack / Notion / Canva / WordPress.com /
Atlassian。詳細は `docs/OAUTH_SETUP.md`。

うち Notion / Canva / WordPress.com / Atlassian は **機密クライアント**で、
公式ドキュメント上 token 交換に client_secret が要る。`OAuthConfig` に
`pkce` / `clientSecret` / `clientAuth` (`none`|`basic`|`body`) / `tokenBodyFormat`
(`form`|`json`) を足して表現した。既存 5 件は既定値のままなので**通信内容は不変**。

残作業: 各プロバイダの開発者コンソールで client ID / secret を取得し環境変数へ渡す
(`*_OAUTH_CLIENT_ID` / `*_OAUTH_CLIENT_SECRET`)。**実 API での疎通確認は未実施** —
エンドポイントとスコープは公式ドキュメントと各社公開の OpenAPI / SDK ソースで
裏取りしたが、実際に認可画面まで通したわけではない。

未確定のまま入れなかったもの:
- Canva の `brand-kits` スコープ — `GET /v1/brand-kits` は Canva 公開 OpenAPI に
  存在せず必要スコープを確定できない。`clients/canva.ts` は 403/404 を握って
  デグレードするので実害なし。
- WordPress.com の `oauth2-1/token` (PKCE・secret 不要) — 検索結果には出るが
  REST API 一般に使えるのか確証が取れず、確認済みの `/oauth2/*` + secret を採用。
  もし一般に使えるなら WordPress も公開クライアントにできる。

---

## バンドルサイズの実測と上限方針の不在

2026-08-11 実測（同一マシン・同一コミット）:

| ビルド | 実測 | ドキュメント記載（当時） |
|---|---|---|
| `build:web` | **10.68 MiB** (11,200,073 B) | 「~10 MB」 |
| `build:web:lite` | **2.59 MiB** (2,719,547 B) | 「~2.2 MB」 |

LITE が想定より **+18%** 育っている。増分は学術コーパスではなく
compliance / subsidy / counselor / econ-history のデータ（LITE は
学術コーパスを積んでいない）。CLAUDE.md の記載を実測値へ更新した。

**上限の現況（2026-08-11 に確認して訂正）。** 当初「上限が無い」と書いたが
**それは誤りだった** — `ci.yml` の size 検証は LITE に以前から
**4,000,000 B の天井**を置いている（実測 2,719,547 B ＝ 予算の 68%）。
青天井だったのは**フル版**のほうで、下限 100,000 B しか無かった。
そこでフル版にも 16,000,000 B の天井を追加した（実測比 約 43% の余裕。
通常のコーパス増加では当たらず、巨大アセットの誤同梱や遅延ロードの
解除といった桁違いの増加でだけ落ちる位置）。

残る課題は**天井に近づいたことを事前に知る手段が無い**こと。今は
「通る／落ちる」の二値で、LITE が 4MB へ寄っていく過程が見えない。
予算消費率を出して 80% 超で警告するのが素直だが、警告を CI のどこに
出すか（step summary か、独立ゲートか）を決めていないので未着手。
なお `perf` ゲートは起動時の巨大 JSON.parse (`bigParses`) を見るもので
サイズとは別軸、かつ CI では走らない（実ブラウザが要るため）。

なお `perf` の DCL などの絶対値は**機械依存**で、別マシンの記録と
比較してはいけない（SESSION_HANDOFF の罠 6 参照）。

---

## 出典の DOI プレフィックス照合 — 未確認 134 件

`npm run lint:doi-prefix` (verify:all / CI に配線済み) を新設。DOI プレフィックスは
登録機関＝出版社に紐づくので、`10.1017` (Cambridge UP) なのにラベルが
「Oxford University Press」と名乗っていれば **どちらかの書誌が必ず誤り**。
948 件の DOI 出典 (ラベルが出版社を名乗るもの) を照合し、134 件の矛盾を検出した。

134 件は全て `scripts/lint-doi-prefix.cjs` の `ALLOWLIST` に
`id::DOI` + 「ラベルの主張 / DOI の出版社」つきで退避してある。**まだ直していない**のは
一次資料に当たっておらず、ラベルと DOI のどちらが誤りか判定していないため
(推測で出典を直さない規則)。台帳は `lint:citations` と同じく双方向で、
矛盾が解消されたのに台帳へ残っていると落ちる = 直したら消すことが強制される。

残作業: 134 件を一次資料で照合し、誤っている側を差し替えて台帳から消す。
多い順に「Psychological Science 系 → APA」7 件、「Journal of Management → AOM」6 件、
「Academy of Management → Wiley」6 件。代表例:

- `bizlaw-administrative-law-proportionality` — ラベル Oxford UP / DOI `10.1017` (Cambridge)
- `econ-backwash-spread-myrdal` — ラベル Cambridge UP / DOI `10.1016` (Elsevier)
- `infosoc-affective-computing-picard` — ラベル MIT Press / DOI `10.1145` (ACM)

中立プレフィックス (JSTOR `10.2307` / SSRN `10.2139` / NBER `10.3386` 等) と
版元が移った誌 (QJE、Review of Economic Studies、Econometrica、Journal of Management 等)
はルール側で除外済み。

---

## Phase 5: サービスごとの機能拡張（オープンエンド）

現在は読み取りのみ。書き込み・操作系を順次追加:

| サービス | 候補機能 | 関連 MCP / API |
|---|---|---|
| GitHub | Issue 作成、PR review、CI 状態 | `POST /repos/{o}/{r}/issues`, `/check-runs` |
| WordPress | 投稿のドラフト作成、メディアアップロード | `POST /sites/{id}/posts/new` |
| Atlassian | Jira issue 作成・遷移、Confluence ページ更新 | `POST /rest/api/3/issue`, `PUT /rest/api/3/issue/{id}/transitions` |
| Notion | ページ作成、データベース更新 | `POST /v1/pages`, `PATCH /v1/databases/{id}` |
| Drive | アップロード、共有設定変更 | `POST /upload/drive/v3/files` |
| Calendar | 予定作成・変更、招待応答 | `POST /calendars/{id}/events` |
| Gmail | ドラフト作成、送信、ラベル付与 | `POST /users/me/drafts`, `/labels` |
| Slack | メッセージ送信、Canvas 作成・編集 | `POST /chat.postMessage`, `/canvases.create` |
| Canva | デザイン生成、エクスポート | `POST /v1/designs`, `/v1/exports` |

### 追加方法のパターン

1. `src/main/clients/<service>.ts` に新関数を追加（例: `createJiraIssue`）
2. `LIVE_FETCHERS` とは別の `LIVE_ACTIONS` マップを定義し、`ipcMain.handle('action:invoke', ...)` を main に追加
3. preload に `invokeAction(serviceId, action, payload)` を公開
4. レンダラ各ページに専用の入力フォーム / ボタン

または、シンプルに `serviceHub.action('jira:create', payload)` 形式の単一 IPC で受けて
main 側で分岐する設計でも良い。

---

## Phase 6: Mac / Windows 用インストーラ ✅ v0.1.0 で配布済み（Intel Mac のみ残）

`electron-builder` は **動作させる OS と同じターゲット** をネイティブビルドする
のが安定運用。

### Mac (Apple Silicon と Intel 両方)

Mac 上で:
```bash
npm run build
# release/Service Hub-0.1.0-arm64.dmg と release/Service Hub-0.1.0.dmg
```

### Windows

Windows 上で:
```bash
npm run build
# release/Service Hub Setup 0.1.0.exe (Nullsoft NSIS)
```

### クロスビルドする場合（非推奨だが可能）

Linux から Windows を作る:
```bash
sudo apt-get install wine64
npm run build -- --win
```

Mac は Apple のライセンスで他 OS からのビルドが事実上不可。

---

## Phase 7: 配布・自動アップデート・CI（数日）

### 7-1. コード署名

| OS | 署名証明書 | 必要性 |
|---|---|---|
| Mac | Apple Developer ID ($99/年) + 公証 | 配布で必須（Gatekeeper） |
| Windows | EV コード署名証明書 ($200〜400/年) | SmartScreen 警告回避 |
| Linux | 不要 | AppImage に署名は任意 |

`electron-builder` の `mac.identity`, `win.certificateFile` で設定。

### 7-2. 自動アップデート

`electron-updater` を依存追加し、`src/main/main.ts` に:

```ts
import { autoUpdater } from 'electron-updater';
app.whenReady().then(() => {
  autoUpdater.checkForUpdatesAndNotify();
});
```

GitHub Releases 上のメタファイル (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`)
を自動で読みに行く。Release を作るたびに electron-builder が自動で生成。

### 7-3. GitHub Actions CI ✅ 配備済み

- `.github/workflows/ci.yml` — main / claude/** ブランチへの push + main 宛 PR で
  typecheck + test + build:renderer を自動実行。同じ ref の古い run は
  `concurrency.cancel-in-progress` で自動キャンセル。
- `.github/workflows/release.yml` — `v*` タグ push を契機に Ubuntu / macOS /
  Windows の 3 ランナーが並列で `npm run build` → 各 OS のインストーラを
  GitHub Release にアップロード (`softprops/action-gh-release@v2`)。

初回タグの切り方:

```bash
git checkout main
git pull
git tag v0.1.0
git push origin v0.1.0
# → 3 OS の native installer が GitHub Release v0.1.0 に自動で並ぶ
```

### 7-4. クラッシュレポート / メトリクス（任意）

Sentry / Datadog の Electron SDK を main / renderer 両方に組み込み、起動回数や
エラーを集める。デスクトップアプリは Web と違いログが取れないので、最低限の
オプトインテレメトリは入れた方が運用しやすい。

---

## 優先順位の推奨

「自分で使いたい」が目的なら:

1. **Phase 0**（5 分）→ 即動かす
2. **Phase 2**（10 分）→ データを最新化して見やすく
3. **Phase 3**（30 分）→ ドックでアイコンが映える
4. **Phase 1**（30 分）→ main に取り込んで歴史を整理
5. **Phase 6**（OS 別 30 分）→ 自分の OS 向けインストーラ作る

ここまでで「個人ツールとして毎日使う」レベル。さらに「家族や友人にも配る」「公開する」
段階で Phase 4 / Phase 7 が必要になります。
