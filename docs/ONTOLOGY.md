# Service Hub オントロジー (生成物)

> **このファイルは生成物です。手で編集しないでください。** `npm run ontology:md` が
> `src/shared/ontology/` の語彙と実物 (台帳・ゲート・両ビルドの action の面) から組み直します。
> `src/shared/__tests__/ontologyDoc.test.ts` が「committed == 再生成」と「本体との網羅」を検査し、
> `ontologyLaws.test.ts` / `ontologyFacets.test.ts` が語彙そのものを実物と突き合わせます。

オントロジーは 4 つの層から成る: **層とビルド** (どこで何が走るか)・**実体クラス** (何が在り、
その一覧はどこに在るか)・**サービスの facet 行列と公理** (facet 同士の整合)・**法則と執行者**
(320 パスで学んだ規則と、それを守っている機械)。「数は機械が、判断は散文が持つ」——
この文書には数と一覧だけを置き、判断は `docs/SESSION_HANDOFF.md` に書く。

## 1. 層とビルド

| 層 | 役割 | 信頼の上限 | import してよい層 | node / electron | 出荷されるビルド |
|---|---|---|---|---|---|
| `main` | Electron main | フル Node。IPC の受け口・secrets・OAuth・REST・shell。 | `main` `shared` | full | `desktop` |
| `preload` | Preload (contextIsolated bridge) | `window.serviceHub` を expose するだけ。node 組み込みは読まない。 | `preload` `shared` | electron-only | `desktop` |
| `renderer` | Renderer (React) | 表示と入力。Node API 不可・raw token は届かない・外へは bridge 経由。ブラウザ版では web-shim が main の役を引き受ける。 | `renderer` `shared` `preload` | none | `desktop` `browser-full` `browser-lite` |
| `shared` | Shared (判定・型・台帳) | 両ビルドが同じ実装を読む区画。renderer が読むので node / electron を持ち込めない。 | `shared` | none | `desktop` `browser-full` `browser-lite` |

| ビルド | 名前 | 層 | `window.serviceHub` の実体 | 備考 |
|---|---|---|---|---|
| `desktop` | Electron デスクトップ | `main` `preload` `renderer` `shared` | `ipcMain.handle (main.ts)` | 3 プロセス。secrets は OS のキーチェーン (safeStorage)。状態ファイルは userData。 |
| `browser-full` | ブラウザ単体 (standalone.html) | `renderer` `shared` | `web-shim.ts` | 単一 HTML。資格情報は WebCrypto の保管庫。学術コーパスを積む。 |
| `browser-lite` | ブラウザ単体 LITE (standalone-lite.html) | `renderer` `shared` | `web-shim.ts` | 学術コーパスを積まない以外は FULL と同じ。両方が同じだけ増えるのは共有モジュールだから。 |

import の許可表は `scripts/check-import-boundaries.cjs` の `ALLOW` と一致する (`ontologyFacets.test.ts` が留める)。

## 2. 実体クラスと台帳の在処

| クラス | 説明 | 一覧の在処 | 一覧を実物と突き合わせる機械 |
|---|---|---|---|
| `service` **サービス** | 76 の画面 / 連携。facet (配置・出所・資格情報・local・OAuth・action) は複数の台帳に分かれて宣言され、それぞれのゲートが導出と照合する。 | `src/shared/serviceId.ts`<br>`src/renderer/services.ts`<br>`src/shared/dataOrigin.ts`<br>`src/shared/credentialUse.ts`<br>`src/main/clients/index.ts`<br>`src/main/oauth.ts` | `scripts/lint-data-origin.cjs`<br>`scripts/lint-credential-use.cjs`<br>`scripts/lint-test-coverage.cjs`<br>`src/renderer/__tests__/sidebarCoverage.test.ts`<br>`src/__tests__/dualBuildActionSurface.test.ts` |
| `bridge-method` **bridge の口 (IPC チャンネル)** | `window.serviceHub` の口。preload の型・main のハンドラ・web-shim の枝が同じ集合であること。 | `src/preload/preload.ts`<br>`src/main/main.ts`<br>`src/renderer/web-shim.ts` | `scripts/lint-ipc-handlers.cjs`<br>`src/preload/__tests__/bridgeContract.test.ts`<br>`src/preload/__tests__/bridgeStatic.test.ts`<br>`src/renderer/__tests__/webShimBridge.test.ts` |
| `store` **保存先 (端末に残る物)** | ブラウザの IndexedDB / Cache Storage / localStorage / sessionStorage と、デスクトップの userData の状態ファイル。全行がハードリセットに覆われる。 | `scripts/lint-storage-ledger.cjs`<br>`src/shared/atRestInventory.ts`<br>`src/main/eraseAll.ts`<br>`docs/DATA_PROTECTION.md` | `scripts/lint-storage-ledger.cjs`<br>`src/renderer/__tests__/storageReadLedger.test.ts`<br>`src/main/__tests__/eraseAll.test.ts`<br>`src/main/__tests__/atRestPolicy.test.ts` |
| `egress-site` **外へ出る通信の口** | fetch の呼び出し 12 か所 (転送に追随しない)・送り先が変数の通信の台帳・素の fetch を握ってよい場所の台帳。 | `scripts/lint-network-targets.cjs`<br>`src/shared/httpLimits.ts`<br>`docs/ARCHITECTURE.md` | `scripts/lint-network-targets.cjs`<br>`scripts/lint-url-encoding.cjs`<br>`src/shared/__tests__/egressRedirectCensus.test.ts`<br>`src/shared/__tests__/bareFetchLedger.test.ts` |
| `url-door` **URL を外へ渡す扉** | OS で開く扉 (openExternal / 新窓)・アンカーの属性・`&lt;img src>`・OS の「開く」。すべて解析してから判定し、関門の返り値を使う。 | `src/shared/externalUrlGate.ts`<br>`src/shared/imageUrlGate.ts`<br>`src/main/shellOpenGate.ts` | `src/shared/__tests__/externalUrlGate.test.ts`<br>`src/shared/__tests__/imageUrlGate.test.ts`<br>`src/shared/__tests__/followableUrlCensus.test.ts`<br>`src/main/__tests__/exportSymlinkContainment.test.ts` |
| `surface` **文言が画面へ出る面** | 例外の文面・相手の本文・保存値の理由が画面へ届く行。伏字を通してから天井で切る。 | `src/shared/redact.ts`<br>`src/renderer/__tests__/errorMessageSurfaceCensus.test.ts` | `src/renderer/__tests__/errorMessageSurfaceCensus.test.ts`<br>`src/shared/__tests__/redactionCoverage.test.ts`<br>`src/shared/__tests__/ceilingLiteralCensus.test.ts`<br>`src/main/__tests__/rendererBoundMessages.test.ts` |
| `limit` **天井と床 (安全上限)** | 応答の byte・締切・本文の字数・入力の字数・鍵の長さ・状態ファイルの大きさ・PBKDF2 の反復。台帳 (parameters) には載せない。単位は文字。 | `src/shared/redact.ts`<br>`src/shared/httpLimits.ts`<br>`src/shared/inputCeiling.ts`<br>`src/shared/writeFieldLimits.ts`<br>`src/shared/assistantLimits.ts`<br>`src/shared/cryptoParams.ts`<br>`src/main/stateFile.ts` | `src/shared/__tests__/ceilingUnitCensus.test.ts`<br>`src/renderer/__tests__/ceilingUnitCensus.test.ts`<br>`src/renderer/__tests__/writeBodyCeilingCensus.test.ts`<br>`src/shared/__tests__/cryptoParams.test.ts`<br>`src/main/__tests__/stateFile.test.ts` |
| `parameter` **計算に使う固定の数字 (上書きできる)** | 法定値・参考値・しきい値。台帳に登録し、画面は `useParameters()` で読んで関数へ渡す。上書きすると画面が動くことを対照つきで留める。 | `src/shared/parameters.ts`<br>`src/shared/parameterConsistency.ts` | `scripts/lint-parameter-prose.cjs`<br>`src/shared/__tests__/parameters.test.ts`<br>`src/shared/__tests__/parameterConsistency.test.ts`<br>`src/shared/__tests__/parameterReachability.test.ts` |
| `knowledge-dataset` **確証済みの知識** | 学術 / 法務税務労務 / 補助金 / 相談窓口 / 経済史。出典つきで、vault・graph・orchestration の文脈の唯一の元。 | `src/renderer/data/academicKnowledge.ts`<br>`src/renderer/data/complianceKnowledge.ts`<br>`src/renderer/data/subsidyKnowledge.ts`<br>`src/renderer/data/counselorKnowledge.ts`<br>`src/renderer/data/economicHistoryKnowledge.ts` | `scripts/verify-knowledge-provenance.cjs`<br>`scripts/lint-citations.cjs`<br>`scripts/lint-doi-prefix.cjs`<br>`scripts/lint-knowledge-refs.cjs`<br>`scripts/build-knowledge-vault.cjs`<br>`scripts/verify-graph.cjs` |
| `gate` **ゲート (verify:all)** | `npm run verify:all` の連鎖。全部が ci.yml に在り、自作の物は `--self-test` を持つ。 | `package.json`<br>`.github/workflows/ci.yml` | `scripts/cross-doc-consistency.cjs`<br>`src/shared/__tests__/ontologyLaws.test.ts` |
| `census` **census (母集団を数える検査)** | 走査で母集団を数え、台帳と両方向に突き合わせる vitest。標本と対照を持つ。 | `src/shared/__tests__/absenceSampleCensus.test.ts` | `src/shared/__tests__/absenceSampleCensus.test.ts` |
| `protected-file` **整合性チェーンの保護対象** | 守りを決めるファイルの封緘。保護対象が読む先も 1 段は保護か除外台帳に在る。 | `scripts/integrity-chain.cjs`<br>`security/integrity-chain.json` | `scripts/integrity-chain.cjs`<br>`src/shared/__tests__/integrityChainWitness.test.ts`<br>`scripts/lint-mutation-scope.cjs` |
| `harness` **実機の harness** | 実ブラウザ / 実 Electron でしか見えない物 (CORS・no-cors・起動・性能)。suite ごとの床。CI では label / dispatch で走る。 | `scripts/e2e/core.cjs`<br>`.github/workflows/e2e.yml` | `src/shared/__tests__/e2eSuiteFloors.test.ts`<br>`src/shared/__tests__/artifactFreshness.test.ts` |
| `document` **文書** | ARCHITECTURE の file:line と live metric・CLAUDE.md の数・REMAINING_WORK の生成ブロック。散文で述べた規則は落ちないので、数は機械が持つ。 | `docs/ARCHITECTURE.md`<br>`CLAUDE.md`<br>`docs/SESSION_HANDOFF.md`<br>`docs/REMAINING_WORK.md`<br>`docs/ONTOLOGY.md` | `scripts/verify-architecture.cjs`<br>`scripts/cross-doc-consistency.cjs`<br>`src/shared/__tests__/ontologyDoc.test.ts` |
| `workflow` **CI の workflow** | permissions 明示・第三者 action の SHA 固定・pull_request_target 禁止。週次の依存監査は常設 Issue 1 つ。 | `.github/workflows/ci.yml`<br>`.github/workflows/e2e.yml`<br>`.github/workflows/dependency-audit.yml`<br>`.github/workflows/release.yml` | `scripts/lint-workflow-security.cjs`<br>`src/shared/__tests__/workflowSecurityWitness.test.ts`<br>`src/shared/__tests__/dependencyAuditWorkflow.test.ts` |

