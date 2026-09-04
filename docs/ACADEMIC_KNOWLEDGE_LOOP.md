# 学術知識ループ 運用仕様書（ACADEMIC_KNOWLEDGE_LOOP）

> **新しいセッションへ:** これは `academicKnowledge.ts` に検証済み学術概念を継続追加する
> 自動パイプラインの完全な運用仕様です。ユーザーが「作業を継続して」と指示した場合、
> 本書の手順を 1 バッチ単位で自動的に繰り返します。
>
> 関連:
> - 全体仕様（発見〜確証〜回答）`docs/KNOWLEDGE_PIPELINE_SPEC.md`
> - データ本体 `src/renderer/data/academicKnowledge.ts`
> - 概念表 `docs/ACADEMIC_KNOWLEDGE.md`
> - 機械可読仕様 `docs/BATCH_APPEND_SPECIFICATION.md`
> - Vault 仕様 `docs/KNOWLEDGE_VAULT.md`
> - 確証ゲート（コード）`src/renderer/data/knowledgeProvenance.ts` / `npm run verify:knowledge`
> - セッション引継ぎ `docs/SESSION_HANDOFF.md`

## 1. 目的とスコープ

経済学・経営学・人間科学・ビジネス法務・情報社会学の 5 分野にわたる、確証済みの
学術概念・理論・古典を 1 バッチ 6 件ずつ追加し続ける。データは Obsidian ナレッジ Vault と
AI オーケストレーション文脈の単一の真実源（single source of truth）になる。

**現状（2026-06-24 時点）:** 2,267 概念 / 376 バッチ完了。分野分布:
economics 597・management 457・human-science 422・business-law 404・information-sociology 387。

## 2. 採録基準（厳守）

1. **1 バッチ = 6 概念**、最低 4 分野にまたがる。
2. **各概念は独立 2 出典以上**で確証。うち **1 件以上は権威ある出典**（大学・学会・査読論文・
   公的機関・百科事典級 = Britannica / Stanford Encyclopedia of Philosophy /
   nobelprize.org / IMF / OECD / BIS / WIPO / WHO・原典/一次資料）。
3. **捏造禁止**。確認できない事実・人名・年・出版社・誌名・論文題は採用しない。確信が持てない
   属性は省くか別概念に差し替える。**正確性 > 網羅性**。
4. 出典 `type` は **`'academic' | 'reference' | 'government' | 'media'` のみ**（他の値は型エラー）。

## 3. ブランチ・コミット規約

- 開発ブランチは **タスクプロンプトで指定されたブランチ**を使う。
  現在: `claude/eager-brown-7cev3c`
- コミットメッセージ形式:
  ```
  feat(knowledge): Batch NNN — 6 academic concepts
  
  Append 6 verified academic concepts to VERIFIED_CONCEPTS array and documentation:
  - Concept 1 (Scholar1)
  - Concept 2 (Scholar2)
  ...
  
  All quality gates passed: vault:build (XXXX files), typecheck, verify:all, test (XXXX), build:web.
  Total concepts: X,XXX.
  
  Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_XXXXX
  ```
- **モデル識別子をコミット/PR/コード/成果物に入れない**（チャット返信のみ）。

## 4. 1 バッチの完全手順

### ステップ 1: デデュプ準備

```bash
# 既存ID一覧を生成
grep -o "id: '[^']*'" src/renderer/data/academicKnowledge.ts \
  | sed "s/id: '//" | sed "s/'$//" | sort > /tmp/all_ids.txt
wc -l /tmp/all_ids.txt
```

### ステップ 2: 候補生成と重複検証

6 概念の候補 ID を生成し、衝突チェック:

```bash
for id in econ-xxx mgmt-yyy human-zzz bizlaw-aaa infosoc-bbb econ-ccc; do
  grep -q "^$id$" /tmp/all_ids.txt && echo "COLLISION: $id" || echo "UNIQUE: $id"
done
```

**全 6 個が UNIQUE になるまで候補を差し替える。**

### ステップ 3: 並列研究エージェント起動

6 エージェント（model: sonnet）を並列起動。各エージェントに:
- 概念名・分野指定
- ≥2 出典確証の指示
- JSON形式での返却指示
- **「ファイルを直接編集しない」** の明示（セキュリティ上重要）

### ステップ 4: 結果収集と合成

全 6 エージェント完了後:
1. 各 JSON を収集・形式検証
2. HTMLエスケープ修正（`&amp;` → `&` 等）
3. keyFigures の全幅スペース `／` 確認
4. statement 字数確認

### ステップ 5: ファイル追記

#### academicKnowledge.ts
末尾の `];\n// Stryker restore all` 直前に 6 エントリを挿入。

#### docs/ACADEMIC_KNOWLEDGE.md
フッター行「出典 URL は…」の直前に 6 行の表データを挿入:
```markdown
| 分野 | 概念 | 提唱者・初出 |
```

### ステップ 6: 品質ゲート（全 green 必須）

```bash
npm run vault:build          # vault 生成（1回目）
npm run vault:build          # vault 生成（2回目、ドリフト安定性確認）
npm run typecheck            # tsc -b --noEmit --force
npm run verify:all           # verify:arch + lint:* + vault:check + chain:verify
npm test                     # vitest（現状 5529 tests）
npm run build:web            # dist/standalone.html 生成確認
```

