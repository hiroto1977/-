# 13. オーケストレーション AI: 4 チーム × 4 役 + PDCA/OODA

> **目的**: `governance/12_SYSTEM_DESIGN.md` で定義した統合システムを、複数の AI サブエージェントが**役割分担しながら自律的に運用・改善**する仕組み。
> **読み手**: オーケストレータ (Claude Code 等の親エージェント) と、その下で動くサブエージェント。
> **依存**: 既存の audit log (L2) と test harness (L1) を**共通基盤**として再利用する。新規依存なし。

---

## 0. 設計原則

1. **チーム = ドメインの自治単位**: 4 チームはそれぞれ独立した責務を持ち、自分のドメインに閉じた PDCA を回す
2. **役 = 専門性の分割**: 各チーム内 4 役は機能で分けるのではなく、**思考のレイヤ** (構想 → 実装 → 検証 → 統合) で分ける
3. **PDCA = 通常運転** / **OODA = 異常事態**: 普段は週次/月次の改善サイクル、インシデント発生時は OODA に切替
4. **板 (board)**: `audit.jsonl` を**チーム間の共有メッセージング基盤** として使う (新規 DB 不要)
5. **冪等で並列**: 同じタスクを複数チームに渡しても結果が同じ。チーム間は非同期 + audit log で順序保証

---

## 1. チーム構成

```
┌─ オーケストレータ (親 Claude / 人間) ─────────────────┐
│  ・全体目標の受領 → どのチームに振るか判断             │
│  ・チーム間の引き継ぎを board (audit.jsonl) で監視     │
│  ・PDCA / OODA サイクルの起動                          │
└──┬─────────┬──────────┬──────────┬───────────────────┘
   │ α 設計  │ β 実装   │ γ 品質   │ δ 運用
   ▼         ▼          ▼          ▼
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│ α1   │ │ β1   │ │ γ1   │ │ δ1   │
│ α2   │ │ β2   │ │ γ2   │ │ δ2   │
│ α3   │ │ β3   │ │ γ3   │ │ δ3   │
│ α4   │ │ β4   │ │ γ4   │ │ δ4   │
└──────┘ └──────┘ └──────┘ └──────┘
```

### 1.1 4 チーム × 4 役の定義

| チーム | ドメイン | 主成果物 | 主読書 |
|---|---|---|---|
| **α (Alpha) アーキテクト** | システム設計・不変条件・データフロー | 設計図更新、設計判断 | `governance/12`, `INV-*` |
| **β (Beta) 実装** | 機能追加・既存修正・ブラウザ/シェル コード | コード差分、PR | `scripts/`, `v19/ui/`, `desktop/` |
| **γ (Gamma) 品質** | テスト・PII・XSS・監査整合 | テスト追加、回帰結果 | `tests/`, `audit-verify.sh` |
| **δ (Delta) 運用** | ガバナンス文書・法令・ルーティン・IR | 文書更新、運用手順 | `governance/`, `funding/`, `templates/` |

### 1.2 各チームの 4 役 (思考レイヤ)

各チーム内で、4 名は**思考の段階**で分業する:

| 役 | 思考レイヤ | 担当 |
|---|---|---|
| **〜1 構想** | What / Why | ドメイン内の「次に何をすべきか」を発見・優先付け |
| **〜2 設計** | How (high) | 解決策の構造を決め、トレードオフを言語化 |
| **〜3 実行** | How (low) | 実コード/文書を書く、テストを通す |
| **〜4 査読** | Verify | 出力をレビューし、不変条件と整合するか確認 |

例:
- **α1**: 「新たに不変条件 INV-12 が必要」と発見 → α2 へ
- **α2**: INV-12 の検証可能性を設計 → α3 へ
- **α3**: `governance/12` に追記、`tests/` に骨格 → α4 へ
- **α4**: 既存 INV と矛盾しないかレビュー、OK なら板に commit 通知

---

## 2. 役割の詳細

### 2.1 Team α (Architect)

| 役 | 責任 | トリガー | 出力 |
|---|---|---|---|
| **α1 構想 (Strategist)** | 「設計の負債」を見つける。不変条件の不足・設計の歪み | 週次 PDCA、設計レビュー要請 | `governance/12 §10` への課題追加 |
| **α2 設計 (Architect)** | 構造を提案。データフロー、信頼境界、新 INV の素案 | α1 からの引き継ぎ | 設計案 (markdown) |
| **α3 執筆 (Documenter)** | `governance/12_SYSTEM_DESIGN.md` を更新。`design-iterations/v{N}.md` を スナップショット | α2 の承認後 | 設計図 v{N+1} |
| **α4 査読 (Auditor)** | 既存 INV と矛盾していないか / 失敗モードに穴がないか | α3 完了時 | 板に `arch.review.pass` または `arch.review.block` |

### 2.2 Team β (Implementation)

