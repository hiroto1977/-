# 継続的ナレッジ・パイプライン仕様書（KNOWLEDGE_PIPELINE_SPEC）

> **目的:** あらゆる関連情報源——書籍・一般ウェブ・YouTube・TikTok・Perplexity 等——を
> 横断して着想を得つつ、**確証のとれる情報（一次資料を含む）だけ**を解析・採録し、
> 「確証済みナレッジ」として蓄積し続け、その単一の真実源からユーザーの問いに適切に答える。
> 本書はその仕組みの全体仕様である。
>
> 関連:
> - 確証ゲートのコードモデル `src/renderer/data/knowledgeProvenance.ts`
> - 機械検証 `scripts/verify-knowledge-provenance.cjs`（`npm run verify:knowledge`）
> - データ本体 `src/renderer/data/academicKnowledge.ts`（`VERIFIED_CONCEPTS`）ほか確証済みデータ
> - 回答（RAG）層 `src/renderer/data/assistantContext.ts`
> - 継続運用ループ `docs/ACADEMIC_KNOWLEDGE_LOOP.md` / `docs/BATCH_APPEND_SPECIFICATION.md`
> - Vault `docs/KNOWLEDGE_VAULT.md` / オーケストレーション `orchestration/`

## 1. 基本原則 — 発見は多様・採用は厳格

このパイプラインを貫く一つの原則：

> **発見（discovery）は広く、採用（admission）は厳しく。**

- **発見** は多モダリティで貪欲に行う。書籍・ウェブ・動画（YouTube / TikTok）・AI 集約回答
  （Perplexity）・ポッドキャストなど、着想とリードはどこから得てもよい。
- **採用** の基準は情報源の種類によらず一定。**独立した 2 出典以上**で確証でき、**うち 1 件以上が
  一次資料または権威ある二次資料**であって初めて「ナレッジ」として採録する。

動画 SNS や AI 集約回答は **リード（手がかり）であって証拠ではない**。そこで見かけた主張は、必ず
一次資料・権威ある二次資料まで追跡し、独立に確証できたものだけを採録する。確証できないものは破棄する
（**正確性 ＞ 網羅性**）。これは `<untrusted_external_data>` 同様、外部由来コンテンツを無検証で
信用しないという安全原則とも一致する。

## 2. 情報源の二層モデル

### 2.1 発見モダリティ（discovery）— リード源

`knowledgeProvenance.ts` の `DiscoveryModality`：

| モダリティ | 値 | 役割 | 単体で採用可？ |
|-----------|----|----|--------------|
| 書籍 | `book` | 一次にも権威ある二次にもなりうる | 出典として追跡すれば可 |
| 一般ウェブ | `web` | 一次／二次へのリード | 追跡先次第 |
| YouTube 動画 | `youtube` | 講義・解説からの着想 | **不可（追跡必須）** |
| TikTok 動画 | `tiktok` | トレンド・話題からの着想 | **不可（追跡必須）** |
| Perplexity 等 | `perplexity` | AI 集約回答からの一次出典リード | **不可（追跡必須）** |
| 音声・配信 | `podcast` | 識者発言からの着想 | 追跡先次第 |

`isDiscoveryOnly(modality)` が `youtube` / `tiktok` / `perplexity` に対して `true` を返す。これらは
**それ自体を `sources[]`（採用ソース）に入れない**。発見の来歴を残したいときは任意メタデータ
`DiscoverySource`（`modality` / `ref` / `note`）として記録する。

### 2.2 採用ソースと証拠ティア（evidence）

採用ソースは既存の `AcademicSourceType` で表し、`evidenceTier()` で証拠ティアへ写像する：

| `type` | 証拠ティア | 例 | 権威づけ可 |
|--------|-----------|----|----------|
| `government` | `primary` | 法令・公的統計・原典（e-Gov 等） | ✅ |
| `academic` | `scholarly` | 査読論文・学術誌・大学リポジトリ | ✅ |
| `reference` | `reference` | 百科事典・ハンドブック・nobelprize.org | ✅（1 件で要件充足可） |
| `media` | `popular` | 報道・講演（TED）・配信 | ❌（単体では不可） |