### ステップ 7: コミット・プッシュ

```bash
git add -A
git commit -m "feat(knowledge): Batch NNN — 6 academic concepts ..."
git push -u origin <branch-name>
```

### ステップ 8: 次バッチへ

即座にステップ 1 に戻り、次バッチを開始。

## 5. エントリのフォーマット

### 現行形式（Batch 370 以降）

```ts
  {
    id: 'econ-xxxx-yyyy',
    discipline: 'economics',
    title: '日本語タイトル（括弧内に別名）',
    statement: '80〜150字の日本語説明。学者名はローマ字で表記。',
    keyFigures: 'First Name ／ Second Name ／ Third Name',
    asOf: '2026-06',
    sources: [
      { url: 'https://...', type: 'academic', label: '出典説明' },
      { url: 'https://...', type: 'reference', label: '出典説明' },
      { url: 'https://...', type: 'academic', label: '出典説明' },
    ],
  },
```

### 旧形式（Batch 1〜235 付近）

```ts
    statement:
      '前半チャンク。' +
      '後半チャンク。',
    keyFigures: '提唱者（English, 生–没）／初出（年・誌・巻号）',
```

**新規追加は現行形式（単一文字列 statement、ローマ字フルネーム keyFigures）を使用。**

### ID prefix 規約

| 分野 | prefix | discipline 値 |
|------|--------|---------------|
| 経済学 | `econ-` | `economics` |
| 経営学 | `mgmt-` | `management` |
| 人間科学 | `human-` | `human-science` |
| ビジネス法務 | `bizlaw-` | `business-law` |
| 情報社会学 | `infosoc-` | `information-sociology` |

### keyFigures 形式

```
Romanized Full Name ／ Romanized Full Name ／ Romanized Full Name
```
- 区切り: **全幅スペース + `／` + 全幅スペース**（` ／ `）
- 2〜3 名
- 例: `Knut Wicksell ／ Dennis Robertson ／ Bertil Ohlin`

### source.type

| type | 用途例 |
|------|--------|
| `academic` | 査読論文、学術誌、大学リポジトリ |
| `reference` | Wikipedia、百科事典、ハンドブック、nobelprize.org |
| `government` | 法律、規制、公的統計（UCC§、e-Gov 等） |
| `media` | TED Talk、報道機関、ポッドキャスト |

## 6. 重複回避（最重要）

2,267 概念が蓄積済みのため、デデュプは最重要ステップ。

```bash
# (a) ID 完全一致
grep -q "^$id$" /tmp/all_ids.txt

# (b) title キーワード検索
grep -c "キーワード" src/renderer/data/academicKnowledge.ts

# (c) 意味的重複の確認
# 同一現象を別名で追加してしまう例:
#   「過剰正当化効果」≒ 既存「アンダーマイニング効果（過正当化効果）」
#   「ピーク・エンドの法則」は中黒有無で grep 漏れ
```

**ID 衝突は title grep では見抜けない。必ず ID を grep する。**

## 7. 既知の罠（リサーチエージェント由来）

| 罠 | 実例 | 対処 |
|---|------|------|
| 架空の著者名 | "Matsumoto/Norton" (正: Shampanier, Mazar & Ariely) | 自分の知識で著者名を再確認 |
| 出版社の取り違え | Postman『Technopoly』= NYU Press (正: Knopf) | 出版社を確信できない場合は Britannica 等に置換 |
| 条文番号の誤り | グリーンメール課税 = IRC §1059 (正: §5881) | 一次法令で確認 |
| HTMLエスケープ | `&amp;` が URL/label に混入 | 手動で `&` に修正 |
| ファイル直接編集 | エージェントが academicKnowledge.ts を無断修正 | プロンプトで「JSON 返却のみ」と明示 |
| 全幅スペース消失 | keyFigures の `／` 周囲 | コピー時に全幅スペース確認 |

## 8. 終了条件

**ユーザーが明示的に停止を指示するまでループを継続する。**

中断指示が来た場合:
- 現バッチの途中成果を安全な状態（コミット済 or git checkout で破棄）にする
- SESSION_HANDOFF.md に進捗を記録してから停止

## 9. ドキュメント体系

| ファイル | 役割 | 更新タイミング |
|---------|------|---------------|
| `docs/ACADEMIC_KNOWLEDGE_LOOP.md` | 本書（運用仕様） | 手順変更時 |
| `docs/BATCH_APPEND_SPECIFICATION.md` | 機械可読 AI エージェント向け詳細仕様 | 手順変更時 |
| `docs/ACADEMIC_KNOWLEDGE.md` | 概念の要約表（各バッチ 6 行追記） | 毎バッチ |
| `docs/SESSION_HANDOFF.md` | セッション引継ぎ（進行中タスク状態） | 毎セッション終了時 |
| `docs/KNOWLEDGE_VAULT.md` | Obsidian Vault の仕組み | Vault 仕様変更時 |
| `src/renderer/data/academicKnowledge.ts` | データ本体（SSOT） | 毎バッチ |
| `knowledge-vault/` | Obsidian Vault（自動生成） | `npm run vault:build` |
