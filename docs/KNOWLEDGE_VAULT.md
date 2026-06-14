# 知識ヴォルト & AIオーケストレーション連携（KNOWLEDGE_VAULT）

リポジトリ内の**確証済み（出典つき）知識データすべて**を、**Obsidian で開ける
マークダウン・ヴォルト**（`knowledge-vault/`）として残し、さらにそれを
**AIオーケストレーション組織（`orchestration/`）のコンテキスト**として各役員ロールへ
注入する「仕組み」。本体データを単一の真実源とし、ヴォルトはそこから決定論的に生成する
（生成物をコミットし、CI が同期と重複を強制）。

## 取り込む知識コレクション（単一の真実源）

| コレクション | 真実源 | 区分 | 件数(目安) |
| --- | --- | --- | --- |
| 学術概念 | `src/renderer/data/academicKnowledge.ts` `VERIFIED_CONCEPTS` | 経済学/経営学/人間科学/ビジネス法務/情報社会学 | 491 |
| 法務・税務・労務 | `src/renderer/data/complianceKnowledge.ts` `VERIFIED_COMPLIANCE` | 税務/労務/法務 | 402 |
| 補助金・助成金 | `src/renderer/data/subsidyKnowledge.ts` `VERIFIED_SUBSIDIES` | 雇用/事業/福祉/税制優遇 | 140 |
| 相談窓口 | `src/renderer/data/counselorKnowledge.ts` `VERIFIED_SUPPORT_RESOURCES` | 相談窓口 | 3 |
| 経済史 | `src/renderer/data/economicHistoryKnowledge.ts` `ECONOMIC_HISTORY` | 年代別（1940–2025） | 86 |

```
src/renderer/data/*Knowledge.ts                ← 単一の真実源（確証済み知識 5コレクション）
        │
        ├─ orchestration/knowledge-context.cjs ← 共有ローダ（TS transpile + コレクション別アダプタ）
        │        ├─ scripts/build-knowledge-vault.cjs → knowledge-vault/ （Obsidian）
        │        ├─ scripts/orchestrate-context.cjs   → 役員ロールへの知識ブリーフ（CLI）
        │        └─ scripts/orchestrate.cjs (dispatch) → ディスパッチ計画へ知識注入
        │
        └─ orchestration/knowledge-map.json    ← コレクション/区分 ⇄ 役員ロールの写像
```

## 1. Obsidian 知識ヴォルト（`knowledge-vault/`）

`npm run vault:build` で生成（約 1,130 ファイル）。Obsidian で `knowledge-vault/` を Vault として開ける。

| パス | 内容 |
| --- | --- |
| `Home.md` | ヴォルト入口。コレクション索引・方法論・連携 |
| `MOC/<コレクション>.md` | コレクション別 Map of Content（区分→項目一覧、`[[wikilink]]`） |
| `notes/<collection>/<category>/<id>.md` | 1エントリ＝1ノート（frontmatter＋概要＋メタ＋出典＋関連） |
| `methodology/*.md` | 蓄積した運用知（確証ディシプリン・並列ループ・出典衛生） |
| `AI_ORCHESTRATION_CONTEXT.md` | 役員ロールごとの知識ブリーフ索引 |

各ノートは YAML frontmatter（`collection`/`id`/`category`/`title`/`as_of`/`source_count`/
`authoritative`/`tags`/`aliases`）を持ち、`[[コレクション]]`/`[[Home]]`/
`[[AI_ORCHESTRATION_CONTEXT]]` で相互リンクされる。Obsidian のグラフ・タグ・バックリンクで探索できる。

> ノートは自動生成物。**直接編集しない**（編集は本体データに行い再生成）。

## 2. AIオーケストレーション連携

`orchestration/knowledge-map.json`（v2）が各役員ロールへ、全コレクション横断で関連する区分を対応づける。

| 役員 | ドメイン | 参照する知識（コレクション:区分） |
| --- | --- | --- |
| COO | オーケストレーター | 全コレクション（横断） |
| CSO | 経営戦略・分析・成長・予測 | 学術(経営学・経済学)/補助金(事業)/経済史 |
| CFO | 財務・税務・資金調達 | 学術(法務・経済学)/コンプラ(税務・法務)/補助金(税制優遇) |
| CHRO | 人事・給与・労務 | 学術(人間科学・法務)/コンプラ(労務)/補助金(雇用・福祉)/相談窓口 |
| CIO | 投資・資産運用・為替 | 学術(経済学・情報社会学)/経済史 |
| CQO | 品質保証・セキュリティ | 学術(情報社会学・法務)/コンプラ(法務) |

- **実行時取得**: `npm run orchestrate:context -- --role <execId> [--limit N] [--json]`
- **ディスパッチ注入**: `npm run orchestrate:dispatch` は各チームを指揮系統へ解決する際、
  その担当役員の知識ブリーフ（`◇ 知識ブリーフ: …`）を計画へ自動で添える。

## 3. 同期と整合の保証（CI ゲート）

生成物 `knowledge-vault/` はリポジトリにコミットし、**CI が同期と重複を弾く**。

- `npm run vault:check`（= `verify:all` / CI に組込み）が本体データから再生成して `knowledge-vault/` と
  突合し、差分があれば失敗する。`*Knowledge.ts` を更新したら `npm run vault:build` で再生成すること。
- 生成は完全に決定論的（wall-clock を含めない）。
- `vault:build` / `vault:check` は **ノート id の全域重複を検出すると停止**する。重複は
  `node scripts/dedupe-knowledge.cjs --apply` で統合する。

## 4. データ品質: 重複 id の統合

本機構の導入時に、**同一 id・別タイトルで二重登録**された項目（タイトル一致の dedup を
すり抜けたもの）が複数のデータセットに混入していることが判明し、`scripts/dedupe-knowledge.cjs`
で 1 件へ統合した（学術 522→491、法務税務労務 406→402、補助金 142→140）。以降は `vault:check` の
重複 id ガードが再発を防ぐ。

## コマンド早見

```bash
npm run vault:build                              # knowledge-vault/ を再生成
npm run vault:check                              # 本体データとの同期を検証（CI）
npm run orchestrate:context                      # 役員→コレクション/区分の対応一覧
npm run orchestrate:context -- --role chro       # CHRO への知識ブリーフ（全コレクション横断）
npm run orchestrate:context -- --collection compliance --category labor --limit 20
npm run orchestrate -- context --role cfo        # orchestrate サブコマンド版
npm run orchestrate:dispatch                     # ディスパッチ計画（知識ブリーフ注入）
node scripts/dedupe-knowledge.cjs                # 重複 id のドライラン（--apply で統合）
```