## 3. サービスの facet 行列 (76)

| id | 配置 | 出所 | 資格情報 | local | OAuth | 士業 | デスクトップの action | ブラウザ版の action | デスクトップだけ |
|---|---|---|---|:---:|:---:|:---:|---|---|---|
| `a8net` | integrations | sample | none | ✅ |  |  | — | — | — |
| `admin-scrivener` | professionals | sample | none | ✅ |  | ✅ | — | — | — |
| `ai-blogkun` | integrations | sample | none | ✅ |  |  | — | — | — |
| `amazon` | integrations | sample | none | ✅ |  |  | — | — | — |
| `amazon-associates` | integrations | sample | none | ✅ |  |  | — | — | — |
| `asana` | integrations | sample | none |  |  |  | — | — | — |
| `assistant` | featured | local | action | ✅ |  |  | `chat` `chatAll` `providers` | `chat` `chatAll` `providers` | — |
| `atlassian` | integrations | remote | fetch |  | ✅ |  | `create-issue` | `create-issue` | — |
| `base` | integrations | remote | fetch |  |  |  | — | — | — |
| `business` | featured | local | action | ✅ |  |  | `advise` `export-dashboard` `export-dashboard-md` | `advise` `export-dashboard` `export-dashboard-md` | — |
| `calendar` | integrations | remote | fetch |  | ✅ |  | `create-event` | `create-event` | — |
| `canva` | integrations | remote | fetch |  | ✅ |  | `create-folder` | `create-folder` | — |
| `charts` | tools | sample | none | ✅ |  |  | — | — | — |
| `cloudflare` | tools | remote | fetch |  |  |  | `create-dns-record` `purge-cache` | `create-dns-record` `purge-cache` | — |
| `coconala` | integrations | sample | none | ✅ |  |  | — | — | — |
| `compliance` | tools | sample | none | ✅ |  |  | — | — | — |
| `connectors` | tools | sample | none | ✅ |  |  | — | — | — |
| `cpa` | professionals | sample | none | ✅ |  | ✅ | — | — | — |
| `cursor` | integrations | remote | fetch |  |  |  | — | — | — |
| `demae-can` | consumed | sample | none | ✅ |  |  | `advise` `record-entry` | `advise` `record-entry` | — |
| `discord` | integrations | sample | none |  |  |  | — | — | — |
| `docker` | tools | sample | none | ✅ |  |  | — | — | — |
| `docstudio` | featured | local | none | ✅ |  |  | `list-collections` | — | `list-collections` |
| `drive` | integrations | remote | fetch |  | ✅ |  | `create-folder` | `create-folder` | — |
| `dropbox` | integrations | sample | none |  |  |  | — | — | — |
| `emotions` | tools | local | action | ✅ |  |  | `analyze-text` `clear-history` `log-mood` | `analyze-text` `clear-history` `log-mood` | — |
| `freee` | integrations | remote | fetch |  | ✅ |  | — | — | — |
| `funding` | tools | local | none | ✅ |  |  | — | — | — |
| `github` | integrations | remote | fetch |  |  |  | `create-issue` | `create-issue` | — |
| `gmail` | integrations | remote | fetch |  | ✅ |  | `create-draft` | `create-draft` | — |
| `home` | featured | local | none | ✅ |  |  | — | — | — |
| `hydroponics` | tools | local | none | ✅ |  |  | — | — | — |
| `judicial-scrivener` | professionals | sample | none | ✅ |  | ✅ | — | — | — |
| `kpi` | tools | local | none | ✅ |  |  | — | — | — |
| `labor-consultant` | professionals | sample | none | ✅ |  | ✅ | — | — | — |
| `lawyer` | professionals | sample | none | ✅ |  | ✅ | — | — | — |
| `library` | featured | local | none | ✅ |  |  | — | — | — |
| `line` | integrations | sample | none |  |  |  | — | — | — |
| `linear` | integrations | sample | none |  |  |  | — | — | — |
| `linux` | tools | local | none | ✅ |  |  | — | — | — |
| `microsoft-365` | integrations | remote | fetch |  | ✅ |  | `create-event` `send-mail` | `create-event` `send-mail` | — |
| `moneyforward` | integrations | sample | none | ✅ |  |  | — | — | — |
| `mutual-funds` | tools | sample | none | ✅ |  |  | `advise` `record-entry` | `advise` `record-entry` | — |
| `netsea` | integrations | sample | none | ✅ |  |  | — | — | — |
| `notion` | integrations | remote | fetch |  | ✅ |  | `create-page` | `create-page` | — |
| `obsidian` | tools | sample | none | ✅ |  |  | — | — | — |
| `ollama` | tools | local | none | ✅ |  |  | `chat` | `chat` | — |
| `overview` | featured | sample | none | ✅ |  |  | — | — | — |
| `patent-attorney` | professionals | sample | none | ✅ |  | ✅ | — | — | — |
| `quality` | tools | sample | none | ✅ |  |  | — | — | — |
| `real-estate` | tools | sample | none | ✅ |  |  | `advise` `record-entry` | `advise` `record-entry` | — |
| `sales` | featured | sample | none | ✅ |  |  | — | — | — |
| `salesforce` | integrations | sample | none |  |  |  | — | — | — |
| `security` | tools | local | action | ✅ |  |  | `check-email-breach` `scan-url` | `check-email-breach` `scan-url` | — |
| `sentry` | integrations | sample | none |  |  |  | — | — | — |
| `settings` | featured | local | none | ✅ |  |  | — | — | — |
| `shopify` | integrations | sample | action |  |  |  | `sync-to-discord` `sync-to-gmail` `sync-to-line` `sync-to-notion` `sync-to-salesforce` `sync-to-slack` `sync-to-stripe` | — | `sync-to-discord` `sync-to-gmail` `sync-to-line` `sync-to-notion` `sync-to-salesforce` `sync-to-slack` `sync-to-stripe` |
| `skills` | tools | local | action | ✅ |  |  | `run-skill` | — | `run-skill` |
| `slack` | integrations | remote | fetch |  | ✅ |  | `send-message` | `send-message` | — |
| `sme-consultant` | professionals | sample | none | ✅ |  | ✅ | — | — | — |
| `stocks` | tools | local | action | ✅ |  |  | `advise` `backtest` `compare-strategies` `export-dashboard` `export-dashboard-md` `register-ticker` `unregister-ticker` | `advise` `compare-strategies` `export-dashboard` `export-dashboard-md` `register-ticker` `unregister-ticker` | `backtest` |
| `storage` | tools | sample | none | ✅ |  |  | — | — | — |
| `stripe` | integrations | sample | none |  |  |  | — | — | — |
| `super-delivery` | integrations | sample | none | ✅ |  |  | — | — | — |
| `talent` | tools | local | none | ✅ |  |  | `judge-leader` `save-state` | `judge-leader` `save-state` | — |
| `tax` | tools | sample | none | ✅ |  |  | — | — | — |
| `tax-accountant` | professionals | sample | none | ✅ |  | ✅ | — | — | — |
| `team` | featured | sample | none | ✅ |  |  | — | — | — |
| `teamradar` | featured | local | action | ✅ |  |  | `export-svg` `save-state` | `export-svg` `save-state` | — |
| `templates` | featured | local | none | ✅ |  |  | `export-template` | `export-template` | — |
| `tiktok` | integrations | sample | none | ✅ |  |  | — | — | — |
| `topseller` | integrations | sample | none | ✅ |  |  | — | — | — |
| `uber-eats` | consumed | sample | none | ✅ |  |  | `advise` `record-entry` | `advise` `record-entry` | — |
| `village` | featured | local | none | ✅ |  |  | — | — | — |
| `wordpress` | integrations | remote | fetch |  | ✅ |  | `create-post-draft` | `create-post-draft` | — |
| `youtube` | integrations | remote | fetch |  |  |  | — | — | — |

集計:

- 配置: おすすめ 12 / 士業連携 8 / 分析・ツール 21 / 外部サービス連携 33 / 消費されるだけ 2
- 出所: remote 15 / local 19 / sample 42
- 資格情報の読み手 — fetch 15 / action 8 / none 53
- LOCAL_SERVICES 52 / OAuth 10 / action を持つ 27 / デスクトップだけの action 10

## 4. facet の公理と例外

