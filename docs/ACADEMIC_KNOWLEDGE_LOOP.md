# 学術知識ループ 運用仕様書（ACADEMIC_KNOWLEDGE_LOOP）

> **新しいセッションへ:** これは `academicKnowledge.ts` に検証済み学術概念を継続追加する
> 「標準ループ」の完全な運用仕様です。ユーザーが `/loop`（または同等の指示）を出している
> 間、本書の手順を 1 バッチ単位で繰り返します。**ユーザーが「OK」と言うまで継続**します。
>
> 関連: データ本体 `src/renderer/data/academicKnowledge.ts` / 表 `docs/ACADEMIC_KNOWLEDGE.md` /
> Vault 仕様 `docs/KNOWLEDGE_VAULT.md`。

## 1. 目的とスコープ

経済学・経営学・人間科学・ビジネス法務・情報社会学の 5 ディシプリンにわたる、確証済みの
学術概念・理論・古典を 1 バッチ 6 件ずつ追加し続ける。データは Obsidian ナレッジ Vault と
AI オーケストレーション文脈の単一の真実源（single source of truth）になる。

**現状（2026-06 時点）:** 1409 概念 / 235 バッチ完了。ディシプリン分布は
economics 411・human-science 264・business-law 251・management 243・information-sociology 240。
※ economics が多く、human-science / management はほぼ枯渇（標準的概念は採録済み）。
新規バッチでは economics / business-law / information-sociology を優先し、
human-science / management は「本当に未収録の専門的概念」のみ採る。

## 2. 採録基準（厳守）

1. **1 バッチ = 6 概念**、最低 4 ディシプリンにまたがる。
2. **各概念は独立 2 出典以上**で確証。うち **1 件以上は権威ある出典**（大学・学会・査読論文・
   公的機関 `.go.jp`/`.gov`/EU・百科事典級 = Britannica / Stanford Encyclopedia of Philosophy /
   nobelprize.org / IMF / OECD / BIS / WIPO / WHO・原典/一次資料）。
3. **捏造禁止**。確認できない事実・人名・年・出版社・誌名・論文題は採用しない。確信が持てない
   属性は省くか別概念に差し替える。**正確性 > 網羅性**。
4. **Wikipedia は出典に使わない**（百科事典級として認めない）。
5. 出典 `type` は **`'academic' | 'reference' | 'government' | 'media'` のみ**（他の値は型エラー）。

## 3. ブランチ・コミット規約（MUST）

- 開発は **`claude/modest-noether-knlmJ` ブランチのみ**。他ブランチへ無断 push しない。
- コミット著者は **`Claude <noreply@anthropic.com>`**（`git config user.email noreply@anthropic.com`
  / `user.name Claude`）。GitHub squash-merge コミットは `noreply@github.com` 著者になり stop-hook が
  「Unverified」警告を出すが、これは GitHub 製コミットで**想定内・無視してよい**（amend しない）。
- **モデル識別子（claude-haiku-… 等）をコミット/PR/コード/成果物に絶対に入れない**（チャット返信のみ）。
- フィーチャーブランチへの **force-push はユーザー許諾済み**（`git push --force-with-lease`）。

## 4. 1 バッチの完全手順

> 効率化のため、前バッチの PR をマージ・ブランチ同期した直後に**次バッチの調査エージェントを
> バックグラウンド起動**し、CI 待ち時間と調査を重ねる（パイプライン化）。

1. **調査（リサーチエージェント）**: `Agent`（sonnet, `run_in_background: true`）に 6 概念の
   調査を委譲。プロンプトには §2 の品質ルール・§5 の重複回避・ディシプリン配分指示・「ファイルを
   編集せず整形テキストのみ返す」を明記。`§7 のプロンプト雛形`を使う。
2. **重複検証（§5）**: 返ってきた 6 概念それぞれを **id grep・title grep・意味的重複**の
   3 チェックで確認。1 件でも既存なら差し替える（自分で代替概念を grep 探索 or 追加調査）。
3. **属性の点検**: リサーチ結果の人名・年・出版社を自分の知識で再確認。誤り（例: 出版社違い・
   著者取り違え）は書き込み前に修正する（§6 の罠を参照）。
4. **本体へ追記**: `src/renderer/data/academicKnowledge.ts` の末尾 `];\n// Stryker restore all`
   直前に 6 エントリを挿入（§8 のフォーマット）。