| 役 | 責任 | トリガー | 出力 |
|---|---|---|---|
| **β1 構想 (Tech Lead)** | α からの設計を実装に落とすか判断、優先付け | α からの引き継ぎ、機能要望 | TODO リスト |
| **β2 設計 (Engineer)** | API / 関数シグネチャ / ファイル分割を決める | β1 から引き継ぎ | 実装計画 |
| **β3 実装 (Coder)** | 実コードを書く。bash / PowerShell / dashboard.js | β2 から | git diff |
| **β4 査読 (Reviewer)** | スタイル / セキュリティ / 既存 INV の遵守 | β3 完了時 | 板に `impl.review.pass` |

### 2.3 Team γ (Quality)

| 役 | 責任 | トリガー | 出力 |
|---|---|---|---|
| **γ1 構想 (QA Lead)** | テスト カバレッジ ギャップの発見 | β からの実装通知、定期審査 | テスト計画 |
| **γ2 設計 (Test Architect)** | テストの種類 (unit / integration / js) を決定 | γ1 から | テスト設計書 |
| **γ3 実装 (Test Engineer)** | `tests/` 配下にテストを追加、smoke-test に組込 | γ2 から | tests/ の差分 |
| **γ4 査読 (Security Reviewer)** | PII / XSS / 監査整合 / `audit-verify.sh` 通過 | γ3 完了時 | 板に `qa.review.pass` |

### 2.4 Team δ (Operations)

| 役 | 責任 | トリガー | 出力 |
|---|---|---|---|
| **δ1 構想 (Ops Lead)** | 運用上の不足、法令変更、新リスク | 月次レビュー、外部 イベント | governance 改訂 提案 |
| **δ2 設計 (Policy Architect)** | データ分類 / 士業ルール / IR への影響評価 | δ1 から | ポリシー改訂案 |
| **δ3 執筆 (Operations Writer)** | `governance/01–11` を更新、`templates/` 拡張 | δ2 承認後 | doc 差分 |
| **δ4 査読 (Compliance Reviewer)** | 法令適合 / 既存ルールとの整合 | δ3 完了時 | 板に `ops.review.pass` |

---

## 3. PDCA サイクル (通常運転)

```
   ┌─── Plan ──────────────────┐
   │  α1: 課題発見 (governance/│
   │  12 §10 から最高優先度)    │
   │  → 担当チーム決定         │
   └────────────┬───────────────┘
                ▼
   ┌─── Do ────────────────────┐
   │  担当チーム の 1→2→3 を   │
   │  順に実行 (引き継ぎは板)   │
   └────────────┬───────────────┘
                ▼
   ┌─── Check ─────────────────┐
   │  γ4 + α4 が査読            │
   │  bash tests/smoke-test.sh │
   │  bash scripts/audit-verify│
   └────────────┬───────────────┘
                ▼
   ┌─── Act ───────────────────┐
   │  β4: commit + push        │
   │  α3: governance/12 §10 を │
   │       「実装済」に更新     │
   │  δ3: README / 関連文書同期│
   └────────────┬───────────────┘
                │
                └→ 次の Plan へ
```

**頻度**: 週次 (月〜金で 1 課題完遂、土日でレビュー → 次週の Plan)

**完遂の定義 (DoD)**:
1. テストが通る (smoke-test.sh)
2. INV を 1 つも壊していない (`tests/integration/audit-cross-os.sh` を含む)
3. governance/12 § が更新済
4. commit + push 完了
5. design-iterations/v{N+1}.md をスナップショット

---

## 4. OODA サイクル (異常事態)

```
   ┌─── Observe ───────────────┐
   │  検出元:                  │
   │   ・preflight.sh の FAIL  │
   │   ・audit-verify が exit 1│
   │   ・pre-commit が PII 検出│
   │   ・storage-health の警告 │
   │   ・ユーザー 通報         │
   └────────────┬───────────────┘
                ▼
   ┌─── Orient ────────────────┐
   │  α1 + δ1 が共同分類:      │
   │   ・08_ATTACK_CATALOG     │
   │     のどのシナリオか      │
   │   ・C0-C4 のどの機微か    │
   │   ・既存 INV 違反か       │
   └────────────┬───────────────┘
                ▼
   ┌─── Decide ────────────────┐
   │  09_INCIDENT_PLAYBOOK の  │
   │  該当 シナリオを参照、    │
   │  60 秒対応を即実行        │
   └────────────┬───────────────┘
                ▼
   ┌─── Act ───────────────────┐
   │  β3: 緊急修正コード        │
   │  γ3: 回帰テスト追加       │
   │  δ3: IR 報告書 (templates)│
   │  α3: 失敗モードに追加     │
   └────────────┬───────────────┘
                │
                └→ 必要なら Observe に戻る (拡大被害監視)
```

