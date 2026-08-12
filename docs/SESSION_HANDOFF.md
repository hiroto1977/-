# Service Hub — セッション引継ぎ

> このドキュメントは **新しい Claude Code セッションが開始した時点での
> プロジェクト状態 / 既存パターン / 未解決の follow-up / 既知の罠**
> を簡潔にまとめたものです。`SessionStart` hook が自動でこのファイルの
> 存在を案内します (`.claude/settings.json` + `scripts/session-context.cjs`)。
>
> 大幅な変更を加えた時は **このファイルも合わせて更新** してください。

## 🔴 進行中タスク（最優先・新セッションはまず確認）

**学術知識ループ（自動パイプライン）** — `src/renderer/data/academicKnowledge.ts` に検証済み学術概念を
1 バッチ 6 件ずつ追加し続ける常設タスク。**「作業を継続して」の指示で自動実行**。

- **完全な運用仕様 → [`docs/BATCH_APPEND_SPECIFICATION.md`](BATCH_APPEND_SPECIFICATION.md)**（機械可読AIエージェント向け）。
- **概念背景 → [`docs/ACADEMIC_KNOWLEDGE.md`](ACADEMIC_KNOWLEDGE.md)**（学術の枠・検証原則）。

### 📊 進捗ダッシュボード（毎バッチ完了時に更新 — 新セッションはここだけ見れば現在地がわかる）

