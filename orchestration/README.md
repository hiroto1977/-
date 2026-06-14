# AIオーケストレーション — 進化し続ける仕組み (v3: 実行ランタイム搭載)

精度を保ちながら、作業サイクルごとにチーム数・並列度・領域を**増やし続ける**ためのメタ基盤です。
機能を1つ足すたびに、この仕組み自体が「次に何チームで・どの領域を細分化するか」を自己prescribe します。

**v3 で「記述＋検証」だけだった静的レジストリに『実行ランタイム』を追加しました。** register された組織
(CEO→COO→役員→管理職→一般職) と backlog を読み、作業項目を指揮系統へ解決し、PDCA/OODA サイクルの
各ステージへ割当てて**並列worktreeエージェントのディスパッチ計画**を生成します。これにより AI CEO/役員/
管理職/社員の階層が、整合検証されたまま**実際に動く仕組み**になります。

## 構成

| ファイル | 役割 |
|---|---|
| `registry.json` | 単一の真実源。組織・チーム・ラウンド履歴・バックログ・進化ポリシー・サイクル定義を機械可読に保持 |
| `registry.schema.json` | registry.json の構造 (JSON Schema) |
| `../scripts/verify-orchestration.cjs` | 整合検証 (org階層・単調増加・参照整合・cycles構造) + 次ラウンド計画の自動算出 |
| `../scripts/orchestrate.cjs` | **実行ランタイム (v3)**。status / cycle / dispatch / record で組織を実際に動かす |

## 実行ランタイム (`orchestrate.cjs`)

```bash
npm run orchestrate:status        # 組織サマリ + 直近round + backlog + サイクル
npm run orchestrate:dispatch      # 次roundの実行ディスパッチ計画 (並列Agent割当)
npm run orchestrate:import-requests  # チャットボット要望 (chatbot-requests.md) を backlog へ取込み
node scripts/orchestrate.cjs cycle pdca       # PDCA ステージ定義
node scripts/orchestrate.cjs cycle ooda       # OODA ステージ定義
node scripts/orchestrate.cjs dispatch --teams a,b --cycle pdca [--json]
node scripts/orchestrate.cjs record --round N --teams a,b,... --shipped "..." [--note "..."] [--dry-run]
node scripts/orchestrate.cjs import-requests [--file f.md] [--team id] [--priority N] [--dry-run]
```

- **import-requests** は AI コンシェルジュ (ChatbotWidget) の「📥 要望」ボタンで書き出した
  Markdown (`- [ ] <要望> _(受付: YYYY-MM-DD)_`) を読み、各行を **designed (着手可能)** の
  backlog 候補として取込む。team は domain/focus の語一致で自動解決 (解決不能は `--team` 必須)、
  同名 title はスキップ (重複防止)。これで「**ユーザー要望 → backlog → dispatch → 実装 →
  record**」のループが機構として閉じる。

- **dispatch** は read-only。各 team を指揮系統 (manager→executive→秘書室→COO→CEO) へ解決し、
  サイクルの **do(設計)** ステージにだけ並列 read-only Agent を割当てた計画を出力する。
  COO (Claude本体) はこの計画に沿って **do=並列Agent起動 → check=直列実装+全ゲート検証 → act=record** を実行する。
- **record** は round を registry に追記する唯一の書込み口。連番・単調増加・team 実在を強制し、
  書込み後に `verify:orchestration` で整合を再確認する。
- サイクル定義は `registry.json` の `policy.cycles` (PDCA/OODA) に機械可読で持ち、`verify:orchestration` が
  各ステージの `stage/owner/desc/parallel` 構造を検証する。

### 実行モデル (policy.executionModel)

| 段階 | サイクル | 主体 | 並列/直列 |
|---|---|---|---|
| 設計 | PDCA:do / OODA:observe | 一般職 (read-only Agent) | **並列** (独立worktree) |
| 実装+検証 | PDCA:check / OODA:orient→decide→act | COO (+CQO監査) | **直列** |
| 記録 | PDCA:act | COO | 直列 (`record`) |

「設計=並列 / 実装+全ゲート検証=直列」を機構として強制し、共有ファイルの同時書込みを避ける。