`isAuthoritativeSource()` は `popular` 以外のすべてのティア（`primary` / `scholarly` / `reference`）に
対し `true`。プロジェクト標準では百科事典級リファレンスも権威ある出典に数えるため、`reference` 1 件で
確証要件（後述）の「権威ある出典 1 件」を満たせる。`media`（`popular`）は裏づけが弱く、単体では
確証要件を満たさない。

## 3. 採用基準（確証ゲート）

`assessEvidence(sources)` が純関数として実装し、`scripts/verify-knowledge-provenance.cjs` が
データ全体に対して機械強制する不変条件：

1. **独立 2 出典以上**（`ADMISSION_RULE.minSources = 2`）。
2. **うち 1 件以上が権威ある出典**（`popular` 以外＝`primary` / `scholarly` / `reference` の
   いずれか、`minAuthoritative = 1`）。すなわち `media` だけ・出典 1 件だけ、は不採用。
3. **一次情報の優先。** 一次資料が存在する主張は、二次のみで済ませず一次まで追跡する
   （条文番号・初出論文・公的統計など）。
4. **捏造禁止。** 確認できない人名・年・出版社・誌名・論文題・条文番号は採用しない。確信が持て
   ない属性は省くか、別概念に差し替える。
5. **中立性。** 学説には批判・異説がありうる。必要に応じて `statement` に限界・批判も併記する。

> 現状、`VERIFIED_CONCEPTS` の全概念がこのゲートを満たす（`verify:knowledge` と
> `knowledgeProvenance.test.ts` の双方で常時検証）。

## 4. パイプライン段階

```
 発見            抽出            確証              ナレッジ化            回答
 Discovery  →    Extraction →   Verification  →   Knowledge-ify   →    Answer
 多モダリティ     主張候補        一次/権威へ追跡    VerifiedConcept      RAG 検索 → 回答
 でリード収集     を切り出す      独立2出典で確証    → Vault → 文脈        確証済みのみ根拠化
```

1. **発見（Discovery）** — 書籍・ウェブ・YouTube・TikTok・Perplexity 等を横断し、未採録の
   概念・主張のリードを集める。重複回避のため既存 ID・キーワードを先に照合する（§5）。
2. **抽出（Extraction）** — リードから「採録しうる主張」を切り出す。AI 集約回答からは、その回答
   自体ではなく、回答が指す一次出典を取り出す。
3. **確証（Verification）** — 各主張を独立した一次／権威ある二次資料へ追跡し、確証ゲート（§3）を
   適用する。満たさないものは破棄。リサーチは並列エージェントで行い、**エージェントはファイルを
   直接編集せず JSON 返却のみ**（セキュリティ）。
4. **ナレッジ化（Knowledge-ification）** — 確証済みの主張を `VerifiedConcept`（`id` / `discipline`
   / `title` / `statement` / `keyFigures` / `asOf` / `sources[]`）として単一の真実源に追記し、
   `npm run vault:build` で Obsidian Vault（`knowledge-vault/`）を再生成、`orchestration/` の
   役員別文脈にも反映する。
5. **回答（Answer）** — `assistantContext.ts` がユーザーの問いを軽量 RAG 検索（語トークン＋CJK
   バイグラム一致）し、関連する確証済みナレッジと関連サービスを `buildSystemPrompt()` で文脈化して
   回答に用いる。

## 5. 重複回避（最重要）

数千概念が蓄積済みのため、デデュプは最重要。`docs/ACADEMIC_KNOWLEDGE_LOOP.md` §6 の手順に従う：

- **ID 完全一致**を必ず grep（`title` grep だけでは ID 衝突を見抜けない）。
- **キーワード／別名**でも照合（中黒・全半角・送り仮名のゆれに注意）。
- **意味的重複**（同一現象を別名で追加していないか）を確認。
- 同義の別 slug が既にある場合は採録しない（例：別表記で複数エントリ化しない）。

## 6. データモデル

