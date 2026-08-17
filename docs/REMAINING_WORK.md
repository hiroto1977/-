# Service Hub — 残りの作業手順書

最終更新: 2026-08-17
対象ブランチ: `claude/eager-brown-7cev3c`（既定ブランチは `main`）

このドキュメントは「今の状態から先に何が残っているか」を並べたランブックです。
**2026-05-12 版は 10 サービス / PR #2 draft を前提にしていて 2 か月半ズレていた**ため、
実測値で書き直しました。以後もズレたら実測で直してください（件数の一部は
`npm run lint:docs` が機械照合します）。

---

## 現状（2026-08-17 実測）

- [x] **74 サービス**の UI + スナップショット表示（おすすめ / 士業連携 / 分析・ツール / 外部サービス連携）
- [x] 全 74 サービスのライブフェッチャー（`LIVE_FETCHERS` は総和型。欠けたら起動時に落ちる）
- [x] write アクション（`LIVE_ACTIONS`）+ `lint:test-coverage` が全サービスのテストとアクションを強制
- [x] OAuth 2.0 + PKCE code flow — **10 プロバイダ配線済み**
      （drive / calendar / gmail / freee / microsoft-365 / slack / notion / canva / wordpress / atlassian）
- [x] `safeStorage` によるトークン暗号化保存 + 自動 refresh
- [x] **テスト 7,722 件合格**・typecheck・`verify:all` **22 ゲート** green
- [x] ブラウザ単体版 `dist/standalone.html`（10.78 MB）と LITE 版 `standalone-lite.html`（2.67 MB）
      — CI が両方の下限・上限を検査（LITE は 4MB 上限 + 85% 到達で警告）
- [x] **GitHub Release v0.1.0 を 4 資産で配布済み**（2026-07-27）
      — AppImage / `.deb` / arm64 `.dmg` / Windows `.exe`
- [x] GitHub Pages 配信（landing + デモ 3 種 + lite）
- [x] 知識コーパス **4,140 項目**（学術 3,518 / 法令実務 393 / 補助金 140 / 経済史 86 / 相談窓口 3）
      + Obsidian vault 7,543 ノート + knowledge-graph（nodes 4,140 / edges 20,978）
- [x] 重複疑いキュー **3 系列すべて 0 件** / 出典ベースライン **0 件**（識別子衝突も 0）
- [x] **全 74 画面で任意の数値・事業を追加できる**（`manual-metrics` / `business-units`）。
- [x] **画面の数字の出どころを宣言**（`shared/dataOrigin.ts`: remote 15 / local 17 / sample 42）。
      公式 API 未配線の 24 サービスで「更新を押すと画面が空になり緑の『ライブ』が付く」
      不具合を修正し、`lint:data-origin` が実装と宣言のズレを双方向で落とす。
      計算値の置き換えは一覧を持つ 5 画面 65 項目（overview 45 / sales 3 / kpi 8 /
      real-estate 5 / mutual-funds 4）

未完了の主要タスク（優先度順）:

**2026-08-17 時点で、手元で進められる工学的な残作業は無い。** 下に残っているものは
いずれも (a) 外部の資格情報や別 OS が要る、(b) 上流の修正待ち、(c) 破壊的なので
意図的に保留、のいずれかである。「やれるのに放置している項目」は無い。

- [x] **知識コーパスの増強バックログ 0 件 — 完走**
      — `npm run knowledge:auto` が「✅ 全て最新 — LLM 作業なし」を出力。増強・再検証・asOf・
      重複疑い 3 系列・出典衛生・リンク切れの **8 キューすべて 0 件**（2026-08-17 再確認）
- [x] **単発誤 DOI の掃討** — 恒久対策として `lint:doi-prefix` を新設済み。
      DOI 接頭辞と誌名/出版社の矛盾・埋め込み ISBN のチェックディジット・同一誌コードの矛盾・
      同一文献の別 DOI（識別子衝突）を機械判定する。**4 つの台帳すべて 0 件・除外リストなし**
- [x] **OAuth: 他プロバイダの config 追加** — Notion / Slack / Canva / WordPress / Atlassian は
      配線済み（計 10 プロバイダ）
- [x] **dev 依存の脆弱性を 15 件 → 2 件へ削減**（本番依存は 0 件のまま）
- [x] **dev 依存の脆弱性も 0 件にした**（2026-08-17）。上流待ちにしていた
      `qs` の DoS（`@stryker-mutator/core` → `typed-rest-client` → `qs@6.15.1`）は
      **npm の `overrides` で `qs@^6.15.2` を強制**して解消した。Stryker のリリースを
      待つ必要は無かった。patch 更新なので `typed-rest-client` の API は変わらず、
      Stryker の実行（mutation 100% 維持）・typecheck・全テストで確認済み。
      `npm audit` は最新のアドバイザリを都度取得するため件数は変動する —
      数える前に実行すること
