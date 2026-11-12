# モデルと effort の選び方 —— 指示のティア (2026-10-07 · パス 505)

利用者の 1 つの指示に対して、**どれだけ深く・長く・何に任せて**働くかを、指示ごとに同じ基準で決めるための方針。
正は `scripts/task-tier.cjs` の表 `TIERS` で、この文書と `.claude/agents/*.md` はそれと
`src/shared/__tests__/taskTierPolicy.test.ts` で突き合わせる (数や名前を 2 度書かない)。

## 1. 何が自動で、何が手動か

| 何を決めるか | 誰が決めるか | 仕組み |
| --- | --- | --- |
| **主セッション**のモデル | 利用者 (`/model`) | アシスタントにも hook にも変える口は無い。合わないときはアシスタントが**応答の冒頭 1 行**で案内する |
| **主セッション**の effort | 利用者 (`/effort`) | 同上 —— hook が推奨を 1 行で出し、アシスタントが現在の物と違えば 1 行で案内する |
| 指示の**ティア** | 自動 | `UserPromptSubmit` hook (`scripts/task-tier.cjs`) が指示の文を読んで `light` / `standard` / `deep` を決め、1 行の案内を文脈へ足す |
| **サブエージェント**のモデルと effort | 自動 | ティアごとの agent 定義 `.claude/agents/<agent>.md` の frontmatter (`model` / `effort`) が Agent tool に効く |
| **Workflow** (多段のエージェント) の段ごとの effort | 自動 (提案は deep だけ) | 走らせるには利用者の opt-in (`ultracode` か「workflow を使って」) が要る。script の `agent(…, { effort })` で段ごとに渡す |
| **Routine / 子セッション**のモデル | 自動 | `create_session` / `create_trigger` の `model` 引数をティアで決める (下の §4) |

**主セッションの行だけは利用者の手が要る** —— それがこの方針の正直な限界で、hook はそこを「推奨を見せる」所まで埋める。

## 2. ティアの表

| ティア | 意味 (`summary`) | 主セッションの effort (推奨) | 任せる agent (model / effort) | Workflow |
| --- | --- | --- | --- | --- |
| `light` (軽) | 1 ファイルの訂正・状態の確認・門を回す・マージや push などの操作。主セッションだけで足りる | low | scout (haiku / low) | 提案しない |
| `standard` (標準) | 機能や修正を検査つきで入れる・複数ファイルの機械的な直し・台帳の更新。手を分けるなら mechanic | medium | mechanic (sonnet / medium) | 提案しない |
| `deep` (深) | 測っていない軸を実機で測る・欠陥や脆弱性を探す・原因を特定する・設計や法則を変える・パスを続ける | high (「徹底」「網羅」「全件」なら xhigh) | auditor (inherit / high) | 提案する (検証段は xhigh) |

- `inherit` は主セッションのモデルを継ぐ (利用者が `/model` で選んだ最も強い物)。auditor を別のモデルに固定しないのは、重い判断を主セッションより弱いモデルに任せないため。
- 軽い仕事に重い検証を掛けない・重い仕事を軽い手で片付けない —— ティアはその両方向の誤りを止めるために在る。

## 3. 判定の印

判定は純関数 `classifyInstruction(prompt)` (一致した印を**根拠**として案内に出すので、読んだ人が検算できる):

1. **deep の印** が 1 つでも在れば deep —— 測る (測って・実測・実機)・探す (脆弱性・監査・欠陥・バグ)・原因 (根本・原因・調査・解析)・設計と法則・変異検査 / e2e・**「続けて」** (このリポジトリでは「次のパスを回す」の合図)。「脆弱性を確認して」は確認ではなく監査なので deep が勝つ。
2. deep が無く **light の印** が在り、箇条書きが 3 行未満なら light —— 誤字・リネーム・確認して・教えて・状態・マージ・push・コミット・回して・再生成。
3. それ以外は standard (既定)。箇条書きが 3 行以上なら light の印が在っても standard。
4. 「徹底」「網羅」「漏れなく」「全件」「全画面」などの**徹底の印**は deep の effort を xhigh へ上げる (ティアは変えない)。
5. 空・2 文字未満・スラッシュコマンド (`/model` など) には何も出さない。

印の一覧は `scripts/task-tier.cjs` の `DEEP_MARKS` / `LIGHT_MARKS` / `THOROUGH_MARKS` が持つ (ここへ写さない)。手で確かめるなら `node scripts/task-tier.cjs --classify "指示の文"`。

## 4. 指示を受けたときのアシスタントの手順

1. 文脈に足された `[task-tier] …` の 1 行を読む。
2. 主セッションの effort が推奨と違えば、**応答の冒頭 1 行**で `/effort` を案内する (モデルが明らかに合わないときは `/model` も)。案内は 1 行で、作業は止めない。
3. 手を分ける仕事は、ティアの agent (`scout` / `mechanic` / `auditor`) へ任せる。数える段は常に `scout` でよい。
4. deep で手が多ければ Workflow を**1 行で提案**する (走らせるのは利用者の opt-in の後)。検証段 (対照・反証) は `effort: 'xhigh'`、機械的な段は `'low'`。
5. Routine や子セッションを作るなら: light は `claude-haiku-4-5-20251001`、standard は `claude-sonnet-5-5`、deep は主セッションと同じモデル。
6. **長く正確に**: deep と standard は途中で止めない —— 測る → 直す → 留める (検査と対照) → 記録 (`docs/SESSION_HANDOFF.md` / `docs/REMAINING_WORK.md` / CLAUDE.md) → `npm test && npm run verify:all` → 出荷物が動いたら実機 (`e2e` / `e2e:lite` / `perf`) → commit → push → draft PR、まで 1 つの流れで走る。区切りごとに commit して、落ちたら「何を回して何が落ちたか」を落ちた文面のまま書く。

## 5. 機械が留める物

- `scripts/task-tier.cjs --self-test` と `taskTierPolicy.test.ts`: 判定の標本 (deep / light / standard・徹底・案内を出さない形)・案内が 1 行で 300 字以内。
- `taskTierPolicy.test.ts`: `.claude/agents/*.md` の集合と `TIERS` の agent が**両方向**に一致し、frontmatter の `model` / `effort` が表と同じ・`scout` は書く道具を持たない・この文書と `CLAUDE.md` が表の名前を名指ししている。
- `lint:mcp-servers`: hook のコマンドが `node scripts/<name>.cjs` の形で、台帳 (`HOOK_LEDGER`) と双方向。`.claude/settings.json` は整合性チェーンの保護対象なので、hook を足す編集は `chain:append` を伴う (`sessionStartCodeGuarded.test.ts` が外側から見る)。

## 6. 変えたいとき

- 主セッション: `/model` と `/effort` (この文書の外)。
- 印やティアの中身: `scripts/task-tier.cjs` の `TIERS` / `*_MARKS` を直し、`--self-test` の標本とこの文書の §2 を揃える (検査が食い違いを鳴らす)。
- agent の性格: `.claude/agents/<agent>.md` の本文。`model` / `effort` を変えるなら `TIERS` も一緒に。
