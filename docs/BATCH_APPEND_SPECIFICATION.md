# Batch Append Pipeline — 共通仕様書

**最終更新**: 2026-06-24  
**対象**: AIエージェント向け自動化パイプライン仕様  
**バージョン**: 1.0  

---

## 1. パイプラインの概要

### 1.1 目的
学術知識データベース（academicKnowledge.ts）に、検証済みの学術概念を定期的にバッチで追加する自動化パイプライン。

### 1.2 実行単位
- **1バッチ = 6概念**
- 5分野（経済学、経営学、人間科学、ビジネス法務、情報社会学）を均等配置
- 1バッチごとにコミット・プッシュ・品質ゲート実行

### 1.3 現在の進捗
- **完了**: Batch 376（2,261概念、PR #マージ済み）
- **進行中**: Batch 377（4/6研究エージェント完了、2/6待機中）
  - ✅ Agent 2: mgmt-bounded-rationality-simon — JSON完了
  - ✅ Agent 4: bizlaw-good-faith-performance — JSON完了
  - ✅ Agent 5: infosoc-second-order-cybernetics — JSON完了
  - ✅ Agent 6: econ-signaling-screening-spence — JSON完了
  - ⏳ Agent 1: econ-adverse-selection-akerlof — 研究中
  - ⏳ Agent 3: human-narrative-identity-mcadams — 研究中

---

## 2. データ構造

### 2.1 概念エントリの標準形式

```typescript
{
  id: 'discipline-kebab-case-id',
  discipline: 'economics' | 'management' | 'human-science' | 'business-law' | 'information-sociology',
  title: '[日本語タイトル]',
  statement: '[80〜150字の日本語説明、学者名をローマ字で混在]',
  keyFigures: '[ローマ字姓名] ／ [ローマ字姓名] ／ [ローマ字姓名]',
  asOf: '2026-06',
  sources: [
    {
      url: 'https://...',
      type: 'academic' | 'reference' | 'government' | 'media',
      label: '[出典表示]'
    },
    // 3〜5件の出典
  ]
}
```

### 2.2 命名規則

#### ID形式（kebab-case）
```
{discipline-prefix}-{concept-slug}
```

**discipline-prefix**:
- `econ-` = 経済学 (economics)
- `mgmt-` = 経営学 (management)
- `human-` = 人間科学 (human-science)
- `bizlaw-` = ビジネス法務 (business-law)
- `infosoc-` = 情報社会学 (information-sociology)

**concept-slug**: 概念の短縮表現（ハイフン区切り、小文字）
- 例: `econ-adverse-selection-akerlof`
- 例: `mgmt-bounded-rationality-simon`

#### タイトル形式（日本語）
- 本体概念名（カッコ内に別名・補説）
- 例: `限定合理性`
- 例: `契約履行における誠実・公正取引義務（Good Faith and Fair Dealing）`

#### statement形式（日本語、80〜150字）
- 学者の業績を簡潔に説明
- 学者名は**ローマ字**（フルネーム推奨）で表記
- 提唱年や理論系統を記載
- 例: 「Pariserが2011年に提唱した概念。パーソナライゼーションアルゴリズムが...」

#### keyFigures形式（ローマ字、3名または2-3名）
```
First Name ／ Second Name ／ Third Name
```
- **区切り**: 全幅スペース＋「／」＋全幅スペース
- フルネーム（名字＋名前）
- 例: `Dan P. McAdams ／ Kate C. McLean ／ Jonathan M. Adler`
- 3名が標準；2名で十分な場合もある

### 2.3 出典の要件

#### 最低要件
- **≥2出典**（うち1件以上は権威ある出典）
- **権威ある出典の定義**:
  - 査読論文（学術誌）
  - 大学・学会の公式ページ
  - 百科事典・レファレンス（Wikipedia等）
  - 政府・公的機関のページ
  - 原著論文・一次資料

#### source.type の分類
| type | 用途例 |
|------|--------|
| `academic` | 査読論文、学術誌、学位論文 |
| `reference` | Wikipedia、百科事典、ハンドブック |
| `government` | 法律、規制、公的統計（UCC§、憲法等） |
| `media` | TED Talk、報道機関、ポッドキャスト |

#### URL検証
- **実在確認**: Google検索結果、学術データベース等で確認済み
- **404回避**: 既知の死リンク除外
- **403許容**: ペイウォール（paywall）は生きたURLとして許容
  - JSTOR、ScienceDirect、学術出版社 → 実在
  - Cloudflareブロック → 実在（bot-protection）