- [x] **Intel Mac (x64) の `.dmg` をビルド対象に入れた**（2026-08-17）。
      `electron-builder.json` の `mac.target` に `arch: ["x64", "arm64"]` を明示した。
      v0.1.0 が arm64 のみだったのは arch を書いておらず `macos-latest`（arm64）の
      ホスト arch だけが出ていたため。**次のタグ push で両方の dmg が出る**
      （成果物そのものは macOS ランナーが作るので、ここでは検証できない）
- [x] **配布コード署名の配線**（Phase 7-1）を入れた（2026-08-17）。
      `release.yml` が `CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_ID` /
      `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` を渡す。**secrets が無ければ
      署名を飛ばしてビルドは通る**ので、証明書が未調達でもリリースは作れる。
      公証は `APPLE_ID` が入っているときだけ有効化する（未設定で on にすると
      署名の無い状態で公証を試みて失敗するため）。
      **残るのは証明書の調達そのもの**（Apple Developer / Windows の OV or EV）
- [x] **更新の確認**（Phase 7-2 の安全な部分）を実装した（2026-08-17）。
      `shared/updateCheck.ts` + IPC `app:checkUpdate` + 設定画面。
      **取得もインストールもしない** — 署名の無い配布物を自動で取得して実行する
      経路は、トークンを保持するこのアプリでは新しいコード実行の入口になる。
      新しい版があることを伝え、ダウンロードは利用者がリリースページで行う。
      応答は形とホスト（github.com のみ）まで検証するので、応答を差し替えられても
      任意の URL を案内先にはできない。mutation 100%（135 変異体・pragma 0）
- [ ] **自動ダウンロード・自動インストール**（Phase 7-2 の残り）— **署名が前提**。
      判定（`evaluateUpdate`）と取得を分けてあるので、証明書が入れば
      判定はそのまま使って差し替えられる
- [x] **`.git` 1.3 GB — 再発防止を実装し、縮小手順は文書化した**（2026-08-17）。
      実行しない判断の根拠を測って残した:
      **① リモートは履歴を書き換えても縮まない** — `refs/pull/*` が古い blob を恒久的に
      固定するので、**GitHub Support に gc を依頼**しないと実容量は減らない。
      「約 470MB 減る」はローカルの `.git` の話である。
      **② ローカルは非破壊で今すぐ解決する** — `git clone --depth 50` で数十 MB になる。
      CI も `actions/checkout@v4` が既定で浅いクローンなので対策済み。
      **③ 実装した再発防止**: `lint:repo-size`（1 ファイル 12MB / 追跡合計 80MB の天井 +
      85% で警告）を `verify:all` と CI に登録。`verify:arch` は追跡行数の**下限**しか
      見ておらず膨張を捕まえないため、床と天井の両方を置いた。実測 57.7MB / 8,396 ファイル。
      **④ 手順書**: `docs/GIT_HISTORY_SHRINK.md`。**浅いクローンからは実行不可**
      （2026-08-17 実測でコンテナは shallow・手元 ref 2 本 / リモート 217 本。
      force-push すると手元に無い 215 本を消す）。全履歴を持つ手元のマシンでのみ実行する
- [x] **`e2e` / `e2e:lite` / `perf` を CI から回せるようにした**（2026-08-17・`.github/workflows/e2e.yml`）。
      既定では走らない（Actions 分の節約という判断は維持）。走らせ方は 2 つ:
      **① Actions 画面から手動実行**（対象を both / full / lite で選べる）、
      **② PR に `run-e2e` ラベルを付ける**。通常の PR の待ち時間と Actions 分は変わらない。
      `e2e:ollama` / `smoke` は Ollama スタブと Electron の実描画が要るためローカル専用のまま

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
https://hiroto1977.github.io/-/lite.html     # モバイル用ライト版（約 2.7MB）
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
- [ ] サイドバーに 74 サービスがカテゴリ別（おすすめ / 士業連携 / 分析・ツール / 外部サービス連携）で表示される
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

## 使わない資格情報を求めていた画面 8 つ — 対応済み (2026-08-17)

