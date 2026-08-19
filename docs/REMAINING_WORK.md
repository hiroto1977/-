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
- [x] **テスト 7,728 件合格**・typecheck・`verify:all` **22 ゲート** green
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

## 変異検査で測っていない範囲 (2026-08-18 実測・507 行)

`npm run lint:mutation-scope` の台帳 `KNOWN_BROAD` に載っている **3 ファイル
/ 5 箇所 / 507 行**（着手前は 36 ファイル / 46 箇所 / 5,189 行）。これは「許した」ではなく「まだ測っていないと
分かっている」という意味である。ゲートは**双方向**で、増えても減っても落ちる
(減ったら台帳を実測値へ更新する)。

**この台帳には抜け道があった。** 上のゲートは `stryker.config.json` の `mutate` に
載っているファイルしか見ない。裏を返すと、**載せなければ何も言われない**。
`src/main/clients/exportPaths.ts` — 4 サービスの書き出しが全部通る、書き込み先を
決める最後の壁 — がそれで、中に無効化が掛かっていたのにファイル自体が一覧に
無いため**変異体が 1 つも作られず**、ゲートも無反応だった。同日、`MUST_MEASURE`
(必ず測る壁の一覧) を足して塞いだ。壁が黙って一覧から外れたら落ちる。

### なぜ危険か — 実際に起きたこと

`src/renderer/data/store.ts` は先頭で 13 種の mutator を**ファイル全体**に対して
無効化しており、変異検査は **3 変異体・100%** と報告していた。無効化を外して実測すると
**256 変異体・71.09%・生存 44 / 未到達 30**。そこには実バグが潜んでいた —
全 11 箇所で `db.close()` が `await txDone(tx)` の**後ろ**にあり、書き込みが失敗すると
接続が閉じられず残る。テストを足したところ、この漏れが原因で別のテストが 30 秒
タイムアウトする形で表面化した。`withDb()` で構造的に閉じるよう直し、**242 変異体・100%**
になった (真の 100%)。

### 残っている範囲 (行数の多い順・上位 12)

| ファイル | 箇所 | 無効化行数 |
|---|---|---|
| `src/main/clients/business.ts` | 3 | 199 |
| `src/main/clients/stocks.ts` | 1 | 169 |
| `src/main/clients/templates.ts` | 1 | 139 (座標の算術のみ) |

**security/ と oauth/ に残っているものが痛い。** `pkce.ts` (OAuth の code_verifier
生成)、`ai/credentials.ts`、`ai/providers.ts`、`library.ts` はいずれも、壊れても画面には
出ずに安全性だけが落ちる場所である。高い変異スコアはこれらを**分母から外したうえで**
出ている。

### 消化済み