---

## 3. ファイル修正フロー

### 3.1 対象ファイル

#### 1. `src/renderer/data/academicKnowledge.ts`
**単一の真実源（SSOT）**

**操作**:
1. `VERIFIED_CONCEPTS` 配列の末尾を探す（`];` の直前）
2. 新規6エントリを挿入（コンマで前行と連結）
3. 既存エントリの `],` → `,` に修正して新エントリを追加
4. 最後の行を `];` + `// Stryker restore all` で閉じる

**パターン**（Batch 376例）:
```typescript
  },  // ← 前のエントリ末尾
  {   // ← 新規エントリ開始
    id: 'econ-loanable-funds-theory',
    ...
  },  // ← 新規エントリ末尾
  // 6エントリ全て挿入後
];
// Stryker restore all
```

#### 2. `docs/ACADEMIC_KNOWLEDGE.md`
**概念の要約表**

**操作**:
1. ファイル末尾から2行目の「出典 URL は...」を探す
2. その直前に6行の表データを挿入
3. 形式: `| 分野 | 概念 | 提唱者・初出 |`

**例行**:
```markdown
| 経済学 | 貸付可能資金理論（ネオクラシカル利子率理論） | Knut Wicksell ／ Dennis Robertson ／ Bertil Ohlin |
```

#### 3. `knowledge-vault/` （自動生成）
**コマンド**: `npm run vault:build`
- 各概念ごとに `knowledge-vault/notes/academic/{discipline}/{id}.md` を生成
- 相互リンク・メタデータ自動付与
- `npm run vault:check` で同期検証

---

## 4. パイプラインの実行手順

### 4.1 事前準備
```bash
# ブランチ確認
git status                          # clean であること確認
git log --oneline -1               # HEAD確認: Batch 376最新コミット

# デデュプ準備（既存ID一覧作成）
grep -o "id: '[^']*'" src/renderer/data/academicKnowledge.ts \
  | sed "s/id: '//" | sed "s/'$//" | sort > /tmp/all_ids.txt
wc -l /tmp/all_ids.txt             # 現在の概念数表示
```

### 4.2 ステップ1: デデュプ検証と候補生成

**デデュプ確認**:
```bash
# 候補IDが既存IDと衝突しないか確認
for id in econ-id-1 mgmt-id-2 ...; do
  grep -q "^$id$" /tmp/all_ids.txt && echo "COLLISION: $id" || echo "UNIQUE: $id"
done
```

**衝突時対応**:
- 別のID候補を生成（概念の核となるキーワード変更）
- 例: `adverse-selection-akerlof` → `adverse-selection-market-unraveling`

### 4.3 ステップ2: 並列研究エージェント実行

**6エージェント起動（全分野均等）**:
```
Agent 1: econ-{concept-1}
Agent 2: mgmt-{concept-2}
Agent 3: human-{concept-3}
Agent 4: bizlaw-{concept-4}
Agent 5: infosoc-{concept-5}
Agent 6: econ-{concept-6}  [2番目のeconomics]
```

**各エージェント指示**:
```
Research the academic concept "{CONCEPT_NAME}". 
Verify with ≥2 authoritative sources (academic journals, books, institutions). 
Return JSON: {
  id: "{id}",
  discipline: "{discipline}",
  title: "[Japanese title]",
  statement: "[80–150 chars, Japanese, with scholar names in Romanized form: Name]",
  keyFigures: "[3 romanized names separated by ／]",
  asOf: "2026-06",
  sources: [{url: "...", type: "academic|reference|government|media", label: "..."}]
}
Verify sources are real URLs that return HTTP 200 or are known-good references.
If any source is uncertain, omit it rather than fabricate.
```

**エージェントが**:
- **してはいけないこと**: ファイルを直接修正
- **すること**: JSON出力をテキスト形式で返す
- **制約**: 各ソースURL検証（存在確認、404除外、403許容）

### 4.4 ステップ3: 結果の収集と合成

**6つのJSON結果を収集**:
1. エージェント完了通知を待つ
2. 各JSONを変数またはファイルに保存
3. **形式検証**: 
   - id一意性
   - statement字数（80〜150字）
   - keyFigures形式（3名、／区切り）
   - sources個数（3〜5件）

**形式修正が必要な場合**:
- `&amp;` → `&` （HTMLエスケープ修正）
- URL末尾の `/` 確認
- 全幅スペース確認（keyFigures）

### 4.5 ステップ4: ファイル追記

#### 4.5.1 academicKnowledge.ts への追記

