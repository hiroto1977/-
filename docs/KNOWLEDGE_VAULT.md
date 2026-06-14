# 知識ヴォルト & AIオーケストレーション連携（KNOWLEDGE_VAULT）

これまで蓄積した検証済み学術知識（`src/renderer/data/academicKnowledge.ts` の
`VERIFIED_CONCEPTS`）を **Obsidian で開けるマークダウン・ヴォルト**（`knowledge-vault/`）として
残し、さらにそれを **AIオーケストレーション組織（`orchestration/`）のコンテキスト**として
各役員ロールへ注入する「仕組み」。本体データを単一の真実源とし、ヴォルトはそこから
決定論的に生成される（生成物をコミットし、CI が同期を強制する）。

## 全体像

```
src/renderer/data/academicKnowledge.ts  ← 単一の真実源（VERIFIED_CONCEPTS, 491概念）
        │
        ├─ orchestration/knowledge-context.cjs  ← 共有ローダ（型注釈を外して評価）
        │        ├─ scripts/build-knowledge-vault.cjs → knowledge-vault/ （Obsidian）
        │        ├─ scripts/orchestrate-context.cjs   → 役員ロールへの知識ブリーフ（CLI）
        │        └─ scripts/orchestrate.cjs (dispatch) → ディスパッチ計画へ知識注入
        │
        └─ orchestration/knowledge-map.json  ← ディシプリン ⇄ 役員ロールの写像
```

## 1. Obsidian 知識ヴォルト（`knowledge-vault/`）

`npm run vault:build` で生成。Obsidian で `knowledge-vault/` フォルダを Vault として開ける。

| パス | 内容 |
| --- | --- |
| `Home.md` | ヴォルト入口。分野別MOC・方法論・連携への索引 |
| `MOC/<分野>.md` | 分野ごとの Map of Content（概念一覧、`[[wikilink]]`） |
| `concepts/<discipline>/<id>.md` | 概念1件＝1ノート（frontmatter＋概要＋提唱者＋出典＋関連） |
| `methodology/*.md` | 蓄積した運用知（研究ディシプリン・並列ループ・出典衛生） |
| `AI_ORCHESTRATION_CONTEXT.md` | 役員ロールごとの知識ブリーフ索引 |

各概念ノートは YAML frontmatter（`id` / `discipline` / `title` / `key_figures` /
`as_of` / `source_count` / `authoritative` / `tags` / `aliases`）を持ち、本文は
`[[分野]]` / `[[Home]]` / `[[AI_ORCHESTRATION_CONTEXT]]` で相互リンクされる。
Obsidian のグラフビュー・タグ・バックリンクでそのまま探索できる。

> ノートは自動生成物。**直接編集しない**（編集は `academicKnowledge.ts` に行い再生成）。

## 2. AIオーケストレーション連携

`orchestration/knowledge-map.json` が各役員ロールへ関連ディシプリンを対応づける。

| 役員 | ドメイン | 担当ディシプリン |
| --- | --- | --- |
| COO | オーケストレーター | 全分野（横断） |
| CSO | 経営戦略・分析・成長・予測 | 経営学・経済学 |
| CFO | 財務・税務・資金調達 | ビジネス法務・経済学 |
| CHRO | 人事・給与・労務 | 人間科学・ビジネス法務 |
| CIO | 投資・資産運用・為替 | 経済学・情報社会学 |
| CQO | 品質保証・セキュリティ | 情報社会学・ビジネス法務 |

- **実行時取得**: `npm run orchestrate:context -- --role <execId> [--limit N] [--json]`
  役員ロール（または `--discipline <name>`）への検証済み概念ブリーフを出力する。
- **ディスパッチ注入**: `npm run orchestrate:dispatch` は各チームを指揮系統へ解決する際、
  その担当役員の知識ブリーフ（`◇ 知識ブリーフ: …`）を計画へ自動で添える。
  これにより、調査・設計の並列 Agent が「参照すべき確立概念」を最初から把握できる。

## 3. 同期の保証（CI ゲート）

生成物 `knowledge-vault/` はリポジトリにコミットし、**ドリフトを CI が弾く**。

- `npm run vault:check`（= `verify:all` / CI に組込み）が本体データから再生成して
  `knowledge-vault/` と突合し、差分があれば失敗する。`academicKnowledge.ts` を
  更新したら `npm run vault:build` で再生成すること。
- 生成は完全に決定論的（wall-clock を含めない）。
- `vault:build` / `vault:check` は **重複 id を検出すると停止**する。重複は
  `node scripts/dedupe-academic-knowledge.cjs --apply` で統合する。

## 4. データ品質: 重複 id の統合

本ヴォルト機構の導入時に、`VERIFIED_CONCEPTS` 内へ**同一 id・別タイトルで二重登録**
された概念（タイトル一致による重複排除をすり抜けたもの）が 28 id・31 件あることが
判明し、`scripts/dedupe-academic-knowledge.cjs` で 1 概念へ統合した（522 → 491）。
以降は `vault:check` の重複 id ガードが再発を防ぐ。

## コマンド早見

```bash
npm run vault:build                          # knowledge-vault/ を再生成
npm run vault:check                          # 本体データとの同期を検証（CI）
npm run orchestrate:context                  # 役員→ディシプリンの対応一覧
npm run orchestrate:context -- --role cso    # CSO への知識ブリーフ
npm run orchestrate:context -- --discipline economics --limit 20
npm run orchestrate -- context --role cqo    # orchestrate サブコマンド版
npm run orchestrate:dispatch                 # ディスパッチ計画（知識ブリーフ注入）
node scripts/dedupe-academic-knowledge.cjs   # 重複 id のドライラン
```