| 公理 | 述べていること | 理由つきの例外 |
|---|---|---|
| `remote-reads-credential` | 出所が remote なら、取得は資格情報を読む (credentialUse が fetch)。 | — |
| `fetch-credential-means-remote` | 取得が資格情報を読む (fetch) なら、出所は remote である。 | — |
| `action-credential-has-desktop-action` | 資格情報を書き込みだけが読む (action) なら、デスクトップ版に action が登録されている。 | — |
| `oauth-token-is-read` | OAuth を設定するサービスは、そのトークンをどこかで読む (credentialUse ≠ none)。 | — |
| `local-never-remote` | LOCAL_SERVICES に載るサービスの出所は remote ではない。 | — |
| `professional-placement` | 士業 8 種はサイドバーの「士業連携」に在り、「士業連携」に在るのは士業だけ。 | — |
| `consumed-is-not-remote` | 他の画面の中で消費されるだけのサービスは、資格情報で外へ取りに行かない。 | — |
| `browser-actions-subset` | ブラウザ版が実行できる action は、デスクトップ版の許可表の部分集合。 | — |
| `desktop-only-is-the-difference` | デスクトップ版に在ってブラウザ版に無い action は、種類つきの台帳 (DESKTOP_ONLY) にちょうど載っている。 | — |
| `actions-need-reader-or-local` | action を持つサービスは、資格情報を読むか local である (どちらでもない書き込みは行き先が無い)。 | — |

## 5. 法則と執行者 (91)

各法則は「何を守るか」「どのパス / パターンで学んだか」「何がそれを守っているか」を持つ。
執行者が**散文だけ**の法則は次の節に集める —— 散文で述べた規則は落ちない。

### ゲートそのものの規律 (23)

| id | 法則 | 出典 | 執行者 |
|---|---|---|---|
| `manual-check-becomes-gate` | **手でやった検査はその場でゲートにする** — 「私が今やった手作業を、次のセッションの誰かが思い出せるか」— 思い出せないならゲートにする。ゲートを作ったら負の対照 (違反を仕込んで落ちる・正常を誤検出しない・直ったのに台帳に残っていれば落ちる) を取る。 | パターン 0 | 散文だけ `docs/SESSION_HANDOFF.md` — 「手でやった」は機械に映らない。作ったゲートが CI に在ることは gate-runs-in-ci が、自作ゲートが対照を持つことは negative-control が見る |
| `scan-whole-tree` | **走査範囲は木全体、例外は台帳** — 「対象を絞る」と「対象を忘れる」はコードの上で見分けがつかない。走査は木全体にし、外す物を理由つきの台帳に書く。台帳を書いたら「どこまで歩いたか」「注記の規則を判定が実装しているか」「対照は判定関数そのものへ標本を通しているか」を問う。外した側をどう台帳にするかは `outside-scope-gets-its-own-census`。 | パターン 0-a / パターン 0-a-24 | ゲート `npm run lint:network-targets`<br>ゲート `npm run lint:forbidden`<br>検査 `src/shared/__tests__/bareFetchLedger.test.ts` |
| `outside-scope-gets-its-own-census` | **走査の外は、広げれば見えるとは限らない** — 走査範囲を絞ったら、外した側の母集団を一度数える。広げれば見えると決めてはいけない —— 外の母集団は書き方の前提が違うので、同じ検出器を当てると偽陽性で埋まり、本当に危ない物は元の検出器の設計上の除外（例: 素の識別子の送り先）に隠れたままになる。外が小さいなら「危ない構文か」を問うのをやめ、**全件**を守りつきで台帳に載せる。 | パス 342 / パターン 0-a / パス 364 (lint:storage の外は 8 本・保存は 3 本) | ゲート `npm run lint:network-targets`<br>検査 `src/shared/__tests__/networkTargetWitness.test.ts`<br>検査 `src/shared/__tests__/distributedArtifactStorage.test.ts` |
| `gate-runs-in-ci` | **検査が走る場所が CI に在る** — verify:all の全ゲートが ci.yml に在る。「これで強制される」と書いた検査は、CI のどのステップで走るかを確かめる。走らないなら vitest ゲートへ移す。 | パターン 0-a-11 / パターン 0-c | ゲート `npm run lint:docs` |
| `negative-control` | **ゲートは守りを外して確かめる** — 自作のゲートは --self-test (陽性・陰性の対照) を持ち、verify:all がそれを走らせる。--self-test の「鳴る側」は作った本人の想像なので、守るはずの実物を一度壊して鳴らす。 | パターン 0 / パターン 0-a-15 | 検査 `src/shared/__tests__/ontologyLaws.test.ts` |
| `count-has-floor` | **件数を出す検査は床を持つ** — 「Checked 0 … ✅」は走査が壊れても緑。ゲートは件数に下限を置き、検査は「全件について〜」の前に非空を主張する。台帳にせず命名規約 (VERIFIED_*) で絞る。 | パターン 0-a-7 | ゲート `npm run lint:test-coverage`<br>検査 `src/shared/__tests__/e2eSuiteFloors.test.ts`<br>ゲート `npm run lint:deps` |
| `table-pinned-by-literal` | **表を留める検査は表を読まない** — 留める対象を読んで回る検査は、対象が変われば一緒に変わる。何が入っているかと何が入っていないかを字面で書く。モジュール定数は vi.resetModules + 動的 import で留める。 | パターン 0-a-9 / パターン 0-a-5 | 実機 `npm run mutate`<br>散文だけ `docs/SESSION_HANDOFF.md` — 「表を読んで回っている」形は変異検査 (Stryker) が生存として映すが、CI の毎回では走らない (週次)。字面かどうかを静的に数える網は無い |
| `unique-anchor-for-refs` | **参照には一意な錨を前置する** — file:line の参照は、直前のバッククォート付き識別子が引用位置の ±15 行に居ることを見る。錨が無い参照は行番号がファイルに収まる限り永久に通る。錨は一意でなければ意味が無い。 | パターン 0-a-3 / パス 292 | ゲート `npm run verify:arch` |
| `mention-vs-declaration` | **言及と宣言を見分ける** — 名前が「在るか」で照合する検査は、コメントや文字列の中の言及で満たされる。宣言の出現には「コメント行でない・引用符の外」を要求する。 | パス 292 / パス 289 / パス 291 | ゲート `npm run verify:arch` |
| `general-form-not-one-file` | **不変条件は一般形で守る** — ファイル名で書かれた不変条件はそのファイルしか守られない。文面から一般形を取り出し、その形をする場所を全部洗う (「Skill name」→ 変数をパスに畳む箇所、「Gmail の to」→ CR/LF で join する箇所)。 | パターン 0-a-4 | ゲート `npm run lint:url-encoding`<br>ゲート `npm run lint:ipc-handlers`<br>ゲート `npm run lint:forbidden` |
| `generated-plus-coverage` | **生成物 == 再計算 だけでは足りない** — 「committed と再計算が一致する」は成果物が古いことしか捕まえない。計算が壊れても再生成すれば通る。生成物の検査には本体データとの網羅を必ず足し、数は決め打ちせず欠ける理由を検査する。 | パターン 0-a-5 / パターン 0-a-6 | ゲート `npm run vault:check`<br>ゲート `npm run verify:graph`<br>検査 `src/shared/__tests__/ontologyDoc.test.ts` |
| `live-metrics-not-prose` | **数は機械が、判断は散文が持つ** — 散文に書いた件数は誰も検算せず腐る (母集団が 4 倍ずれていた実測)。数える物は生成ブロックか live metric にし、判断だけを散文に書く。**閉じた列挙 (「only …」「全 N 件」) も同じ** —— 成員を並べたら、その並びと実物を機械で結ぶ。CLAUDE.md は preload bridge を「it only calls」で 6 件挙げていたが実物は 15 件で、落ちていた 9 件に eraseAll (全データ削除) と openPath が在った (パス 338)。攻撃面の側では、過小申告が読み手を油断させる。 | パス 145 / パス 220 / パス 248 / パス 338 | ゲート `npm run verify:arch`<br>ゲート `npm run lint:zero-fold`<br>ゲート `npm run lint:shared-judgement`<br>ゲート `npm run lint:docs`<br>検査 `src/preload/__tests__/bridgeStatic.test.ts` |
| `one-way-match-hides-the-other` | **片方向の照合は、もう片方を隠す** — ゲートが同じ母集団について 2 つの数を刷るなら (走査 27 / 表 30)、その差は読まれないまま残る —— 差は理由つきの台帳にして両方向に鳴らす。パス 340 の実測: egress マトリクスの差 4 件のうち 3 件は **AI 提供者の既定の送り先** (`defaultBaseUrl`) で、送信文脈の針の死角だった。対照で確認 —— `api.openai.com` を別のホストに書き換えても verify:arch は緑のまま通り、**提供者を 1 つ足すだけで利用者のプロンプトと API キーの送り先が台帳の外へ出られた**。 | パス 340 | ゲート `npm run verify:arch`<br>検査 `src/shared/__tests__/egressMatrixReverse.test.ts` |
| `exclusion-states-the-real-reason` | **外した物の理由は、実際に守っている理由で書く** — 門が何かを意図して外すとき、その理由は次の判断の材料になる。結論が正しくても premise が偽なら、次に足す物の評価がそこから外れる。lint:regex は多項式を「入力上限が 5000 だから O(n²) でも 30ms」で外していたが、実物の最大は 200,000 (MAX_TEXT_PREVIEW_CHARS) で 1 呼び出し 31 秒だった —— 守っていたのは長さではなく到達可能性 (その式に長い入力が来ない) である。理由に数を書くなら、その数が実物の最大であることを機械で留める。 | パス 337 | 検査 `src/shared/__tests__/regexPolynomialLedger.test.ts`<br>実機 `npm run audit:regex-poly` |
| `measure-before-claim` | **危なそうで報告しない — 実測してから言う** — 受け口が危なく見えても、その受け口が実際に何を拒むかを実行して確かめる。深刻度を上げる方にも下げる方にも効く (Headers が CR/LF を投げるので注入は成立しない、など)。**道具の報告も測る対象である** —— 変異検査が「生存」と言う変異体は、当てられなかっただけで検査が鳴らないことを意味しない場合がある。2026-09-20 実測: ad-hoc の `--mutate` で報告された生存 **61 件のうち 58 件が偽** (パス 353 の 13・355 の 13・356 の 3・357 の 35 が偽。本物はパス 355 の `join("")` 3 件だけ)。**誤りの向きは決まっている** —— 偽の生存は点数を**低く**見せるので、公開している score を脅かすのではなく「次にどこへ検査を書くか」の判断を歪める。**訂正は写しの数だけ要る** —— 測って偽と分かった主張は、**その主張が書かれている全部の場所**で撤回する。2026-08-23 に「渡ってくる名前は利用者入力ではないためこれは多層防御」を偽と測り `shared/safeFilename.ts` では撤回したが、**同じ文の写しが `renderer/fs/fsa.ts` に残り、2026-09-21 (パス 362) まで誰も直さなかった** —— 撤回が 2 部のうち 1 部にしか届かず、関門の隣に**既に否定された前提**が立っていた。こういう事実は散文の綴りではなく**振る舞い**で留める (「その文が無いこと」の検査は言い換えられた瞬間に黙る)。 | パターン 0-a-8 / パス 300 / パス 356 / パス 362 (訂正が写しの片方にしか届いていなかった) | 実機 `npm run audit:survivors`<br>検査 `src/shared/__tests__/verifySurvivors.test.ts`<br>検査 `src/renderer/fs/__tests__/folderMirrorUserInput.test.ts`<br>散文だけ `docs/SESSION_HANDOFF.md` — 「言う前に測ったか」は機械に映らない。実測は各パスの記録が持つ —— ただし変異検査の報告については `npm run audit:survivors` が当て直して答える |
| `pragma-directly-above` | **Stryker の pragma は対象行の直上に** — `disable next-line` は間に何か入ると無言で外れ、緩む方向にしか壊れない。理由の無い pragma は測っていない範囲を 100% として報告する。広い disable と無言の pragma は台帳。 | パターン 0-a-13 / パス 1220 付近の REMAINING_WORK | ゲート `npm run lint:mutation-scope` |
| `claim-unit-not-file` | **主張の単位で見る** — 「ファイルのどこかに但し書きが在るか」で判定する検査は同居で無効化される。その断言そのものが無いこと (名指し) と、正しい形が使われていることの両方を見る。 | パターン 0-a-17 | 散文だけ `docs/SESSION_HANDOFF.md` — 検査の書き方の規律。個々の検査が守っているかを機械で見る形は無い (absence-needs-sample が「不在の主張」側だけを数える) |
| `absence-needs-sample` | **不在を主張する検査には標本を添える** — `not.toMatch` は綴りが 1 つ違えば黙る。規則が実際にその文面へ当たることを同じ検査の中で標本に対して確かめる。正規表現の針で綴りを肯定形で確かめていない物は台帳制。 | CLAUDE.md 規約 (2026-08-25) / パス 293 | 検査 `src/shared/__tests__/absenceSampleCensus.test.ts` |
| `records-carry-date` | **記録は測った日を持つ** — 日付の無い安全の主張・件数・余裕は黙って古くなる。脆弱性台帳には照合日と期限、出荷物の計測には「パス N 後」、導出値には測った日。 | パス 141 / パス 290 (CLAUDE.md の LITE の余裕) | ゲート `npm run lint:rate-freshness`<br>ゲート `npm run lint:docs` |
| `artifact-freshness` | **成果物は材料より新しい** — 実機の harness は古い成果物を黙って相手にしない。材料 (src・vite.config・inline-html・tsconfig・package・束に入る JSON) より成果物が古ければ exit 2。母集団は package.json から導く。 | パス 302 / パス 304 / パス 305 | 検査 `src/shared/__tests__/artifactFreshness.test.ts`<br>実機 `npm run perf`<br>実機 `npm run e2e`<br>実機 `npm run smoke:app` |
| `harness-floor-per-suite` | **実機の床は suite ごと** — 「合計 0 件で落とす」だけでは suite が黙って縮んでも緑。suite ごとに床 (実測の 85%) と全 suite 時の合計の床を持つ。`ok(true, …)` は直前の文が投げる wait でしか許さない。 | パス 303 | 検査 `src/shared/__tests__/e2eSuiteFloors.test.ts`<br>実機 `npm run e2e` |
| `typecheck-covers-all-ts` | **.ts は全部 tsc の網の中** — eslint は型を見ない。tsconfig の include の外の .ts は 1 行も検査されず、走っている検査の中で undefined を読んでも通る。覆われていない .ts が出れば落ち、exclude が生えれば「教えろ」と落ちる。 | パス 278 | 検査 `src/shared/__tests__/typecheckCoverage.test.ts`<br>ゲート `npm run typecheck` |
| `charset-enumerated` | **文字種は列挙・制御文字は 4 群** — 簡体字は CJK 統合漢字に同居するので範囲走査では拾えず、字を列挙する。双方向制御 (Trojan Source) と不可視文字は攻撃手法なので落とす。正当な出現は件数と理由つきで台帳。 | パターン 0-b / パス 255 / パス 279 | ゲート `npm run lint:charset` |