| ファイル | 着手前 | 実測して分かったこと | 現在 |
|---|---|---|---|
| `src/renderer/data/store.ts` | 3 変異体「100%」 | 実測 256 変異体 71.09%。接続リーク 11 箇所 | **242 変異体 100%** |
| `src/renderer/network/proxy.ts` | 501 行を無効化 | 実測 422 変異体 73.70%。SSRF 判定に生存 43・先頭ドット回避を発見 | **321 変異体 100%** |
| `src/renderer/security/vault.ts` | 610 行を無効化 (3 箇所) | 実測 357 変異体 78.71%。`extractable: false` を証明する検査が無かった | **307 変異体 100%** |
| `src/renderer/oauth/pkce.ts` | 180 行を無効化 | 実測 171 変異体 77.71%。送っている中身 (`code_verifier` / `S256`) を誰も見ていなかった | **163 変異体 98.77%** ※ |
| `src/shared/ai/credentials.ts` | 176 行を無効化 | 実測 159 変異体 90.57%。空文字の API キーが「設定済み」として通っていた | **157 変異体 100%** |
| `src/shared/ai/providers.ts` | 301 行を無効化 | 実測 255 変異体 72.16%。全プロバイダの応答パーサが無証明。**生存 48 のうち 40 が static 変異体**と判明し `ignoreStatic` を採用 | **189 変異体 100%** |
| `src/renderer/security/autoLock.ts` | 85 行を無効化 | 実測 63 変異体 55.56%。**`onVisibilityChange` が丸ごと未到達** — 「タブを隠したら施錠」という中核の約束に検査が 1 つも無かった | **49 変異体 100%** |
| `src/main/oauth.ts` | 55 行を無効化 | 実測 394 変異体 70.05%。生存 117 のうち **103 が OAUTH_CONFIGS** (認可の送り先を決める表)。読み直す golden で殺した | **379 変異体 100%** |
| `src/renderer/fs/fsa.ts` | 128 行を無効化 | 実測 119 変異体 49.58%。**handle の永続化 (次にどこへ書くかを決める) が丸ごと未到達**。「モックを clone できない」という除外理由は、関数を持たない素のオブジェクトを使えば回避できた | **91 変異体 100%** |
| `src/main/clients/calendar.ts` | 99 行を無効化 | 実測 60 変異体 43.33%。**問い合わせの中身が丸ごと無証明** — 送り先 URL・`Authorization` ヘッダ・「今より後 / 繰り返しを展開 / 開始順」のどれ 1 つ固定されていなかった | **60 変異体 100%** |
| `src/main/clients/templates.ts` | 290 行を無効化 (3 箇所) | 実測 222 変異体 47.30%。11 箇所の無効化のうち **6 箇所は外しても 100% のまま** — 測れていた場所を隠していただけだった。残りは書き出し既定値 (実 `fs` が 1 度も動いていない) と折り返しの段組み | **136 変異体 100%**（算術のみ 139 行を明示除外） |
| `src/main/clients/exportPaths.ts` | **`mutate` に載っていない**（実測ゼロ） | 一覧に入れて実測 29 変異体 93.10%。長さ上限 1024 の境界がどちら側かを誰も見ていなかった | **27 変異体 100%** |
| `src/main/clients/emotions.ts` | 234 行を無効化 | 実測 215 変異体 55.35%。**日記を 0600 で書いていることを誰も見ていなかった**。壊れた記録を「まだ無い」と誤解して空で上書きする経路、消去で巻き添えになる経路も無証明 | **197 変異体 100%** |
| `src/main/clients/drive.ts` | 70 行を無効化 | 実測 38 変異体 57.89%。送り先・`Authorization`・`orderBy`/`pageSize`/`fields` のどれ 1 つ固定されていなかった | **38 変異体 100%** |
| `src/main/clients/wordpress.ts` | 110 行を無効化 | 実測 71 変異体 64.79%。**`is_free` と slug のどちらを信じるかの順番**が無証明 (無料プランを有料として出せる)。`free_plan` の判定は `includes('free')` と重複していたので削除 | **66 変異体 100%** |
| `src/main/clients/notion.ts` | 122 行を無効化 | 実測 77 変異体 65.38%。`Notion-Version` は `toBeDefined()` で見ていたので**空文字でも通っていた**。「最後に編集した順」の指定も無証明 | **78 変異体 100%** |
| `src/main/clients/canva.ts` | 81 行を無効化 | 実測 60 変異体 71.67%。`ownership`/`sort_by` と 12 件の上限が無証明 | **59 変異体 100%** |
| `src/main/clients/cloudflare.ts` | 189 行を無効化 | 実測 115 変異体 66.96%。**DNS レコードが既定でプロキシしないことを誰も見ていなかった** (真になると公開 IP が差し替わる)。ページ送りの上限、`unwrap` の「不明なエラー」経路も無証明 | **115 変異体 100%** |
| `src/main/clients/devEnv.ts` | 43 行を無効化 | 実測 199 変異体 83.89%。**「どのファイルを読むか」を決める層が丸ごと未到達**。一時ディレクトリを作って実際に読ませる形にした。`existsSafe` の try/catch は `fs.existsSync` が例外を投げない仕様なので削除 | **197 変異体 100%**（文言のみ 19 行を明示除外） |
| `src/main/clients/funding.ts` | 34 行を無効化 (`disable all` 2 箇所) | 実測 30 変異体 83.33%。モック表そのものは静的変異体なので測っても増えないが、**その隣にあった消費税の式** (課税仕入れ 60%・税込から 10% を取り出す) は本物で無証明だった | **30 変異体 100%**（pragma ゼロ） |
| `src/shared/taxCalc.ts` | 53 行を無効化 | 実測 439 変異体 91.72%。**速算表の境界 11 箇所が全部生存**。調べると**表が境界で連続だから観測できない**と分かったので、境界を突く代わりに**連続性そのものを検査**にした (定数の写し間違いはこちらで落ちる)。`needsAdvisor` (税理士必須の印) は全 14 件を固定 | **424 変異体 100%** |
| `src/renderer/data/counseling.ts` | 120 行を無効化 | 実測 129 変異体 94.57%。**危機応答の本文が消えても誰も気付かない**状態だった (窓口は並ぶが文章が空になる)。連続不調 3 日の閾値も無証明 | **129 変異体 100%** |
| `src/shared/ai/chat.ts` | 57 行を無効化 | 実測 22 変異体 86.36%。失敗本文の 200 字上限と `redactSecrets` が無証明 (相手が鍵を復唱して返す経路) | **22 変異体 100%** |
| `src/renderer/data/chatbot.ts` | 83 行を無効化 | 実測 170 変異体 67.06%。**書き込み操作の確認を促す一文**が消えても通っていた。案内文だけ 8 つの小さい帯に分けて除外 | **115 変異体 100%** |
| `src/renderer/library/library.ts` | 217 行を無効化 | 実測 196 変異体 68.88%。ファイル名/MIME/serviceId の検査、50 MB の上限、**保存済みファイルを消す唯一の経路 (間引き)**、`randomUUID` が無い環境の id 生成がすべて無証明 | **134 変異体 100%** |
| `src/main/clients/teamradar.ts` | 237 行を無効化 (4 箇所) | 実測 433 変異体 66.74%。保存の実経路 (tmp へ書いて rename) が未到達、入力の長さ境界が無証明、**図の構造** (輪の本数・軸の数・多角形の頂点数) も測られていなかった。action 側が `saveTeamRadarState` と同じ検査を重ねていたので削除 | **288 変異体 100%**（座標のみ 5 つの小さい帯で除外） |

