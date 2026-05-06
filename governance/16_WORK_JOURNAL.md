# 16. 業務 引継ぎ Free システム — Work Journal

> **目的**: 担当者が突然変わっても、新担当者が **完全な業務文脈** を 30 分で把握し継続できる状態を機械的に保つ。
>
> **仕組み**: 既存の `~/.claude/audit.jsonl` を業務記録の 共通基盤 として再利用。`work.task.*` イベント プレフィックスで業務工程を構造的に記録。
>
> **読み手**: 業務担当者、引継ぎを受ける者、AI 支援者
> **関連**: governance/12 (システム設計)、governance/13 (チーム オーケストレーション)、governance/03 (運用ルール)

---

## 0. 一行サマリ

業務イベントを 8 種類に正規化し、SHA-256 連鎖の audit.jsonl に追記。`work-journal.sh` で 1 コマンドで記録、`#journal` ルート で時系列再構成、引継ぎ時は `--show <task_id>` で全文脈が出る。

---

## 1. 設計原則

### 1.1 既存基盤を再利用 (新規 DB なし)
- 業務記録 は `~/.claude/audit.jsonl` の **同じファイル** に追記
- `event` プレフィックス `work.task.*` で 業務領域 を識別
- 既存 audit-verify / audit-export / audit-rotate / watcher が**すべて自動的にカバー**

### 1.2 8 種類のイベント (これだけ覚えれば運用可能)

| event | 用途 | 必須 details |
|---|---|---|
| `work.task.start` | タスク開始 | `task=<ID> title=<...> stakeholder=<...>` (deadline= 任意) |
| `work.task.decision` | 重要判断 | `task=<ID> chose=<採用案> why=<根拠 1 行>` |
| `work.task.comm` | ステークホルダー通信 | `task=<ID> with=<相手> summary=<要点>` |
| `work.task.artifact` | 成果物 産出 | `task=<ID> path=<ファイルパス> status=<draft\|review\|final>` |
| `work.task.block` | ブロック発生 | `task=<ID> reason=<...> needs=<解除条件>` |
| `work.task.resume` | 中断から再開 | `task=<ID> note=<前回からの差分>` |
| `work.task.handoff` | 引継ぎ準備完了 | `task=<ID> next=<次の動き> open=<未解決事項>` |
| `work.task.complete` | 完了 | `task=<ID> outcome=<成果> retro=<振り返り 1 行>` |

### 1.3 透明性 / プライバシー
- **PII を直接書かない**: 顧客名は仮名、電話番号はマスク、契約金額は概算 (CLAUDE.md ルール)
- 詳細は別 ファイル に書き、journal には **path だけ** 記載
- C3 以上の機微情報 は `path=...` で間接参照、外部漏洩 防止

### 1.4 改竄検知 (既存 INV-2 / INV-10 を流用)
- 業務記録 も SHA-256 連鎖
- 「いつ何を判断したか」「いつ顧客と何を約束したか」 が**改竄不能**な台帳に
- 監査時 / 紛争時 の証拠としても使える

---

## 2. 運用ルール

### 2.1 いつ記録するか (頻度)
| 種別 | 必ず記録 | 任意 |
|---|---|---|
| `task.start` | ✅ 全タスク 開始時 | — |
| `task.decision` | ✅ 後戻り しづらい判断 | 些細な選択は省略可 |
| `task.comm` | ✅ 顧客 / 上長 / 取引先 との重要やりとり | 雑談・社内 IM 等は省略可 |
| `task.artifact` | ✅ 成果物 を 確定 した時 | draft 段階の小修正 は省略可 |
| `task.block` | ✅ ブロック発生時 | — |
| `task.resume` | ✅ 中断 ≧ 1 時間 から再開時 | 数分の中断 は省略 |
| `task.handoff` | ✅ 退勤 / 休暇 / 担当変更 の前 | — |
| `task.complete` | ✅ 完了時 | — |