### 規則は 1 つ (8)

| id | 法則 | 出典 | 執行者 |
|---|---|---|---|
| `one-rule-in-shared` | **判定は shared に 1 つ** — 読んだ後に何を計算するかは src/shared/ に 1 つだけ置き、保存先だけがビルドで違う形にする。写しは消す。述語を共有したら「no と言われたあとの動作」も両ビルドで揃うか読む (母集団は生成物)。 | パターン 0-a-22 / パス 247 / パス 248 / パス 268 / パス 309 | ゲート `npm run lint:shared-judgement`<br>検査 `src/shared/__tests__/dualBuildDecisions.test.ts`<br>検査 `src/shared/__tests__/talentParity.test.ts` |
| `copy-pinned-by-parity` | **写しが避けられないなら、ずれを検査で留める** — プロセス境界のせいで 2 つ要る実装は「同じ入力から同じ出力」「拒否する入力が一致」をパリティ検査で固定する。**母集団の針が狭いと、写しが在るのに映らない** —— 2026-09-20 まで `^export function` だけを見ており、`async function` と `const` が 1 つも映っていなかった (13 → 22 件)。**写しは `.ts` の外にも在る** —— 母体 (OS / ブラウザの枠) へ伝える下地色は出どころが `styles.css` の `--bg` 1 つなのに写しが 5 つ在り、機械が縛っていたのは 1 つだけだった。縛られていない 3 つのうち 2 つがその場で誤っており、`assets/manifest.webmanifest` の `theme_color` / `background_color` は **`--bg` がどの版でも取ったことのない値**だった (パス 363)。パリティ検査が `.ts` しか見ないと、webmanifest・ビルド script・生成 HTML に載った写しは永久に映らない。畳めるなら畳んで同一性を主張するほうが強い (パリティは標本の外で割れうる)。 | パターン 0-a-4 / パターン 0-a-14 / パス 331 / パス 363 (写しは .ts の外にも在る) | 検査 `src/shared/__tests__/dualBuildDecisions.test.ts`<br>検査 `src/main/__tests__/stateEqualsParity.test.ts`<br>検査 `src/shared/__tests__/stocksConstantsParity.test.ts`<br>検査 `src/renderer/__tests__/webShimSnapshotParity.test.ts`<br>検査 `src/shared/__tests__/advisorQuestionParity.test.ts`<br>検査 `src/shared/__tests__/hostChromeColorCensus.test.ts` |
| `same-question-before-parity` | **同じ問いに答えているか確かめてから揃える** — 同名の判定が 3 つ在っても、3 つとも違ってよいことがある (ループバック判定)。統合は狭い側を広い側へ寄せる方向にしか働かない。違うなら違いのほうを検査で留め、コードにも寄せない理由を書く。 | パターン 0-a-14 | 検査 `src/shared/__tests__/loopbackChecks.test.ts` |
| `parity-is-not-correctness` | **パリティは両方に在る穴を見つけない** — 一致は正しさではない。パリティを取った組は、そのあと 1 つの実装として正しいかを別に見る。送り先・パス・header に入る判断は実際の攻撃形を食わせて測る。 | パターン 0-a-16 | 散文だけ `docs/SESSION_HANDOFF.md` — 「一致した 2 つが両方とも間違っている」は定義上パリティに映らない。攻撃形を食わせる検査は組ごとに書く |
| `fold-must-pair` | **「必ず併用する」と書いた対は畳む** — 「A を使うときは B も呼べ」と書きたくなったら B を A の中へ畳む。畳めないときだけ注記 + 台帳。実測: 7 か所のうち併用していたのは 2 か所だった。 | パターン 0-a-23 | 検査 `src/shared/__tests__/ontologyLaws.test.ts` |
| `checked-equals-used` | **調べた物と使う物を同じにする** — 関門が通した値ではなく元の文字列を使うと、調べた物と使われる物が別になる (URL の字面一致 vs 解析後・1 ホップ目 vs 転送先・アンカーの属性 vs クリックの handler)。関門の返り値を使う。 | パス 291 / パス 298 / パス 299 / パス 301 / パス 325 (母集団の機械) | 検査 `src/shared/__tests__/parsedUrlGateCensus.test.ts`<br>検査 `src/shared/__tests__/externalUrlGate.test.ts`<br>検査 `src/shared/__tests__/imageUrlGate.test.ts`<br>検査 `src/shared/__tests__/followableUrlCensus.test.ts`<br>検査 `src/shared/__tests__/egressRedirectCensus.test.ts` |
| `center-then-count-callers` | **中心へ寄せたら呼び出し側から数え直す** — 守りを 1 か所へ寄せても、その口を使っていない経路は守られない。「その関数を使っている場所」ではなく「同じことをしている場所」を実測で数え、迂回してよいファイルを台帳で固定する。**関門の docblock が消費者を数え上げていても数え直す** —— `safeFilename` は自分を「アプリ全体で 1 つだけ持つ」と名乗り消費者 2 つ (`library.put` / `writeBlobToFolder`・どちらも保管層) を名指ししていたが、名前を決める出口は 3 種類目が在った (`a.download` 10 か所)。**書く側が検めた欄を読む側が検め直しているか**も同じ形で、`metaFromStored` は 3 欄を `typeof === string` だけで通し、`put()` が拒む 9 形が 9/9 素通りしていた (パス 359)。 | パターン 0-a-18 / パス 311 / パス 359 / パス 360 (同じファイルの 57 行差で同じ問いが 2 通りに答えられていた) | 検査 `src/shared/__tests__/bareFetchLedger.test.ts`<br>検査 `src/shared/__tests__/egressRedirectCensus.test.ts`<br>検査 `src/shared/__tests__/jsonBodyCensus.test.ts`<br>検査 `src/renderer/__tests__/downloadFilenameCensus.test.ts` |
| `no-weakness-as-spec` | **弱さを仕様として書き留めない** — 検査の題名が「前置き一致なので弾く側」「Never throws」と弱さに名前を与えると、落ちる検査が無くなり読んで気付くしかない。**「揃えることを要求しない」「分かる人が決めること」と書いた保留も同じ** —— 理由の欄が埋まるので検査は通り続け、実測で 1 か月近く誰も決めなかった。弱さは閉じるか、`docs/REMAINING_WORK.md` に「閉じていない物」として書く (台帳は片付いた物の説明を置く所)。 | パス 291 / パス 309 / パス 336 | 検査 `src/shared/__tests__/dualBuildDecisions.test.ts`<br>散文だけ `docs/SESSION_HANDOFF.md` — 題名の意味は機械に映らない。機械が在るのは両ビルド台帳の理由の欄だけ (保留の決まり文句を落とす) で、検査の題名そのものは各パスの「閉じていない物」の節が持つ |