1. ファイル末尾を確認
```bash
tail -3 src/renderer/data/academicKnowledge.ts
# ];
# // Stryker restore all
```

2. 最後の `};` の直前に6エントリを挿入
```typescript
  },  // ← 前のエントリ
  {
    id: 'econ-adverse-selection-akerlof',
    discipline: 'economics',
    title: '...',
    statement: '...',
    keyFigures: '...',
    asOf: '2026-06',
    sources: [...]
  },
  // ... 残り5エントリ
];
// Stryker restore all
```

#### 4.5.2 docs/ACADEMIC_KNOWLEDGE.md への追記

```markdown
| 経済学 | 逆選択理論（レモンの市場） | George A. Akerlof ／ A. Michael Spence ／ Joseph E. Stiglitz |
| 経営学 | 限定合理性 | Herbert A. Simon ／ James G. March ／ Daniel Kahneman |
...
```

### 4.6 ステップ5: 品質ゲート実行

**順序重要**（各ステップ実行順序を守る）:

```bash
# 1. Vault生成×2（ドリフト安定性確認）
npm run vault:build 2>&1 | tail -3
npm run vault:build 2>&1 | tail -3
# 両方とも同じファイル数を出力したら OK（例: 3039 ファイル）

# 2. 型チェック
npm run typecheck 2>&1 | tail -10
# エラーなし

# 3. 総合検証
npm run verify:all 2>&1 | tail -50
# verify:arch / lint:forbidden / lint:imports / lint:docs 
# / lint:test-coverage / lint:shell / verify:orchestration 
# / vault:check / chain:verify 全て ✅

# 4. テスト実行
npm test 2>&1 | tail -80
# 全テスト合格（5529 tests）

# 5. ウェブビルド
npm run build:web 2>&1 | tail -20
# dist/standalone.html 生成確認（サイズ目安: 5800〜6000 KB）
```

**ゲート失敗時**:
- エラーメッセージを読む
- 原因ファイルを修正（通常: JSON形式、型ミス、重複ID）
- ゲートを再実行
- 3回以上失敗したら調査報告

### 4.7 ステップ6: コミット・プッシュ

```bash
# ステージング（vault自動変更も含む）
git add -A

# コミット（メッセージテンプレート）
git commit -m "$(cat <<'EOF'
feat(knowledge): Batch 377 — 6 academic concepts

Append 6 verified academic concepts to VERIFIED_CONCEPTS array and documentation:
- Concept 1 (Scholar1)
- Concept 2 (Scholar2)
- Concept 3 (Scholar3)
- Concept 4 (Scholar4)
- Concept 5 (Scholar5)
- Concept 6 (Scholar6)

All quality gates passed: vault:build (3039 files), typecheck, verify:all, test (5529), build:web.
Total concepts: 2,267.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LZCWycmbPqJLPsnykA2WQ1
EOF
)"

# プッシュ
git push -u origin claude/eager-brown-7cev3c
```

**プッシュ失敗時**:
- ネットワークエラー → 指数バックオフ再試行（2s, 4s, 8s, 16s）
- マージコンフリクト → `git fetch origin main && git merge origin/main` → 解決 → コミット → プッシュ

---

## 5. エラー処理と検証

### 5.1 デデュプエラー

**症状**: 6候補のうち1〜3個が既存IDと衝突

**対応**:
1. 衝突したIDを特定
2. 代替案を複数生成（多キーワード、異なる角度）
3. 再度デデュプ確認
4. **ループ上限**: 2回まで；3回目は別の概念に切り替え

**Batch 376事例**: 
- 初回: 4個衝突
- 2回目生成: 1個衝突
- 3回目生成: 全6個unique確認 → エージェント起動

### 5.2 研究エージェント失敗

**症状**: エージェント実行後、JSON未返却 / 不完全な出典

**対応**:
1. エージェント実行ログを確認
2. 概念が本当に学術的か再評価（公開記事×、査読論文◎）
3. 出典を追加検索（3件以上確保）
4. **タイムアウト**: 15分以上応答なし → キャンセル → 別エージェント起動

### 5.3 品質ゲート失敗

#### vault:build エラー
```
Error: duplicate id 'econ-xyz'
```
→ academicKnowledge.ts内の重複IDを `grep id:` で確認、削除

#### typecheck エラー
```
TS1234: Property 'xxx' is missing
```
→ statement字数超過 / keyFigures形式誤り / sources未配列 → 修正

#### verify:all エラー
→ 全て typecheck または vault 関連；academicKnowledge.ts 修正で解決

