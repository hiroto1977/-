# 知識オートパイロット — 全自動の知識更新システム

知識ベース（学術 3,524 / 法令実務 393 / 補助金 140 / 経済史 86 / 相談窓口 3 = 4,146 項目）を
**継続的・自動的に最新へ保つ**ための仕組み。哲学は「**機械化できる工程は 100% 機械が回し、
LLM の判断が必要な仕事だけを機械可読キューに落とす**」。

```
        ┌────────────────────────────────────────────────────────┐
        │  ①機械層（無人・毎週）: scripts/knowledge-autopilot.cjs │
        │   AUDIT → REGEN → VERIFY → REPORT                       │
        │   （GitHub Actions knowledge-auto.yml が毎週月曜 06:00  │
        │     JST に実行、Issue とアーティファクトに報告）        │
        └───────────────┬────────────────────────────────────────┘
                        │ orchestration/knowledge-queue.json（作業キュー）
                        ▼
        ┌────────────────────────────────────────────────────────┐
        │  ②LLM 層（Claude Code セッション / 定期セッション）:   │
        │   キューを消化 — 調査→敵対的検証→機械ゲート→出荷      │
        └───────────────┬────────────────────────────────────────┘
                        │ commit / push（全ゲート green が条件）
                        ▼
        ┌────────────────────────────────────────────────────────┐
        │  ③配布層（自動再生成）: Obsidian vault（vault:build）  │
        │   ・NotebookLM エクスポート（knowledge:export）         │
        │   ・AI 実行時コンテキスト（orchestrate:context）        │
        └────────────────────────────────────────────────────────┘
```

## ① 機械層 — `npm run knowledge:auto`

| フェーズ | 内容 |
|---|---|
| **AUDIT** | 全項目を監査して 6 種のキューを生成（下表） |
| **REGEN** | 派生成果物を再生成: Obsidian vault（7,710 ノート = 知識 4,233〈関連概念注入済み〉+ 人物 1,506 + 出典ドメイン 1,518 + 年表 242 + 学習パス 22 + 教育 deck/quiz 44 + MOC/組織）+ 知識グラフ・教育素材（`knowledge-graph/*.ndjson`）+ NotebookLM エクスポート（17 パート） |
| **VERIFY** | 確証ゲート `verify:knowledge`（出典 2+・権威 1+）・`vault:check`（byte 同期）・`verify:graph`（グラフ再計算 byte 一致＋構造＋教育整合）を強制 |
| **REPORT** | `orchestration/knowledge-queue.json`（gitignore 済み）+ コンソール / CI 要約 |

### 検出キュー

| キュー | 検出条件 | 消化方法（LLM） |
|---|---|---|
| `enrich` 増強待ち | summary がコレクション別閾値未満（学術 300 字 / 法令実務・補助金 120 字 / 経済史 200 字。相談窓口は連絡先カードなので免除） | 増強パイプライン: web 調査 → 敵対的ファクトチェック → 600-900 字化（既存 tranche-1 の手順） |
| `reverify` 再検証待ち | asOf からの経過が閾値超（学術 12 か月 / 法令実務・補助金・相談窓口 6 か月 / 経済史 18 か月） | 原典再確認 → 内容更新 or asOf 更新 |
| `missingAsOf` | 項目別 asOf を持たないコレクション（経済史 86 件は 2026-07 に一括付与済み → 現状 0） | データ側に asOf を一括付与する 1 回のタスク |
| `dedupe` 重複疑い | **同一コレクション内**のタイトルコア一致（副題・括弧除去後）から**裁定済みペアを除外**した残り | 判定 → 独立懐疑者の反証 → SAME なら統合、DISTINCT なら台帳へ追記 |
| `dedupeGraph` 重複疑い（グラフ） | 知識グラフの term-overlap スコア ≥ 3,000（語彙がほぼ同一）で裁定済みでないペア。副題違いで titleCore をすり抜けた残存重複を捕捉（例: リーンスタートアップ第 3 変種を実際に発見） | 同上（判定 → 反証 → 統合/台帳） |
| `sourceHygiene` 出典衛生 | 出典 <2 件 or 権威なし（通常 0 — verify:knowledge が先に落とす） | 出典の追補 |
| `deadLinks` リンク切れ | 出典 URL が 404/410（`--links=N` 時のみ・週替わりシャードで全 URL を巡回） | 代替 URL / アーカイブへ差替え |