| 項目 | 値 |
|---|---|
| **現在の概念総数** | **3,519**（`grep -c "    id: '" src/renderer/data/academicKnowledge.ts`。重複統合 32 パス+オートパイロット消化で 4,350→3,519・**−831**。パス4/5/7 は全文読解で裁定し、統合先の出典・記述を一切減らさずに 25 件を統合。**重複疑いキューは 3 系列すべて 0 件** — タイトルコア一致 / グラフ term-overlap / **id 正規化 (パス7 で新設)**） |
| **直近完了作業** | 🧭✅ **年齢・性別等を入れると使える制度が出る判定エンジンを作った（`data/eligibility.ts` 新設・mutation 100%）** — 直前の作業で事業計画書の「認定を受ける制度」欄を年齢で決め打ちしないよう直したが、**どの制度が使えるかは書き手が自分で調べる**ままだった。要件は制度ごとに散らばり、境界も 18歳以上45歳未満／45歳以上65歳未満／49歳以下／65歳未満とバラバラ。**★ mutation testing が「テストの穴」ではなく「設計の誤り」を 2 件出した**（初回スコア 60.87%・survived 103）。①**`eligible` が構造的に到達不能だった** — 全 9 制度が `manualChecks` を持ち、それがあると判定を要確認に落とす設計にしていたため、**どの制度にも審査はあるので全部が要確認**になり、何も答えない道具になっていた。審査要件は判定を下げず `reviewChecks` として情報で添える形に変え、判定は「入力から決まる要件を満たすか」に限定した（画面でも「申請できるという意味であって採択・審査の結果ではない」と断る）。②**前提の認定の年齢が伝播していなかった** — 青年等就農資金に年齢要件は無いが、前提の認定新規就農者が 18歳以上65歳未満。前提を「未確認」で止めると 66 歳の人に「確認すれば使えるかも」と見せてしまう。前提の年齢まで辿って対象外にした。**★ 等価変異は pragma で黙らせず型で消した** — `min?: number` にすると `min !== undefined && age < min` のガードが要るが、`age < undefined` は常に false でガードが結果を変えず殺せない。境界を省略可にせず「無い側は ±Infinity」で持ち、比較 3 本に畳んで分岐ごと消した（**pragma 0 個で 252 変異体すべて撃破**）。**★ 前提の認定は はい/いいえ/未回答 の 3 択**にした（既定を「いいえ」にすると、答えていない人まで対象外に落ちる）。**★ 全角数字**: 年齢を IME で「６６」と入れるのは普通で、弾くと「入れたのに判定が動かない」。`parseNumericInput` で正規化し、空欄は **null で 0 に落とさない**（0 だと「0 歳」で判定してしまう）。**配置**: 資金調達レーダーと、書類スタジオで `plantfactory-plan` を開いているとき（制度を選ぶまさにその場）の 2 箇所。**成果**: テスト 6,739→**6,776**（実行時 6,880→6,917）、mutation 対象 10 モジュール目で **100%**、実 Electron 撮影で描画確認、全 16 ゲート green |
| **その前の作業** | 🛡️✅ **人が間違える箇所を潰す 3 本立て（PR #737・CI green）** — ①**書類スタジオ 12 → 45 書式**（人事6・社内5・通知4 の 3 カテゴリを新設。契約9/経理8/人事6/組織7/規程4/社内5/通知4/事業計画2）＋**交付前チェック** `data/docStudioChecks.ts`。雛形が正しくても書き手が間違えれば書類は壊れる — 極度額を書き忘れた身元保証書は**無効**（民法465条の2）だが書式を見ても気づけない。fatal/warn/info で判定し、fatal は 5年超の身元保証期間・月100時間以上/年720時間超の36協定・利息制限法超過の利率・30日を切る解雇予告で手当なし・「変更の範囲」空欄の労働条件通知書・受領日から60日超の支払期日（取適法）・出席数>総数の議事録 など。汎用の差込表 `DocTable` を追加（36協定・精算書・株主名簿）。書式検索＋カテゴリ絞り込み＋最近使った書類。②**数値入力ガード** `data/inputGuards.ts` + `components/GuardedNumber.tsx`。**画面ごとにパーサが違い、同じ入力で結果が食い違っていた** — `Number('30,000')` は NaN→0（投資信託）、桁区切りを消す方は 30000（不動産）。投資信託の積立シミュレーションに桁区切りで打つと将来評価額が **¥0** になる実害があった。読み取りを `readNumber()` 1 本に統一し**計算も警告も同じ関数**にしたので「警告は出ないのに 0 で計算」が構造的に起きない。**万・億は解釈しない**（読み替えを誤ったとき気づけないため、読めないと言って円単位を促す）。不動産の全欄・投資信託19欄・税務42欄に適用。③**消費税 0〜50% の納付/還付スケジュール** `shared/taxConsumptionSchedule.ts`（税務試算 ⑩-2）。国税:地方 78:22、国税100円未満切捨て→地方はその22/78、中間申告の回数（48万/400万/4,800万で 0/1/3/11回）と各回の額・期限、確定申告の期限（個人3/31・法人期末+2か月／延長3か月・土日と12/29〜1/3は翌開庁日）、還付の入金目安。**分岐税率**を出すのが実務の肝 — 中間納付は前期実績で決まり当期の税率で変わらないので、税率が分岐点を下回ると本則で納付でも確定申告は還付になる。**自分の誤りを 3 件記録**: テスト期待値で 5/31 と 1/31 が日曜であることを見落とし、11月分の中間期限を年末年始と取り違えた（実装が正しかった）。一方で**対象期間の末日まで休日送りしていた実装バグ**は実在し修正。**成果**: テスト 6,133→**6,450**（静的 6,048→6,329）、実 chromium 検証 3 本（書類45/入力ガード/消費税スケジュール）、E2E 18 チェック通過、全 13 ゲート green。④**新設 5 モジュールを mutation 100% にして Stryker scope へ登録**（`inputGuards` / `invoiceTax` / `tradeTax` / `taxConsumptionSchedule` / `docStudioChecks`）。**`docStudioChecks` は 53.99% スタートで、生き残りの大半が 「JS のセマンティクス上どうやっても観測できない防御」だった** — pragma で黙らせず、死んでいる分岐そのものを落とした: (a) `toNum`/`parseJpDate` の結果を null ではなく **NaN で受ける `num()`/`day()`** を用意すると、NaN との比較は常に false なので 各ルールに散っていた `x !== null &&` が**すべて不要**になる（書いても結果が変わらない）。「読めない値はどの閾値にも引っかからない」という方針が、ガードの羅列ではなく演算そのもので表現される。(b) `parseJpDate` の `d < 1 || d > 31` は直後の **Date.UTC 往復照合が同じ日付を必ず弾く**ため完全に冗長 → 月の範囲だけ残し、日の妥当性は往復照合へ一本化（2月30日・0日・32日はいずれも日がずれて戻る。**月だけは Date.UTC が繰り上げても日が動かない**ので残す必要がある）。(c) 任意税率の `raw === "" || val === null` は `toNum("")` が null を返す以上、前半が後半に包含される。この整理で**変異体が 814 → 695 に減り、pragma は 1 つも要らなくなった**。テスト側は「レベルと field だけ見る」書き方をやめ、分岐ごとに `level|field|message|basis` を丸ごと固定する **37 シナリオのスナップショット**を敷いた （文面そのものが成果物である以上、文面が空になっても素通りする検査には意味がない）。**★ この過程で実バグを 1 件発見**: `toNum` が全角カンマ「，」と読点「、」を桁区切りとして落としておらず、日本語 IME で「１，２３４」と打つと **1** と読まれて金額チェックが静かに的外れになっていた。⑤**定款生成をデータから切り出して `data/docStudioTeikan.ts` へ**（テストが 1 件も無い唯一のロジックだった）。定款は登記に使う法的文書で、章がひとつ落ちても条文が空文字になっても「それらしい書面」のまま出る。23 テスト（章立ての丸ごとスナップショット 4 種・章番号の連番・条の重複なし・空文字/NaN/undefined の混入なし・会社法27条/576条の絶対的記載事項・公告方法/事業年度/発起人社員の分岐）＋ **mutation 100%（364 変異体）**、実 chromium 12 項目通過。到達の過程で「空文字だけのオブジェクトを返して呼び出し側が `|| 目印` で補う」形と 「種別を受けて中で文言を選ぶ」形がいずれも**分岐を観測できない**ことが判明し、値そのものを渡す形へ直した。**★ テストの書き方自体の穴**: 章の生成を `describe` 直下で呼ぶと、例外を投げる変異体が「テスト失敗」ではなく**「ファイルの収集失敗＝テストが 0 件」**になり、mutation では生存として数えられる。生成は `it` の中へ移すこと |
| **直近の作業** | 📗✅ **事業計画書・資金調達計画書・資金繰り表を追加（書式 45→48・`data/cashPlan.ts` 新設・mutation 100%）** — 既存の事業計画 2 書式は植物工場／新規就農に特化していて汎用の雛形が無く、**資金繰り表は存在しなかった**。`cashForecast.ts` はあるが「月次CFがこの調子で続いたら」という 1 本の平均値の外挿で、資金繰り表ではない。**実際に資金が詰まるのは平均ではなく特定の月**（賞与・納税・返済・設備投資が重なる月）。①**事業計画書（汎用）** — 算出根拠が空欄なら fatal（融資・補助金の審査で最も見られる項目）。利益>売上、3年で5倍超も警告。②**資金調達計画書（汎用）** — 必要資金（設備／運転）と調達（自己・借入・公的・補助金・その他）の**合計一致を検算**。補助金の精算払い・自己資金比率・元金の年返済額も出す。③**資金繰り表（12か月）** — **前月繰越を入力させず**必ず前月の翌月繰越から引き継ぐ（繰越の転記ずれは1か月狂うと以降すべて狂ううえ表としては辻褄が合って見える）。出す答えは「**何月に足りなくなるか**」1 点。**★ 実ブラウザ検証で実装のバグを 1 件発見**: 資金調達計画書の**書面の合計欄は空欄を 0 として集計するのに、検算側は空欄を「読めない」扱いにして判定ごと止めていた** → 表には差額が出ているのに何も指摘されない最悪の状態。空欄は 0、読めない文字のときだけ止める `money()` に分離。**単体テストは全欄を埋めていたため踏めない経路だった**（＝ブラウザ検証にしか出せない種類の穴）。**★ 網羅の穴も 1 つ塞いだ**: 交付前チェックの網羅テストが手書きの `RULE_IDS` を回しており、ルールを足して入れ忘れると静かに検査から外れていた。実際 **議事録 3 件（sokai / rinji-sokai / torishimari）は `meetingQuorum(...)` 代入のため元から漏れていた**。`ruleDocIds()` を露出して突き合わせるようにした。**mutation**: cashPlan 100%（144）／docStudioChecks 100%（820）維持。等価ガードを 3 つ削除（`need !== raise` が「両方0でない」を既に吸収／自己資金比率は 0/0・x/0 の退化に依存していたので `self * 10 < raise` へ／年次ループは添字上限でなく年そのものを回す）、最小残高は `Math.min` に畳んだ。実 chromium 16 項目通過。**成果**: テスト 6,575→**6,633**（静的 6,448→6,500）、書式 45→**48**、mutation 対象 9 モジュール目、E2E 18/18、全 13 ゲート green |
| **前回の作業** | 📊✅ **勘定科目から損益計算書・貸借対照表を作れるようにした（`data/statementAccounts.ts` 新設・mutation 100%）** — 既存の `financialStatements.ts` は**すでに分かっている**営業利益・経常利益・総資産を表示行に整形するもので、財務分析の比率・チャートと入力を共有するためにある。つまり決算書を**読む**道具で、**作る**道具ではない。作る側が無いと次の 3 つは原理的に検出できない: ①**貸借不一致**（総資産と純資産を別々に受け取る限り差額は生じようがない）②**二表の連結**（当期純利益が繰越利益剰余金に入っているか）③**区分の誤り**。標準科目 56 件を区分つきで持ち、区分合計 → 段階利益 → 貸借対照表まで通す。期末商品棚卸高・減価償却累計額・貸倒引当金は控除項目として区分の中で差し引く。**★ 検算で一番効くのは貸借差額の扱い** — 差額がちょうど当期純利益と一致したときに「繰越利益剰余金の期首残高に当期純利益を二重に足しているのでは」と名指しする。初めて決算を組む人がほぼ必ず一度は踏む間違いで、差額の金額を見ても原因が分からない類のもの。ほかに債務超過・売上総損失・税引前損失なのに法人税等・赤字期の配当・マイナス残高（控除科目を除く）。UI は**書類スタジオの 4 つ目のコレクション**（印刷/PDF・永続化・事業仕分けをそのまま再利用）。決算書の仕分けも 1 行足し、計算書類の作成自体は独占業務でない一方、申告書の作成と税務代理は税理士・法定監査は公認会計士の独占であることを書き分けた。**mutation 100%（534 変異体・pragma 0）**。到達の過程で**出荷コードとして死んでいたものを 2 つ削除**: (a) 科目名と区分の食い違いを実行時に検査していたが、`ACCOUNTS` は定数なので間違いはビルド前に決まっており**実行時には発火しようがない** → 検査はテストへ移した（負のコントロール付き）(b) 指摘の並べ替えを sort でしていたが push の順が既に fatal→warn→info で**何も並べ替えていなかった** → 順序をテストで固定して sort を削除。実 chromium 15 項目通過（貸借一致→崩す→差額表示の往復を含む）。**成果**: テスト 6,513→**6,575**（静的 6,386→6,448）、mutation 対象 8 モジュール目、E2E 18/18、全 13 ゲート green |
| **前回の作業** | ⚖️✅ **事業仕分けを「自社でやるか、士業に頼むか」の逆引きにした（`data/businessTriage.ts` 新設・mutation 100%）** — `professionalMap.ts` は士業→担当領域の**名簿**で「税理士は何をするか」に答えるが、実務で先に来る問いはその逆で、「いま作ろうとしているこの書類、自分で作って出していいのか。どこから先は頼まないといけないのか」である。45 書式が揃ったいま、その逆引きが無いのが最大の穴だった。**45 書式 + 定款2種 + 就業規則の 48 件すべてに仕分けを付けた**。**判定の軸はひとつだけ — 自社分か、他人のために業として行うか**。士業法の独占規定はいずれも「他人の求めに応じ」「業として」を要件に置く（税理士法2条1項／社会保険労務士法27条／司法書士法73条／弁護士法72条）ので、**自社の書類を自社の名で出す分は原則どの独占にも当たらない**。この事実を先に出さないと、作れる書類の前で手が止まる。逆に**形式だけ本人名義にしても実質が他人からの依頼なら同じく制限を受ける**ことも併記した。**断定できないものは断定していない**: 紛争性の有無（弁護士法72条）と、登記添付書類として作るのか社内保管なのか（司法書士法3条1項2号）で結論が変わるものは `caseByCase` に事実だけ置き、どちらにも寄せない。**根拠の二重管理をしない** — 士業ごとの根拠法は `PROFESSIONAL_MAP[id].law`（検証済み）をそのまま引く。新たに足した条文は上記4本と社会保険労務士法2条1項2号（帳簿書類。就業規則・労使協定・雇用契約書が例示に含まれる）および同項3号（相談・指導は**27条の制限対象外** ＝ 労務相談は独占ではない）のみ。**★ 自分のテストがデータの矛盾を 2 件捕まえた**: 契約系は全行で行政書士が exclusiveTo と consult の両方に載っていてどちらの意味か読めなくなっていた／賃金規程だけ「自社分は制限されない」の一文が抜けていた。**mutation 100%（303 変異体）**。到達の過程で 2 つ単純化: (a) doc の索引を Map からやめて線形探索に（48 行しかないうえ、モジュール初期化時に索引を組むと壊れたとき import の失敗になり「テストが 0 件」で素通りする＝罠 2-b と同じ形）(b) 逆引きが受け取るプロファイルを差し替え可能にした（全 duty が link を持つため `duty.link?.` が現データでは死んでおり、テストから link 無しを通せる seam を入れて観測可能にした）。UI は**決定が行われる場所**＝書類スタジオの交付前チェックの隣に置いた。実 chromium 13 項目通過。**成果**: テスト 6,473→**6,513**（静的 6,352→6,386）、mutation 対象 7 モジュール目、E2E 18/18、全 13 ゲート green |
| **前回の作業** | 🧊✅ **3D 立体図の生成をアプリへ統合 — `buildingIso` 新設・mutation 100 %** — 前段で作った図面集の分解アイソメは**アーティファクト内の静的 SVG** で、アプリは持っていなかった。座標計算を純関数に切り出して本体へ移した。**① `projectIso`** 等角投影（X=(x−y)·cos30·s ／ Y=(x+y)·sin30·s−lift）**② `buildIsoModel`** 階ごとのプレート・側面・室ポリゴン・上下階の補助線を生成 **③ `checkFloorFit`** 室面積の合計と外形の一致検査 **④ `buildSchematicFloors`** `planFactory` の算定値（作業場／1F 残／上階）から模式的な階構成を導く。**★ 検査が実際にミスを捕まえた**: 図面を手で起こしたとき案 B 2F のコアを L 字ではなく 1 枚の矩形で定義してしまい、**面積表 228 ㎡ に対し図形の合計は 216 ㎡** という 12 ㎡ の隙間が生まれていた。数字だけ合っていて図が埋まっていない状態は目視では気づけない。だから投影と一緒に面積突合を機械化し、UI 側も不一致なら**赤字で警告を出す**（それらしく描いて黙るのが最悪）。**mutation で 3 種類の穴**: (a) 投影 Y の `*s` を `/s` に変えても「> 0」しか見ていなかったので通過 → 実値アサートへ (b) `n > 0 ? n : 0` と `Math.abs(diff) < 0.05` はいずれも**等価変異** → `Math.max` と厳密一致に置換して分岐を削除 (c) 端数ループの `> 0.05` は浮動小数の残差で境界に到達できず区別不能 → 残余を `round1` してから `> 0` にし、**境界を実在させて**変異を殺せるようにした。結果 **buildingIso.ts は 154 変異体すべて撃墜で 100.00 %**。**型で解いた点**: `noUncheckedIndexedAccess` に対しガード分岐を足すと到達しない分岐が変異として残るため、`outline` を **4 点タプル型**にし、補助線の組み立ては添字ではなく `prev` を持ち回る形にした。**UI**: 不動産ページに「🧊 立体プレビュー」を追加し、敷地プランナーの算定値からその場で立体化する。**実機検証 10 項目通過**（SVG 221×320・polygon 14・面積不整合なし・JS エラー 0）。**成果**: テスト 6,091→**6,133**（静的 6,006→6,048）、mutation 対象に buildingIso を追加、全 13 ゲート green |
| **サービス数** | **74**（cursor / charts を追加 — `verify:arch` の live metric と一致。smoke が 72 枚なのは `uber-eats` / `demae-can` が BusinessPage 内部消費で**サイドバー項目を持たない**ため） |
| **Knowledge Vault** | 7,535 files（知識 4,141＋人物・出典・年表・パス・教育・MOC/組織。統合パス4〜32 で 92 概念分のノートが統合先へ吸収。パス6 の出典差し替えで出典ノートが再編） |
| **開発ブランチ** | `claude/eager-brown-7cev3c` |
| **累積 PR** | [#707](https://github.com/hiroto1977/-/pull/707) は **2026-07-24 マージ済み**（merge commit `4346e152`）。ブランチ `claude/eager-brown-7cev3c` は main へ仕切り直し済み — **以後の作業は新規 PR**（マージ済み PR への積み増し禁止） |
| **次のアクション** | ①~~増強バックログの消化~~ → **2026-08 完走。`knowledge:auto` は「✅ 全て最新 — LLM 作業なし」を出力し、増強・再検証・asOf・重複疑い 3 系列・出典衛生・リンク切れの 8 キューすべてが 0 件**（学術 415+法令実務 89 の全 504 件を消化し、その過程で重複統合パス12〜32・誤実体 DOI の検索確定修正・簡体字混入の全面修正を随伴） ②**新規概念 Batch 724** ③**単発誤 DOI の掃討**（`lint:citations` は同一 DOI に年の矛盾があるときだけ落ちるので、**1 回しか引かれていない DOI の誤りは原理的に検出できない**。今回 `10.2307/j.ctt1hj9w84` が偶然見つかったように、2,449 件の引用の大半が単発。接頭辞と誌名/出版社の整合性は機械判定できるので、そこを検査するゲートを作るのが次の恒久対策） ④`stillUnverified` の JSTOR 8 件（出典自体は差し替え済み、真の所有者が不明なだけ） ⑤`e2e` / `e2e:lite` / `e2e:ollama` / `perf` / `smoke` は実ブラウザ・Electron が要るため CI 外 — renderer や起動性能を触ったらローカルで回すこと |

### 📜 直近の完了履歴 (新しい順・ダッシュボードから移設)

- 📄✅ **経営に必要な書類を法定義務の側から埋めた（法定三帳簿＋計算書類4点）** — **知っているのに作れない状態を潰す**のが主眼。`complianceKnowledge.ts` には「法定三帳簿の作成・保存義務（労基法107〜109条）」が検証済み知識として入っていたのに、**書式が 1 つも無かった**。①**法定帳簿 4 書式**を追加（48→52 書式・人事6→10）: `roudousha-meibo` 労働者名簿（規則53条の9項目。30人未満は「従事する業務の種類」不要＝53条2項なので、空欄でも責めずに例外を案内する info にした）/ `chingin-daichou` 賃金台帳（規則54条。**時間外・休日・深夜は労働時間数の内数**なので、合計が労働時間を超えたら warn — 別枠で足すと総労働時間が二重計上になる）/ `shukkinbo` 出勤簿（自己申告なら客観的記録との乖離是正を求める。安衛法66条の8の3 で管理監督者も把握対象）/ `yukyu-kanribo` 年次有給休暇管理簿（規則24条の7。**付与10日以上で取得5日未満は fatal** — 労基法39条7項・120条で労働者1人につき30万円以下の罰金。「本人が希望しなかった」は理由にならない旨まで書く）。②**会社法435条2項の計算書類を 2 点 → 4 点**に: `data/statementEquity.ts` で**株主資本等変動計算書**と**個別注記表**を同じ科目残高から組む。**期首残高は入力させない** — 試算表から入るのは期末残高なので、期首は「期末 − 当期変動額」で逆算するのが唯一ずれない道筋（両方入力させると内訳と食い違う期首を書けてしまう）。当期末残高は貸借対照表の純資産の部そのものを使うので二表がずれない。検算は **会社法445条2項・3項**（払込額の2分の1を超える額は資本準備金にできない）と**同4項**（配当により減少する剰余金の10分の1を準備金として計上）。③**決算公告（貸借対照表の要旨）**を同じ集計値から生成（会社法440条1項・2項）— 公告した数字が決算書と違う事故を構造的に起こさない。④**★実バグ 1 件**: 決算書コレクションの入力が `store.shugyo` に書かれており、**就業規則と入れ物を共有**していた（どちらも `company` を持つので会社名が混線し、科目残高が就業規則側に溜まる）。`StoreShape.kessan` は宣言されていたのに読み書きが繋がっていなかった。**成果**: テスト 6,660→6,726（静的 6,527→6,585）、`docStudioChecks` / `statementAccounts` / `statementEquity` を **mutation 100%**、全 13 ゲート green。⑤**Stryker の罠を 2 件記録**（罠 2-d: `--mutate` の複数指定は最後だけ有効 / 罠 2-e: `-x` は -0 を作る）
- 🔍🛠 **「残作業は無いか徹底的に解析して」→ 全体監査で 3 つの実害を発見して修正** — ドキュメントの記述を信じず実測した。**★ 最大の発見: `verify:all` の 13 ゲートのうち 3 つが `ci.yml` に無く、PR で一度も走っていなかった** — `lint:citations` / `lint:knowledge-refs` / **`verify:knowledge`（確証ゲート＝出典2件以上・権威1件以上。CLAUDE.md 自身が「このコーパスの価値の土台」と書いている）**。CLAUDE.md には「typecheck + all verify/lint」と書いてあったので、記述を読むかぎり気づけない。**ゲートが存在するのに何も守っていない**状態だった。3 つを ci.yml に追加し、**恒久対策として `lint:docs` に「`verify:all` の全ゲートが ci.yml で実行されていること」の検査を新設**（負のコントロール 2 本: ci.yml から 1 つ抜く／verify:all にだけ足す、どちらも exit 1 を確認）。**② 検出器が両系列ですり抜けていた重複 1 ペア**: `infosoc-datafication-mayer-schoenberger` ⇔ `-schonberger`（ö の翻字ゆれ）。titleCore は「データ化」vs「データフィケーション」で不一致、term-overlap も閾値未満。統合し（本文 434→621 字・減少ゼロ）、恒久対策に `idDedupeSuspects`（id 正規化で人名の翻字ゆれを検出）を autopilot へ新設＝重複疑いキューが 3 系列になった。**③ 実装済みなのに「Phase 6 で予定」と言っていた記述 2 件**（`shigyoTypes.ts` / `snapshot.ts`）を是正 — Phase 6 の士業 CRM は `useCollection` で IndexedDB 永続化済み。**副産物の誤 DOI 1 件**: `10.2307/j.ctt1hj9w84` の実体は Schonfeld, Bowen & Varian『JSTOR: A History』(Princeton UP) で Mayer-Schönberger & Cukier ではない。**1 回しか引かれていない DOI は `lint:citations` では原理的に検出できない**（年の矛盾が生じない）ため、統合時に移送しないという判断で回避した。**測れなかったこと**: 今回追加した 26 URL の死活はこの環境からは検査不能（proxy が全ホストを遮断し `000ERR`）。`knowledge-auto.yml` が週次で `--links=100` を回すので、そこで順次検査される。コミット済みの `knowledge-queue.json` は `linksChecked: 0` なので、**その「リンク切れ 0 件」は偽の安全信号**である点に注意
- 📕✅ **出典ベースラインを 0 件にした — 残 17 件すべてを一次照合し、誤出典 28 箇所を差し替え** — 「DOI 接尾辞の完全一致検索で実体を先に確定 → そのうえで主張者を個別照合」という前パスで確立した手順を、残っていた 17 件に総当たりで適用した。**最大の発見: 5 件は全主張者が誤りだった**（`10.1093/he/9780198876984.001.0001` の実体は **Phillips (2023) The Cooperative Neuron**（OUP の神経科学書）で、これを引いていた Sweet & Maxwell の契約法テキスト 6 件は全滅／`10.1093/ojls/gqi037` の実体は **OJLS 25(4) 2005, 793–813 の雑誌論文**で、書籍 Gower & Davies 4 件は全滅／`10.1177/2053951714528481` の実体は **Kitchin (2014) Big Data & Society 1(1)** で boyd & Crawford 2012 と van Dijck 2014×3 は全滅／`10.1145/3313831.3376600` の実体は **Di Geronimo et al. (2020) UI Dark Patterns and Where to Find Them** で Gray 2020・Mathur 2019 とも誤り／`10.2307/2937686` は Deaton (1991) の実 DOI が `10.2307/2938366` だと判明したため両主張者とも誤り）。**つまり「年が矛盾している ⇒ どれかが正しい」は成り立たない**。**正 DOI を確定した 11 件**: Barney 1991→`10.1177/014920639101700108`／Van Alstyne & Brynjolfsson 2005→`10.1287/mnsc.1050.0363`／boyd & Crawford 2012→`10.1080/1369118X.2012.678878`／van Dijck 2014→`10.24908/ss.v12i2.4776`／Samuelson 1954→`10.2307/2226834`／Hannan & Freeman 1977→`10.1086/226424`／March 1991→`10.1287/orsc.2.1.71`／Deaton 1991→`10.2307/2938366`／Mathur 2019→`10.1145/3359183`／Carpenter et al. 2004→`10.1016/j.jm.2004.06.001`／Obstfeld & Taylor 2004→`10.1017/CBO9780511616525`。**DOI が存在しない 9 件**（Sweet & Maxwell の法律書・AER 1972/1990・Princeton UP 書籍など）は ISBN↔版↔刊行年をそれぞれ照合したうえで WorldCat / RePEc / 出版社ページに差し替えた（**推測で DOI を付けない**）。**ラベルのみの誤り 2 件**: `10.5465/amj.2016.0594` は DOI が正しく著者名が誤り（Smith は共著者で第一著者ではない → Miron-Spektor et al. 2018 に修正）、`10.1177/1527476418796632` は同一著作の online-first 2018／号 2019 の表記ゆれのみ。**★ 台帳の疑いが的中**: `stillUnverified` に「存在しない疑い」と書いてあった Wikipedia 2 URL は**実際に存在しなかった** → `Organizational_decline` は Serra et al. (2017) BAR 14(2) のレビュー論文に（academic 2→**3**）、`Sorting_Things_Out` は MIT Press の書籍ページに差し替え。**出典構成の全数検査**: 3,584 エントリ中、構成が変わったのは 2 件のみで、減ったのは `infosoc-spreadability-jenkins` の academic 2→1 だけ。これは Jenkins「If It Doesn't Spread, It's Dead」が査読誌論文ではなく **2008 年 Convergence Culture Consortium ホワイトペーパー＋2009 年の連載ブログ**だったため `reference` に是正したもので、**水増しの訂正であって情報の喪失ではない**。**成果**: ベースライン 17→**0**（`lint:citations` が「矛盾ゼロ」を出す状態）、DOI 引用 2,452 件を全数検査、vault 7,670→7,672、edges 21,086→21,102、フル版 10.00MB 維持。テスト 6,064 passed・全13ゲート green。**＋続けて Gillespie 3 件も照合完了**（`lint:citations` が「同一著作が別 DOI で引かれている」を**意図的に検査しない**ため人手に残っていた分）。真の所有者を特定できなくても**出版社接頭辞から不整合は確定できる** — SAGE 誌の DOI が MIT Press の書籍章を指すことはなく、T&F 誌の DOI がSAGE 誌論文を指すこともない。`10.1080/1369118x.2010.508516`→`10.1177/1461444809342738`（Gillespie 2010 NM&S 12(3) 347–364）、`10.1177/1461444813490395` と `10.1177/1461444812437963`→ ともに `10.7551/mitpress/9780262525374.003.0009`（The Relevance of Algorithms, Media Technologies第9章 pp.167–194）。後者はラベルの刊行年も 2012→**2014** が正で、直さなければ新たな年の矛盾を作ってゲートが落ちるところだった
- 🏁🔬 **重複疑いキューを 0 件で完走 + 誤 DOI の「実体」を確定して 3 エントリを修正** — 残っていた重複疑い 2 件を全文読解で裁定・適用（`econ-impossible-trinity-obstfeld`→`econ-monetary-policy-trilemma` / `mgmt-3c-analysis`→`mgmt-3c-model-ohmae`）。PR #731 で確立した「先に検証を作る」手順を再適用し、事前スナップショット→適用→事後比較で**減少ゼロを数値で証明**: トリレンマは出典 5→7・権威 5→7・academic 4→5・本文 439→616 字、3C は出典 2→4・本文 1,008→1,116 字。移行漏れは文字列検査で個別確認（金本位制/ブレトンウッズの体制別具体例・資本フロー管理の政策論争・別名「国際金融のトリレンマ」「3C分析」・3C の実務分析項目）。**★ 本題**: 削除予定エントリがベースライン登録済みの DOI `10.1017/CBO9780511559747` を持っていたため事前照合したところ、**この DOI の実体は Rogers (1989) Money, Interest and Capital**（Cambridge, Modern Cambridge Economics）で、これを引いていた 3 エントリ（Leijonhufvud 1968 / Moore 1988 / Obstfeld & Taylor 2004）は**全部誤り**だった。**教訓**: 同一 DOI に複数の出版年がぶつかっているとき「候補のどれかが正しい」保証はない — **まず DOI の実体を確定し、そのうえで各主張者を個別に照合する**。照合手段は **DOI 接尾辞の完全一致検索**（`"CBO9780511559747"`）で、検索要約の主張ではなく**索引が返すページ実体**を証拠とした（api.crossref.org / api.openalex.org / doi.org はいずれも egress 403、Cambridge Core と archive.org は WebFetch 403 で到達不能 → WebSearch のみが使える環境での照合手順）。**修正**: Leijonhufvud 1968 は Oxford UP 刊で DOI なし → Internet Archive 書誌（ISBN 0195009487）、Moore 1988 は CBO DOI を確定できず → Internet Archive 書誌（ISBN 0521350794）＋書評論文 Bindseil & König (2013) ROKE 1(4) 383-390 の実 DOI `10.4337/roke.2013.04.01` を追加（academic 1→2 で確証が上がった）、Obstfeld & Taylor 2004 は正 DOI `10.1017/CBO9780511616525` を同じ完全一致検索で確定して統合先へ移行。**成果**: 概念 3,586→3,584、重複疑い 2→**0**、ベースライン 18→**17**、vault 7,673→7,670、フル版 10.00MB 維持、増強待ち 504（横ばい）。テスト 6,064 passed・全13ゲート green
- 🔀✅ **MERGE 22 件を実行 — ただし「情報が減っていないこと」を数値で証明してから** — 「今まで学習した全てを踏まえて最適化」を承け、このセッションの教訓（①存在確認ではなく機能確認 ②台帳は双方向に検証しないと腐る ③件数チェックは内容チェックではない）を統合作業そのものへ適用した。**手順を反転させた**: 先に検証を作り、統合を自己証明にした。(1) **事前**に全 18 keep の出典数・権威出典数・記述長をスナップショット (2) 統合適用 (ADD_SOURCES 20 行 / REPLACE 26 箇所 / DELETE 22 件) (3) **事後**に前後比較し「1 つも減っていない」ことを検査。結果は **全 18 keep で全項目が増加または同等** — 特に `econ-is-lm` は権威出典 1→2 (それまで唯一の academic 出典が大学の講義ページだった) で確証ゲートの水準が上がった。`human-stress-coping` は Lazarus & Folkman 1984 の**原典が入っていなかった**ので 3→5 件。**意図的に移送しなかった出典がある**: drop 側の Antras 2004 (Journal of International Economics の DOI が付いていた) と Mundell 1963 (keep と異なる JSTOR ID) は誤りなので、drop ごと消えるほうが正しい。**踏んだ罠**: 出典ラベルに `Mr. Keynes and the 'Classics'` の一重引用符があり TS リテラルを破壊 → typecheck が即検出。エスケープを入れ、さらに**全置換文の中身を事前に静的検査**する手順を追加 (区切り文字と中身の引用符を区別)。**★ 恒久対策**: 統合前に「distinct-pairs 台帳が削除予定 id を 3 ペア参照している」ことを手で見つけた。次も気づける保証がないので `lint:knowledge-refs` を新設 (verify:all 12→**13 ゲート**)。台帳が実在しない id を指したら落ちる。負のコントロール (存在しない id を混ぜると exit 1) も確認済み。**成果**: 概念 3,606→3,586、重複疑いキュー **20→2** (残 2 は統合で記述が充実し新たに閾値超えした次パス候補)、増強待ち 509→504、vault 7,710→7,673、フル版 10.25→10.00MB・DCL 364→**349ms**。テスト 6,064 passed・全13ゲート green
- 🔬 **出典の誤り 13 件を一次照合で確定・修正し `lint:citations` を新設 (PR #729 マージ済)** — `WebSearch` は通ることに気づき DOI 照合のブロッカーを解除。**DOI が別論文を指す 9 件**（Weitzel&Jonsson は 2 つとも AMR 帯で ASQ 論文にありえない／Bourgeois 1981 は 2 つとも ASQ 23(4) 1978 内の別項目／Keynes 1929 の一方は EJ 42(166) 1932）**書籍に他誌 DOI 2 件**（`10.1177/0306312706056047` の実体は Gillespie 2006 SSS）**人名 2 件**。根本原因は確証ゲートが件数と種別しか見ていなかったこと → **1 DOI = 1 著作 = 1 出版年**を検査。既存 18 件はベースラインに明示列挙し双方向設計で腐敗を防止

- 🎉 **PR #707 を代理マージ** (ユーザー委任「代わりに押してください」・merge commit `4346e152`・72サービスが main 到達) → 直後の Pages run #693 が `build:landing` 自己検証で失敗。**原因** = build-landing.cjs が士業連携カテゴリに未追従 (countEntries 正規表現と CATEGORY_LABEL/ORDER が featured/tools/integrations 固定 → 70 parsed vs 62 counted)。**修正** = CATEGORY_ORDER から正規表現を導出 + professionals 追加 (サイドバー順) + unknown-category ガード新設。**再発防止** = ci.yml に Pages 専用ビルド検証を追加 (landing/デモ3種/lite + フル・lite 両サイズ検査) — pages.yml は main 限定で PR CI の死角だったため。pages.yml 全手順 (full→退避→lite→復元→landing→デモ3種→_site 組立→inject-pwa) をローカル通し検証済み。**→ 第2障害 (ユーザー報告「スマホ版とフル版が大量のコードが表示されるだけで開けない」)**: inject-pwa.cjs が `indexOf('</head>')` でバンドル JS 内のテンプレート文字列 (Stocks/事業ダッシュボードの HTML エクスポート `...</head><body>...`) にヒットし、PWA タグ (実 `</script>` 入り) を位置 65,384 = JS の真ん中へ splice → module スクリプトが強制終了し残り 1.6MB がテキスト表示。**修正** = 実 `</head>` 検出 (最後の `</script>` 以降の最初の `</head>`) + moduleScriptRegion バイト一致の破壊検知 + `injectPwa.test.ts` 6テスト (静的 5695)。検証は chromium 描画プローブ (scratchpad/render-probe.cjs: ローカル HTTP 配信 + phone viewport で _site 3ファイルの inputs/rootChildren/pageerrors を確認) — **e2e もアーティファクトも注入前ファイルを見るため気づけない盲点**だった。残ノイズ: standalone の CSP が sw.js worker 登録を拒否 (catch 済み・動作無害・manifest によるホーム画面追加は機能)
- 🚀 最適化スプリント (今まで学習した全てを踏まえたシステム最適化): ①Playwright E2E をリポジトリ常設化 — `npm run e2e` / `e2e:lite` (scripts/e2e/core.cjs・desktop/phone/tablet 3プロファイル・18チェック・chromium 不在は exit 2) ②GitHub Pages にモバイル配信を追加 — pages.yml が `/lite.html` (2.2MB) を公開 (フル版退避→lite 生成→復元の順序必須・PWA タグも注入) ③PR #707 のタイトル/本文を全成果反映に刷新 ④引継ぎの旧履歴を本リストへ分離 ⑤新規純関数の mutation 実測: zoningPlanner 97.1% / investments 73.7% / shigyoDirectory 78.5% → **その後 `1632c7fb` (2026-07-25) で 3 モジュールすべて 100% 化して stryker.config へ登録済み** (survived だった丸め境界・エラー文言・既定値系をテストで塞いだ)
- 🪶 スマホで開けない対応 = **LITE ビルド新設**: `npm run build:web:lite` (SERVICE_HUB_LITE=1) が vite の academicJsonParse transform で学術コーパスを空化し **10MB→2.2MB** の `dist/standalone-lite.html` を生成 (型は実ソースで tsc 済み・コンプラ/補助金/相談窓口/経済史ナレッジは搭載维持・初期表示1.2s)。🧭 アーティファクトは以後 **LITE 版を配信** (スマホが主用途のため)・フル版はファイル配布。**罠**: フル `build:web` は emptyOutDir で dist/ を掃除するため lite を先に退避すること。dist/standalone-lite.html は gitignore (dist/* 除外・!standalone.html のみ追跡)
- 📱 モバイル最適化 v2 (今セッション新設UIの総点検): styles.css に `.field-grid` (フォーム列 auto-fit minmax 160px・input幅は !important で100%) と `.stat-grid` (Statカード列 auto-fit minmax 150px) を新設し、RealEstate/MutualFunds/ShigyoConsole の固定 flex行+repeat(N,1fr) 34箇所を一括変換。768px以下の input font-size 16px は **!important 化** (inline fontSize:13 が iOS 自動ズーム防止を迂回していたのを修正)。E2E 13チェック (phone412: 横スクロールなし・計算フォント16px・KPI 2列折返し・タップで物件/専門家追加、tablet834: 3列活用)。**罠**: python 置換で raw string の \" が JSX に混入し1箇所構文破壊 → 修正済み (正規表現置換後は必ず typecheck)
- 👥 士業CRM Phase 6 実装: `data/shigyoDirectory.ts` (SHIGYO_CONTACTS/CONSULTATIONS コレクション・serviceId で8士業を1コレクション同居・parse検証+8テスト) → 共有 ShigyoConsole に**専門家の追加/編集/削除**フォームと**相談履歴の追加/インラインステータス変更/削除** (日付降順ソート・デモ行はバッジ区別・ヘッダ連携数は結合数)。UI の「Phase 6 で対応予定」約束を解消 — 1コンポーネント修正で8ページ全対応。E2E 9チェック (追加→ヘッダ反映→編集→相談記録→降順→ステータス変更→リロード永続→他士業ページへ非漏出)
- 🌱 敷地プランナー (植物工場×近隣商業の検証付き): `shared/zoningPlanner.ts` (planSite/planFactory 純関数+14テスト) を不動産ページに実装 — 建ぺい率/容積率/前面道路12m未満の6/10・4/10制限/角地・耐火+10%/80%×防火×耐火=100%特例 → 建築面積・延べ床上限、作業場150㎡クランプ+直売/上階配分+overCap警告。**一次資料検証済み**: 150㎡は法48条9項+別表第二(り)項1号→(ぬ)項2号引用 (日刊新聞印刷所・300㎡以下自動車修理工場は例外)・「危険性…おそれ」句は法文でなく概要表ラベル・建蔽率は53条1項3号の60/80二択・容積率は52条1項2号の100〜500メニュー・作業場は実作業部分のみで事務所等不算入が一般的取扱い・植物工場の工場該当性は特定行政庁判断 (令2 国住街80号技術的助言)・見落とし=近商の日影規制 (高さ10m超・商業は対象外)/騒音規制法特定施設届出/駐車場附置義務条例/工場立地法は農業不適用
- ✍️🔄 投資データの任意入力⇄自動反映: 両ページのフォームを追加⇄**編集**兼用に (ユーザー行の「編集」→プリフィル→保存で KPI へ即時自動反映・キャンセル可)。投信の評価額は **ValuationMode (auto/manual)** — 空欄なら口数÷1万×基準価額で自動計算・直接入力ならその値 (セルに 自動/手動 マーク・編集で空欄に戻せば auto 復帰)。manual では口数・基準価額は任意。holdingToForm/propertyToForm で form 往復等価をテスト固定 (+6 → 静的5667/実行時5752)。E2E 11 チェック (編集の KPI 反映 343k→393k・手動30万追加→auto 切替 8,540,140→8,640,140→復帰)
- 🏠📈 不動産投資/投資信託の任意追加: `data/investments.ts` 新設 (PROPERTIES/HOLDINGS コレクション・parse検証・ポートフォリオ再計算の純関数)。両ページに追加フォーム+削除+KPI 即時再計算 (useCollection = IndexedDB record store 永続・端末内のみ)。**不変条件テストで固定**: ユーザー行 0 件なら snapshot 手書き集計値 (月次CF 243k/利回り6.15/入居率0.75/評価額8,240,140/損益率14.8) と完全一致 — 利回りは物件ごと小数1位丸め後に平均、投信評価額 = 口数÷1万×基準価額。snapshot 行は「デモ」バッジ・ユーザー行のみ削除可。テスト+15 (`investments.test.ts`)。E2E 15 チェック (追加→KPI→リロード永続→削除→復帰・phone 横スクロールなし)
- 🧾 経営サマリー税セクション拡張: FinancialAnalysis の税カードを「法人税等＋消費税」に拡張 — 既存の検証済み純関数 `compareBusinessTaxMethods` (shared/taxConsumptionBusiness) を再利用し、本則/簡易(第1〜6種・加重みなし仕入率)/2割特例の納付見込み比較・最有利チップ・免税判定 (基準期間1,000万円)・簡易適用可否 (5,000万円)・「税負担 合計（法人税等 ＋ 消費税）」を表示。既定入力 = 課税売上=年商・課税仕入=費用−給与−償却−利息 (編集可)。消費税は預り金性質のため税引後利益とは別建て (注記)。テスト+10 (`FinancialAnalysis.consumptionTax.test.ts`)。**sandbox の electron 罠と回避 (解決済み)**: fresh コンテナは electron バイナリ DL が egress 403 で `npm ci` ごと失敗 → `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci` の後 `printf 'electron' > node_modules/electron/path.txt` を書けば `require('electron')` が正規インストール後と同じパス文字列を返し、vitest 全 241 ファイル (property.test.ts 含む 5,731 tests) がローカル完走する (vitest は Node 実行でバイナリを起動しないため結果は CI と同一)。実バイナリが要る `npm run dev`/`smoke` のみ CI・実機で
- 🎯 仕分け精度向上 (4並列エージェント・政府一次資料検証): duty 44 件に scope (独占業務/専門相談) バッジ、根拠法を条文特定。**発見済み修正** = 行政書士法は令和8年1月施行改正で旧1条の2→**1条の3** に繰下げ (アプリ反映済み)・司法書士の独占は裁判所提出書類の作成まで含む (3条1項1〜5号)・設立登記は911条/変更登記は915条・家事調停の代理は「原則」弁護士 (家事事件手続法22条の許可代理例外)・IT導入/持続化補助金は民間事務局宛で行政書士の独占外・事業再構築補助金は2025-03で新規公募終了→405事業に時点更新・ストレスチェックは2025改正で50人未満も義務化決定 (2028-05までに施行)・賃金台帳作成は2号独占。**追加 duty** = 税務調査立会い(税)・法定監査/IPO(会)・雇用助成金(社労・独占)・労働審判(弁)・相続登記義務化 76条の2(司)・酒販免許 酒税法9条(行)・経営力向上計画(診)・税関輸入差止 4条2項1号(理)。検証OK済み: 先願主義8条1項・先使用権79条・認定司法書士140万・古物商3条・食品衛生法55条・会計参与333条・無償独占通達2-1・経過措置80→70→50→30%
- ⚖️ 士業連携 最適化再構築: **公認会計士 (`cpa`) を 8 人目の士業として追加**（`createShigyoFetcher` 系一式＋snapshot＋CpaPage＋voice 語彙「こうにんかいけいし/かいけいし/かんさ」）。**サイドバーに専用カテゴリ「士業連携」を新設**（`ServiceCategory` に `professionals` 追加・おすすめ直下に常時展開・8 士業を外部サービス連携から移設）。**事業仕分けマップ `data/professionalMap.ts` 新設** — 8 士業それぞれに根拠法/独占業務/summary/duties（アプリ内機能への `servicehub:navigate` リンク付き 3〜5 件）を定義し、共有 `ShigyoConsole` に「担当領域 (事業仕分け)」セクション＋「他の士業に相談」クイックナビを追加（1 コンポーネント修正で 8 ページ全対応）。リンク先は SERVICES 実在チェック（uber-eats はサイドバー非表示のため business へ）。`professionalMap.test.ts` 7 テスト
- 🗂→📦 統合再構築: 3つの単体書類ツール（経営書類12・電子定款・就業規則）を `data/docStudioData.ts`（単一データソース）＋ `DocstudioPage`（1エンジン）として **アプリ内サービス docstudio に統合**（LOCAL_SERVICES・印刷は body.ds-printing・入力は localStorage）。＋🎯 法務書類ツール精度検証（4並列エージェント・政府一次資料）: 発見済み修正 = 下請法→**取適法**（2026/1施行・注文書と KB `legal-subcontract-act` を全面更新・手形払い禁止/従業員数基準）、インボイス経過措置 **80→70→50→30%**（令和8年度改正・KB `tax-invoice` 更新）、退職30日前は民法627条(2週間)に配慮した表現へ、定款認証手数料 2024/12改正（1.5万円区分＋全株引受文言を定款に追加）、ウェブ会議原則/48h/72h、簡易インボイス業種限定、休暇の書面明示。＋📖 就業規則メーカー出荷: `scripts/build-shugyokisoku-maker.cjs`（10章47条・年5日時季指定/育介2025(4月・10月)/カスハラ2026年10月先取り/減給91条制限/導入4ステップガイド）＋📜 電子定款メーカー出荷: `scripts/build-teikan-maker.cjs` → `dist/電子定款メーカー.html`（株式会社〔取締役会非設置・30条・6章〕/ 合同会社〔5章〕の定款を動的採番で生成。目的の号自動列挙＋附帯事業自動付加・公告方法切替・電子定款化手順ガイド＋根拠注意書き。body グリッドの暗黙列膨張バグを両スタジオで修正〔grid-template-columns 明示〕）＋🗂 経営書類スタジオ出荷: `scripts/build-docs-studio.cjs` → `dist/経営書類スタジオ.html`（契約4・経理4・組織3・規程1 の 12 書式。差込フォーム＋ライブプレビュー＋印刷/PDF。検証済みコンプラ知識を注意書きに反映 — インボイス税率別自動計算/2024労働条件明示改正/下請法3条書面/フリーランス新法60日ルール/会社法議事録/印紙税電子非課税。E2E 済み）＋📱 モバイル/タブレット最適化: ≤768px でサイドバーをオーバーレイ・ドロワー化（トップバー ☰ で開閉・ナビ/背景タップで自動クローズ・`App.tsx` の `navOpen`＋`styles.css` メディアクエリ）、タッチ最適化（`pointer: coarse` でタップ目標拡大・fav 星常時表示・`touch-action: manipulation`）、入力 16px（フォーカス時自動ズーム防止）、`100dvh`、`viewport-fit=cover`。Playwright で phone/tablet/desktop 3 幅 E2E 済み。＋🧾 業務自動化ダッシュボード出荷: Canva 設計図（POS→会計→CRM whiteboard）を `scripts/build-integration-demo.cjs` → `dist/業務自動化ダッシュボード.html`（単一ファイル・ダブルクリック起動・複式簿記/軽減税率/CRM LTV 実装・レスポンシブ）に実装。＋🔓 ロック画面「初期化してやり直す」＋🤝 全AI合議モード（前セッション）

### 🏡 AIの村（2026-07-05 出荷・見やすさ再設計 v2）

AI オーケストレーション組織 143 体（CEO/COO/役員5/秘書室20/管理職8/一般職108）をどうぶつの森風の
全画面シーンに村人として可視化し、画面に話しかけて対話できる 70 番目のサービス。
- `data/villageData.ts`（registry.json から純導出・決定論）＋`data/villageLayout.ts`（街区パッキング＋
  三角関数徘徊・乱数なし・`villageLayout.test.ts` 20 テスト）＋`pages/VillagePage.tsx`（絵文字/CSS/インライン
  SVG のみ・setInterval で徘徊＋PDCA タスクループ）。
- **見やすさ再設計 v2**（「もっと見やすくして」対応）: 143 体が細い列に密集して読めなかったのを解消。
  ①役員ごとの**建物カード**で街区分離（色ヘッダ＋チーム数）②街区内はチームを**部長ごとにクラスタ**配置
  ③**建物クリックで街区を全画面拡大**（チーム名まで読める・「← 全体マップ」で戻る）④足元の影＋名前チップ
  ⑤情景（太陽/雲/池/小道＝SVG、木/花＝絵文字）。`layoutDistrict`/`computeDistrictFocus`/`FOCUS_RECT` 追加。
- 音声（両対応）: `voice/speechAdapter`（認識）→`chatOrg.routeTopicScored` で担当キャラ選定→`chatbot.replyTo`
  即応＋AI 設定時 `assistant/chat`→`voice/ttsAdapter`（高品質日本語ボイス選択＋読み上げ整形・非対応は degrade）。
- バンドル制約順守: 大量データは足さず registry（既存 import）＋純導出のみ。standalone.html は ~10.0MB。
- **今後の大規模化（柱 B）は非バンドルの vault/knowledge-graph に置く**（`src/renderer/data` は standalone に
  インライン化されるため肥大化厳禁）。

### 🧹 知識ベース重複統合（2026-07-02 完了）

高スループットのバッチパイプラインの副作用で、同一概念が別 id で 2〜5 回収載されていた
（例: `econ-menu-cost`/`econ-menu-costs`、購買力平価 ×6、法人格否認 ×4、統計法令の `-act` 有無違い）。
機械監査（`scratchpad/audit_knowledge.py`）で検出し、**3 パスで計 725 件を統合**
（各クラスタで最も内容の厚い 1 件を残し薄い重複を削除。4,350→3,625・−16.7%）:
- **Pass 1**（タイトル bigram Jaccard・分野内）: 185 件。
- **Pass 2**（id-stem クラスタ → タイトルコア一致 or 著者一致＋類似）: 119 件。長い「——副題」で
  タイトルが乖離した重複・分野を跨ぐ重複（econ↔mgmt 等）を捕捉。
- **Pass 3**（残余 588 ペアを 98 エージェント Workflow で判定＋懐疑検証）: 421 件。
  判定 SAME → 独立の懐疑者が反証を試み、反証失敗のみ統合（469 確定）。**92 ペアは反証成立で保持**
  （例: 同一法理の日本法版と米国法版、追試危機の記述を片方のみ保有 — 削除すると情報が失われる対）。
  27 は判定段階で DISTINCT。ガードはペア単位（裁定済み別概念ペアの統合を機械的に阻止）。
- **保持した「同名だが別概念」**: 環境クズネッツ曲線≠クズネッツ曲線、電子消費者契約法≠消費者契約法、
  第二次デジタル・ディバイド、逆方向の法人格否認、同一労働同一賃金、March&Simon 行動的意思決定理論、
  Hotelling の法則（空間競争）≠ルール（枯渇資源）、Taylor 原理≠ルール、代理（民法99条）≠エージェンシー理論。
- 罠と対策: id-stem や著者一致だけでは同著者・別概念（Hotelling 法則/ルール）を誤統合する →
  **タイトルコア（括弧・副題除去後）一致**を第一シグナルにし、著者一致は補助に留める。
  検証は「drop id が code/test から参照されていないこと」「全生存概念が確証ゲート通過」を必須確認。

### 🤖 マルチエージェント AI ハブ (2026-07-02 再構築完了)

`assistant` サービスを **Claude / ChatGPT (OpenAI) / Gemini / Ollama / OpenAI 互換 API
(LiteLLM・Groq・DeepSeek・LM Studio 等)** を呼び分けるハブに再構築済み。

- **中核**: `src/shared/ai/`（providers.ts=プロバイダレジストリ+総当たり不変条件 /
  credentials.ts=JSON 資格情報(1スロット複数キー・生キーは Anthropic 後方互換) /
  chat.ts=runAiChat）。**新しい AI 呼び出しは必ずこの層を経由すること。**
- Electron main (`clients/assistant.ts`) とブラウザ (`web-shim.ts`) の両対応。
  ブラウザで CORS 不可の OpenAI/互換 API は BYO プロキシ経由。
- UI: AssistantPage にエージェント選択・接続チップ・⚙エージェント設定パネル
  (hub.setToken('assistant', JSON) で保存)。
- MCP コネクタ 25 個 + ChatGPT(mcp-remote)/LiteLLM ブリッジを ConnectorsPage で可視化
  (`src/shared/connectors/mcpConnectors.ts`、docs/MCP_SETUP.md と件数同期)。
- **修正した罠**: inline-html.cjs の standalone CSP が `connect-src 'none'` で
  ブラウザ版の全外部 API 呼び出しを無言でブロックしていた → https:+localhost 許可に修正。
- **残 follow-up**: ①business/stocks/skills/emotions アドバイザーの shared/ai 移行
  (エラー文字列・モデル既定まで mutation テストで固定されているため、opt-in の
  provider パラメータ方式で慎重に) ②shared/ai の Stryker mutate スコープ追加検討
  ③GH Pages 配信版 (dist/index.html) の CSP は connect-src 'self' のままで外部 API
  不可 — standalone.html の利用を案内するか要検討。

### 🎯 チャットボット回答精度 v2 (2026-07-02 完了)

`data/assistantContext.ts` の RAG を全面改良（4,300+ 概念コーパスを本気で活かす検索へ）:

- **IDF 重み** (`ln(1+N/(1+df))`・出現数キャップ 3) + **膠着語降格**（ひらがなのみ
  バイグラム w=0.2、内容語ヒット 0 の文書は除外）+ **フレーズボーナス**（内容語連続列
  「プロテウス効果」等のタイトル/本文一致を強加点）+ **近似タイトル代表化**
  (bigram Jaccard ≥ 0.6 で 1 件に絞る)。
- コーパスに **経済史 84 年分** (`economicHistoryKnowledge.ts`) を追加（5 種別に）。
  本文キャップ 320→600 字 + keyFigures + 第一出典ラベル `［出典: …］` を注入。
- system 指示を強化: ナレッジ最優先 + 末尾に「参照: 〈項目名〉（種別）」の出典列挙 +
  数値/年号/条文は記載どおり引用 + URL 創作禁止 + 曖昧時は確認質問 1 つ。
- **オフライン直答** `buildOfflineKnowledgeAnswer` (score ≥ 8 で上位 2 件を出典つき
  提示)。AssistantPage は `replyTo` が `kind==='fallback'` のときだけ前段で試す
  （危機対応・手取り計算・案内の決定論優先順位は不変 — ここを崩さないこと）。
- 追問対応: `send()` の RAG クエリは直前ユーザー発話 + 今回発話の連結
  (AI へ渡す会話履歴 turns とは別物)。
- テスト 15→33 (`assistantContext.test.ts`)。静的 it() 5,516→5,534・実行時 5,619。

**直近バッチ履歴**（詳細は PR #707 の説明欄に全件記載）:

| Batch | 概念数(累計) | 追加分野の概要 |
|---|---|---|
| 714 | 4,289→4,295 | 学校選択メカニズムデザイン／Ben-Porath／カンター・トークニズム／補償的制御理論／Say on Pay／ネットワーク議題設定 |
| 715 | 4,295→4,301 | バーゼル測定費用理論／連帯責任型グループ貸付／バーレイ技術構造化／社会情動的選択性／事業目的の法理／選好偽装理論 |
| 716 | 4,301→4,307 | バロン=マイヤーソン規制理論／ペルツマン効果／出来事システム理論／ユニモデル説得理論／クラウンジュエル防衛／CAT理論 |
| 717 | 4,307→4,314（7件） | イートン=リプシー／ヘックマン標本選択／TMX理論／組織的信頼統合モデル／プロトタイプ理論／補償条項/防御義務／カルチュラル・サーキット |
| 718 | 4,314→4,320 | 合成コントロール法／退職消費パズル／組織的美徳性理論／項目反応理論／シェルター・ルール／ネイティブ広告=説得知識モデル |
| 719 | 4,320→4,326 | 保護の販売モデル／純化定理／多市場接触=相互自制／精神病の予測符号化理論／SEC規則14a-8／プロテウス効果 |
| 720 | 4,326→4,332 | シェ=クレノウ ミスアロケーション理論／アリンガム=サンドモ脱税モデル／ジンメリアン・タイ／馴化（非連合学習）／完全履行提供の原則（UCC 2-601）／MAINモデル |
| 721 | 4,332→4,338 | クレマー人口成長と技術変化（1993 QJE・繰越）／オアハカ=ブラインダー分解／行動エージェンシー・モデル（Wiseman&Gómez-Mejía 1998）／潜在制止（Lubow&Moore 1959）／ノア・ペニントン法理／ウォーム・エキスパート（Bakardjieva 2005） |
| 722 | 4,338→4,344 | ボーモル=オーツ標準・価格アプローチ（1971）／チャムリー=ジャッド定理（資本所得税ゼロ）／時間ベース競争（Stalk 1988）／顔倒立効果（Yin 1969）／実体的併合（破産法）／アルゴリズム的アイデンティティ（Cheney-Lippold 2011） |
| 723 | 4,344→4,350 | ハーシュライファー情報の私的/社会的価値（1971）／マスキン単調性・遂行理論（1999）／イネーブリング官僚制（Adler&Borys 1996）／バイオロジカルモーション（Johansson 1973）／危険の引受（不法行為抗弁）／技術的コード（Feenberg） ※Diamond探索パラドックスは Burdett-Mortensen エントリと絡み合い過多で却下→Hirshleiferに差替 |

- 1 バッチ = 候補選定（フレッシュなニッチ複数案+フォールバック） → 6並列リサーチエージェント（各自 grep でデデュプ検証必須） →
  **自分で独立に再検証（別表現の grep で）** → ファイル追記 → `docs/ACADEMIC_KNOWLEDGE.md` 表更新 → ゲート全green →
  コミット → プッシュ → PR #707 の説明欄を最新バッチ履歴に更新 → **本ダッシュボード（概念総数・直近バッチ・
  Vault件数・直近バッチ履歴表）も更新**（新セッションが常に正しい現在地を見られるようにするため必須）。
- 最重要の罠（Batch 714-718 で実際に踏んだもの）:
  1. **id 衝突は title grep で見抜けない**（必ず id を grep）。
  2. **エージェントの「非重複確認済み」自己申告は信用しない** — Batch 715/716/718 で、エージェントが
     「grep で確認した」と主張した概念が実は **3件も既存重複していた**（MAC条項・context collapse・
     holder in due course・equitable subordination 等）。**必ず自分で改めて grep（別の言い回しで）
     再検証してから挿入する。**
  3. 意味的重複（例: 過剰正当化≒アンダーマイニング、preference falsification と pluralistic ignorance
     は近いが別概念——出典が別なら残す）は本文を読んで判断。
  4. リサーチエージェントの**著者名/出版社/条文番号の捏造**を書き込み前に点検。
  5. エージェントが返す `statement` に**文字数カウントの注記**（例:「（635文字）」）が混入することがある
     → 挿入前に除去。
  6. エージェントがファイルを無断修正する→プロンプトで「JSON/構造化テキスト返却のみ」と明示。
  7. 分野の取り違え（例: 経営学の概念を human-science 担当エージェントが提出）が起こりうる →
     出典ジャーナル（AMR/ASQ等は経営学、心理学誌は human-science）で最終判定。
  8. データベースが密になるほど、エージェントは**5〜30件以上の既出候補を潰してから**やっとクリーンな
     ものを見つける。1回の依頼で見つからなければ SendMessage でリダイレクト（新ニッチ提示）すればよい。
- ゲート: `vault:build && typecheck && verify:all && test && build:web`（詳細は仕様書参照）。

## 現状サマリ (69 services)

| 区分 | サービス |
|---|---|
| 🌟 featured (9) | home / business / teamradar / templates / library / settings / sales (売上集計) / team (チーム管理) / overview (経営サマリー) |
| 🔧 tools (12) | skills / security / cloudflare / emotions / ollama / kpi / stocks / real-estate / mutual-funds / quality / storage / tax (税務試算) |
| (統合) | uber-eats / demae-can 等は SERVICE_IDS・クライアント・snapshot・テストとして残存 |
| 🔗 integrations (48) | GitHub/WordPress/Atlassian/Notion/Drive/Calendar/Gmail/Slack/Canva + Microsoft 365/Dropbox/Salesforce/Discord/Asana/Linear/Sentry/Shopify/Stripe/LINE + 士業7 + EC/仕入/集客 + その他 |

**品質メトリクス:** 5444 静的 / 5529 実行時 tests passing · typecheck / ESLint clean · verify:all green (69 service tests + 178 file:line refs + 6 metrics) · standalone HTML ~5858 KB · knowledge-vault 3051 files · academicKnowledge.ts 2,279 concepts

**税務試算モジュール群 (`src/shared/tax*.ts`, すべて純粋関数・概算/税務助言ではない注記必須):**
所得税 (`taxCalc`)・控除 (`taxDeductions`)・各種分離課税 (退職 `taxRetirement` / 配当 `taxDividend` /
譲渡 `taxCapitalGains` / 公的年金 `taxPublicPension` / 雑 `taxCasual`)・消費税 (`taxConsumption`,
本則/簡易/2割特例; round 67 で事業者向け `taxConsumptionBusiness` を追加 — 複数事業の加重みなし
仕入率・軽減税率混在・免税判定 isTaxExempt/canUseSimplified・有利判定 compareBusinessTaxMethods)・
社会保険 (`taxSocialInsurance`)・ふるさと納税 (`taxFurusato`) に加え、
**round 54 で法人税等 `taxCorporate.ts` を追加**: 課税所得→法人税 (中小 800万以下15%軽減+超過23.2% /
大法人一律23.2%)・地方法人税10.3%・法人住民税 (法人税割7.0%標準+均等割 既定7万)・法人事業税
(段階別所得割 3.5/5.3/7.0%)+特別法人事業税37% を合算し、実効税率・税引後利益を `CorporateTaxBreakdown`
で返す。欠損 (所得0/負) は均等割のみ。年度定数は令和6年度ベースでコメント根拠明記。税率テーブルは
block-level `Stryker disable all`、計算ロジックは実テストで撃墜、income=0 早期returnの等価変異のみ
next-line 限定 disable → **mutation 100.00%** (`npx stryker run --mutate src/shared/taxCorporate.ts`)。
**round 55 で UI 統合**: `FinancialAnalysis.tsx` に `CorporateTaxCard` を追加し、
`fin.ordinaryProfit` (経常利益概算) を `calcCorporateTax` に接続。法人税等合計 / 実効税率 /
税引後利益の 4 タイル + 欠損時の均等割のみメッセージ + 内訳ラベルを財務諸表直前に表示。
taxCorporate.ts 自体は変更せず mutation 100% 維持。新テスト 15 件追加 (黒字/欠損 2 分岐)。
**round 56 で均等割を精緻化**: 法人住民税 均等割を固定7万 (or 任意指定) から、資本金等の額の
5区分 × 従業者数 (50人超/以下) の標準税率テーブル (令和6年度) に区分化。`resolveCorporatePerCapita
(capital, employees)` で「以上/未満」境界 (各区分下限+1円表現) で解決し、`resolvePerCapitaLevy`
が決定順を制御: perCapitaLevy 明示 → capital(+employees) 区分解決 → 最小7万。`CorporateProfile`
に `employees?` 追加。**既存の引数なし/perCapitaLevy指定の呼び出しは挙動不変**。テーブルは罠#2 に
従い block-level `Stryker disable all`、解決ロジックは下限走査+throwフォールバックの境界トリックで
実テスト撃墜 → mutation 100.00% 維持。新テスト 22 件追加。
**round 57 で繰越欠損金の控除を追加**: 青色申告で繰り越した過去最大10年分の欠損金を当期の課税所得から
控除する概算を加算。純粋ヘルパ `applyLossCarryforward(income, loss, small)` が控除後所得・実際の控除額・
繰越残額 (`LossCarryforwardResult`) を返す。中小法人は控除前所得の全額、大法人 (資本金1億円超) は
控除前所得の50% (`LARGE_CORP_LOSS_DEDUCTION_RATIO`) が上限。`CorporateProfile` に `carryforwardLoss?`
を追加し、`calcCorporateTax` は控除後所得に法人税等を課す (実効税率も控除後所得が分母)。
`CorporateTaxBreakdown` に `deductedLoss` / `incomeAfterLoss` / `remainingLoss` を加算。**carryforwardLoss
未指定/0/負は控除額0で従来挙動と完全に一致**。境界 (中小=全額/大法人=50%ちょうど・loss>income・
income≤0で控除0+全額繰越) を実テスト撃墜 → mutation 100.00% 維持。新テスト 19 件追加。
**round 58 で精度パラメータ入力 UI を追加**: `CorporateTaxCard` に任意入力欄3つ (資本金[円] /
従業者数[人] / 繰越欠損金[円]) を追加。`useState` で保持し、全欄空なら `profile` 未指定 (従来の
中小・最小均等割・控除なし と完全同一)、いずれか入力があれば `calcCorporateTax(ordinaryProfit, profile)`
に渡してライブ再計算 — 実効税率・税引後利益・均等割区分・繰越欠損金控除額・繰越残額の全内訳が即時更新。
`taxCorporate.ts` 自体は変更なし (mutation 100% 維持)。新テスト 32 件追加 (SSR 初期状態確認・
インタラクション大/小法人切り替え・繰越欠損金表示・純粋ロジック組み合わせ確認)。
**round 90 で印紙税 `taxStampDuty.ts` を新規追加** (純粋ロジック・IO なし): 印紙税額一覧表 (令和ベース)
の**本則**を階段表ルックアップで算定。`stampDutyAmount({documentType, contractAmount, isBusinessRelated?})`
が第1号 (不動産譲渡 realEstateTransfer) / 第2号 (請負 construction) の共通階段表 (1万円未満非課税〜50億円超
60万)・第17号 (領収書 receipt) の階段表 (5万円未満非課税・営業に関しないもの 0・記載金額なし 200)・第7号
(継続的取引基本契約 continuousBasicContract 一律4,000) を返す。`isStampExempt` で非課税判定。documentType
ホワイトリスト外・contractAmount 負値/非有限は throw。軽減措置は非対象 (本則のみ・概算/税務助言ではない注記)。
税額テーブルは罠#2 に従い block-level `Stryker disable all`、境界比較ロジックは区間上限ちょうど/+1円の実値
テストで撃墜 → mutation 100.00% (`npx stryker run --mutate src/shared/taxStampDuty.ts`)。新テスト 94 件追加。
**round 98 で相続税 `taxInheritance.ts` を新規追加** (純粋ロジック・IO なし): 法定相続分課税方式 (令和ベース)
で相続税の**総額**の概算まで。`inheritanceBasicDeduction(legalHeirsCount)` (3,000万 + 600万×人数)・
`INHERITANCE_TAX_BRACKETS` (速算表 8 区分 10〜55%)・`inheritanceTaxOnShare(taxableShare)` (1人分 = 金額×率−控除、
負は0)・`netTaxableEstate({grossEstate,debts?,funeralExpenses?,legalHeirsCount})` (課税価格−基礎控除、負は0)・
`totalInheritanceTax({taxableEstate,legalShares})` (法定相続分で按分→速算表→合算、100円未満切捨)・
`estimateInheritanceTax(...)` (統合: `{basicDeduction,taxableEstate,totalTax}`) を export。**配偶者の税額軽減・
小規模宅地等の特例・各人への按分後の納付額・2割加算は非対象** (総額の概算まで)。金額負/非有限・人数0以下/非整数・
legalShares 空/合計≠1.0/要素負 は throw。基礎控除式の固定値と速算表は罠#2 に従い block-level `Stryker disable all`、
按分・税率×金額−控除・100円切捨・基礎控除算式・要素ガードは国税庁計算例 (2億・配偶者1/2+子1/4×2 → 総額2,700万 等)
と境界 (各区分上限ちょうど/+1円) の実値テストで撃墜。許容誤差 1e-9 ちょうど (float 到達不能) のみ next-line pragma
→ mutation 100.00% (`npx stryker run --mutate src/shared/taxInheritance.ts`、72 killed / 0 survived)。新テスト 67 件追加。

## 財務分析システム (経営サマリー / OverviewPage 内, Phase 1–8 完成)

事業別の概算財務を起点に、15指標 → 4チャート → 12財務諸表 → 総合診断 → エクスポート まで
**同一の `FinancialInputs` に連動**する一気通貫システム。すべて純粋ロジック + ユニットテスト付き。
**全て「概算であり財務助言ではありません」を明記** (士業法の制約: 試算+一般情報のみ)。

- `data/businessFinancials.ts` — `deriveBusinessFinancials(月次KPI)` が年次 `FinancialInputs` を概算生成
  (PL×12 / BS は売上スケール + 自己資本比率を収益性で15–65%変動 / CF簡易間接法)。事業別BSデータが
  無いための案A (概算導出)。
- `data/financialRatios.ts` — `computeFinancialRatios` (基本15指標 + round68 精緻化: ROIC/デュポン分解/FCF/インタレストカバレッジ/当座比率/現金比率, 分母0・負・null→null) + `radarAxes` (15軸 0-100正規化, 健全度ベンチマーク)。
- `data/financialStatements.ts` — 12諸表ビルダー (PL/BS/CF/変動損益/包括利益/株主資本変動/四半期/個別注記/附属明細/勘定科目内訳) + `sumFinancialInputs` (連結=単純合算)。
- `data/financialDiagnosis.ts` — `diagnoseFinancials(axes)` 格付けS–D + 安全性/収益性/効率性 + 強み/弱み。
- `data/financialTrend.ts` — `analyzeMarginTrend(history)` 改善/横ばい/悪化 (履歴8期のためYoY不可→先頭→末尾pt差)。
- `data/financialCsv.ts` — `ratiosToCsv` (全事業×17指標) / `statementToCsv` (諸表)。`data/csv.ts` の `toCsv` 再利用。
- `data/financialReport.ts` — `buildFinancialReportMarkdown` 診断+指標+トレンドを1枚のMarkdownレポートに。
- `components/FinancialAnalysis.tsx` — 上記を束ねるUI (対象事業セレクタ / 連結トグル / 各種CSV・レポートDLボタン)。
  `OverviewPage` が `SNAPSHOT.business.units` を `FinancialUnit[]` にマップして渡す。
- 罠: 諸表/診断は同一データ連動のため、指標式を変えると諸表・診断・テスト期待値も連動して更新が要る。
  CSV DL は KpiPage と同じ BOM付き Blob+anchor。`financePages.render.test.ts` が描画クラッシュを回帰検出。

## ブラウザ版 (standalone.html) の機能カバレッジ

Web 配信 (GitHub Pages: https://hiroto1977.github.io/-/) と単一 HTML の両方で動作。
`src/renderer/web-shim.ts` が `window.serviceHub` を polyfill し、各アクションを実装:

- **ローカル系 (プロキシ不要)**: stocks (register/unregister/advise/compare-strategies/
  export-dashboard(-md)) · emotions (log-mood/analyze-text/clear-history) ·
  record-entry (uber-eats/demae-can/real-estate/mutual-funds) · templates/teamradar 書き出し ·
  business advise/export。AI 系 (advise/analyze-text) は Anthropic 直接呼び出し (Vault キー)。
  純粋ロジックは `src/renderer/data/{stocksWatchlistWeb,stocksAnalysisWeb,emotionsWeb}.ts`。
- **外部 SaaS 書き込み (`src/renderer/data/saasWriteWeb.ts`)**: github(create-issue, CORS OK で直接) ·
  notion/slack/atlassian/calendar/gmail/drive/wordpress/canva/cloudflare/security(HIBP·VT) は
  **CORS のためプロキシ経由** (`network/proxy.ts` の `fetchViaProxy`、ユーザー提供 Cloudflare Worker)。
  - `fetchViaProxy` は worker エンベロープの**上流ステータスを Response.status に保持**する
    (プロキシ自身のエラー時のみ throw)。HIBP の「漏洩なし=404」判定はこれに依存。
  - 設定 UI: SettingsPage に プロキシ URL 入力 (ProxySection) + 全サービスのトークンスロット。
  - Atlassian / security のトークンは JSON 形式 (`{email,token,site}` / `{hibp,vt}`)。
- **不可**: skills 実行 (ローカルコマンド実行が必要でブラウザ単体では原理的に不可)。
- セットアップ手順: `docs/WEB_SETUP_GUIDE.md` (機能別早見表 + プロキシ + トークン取得)。

## Linux 移行ツールキット (scripts/*.sh, PR #273〜#276)

開発マシンを Linux に移行するための自動化一式。手順書は `docs/LINUX_MIGRATION.md`
(6 フェーズ + USB レス移行パス)。物理操作 (USB 挿入・再起動) 以外は全てスクリプト化済み。

| スクリプト | 役割 |
|---|---|
| `migrate.sh backup [--encrypt] / restore` | SSH鍵・git設定の移送 + 全リポジトリ push 漏れ検知。`--encrypt` = AES-256-CBC+PBKDF2 60万回 (クラウド経由移送用、restore は .enc 自動判別) |
| `setup-linux.sh [--verify\|--doctor]` | 開発環境ワンコマンド構築 (apt/nvm/npm ci/Mozc) + 環境診断。ネットワーク操作は 2s/4s バックオフ 3 回再試行 |
| `make-live-usb.sh` | ISO 自動取得+SHA256 検証+USB 書き込み。誤爆防止 3 重ガード (リムーバブル判定/マウント中拒否/デバイス名再入力) + --dry-run |
| `make-autoinstall.sh` | Ubuntu 無人インストール (NoCloud autoinstall) 設定生成。パスワードは SHA-512 ハッシュのみ |

- **品質ゲート `npm run lint:shell`** (scripts/lint-shell.cjs): scripts/*.sh の
  bash -n 構文 + `set -euo pipefail` + shebang を強制。verify:all と ci.yml に組込済み。
- シェルスクリプトの罠 (実検証で踏んだもの):
  1. `apt-get update` は無関係 PPA の失敗で全体を殺さない (`|| warn` で続行)
  2. `trap ... EXIT` が参照する変数を `local` にしない (trap 実行時に消えて set -u で死ぬ)
  3. bash の `IFS` はマルチバイト文字 (、等) を扱えない — 連結は printf で
  4. サービストークンは safeStorage のマシン固有鍵のため移行不能 → 再登録が唯一の道

## 確立されたパターン

### 0. 手でやった検査は、その場でゲートにする（最上位の原則）

このリポジトリで繰り返し起きているのは「**検査は正しかったが、検査したこと自体が
残らなかった**」という失敗である。`lint:docs` が「verify:all の全ゲートが ci.yml に
あること」を検査するのも、元をたどれば同じ失敗（ゲートが存在するだけで何も
守っていない状態）への対策だった。

判断の目安は **「私が今やった手作業を、次のセッションの誰かが思い出せるか？」**。
思い出せないならゲートにする。実際にゲート化した例:

| 手でやっていた検査 | ゲート | きっかけ |
|---|---|---|
| 台帳が実在 id を指すか目視 | `lint:knowledge-refs` | 統合前に手で 3 ペアの腐りを発見 |
| DOI と出版社ラベルの突合 | `lint:doi-prefix` | 書籍への後付け DOI が大量に発覚 |
| 他文字種・簡体字の目視 | `lint:charset` | 範囲スキャン clean の直後に手作業で 5 字発見 |

**ゲートを作ったら必ず負のコントロールを取る。** 常に緑を返すだけのゲートは、
無いより悪い（守られている錯覚を与えるため）。最低限:
①わざと違反を仕込んで exit 1 になるか ②正常なものを誤検出しないか
③台帳があるなら「直ったのに台帳に残っている」で落ちるか。

### 0-b. 文字種の検査は範囲走査では完結しない

キリル・ハングル・アラビア・タイは Unicode ブロックが分かれているので範囲で拾える。
**簡体字は拾えない** — 簡体字・日本語新字体・繁体字は同じ CJK 統合漢字ブロックに
同居しているため、範囲走査では原理的に区別できない。だから `lint:charset` は
**字を列挙**している。網羅ではなく、実測で混入した字とその近傍を押さえる方針。

列挙するときの罠: **日本語新字体と同形の簡体字がある**。
号・国・学・尽・写・点・医・会・体・来・万 などは簡体字であると同時に正しい日本語で、
リストに入れると正常な文書を誤検出する（実際に 号・国・学 を入れて 3 件誤検出した）。
字を足すときは先に「これは日本語として正しくないか？」を問うこと。
ギリシャ文字は α β μ σ が数式で正当に使われるため、そもそも検査対象にしない。

### 0-c. `npm run lint` は verify:all に**入れた**（2026-08 以前は外れていた）

CI は eslint を独立ステップで回すため、以前は **verify:all が全ゲート green でも
CI が eslint だけで落ちる**ことがあった。実際にこのセッションで踏んでいる
（テンプレートリテラル内のコメントの `\"` が `no-useless-escape` に当たった）。
`verify:all` の末尾に `npm run lint` を足してこの乖離を構造的に消した。

### A. 新規サービス追加 (3 系統で使い分け)

#### A-1: external SaaS (Bearer token 認証、Phase 6 で live 接続予定)
```bash
npm run scaffold -- <id> "<Label>" <ICON> bearer
```
→ `LIVE_FETCHERS` に登録、`LOCAL_SERVICES` には **登録しない**。`category: 'integrations'`。snapshot 専用 stub にリライト (HTTP 呼び出し削除、`STUB + Impl + wrapper` 二段構造)。

#### A-2: local/snapshot 専用 (公式 API 無し、永続的 stub)
同じ scaffold → ただし `LOCAL_SERVICES` に **追加する**。トークン未設定エラー回避が目的。例: 士業 7 / quality / storage / uber-eats / demae-can / real-estate / mutual-funds。

#### A-3: 実 API 接続 (例: GitHub / Notion / Slack)
scaffold 後、`<id>.ts` の HTTP 呼び出し部を実装 + `__tests__/<id>.test.ts` に mock fetch + boundary tests。

### B. snapshot-only stub の標準形 (`home.ts` パターン)
```ts
import type { FetchContext } from './types';

export interface XxxSnapshot { /* 型 */ }

// Stryker disable next-line all
const STUB: XxxSnapshot = { /* 0 / [] で埋める */ };

export async function fetchXxxSnapshotImpl(_ctx: FetchContext): Promise<XxxSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchXxxSnapshot(ctx: FetchContext): Promise<XxxSnapshot> {
  return fetchXxxSnapshotImpl(ctx);
}
```

### C. ServiceActionPanel + ServiceAdvisorResponse
- write action は `{ ok: true, recordedAt, persisted: false }` shape を持たせて UI に「Phase 6 まで保存されません」を構造的に強制 (PR #4 BLOCKING-3)
- AI advise は `src/shared/advisorTypes.ts` の共通 `ServiceAdvisorResponse` 型 (`{ recommendations, disclaimer, notForRealMoney: true, phase: 'stub' | 'live' }`) を返す。投資系 (real-estate / mutual-funds) は disclaimer に「投資助言ではありません」必須

### D. 独立レビュー サイクル
1. 直近 commits を base..HEAD で diff
2. `Agent` (Opus) で並列レビュー → 🔴 BLOCKING / 🟡 SHOULD-FIX / 🟢 NIT 分類
3. inline コメント + Comment レビューを PR に投稿 (自己 PR は REQUEST_CHANGES 不可)
4. BLOCKING は即修正、SHOULD-FIX は条件次第、NIT は follow-up
5. R1 → R2 → R3 ... で「指摘なし」になるまで継続

### E. ARCHITECTURE.md 同期 (verify:arch invariant)
`docs/ARCHITECTURE.md` には 170+ の `file:line` 参照 + 6 live metrics (service count / test count / IPC / OAuth / verify:arch ref count / client モジュール数) があり、`npm run verify:arch` で自動チェック。**新サービス / テスト / コード移動の度に同期更新が必要**。失敗パターン:
- サービス数を増やしたら ARCHITECTURE.md の数字 + §3.1 表に行追加 + CLAUDE.md / USER_GUIDE.md の "N services" も全部
- IPC handler 追加 / `LIVE_FETCHERS` 行範囲変更時の line ref 追従

### F. AIオーケストレーションの進化基盤 (`orchestration/`)
精度向上サイクルは `orchestration/registry.json` (組織 / チーム / ラウンド履歴 / バックログ / 進化ルール) を
単一の真実源として回す。`npm run verify:orchestration` (= `verify:all` の一部 + CI) が
**チーム数の単調増加・最低チーム数・参照整合・teamCount一致** に加え、**組織階層の整合**を機械検証する。
- 組織は `org` に **CEO 1 / 役員 4 / 管理職 7 / 一般職(teams) 19** の3階層 (CEO は AI 非配置=オーケストレーター本体)。
  各 active team は `manager` で実在の管理職に1つだけ属し、管理職→役員→CEO の指揮系統が一意であることを検証。
- サイクル開始時に `npm run orchestration:plan` で「組織図 + 次ラウンドの推奨チーム数 + 優先度順の着手候補」を取得。
- 実装後は registry.json を更新 (teams[] に新領域+manager / rounds[] に追記 / backlog の status 更新)。teamCount は前ラウンド以上。
- 詳細は `orchestration/README.md`。チーム・階層を増やし続けても整合性が CI で保たれる設計。

## 既知の罠

### 罠 0: verify:arch の参照解決は「ローカル成功・CI 失敗」を作る（2026-08 実測）
`verify:arch` は ARCHITECTURE.md 内のバッククォート付きパス
（`` `foo/bar.ts` `` 形式・拡張子 ts/tsx/cjs/sh/json/html/md）を実ファイルとして
解決する。したがって **gitignore 済みのビルド生成物へのパスを書くと、手元では
ファイルが存在するので通り、CI の fresh checkout で `file not found` で落ちる**。

実例: `dist/standalone.html` を追跡から外した際、ARCHITECTURE.md の説明文に
その名前をバッククォートで書いたところ、ローカル 13 ゲート green のまま CI だけ赤になった。

**対策（2026-08-11 に構造化済み）:** `verify:arch` が
**参照先が git に追跡されているか**を検査するようになった。存在確認だけでは
「手元にあるが CI には無い」を見抜けないため、`git ls-files` の集合と突き合わせる。
生成物を参照すると**ローカルの時点で**次のように落ちる:

```
L27: dist/standalone.html — git 管理外のパスを参照しています。
     手元にはあっても CI の fresh checkout には存在せず、CI だけが落ちます。
```

したがって手作業での再現手順（生成物を一時退避して回す）はもう要らない。
生成物に言及するときはバッククォートで囲まず日本語で書くこと、という
書き方の指針だけが残る。


### 罠 0-b: smoke の「クリックできなくても黙って通る」（2026-08 修正）

`npm run smoke` は 2026-08 まで **22 件の手書きリスト**しか撮っておらず、しかも
`if (target) target.click();` で**見つからなければ黙って何もしない**実装だった。
`App.tsx` の `COLLAPSED_BY_DEFAULT` で `tools` / `integrations` は既定で畳まれており、
畳まれたカテゴリの項目はそもそも DOM に無い。結果 **22 枚中 16 枚が home.png と
バイト単位で同一**のまま「smoke green」になっていた（実質 6 ページしか見ていない）。

修正で入れた 3 つの砦。どれか 1 つでも欠けると同じ穴が開く:

1. 撮影対象を `src/renderer/services.ts` から**導出**（71 件）。手書きリストは
   scaffold した新サービスが網に入らない。`SERVICE_IDS`（73 件）ではないのは
   uber-eats / demae-can が**サイドバー項目を持たない** snapshot 専用だから。
2. 全カテゴリを `button[aria-expanded="false"]` で開いてからクリックする。
3. **黙って通さない**。クリック対象が無い / 選択が切り替わらない / 別サービスと
   バイト一致、のいずれかで `app.exit(1)`。

特に 3 の「バイト一致で落とす」が効く。撮り漏らしの実体は必ず
「前のページの画がもう一度出る」なので、md5 の重複が唯一の直接的な証拠になる。

なお `waitForActivePaint` の等値比較は `JSON.stringify(id)` を **1 回**だけ通すこと。
CSS 属性セレクタ側は引用符ごと埋めるため 2 回通すので、コピペで取り違えると
`'"slack"'` と比較して**全件 STUCK** になる（実際にやらかした）。

### 罠 1: scaffold ハイフン + 数字 ID で camelCase collapse (修正済)
旧 `scaffold-service.cjs` は `microsoft-365` → `microsoft365` (camelCase で hyphen 消失) で LIVE_FETCHERS / LIVE_ACTIONS のキーを生成していた。これは ServiceId (`'microsoft-365'`) と mismatch して typecheck で気付くが、修正に時間を取られた。

**修正:** `idKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(id) ? id : `'${id}'`` を導入 (PR #7 で根本修正)。将来の hyphen + digit ID も自動で quoted key になる。

### 罠 2: Stryker 100% 維持
追加した fetcher は `stryker.config.json` の `mutate` 配列に **必ず追加**。さらに UX content (advise の disclaimer / recommendations、record-entry の validation) は StringLiteral / ObjectLiteral mutation が大量に発生するため `// Stryker disable all` / `// Stryker restore all` で block-level に囲む (next-line では多行カバー不能)。

### 罠 2-b: `describe` 直下の生成は変異体を取り逃がす
テスト対象を `describe` の直下（`it` の外）で呼ぶと、例外を投げる変異体は
**テスト失敗ではなくファイルの収集失敗**になる。vitest は「テスト 0 件」と報告し、
Stryker は「どのテストも落ちなかった」＝**生存**として数える。
2026-08 の定款テストで実際に 3 変異体を取り逃がしていた（`(false).includes(...)` 系）。
共有データが要るときは値ではなく**関数にして `it` の中で呼ぶ**。

### 罠 2-c: 等価変異は pragma より先にコードの単純化を試す
`x !== null && x > 100` のような「JS のセマンティクス上どうやっても観測できない防御」は、
黙らせるのではなく**分岐ごと消す**ほうが速くて短い。2026-08 の `docStudioChecks` では
`toNum`/`parseJpDate` の結果を null ではなく **NaN で受ける**ようにしただけで、
各ルールに散っていた null ガードが全部不要になり（NaN との比較は常に false）、
**変異体 814 → 695・pragma 0 個**で 100% に届いた。
「読めない値はどの閾値にも引っかからない」という方針を、ガードの羅列ではなく
演算そのもので表現できているかを先に疑うこと。

### 罠 2-d: `--mutate` を複数回渡すと最後の 1 つしか効かない
`npx stryker run --mutate a.ts --mutate b.ts` は **b.ts だけ**を変異させる（上書き）。
`Found 1 of 8937 file(s) to be mutated` の行を必ず読むこと。複数を測るときは
**カンマ区切りで 1 つの引数**にする: `--mutate "a.ts,b.ts,c.ts"`。
また `incremental: true` が config にあるので、スコープを絞った試し測定では
`--incrementalFile <一時パス>` を渡して本番のキャッシュを汚さないこと。

### 罠 2-e: `-x` は -0 を作る（`toBe(0)` が落ちる）
`-transfer` は transfer が 0 のとき **-0** になり、`Object.is(-0, 0)` は false なので
`expect(...).toBe(0)` が落ちる。表示側でも `(-0).toLocaleString()` の挙動は環境で割れる。
符号反転が必要なら `0 - x` と書く（常に +0 から始まる）。

### 罠 3: スタック PR の merge order
複数 PR を base 関係で積み上げた場合 (PR #4 base=PR #3 branch、PR #5 base=PR #4 branch、…)、最初の PR が main に merge されると後続 PR の base が dangling になる可能性がある。GitHub は通常 auto-rebase するが、**順序が崩れると後続 PR の merge が間違った branch に対して行われる**ことがあった。本 PR (#8) は claude/shigyo-integrations から直接 main に向けることで一括反映。

**回避策:** スタック化したら **同時に並列で merge せず、base から 1 つずつ確認しながら**。あるいは最終 head から main 向けの consolidated PR を作る (本 PR の方式)。

### 罠 4: verify:arch のテスト数 drift
`ARCHITECTURE.md` のテスト件数は `grep -rE "^\s*it\(" src/` の実数と一致必須。新規テスト追加 / scaffold 出力で **常に drift する** ので、毎 commit 後に `npm run verify:arch` で確認。

### 罠 6: perf の絶対値は機械依存 — 別マシンの数値と比べない（2026-08 実測）

`npm run perf` が出す DCL やバンドルサイズを、過去のセッションが記録した数値と
直接比べて「劣化した」と判断してはいけない。CI にも入っていない実測値で、
走らせたコンテナの速さがそのまま乗る。

実例: コーパス増加後に DCL が悪化したように見えたので、**同一マシン上で A/B を取った**。
`git show <commit>:dist/standalone.html` で当時の 10.00 MiB バンドルを取り出して
測ると 377〜420ms（記録は 349ms）— つまりマシン側が約 14% 遅い。
同条件で比べたコーパス起因の差は **+15ms (+3.8%)**、バンドルは +6.8% 増。
`bigParses` はどの条件でも **0** で、起動時の巨大 JSON.parse は発生していない。

**再測定するときは必ず `git show <commit>:dist/standalone.html` で当時の成果物を
取り出し、同じマシンで並べて測ること。** 記録された絶対値は出発点にならない。

### 罠 5: literal type narrowing in snapshot.ts
`monthlyFee: 22_000` 等が `22000` literal type に narrow される問題。`as number` cast は anti-pattern 指摘あり (PR #7 R1)。将来は親 object に `satisfies` 句または `as const` 戦略統一を推奨。

## 未解決 follow-up (優先度順)

### ⚡ jsdom は要るファイルだけに（2026-08・テスト 57.5 → 49 秒）
`@vitest-environment jsdom` は **1 ファイルあたり約 0.65 秒**の環境生成を払う。
`pool: 'forks'` + `isolate: true` なのでファイルごとに毎回かかり、共有されない。

ところが `.render.test.ts` の多くは `renderToStaticMarkup` で文字列を作るだけで
DOM を触っていなかった。28 ファイル中 **12 ファイル**が該当（`webauthn.test.ts` は
`vi.stubGlobal('window', …)` で自前のグローバルを作っていたので最初から不要だった）。
外した結果 `npm test` が **57.5 → 49 秒**、環境生成 19.0 → 10.5 秒。

ブリッジのスタブが要るだけなら `window` ではなく **`globalThis`** に置けば DOM 環境は要らない
（`renderToStaticMarkup` は effect を走らせないので、そもそも保険でしかない）。

**戻り防止**: `lint:test-coverage` に `needless-jsdom` 検査を足した。
文字列とコメントを落としたうえで DOM グローバルの出現を見るので、
`vi.stubGlobal('window', …)` のように名前が文字列の中にしか無いものも検出できる。
新しいレンダーテストは既存ファイルのコピーで作られ pragma も一緒に写経されるため、
機械で見張らないと必ず戻る。

### 🖱 Cursor 連携で決めたこと（2026-08）
`cursor` をサービス #73 として追加した（`src/main/clients/cursor.ts`）。設計判断を残す。

- **書き込みを一切しない。** Admin API には席や上限を触る操作があるが、いずれも課金に直結する。
  `ACTIONS` は空のまま置いてある（消すと「実装し忘れ」に見えるため、意図として残す）。
- **取れるのはチーム全体の集計で、個人の作業内容ではない。** 行数や受入率を人単位で並べると
  評価に使われてしまうので、日次の推移としてのみ出し、メンバー単位は席（role）と支出だけにした。
- **受入率が 100% を超える日がある。** Cursor 側の集計で採用行が総追加行を上回ることが
  実際にあり（フォーラムに報告多数）、丸めると原因が消える。`overCounted` で印を付けて
  値はそのまま出し、画面に注意書きを添えている。
- **米ドルのまま出す。** 為替を当てて円換算すると、いつの何のレートかが画面から追えなくなる。
  `readNumber` が単位語を解釈しないのと同じ方針。
- レスポンスの包み方（`{data: []}` か裸の配列か）は Cursor 側の記述が揺れているので
  **両方に耐える**ようにし、`null` が返っても落ちないようにしてある（実際に一度落ちた）。

`.cursor/rules/*.mdc` も置いた。CLAUDE.md と同じ前提を Cursor AI にも読ませるためで、
**サービス数は `lint:docs` の検査対象に入れてある** — ずれると 2 つのエージェントに
違う前提を渡すことになるため。

### 🔁 enrich は重複検出の感度を上げる（2026-08 の発見）
enrich キューを消化すると `dedupeGraph` が鳴る、という現象が 3 連続で起きた
（pass8 労働条件明示 / pass9 電帳法 / pass10 解雇予告）。**薄い記述どうしは語彙が少なすぎて
term-overlap が閾値に届かない**ため、統合すべきペアが検出器をすり抜けたまま残っている。
増強して初めて重なりが見える。したがって:
- enrich を進めるたびに `dedupeGraph` を確認すること（1 バッチごとに `knowledge:auto` を回す）
- 衝突したら「専用項目の内容を別項目へ書き写していないか」をまず疑う。書き写しなら
  自分の記述を削る（labor-workers-comp の特別加入がこれで、DISTINCT 台帳へ）
- 本当に同一概念なら統合。**統合＝削除ではない**ので drop 固有の出典・条番号・タイトルの
  情報量を keep へ移してから落とし、provenanceDelta を merge-plan に記録する

### 🔗 PsyCap 系の疑わしい DOI 2 件（実体未確定・要個別照合）
`mgmt-psychological-capital-theory` に、ラベルと DOI プレフィクスの発行元が食い違う出典が
2 件残っている: ① 10.1177/1548051814534492 — ラベルは「Youssef-Morgan & Luthans (2015)
Stress and Health」だが 10.1177 は SAGE（Stress and Health は Wiley）。② 10.1037/a0016998 —
ラベルは「Avey, Reichard, Luthans & Mhatre (2011)」の meta（HRDQ = Wiley 10.1002/hrdq.20070
のはず）だが 10.1037 は APA。**接尾辞完全一致検索で DOI の実体を確定してから**、正しい実体に
ラベルを合わせるか検証済み出典に差し替える（推測で直さない）。同エントリの job.583 は
実体確定済み（Avey et al. 2009 Psychological ownership）で pass13 にて除去済み。
pass17 で `mgmt-positive-organizational-behavior-luthans` の同種 2 件（JOB 論文に JLOS の
DOI・Annual Review 論文に GOM の DOI）をラベル一致の正リンクへ置換済み。未確定で残るのは
同エントリの 10.1177/0149206307305562（ラベルは Luthans/Avey/Patera 2008 = AMLE のはずが
JoM の prefix）— 接尾辞照合してから直すこと。ほかに `mgmt-sensemaking-enactment-weick` の
10.5465/amr.2005.16387885（WSO 2005 は Organization Science 16(4) の論文なのに AMR の DOI/表記）と、
同エントリの springer s10551-011-0888-6（Maitlis & Christianson 2014 AOM Annals と称するが
s10551 は Journal of Business Ethics・年も 2011）も同様に未確定。
`econ-dollar-hegemony-theory` の acprof:oso/9780199747474（ラベルは「Globalizing Capital — OUP」
だが同書は Princeton 刊。OUP の別書（Exorbitant Privilege?）の可能性）も実体未確定。
同エントリの FA 誤出典（URL 実体は Rise of Big Data — datafication 側の正ラベルで二重付証）は
除去済み。

### ⚖️ 刑名の表記ゆれ — 懲役 / 拘禁刑
刑法等の一部を改正する法律により **懲役・禁錮は拘禁刑に一本化**された（2025年6月1日施行）。
`complianceKnowledge.ts` は 2026-08 時点で拘禁刑に統一済みだが、
**`academicKnowledge.ts` には「懲役」表記が 8 箇所残っている**（インサイダー取引・名誉毀損・
裁判員制度など）。所管省庁の解説 PDF 自体が旧表記のまま更新されていないものもあるため、
機械的な一括置換はしないこと。出典を 1 件ずつ確認して、現行法の刑名に直すか、
判例・制度説明として当時の刑名を残すかを個別に裁定する。

### 📄 経営書類 — 次に足すなら（2026-08 時点で「作れない」もの）
法定で作成・保存・公告が義務づけられている書類は一巡した（法定三帳簿＋年休管理簿、
計算書類4点＋決算公告）。残っているのは **会計帳簿系** で、いずれも検証済み知識には
まだ入っていないので出典から確認して足すこと。
- **固定資産台帳** — 減価償却の根拠。`shared/depreciation.ts` に計算はあるが台帳の書式が無い。
- **棚卸表（実地棚卸）** — 期末商品棚卸高の根拠。決算書の `closingInventory` に直結する。
- **総勘定元帳 / 仕訳帳** — 会社法432条1項の会計帳簿。ただし「穴埋め書式」には馴染まない
  （取引から生成するものなので、入力欄を並べても実務では使われない）。作るなら
  取引入力 → 自動生成の形にすること。

### ✅ 解決済み (claude/claude-md-docs-qqUAT で対応)
- ~~**PR #6 R1 #2** — `CleanupTask.executable: false` literal~~ → `boolean` に開放 (commit 7dc3059)
- ~~**PR #6 R1 #3** — Storage `largeFolders` サイズ降順未ソート~~ → page で降順ソート (commit 7dc3059)
- ~~**PR #7 R1 #2** — 7 士業の interface 重複~~ → `src/shared/shigyoTypes.ts` + `src/main/clients/shigyo.ts` (createShigyoFetcher) に抽出
- ~~**PR #7 R1 #3** — 7 士業 Page のコピペ~~ → `components/ShigyoConsole.tsx` に抽出 (各 Page は数行の wrapper に。−1159 行)
- ~~**PR #7 R1 #4** — `as number` cast~~ → 士業 snapshot を `satisfies ShigyoSnapshot` に統一
- ~~**PR #7 R1 #5** — `example.jp` ドメイン + 弁護士/弁理士 disclaimer~~ → `example.com` 統一 + `ShigyoConsole` の `disclaimer` prop で法的注意書きバナー追加

- ~~**PR #6 R1 #1** — Storage メモリ使用率閾値の整合~~ → `MEMORY_WARN_PCT=80` 定数化 + 推奨文言を閾値と整合
- ~~**PR #4 R2-2** — `ServiceActionPanel` amount の locale 対応~~ → `parseAmountInput` (全角・カンマ区切り対応) + テスト
- ~~**PR #4 NIT** — `note` の制御文字チェック~~ → `sanitizeNote` (C0/C1 除去・trim・上限長) + テスト
- ~~**PR #4 R2-1** — `CrossServiceKpis` の `useServiceData` 経由化~~ → 5 サービスを hook 経由に
- ~~**PR #7 NIT** — ステータス色 `相談中`/`対応中` の tooltip~~ → `ShigyoConsole` に `STATUS_HINT` title
- ~~**横断 KPI に士業月次顧問料合計~~** → `sumShigyoMonthlyFees` + CrossServiceKpis に Stat 追加

- ~~**PR #4 R2-3** — `ServiceActionPanel` の useState を state machine 化~~ → serviceActionMachine.ts (reducer + 14 tests)
- ~~ドキュメント横断の古い数字 (45/22 services, 1190/1113 tests, 376/403KB)~~ → CLAUDE/USER_GUIDE/README/ARCHITECTURE/BROWSER_REDESIGN を 60 services 等に統一

### 🤖 オーケストレーション監査 (4 チーム並列) で対応した項目
- parseAmountInput を厳格 10 進 regex 化 ('++500'/'1e3'/'0x10'/'Infinity' 等を排除)
- 境界値テスト大量追加 (全角半角混在/制御文字境界/maxLen 端/逆遷移/負値)
- 新規 `shigyo.test.ts` (createShigyoFetcher 直接検証)
- 重複 jpy フォーマッタを `src/shared/formatters.ts` に集約 (6 箇所 → 1)
- CrossServiceKpis に Math.max(0,…) 防御ガード (Security Finding 3)

### 🤖 オーケストレーション監査 後続対応 (2nd wave)
- ~~汎用 stub ファクトリ統一~~ → `src/main/clients/snapshotStub.ts` (createSnapshotStub) に
  21 client を集約 (commit 5d685d2、−99 行)。士業は別途 createShigyoFetcher。
- ~~lint:docs を CLAUDE/README/USER_GUIDE にも拡張~~ → service count の drift を CI 自動検知
  (commit c370376)

### 🤖 オーケストレーション監査 後続対応 (3rd wave)
- ~~SNAPSHOT 型厳格化で `as unknown` 排除~~ → page-level の `as unknown as XSnapshot`
  5 箇所を全廃 (Home/Stocks/Templates/TeamRadar/Business、interface を readonly 化、commit ed528c1)
- ~~新規ロジックの mutation 100%~~ → serviceActionUtils/Machine/formatters/snapshotStub で
  生存ミュータントを全 kill (commit e4f15a3)

### ✅ 解決済み: 税務 6 モジュールを Stryker scope に登録 (全 100%)
2026-06 の精度キャンペーンで税務 6 モジュール全てを mutation 100% 化し `stryker.config.json` の
`mutate` 配列へ登録完了 (taxCasual / taxCapitalGains / taxCredits / taxRetirement / taxDeductions / taxCalc)。
在スコープ全体 100% を維持。本番ロジックは無変更 (kill 可能変異はテスト追加、等価/到達不能は pragma)。
- 知見1: **到達不能コードは pragma より型で排除** (例 taxCapitalGains の baseRate を
  `Exclude<CapitalAssetKind,'residential'>` 化)。`// Stryker disable next-line` は `} else if` 行で
  効かないため **block-level disable** を使う。
- 知見2: **連続な段階関数の境界** (給与所得控除・生命保険料控除等) は `<=`↔`<` が数学的に等価 →
  EqualityOperator を block disable (ArithmeticOperator の kill 実績は維持)。
- 知見3: **perTest カバレッジの取りこぼし** (フルスイートは kill するのに survive) は理由明記で pragma。
- 知見4: マージ後は **stryker.config.json の JSON 妥当性を必ず検証** (競合マーカー混入を防ぐ)。
- 知見5: **表示文字列の大量 StringLiteral は出力全文の golden 照合** (`toBe`/`JSON.stringify`) で
  1テスト=多数 kill。pragma 不要で低リスク (財務 render 系で実証)。
- 知見6: `npm run typecheck | tail -1` はパイプで終了コードが隠れる。**型チェックは単独で実行**して
  失敗を確実に捕捉する。

### ✅ 解決済み: 純粋ロジックの mutation 精度キャンペーン (2026-06、本番コード無変更)
税務に加え、財務分析 + funding + ブラウザ純ロジックの変異スコアを底上げ。kill 可能はテスト追加、
等価/到達不能は理由付き pragma、表示文字列は golden 全文照合で対応。到達点:
- **財務分析7**: financialDiagnosis 98.3 / financialCsv 98.7 / financialRatios 96.2 / financialTrend 97.4 /
  financialStatements 95.3 / financialReport 94.9 / businessFinancials 92.3 %
- **funding**: 87.6 → **91.5%** (残は zero-guard 境界・sort 比較子・到達不能 default の長尾 = 等価寄り)
- **ブラウザ純ロジック**: emotionsWeb / saasWriteWeb / stocksWatchlistWeb (93.6%) / stocksAnalysisWeb (66%) 改善済
- これらは **Stryker scope 外** (公式 100% gate は税務含む scope 内モジュールのみ)。残りは等価変異中心で
  追加テストの効果は逓減 — 過剰な golden 固定は保守性を下げるため一区切り。

### 🟢 税額計算の残論点 (並列監査で整理)
✅ 実装済 (89913c9):
- 住宅ローン控除の **居住年×住宅性能区分** (resolveMortgageParams: 令和2-3年1.0%/令和4年以降
  0.7%、限度額を長期優良5,000万〜中古3,000万・2024年以降の非適合新築は0)。
- **住民税の調整控除** (calcResidentAdjustmentCredit + humanDeductionDiff)。
- **配当控除の投信区分** (DividendKind: 株式/投信/外貨建等で率を1/2・1/4)。
✅ d179dfe: 復興特別所得税の適用順序バグ修正。配偶者特別控除の本人所得段階は factor で実装済。

✅ c785055: 住民税の **非課税限度額** (residentTaxExemption)・生命保険料控除の **旧制度**
   (lifeInsuranceOld + 新旧併用) を実装。社保はセクション③が実額入力のため概算不要。

✅ c913321: **退職所得** (分離課税) を taxRetirement.ts に実装 (退職所得控除/1/2課税/
   2022年改正の短期退職手当等/障害退職、TaxPage セクション④)。

✅ 3023347: **一時所得** (総合課税) を taxCasual.ts に実装 (収入−経費−特別控除50万 ×1/2、
   TaxPage セクション⑤)。算入額のみ算出し他の所得と合算する設計。

✅ **譲渡所得 (申告分離)** を taxCapitalGains.ts に実装済み (短期39.63%/長期20.315%、居住用
   3,000万特別控除・10年超軽減税率、概算取得費5%、CapitalAssetKind 区分、TaxPage セクション⑥、
   16 テスト)。※ 旧版の「残り」記述は古かったため訂正。

✅ **森林環境税 (2024年〜の均等割¥1,000上乗せ)** は taxCalc.ts に実装済み
   (`FOREST_ENVIRONMENT_TAX` + `residentPerCapitaBreakdown(taxYear)` で年度別内訳)。
   **ふるさと納税** も `calcFurusatoResidentCredit` (基本分+特例分・特例cap) で対応済み。
   ※ 旧版の「残り」記述は古かったため訂正。

✅ 社会保険料の **標準報酬月額テーブル** 化 (round 52, `src/shared/taxSocialInsurance.ts`):
   厚生年金 第1〜32級 (88,000〜650,000) / 健康保険 第1〜50級 (58,000〜1,390,000) の
   令和6年度・協会けんぽ等級表を実装し、報酬月額→標準報酬月額の解決関数 (resolveStandardMonthly /
   resolvePensionStandardMonthly / resolveHealthStandardMonthly / resolveStandardBonus) で
   calcSocialInsurance / calcSocialInsuranceWithBonus を線形近似から等級表ベースへ。賞与は標準賞与額
   (1,000円未満切捨て) + 上限 (健保 年累計573万/厚年 1回150万)。mutation 100% 維持 (等級表は罠#2 に
   従い block-level disable、境界解決ロジックは実テストで撃墜)。既存テスト期待値を新モデルへ更新。

✅ 住民税の自治体差の精緻化 (round 53, `src/shared/taxCalc.ts`):
   `calcResidentTax` に任意の `MunicipalityOverride` 引数を追加。所得割率 (`incomeRate`) と
   均等割額 (`perCapita`) を自治体別に上書き可能。未指定は標準定数にフォールバック (既存挙動不変)。
   負値・NaN・Infinity は入力ガードで標準値へ。mutation 100% 維持 (19 テスト追加)。

残り (要設計判断・スコープ大): なし (全主要項目実装済み)。

✅ **ふるさと納税ワンストップ特例**は実装済み (`src/shared/taxFurusato.ts`: `furusatoOneStopEligibility` 5自治体/確定申告併用不可の判定 + `calcFurusatoBreakdown` の所得税分→住民税申告特例控除への振替、mutation 100%、TaxPage セクション⑦)。※旧版の「残り」記述は古かったため訂正。

### 🟢 資金調達レーダー (funding) — 精度向上の積み上げ
新サービス `funding` (62件目)。集計は src/shared/funding.ts の純粋関数に集約。実装済の精度向上:
1. 課税区分 (補助金/助成金/給付金/購入型CF=課税、融資/公庫=非課税) + 税引後手残り
2. 圧縮記帳の課税繰延 (compressedEntry)
3. 月次の税引後CF (fundingAfterTax)
4. 元利均等返済スケジュール・純資金繰り (repaymentSchedule, netCashflow)
5. 累計キャッシュ残高・ランウェイ警告 (cashRunway, shortfallMonth)
6. 元金・利息内訳と利息の節税効果 (amortizationSchedule, interestTaxShield)
7. 据置期間・利息のみ返済 (gracePeriodMonths)
8. 採択確率による期待値シナリオ (defaultProbability, expectedScenario)
9. 元金均等返済 (RepaymentMethod 'equal-principal')
10. 3シナリオ累計残高レンジ (scenarioRunways: 楽観/期待/悲観)
11. 消費税・特定収入の調整 (isSpecifiedIncome / specifiedIncomeAdjustment): 補助金等を
    特定収入と判定し、本則課税で特定収入割合>5%のとき仕入税額控除の控除対象外額を概算
    (簡易課税・割合≤5%は調整不要)。snapshot.specifiedIncome + FundingPage に概算表示。
12. 据置中の複利計上選択 (GraceInterestHandling 'simple'|'compound'): 据置中の利息を都度
    支払う(simple)か元本に資本化する(compound)かを選択。compound は据置中の支払0・残高が
    複利で増え、据置後は膨らんだ元本を返済 (返済額・総支払利息・amortizationSchedule に反映)。
不変条件テスト済: amortizationの元金合計=元本(simple)/=資本化後残高(compound)/remaining=0/
payment=principal+interest、optimistic≥expected≥pessimistic。
残り候補: 譲渡所得連携・ふるさと納税は実装済 (税務側)。funding 固有の残候補は概ね消化済み。

### ⛔ 試行して撤退した案 (再挑戦は慎重に)
- **business.ts の責務分割** — kpi/advisor/export の 3 モジュール + バレル化を実装し
  typecheck/全テスト(112)/lint/verify/build まで green になったが、**フル mutation
  (`npm run mutate`) で 100% → 93.63% に低下**して撤退 (commit せず revert)。
  render テンプレート (HTML/CSS/SVG) の StringLiteral が、モノリスでは perTest
  coverage で kill されるのに、別ファイルに移すと Stryker の coverage 帰属が外れて
  NoCoverage/Survived 化する。回避には装飾 render に StringLiteral disable を被せる
  必要があり、それは「実シグナルを隠す」副作用がある。**分割の利得 (行数削減) より
  mutation 精度の劣化が勝る**と判断。stocks.ts も同じ render-template 構造なので
  同様のリスク大。分割するなら mutation 設計の合意が前提。

### 🟢 NIT (残・低優先)
- PR #6: storage `recommendations` 固定文字列の usagePct ハードコード (静的 snapshot text のため
  低優先 — 実 OS 統計は Phase 6 で動的化されるので、それまで据え置き)
- Docs 監査の追加案: lint:docs / verify:arch に HTML size の drift 検知も追加

### 📐 アーキテクチャ拡張案 (Phase 6 — 実 API/永続化が要るため独立タスク)
- Phase 6: 4 業務サービス + 7 士業の `record-entry` を IndexedDB 永続化 → `persisted: true`
- Phase 6: `advise` の Anthropic API 接続 (現状は静的 stub)
- 連携先 SaaS の live REST 接続実装
- Storage: Electron main で `os` / `fs` 経由の実 OS 統計取得
- quality dashboard の数値を `scripts/quality-report.cjs` から自動生成

## クイック検証チェックリスト (新セッション開始時)

```bash
# 1. ブランチ + 状態確認
git status && git log --oneline -5

# 2. 基本品質ゲート
npm run typecheck && npm test && npm run verify:all

# 3. ESLint clean か
npm run lint

# 4. 必要に応じて Stryker (5 分かかる)
npm run mutate

# 5. ブラウザ版動作確認 (オプション)
npm run build:web   # dist/standalone.html 生成
```

すべて green なら作業開始 OK。1 つでも fail なら、まず原因を調査してから新規作業に入る。

> ⚠️ **`npm run lint` は `verify:all` に含まれていない。** CI は別ステップとして
> `npm run lint` を回すので、`verify:all` が 14 ゲート green でも eslint 単独で
> 落ちて CI が赤くなる。**push 前は必ず `npm run typecheck && npm test &&
> npm run verify:all && npm run lint` の 4 点セットを回すこと。**
> 実例: 2026-08-11、テンプレートリテラル内に書いたコメントの `\"` が
> `no-useless-escape` に当たり、verify:all 14 ゲート全 green のまま CI が落ちた
> (executeJavaScript に渡す文字列の中はコメントであってもコードとして解釈される。
> そもそも注釈は renderer へ送らずテンプレートの外に置くのが正しい)。

## 参考: 主要ドキュメント

- `CLAUDE.md` — プロジェクト概要 + Claude Code 用ガイダンス
- `docs/ARCHITECTURE.md` — 設計詳細、サービスレジストリ §3.1、Action payload schema、egress マトリクス、不変条件 15 個
- `docs/BROWSER_REDESIGN.md` — Vault / Library / OAuth / Proxy / FSA のブラウザネイティブ再設計
- `docs/USER_GUIDE.md` — エンドユーザー (非エンジニア) 向け 1 冊目
- `docs/PROXY_EXAMPLE.md` — Cloudflare Worker SSRF guard サンプル
- `docs/QUALITY.md` — テスト方針 + mutation 履歴