**鉄則**: **3 分以内に終わる記録** (1 コマンド)。長くなるなら details に path を入れて別ファイルへ。

### 2.2 タスク ID の付け方
- 案件 番号 (社内 ルール) があれば それを使う
- なければ `YYYYMMDD-NN` (例: `20260506-01`) で連番
- 重複してもチェックは弱い (運用上の問題、システム制約なし)

### 2.3 引継ぎ手順 (本システムの核)

#### 引継ぎを **する** 側
```sh
# 1. 退勤 / 休暇 / 異動 直前
bash scripts/work-journal.sh --handoff <task-id> "<次の動き> open=<未解決>"
# 例:
bash scripts/work-journal.sh --handoff 20260506-01 \
  "next=A 社 5/8 までに見積回答 / open=B 案件の値引可否を社長確認"

# 2. 関連 artifact があれば path も明示
bash scripts/work-journal.sh --artifact 20260506-01 \
  "path=docs/A社見積_v3.xlsx status=draft"
```

#### 引継ぎを **受ける** 側
```sh
# 1. 担当 タスク を一覧
bash scripts/work-journal.sh --list

# 2. 個別 タスク の全文脈 を時系列で
bash scripts/work-journal.sh --show 20260506-01

# 3. 関連 artifact (path 経由)
ls $(bash scripts/work-journal.sh --show 20260506-01 | grep -oE 'path=\S+' | cut -d= -f2)
```

→ start から最新 handoff までの **全 イベント が時系列順に出る**。前担当者の判断・約束・成果物 が漏れなく見える。

---

## 3. CLI: `scripts/work-journal.sh`

### 3.1 主要コマンド
```
--start <task-id> <details>          タスク開始
--decision <task-id> <details>       判断記録
--comm <task-id> <details>           通信記録
--artifact <task-id> <details>       成果物 記録
--block <task-id> <details>          ブロック記録
--resume <task-id> <details>         再開記録
--handoff <task-id> <details>        引継ぎ準備
--complete <task-id> <details>       完了
--list [--all]                       アクティブ タスク 一覧 (open / blocked)
--show <task-id>                     特定 タスクの全 イベント を時系列
--export <task-id>                   タスク サマリ を Markdown で出力
--audit                              JSONL 形式で出力 (audit-verify と互換)
```

### 3.2 details のフォーマット (free text、推奨 key=value)
```
task=<ID> [key=value ...]
```
key=value は機械可読 (filter / 検索) を可能にする。spaces がある value は無視されるので、長文は `note=...` のような短いキーに圧縮。

例:
```
work.task.decision  task=20260506-01 chose=plan_B why=A社が予算 25% 削減 要望
```

---

## 4. v19 ダッシュボード 統合

