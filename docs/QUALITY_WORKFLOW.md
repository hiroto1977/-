# テスト精度を継続的に高める仕組み

このリポジトリには「テストが本当にバグを検出できるか」を 4 つの角度から
測る仕組みが組み込まれています。

> **この文書の数字は、測った日と測った場所を必ず名乗ります** (2026-09-27 · パス 490)。
> それまでこの文書は、しきい値を `{ "high": 90, "low": 60, "break": 50 }`、
> 全体目標を「60-75%」、`npm run mutate` の所要を「~2 分」、`npm test` を「~2s」と書き、
> 「main.ts / secrets.ts は mutation 対象から外している」と述べていました。
> **どれも実物と違いました** —— 実物のしきい値は下の JSON (lint:docs が
> `stryker.config.json` と突き合わせる)、`main.ts` と `secrets.ts` は `mutate` に**載っており**、
> 全件の変異検査は **CI で 2 時間前後**かかります (下の実測表)。品質の頁
> (`docs/QUALITY.md`) の末尾がこの文書を「詳しい運用ルール」として名指ししているので、
> ここの偽はそのまま読者の判断になります。

> **今の `docs/QUALITY.md` の変異検査の点数は 2026-09-01 の報告の物で、今のコードを測った物ではありません**
> (2026-09-27 · パス 494)。作り直しに要る全掃引を同じ日に回すと、検査の中でモジュールを読み直す
> 検査 (`webShim*` / `mainWindow` ほか) のせいで、読み込み時にしか走らない変異体が大量に「生存」と
> 出る**測定の人工物**で汚れていました (実測と次の手順は `docs/REMAINING_WORK.md` の「パス 494」)。
> 頁を作り直すまで、下の「品質の頁を再生成する」で述べる lint:docs の**頁の自己一致の検査は止めてあります**。

## 4 つの測定軸

| 軸 | 何を測る | ツール | いつ走るか |
|---|---|---|---|
| **1. 合格テスト数** | 仕様への形式適合 | Vitest | CI: PR と `main` への push のたび |
| **2. カバレッジ** | テストが触れた行・分岐 —— **`src/main/**` だけ** | `@vitest/coverage-v8` | CI: 同上 (**閾値は宣言していない** —— 刷るだけで、下がっても鳴らない) |
| **3. Property-based fuzz** | 任意入力でクラッシュしないこと、不変条件保持 | `fast-check` | 通常テストに混在 |
| **4. Mutation score** | テストが**実際にバグを検出できる**か | Stryker | `mutation.yml`: 週次 (全件) と `main` への push (変わったファイルだけ・**1 塊 4,000 行までの matrix job に分けて** —— 2026-09-30 パス 501)・手動 (全件)。**PR では走らない** |

カバレッジが高くても mutation score が低ければ「テストはコードを通って
いるが assertion が弱い」という意味。両方測ることで真の精度が分かる。
**カバレッジの母集団は `src/main/**` だけ**で、`mutate` の大半 (税の計算・保管庫・
プロキシ・両ビルドが読む `shared/` の判定) はその外に居る —— 被覆の数字は
それらについて何も言わない (パス 479 が実測した)。

## コマンド一覧

| コマンド | 用途 |
|---|---|
| `npm test` | 全テスト実行 |
| `npm run test:watch` | 監視モード（開発中）|
| `npm run test:cov` | カバレッジ計測 (`src/main/**` のみ) |
| `npm run test:property` | property test のみ実行 |
| `npm run mutate` | 変異検査の**全件** (`mutate` の全ファイル) |
| `npm run audit:mutate-changed` | **触ったファイルだけ**の変異検査 (`HEAD~1` との差と `mutate` の積) |
| `npm run audit:survivors -- <file> [--top=N]` | 報告の「生存」を 1 つずつ原文へ当て直し、本物と偽を分ける (ファイルは必須・広いファイルは `--top` で絞る) |
| `npm run mutate:triage` | 直近の報告から殺すべき mutant を Markdown で出す |
| `npm run mutate:triage -- --file=src/main/clients/security.ts` | 特定ファイルだけ triage |
| `npm run mutate:triage -- --top=50` | 上位 50 件 |
| `npm run mutate:triage -- --include-string-literals` | 設定値の文字列 mutation も含む（通常は除外）|
| `npm run quality` | typecheck + test + coverage を一気通貫 |
| `npm run quality:report` | `docs/QUALITY.md` を再生成 (**全掃引の報告からだけ** —— 下の節) |