`dropbox` / `salesforce` / `discord` / `asana` / `linear` / `sentry` / `stripe` / `line` は
fetcher も write アクションも資格情報を読まないのに、トークン入力欄を出して
`safeStorage`（ブラウザ版は Vault）で暗号化保存していた。**読み手のいない資格情報を
預かること自体が漏えい面**であり、利用者からは「入れれば繋がる」という誤解にもなる。

対応:

- `src/shared/credentialUse.ts` で用途を宣言（fetch 15 / action 8 / none 51）
- `StatusBar` は `none` なら `tokenSetup` を無視する（判定は 1 か所）
- 該当 8 ページから `tokenSetup` 自体も外した
- **保存済みの分の掃除**: 設定画面の「使われていない資格情報」節から個別に削除できる
  （入力欄を消すと「削除」ボタンも消えるため、出口を別に用意する必要があった）
- `lint:credential-use`（21 ゲート目）が宣言・実装・画面を双方向に照合し、
  `none` のサービスに `tokenSetup` を書いたページがあれば落ちる

`shopify` は fetcher が stub だがアクションが実際に通信するため対象外。

---

## セキュリティ診断が「無い」と「確認できない」を区別できない

2026-08-17 に `autoLockEnabled` を実測へ切り替えた（診断が「自動ロック: 未対応」と
告げていたが、ブラウザ版では実際に動いていた）。残る 2 項目は**まだ観測していない**:

| 項目 | 現状 | なぜ |
|---|---|---|
| `integrityVerified` | `false` 固定 | レコードストアの改ざん検知は常時検証が未配線 |
| `cloudBackup` | 実際に 0 件 | クラウド同期パネルはデモで、構成が永続化されない |

`cloudBackup: []` は**嘘ではない**（構成が存在しない）。問題は
`integrityVerified` のほうで、`buildDbSecurityReport` の入力が `boolean` しか
取れないため「確認していない」を「対応していない」として点数から差し引いている。
利用者から見ると、**手を打っても消えない改善候補**が常に残る。診断が消えない
指摘を出し続けると、読む側は診断全体を無視するようになる（「常に緑を返すゲートは
無いより悪い」の裏返し）。

直し方は決めていないので未着手:

- `SecurityCheck` に `status: 'ok' | 'missing' | 'unknown'` を持たせ、`unknown` を
  改善候補と別枠で出す。点数は「確認できた項目のうち」の比率にするか、`unknown` を
  減点のまま**表示だけ分ける**かで、意味が変わる。
  - 比率にすると、観測を増やすほど点が動いて履歴が比較できなくなる。
  - 減点のままにすると、満点に到達できないままである。
- どちらを選ぶかは「診断が何を約束するか」の決定なので、実装より先にそこを決める。

`autoLock` の実測は `src/renderer/data/dbPosture.ts` に置いた。次に観測を増やす時も
画面の中ではなくここへ足すこと（画面の中で組み立てると、実測を定数へ戻しても
テストが緑のまま通る）。

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

## 出典の DOI プレフィックス照合 — 残り 18 件（134 件から着手済み）

`npm run lint:doi-prefix`（verify:all / CI に配線済み）が 949 件の DOI 出典を照合し、
当初 134 件の矛盾を検出した。**うち 116 件を処理済み**（DOI 差し替え・書誌 URL 化 114 件
＋ ルール修正 2 件）。残り 18 件は台帳 `scripts/lint-doi-prefix.cjs` の `ALLOWLIST` に
「未確認」として退避してある。台帳は双方向なので、直したら消すことが強制される。
ISBN 台帳は 24 → 21 件、識別子衝突台帳は 61 → 58 件（いずれもプレフィックス修正と
重なった分が解消）。

**残り 18 件はいずれも「ラベルの文献そのものが疑わしい」型**で、DOI の差し替えでは
直らない。例: `bizlaw-anti-money-laundering-fatf` のラベル
「Broome, A. (2009) The Global Economic Crisis and FATF — Routledge」は**その書籍自体が
実在を確認できない**（André Broome の Routledge 危機本は *Global Governance in Crisis*
で書名も年も違う）。出典ごと差し替える判断が要るので、機械的には進められない。

**照合は 3 並列 × 12 件で回した。** 前回 4 並列 × 34 件では全員が検索予算切れで
打ち切られたので、実測した上限（1 セッション 30〜40 件）に合わせて絞ったところ、
**36 件すべてが判定完了・偽陽性ゼロ**になった。並列度ではなく 1 人あたりの
件数が効く。