### 4.1 `#journal` ルート (v31 新規)
- audit.jsonl を file picker でロード (既存 #audit と同じパス)
- `event:work.task.*` で フィルタ → タスク別に時系列 整理
- タスク カード: start → decisions → comms → artifacts → ... → handoff/complete
- 検索: タスク ID / ステークホルダー / キーワード

### 4.2 既存 #audit と分離
- #audit はシステム監査 (script の実行履歴)
- #journal は業務監査 (人間の判断履歴)
- 同じ audit.jsonl だが プレゼンテーションが異なる

---

## 5. 既存 INV / 失敗モードとの整合

### INV-2 / INV-10 (audit chain)
- work.task.* も SHA-256 連鎖に乗る → 同じ証拠能力
- audit-verify は何の event でも検証する → 業務記録の改竄も検知

### INV-3 (script audit)
- work-journal.sh も `audit_log "work_journal.start"` を冒頭で呼ぶ
- 「業務記録ツール 自体が動いた」も追跡される (二重記録ではない、メタ層)

### INV-6 (PII commit 阻止)
- journal に PII を書きそうな運用ミスは pre-commit hook で守られる (audit.jsonl は repo に commit しないが、間接的に保護)

### 失敗モード
- **記録忘れ**: 業務継続性 が悪化。検出: `--list` で「最終 イベント が 1 週間前」の タスク を warn
- **記録過多**: 検索性 が悪化。緩和: details は短く、長文は path 参照

---

## 6. 既存システム との 統合 図

```
                         ~/.claude/audit.jsonl
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
   System events             Work events            Orchestration
   (preflight,               (work.task.*)         (team.*, handoff.*,
    pii-scan,                                       incident.*,
    storage-*, etc.)                                pdca.cycle.*)
            │                     │                     │
            ▼                     ▼                     ▼
   #audit ルート             #journal ルート       #orchestrate ルート
   システム監査              業務工程 記録         チーム活動
            │                     │                     │
            └────────── audit-verify (改竄検知) ────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            ▼                     ▼                     ▼
       audit-export          orchestrate-watch    storage-orchestrator
       (オフライン           (自動監視 +           --routine monthly
        backup USB)         OODA 自動応答)        (rotate + backup)
```

→ work-journal は **既存インフラ全部の恩恵を受ける** (新規メンテ層なし)。

---

## 7. データ クラス と 法令 整合 (governance/02)

| 業務 種別 | journal で記録可 | path 経由のみ | 記録不可 |
|---|---|---|---|
| C0 公開情報 | ✅ そのまま | — | — |
| C1 社内 | ✅ ID / 概要 | 詳細は path | — |
| C2 取引先 | △ 仮名 推奨 | 詳細は path | — |
| **C3 機密** | ❌ 直接記載禁止 | ✅ path のみ | — |
| **C4 法定機微** | ❌ | △ 暗号化 path | ✅ 別管理推奨 |

**実装上の保証**: pii-scan が PII を検出 → commit 時 hook で阻止。journal を repo に commit する場合の保護として機能 (本来 audit.jsonl は ~/.claude/ で commit 対象外だが、export 時の保険)。

---

## 8. ユースケース 例

### 例 1: 営業 A さんが急遽休職、後任 B さんへ引継ぎ
```sh
# A さん 退勤前 (連続 3 コマンド)
bash scripts/work-journal.sh --handoff 20260506-01 \
  "next=A社の見積回答 5/8 23:00まで required=部長承認 contact=<取引先メール>"
bash scripts/work-journal.sh --artifact 20260506-01 \
  "path=docs/sales/2026/05/A社見積_v3_部長コメント反映.xlsx status=review"
bash scripts/work-journal.sh --comm 20260506-01 \
  "with=A社田中部長 summary=値引10%は無理 配送費込み案を再検討"

# 翌朝 B さん 出社
bash scripts/work-journal.sh --list             # 担当 引継ぎ タスク を確認
bash scripts/work-journal.sh --show 20260506-01 # 全文脈 (start から handoff まで)
```
B さんは **30 分** で文脈把握、外部連絡先 / 期限 / 障害物 / 成果物 が全部見える。

### 例 2: AI 支援者 (Claude Code) のセッションが切れた
```sh
# Claude が作業終了 直前 に毎回
bash scripts/work-journal.sh --handoff <task> "next=... open=..."
```
新セッションは `--list` + `--show` で前セッションの判断履歴をすべて取得 (governance/14 の「ブートストラップ」概念の業務側 拡張)。

---

## 9. 監査・法的観点 での 強み

- **タイムスタンプ + SHA-256 連鎖**: 「いつ何を判断したか」が後から改竄不能
- **append-only**: 既存ログを書き換えると `audit-verify` が exit 1
- **path 経由の機密**: 業務 詳細 (契約・個人情報) を間接参照 → 漏洩リスク低
- **電子帳簿法 / J-SOX 等**: 「業務記録」要件 のうち改竄防止 / 完全性 / トレーサビリティ を技術的に満たす (法的助言ではない、専門家確認推奨)

---

## 10. 改定履歴

- 2026-05: v31 で初版 (governance/16_WORK_JOURNAL.md として独立)