### 裁定済み「別概念」台帳 — `orchestration/knowledge-distinct-pairs.json`

重複統合パス 3（2026-07-02・98 エージェント判定 + 懐疑検証）で「**別概念として保持**」と
裁定されたペアの永続台帳（84 ペア）。`dedupe` キューから機械的に除外され、一度裁定した
ペアが毎週再浮上しない。**新たに DISTINCT と裁定したペアは `[idA, idB]`（辞書順）で追記する。**

### 主要オプション

```bash
npm run knowledge:auto                        # フル（監査+再生成+検証+報告）
npm run knowledge:auto -- --links=100         # 出典 URL 死活も（CI 想定 — 生ネットワークが必要）
npm run knowledge:auto -- --today=YYYY-MM-DD  # 鮮度判定の基準日を固定（再現・テスト用）
npm run knowledge:auto -- --skip-regen        # 読み取り専用（監査と報告のみ）
```

## ② 週次の無人実行 — `.github/workflows/knowledge-auto.yml`

- **毎週月曜 06:00 JST**（+ 手動 `workflow_dispatch`）。単一ジョブ・週次で Actions 無料枠に優しい。
- 実行内容: `knowledge:auto --ci --links=100` → **派生成果物ドリフトなし証明**（再生成後に
  `git diff --exit-code` — 決定論が壊れたら fail）→ キューをアーティファクト保存（90 日）→
  常設 Issue「📚 知識オートパイロット報告（自動更新）」を作成/更新（作業ゼロなら自動クローズ）。
- 出典 URL 死活は**週替わりシャード**（ISO 週番号 × 100 件のステートレス・ローテーション）で、
  約 9,000 URL を状態ファイルなしに巡回する。401/403/405/429 は bot 対策の可能性が高いため
  「死」と断定せず要確認扱い。

## ③ LLM 層 — キューの消化（セッションへの指示テンプレート）

Claude Code セッション（手動 or 定期起動）への標準プロンプト:

> 知識オートパイロットのキューを消化して。
> `npm run knowledge:auto -- --skip-regen` でキューを再生成 →
> `orchestration/knowledge-queue.json` を読み、優先度順（dedupe → reverify → enrich 上位 N 件）に
> 確立済みパイプライン（調査 → 敵対的検証 → 機械ゲート）で処理。
> DISTINCT 裁定は台帳へ追記。処理後 `npm run knowledge:auto` で再生成・検証し、
> `typecheck / test / verify:all` 全 green を確認してコミット・プッシュ。

新規概念の追加（Batch 724+）は従来どおり 6 概念/バッチの 2 段検証パイプラインで続行し、
追加後はオートパイロットが自動で監査対象に取り込む（追加コードの変更は不要 —
`kc.loadEntries()` が全コレクションを一元ロードするため）。

## NotebookLM への反映

知識が更新されるたび、REGEN フェーズが NotebookLM エクスポート（~880KB × 17 パート）を
再生成する（既定の出力先: OS 一時ディレクトリ `notebooklm-export/`）。NotebookLM には
外部書込 API がないため、最後の 1 ホップだけは人手: 再生成された .md をノートブックの
ソースと差し替える（docs 手順は README-取込手順を参照 — セッションが zip でも届ける）。

## 設計上の决め事

- **キューは gitignore**（`orchestration/knowledge-queue.json`）: 実行のたびに変わる報告物で、
  真実はデータ側にあるため。永続すべき裁定だけが台帳（distinct-pairs）としてコミットされる。
- **閾値はコード先頭の定数**（`THIN_CHARS` / `STALE_MONTHS`）。変更したら本書も更新する。
- **理論⇄実務の同名併存は重複ではない**: 学術（bizlaw-*）と法令実務（tax-*/legal-*/labor-*）で
  同じ制度を扱うのは設計上の意図（観点が違う）。dedupe はコレクション内のみ照合する。
- **自動で消さない・書き換えない**: 機械層が行う変更は「決定論的な再生成」だけ。知識本文の
  追加・修正・削除は必ず LLM 層（検証パイプライン）を通る。