※ `pkce.ts` だけ 100% にしていない。残る 2 つは真の等価変異で、範囲指定で囲めば
100% になるが**66 個の測定を捨てる**ことになる (163 変異体 98.77% → 97 変異体 100%)。
分母を縮めて買った 100% は正直な 98.77% より価値が低いので、囲まずに理由をコードへ
書いた。`lint:mutation-scope` が禁じているのと同じ形である。

### static 変異体について (2026-08-18 に方針を決め、同日に**訂正**した)

> **訂正**: 当初「static 変異体は構造的に殺せない」と書き、`ignoreStatic: true` を
> その対処として入れた。**これは不正確だった。** `ignoreStatic` が無視するのは
> 「どのテストにも覆われていない static 変異体」だけで、覆われているものは実行され、
> モジュールが変異体の有効化より前に読み込まれているために『生存』と報告される。
>
> 実測で差が出た: `ai/providers.ts` は未到達 static だったので `ignoreStatic` で
> 消えたが、`oauth.ts` の `OAUTH_CONFIGS` は**覆われた** static だったため 103 件が
> そのまま残った。
>
> **覆われた static 変異体は、テスト側でモジュールを読み直せば殺せる。**
> `vi.resetModules()` + 動的 `await import()` で毎回評価し直すと、表を書き換える
> 変異体が比較で落ちる (`oauth.test.ts` の `freshConfigs` / `freshListen`。
> これで 70.05% → 92.13% に上がった)。
>
> つまり定数表・レジストリの類は「測れない」のではなく **読み直せば測れる**。
> `ignoreStatic` は未到達の static を赤として残さないための設定であって、
> テストを書かない口実にはしない。