### 境界と信頼 (19)

| id | 法則 | 出典 | 執行者 |
|---|---|---|---|
| `distributed-code-same-gates` | **配るコードも自分の門を通す** — 「これを貼って deploy してください」と文書に載せたコードは、動くのが利用者の環境でも**設計はこちらの責任**である。自分の src に掛けている門 —— 応答本文の上限・転送の各ホップの再検査・宛先の関門 —— を、配るコードにも同じだけ掛ける。両者が「同じ」であることを文で書かない: 文は書いた瞬間から離れていくので、実物どうしをテストで結ぶ(文書からコードを切り出して読み込み、同じ標本を当てる)。 | パス 343 / パス 300 | 検査 `src/renderer/network/__tests__/proxyWorkerParity.test.ts` |
| `zone-imports` | **層の import 境界** — renderer は main / electron / node 組み込みを読まない。shared も同じ (renderer が読む区画)。preload は electron と shared だけ。main は renderer を読まない。相対パスの実行時 require も見る。 | 不変条件 #1 / 不変条件 #14 / パターン 0-a | ゲート `npm run lint:imports`<br>検査 `src/shared/__tests__/ontologyLaws.test.ts` |
| `bridge-is-the-only-door` | **main への口は window.serviceHub だけ** — レンダラーへ Node API を通す設定・contextIsolation と sandbox と webSecurity を外す設定・文字列を code として評価する口・HTML を文字列で流し込む口を書かない (lint:forbidden の 38 種)。Node が要るものは preload bridge を広げる。 | 不変条件 #1 / 不変条件 #9 / CLAUDE.md Conventions | ゲート `npm run lint:forbidden`<br>検査 `src/main/__tests__/mainWindow.test.ts`<br>整合性チェーン (`scripts/integrity-chain.cjs`) |
| `renderer-never-sees-raw-token` | **renderer に raw token は届かない** — secrets:list は ID だけを返す。外へ出る値に載る文言は全部 safeErrorMessage → redactSecrets を通る (数える単位はハンドラではなく「外へ出る値に載る文言」)。 | 不変条件 #2 / 不変条件 #4 / ARCHITECTURE §4.4 統一原則 1 | 検査 `src/main/__tests__/rendererBoundMessages.test.ts`<br>検査 `src/preload/__tests__/bridgeContract.test.ts`<br>検査 `src/main/__tests__/property.test.ts` |
| `ipc-validates-service-id` | **IPC で受けた serviceId は indexing 前に検証する** — 各ハンドラが isServiceId を呼んでいるか (isServiceId 自体の検査ではなく)。prototype の鍵は Object.hasOwn で落とす。ハンドラは try の外で await しない (包含で見る)。 | 不変条件 #3 / パターン 0-a-4 / パターン 0-a-15 / パス 235 | ゲート `npm run lint:ipc-handlers`<br>検査 `src/shared/__tests__/serviceId.test.ts` |
| `bridge-floor-never-rejects` | **invoke / fetchSnapshot は reject しない** — 画面は「失敗しても reject しない」を約束として try の外で await する。床 (safeErrorMessage で { ok: false } に畳む) は両ビルドとも外側 1 か所に置く。枝の中の try の写しで守らない。 | パス 312 / ARCHITECTURE §1.5 | ゲート `npm run lint:ipc-handlers`<br>検査 `src/renderer/__tests__/webShimInvokeNeverRejects.test.ts` |
| `permissions-default-deny` | **ブラウザ権限は既定で拒否** — Electron の既定は全部承認。許すのはクリップボードの 2 つだけ。 | 不変条件 #15 | 検査 `src/main/__tests__/mainWindow.test.ts`<br>整合性チェーン (`scripts/integrity-chain.cjs`) |
| `csp-pinned` | **CSP は実物で留める** — default-src self・外部フォントを読まない・connect-src は dev の HMR だけ。雛形側は検査で、出荷 HTML は注入後の公開ファイルにゲートを当てる。 | ARCHITECTURE §1.3 / パス 149 | ゲート `npm run lint:csp`<br>検査 `src/shared/__tests__/shippedCsp.test.ts` |
| `external-url-one-gate` | **外部 URL を OS へ渡す扉は同じ関門を通る** — app:openExternal と新窓ハンドラ、加えてプラットフォームが自分で辿る出口 (アンカーの属性) も http(s) 限定の同じ関門を通り、属性には関門の返り値を置く。 | 不変条件 #5 / パス 298 | 検査 `src/shared/__tests__/externalUrlGate.test.ts`<br>検査 `src/shared/__tests__/followableUrlCensus.test.ts`<br>ゲート `npm run lint:forbidden` |
| `image-url-parsed-and-private-refused` | **第三者由来の画像 URL は解析し、内側の送り先を拒む** — &lt;img src> は読めなくても GET は利用者の網の内側へ飛ぶ。第三者 API の応答の URL は解析してから判定し、private / reserved を拒む。利用者自身の背景画像は別の段 (LAN の NAS は正当)。 | パス 299 / パス 300 | 検査 `src/shared/__tests__/imageUrlGate.test.ts` |
| `shell-open-gate` | **OS の「開く」は書き出し根の内側 + 拡張子 allowlist** — realpath で symlink を辿ってから閉じ込めを見る。字面の閉じ込めは symlink を見ない。 | ARCHITECTURE §1.4 app:openPath / パス 0-a-2 | 検査 `src/main/__tests__/exportSymlinkContainment.test.ts`<br>整合性チェーン (`scripts/integrity-chain.cjs`) |
| `redirects-refused` | **アプリ自身の fetch は転送に追随しない** — 送り先の関門は最初の 1 ホップしか見ない。規則は httpLimits.ts に 1 つ、網の fetch 12 か所が全部通る。例外は no-cors の 1 形だけ (Fetch 標準が network error と定めるため)。 | パス 301 / パス 304 | 検査 `src/shared/__tests__/egressRedirectCensus.test.ts`<br>実機 `npm run e2e:ollama` |
| `response-body-capped` | **相手の本文は上限つきで読む —— 失敗した応答でも** — 上限は「読む前」に byte で効かせる (全部読んでから捨てるのは上限ではない)。**失敗した応答の枝ほど要る** —— 大きな本文を返すのは壊れている相手で、その相手は `!res.ok` に来る。失敗の読みは `readFailureBody` ただ 1 つ (**実測 16 か所**)。**数えるときは別名を解決する** —— パス 330 は `readBodyWithCap\|readFailureBody` の綴りだけを数え、本体が 1 行の別名 (`readCapped` / `readCappedText` / `readWithCap`) の先に在る呼び出し 18 件を落としていた (26 → 44 件。うち 7 件は失敗の枝の手書きで、上限は掛かっていたが口が 1 つではなかった · パス 334)。本文を自分で読む場所は門と端末のファイルの 3 件だけで、`Response` を受け取って自分で読む口 (`parseJsonBody`) は置かない —— 置くと上限が「呼び出し側がどの transport を渡したか」に依る。 | パス 301 / パス 311 / パス 330 (母集団の機械) / パス 334 (別名の解決) | 検査 `src/shared/__tests__/responseBodyCapCensus.test.ts`<br>検査 `src/shared/__tests__/jsonBodyCensus.test.ts`<br>検査 `src/shared/__tests__/httpLimits.test.ts` |
| `variable-hosts-ledgered` | **送り先が変数の通信は台帳** — Authorization を付けて送る先がホスト名で絞られていなければ資格情報の流出。送り先が定数でない通信は台帳に載っていなければ落ち、直したら消す (双方向)。走査は src 全体。 | 不変条件 #7 / ARCHITECTURE §3.3 / パターン 0-a | ゲート `npm run lint:network-targets` |
| `url-path-encoded` | **URL の動的部分は encodeURIComponent** — 通信呼び出しに渡る URL の authority より後ろに生の ${…} があれば落ちる。ホストは network-targets、画面に出すリンクは external-url-one-gate の担当。 | 不変条件 #6 | ゲート `npm run lint:url-encoding` |
| `link-host-not-from-response` | **応答の値を URL のホストの位置に置くなら 1 ラベルの文法で断る** — url-path-encoded は authority を見ず、network-targets は通信しか見ず、external-url-one-gate はスキームしか見ない —— 画面に出すリンクのホストに第三者の応答の値 (Slack team.domain) を置く行は 3 つの網のどれにも映らなかった。authority が ${…} で始まるテンプレートは台帳制 (両方向) で、置くのは関門の返り値 (slackWorkspaceDomainOrNull) だけ。 | パス 324 | 検査 `src/shared/__tests__/hostInterpolationCensus.test.ts`<br>検査 `src/main/clients/__tests__/slack.test.ts` |
| `ollama-allowlist` | **Ollama は読む endpoint だけを呼ぶ** — pull / create / push / copy / delete / blobs / upload を呼ばない (GGUF 経由の脆弱性の面を絶つ)。許可表は共有台帳 OLLAMA_READ_PATHS から組み立てる。脆弱性台帳は日付つき。 | 不変条件 #7 / 不変条件 #8 / パス 141 / パス 248 | ゲート `npm run lint:forbidden`<br>検査 `src/shared/__tests__/ollama.test.ts`<br>ゲート `npm run lint:rate-freshness` |
| `loopback-oauth-host-pin` | **OAuth callback の Host は loopback だけ** — DNS リバインディングを Host header の固定で断つ。判定は ollama / aiEndpoint のループバック判定とは別の問い (揃えない)。 | 不変条件 #12 / パターン 0-a-14 | 検査 `src/shared/__tests__/loopbackChecks.test.ts`<br>整合性チェーン (`scripts/integrity-chain.cjs`) |
| `header-values-one-rule` | **Headers が何を受理するかは 1 つの判定** — 資格情報の入口は shared/headerValue.ts の 1 つで受理を判定し、プラットフォームの例外文面 (ヘッダ名を含まない) が鍵を画面へ出さない。 | パス 244 / パス 296 | 検査 `src/shared/__tests__/headerValue.test.ts`<br>検査 `src/shared/__tests__/headerValueLeak.test.ts` |