5. **表へ追記**: `docs/ACADEMIC_KNOWLEDGE.md` のフッター行「出典 URL は …」の直前に 6 行追記。
6. **Vault 再生成**: `npm run vault:build`（id 重複があればここで throw → 重複を解消）。
7. **ゲートスイート（§9）**を全 green まで実行。
8. **ビルド成果物を stash**: `git stash push dist/standalone.html -m "build artifact"`
   （`dist/standalone.html` はコミットしない）。
9. **コミット**: 著者を設定し、`academicKnowledge.ts` / `docs/ACADEMIC_KNOWLEDGE.md` /
   `knowledge-vault/` を add してコミット（メッセージは §10）。
10. **push**: `git push --force-with-lease -u origin claude/modest-noether-knlmJ`
    （ネットワーク失敗時のみ 2s/4s/8s/16s バックオフで最大 4 回再試行）。
11. **Draft PR 作成** → `update_pull_request(draft:false)` で ready 化 → `subscribe_pr_activity`。
12. **CI 確認**: `pull_request_read(method:'get_check_runs')` で conclusion=success を確認。
13. **squash マージ** → `git fetch origin main -q && git checkout -B claude/modest-noether-knlmJ
    origin/main -q` でブランチ同期。
14. 次バッチへ。

## 5. 重複回避の 3 チェック（最重要・過去に何度も踏んだ）

各候補について **3 つすべてが 0 件**のときのみ採用する：

```bash
# (a) 日本語タイトル + 英語語句 + 提唱者名（・の有無、全角/半角カナ、漢字異体を変える）
grep -c "キーワード" src/renderer/data/academicKnowledge.ts
# (b) 採用予定の id 文字列そのもの（別タイトルで同 id が既存のことがある）
grep -c "id: 'econ-xxx'" src/renderer/data/academicKnowledge.ts
# (c) スタンドアロンの title 行（本文中の言及と区別する）
grep -nE "^\s*title:.*キーワード" src/renderer/data/academicKnowledge.ts
```

- **id 衝突は title grep では見抜けない**: 例) 既存 `infosoc-uses-gratifications`（利用と満足理論）に
  対し新規「利用と充足理論」を別タイトルで書くと `vault:build` が「id 重複」で落ちる。**必ず id を grep**。
- **意味的重複**: タイトルも id も違うが同一現象、というケースを排除する。実例：
  - 「過剰正当化効果」≒ 既存「アンダーマイニング効果（過正当化効果）」
  - 「ピーク・エンドの法則」は既存（`ピークエンド` の grep では中黒違いで漏れる → 中黒入りで確認）
  - Karl Polanyi（大転換）と Michael Polanyi（暗黙知）は別人 — 「ポランニー」だけでは誤判定。
- id prefix 規約: economics→`econ-` / management→`mgmt-` / human-science→`human-` /
  business-law→`bizlaw-` / information-sociology→`infosoc-`。

## 6. 既知の罠（リサーチエージェント由来の捏造に注意）

過去バッチで実際に検出・修正した誤りパターン。**書き込み前に必ず点検**する：

- **架空の著者名**: 例) "Zero as a Special Price" の著者を「Matsumoto/Norton」と誤生成
  （正: Shampanier, Mazar & Ariely 2007）。Slow Media Manifesto を「Blöchl/Würdemann/Sorge」と誤生成
  （正: Köhler, David & Blumtritt）。Slow Journalism の中心人物を架空名で生成（正: Megan Le Masurier 2015）。
  自動化バイアスを「ロッテンバーグ/キルト」と誤生成（正: Mosier & Skitka）。
- **出版社の取り違え**: Postman『Technopoly』を NYU Press と誤記（正: Knopf。Postman は NYU 教授だが
  出版社は別）。→ 確信できない出版社 URL は Britannica の人物伝などに置き換える。
- **条文・制度番号の誤り**: グリーンメール課税を「内国歳入法1059条」と誤記（正: §5881 の excise tax）。
  確信が持てない番号は丸める / 一次法令（e-Gov 等）に当たる。
- **WebFetch は 403 で使えない**（本環境）。URL の実在は確認できないため、**確信のあるカノニカル
  ドメインのパターンのみ**使う（britannica.com/topic・/biography、plato.stanford.edu/entries、
  laws.e-gov.go.jp/law、*.go.jp、oecd.org、imf.org、bis.org、jstor.org/stable、
  journals.uchicago.edu、nobelprize.org、annualreviews.org など）。