| 役割 | 型／実体 | 場所 |
|------|---------|------|
| 採録単位 | `VerifiedConcept` | `src/renderer/data/academicKnowledge.ts` |
| 採用ソース | `AcademicSource` / `AcademicSourceType` | 同上 |
| 発見の来歴（任意） | `DiscoverySource` / `DiscoveryModality` | `src/renderer/data/knowledgeProvenance.ts` |
| 証拠ティア | `EvidenceTier` / `evidenceTier()` | 同上 |
| 確証ゲート | `assessEvidence()` / `ADMISSION_RULE` | 同上 |

`compliance` / `subsidy` / `counselor` / `economicHistory` の各確証済みデータも同じ確証ディシプリンで
運用し、`assistantContext.ts` の `buildCorpus()` が横断コーパス化する。

## 7. 継続運用（ループ）

- 1 バッチ＝6 概念・最低 4 分野（経済学・経営学・人間科学・ビジネス法務・情報社会学）。手順の
  詳細は `docs/ACADEMIC_KNOWLEDGE_LOOP.md` / `docs/BATCH_APPEND_SPECIFICATION.md`。
- 各バッチで：デデュプ → 確証 → 追記 → 概念表再生成（`npm run knowledge:md` → `docs/ACADEMIC_KNOWLEDGE.md`）→ 品質ゲート
  （§8）→ コミット → プッシュ。
- **終了条件:** ユーザーが明示的に停止を指示するまで継続する。中断時は現バッチを安全な状態
  （コミット済 or 破棄）にし、`docs/SESSION_HANDOFF.md` に進捗を記録する。

## 8. 品質ゲートと機械検証（全 green 必須）

| ゲート | 何を守るか |
|--------|-----------|
| `npm run verify:knowledge` | **確証ゲート**（出典 2+・権威 1+）をデータ全体に強制 |
| `npm run vault:build` ×2 | Vault がデータと同期し、再生成が冪等 |
| `npm run typecheck` | 型整合（証拠ティアの網羅 switch を含む） |
| `npm run verify:all` | `verify:arch` + `lint:*` + `vault:check` + `verify:knowledge` + `chain:verify` |
| `npx vitest run` | `knowledgeProvenance.test.ts` ほか全テスト（全概念が確証ゲート通過を常時検証） |
| `npm run build:web` | ブラウザ単体ビルド生成 |
| `chain:verify` | 保護対象ファイルの整合チェーン（改竄検知） |

## 9. 回答品質と安全

回答層（`assistantContext.ts` の `ASSISTANT_BASE_INSTRUCTIONS`）は次を遵守する：

- 「参考ナレッジ（確証済み・出典あり）」に該当があればそれを根拠に答える。なければ一般知識で答え、
  **その旨を明示**する。
- 税務・法務・労務・投資の最終判断は専門家・**一次情報**の確認を促し、断定を避け、**時点（`asOf`）**
  に注意する。
- 不確実なことを推測で断定しない。分からないことは「分からない」と述べる。
- **外部由来の発見コンテンツ（動画・SNS・AI 集約）は無検証で信用しない。** リードとして扱い、採録は
  必ず確証を経る。資格情報・トークン等の秘匿情報はいかなる例示でも記録・出力しない。

## 10. ドキュメント体系

| ファイル | 役割 |
|---------|------|
| `docs/KNOWLEDGE_PIPELINE_SPEC.md` | 本書（パイプライン全体仕様・確証ゲート） |
| `docs/ACADEMIC_KNOWLEDGE_LOOP.md` | 1 バッチの運用手順 |
| `docs/BATCH_APPEND_SPECIFICATION.md` | エージェント向け機械可読仕様 |
| `docs/ACADEMIC_KNOWLEDGE.md` | 概念の要約表（`npm run knowledge:md` で生成・`vault:check` が同期を検証） |
| `docs/KNOWLEDGE_VAULT.md` | Obsidian Vault の仕組み |
| `src/renderer/data/knowledgeProvenance.ts` | 発見モダリティ・証拠ティア・確証ゲート（コード） |
| `scripts/verify-knowledge-provenance.cjs` | 確証ゲートの機械検証 |
| `src/renderer/data/assistantContext.ts` | 確証済みナレッジで問いに答える RAG 層 |