モジュール読み込み時に一度だけ評価される初期化コード (定数テーブル / レジストリ /
設定オブジェクト) の変異体は、vitest がモジュールを変異体ごとに読み直さないため
**構造的に殺せない**。既定のままだと「生存」として報告され、テストの不足と
区別が付かなくなる。

`providers.ts` で実測したところ、生存 48 件のうち **40 件が static** だった
(Stryker の JSON レポート — reports/mutation 配下の生成物 — の `static: true` で判別できる)。殺せない赤は
「常に緑を返すゲート」と同じで、本物の不足を埋もれさせる。

そこで `stryker.config.json` に `ignoreStatic: true` を入れた。変異体を生成しない
だけなので**既に 100% のファイルのスコアは変わらない** (consolidation.ts で実測確認)。
副作用として、モジュール初期化コードの誤りは変異検査では見つからない — そこは
起動時の不変条件チェック (`AI_PROVIDERS` の id 照合など) とユニットテストで担保する。

この方針変更で、台帳に残っている行数は**「まだ測っていない実コード」だけ**を
指すようになった (static 変異体を隠すための無効化と混ざらなくなった)。

**効果は大きかった。** `ignoreStatic` を入れた直後に 18 ファイルの無効化を外して
実測したところ、**テストを 1 行も足さずに全ファイルが 100%** だった — つまり
それらの無効化は最初から static 変異体を隠すためだけに存在していた:

| ファイル | 無効化を外した後 |
|---|---|
| `connectorCatalog.ts` / `welfareDocs.ts` / `selfCareLibrary.ts` / `counselingResearch.ts` | 100% (台帳から 4 件退場) |
| `taxGift.ts` | 100% (台帳から 1 件退場) |
| `taxStampDuty.ts` / `taxRegistrationLicense.ts` / `taxAutomobile.ts` / `taxRealEstateAcquisition.ts` / `taxInheritance.ts` / `taxNationalHealthInsurance.ts` / `taxNationalPension.ts` | 100% (台帳外だが測定対象が増えた) |

さらに 5 ファイル (`voiceCommand.ts` / `dbSecurityPosture.ts` / `securityRange.ts` /
`taxCorporate.ts` / `taxSocialInsurance.ts`) も同じくテスト追加なしで 100% だった。
**合計 23 ファイルの無効化が static 隠しだけだった**ことになる。

### 残り 2 ファイルの実測値 (2026-08-18・無効化を外して測った)

ここから先はテストを足さないと上がらない。低い順:

| スコア | ファイル | 生存 + 未到達 |
|---|---|---|
| 74.4% | `src/main/clients/business.ts` | 142 |
| 78.9% | `src/main/clients/stocks.ts` | 275 |

SaaS クライアントの薄いもの (`drive` / `wordpress` / `notion` / `canva` /
`calendar` / `templates`) と security 系はすべて消化済み (下の表を参照)。
残っているのは **2 つだけ** — `business` 199 / `stocks` 169 (ほかに
`templates` の座標算術 139 行)。**次は `business.ts` (74.4%)**。

### 進め方 (store.ts で通った手順)

1. 該当ファイルの範囲指定 disable を外し、`rm -f .stryker-incremental.json && rm -rf .stryker-tmp`
   してから `npx stryker run --mutate <file>` で**実測**する (キャッシュが残ると誤報が出る)
2. 生存変異体を「実装されているのに何も証明していない契約」と「本当の等価変異」に仕分ける
3. 前者は**公開 API 越しに**テストを足す (内部関数を export して直接叩くと
   「関数は正しいが呼ばれていない」を見逃す)
4. 後者は**まずコードを単純化できないか**疑う。`store.ts` では uuid の組み立てを
   添字アクセスから `Array.from` の走査へ変えるだけで、到達しない `?? 0` が 2 つ消えた