## 組織構造 (registry.json の `org`) — CEO(人間) → COO(Claude) → C-suite → 部 → 一般職

最上位は **人間の CEO (オーナー＝あなた)**。その直下に **COO (オーケストレーター＝Claude 本体)**
を置き、COO が AI 組織全体の実行を統括する。COO は**部門を直轄せず**、標準 C-suite に倣った
**5 役員 (CFO・CHRO・CSO・CIO・CQO)** を通じて運営する (監督と実務の分離)。指揮系統は機械検証
される (`verify-orchestration`)。

各役員には **秘書室 (1室=4体の AI チーム)** を常設し、役員を継続サポートする (指揮系統＝ラインでは
なく支援＝スタッフ機能)。

```
CEO (オーナー＝あなた — 人間。経営方針・優先順位の決定と最終承認。AIには配置しない)
 └ COO (オーケストレーター＝Claude — CEOの方針を実行に落とし込み、実装・全ゲート検証・コミットを担う本体)
     ├ CFO  最高財務責任者   … 財務・税務・資金調達     [🗂 CFO秘書室 4体]
     │   └ 税務部 / 資金調達部
     ├ CHRO 最高人事責任者   … 人事・給与・労務         [🗂 CHRO秘書室 4体]
     │   └ 給与・人件費部
     ├ CSO  最高戦略責任者   … 経営戦略・分析・成長・予測 [🗂 CSO秘書室 4体]
     │   └ 経営分析部 / 経営管理部(FP&A)
     ├ CIO  最高投資責任者   … 投資・資産運用・為替       [🗂 CIO秘書室 4体]
     │   └ 投資部 / 家計・為替部
     └ CQO  最高品質責任者   … 品質保証・セキュリティ     [🗂 CQO秘書室 4体]
         └ 品質保証部
              └ 各部の配下に 一般職層 (staff = teams) … ドメインの調査/設計 (read-only Agent)
```

現編成: **CEO 1 (人間) / COO 1 (Claude) / 役員 5 (CFO・CHRO・CSO・CIO・CQO) / 秘書室 5室(計20体) / 管理職 8 / 一般職 108 チーム** (round 102 時点)。`npm run orchestrate:status` で最新編成を確認できます。

### 秘書室 (secretariat) — 各役員の常設サポート

**支援先は AI役員 (CFO・CHRO・CSO・CIO・CQO)** で、各 AI役員に 1 室、**4 体の AI** からなる秘書チームを
常設し、役員の判断・運営を継続的に支える。人間の CEO・オーケストレーターの COO は支援先にならない。
ラインの指揮系統ではなく**スタッフ(支援)機能**で、4 体は次の責務を分担する:

| # | 役割 | 内容 |
|---|---|---|
| 1 | 日程・段取り | 論点整理・アジェンダ・優先順位の下ごしらえ |
| 2 | 資料・ブリーフィング | 役員判断に要る資料・要約・前提の準備 |
| 3 | 連絡・渉外 | 配下の調査チーム・他役員/COO との連絡調整 |
| 4 | 記録・進捗・品質 | 決定事項の記録、進捗と品質の一次トラッキング |

検証される不変条件 (秘書室): 各 AI役員にちょうど 1 室 / 1 室は 4 体 /
支援先 (`supports`) は実在の **AI役員のみ** (人間のCEO・COO は不可) / 秘書室 id は一意 (役員と秘書室は 1 対 1)。

| 役員 | 職掌 | 配下の部 (管理職) |
|---|---|---|
| CFO  最高財務責任者 | 財務・税務・資金調達 | 税務部 / 資金調達部 |
| CHRO 最高人事責任者 | 人事・給与・労務 | 給与・人件費部 |
| CSO  最高戦略責任者 | 経営戦略・分析・成長・予測・予実管理 | 経営分析部 / 経営管理部(FP&A) |
| CIO  最高投資責任者 | 投資・資産運用・為替 | 投資部 / 家計・為替部 |
| CQO  最高品質責任者 | 品質保証・セキュリティ・変異テスト | 品質保証部 (セキュリティ / 品質監査 / 変異テスト・等価変異判定・golden値検証) |