**エージェント同士が 1 件で食い違った**（Wray 『Modern Money Theory』の
`10.1057/9781137539922` を一方は「検証済み」、他方は「未検証だから使うな」と報告）。
同一文献なので親が SpringerLink を直接確認して決着させた（Palgrave Macmillan
2015 年刊の第 2 版で正しい）。**報告が割れたら親が一次確認する**、が正しい扱い。

**ルール側で解決した偽陽性 2 件。** 台帳に隠すと将来も誤検出し続けるので、
真の偽陽性はルールを直す。
1. `econ-dorfman-steiner-theorem` — URL が Wiley Encyclopedia of Management の項目で
   ラベルにもそう明記してあるのに、原典の掲載誌（AER）を見て誤検出していた。
2. `human-reactive-devaluation` — *Negotiation Journal* は Plenum → Kluwer/Blackwell
   (Wiley) → **MIT Press** と版元が移っている。Wiley のレガシー DOI に「MIT Press」
   表記が付いているのは**矛盾ではない**（MIT Press が当該論文をホストしており、
   PDF 名は Wiley 時代のまま）。版元移動を許容する誌の一覧に追加した。

### 処理済みの内訳

**DOI 差し替え 33 件** — いずれも出版社／索引ページで**実体を確認してから**差し替えた。
確認できなかった候補は、もっともらしくても投入していない（推測で出典を直さない）。
例: Gioia &amp; Chittipeddi (1991) に付いていた `10.5465/amr.1991.4279513` の実体は
**AMR に載った別書（Flow）の書評**で、正しい SMJ の DOI へ差し替えた。

**偽陽性 1 件はルール側で除外** — `econ-dorfman-steiner-theorem` は URL が
Wiley Encyclopedia of Management の項目で、ラベルにもそう明記してあるのに、
ラベル中の "American Economic Review"（原典）を見て誤検出していた。
百科事典・ハンドブックは「原典を紹介する二次文献」なので、ラベルが原典の掲載誌と
収録先の両方を名乗るのが正常。**台帳に隠さずルールを直した**（隠すと将来も誤検出が続く）。

### ISBN チェックディジット検査 — 新設・24 件が「解決しない DOI」

Springer の書籍 DOI は `10.1007/<ISBN-13>`、Elsevier の書籍章は
`10.1016/B<ISBN-13>.<章>` の形で **ISBN をそのまま含む**。ISBN-13 は
末尾 1 桁が検査数字なので、**外部に問い合わせずに実在性を否定できる**。
`lint:doi-prefix` にこの検算を足した（プレフィックス照合とは独立の検査で、
出版社が一致していても引っかかる。**検索予算を一切使わない**のが利点）。

実測: 書籍 DOI 350 件中 **24 件がチェックディジット不正**＝解決しない DOI。
アルゴリズムは既知の正しい ISBN（MIT Press / HUP / OUP）で検算済み。
24 件は `ISBN_ALLOWLIST` へ退避（双方向）。**「この DOI は解決しない」ことは
数学的に確定**していて、未確認なのは「正しい ISBN が何か」のほうだけ。
つまりプレフィックス側の 100 件より**確度の高い作業キュー**になっている。

該当例: `econ-public-choice-buchanan-tullock` の `10.1007/978-0-387-29907-7`
（正しい末尾は 5。しかも `…-5` の実体は Springer の性科学百科事典で
公共選択論とは無関係）、`mgmt-lean-startup-ries-build-measure-learn` の
`10.1007/978-1-4302-4463-4`（Ries『The Lean Startup』は Crown Business 刊で
Springer ではない）など。

**この検査を書いていて自分のバグを 1 件踏んだ**: プレフィックス照合が
クリーンなときの早期 return が ISBN の失敗を握り潰していた。負のコントロールで
「プレフィックスは綺麗・ISBN だけ不正」を作って exit 1 を確認している。

### 誌コード照合 — 新設・12 件（プレフィックス照合には**見えない**穴）

プレフィックス照合は「出版社が違う」ことしか見ない。だが AOM は
`10.5465/amr.` `10.5465/amj.` のように**誌そのもの**を DOI 接尾辞に持ち、
AEA も `jep` / `jel` / `aer` を使い分ける。つまり
**「AMJ の DOI に AMR のラベル」は同一出版社なので素通り**していた。

実測: 誌コードを持つ DOI 246 件中 **12 件が不一致**。例:
- Rogoff (1996)『The Purchasing Power Parity Puzzle』は実際には **JEL** 34(2)
  だが `10.1257/jep.10.4.97`（JEP）が付いている（2 エントリで同じ誤り）
- Sarasvathy (2001)『Causation and Effectuation』は実際には **AMR** 26(2)
  だが `10.5465/amj.2001.4428801`（AMJ）