5. どうしても残るものだけ `Stryker disable next-line <Mutator>: <理由>` にする
   (範囲指定にしない)
6. `KNOWN_BROAD` から当該行を削除し、`lint:mutation-scope` が緑になることを確認する


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

## 出典照合 — 完了（台帳 4 つとも空）

**出典台帳の未確認件数: **0 件****

`lint:doi-prefix` は 4 つの台帳を持ち、いずれも**双方向**（直したのに載っていたら落ちる）。
2026-08-17 時点で 4 つとも空である:

| 台帳 | 何を退避するか | 現在 |
|---|---|---|
| `ALLOWLIST` | DOI プレフィックスとラベルの出版社が矛盾 | 0 件 |
| `ISBN_ALLOWLIST` | 書籍 DOI の ISBN-13 チェックディジット不正 | 0 件 |
| `JOURNAL_ALLOWLIST` | 同一出版社内で誌コードとラベルが不一致 | 0 件 |
| `DUPLICATE_ID_ALLOWLIST` | 同一文献に別々の識別子 | 0 件 |

実測（`npm run lint:doi-prefix`）: 書籍 DOI 316 件のチェックディジット、
DOI 234 件の誌コード、文献 2,206 件の識別子衝突、DOI 出典 919 件のプレフィックス —
**すべて 0 件**。`lint:citations`（同一 DOI が別々の出版年で引かれていないか）も
DOI 2,276 件で 0 件。

**この節は 2026-08-17 まで「残り 18 件」と書かれていたが、実体は空だった。**
終わった作業を「未完了」として掲げると、次に読む人が済んだ場所を掘り直す。
再発しないよう、上の「未確認件数」は `lint:docs` が台帳の実体と突き合わせる
（`cross-doc-consistency.cjs` の `citation ledger backlog`）。数を書き換えても
台帳を増やしても、片方だけでは落ちる。

### 到達した経緯（次に台帳へ退避する人向け）

- **プレフィックス照合**は当初 134 件を検出し、DOI 差し替え 114 件 + ルール修正 2 件で解消。
  差し替えは**すべて出版社／索引ページで実体を確認してから**行った。確認できなかった
  候補は、もっともらしくても投入していない（**推測で出典を直さない**）。
- **ISBN チェックディジット検査**は外部問い合わせなしに実在性を否定できる。
  Springer の書籍 DOI は `10.1007/<ISBN-13>` の形で ISBN をそのまま含むため、
  末尾の検査数字だけで「この DOI は解決しない」が数学的に確定する。
  検出 24 件は「ISBN の打ち間違い」ではなく **DOI そのものが実在しない**もので
  （ラベルが Springer 以外の版元を名乗るのに DOI が 10.1007 の形）、
  実 DOI が無い書籍は**版元の書誌ページ**へ差し替えて解消した。
- **ラベルの文献自体が疑わしい**型は DOI 差し替えでは直らず、出典ごと差し替える
  判断が要る（例: 実在を確認できない書名）。この型が最後まで残った。
- **報告が割れたら親が一次確認する。** 並列照合で同一文献の可否が食い違った際は、
  親が出版社サイトを直接見て決着させた。
- **真の偽陽性はルールを直す**（台帳に隠さない）。百科事典・ハンドブックは原典の
  掲載誌と収録先の両方を名乗るのが正常、版元が移った誌のレガシー DOI は矛盾ではない、
  の 2 つはルール側で除外した。隠すと将来も誤検出し続ける。

### 照合の制約（変わっていない）

このコンテナからは doi.org / Crossref / OpenAlex / 主要出版社すべてが egress ブロックで、
照合手段は実質 WebSearch のみ。**1 セッションあたり 30〜40 件が現実的な上限**で、
並列度を上げても検索予算を食い合うだけ（4 並列 × 34 件は全員が予算切れ、
3 並列 × 12 件は 36 件すべて判定完了）。手順は「DOI 接尾辞の完全一致検索 →
索引が返す出版社ページの実体を証拠にする」。**検索要約の主張を証拠にしない。**

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