## 7. リサーチエージェント プロンプト雛形（要点）

`Agent(subagent_type: general/claude, model: sonnet, run_in_background: true)` に渡す：

- 「6 概念・最低 4 ディシプリン・economics/business-law/information-sociology を優先」
- 「データセットは ~1400 概念で極めて網羅的。**大半の候補は既存**と想定し grep を多数回まわす」
- §5 の 3 チェック（id・title・意味）を**候補ごとに必須**・grep 件数を報告させる
- §2 の品質ルール（≥2 出典・≥1 権威・Wikipedia 禁止・**捏造禁止/属性を自分の知識で確認**）
- §6 の実例（Shampanier… / Köhler… / Postman=Knopf）を「この種の誤りを避けよ」と明示
- 出典は `'academic'|'reference'|'government'|'media'` のみ・確信あるカノニカル URL のみ
- 「ファイルを編集せず整形テキストのみ返す」
- 返却フォーマット（id / title / discipline / statement_part1 / statement_part2 / keyFigures /
  source1_url・type・label / source2_url・type・label）

## 8. エントリのフォーマット

```ts
  {
    id: 'econ-xxxx-yyyy',                 // §5 の prefix 規約
    discipline: 'economics',             // 5 値のいずれか
    title: '日本語タイトル',
    statement:
      '前半チャンク（~150-200字、句点で終止）。' +
      '後半チャンク（~150-200字、句点で終止）。',  // 必ず 2 チャンクを + で連結
    keyFigures: '提唱者（English, 生–没）／初出（年・誌・巻号）',
    asOf: '2026-06',
    sources: [
      { url: 'https://...', type: 'academic', label: '説明（誌名・巻号・著者・年）' },
      { url: 'https://...', type: 'reference', label: '説明' },
    ],
  },
```

- `statement` は **必ず 2 つの単一引用符チャンクを ` +` で連結**（合計 ~300-400 字）。
- `AcademicDiscipline` / `AcademicSourceType` の型に**新しい値を追加しない**。
- 末尾 `];\n// Stryker restore all` の直前に挿入。`// Stryker disable all` ブロック内なので
  mutation スコープ外（静的データ）。

## 9. ゲートスイート（CI 等価・全 green 必須）

```bash
npm run vault:build      # 本体データ → knowledge-vault/ markdown 再生成（id 重複検知）
npm run typecheck        # tsc -b --noEmit --force
npm run verify:all       # verify:arch + lint:forbidden/imports/docs/test-coverage/shell
                         #   + verify:orchestration + vault:check + chain:verify
npm run lint             # eslint
npm test                 # vitest（現状 5529 tests・全 pass を確認）
npm run build:web        # dist/standalone.html を生成（生成自体の成功を確認、コミットはしない）
```

- `npm test` が **稀に 1 件 flaky**（Vault 系のタイミング依存）で落ちることがある。再実行で
  5529 全 pass を確認すれば良い（実故障と区別する）。
- `npm run typecheck` は単独実行（`| tail` でパイプすると終了コードが隠れる罠）。

## 10. コミット / PR の書式

**コミットメッセージ:**
```
feat(academic): 学術概念6件を追加（A/B/C/D/E/F）

batch NNN: 旧件数→新件数 concepts

Co-Authored-By: Claude <noreply@anthropic.com>
```

**PR:** タイトル `feat(academic): 学術概念6件追加 batch NNN（旧→新）`、本文は 6 概念の箇条書き
（各々の提唱者・年）+ テストプラン（typecheck/verify:all/lint/test 5529/build:web のチェック）。
Draft で作成 → ready 化。GitHub MCP ツール（`mcp__github__*`）のみ使用。スコープは
`hiroto1977/-` のみ。

## 11. PR アクティビティの扱い

`subscribe_pr_activity` 中はイベント（CI/レビュー）が `<github-webhook-activity>` で届く。
CI を green にしてマージするのが各 PR の終端。merge されると自動で unsubscribe される。
**GitHub への返信は最小限**に（コメントは本当に必要な時だけ）。

## 12. 終了条件

ユーザーが明示的に **「OK」** と言うまでループを継続する。中断指示（停止/別タスク）が来たら
そのバッチの途中成果を安全な状態（コミット済 or 破棄）にしてから従う。