- Bernanke &amp; Gertler (1995)『Inside the Black Box』は実際には **JEP** 9(4)
  だが `10.1257/jel.37.4.1661`（JEL）

**年と巻は使わない（実測して採用を取り下げた）。** 最初は DOI に埋まった年と
ラベルの年を突き合わせようとしたが、**AOM の現行 DOI は投稿年**を使う。
Smith &amp; Lewis (2011) の実 DOI は `10.5465/amr.2009.0223` で 2 年ずれるのが正常。
この検査では 19 件が挙がり大半が正しい書誌だった（コーパス内の別々の
2 エントリが同じ DOI を挙げていたのが傍証）。**誤検出を出すゲートは無いより
悪い**ので誌コードだけを見る。

### 識別子衝突の検査 — 新設・61 群（`lint:citations` の逆方向）

`lint:citations` は「同じ DOI が別々の出版年で引かれていないか」を見る。
その**逆方向**（同じ文献が別々の DOI で引かれていないか）は検査されておらず、
並列照合のエージェントが毎回「担当外だが」と手で報告してきていた。

**正常な冗長を除外するのが肝。** JSTOR ID と出版社 DOI が同じ論文を指すのは
正常（別レジストリの識別子が並存しているだけ）。除外しないと 136 群が挙がり
その多くが正当だった。異常と見なすのは 2 つだけ:
1. 出版社 DOI が 2 つ以上（別々の出版社を指している）
2. **同じ中立レジストリに別 ID が 2 つ** — 同一論文に 2 つの JSTOR ID は
   あり得ないので、必ず一方が誤り

実測 **61 群**。サンプル 6 件を目視して「書籍とその書評」型の誤検出が
起きていないことを確認した（ラベルがほぼ同一の同一文献ばかりだった）。例:
Bernanke &amp; Gertler (1989) AER 79(1) 14–31 が `10.2307/2937927` と
`10.2307/1804770` の**2 つの JSTOR ID**で引かれている。

### Elsevier PII のチェック文字検査は**採用しなかった**（実測して撤退）

ISBN 検算と同じ発想で PII の検査文字も計算できるはずだったが、
**アルゴリズムを同定できなかった**。コーパスの実 PII 111 件に対し
重み・法・向き・補数の組合せを総当たりしたが、最良で 20/111（18%）＝偶然の域。
推測で入れれば**正しい PII の 8 割を誤検出**するので入れていない。
一方 **ISSN のチェックディジットは 137/137 = 100%** で検算できることを確認した
（ただし不正は 0 件なので、今日は何も見つけない検査になる）。

### 判明した構造 — 個別の誤りではなくパターン

1. **書籍に後付けされた DOI** が最多。実在するが**まったく無関係な文献**を指す。
   最も明白な例は `infosoc-digital-rights-management-theory` で、Gillespie *Wired Shut*
   （MIT Press）に付いた `10.1017/CBO9780511813696` の実体は
   **Cambridge の熱流体工学の物性表小冊子**だった。
   → **書籍は DOI を持たせず ISBN / 出版社書誌 URL に統一する**のが再発防止になる。
2. **実在しない DOI（捏造の疑い）**。`10.1007/978-0-387-29907-7` は
   **ISBN-13 のチェックディジットが不正**（正しくは末尾 5）。
   `10.1016/0749-596X(78)90043-4` は ISSN 0749-596X の誌が **1985 年創刊**なので
   1978 年の PII は成立しない。
3. **本物の論文の開始頁を、別出版社の DOI 体系に流し込んだ**痕跡。
   Psychological Science 13:172 に対し `10.1037/0022-3514.82.1.172`（APA の JPSP）など。
4. **同一 DOI に複数の主張がぶつかっていても「どれかが正しい」とは限らない。**
   今回も全主張者が誤りのケースが複数あった。必ず DOI の実体を先に確定すること。

### 残り 100 件を進めるときの制約

**WebSearch がセッション共有で 200 回上限**、`WebFetch` と `curl` は
doi.org / Crossref / OpenAlex / 主要出版社すべてで egress ブロック。
つまり照合手段は実質 WebSearch のみで、これが律速になる。
並列エージェントを増やしても検索予算を食い合うだけなので、
**1 セッションあたり 30〜40 件が現実的な上限**。

手順は「DOI 接尾辞の完全一致検索（例: `"CBO9780511777141"`）→ 索引が返す
出版社ページの実体を証拠にする」。検索要約の主張を証拠にしないこと。

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