### 保存と復元 (13)

| id | 法則 | 出典 | 執行者 |
|---|---|---|---|
| `storage-ledger-and-hard-reset` | **端末に残す物は台帳、ハードリセットは全行を覆う** — 新しい保存先が黙って増えない。媒体が DATA_PROTECTION の在庫に載る。入口 (localWrite) へ流れる鍵は登録の鍵と一致する (双方向)。「すべてのデータを削除」が台帳の全行を消す。**台帳が覆うのはアプリの生成元だけである** —— `lint:storage` の走査範囲は `src/renderer` なので、**利用者がダウンロードして開く単一 HTML** は母集団の外に居る。実測 (2026-09-21): 配る 8 本のうち 3 本 (電子定款メーカー / 就業規則メーカー / 経営書類スタジオ) が入力を `localStorage` へ自動保存しており、**商号・本店・発起人の氏名と住所**まで入るのに、3 本とも `removeItem` が 0 件で**文書の中から消す口が無かった**。保存先はその文書自身の生成元なので「すべてのデータを削除」は構造的に届かず、`eraseAll` を直しても解決しない (パス 364)。 | lint:storage 規則 11 / lint:storage 規則 12 / パス 136 / パス 310 / パス 364 (配る文書は別の生成元) | ゲート `npm run lint:storage`<br>検査 `src/renderer/security/__tests__/eraseAll.test.ts`<br>検査 `src/shared/__tests__/distributedArtifactStorage.test.ts` |
| `read-policy-three-states` | **「無い」「読めなかった」「読めた」を分ける** — 壊れた保存値を「まだ無い」に畳むと、次の登録が元の一覧を上書きする。読みは 3 状態で返し、画面は ⚠ で言う。端末からの読み 22 か所は方針 4 通りと理由で台帳。 | パス 120 / パス 121 / パス 309 / パス 310 / パス 313 | 検査 `src/renderer/__tests__/storageReadLedger.test.ts`<br>検査 `src/shared/__tests__/watchlistState.test.ts`<br>検査 `src/shared/__tests__/teamRadarState.test.ts`<br>検査 `src/main/__tests__/stateFile.test.ts` |
| `escape-hatch-stays-open` | **壊れた行があっても逃げ口は開く** — 保管層は読みで落とさない —— 落とすと壊れた行が UI から触れなくなる (`library.ts` の「行そのものは落とさない」= パス 136)。代わりに入口 (`store.importAll`) で検め、既に入っている行は設定画面の点検パネルで消す。**その設計は「逃げ口が開いている」ことに全体重を掛けている** —— 逃げ口自身が壊れた行で投げたら利用者は自分のデータから永久に締め出され、全ゲートは緑のままである。だから逃げ口は壊れた行の下でも描けることを機械で留め、投げる画面は両方向の台帳で数える。実測 (2026-09-21): 形の合わない行を collection ごとに 1 件入れて 74 画面を描くと、**欄が無い行で 2 画面が投げ** (`sales` / `kpi` —— どちらも `.slice` on undefined)、**型が違う行では 0 画面**。**逃げ口が「壊れている」のではなく「最初から無い」形も在る** —— 配る単一 HTML 3 本は入力を `localStorage` へ自動保存しながら消す口を 1 つも持たず、利用者はブラウザのサイトデータ設定を知らないかぎり自分の氏名と住所を残したままにするほか無かった (パス 364)。書類を作る道具なので、残っている自覚が持ちにくい側である。 | パス 136 / パス 225 / パス 360 / パス 364 (逃げ口が最初から無い) | 検査 `src/renderer/__tests__/malformedStoreRenders.test.ts`<br>検査 `src/renderer/components/__tests__/recordShapeAuditPanel.test.ts`<br>検査 `src/shared/__tests__/distributedArtifactStorage.test.ts` |
| `sample-never-written-back` | **見本を利用者の保管場所へ書き戻さない** — 「まだ無い」「読めなかった」ときに返る同梱の見本は飾りであって利用者の物ではない。それを画面の状態へ取り込むと自動保存がそのまま端末へ書き、利用者が何も押していないのに編集中の内容が消える。取り込むのは stored === "saved" のときだけ。「読めていない下書きを書き戻さない」(パス 160) と対になる、書く側の規則。 | パス 160 / パス 335 | 検査 `src/renderer/__tests__/snapshotAdoptionCensus.test.ts`<br>検査 `src/renderer/pages/__tests__/teamRadarSampleNeverOverwrites.test.ts`<br>実機 `npm run e2e` |
| `size-gate-before-parse` | **ディスクから読む所は読む前に大きさの門** — 「自分が書いた物は大きくならない」は前提にならない (別プロセス・壊れたディスク・同期ソフト)。stat で読む前に門、読んだ後にも byte の門。secrets.json は 1 MB かつ plain object。**控えへ倒れる枝は呼び出し側から見えないので、門は読む関数の中に置く** (パス 326)。同期の読みは主スレッドを止めるので特に要る。 | 不変条件 #13 / パス 308 / パス 313 / パス 326 (母集団の機械) | 検査 `src/main/__tests__/fileReadSizeGateCensus.test.ts`<br>検査 `src/main/__tests__/stateFile.test.ts`<br>検査 `src/main/__tests__/secretsProtection.test.ts`<br>整合性チェーン (`scripts/integrity-chain.cjs`) |
| `at-rest-mechanism-inventory` | **保存物の封緘方式は台帳** — OS のキーチェーン / WebCrypto の保管庫 / 難読化 / 平文のどれで残っているかを 1 つの在庫が持ち、画面 (secrets:protection) がそれを言う。 | パス 147 / パス 318 | 検査 `src/main/__tests__/atRestPolicy.test.ts`<br>ゲート `npm run lint:storage` |
| `credential-only-when-read` | **読み手の無い資格情報を預からない** — 取得も書き込みも読まないサービスにトークン入力欄を出さない。「預かること自体が漏えい面」。判定は規則 (client が token に触るか) で決まり、双方向で照合する。 | credentialUse.ts の docblock / パス 147 | ゲート `npm run lint:credential-use`<br>検査 `src/shared/__tests__/credentialUse.test.ts`<br>型 `src/shared/credentialUse.ts` |
| `data-origin-declared` | **数字の出所 (sample / local / remote) を宣言する** — 空の stub を「ライブ」として刷らない。分類は木から機械的に決まる規則で、総和型なので足し忘れは tsc が弾く。同梱の見本は集計の側がそれを言う。 | dataOrigin.ts の docblock / パス 164 / パス 187 | ゲート `npm run lint:data-origin`<br>検査 `src/shared/__tests__/dataOrigin.test.ts`<br>型 `src/shared/dataOrigin.ts` |
| `crypto-floors-frozen` | **暗号の床は凍結値** — PBKDF2 の反復・salt の byte は使う側ではなく宣言行に危険を書き、下げる編集が検査で落ちる。封緘した物は自分を作った反復回数を覚える。**導出は凍結値を読む** —— ハッシュを書き写すと封筒のメタだけが動いて「復号できないバックアップ」になる (パス 327)。 | パス 237 / パス 239 / パス 240 / パス 327 / パターン 0-a-10 | 検査 `src/shared/__tests__/kdfParamsCensus.test.ts`<br>検査 `src/shared/__tests__/cryptoParams.test.ts`<br>整合性チェーン (`scripts/integrity-chain.cjs`) |
| `key-bound-to-slot` | **暗号文は置き場所と束ねる** — 認証付き暗号は「中身が正しい」しか言わない。鍵と値の対で保管するなら鍵を additionalData に入れ、解錠 (鍵が手に入る瞬間) に全件直す。 | パターン 0-a-21 | 検査 `src/shared/__tests__/ontologyLaws.test.ts`<br>整合性チェーン (`scripts/integrity-chain.cjs`) |
| `paired-secrets-written-atomically` | **対で意味を持つ保管値は 1 トランザクションで入れ替える** — 鍵の検算値 (`kcv`) と鍵の包み (`master-wrap`) のように**片方だけでは嘘になる**保管値は、`idbPut` を 2 回ではなく 1 トランザクションで書く。`vault.ts` の `idbPutAll` は docblock でその危険を名指ししていたのに、**`initialize` だけが `idbPut` を 2 回呼んでいた** (`changePassword` / `recoverWithMnemonic` は最初から通っていた)。実測 (2026-09-21): meta だけ書けた金庫は `unlock` が**成功し** (kcv は passwordKey を指す)、トークンも往復するので**利用者は設定をやり直さない** —— しかも `initialize` は meta が在れば断るので**やり直せない**。meta の `recoveryWrappedKey` が包むのは本物の master 鍵なので、**控えた 24 語で復旧した瞬間に実効鍵が入れ替わり、それまでのトークンが全部読めなくなる** (`TOKEN LOST`)。**塞ぐのは作る側だけ** —— 「Phase E を名乗るのに master-wrap が無ければ解錠を断る」は既にその状態に居る利用者にとって改悪で、解錠時に直す道も無い (master-wrap は master 鍵が無いと作れず、master 鍵は復旧枝からしか出ない)。 | パス 239 / パス 361 | 検査 `src/renderer/security/__tests__/vaultPairedWrites.test.ts`<br>検査 `src/renderer/security/__tests__/vault.test.ts` |
| `write-then-read-loop` | **書く口を足したら読みの一巡** — 「保存した」の toast は読まれた証拠ではない。入力 → 保存 → 判定し直した結果が画面に出るまでを同じ変更の中で通す。両ビルドに枝が要る。 | パターン 0-a-22 | 検査 `src/renderer/__tests__/webShimSnapshotBranches.test.ts`<br>検査 `src/renderer/__tests__/webShimInputGatesAndSaves.test.ts`<br>検査 `src/renderer/__tests__/deviceStoreWritePolicy.test.ts` |
| `destructive-ops-have-owner` | **破壊的な操作は「宛先を誰が決めるか」で数える** — 名前がデータ由来でなくても、宛先が環境変数なら守りが要る。rmSync / unlinkSync / 上書きは書き込み先の名前とは別の軸。台帳の ✅ には問いを書く。 | パターン 0-a-20 | 検査 `src/shared/__tests__/notebooklmExportClear.test.ts`<br>検査 `src/main/__tests__/exportSymlinkContainment.test.ts`<br>ゲート `npm run lint:shell` |