### 所要時間 (実測 · 測った日と場所つき)

「~2 分」のような日付の無い所要は、`mutate` の本数が増えるたびに黙って古びる
(`mutate` は 2026-08-31 に 245 本、2026-09-27 に 304 本 —— `git log` で実測)。**測った日と場所を名乗る数だけを書く。**

| 何を | いつ・どこで | 実測 |
|---|---|---|
| CI の 1 ジョブ (`npm ci` + typecheck + `verify:all` + `npm test` + `test:cov` + `build:web`) | 2026-09-26 · GitHub Actions (`ci.yml`) · コミット a4b861ae | **11 分 42 秒** |
| 変異検査の全件 (週次) | 2026-09-06 / 2026-09-13 · GitHub Actions (`mutation.yml`) · `main` (8a15960a) | **114.5 分 / 163.8 分** |
| 変異検査の週次 (前回と同じコミットで、incremental のキャッシュが全件に当たった) | 2026-09-20 · 同 | **3.1 分** |
| 変異検査の全件の初回の検査 (dry run) | 2026-09-27 · 開発コンテナ (4 コア) · 302 本 | **14 分 12 秒** (17,636 件) —— `dryRunTimeoutMinutes` の 20 分に対して 71% |
| 変異検査の 1 本 (`audit:mutate-changed`) | 2026-09-26 · 開発コンテナ · `sourceVerification.ts` | 約 6 分半 (パス 479) |