検証される不変条件: CEO は人間で AI 非配置 / COO は CEO 直属で AI 非配置 (実装本体) /
役員は COO 直属 / 管理職は実在の役員 or COO直轄に属し双方向整合 /
全 active チームは実在の管理職に**1つだけ**属する (指揮系統が一意)。

## 組織運営スキーム (1 サイクル = round)

役職に応じた責務分担で「方針 → 設計 → 実装 → 検証 → 記録」を1サイクルとして回す。

| 段階 | 主体 | 役割 |
|---|---|---|
| 1. 方針 | **CEO (あなた)** | 優先順位・到達点・制約 (例: 税務は概算+導線のみ) を指示し、成果を最終承認 |
| 2. 計画 | **COO (Claude)** | `orchestration:plan` で次ラウンドの推奨チーム数と着手候補を自己prescribe。担当役員へ割当 |
| 3. 設計 | **役員 → 管理職 → 一般職** | 担当領域を並列の調査 Agent (read-only) が設計。論点・式・境界値・テスト方針を素案化 |
| 4. 実装 | **COO** | 素案を1論点ずつ直列実装 (共有ファイルの同時書込みを避ける) |
| 5. 検証 | **COO + CQO** | typecheck / lint / test / verify:all / build:web を全 green に。CQO配下が端数・ゼロ除算・境界を監査 |
| 6. 記録 | **COO** | registry を更新 (新領域は teams[] 追加 / round 追記 / backlog 更新) し、コミット・プッシュ |

運営原則:
- **監督と実務の分離** — COO は部門を直轄せず役員を通じて動かす。役員は戦略・優先順位・リスク監督に専念。
- **並列＝設計 / 直列＝実装** — 調査は役員配下のチームで並列、実装と全ゲート検証は COO が直列で担う。
- **単調増加と細分化** — 作業のたびにチーム数は減らさず、新領域の追加で職掌を細分化 (`policy.growthRule`)。
- **機械検証された指揮系統** — 上記の階層・参照整合・チーム数は `verify:orchestration` (CIの `verify:all`) で強制。
- **エスカレーション** — 解釈に曖昧さがある論点や大規模リファクタは、COO が CEO (あなた) に確認してから着手。

## 進化ルール (registry.json の `policy`)

1. **単調増加**: 各 round の `teamCount` は前 round 以上。作業のたびにチームは減らさない。
2. **細分化**: チームを増やすときは新しい領域 (`teams[]`) を追加して責務を細分化する。
3. **役割分離**: 並列＝調査/設計 (read-only の Agent)、直列＝実装＋全ゲート検証 (オーケストレーター)。
   共有ファイルへの同時書込みを避ける。
4. **品質ゲート**: 各実装コミット前に typecheck / lint / test / verify:all / build:web を全 green に。

これらは `npm run verify:orchestration` (= `verify:all` の一部) で機械的に強制されます。

## 1 サイクルの回し方

```bash
# 1. 次ラウンドの計画を自己prescribe (推奨チーム数 + 優先度順の着手候補)
npm run orchestration:plan

# 2. 計画に沿って調査チーム (Agent) を並列起動 → 各論点を設計
# 3. オーケストレーターが 1 論点ずつ実装 → 全ゲート green を確認 → コミット
# 4. registry.json を更新:
#    - 新領域なら teams[] に追加
#    - 実装した round を rounds[] に追記 (teamCount は前ラウンド以上)
#    - 着手済み backlog の status を shipped に、新たな設計論点を designed で追加
# 5. npm run verify:orchestration が green であることを確認してコミット
```

## バックログの状態

`status`: `designed` (設計済・未着手) → `in-progress` → `shipped` / `dropped`。
前提条件 (データ源など) が未整備で着手できない論点は `blocked` (`note` に理由) とし、候補から外す。
`npm run orchestration:plan` は `designed` を優先度順に提示し、推奨チーム数に満たなければ
「新領域の調査チームを追加して論点を補充」と警告します。

## なぜ精度が保たれるか

- レジストリが CI ゲート (`verify:all`) に組み込まれているため、**チームを増やしても整合性が壊れない**。
- 単調増加・最低チーム数・参照整合・teamCount 一致を機械検証するので、人手の記録ミスを検出。
- 「次に何をすべきか」がコードから算出されるため、サイクルを跨いでも方針がぶれない。