### 画面へ出る文言・外へ出る本文 (8)

| id | 法則 | 出典 | 執行者 |
|---|---|---|---|
| `redact-then-cut` | **相手の本文は伏せてから切る、天井は梯子** — 天井だけ掛けて伏字を持たない経路 (clampToCeiling) は前半 (伏せる) を落としている。伏字の運び手はヘッダ名・JSON 項目名・URL のクエリと form 本文の 1 つ目。天井は redact.ts の梯子に名前と理由つきで置く。 | パス 271 / パス 273 / パス 289 / パス 290 / パス 307 / パス 320 | 検査 `src/shared/__tests__/redactionCoverage.test.ts`<br>検査 `src/shared/__tests__/ceilingLiteralCensus.test.ts`<br>整合性チェーン (`scripts/integrity-chain.cjs`) |
| `exception-to-screen-ledgered` | **例外の文面 → 画面は台帳** — 伏字を通さずに例外の文面を state / JSX / 戻り値へ流す行を数え、出どころの種類と理由で台帳に載せる (双方向・窓は 1 行)。母集団は renderer と shared。 | パス 314 / パス 320 | 検査 `src/renderer/__tests__/errorMessageSurfaceCensus.test.ts` |
| `json-body-parsed-with-constant-message` | **2xx の非 JSON 本文は定数の文で断る** — V8 の SyntaxError は本文の先頭 10 字を引用する。本文を JSON として読む直呼びは出荷 code で **0 か所** —— パス 330 で `parseJsonBody` (Response を受け取って自分で読む口) を消し、上限つきで読んだ**文字列**を受け取る `parseJsonText` だけにした。口が在ると上限が呼び出し側の transport 次第になる。 | パス 311 / パス 330 | 検査 `src/shared/__tests__/jsonBodyCensus.test.ts`<br>検査 `src/shared/__tests__/apiResponse.test.ts` |
| `envelope-checked-at-read` | **第三者の応答は読むところで確かめる** — `as T` は封筒も確かめない。200 の {} を成功にしない・null で型エラーを画面へ漏らさない・[] が 5 つの事実を意味しない・認可サーバの応答 1 つで資格情報を失わない。 | パス 259 / パス 260 / パス 261 / パス 262 / パス 263 / パス 264 | 検査 `src/shared/__tests__/tokenResponse.test.ts`<br>検査 `src/shared/__tests__/apiResponse.test.ts`<br>検査 `src/shared/__tests__/securityResponse.test.ts` |
| `ceiling-unit-is-chars` | **天井も床も文字で数える** — 画面は「2,000 字」と刷り、実装が UTF-16 のコード単位で数えると絵文字で食い違う。上限は n 文字目で切り上げる (100 MB を辿らない)。床 (12 文字以上) も同じ単位。 | パス 195 / パス 197 / パス 252 / パス 254 / パス 258 | 検査 `src/shared/__tests__/ceilingUnitCensus.test.ts`<br>検査 `src/renderer/__tests__/ceilingUnitCensus.test.ts`<br>検査 `src/shared/__tests__/inputCeiling.test.ts` |
| `exported-markup-escapes-free-text` | **書き出す成果物に自由文を素で入れない** — 書き出した `.md` / `.svg` / `.html` はライブラリに保存され、**ダウンロードして人に渡る**。自由文 (利用者の入力・AI の応答・第三者の応答) は `shared/escape.ts` の 1 つを通す —— Markdown は `escapeMarkdownInline` (1 行で終わる場所: 見出し・箇条書きの 1 項目・引用の 1 行) と `escapeMarkdownText` (地の文)、XML/HTML は `escapeXml`、色は**入口で検証する** (`safeColor` で既定値へ落とすか、`isHexColor` で断る)。`lint:forbidden` #11 が落とすのは**再実装**であって「通していない」ではないので、**形式ごとに**母集団を数える —— Markdown は不活性だが、`.svg` はブラウザで開くと中の `&lt;script>` が走り、`.svg` / `.html` はアプリ自身が `shell.openPath` で OS に開かせる。 | パス 332 / パス 348 / escape.ts の docblock (2026-08-20) | 検査 `src/renderer/__tests__/markdownExportCensus.test.ts`<br>検査 `src/shared/__tests__/markupExportCensus.test.ts`<br>検査 `src/shared/__tests__/escape.test.ts`<br>ゲート `npm run lint:forbidden` |
| `refuse-dont-truncate` | **外へ書く欄は切らずに断る** — 外へ送る本文を黙って slice しない。天井を超えたら理由を言って送らない。天井は型と長さの上限を持ち (12 家系)、画面の maxLength は関門ではない。 | パス 110 / パス 111 / パス 172 / パス 175 / パス 183 | 検査 `src/shared/__tests__/writeFieldLimits.test.ts`<br>検査 `src/renderer/__tests__/writeBodyCeilingCensus.test.ts` |
| `egress-notice-before-send` | **外へ送る画面は何を送るかを言う** — AI へ送る 8 画面・全画面のマイクは、何を・どこへ・どれだけ送るかを送る前に言う。断りが送る量を 2 倍に述べていてはならない。**母集団は AI とマイクだけではない** —— 利用者が打った個人データを第三者へ送る経路は他にも在り、実測 (2026-09-21) で `security/check-email-breach` (メールアドレス → Have I Been Pwned) と `security/scan-url` (URL → VirusTotal・投稿された URL は他の利用者が検索できる状態で残る) の 2 本が数えられていなかった。断り自体はよく書けていたが、**HIBP の断りを丸ごと消しても 17,868 件すべて緑**だった (パス 365)。受け手を名前で出すこと・その近くで「送る」と言うこと・**操作子より前に在ること** (押してから知る形にしない) を、実装から導いた母集団に対して要求する。 | パス 106 / パス 107 / パス 108 / パス 186 / パス 365 (AI 以外の第三者送信) | 検査 `src/renderer/pages/__tests__/aiEgressDisclosed.test.ts`<br>検査 `src/renderer/__tests__/aiDataDisclosure.test.ts`<br>検査 `src/renderer/pages/__tests__/thirdPartyEgressDisclosed.test.ts` |

### 数字の健全性 (5)

| id | 法則 | 出典 | 執行者 |
|---|---|---|---|
| `no-zero-fold` | **割れない値を 0 に倒さない** — 平均受注単価 0 円・実効税率 0.0%・勝率 0% は測った結果ではない。「—」か断りへ。母集団 (? … : 0 / ?? 0 / \|\| 0) は生成物で、判断は散文が持つ。 | パス 204 / パス 229 / パス 266 / lint:zero-fold | ゲート `npm run lint:zero-fold`<br>検査 `src/shared/__tests__/zeroFoldCensus.test.ts`<br>検査 `src/shared/__tests__/nonFiniteEntryPoints.test.ts` |
| `refused-values-make-no-judgement` | **⛔ の値から判定を作らない** — 画面が断っている値 (マイナス・率の天井超・非有限) を判定へ通すと「最も都合のよい答え」が出る。段ごとに断り、⛔ の欄が在れば保存しない。 | パス 206 / パス 209 / パス 210 / パス 214 / パス 216 | 検査 `src/renderer/__tests__/guardedJudgements.test.ts` |
| `parameters-ledgered-and-wired` | **計算の定数は台帳に登録し、配線し、画面は同じ出所を刷る** — 法定値・参考値・しきい値は parameters.ts の台帳。登録した値は必ず配線し「上書きすると画面が動く」を対照つきで留める。欄と欄の順序・等しくてはならない組も台帳。 | CLAUDE.md Conventions / パス 220 / パス 221 / パス 222 | ゲート `npm run lint:parameter-prose`<br>検査 `src/shared/__tests__/parameters.test.ts`<br>検査 `src/shared/__tests__/parameterConsistency.test.ts`<br>検査 `src/shared/__tests__/parameterReachability.test.ts` |
| `safety-limits-not-parameters` | **安全上限は台帳に載せない** — timeout / 応答サイズ / PBKDF2 反復 / 入力長は利用者が上書きできる台帳に置かない。名前と理由つきの定数 (梯子) にする。 | CLAUDE.md Conventions / パス 273 | 検査 `src/shared/__tests__/writeFieldLimits.test.ts`<br>検査 `src/shared/__tests__/ontologyLaws.test.ts` |
| `dates-parsed-once` | **日付の判定は 1 つ** — 同じ YYYY-MM-DD の判定が 7 通りに割れていた。暦を見る判定を 1 つにし、Date.UTC の 0〜99 (1900 年代) を通さない。 | パス 115 / パス 200 | 検査 `src/shared/__tests__/isoDate.test.ts`<br>検査 `src/shared/__tests__/dateAssemblyCensus.test.ts`<br>検査 `src/shared/__tests__/calendarDateCensus.test.ts` |