CI の所要は `mutation.yml` / `ci.yml` の実行履歴 (開始から最終更新まで) で、上の値は GitHub の API で
読んだ物である。**週次が測るのは `main` の木**で、`main` は 2026-09-05 のコミット (8a15960a) から
2026-09-27 の #788 のマージ (6ba54a8f) まで動かなかった —— 上の 3 本の週次 (#169〜#171) は
どれも同じ木を測っている (#172 は #788 のマージ後の木)。

## いつどれを回すか（推奨運用）

### 機能追加 / バグ修正の PR を出すとき

```bash
npm test && npm run verify:all   # CI は両方走らせる (verify:all は npm test を含まない)
npm run audit:mutate-changed     # `mutate` に載っているファイルを触ったとき
```

PR では変異検査は走らない。`mutate` に載っているファイルを触ったのに測らずに push すると、
`break` を割っていても**週次まで誰も気付かない** —— パス 478 が実際にそうなった
(`sourceVerification.ts` が 98.92% / 未到達 1 のまま push され、パス 479 が見つけた)。
`audit:mutate-changed` は変更と `mutate` の積だけを測るので、0 件なら何もせず終わる。

**`npm run quality:report` は PR ごとに回さない。** 生成器は `reports/mutation/mutation.json` が
**全掃引の報告**でなければ断る (下の「品質の頁を再生成する」)。

### 品質の頁 (`docs/QUALITY.md`) を再生成する

```bash
npm run mutate          # 全件 (実測の所要は上の表)
npm run quality:report  # 報告が全掃引であることを確かめてから typecheck / test / coverage を走らせ、頁を書く
```

生成器 (`scripts/quality-report.cjs`) は次の場合に**頁を 1 byte も書かずに**断る:

- 報告が無い
- 報告が**部分の報告** —— `--mutate X` で回した run の報告は、その 1 本しか測っていないのに
  頁の分母を名乗ってしまう。報告に残る `config.mutate` と今の `stryker.config.json` の `mutate` を
  突き合わせ、名指しされなかった本・行の無い本を数える。
  `--allow-partial` で書かせることはできるが、頁は「**部分の報告である**」と名乗り、
  lint:docs がその頁を落とす (公開する頁は全掃引の物だけ) —— ★ **この頁の検査は今は止めてある**
  (冒頭の囲み。頁を全掃引の報告から作り直すパスで戻す)

2026-09-27 (パス 490) まで、この文書は「PR を出すたびに `npm run quality:report` を回して
コミットに含める」と勧めていた。そのとき頁は**報告が測った 246 本**の点数を出しながら、分母の文には
**手で書いた 296 本**を、所要には「~2 min」を書いていた —— 点数と分母が別の集合から来ていた。

### `mutate` のファイルを触ったとき

```bash
npm run audit:mutate-changed    # 変わった本だけを測る。古い incremental の結果は finally で必ず消す
npm run mutate:triage           # 生存の上位を見る
npm run audit:survivors -- src/shared/example.ts --top=10   # 「生存」が本物かを当て直す (モジュール直下の値は偽の生存になりやすい)
```

`stryker.config.json` は `incremental: true` だが、**古い `.stryker-incremental.json` は偽の生存を作る**
(2026-08 に `atlassian.ts` が「生存 1」と誤報された —— config の注記)。差分を測るときは消してから回す。
`audit:mutate-changed` と CI の push 時の測定はどちらもそうしている。

### 定期的に（週次）

`.github/workflows/mutation.yml` が **毎週月曜 03:00 JST** (cron `0 18 * * 0` UTC) に全件を測る
(手動の `workflow_dispatch` も同じ)。**全件を 1 つの job に載せない** —— GitHub の job は 6 時間で
cancel され、2026-09-27 の週次 (#172) は全件を 1 job で測る形のままちょうど 6 時間で cancel された
(GitHub の実行履歴で実測)。今は `mutate` の全件を `scripts/mutate-changed.cjs --all --chunks` が
**行数で塊に分け** (1 塊 4,000 行まで・重い順にいちばん軽い塊へ)、`mutate-full` job が塊ごとに別の
matrix job で測り、`merge-full` job が `scripts/merge-mutation-reports.cjs` で塊の報告を **1 つの
`mutation-report` artifact へ併合する** (報告を読む道具 —— `quality-report` / `triage` /
`suggest-next-kill` / `verify-survivors` —— は 1 つのファイルを前提にするため)。

- **incremental のキャッシュは使わない。** 鍵が不変だと当たった週は保存されず、cancel された job は
  post で保存せず、古い incremental は偽の生存を作る (`stryker.config.json` の注記)
- **`thresholds.break` は塊ごとに掛かるので、合否は併合した全体の点数で決める。** 塊の job は
  Stryker が非 0 で終わっても報告が書けていれば警告にして通し、`merge-full` が全体の点数と各塊の
  結果を見る。報告を書けなかった塊 (初回検査の失敗・時間切れ) だけが赤くなり、その塊だけを
  *Re-run failed jobs* で回し直せる
- **揃っていない併合は何も書かず落ちる** (欠けた塊を全体と名乗らせない —— 生存を含む塊ほど欠けやすいので、
  点数が実物より良く出る)。手元で塊を順に測ったときの試しだけ `--allow-partial`
- 塊ごとの所要は最初の `workflow_dispatch` の実測で詰め直す (`timeout-minutes` と `max-parallel`)

併合した報告の取り方と頁の作り直し:

```bash
gh run download <run-id> --name mutation-report --dir reports/mutation   # 併合済みの報告
npm run mutate:merge -- --dir <塊の報告を置いた dir> --out reports/mutation/mutation.json   # 手元で併合するとき
npm run quality:report                                                    # docs/QUALITY.md を作り直す
```

併合した報告は `mergedAt` に併合した時刻を持つ (`gh run download` は mtime を保たないので、
頁の「報告の日時」は mtime ではなくこちらを読む)。**併合した報告を `.stryker-incremental.json` として
使わない** (差分検査は変異体の id でテストを引くが、併合は 1 回の実行ではない)。

**artifact が取れない環境では、ログの要約から作る** (2026-09-30 · パス 502)。`merge-full` は
`triage-mutations.cjs --summary` で**ファイルごとの件数**と run の `mutate`・併合の時刻を
ログへ 1 行ずつ出す (`RUN` / `MERGED_AT` / `MUTATE` / `F <path> K= S= N= I= E=`)。その行を貼り付けた
ファイルを渡すと、併合した報告の代わりに組み直して同じ頁を作る:

```bash
npm run quality:report -- --from-summary=<貼り付けたファイル>   # 行頭のタイムスタンプ・空行・# は読み飛ばす
```

**読めない行・F の重複・`MERGED_AT` / `MUTATE` の欠落・F が 1 行も無い要約は断る** (推測した報告から頁を書かない)。
頁は「要約から組んだ」ことと run を名乗る。同じ run の生存は `npm run mutate:triage -- --list`
(`merge-full` がログへ出す全件の一覧・`← 通した検査のファイル` つき) で読める。

`main` への push では**変わったファイルだけ**を、キャッシュを使わずに測る —— 同じ chunker が
対象を塊に分け (`--chunks`)、塊ごとに別の matrix job で測る (2026-09-30 パス 501 / 501d)。

**週次が測るのは `main` の木である。** 作業ブランチの変更は merge されるまで週次に映らない ——
ブランチで公開する品質の頁は、ブランチの木で回した全掃引から作る (ブランチで `workflow_dispatch` すれば
`mutation.yml` がそのブランチの木を測る)。

## しきい値ポリシー

`stryker.config.json` で定義 (この行は lint:docs が config と突き合わせる):

```json
"thresholds": { "high": 100, "low": 99.9, "break": 99.8 }
```

- `break: 99.8` —— 変異検査の点数が 99.8% を切ると Stryker が失敗で終わる (CI の mutation ジョブが赤くなる)
- `low: 99.9` / `high: 100` —— 目標は **100%**。等価な変異体は**理由を書いた** `Stryker disable` で外す
  (`lint:mutation-scope` が理由の無い pragma と広い範囲の無効化を落とす)
- 行ごと (ファイルごと) の点数も `break` を下回ってはいけない —— lint:docs が `docs/QUALITY.md` の
  各行を読み、下回る行は理由つきの台帳 (`PER_FILE_BELOW_THRESHOLD`) に在ることを要求する

カバレッジには明示のしきい値を設定していない (`vitest.config.ts` に `thresholds` は無い)。
パス 479 が測ったとおり、分岐 1,903 本の母集団では 1 本 = 0.05% なので、床を足しても 1 本の退行は
捕まらない —— 触ったファイルを変異検査で測るほうが効く。

## triage の読み方

`npm run mutate:triage` の出力例:

```
| score | file       | line | mutator              | replacement     |
|------:|------------|-----:|----------------------|-----------------|
|    10 | gmail.ts   |   95 | LogicalOperator      | `!to && !subject` |
|    10 | atlassian  |   37 | ConditionalExpression| `false`         |
|     9 | security   |   91 | NullishCoalescing    | `[]`           |
```

各列の意味:

- **score**: 殺す優先度。10 = 条件分岐 / 論理演算子（実 logic）、2 =
  StringLiteral（設定データ）
- **mutator**: Stryker が適用した変異の種類
- **replacement**: 元のコードがこの値に置き換わったが、テストはそれを検出
  できなかった

殺し方の典型パターン:

| mutator | 殺し方 |
|---|---|
| LogicalOperator (`\|\|` → `&&`) | 「片方だけ falsy のケース」を別テストにする |
| ConditionalExpression (`true` / `false` 化) | 元の分岐の **両方の枝** をアサート |
| OptionalChaining (`?.` 削除) | チェーン途中が undefined のケースを追加 |
| NullishCoalescing (`??` 削除) | デフォルト値が**実際に返ること**を `.toBe(default)` |
| StringLiteral (URL 変更) | 完全一致 `expect(url).toBe('...')` — 通常スルー |

**「生存」は当て直してから信じる。** モジュール直下の値 (`export const` の表・定数) の変異体は、
モジュールが変異体の有効化より前に読み込まれるので**殺されていても「生存」と報告される**
(パス 356 と 430 が手で当てた 2 件は、既存の検査が殺しているのに生存と報告されていた。
**何件が偽かは当て直すまで分からない** —— パス 430 は、それまで記録していた「N 件のうち M 件が偽」を、
当て直す道具の欠陥 (列を 0 始まりで数えていた) のためにまとめて撤回した)。`npm run audit:survivors -- <file>` が
1 つずつ原文へ当てて `vitest related` を走らせ、本物と偽を分ける。
★ **この呼び方は 2026-09-27 (パス 490) まで道具の本体へ届いていなかった** —— script が
`node scripts/verify-survivors.cjs --self-test` だけで、本体は `--self-test` を見ると自己検査を返して終わる。
報告が 1 つも無い木でも 0.4 秒で「✅ self-test 全件一致」exit 0 だった (当て直しの記録はどれも node を直接打っていた)。
今は `--self-test && node scripts/verify-survivors.cjs` で、npm が `--` のあとの引数を末尾の命令 (= 本体) に足す。

## アーキテクチャ詳細

```
[npm run quality:report]
        │
        ├── reports/mutation/mutation.json を読む
        │     ├─ 無い            → 断る (頁は書かない)
        │     └─ 部分の報告      → 断る (--allow-partial なら「部分の報告である」と名乗って書く)
        │
        ├── npm run typecheck       ←  終了コードで判定
        ├── npm test                ←  失敗の件数まで読む (「N failed | M passed」)
        ├── npm run test:cov        ←  coverage/coverage-summary.json (src/main/** のみ)
        │
        ▼
docs/QUALITY.md (上書き)
        │
        ▼
lint:docs (verify:all / CI) が頁の自己一致を検める (★ 今は止めてある —— 冒頭の囲み):
  表の行数 = 名乗る本数 · 総計 = 列の和 · 行ごとの率を検算 ·
  報告の日時は絶対時刻 · 全掃引を名乗る · カバレッジの行は範囲を名乗る
```

`docs/QUALITY.md` を全掃引のたびにコミットすれば、リポジトリ履歴自体が品質メトリクスの
ログになる。頁は報告の日時を**絶対時刻**で名乗るので、コミットした後に古びても読んだ人は気付ける
(2026-09-27 まで頁は「Report age: 0.1h」と**相対の齢**を書いており、コミットした瞬間から偽になっていた)。

## 既知の制約

- **全件の変異検査は時間がかかる** (上の実測表)。PR ごとには回さず、週次 + 触ったファイルだけ。
- **テストや helper が `mutate` のファイルを読むときは `readOriginalSource` を通す。** Stryker は
  台帳のファイルを計装してから sandbox に置くので、素の `readFileSync` は計装済みの本文を読む。
  2026-09-09 に足した helper (`aiEgressPairs.helpers.ts`) が client を素で読んでおり、
  **この枝で全掃引を回すと初回の検査が落ちていた** (2026-09-27 · パス 490 が直した。
  `originalSourcePolicy.test.ts` の母集団は `__tests__/` の helper まで広げてある)。
  週次の CI は `main` (この helper を含まない) を測っていたので鳴らなかった。