**頻度**: イベント駆動 (検出から最初のアクションまで 60 秒以内が目標)

**OODA から PDCA への遷移**: 急性対応が完了したら、根本原因を **Plan** に積む。OODA で得た情報は α1 が次の PDCA の最高優先度にする。

---

## 5. 板 (Board) — チーム間 メッセージング

### 5.1 場所
`~/.claude/audit.jsonl` の中に専用の `event` プレフィックスで出す。チーム / 役を `details` で識別。

### 5.2 イベント命名

```
team.<team>.<role>.<verb>
```

例:
- `team.alpha.1.scoped`     — α1 が課題を選んだ
- `team.alpha.2.designed`   — α2 が設計案を出した
- `team.beta.3.implemented` — β3 が実装完了
- `team.gamma.4.passed`     — γ4 が査読 OK
- `team.delta.3.committed`  — δ3 が文書 commit

引き継ぎ:
- `handoff.alpha.beta` — α → β
- `handoff.beta.gamma` — β → γ

異常通知:
- `incident.detected` — OODA 起動
- `incident.contained` — OODA 終了

### 5.3 例 (audit.jsonl 抜粋)

```json
{"ts":"2026-05-05T12:00:00+09:00","host":"laptop","user":"hiroto","pid":1234,"script":"orchestrate.sh","event":"team.alpha.1.scoped","details":"issue=12 priority=high","prev_hash":"...","chain_hash":"..."}
{"ts":"2026-05-05T12:05:00+09:00","host":"laptop","user":"hiroto","pid":1234,"script":"orchestrate.sh","event":"handoff.alpha.beta","details":"from=alpha2 to=beta1 issue=12","prev_hash":"...","chain_hash":"..."}
```

audit-verify.sh は通常通り検証可能 (専用イベントも JSON 行なので)。

---

## 6. 起動 (Bootstrap)

```sh
# (a) 通常運転 — 最高優先度の §10 課題を 1 サイクル PDCA
bash scripts/orchestrate.sh --cycle pdca

# (b) 異常時 — preflight が失敗、即 OODA
bash scripts/preflight.sh || bash scripts/orchestrate.sh --cycle ooda --trigger preflight

# (c) 状態 確認
bash scripts/orchestrate.sh --status

# (d) 板の最近 50 件を表示
bash scripts/orchestrate.sh --board --tail 50
```

`orchestrate.sh` は **タスク振り分け器**であり、実際のコード生成は親 (Claude Code 等) が `Agent` ツールで配下 sub-agent を呼ぶ。`orchestrate.sh` の出力 (markdown) を Agent の prompt として使う。

---

## 7. チーム間ハンドオフ プロトコル

引き継ぎは以下の 3 情報を **必ず** 板に書く:

1. **何を** (issue / 課題 ID または短い説明)
2. **誰に** (チーム + 役)
3. **次のアクション** (1 文)

引き継ぎなしで作業を始める / 兼務する のは禁止。これにより:
- 並列性: チーム A の作業中にチーム B が独立に走れる
- 監査性: audit.jsonl に全活動が出る
- 障害時の追跡: チェーンを遡れば「誰が何を渡したか」がわかる

---

## 8. KPI (チーム別)

| チーム | KPI | 計測方法 |
|---|---|---|
| α | INV カバレッジ (テストある INV / 全 INV) | grep + tests/ で集計 |
| β | サイクル完遂時間 (issue scope → commit) | board の event 間隔 |
| γ | テスト pass / 全テスト | smoke-test の結果 |
| δ | governance 文書の鮮度 (最終更新からの経過日数) | git log で集計 |

四半期ごとに見直し、低い KPI のチームに次サイクルの優先度を増やす。

---

## 9. 失敗モード

| 故障 | 影響 | 対策 |
|---|---|---|
| α2 の設計案が β1 にとって実装不能 | サイクル停滞 | β1 が α2 に再設計依頼 (`team.beta.1.bounce` イベント) |
| γ4 が査読で恒常的にブロック | スループット低下 | α4 と γ4 が共同 retro、INV を緩める or テストを足す |
| 板の audit.jsonl が破損 | チーム間連絡不能 | `audit-verify.sh` で検出 → `audit-export.sh` の最新 backup から復旧 |
| 同じ課題に複数チームが着手 | 二重実装 | `orchestrate.sh --status` で重複検出、後発を中断 |

---

## 10. 関連文書

- `governance/12_SYSTEM_DESIGN.md` — 全体設計 (本文書はその上に乗る運用層)
- `governance/09_INCIDENT_PLAYBOOK.md` — OODA の Decide フェーズで参照
- `governance/03_OPERATIONS.md` — 日常運用ルール (PDCA の Do に統合)
- `tests/README.md` — Check フェーズで使う

---

## 11. 改定履歴

- 2026-05: 初版 (PR #1 のオーケストレーション拡張として導入)