### 両ビルドの対称 (5)

| id | 法則 | 出典 | 執行者 |
|---|---|---|---|
| `browser-cannot-exceed-desktop` | **ブラウザ版はデスクトップの許可表を超えない** — ブラウザ版の invoke の if 連鎖に在ってデスクトップの LIVE_ACTIONS に無い操作は 0。走査が字面を全部説明できることを別に確かめる。 | dualBuildActionSurface の docblock (2026-08-23) | 検査 `src/__tests__/dualBuildActionSurface.test.ts`<br>検査 `src/shared/__tests__/ontologyFacets.test.ts` |
| `desktop-only-reasons-by-kind` | **デスクトップ限定の操作は種類つきの台帳** — 「デスクトップ版の機能です」と説明して穴を仕様として固定しない。理由は種類 (needs-main-only-facility / dead-action …) で書き、dead-action は画面から呼ばれていてはならない。 | パス 274 / パス 275 | 検査 `src/renderer/__tests__/webShimCredentials.test.ts`<br>検査 `src/shared/__tests__/ontologyFacets.test.ts` |
| `bridge-methods-match` | **bridge の口は preload と web-shim で同じ集合** — 15 の口は preload の型・main のハンドラ・web-shim の実装で同じ名前。片方にだけ生えた口は「在るが繋がっていない」。 | パス 318 / ARCHITECTURE §1.4 | 検査 `src/preload/__tests__/bridgeContract.test.ts`<br>検査 `src/preload/__tests__/bridgeStatic.test.ts`<br>検査 `src/renderer/__tests__/webShimBridge.test.ts`<br>ゲート `npm run verify:arch` |
| `snapshot-parity` | **両ビルドのスナップショットは同じ形** — 同じサービスの fetchSnapshot が両ビルドで同じ欄を返す。ブラウザ版だけ not_implemented で「エラー」と出さない。 | dataOrigin.ts の docblock / パス 309 | 検査 `src/renderer/__tests__/webShimSnapshotParity.test.ts`<br>検査 `src/renderer/__tests__/webShimSnapshotBranches.test.ts` |
| `both-builds-real-browser` | **実機は両ビルド** — 実ブラウザでしか見えない退行 (CORS・no-cors・起動) が在る。e2e は FULL と LITE を両方通し、e2e:ollama はスタブ Ollama + 実 chromium。 | パス 230 / パス 304 / パス 305 | 実機 `npm run e2e`<br>実機 `npm run e2e:lite`<br>実機 `npm run e2e:ollama`<br>CI `.github/workflows/e2e.yml` |

### 知識と出典 (3)

| id | 法則 | 出典 | 執行者 |
|---|---|---|---|
| `provenance-required` | **確証済みデータには出典が要る** — 権威ある出典が目録の記録だけの項目を落とす。同じ DOI が別々の出版年・著作で引かれない。雑誌・ブログ・百科事典・目録に academic を付けない。URL のスキームは http(s) だけ。DOI プレフィックスと出版社が矛盾しない。 | CLAUDE.md lint:citations / lint:doi-prefix / verify:knowledge | ゲート `npm run verify:knowledge`<br>ゲート `npm run lint:citations`<br>ゲート `npm run lint:doi-prefix`<br>ゲート `npm run lint:knowledge-refs` |
| `vault-and-graph-in-sync` | **生成物は本体と同期し、本体を網羅する** — vault・graph・概念表は本体から生成し、committed == 再生成に加えて本体との網羅を検査する。手で行を書かない。 | パターン 0-a-5 / CLAUDE.md knowledge:md | ゲート `npm run vault:check`<br>ゲート `npm run verify:graph`<br>ゲート `npm run verify:orchestration` |
| `legal-text-current` | **法令の記述は現行法** — 刑名の表記ゆれは 1 行ずつ裁定する (拘禁刑へ・旧刑名は括弧・米国法は対象外)。日付の無い率は lint:rate-freshness が期限で落とす。 | 刑名の裁定 (残作業 8) / lint:rate-freshness | ゲート `npm run lint:rate-freshness`<br>散文だけ `docs/SESSION_HANDOFF.md` — 「現行法か」は機械に映らない。率と日付の期限だけを機械が見る |

### 供給網と CI (7)

| id | 法則 | 出典 | 執行者 |
|---|---|---|---|
| `deps-ledgered` | **依存の閉包・床・取得元は台帳** — 本番依存は単一 HTML へ畳まれ保管庫と同じオリジンで走るので、増やすなら理由を書く。取得元は registry のみ・integrity 必須。「自分で押さえた版」の床は 1 つの台帳。週次の監査が狭い PR の門の外側を受け持つ。 | CLAUDE.md lint:deps / パス 306 | ゲート `npm run lint:deps`<br>CI `.github/workflows/dependency-audit.yml`<br>検査 `src/shared/__tests__/dependencyAuditWorkflow.test.ts` |
| `workflows-pinned-and-least-privilege` | **workflow は permissions 明示・第三者 action は SHA 固定** — pull_request_target 禁止。run: へ信用できない値を埋め込まない。第一者 action は runner の Node に合わせて上げる。 | CLAUDE.md lint:workflow-security / パス 316 | ゲート `npm run lint:workflow-security`<br>検査 `src/shared/__tests__/workflowSecurityWitness.test.ts`<br>整合性チェーン (`scripts/integrity-chain.cjs`) |
| `shell-scripts-strict` | **.sh は strict、遠隔コードと破壊的操作は台帳** — 追跡されている .sh すべて。bash shebang・set -euo pipefail・bash -n・curl \| sh は台帳のみ・後戻りできない書き込みと秘密の扱いは台帳のみ (双方向)・台帳の --self-test を実際に走らせる。 | CLAUDE.md lint:shell / パス 279 | ゲート `npm run lint:shell` |
| `integrity-chain-with-closure` | **守りを決めるファイルは封緘し、読んでいる先を 1 段見る** — 保護対象の一覧が読んでいる先 (PBKDF2 の反復を持つ定数など) が保護か理由つきの除外に載っていることを機械で確かめる。1 段ずつでよい。除外の理由は「実行時に残るか」で決める。 | パターン 0-a-10 / パターン 0-a-18 / パス 285 / パス 286 / パス 287 | ゲート `npm run chain:verify`<br>検査 `src/shared/__tests__/integrityChainWitness.test.ts`<br>整合性チェーン (`scripts/integrity-chain.cjs`) |
| `mutation-scope-protected` | **保護対象は変異検査の中** — 権限・資格情報・書き出し先を決める壁が mutate から外れると変異体が 1 つも作られず、測っていないのに緑になる。 | lint:mutation-scope の docblock / パス 318 | ゲート `npm run lint:mutation-scope`<br>実機 `npm run mutate` |
| `release-artifacts-reread` | **公開先は前のランの残骸を溜める — 置いてある一覧を読み返す** — CI の緑はそのランが何を出したかしか保証しない。追記しかしない置き場 (リリース資産) は公開後に一覧を読み返す。数は宣言側 (electron-builder.json) から導く。 | パターン 0-a-19 | ゲート `npm run verify:release-artifacts` |
| `repo-size-ceiling` | **追跡ファイルの大きさに天井** — 履歴に入った blob は後から追跡を外しても消えない。1 ファイル 12 MB / 追跡合計 80 MB (85% で警告)。出荷 HTML は 16 MB / 4 MB。 | CLAUDE.md lint:repo-size / ci.yml の出荷物の天井 | ゲート `npm run lint:repo-size`<br>CI `.github/workflows/ci.yml` |

## 6. 機械の無い法則 (3)

- `manual-check-becomes-gate` **手でやった検査はその場でゲートにする** — 「手でやった」は機械に映らない。作ったゲートが CI に在ることは gate-runs-in-ci が、自作ゲートが対照を持つことは negative-control が見る
- `claim-unit-not-file` **主張の単位で見る** — 検査の書き方の規律。個々の検査が守っているかを機械で見る形は無い (absence-needs-sample が「不在の主張」側だけを数える)
- `parity-is-not-correctness` **パリティは両方に在る穴を見つけない** — 「一致した 2 つが両方とも間違っている」は定義上パリティに映らない。攻撃形を食わせる検査は組ごとに書く

## 7. 集計

- 法則 91 (機械あり 88 / 散文だけ 3)
- facet の公理 10・実体クラス 15・層 4・ビルド 3
- `verify:all` のゲート 37: `typecheck` `verify:arch` `lint:forbidden` `lint:workflow-security` `lint:network-targets` `lint:url-encoding` `lint:regex` `lint:imports` `lint:docs` `lint:citations` `lint:doi-prefix` `lint:charset` `lint:knowledge-refs` `lint:sample-data` `lint:test-coverage` `verify:release-artifacts` `lint:shell` `lint:repo-size` `lint:deps` `lint:mcp-servers` `lint:storage` `lint:csp` `lint:data-origin` `lint:credential-use` `lint:ipc-handlers` `lint:mutation-scope` `lint:collection-time` `lint:parameter-prose` `lint:zero-fold` `lint:shared-judgement` `lint:rate-freshness` `verify:orchestration` `vault:check` `verify:graph` `verify:knowledge` `chain:verify` `lint`