#### test 失敗
```
Expected 5529, got 5520
```
→ テスト追加なし；既存テスト影響確認（通常は vault 自動更新による）

#### build:web 失敗
→ TypeScript型エラー；typecheck で既に検出のはず

### 5.4 ファイル修正の検証

**academicKnowledge.ts**:
```bash
# 末尾確認（必ず正しい順序）
tail -5 src/renderer/data/academicKnowledge.ts
# };
# },
# ],
# // Stryker restore all

# JSON妥当性確認
node -e "console.log(require('./src/renderer/data/academicKnowledge.ts').VERIFIED_CONCEPTS.length)"
# 2267 （前Batch 376 + 新6）

# ID重複確認
grep -o "'id': '[^']*'" src/renderer/data/academicKnowledge.ts | sort | uniq -d
# （出力なし = 重複なし）
```

---

## 6. パイプライン完了と次Batch へ

### 6.1 Batch 377完了フロー

```
✅ Batch 377 コミット・プッシュ
    ↓
🔄 Batch 378 開始
    - デデュプ一覧刷新
    - 6新概念候補生成
    - 衝突確認
    - 6並列エージェント起動
    - ...（同じフロー）
```

### 6.2 進捗ファイル更新

**docs/SESSION_HANDOFF.md** を更新:
```markdown
## 進行中タスク

- **Batch 378**: 候補生成中（4/6エージェント起動予定）
  - Agent 1: econ-X
  - Agent 2: mgmt-Y
  - ...
```

---

## 7. 既知の罠と回避策

| 罠 | 症状 | 対応 |
|---|------|------|
| **エージェント自動修正** | ファイル直接編集（セキュリティ警告） | JSON返却のみ指示 → 手動合成 |
| **HTMLエスケープ** | URL内 `&amp;` / label内 `&` | 修正置換（sed等） |
| **全幅スペース** | keyFigures の `／` 周囲 | 全幅スペース確認（Copy時崩れやすい） |
| **statement超過** | 150字超 | 削減リスト: 提唱者複数人→3人に、年号→初出のみ |
| **出典消失** | ペイウォール変更 → 404化 | 3年ごと検証；時点で「存在確認済み」と記録 |
| **vault ドリフト** | 2回目ビルドでファイル数異変 | 修正 & 再ビルド；通常は安定 |

---

## 8. スタンディング・インストラクション

**ユーザー指示**: 「作業を継続して」

**実装意味**:
1. 現Batch完了後、自動で次Batch開始
2. デデュプ → 候補 → エージェント → ファイル修正 → ゲート → コミット → プッシュ
3. ループ継続（Batch上限なし）
4. ユーザーからの明示的停止指示まで続行
5. 各Batch間で `SESSION_HANDOFF.md` 更新

**中断条件**:
- エージェント3回連続失敗
- ゲート4回以上失敗
- ファイル破損（git reset で復旧）
- ユーザー明示的停止命令

---

## 9. 参考コマンド集

```bash
# デデュプ一覧
grep -o "id: '[^']*'" src/renderer/data/academicKnowledge.ts | sort > /tmp/ids.txt

# ファイルサイズ
wc -l src/renderer/data/academicKnowledge.ts
du -h dist/standalone.html

# 最新コミット
git log --oneline -1

# ブランチ確認
git status

# vault 再生成
npm run vault:build

# 全ゲート実行
npm run verify:all && npm test && npm run build:web

# vault 同期確認
npm run vault:check
```

---

## 付録A: Batch 377 現況

**ステータス**: 4/6完了、2/6待機中

| # | ID | 分野 | 状態 | JSON |
|---|-----|------|------|------|
| 1 | econ-adverse-selection-akerlof | 経済学 | 研究中 | ⏳ |
| 2 | mgmt-bounded-rationality-simon | 経営学 | ✅ | ✅ |
| 3 | human-narrative-identity-mcadams | 人間科学 | 研究中 | ⏳ |
| 4 | bizlaw-good-faith-performance | ビジネス法務 | ✅ | ✅ |
| 5 | infosoc-second-order-cybernetics | 情報社会学 | ✅ | ✅ |
| 6 | econ-signaling-screening-spence | 経済学 | ✅ | ✅ |

**次ステップ**: Agent 1, 3 の研究完了待機 → 全6 JSON収集 → ファイル修正 → ゲート → コミット・プッシュ

---

**本仕様書は機械可読・AIエージェント実行可能な形式で作成されています。**  
**更新履歴**: v1.0 (2026-06-24) 初版
