# 12. 統合システム 設計図 (System Blueprint)

> **現バージョン**: **v40 (#journal 親子タスク — governance/16 Phase 2、業務階層化)**
>
> **目的**: 39 サイクル分 (PDCA × 28 + OODA × 2 + 初期構築 9) で築いた システムを、新規読者が **30 分で全体像** を把握できる形に整理。
>
> **読み手**: 新規セッション (Claude / 別 AI / 人間)、レビュア、運用者
> **読了時間**: 30 分 (詳細は各 governance docs と design-iterations/v{N}.md へ)

---

## 0. TL;DR (3 行)

このシステムは **「ローカル ファースト × ガバナンス機械強制 × クロス OS 監査」** の 3 軸を柱とする業務 AI 運用基盤。

1. 既定で外部送信ゼロ (Ollama)、クラウド AI は明示選択 + ローカル専用モードで遮断可能
2. ルール文書 だけでなく **pre-commit hook / pii-scan / chain-hash audit / trash-first / drift sniff / 自動監視** で物理強制
3. 8 階層 (L1 テスト ↔ L8 オーケストレーション) で責務分離、367+ テスト 6 スイートで全レイヤ検証

⚠️ **honest 限界**: 「物理的に送信不能」では**ない** — DevTools / 直接 fetch / 設定改変 で迂回可能。情報機微度に応じて運用ルール (governance/02) と物理分離 (オフライン 端末) を併用。

---

## 1. システム 哲学 (5 原則)

このシステム の あらゆる 設計判断 は 以下から派生する:

### 1.1 静的のみ (Static-First)
- ビルド ステップなし、`python3 -m http.server 8000` だけで動く
- npm / pip パッケージ追加 禁止 (CLAUDE.md 厳守)
- 5 年後 も同じ手順で動く保証 (依存パッケージの脆弱性 / 廃止 リスクなし)

### 1.2 ローカル ファースト (Local-First)
- 既定で外部送信ゼロ (Ollama)
- クラウド AI (Anthropic / Google) は明示選択のみ、ローカル専用モードで UI 遮断可
- データ は端末内 (localStorage / `~/.claude/`) で完結、外部 SaaS リスクを排除

### 1.3 機械強制 (Machine-Enforced)
- ルール文書 ≠ 守られる保証。**実行可能な 強制機構** を備える:
  - `pre-commit hook` で PII を含む commit を物理的に阻止 (INV-6)
  - `audit-verify` で 改竄を検出 (INV-2 / INV-10)
  - `audit_log "*.start"` を grep で全 user-script 検証 (INV-3)
  - drift sniff で 文書 / コード の整合 を機械検証

### 1.4 反復 改善 (Iterative)
- v1 から v32 まで 全反復を `design-iterations/v{N}.md` に保存
- 各サイクル は α1 (scope) → α2 (design) → ... → γ4 (review) → commit
- 「黙って失敗」を resilience テスト で潰す (15 シナリオ)

### 1.5 透明性 (Transparency)
- 推定値 / 判断根拠 / 失敗モード を **honest に明示** (§7 保証/限界)
- 倫理ガード (governance/15) で protected attribute 推定を実装上禁止
- 業務記録 (governance/16) で意思決定 を時系列に保存

---

## 2. 階層モデル (Layer Model)

下から 上に 積み上がる ([参考: OSI 流] L1=基盤、L8=自律改善)。

```
┌─ L8 ─────────────────────────────────────────────────────────┐
│ Orchestration AI (4 teams × 4 roles + PDCA/OODA)             │
│  scripts/{orchestrate,orchestrate-watch,orchestrate-kpi}.sh  │
│  scripts/{teams,cycles}/  governance/13                      │
├─ L7 ─────────────────────────────────────────────────────────┤
│ Governance Docs (governance/ 17 本 + funding/ + templates/)  │
│  法制度 / データ分類 / 運用 / IR / 設計 / 倫理 / 業務記録    │
├─ L6 ─────────────────────────────────────────────────────────┤
│ User Interface                                               │
│  desktop/ (PWA)  v19/ui/ (7 ルート + 3 modules)  cowork/    │
├─ L5 ─────────────────────────────────────────────────────────┤
│ AI Provider Abstraction                                      │
│  Ollama (local) | Anthropic | Google | affect-aware adaptive │
├─ L4 ─────────────────────────────────────────────────────────┤
│ Operational Scripts (16 user-script + lib + hooks)           │
│  preflight / pii-scan / storage-* / audit-* / work-journal   │
│  install-hooks / orchestrate*                                │
├─ L3 ─────────────────────────────────────────────────────────┤
│ Safety Enforcement                                           │
│  pre-commit hook / trash-first / audit backup / hook self-  │
│  diagnosis (bootstrap step 2/5)                              │
├─ L2 ─────────────────────────────────────────────────────────┤
│ Audit (Cross-OS, Tamper-Evident, flock-protected)            │
│  lib/audit.{sh,ps1} → ~/.claude/audit.jsonl                  │
│  audit-verify (Python 化) + audit-export + #audit ビューア   │
├─ L1 ─────────────────────────────────────────────────────────┤
│ Test Harness — 6 スイート 367+ tests / 50s                   │
│  unit / js / ps / integration / regression / resilience      │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 層間 の 依存ルール

- **下層 は上層 に 依存しない** (L1 は L2-L8 を知らない)
- **上層 は下層 を 道具 として使う** (L8 は L1-L7 全部 を呼べる)
- **Drift sniff で層間の 整合 を機械維持** (governance/12 ↔ knowledge ↔ README の三角整合 等)

---

## 3. 不変条件 (Invariants) — 全 12 自動検証

INV-* は実行時に **必ず真** であるべき条件。違反 = 設計バグ。

| ID | 不変条件 | 守る場所 | 検証 |
|----|---------|---------|-----|
| INV-1 | localOnly=true で UI から Anthropic/Google 不可視 | `dashboard.js: visibleProviders` | `tests/js/test_localonly.mjs` |
| INV-2 | audit.jsonl 各行の SHA-256 連鎖 (`chain = sha256(prev + body)`) | `lib/audit.{sh,ps1}` (flock 付) | `tests/unit/test-audit-lib.sh` |
| INV-3 | 全 ユーザー実行型 script (10 本) が `audit_log "*.start"` を呼ぶ | 各 script 冒頭 | `tests/unit/test-inv3-audit-start.sh` |
| INV-4 | ユーザー データ削除は `_trash_move` 経由 (rebuild artifacts は例外) | `storage-cleanup.sh:_trash_move` | `tests/unit/test-storage-cleanup.sh` |
| INV-5 | C4 はクラウド (rclone remote) に送信不可 | `storage-archive.sh: C4 ガード` | `tests/unit/test-storage-archive.sh` |
| INV-6 | PII を含む commit は pre-commit hook が阻止 | `scripts/hooks/pre-commit` | `tests/unit/test-hooks.sh` |
| INV-8 | UI Markdown は XSS 安全 | `v19/ui/modules/markdown.js` | `tests/js/test_md.mjs` |
| INV-9 | Anthropic SSE で input/output_tokens 両方保持 | `dashboard.js:claudeStream` | `tests/js/test_providers.mjs` |
| INV-10 | audit.jsonl 改竄は `audit-verify.sh` で必ず検出 | `audit-verify.sh` (Python) | `tests/unit/test-audit-lib.sh` |
| INV-11 | チーム間 handoff は `orchestrate.sh --handoff` 経由のみ | `cmd_handoff` | `tests/unit/test-orchestrate.sh` |
| INV-12 | 同 issue ID を複数チームが同時 scoped 不可 | `orchestrate-kpi.sh:--check` | `tests/unit/test-orchestrate-kpi.sh` |

INV-7 は **GOAL-7** (バイト互換 設計目標) に降格 — pwsh 不在環境では検証不能のため。

倫理ガード (governance/15) は INV ではないが **実装上 禁止** 規則:
- 性別 / 年齢 / 民族 / 宗教 / 性的指向 / 政治志向 / 障害有無 で 感情分類しない (8 ケースで機械検証済)

---

## 4. 信頼境界 (Trust Boundaries)

```
┌─ ローカル端末 (User-controlled, not "trusted by system") ──┐
│                                                            │
│  Browser localStorage  ← user-readable (DevTools 経由)     │
│  Filesystem ~/                                             │
│  ~/.claude/audit.jsonl  ← append-only (改竄は検出可、防げず)│
│  ~/.claude/audit-backups/audit.jsonl.bak.YYYYMM (月次)     │
│  localhost:11434 (Ollama)  ← ループバック                   │
│                                                            │
└─────────────────┬───────────────────────────────┬──────────┘
                  │ ① クラウド AI                  │ ③ Git push
                  │ (C0-C2 のみ許可)              │ (PII スキャン後)
                  ▼                               ▼
        ┌──────────────────┐          ┌──────────────────┐
        │ api.anthropic.com│          │  GitHub remote    │
        │ generativelang.. │          │  + secret scan    │
        │ rclone crypt:    │          │  + gitleaks (任意)│
        └──────────────────┘          └──────────────────┘
        ベンダーの平文閲覧は           二次防御:
        crypt で防ぐが、              gitleaks (DISABLE_GITLEAKS=1
        通信メタは漏れる              でバイパス可)
```

**境界 ① 越えるデータ**:
1. データ分類 (`02_DATA_CLASSIFICATION.md`) で C0-C2 適合判定
2. ローカル専用モード OFF が前提
3. 監査ログ に記録 (現状 script レベルのみ、UI は §10 #1 で対応)

**境界 ③ 越えるデータ**:
1. pre-commit hook で `pii-scan.sh --staged` 強制
2. gitleaks (PATH に存在 + DISABLE_GITLEAKS≠1) で二次防御

---

## 5. データフロー (主要 7 シナリオ)

### 5.1 ローカル AI 会話 (Ollama)
```
User → v19/ui/dashboard.js
     → POST localhost:11434/api/chat (NDJSON)
     → ストリーム解析 → DOM 描画 → state.chat.sessions[i] (localStorage)
     → (opt-in 時) auditLogBrowser('chat.send', メタ情報のみ)
```

### 5.2 クラウド AI 会話 (Anthropic / Google)
```
User → reconcileLocalOnly() ガード (localOnly ON なら強制 ollama)
     → POST api.anthropic.com or generativelanguage (SSE)
     → ストリーム解析 → DOM
     → auditLogBrowser('chat.send' / 'chat.success' / 'chat.error')
```

### 5.3 commit
```
git commit
 → .git/hooks/pre-commit (symlink → scripts/hooks/pre-commit)
 → pii-scan.sh --staged (HIT → exit 1)
 → gitleaks (任意、DISABLE_GITLEAKS=1 でバイパス可)
 → audit verify (警告レベル、ブロックしない)
 → 通常 commit
```

### 5.4 ストレージ運用 (月次)
```
cron / 手動 → storage-orchestrator.sh --routine monthly
  → storage-health.sh (診断)
  → storage-cleanup.sh --apply --aggressive (trash-first)
  → storage-archive.sh --plan (rclone, クラス別、C4 拒否)
  → audit.jsonl.bak.YYYYMM 作成 (forensic 保全)
  → audit_rotate (古い行を削除、rotation.checkpoint で再チェーン)
```

### 5.5 自動監視 (常駐)
```
scripts/orchestrate-watch.sh --loop 60
 → 60 秒毎に 4 チェック (W1-W4):
   W1: audit-verify (INV-2 / INV-10)
   W2: chat.error 嵐 (1h で ≥5 件)
   W3: INV-12 違反 (重複 scoped)
   W4: PII クリーン 鮮度 (24h 以内)
 → breach 検出時:
   incident.detected を audit に発火
   --propose-response の誘導 出力
```

### 5.6 業務工程 記録 (governance/16)
```
A さん退勤前: work-journal.sh --handoff <task> "next=... open=..."
            : work-journal.sh --artifact <task> "path=... status=..."
            (audit.jsonl に work.task.* で SHA-256 連鎖)
B さん翌朝  : --list で アクティブ タスク 一覧
            : --show <task> で start から最新 handoff まで時系列
            : --export <task> で Markdown サマリ (引継ぎチェック付)
```

### 5.7 PDCA サイクル (L8 オーケストレーション)
```
α1 (Strategist): §10 から最高優先 未着手 を scope
 → handoff alpha.1 alpha.2
α2 (Architect): 設計案 → governance/12 §10 更新
 → handoff alpha.2 alpha.3 → α3 (Documenter)
 → handoff alpha.3 beta.1
β1-3 (Tech Lead → Engineer → Coder): 実装
 → handoff beta.3 gamma.1
γ1-3 (QA → Test Architect → Test Engineer): テスト追加
γ4 (Security Reviewer): smoke 全合格 + audit-verify + pii-scan
α4 (Auditor): INV 整合 確認
 → pdca.cycle.complete (audit.jsonl に SHA-256 連鎖で記録)
```

---

## 6. 失敗モード と 回復 (15 Resilience シナリオ)

`tests/resilience/test-resilience.sh` で 機械検証:

| カテゴリ | 故障 | 期待動作 |
|---|---|---|
| audit ファイル | 不在 / dir 不在 / 空 / 壊れた行 / バイナリ | mkdir/genesis/追記続行 |
| 権限 リソース | lock 競合 / 30 並列 / read-only | timeout で諦め業務継続 / flock 直列化 / audit≠業務 |
| 入力 異常 | details 省略 / 8KB / 改行 / UTF-8 | 全て JSON 妥当維持 |
| work-journal | 重複 start / complete 後追記 / 100 イベント show | 受容 / 受容 / 5s 以内 |

設計原則 (failure modes 哲学):
- 「業務 op を止めない」: audit 失敗 ≠ 業務 失敗 (audit_log は try-黙殺)
- 「黙って失敗 を許さない」: audit-verify / watcher で検出
- 「自己回復」: rotation.checkpoint で chain 切断後も新 genesis から続行

---

## 7. 保証 と 限界 (Honest)

### 7.1 保証する
- ✓ **localOnly ON のとき UI 経由 で クラウド AI 選択 不可**
- ✓ pre-commit hook installed なら PII commit は不可能 (`--no-verify` 以外)
- ✓ ユーザー データ削除は trash 経由 (30 日 猶予、`--restore` 復旧可)
- ✓ audit.jsonl 改竄 は audit-verify で必ず検出
- ✓ 月次 backup で audit 履歴 復旧可
- ✓ **業務工程 記録 は止まらない** (15 resilience シナリオ で検証)
- ✓ XSS: `<script>`, `javascript:` link, インライン event は `tests/js/test_md.mjs` で阻止
- ✓ 倫理ガード 7 軸 全機械検証 (gender/age/民族/宗教/性的指向/政治/障害)

### 7.2 保証しない
- ✗ **「物理的に送信不能」ではない** — DevTools 経由の API キー漏洩 / `localStorage.setItem('settings', ...)` 改変 / 直接 `fetch()` で迂回可能
- ✗ ベンダー (Anthropic / Google) のログ保持や学習除外 はベンダー設定 / ポリシー依存
- ✗ rclone crypt は client-side 暗号化 (mitigates not eliminates、通信メタは漏れる)
- ✗ Windows PowerShell スクリプト の実機テスト は手動 (Linux サンドボックス は構造のみ)
- ✗ pre-commit hook は `--no-verify` で迂回可 (人間承認 を CLAUDE.md で要求するが物理強制ではない)
- ✗ シングル サインオン / RBAC なし (個人 / 小規模事業者向け)
- ✗ rebuild artifacts (node_modules / 90 日超ログ) は trash を経由せず直接 `rm`

---

## 8. テスト戦略 (6 スイート 367+ tests)

各スイート に明確な役割:

| スイート | 目的 | 件数 (件、約) | 例 |
|---|---|---|---|
| **unit** (Bash) | 各 script の機能仕様 | 116 | test-pii-scan / test-audit-lib / test-work-journal |
| **js** (Node vm) | ブラウザ JS の単体仕様 (XSS / SSE / 倫理ガード) | 203 | test_md / test_providers / test_affect / test_audit_browser |
| **ps** (構造) | PowerShell の括弧 / 必須要素 (Linux で動く) | 4 | structural-check.sh |
| **integration** | cross-OS / E2E 結合 | 4 (内 2 skip) | audit-cross-os.sh |
| **regression** | 過去のバグ 再発防止 | 12 | test-known-bugs (governance/14 §4.2 連動) |
| **resilience** | 環境 ストレス下 の挙動 (黙って失敗 を潰す) | 15 | A audit/B 権限/C 入力/D work-journal |

実行:
```sh
bash tests/smoke-test.sh                # 全 6 スイート (~50s)
bash tests/smoke-test.sh resilience      # 個別 (~15s)
PREFLIGHT_FAST=1 bash scripts/preflight.sh   # ネット + audit-verify skip
```

---

## 9. ガバナンス文書 16 本のナビ

| # | ファイル | 内容 |
|---|---|---|
| 01 | `01_LEGAL_FRAMEWORK.md` | APPI / マイナンバー / 不正競争防止 / 著作権 / GDPR |
| 02 | `02_DATA_CLASSIFICATION.md` | **C0-C4 5 段階** + 取扱マトリクス + 50 ケース (**最初に読む**) |
| 03 | `03_OPERATIONS.md` | 日常運用 + IR + 監査ログ オフライン バックアップ (D-4) |
| 04 | `04_VENDOR_REVIEW.md` | クラウド AI ベンダ評価 |
| 05 | `05_TEMPLATES.md` | プロンプト・チェック リスト |
| 06 | `06_ONBOARDING.md` | 新メンバー 手順 |
| 07 | `07_PROFESSIONAL_RULES.md` | 14 士業 ルール |
| 08 | `08_ATTACK_CATALOG.md` | 30+ シナリオ × MITRE ATT&CK |
| 09 | `09_INCIDENT_PLAYBOOK.md` | 8 IR シナリオ × 5 ステップ |
| 10 | `10_STORAGE_HYGIENE.md` | クラス別 ストレージ衛生 + rclone resume 手順 |
| 11 | `11_PLATFORM_NOTES.md` | OS 別手順 |
| 12 | `12_SYSTEM_DESIGN.md` | (本文書) 統合設計図 |
| 13 | `13_TEAM_ORCHESTRATION.md` | **4 チーム × 4 役 + PDCA/OODA** |
| 14 | `14_SESSION_KNOWLEDGE.md` | **新セッション ブートストラップ** (30 秒 で読める) |
| 15 | `15_AFFECT_ETHICS.md` | **感情適応 倫理ガード** (gender-blind / 7 軸 protected) |
| 16 | `16_WORK_JOURNAL.md` | **業務 引継ぎ Free システム** (8 event タイプ + 法令整合) |

---

## 10. エントリ ポイント (役割別)

| 役割 | 最初に読む | 次に読む | 即実行 |
|-----|---------|---------|---------|
| 新セッション (Claude / 別 AI) | `governance/14` (30 秒) | `CLAUDE.md` + 本文書 | `bash scripts/orchestrate.sh --auto bootstrap` |
| 新メンバー | `governance/06` | `governance/02` | `bash scripts/preflight.sh` |
| 運用者 (日次) | `governance/03` | `governance/10` | `bash scripts/storage-orchestrator.sh --routine daily` |
| 経営者 | `funding/README.md` | `governance/02` | (適用時) `funding/checklists/` |
| 士業 | `governance/07` | `governance/01` | (該当節) |
| インシデント対応者 | `governance/09` | `governance/08` | (該当 シナリオ) + `--auto ooda` |
| 監査人 | 本文書 §3 INV | `audit-verify.sh` | `bash scripts/audit-verify.sh` |
| レビュア | 本文書 §6-7 | `tests/README.md` | `bash tests/smoke-test.sh` |
| 業務担当者 (引継) | `governance/16` | `work-journal.sh --help` | `--list` → `--show <task-id>` |

---

## 11. 拡張 パターン (How to Extend)

### 新 INV を追加
1. α2: 本文書 §3 INV テーブル に追加 (守る場所 / 検証)
2. γ3: テスト を `tests/unit/test-inv-XX.sh` に書く
3. α4: 既存 INV と矛盾しないか確認

### 新 script を追加
1. β1: `scripts/<name>.sh` に書く
2. 冒頭で `source lib/audit.sh; audit_log "<name>.start" ""` を必ず呼ぶ (INV-3)
3. set -u 必須
4. γ3: `tests/unit/test-<name>.sh` (assert.sh を source)
5. δ3: README scripts 節 に 1 行追加

### 新 Module (v19/ui)
1. β1: `v19/ui/modules/<name>.js` に export 関数 を書く
2. β2: dashboard.js 冒頭 で named import
3. drift sniff: `inDashOrModule(sym)` で file-aware (v29 パターン)
4. 既存 INV 全保持 を smoke で確認

### 新ガバナンス文書
1. δ3: `governance/<NN>_<TITLE>.md` (連番)
2. governance/README.md ナビ + CLAUDE.md ファイル構成 に反映
3. 本文書 §9 表に追加
4. drift sniff (test-readme-sync) が文書数を picks up

### 新チーム / 新役 (L8 拡張)
1. governance/13 を全面改訂
2. `scripts/teams/<name>.md` 追加
3. orchestrate.sh の `cmd_prompt_for` に case 追加
4. tests/unit/test-orchestrate.sh に 全 4 役 検証 追加

---

## 12. 運用 ルーティン

### 朝 (1 分)
```sh
bash scripts/orchestrate.sh --auto bootstrap   # 5 段 (preflight FAST + hook + status + KPI + watch)
bash scripts/work-journal.sh --list            # 担当 タスク 確認
```

### 業務中 (随時、各 3 分以内)
```sh
bash scripts/work-journal.sh --decision <task> "chose=... why=..."  # 重要判断
bash scripts/work-journal.sh --comm     <task> "with=... summary=..."  # 重要通信
bash scripts/work-journal.sh --artifact <task> "path=... status=..."  # 成果物
```

### 退勤 / 休暇 / 異動 直前 (3 分)
```sh
bash scripts/work-journal.sh --handoff <task> "next=... open=..."
bash scripts/work-journal.sh --artifact <task> "path=... status=final"
```

### 週次 (15 分)
```sh
bash tests/smoke-test.sh                       # 全テスト (50s)
bash scripts/orchestrate.sh --auto pdca        # 次の改善サイクル
bash scripts/storage-orchestrator.sh --routine weekly
```

### 月次 (1 時間)
```sh
bash scripts/storage-orchestrator.sh --routine monthly  # rotate + backup
bash scripts/audit-export.sh /Volumes/USB/audit-bak     # オフライン保全
# USB を物理分離 → 別場所保管 (governance/03 D-4)
```

### 異常時 (60 秒)
```sh
bash scripts/orchestrate.sh --auto ooda                 # watcher → propose-response
# breach タイプ別の対応案 が自動表示
```

---

## 13. 系の進化 (Phase Summary)

32 サイクル を 6 フェーズ で総括:

| フェーズ | バージョン | 主成果 |
|---|---|---|
| **Phase 1: 基盤構築** | v1-v9 | デスクトップ + v19 ダッシュボード + governance/01-11 + 監査ログ chain hash + テスト ハーネス |
| **Phase 2: L8 オーケストレーション** | v10-v17 | 4 チーム × 4 役 + PDCA/OODA + auto-watch + propose-response + audit_rotate チェーン整合 + flock |
| **Phase 3: UX 統合** | v18-v20 | 感情適応モード (gender-blind) + #orchestrate / #governance ルート + localStorage キャッシュ |
| **Phase 4: 運用最適化** | v21-v25 | preflight FAST + knowledge / README drift sniff + audit-verify Python (600x) + --auto モード |
| **Phase 5: 品質統合** | v26-v30 | regression suite + 包括監査 + hook self-diagnosis + dashboard.js モジュール化 (affect/audit-browser/markdown) |
| **Phase 6: 業務継続性** | v31-v32 | 業務 引継ぎ Free システム (governance/16) + Resilience テスト 15 件 |
| **Phase 7: 集大成** | v33 | 設計図 全面書直し (本文書) |
| **Phase 8: 業務 UI 統合** | v34-v35 | v34: v19 `#journal` ルート 実装 (modules/journal.js + 状態色 + キャッシュ + 55 unit tests)、v35: 横断検索 DSL (`state:` / `deadline<` / `deadline>` / `has:` / `stakeholder:` / `id:` / 自由語 AND、74 unit tests) |
| **Phase 9: モジュール 集大成** | v36-v37 | v36: orchestrate.js + providers.js 抽出、v37: sessions.js + audit-viewer.js 抽出。dashboard.js 2620→2098、L6 UI が 8 モジュール 構成 |
| **Phase 10: UX 統合** | v38-v39 | v38: KPI トレンド + ARIA + #journal DSL 例、v39: 拡張思考 + 監査トレンド + PWA SWR |
| **Phase 11: 業務階層** | **v40** | governance/16 Phase 2 — `parent=<ID>` 規約で親子タスク、`tasksToTree()` 純粋関数 + ネスト UI 描画 (children ボーダー / depth-2..4 / 🪶 親不在 マーク) + DSL `parent:<ID>|none|any` 拡張 (8 例 chip)。CLI は free-form details で 互換維持 (新フラグ 不要) |

詳細 反復履歴 は `governance/design-iterations/v{N}.md` (1 ≤ N ≤ 40) に保存。

---

## 14. 既知の課題 (Open Issues)

§10 課題 39 件は全て実装済 (v1-v39)。**#40 (v40): #journal 親子タスク 完了** — governance/16 Phase 2 を実装。`parent=<親 ID>` を `--start` の details に含めるだけで親子関係を表現 (CLI 新フラグ不要、後方互換)。`modules/journal.js` に `tasksToTree(map | array)` 純粋関数を追加 (フィルタで親が落ちた子は ルート 昇格 + isOrphan マーク)、DSL に `parent:<ID>|none|any` の 3 形式追加、UI に「🌳 ルートのみ / 🌿 子タスクのみ」chip 追加で 8 例 chip に。新規 19 unit tests + governance/16 §10 Phase 2 章追加。残る候補:

- pwsh 実機テスト (Windows / macOS) — Linux で開発、pwsh 実機検証は手動
- KPI トレンド の グラフ可視化 (Sparkline、現状はテキストのみ)
- desktop/ PWA の オフライン時 UI フィードバック (banner + queued sync)
- providers.js の Google Gemini thinking 対応 (`thoughts: true` 配信が始まれば)
- 監査ログ ビューア で「日付ヒートマップ」(時間帯 別 イベント密度)

---

## 15. 索引 (INDEX) — 詳細 文書 への リンク

- 倫理 / 法令 → `governance/01_LEGAL_FRAMEWORK.md` / `15_AFFECT_ETHICS.md`
- データ分類 → `governance/02_DATA_CLASSIFICATION.md`
- 運用ルール → `governance/03_OPERATIONS.md`
- インシデント → `governance/08_ATTACK_CATALOG.md` / `09_INCIDENT_PLAYBOOK.md`
- ストレージ → `governance/10_STORAGE_HYGIENE.md`
- OS 別手順 → `governance/11_PLATFORM_NOTES.md`
- L8 仕様 → `governance/13_TEAM_ORCHESTRATION.md`
- 新セッション → `governance/14_SESSION_KNOWLEDGE.md`
- 業務工程 → `governance/16_WORK_JOURNAL.md`
- テスト → `tests/README.md`
- 反復 履歴 → `governance/design-iterations/v{1-40}.md`

---

## 16. 改定履歴

- v1-v32 (2026-05): 各サイクルの増分改稿 — 詳細は `design-iterations/v{N}.md`
- v33 (2026-05): 全面書直し — 32 サイクルの集大成、構造を 16 章 に再編、Phase 1-7 で進化を総括、新規読者の 30 分 把握 を最適化
- v34 (2026-05): #journal UI 実装 (PDCA #23) — governance/16 を v19 ダッシュボードで可視化 (`modules/journal.js` 純粋ロジック層 + `bindJournal()` DOM バインド + 状態色 + localStorage キャッシュ + 55 unit tests)、Phase 8 (業務 UI 統合) を開始
- v35 (2026-05): #journal DSL 検索 (PDCA #24) — `parseQuery()` + `matchTask()` で `state:` / `stakeholder:` / `id:` / `deadline<` / `deadline>` / `has:` の 6 演算子 + 自由語 AND を解釈、UI search box から複合条件で業務状態を即座に絞れる (74 unit tests、DSL 19 件)
- v36 (2026-05): v19 最適化再構築 (PDCA #25) — Phase 9 開始、35 反復の学びから dashboard.js を 2620 → 2170 行 (-450) に縮小。`modules/orchestrate.js` (KPI 計算 + INV-12 検出 + board フィルタ + OODA_RESPONSES、48 unit tests) と `modules/providers.js` (3 プロバイダ sender + ProviderError + content helpers、57 unit tests) に純粋ロジック層を抽出。L6 UI が 6 モジュール構成 (markdown/audit-browser/affect/journal/orchestrate/providers) になり、各 INV 境界を独立検証可能に
- v37 (2026-05): sessions.js + audit-viewer.js 抽出 (PDCA #26) — dashboard.js 2170 → 2098 行、L6 UI 8 モジュール構成に到達 (markdown/audit-browser/affect/journal/orchestrate/providers/sessions/audit-viewer)
- v38 (2026-05): UX 統合 (PDCA #27) — Phase 10 開始。(a) `computeKpiTrend()` で L8 KPI 7d/30d/全期間 切替、(b) ARIA 強化、(c) `#journal` DSL 例 6 チップ
- v39 (2026-05): 拡張思考 + 監査トレンド + PWA SWR (PDCA #28) — (a) Anthropic `thinking_delta` 対応、(b) `summarizeAuditTrend` で監査ログ 7d/30d/全期間、(c) `desktop/sw.js` v3 SWR
- **v40 (2026-05): #journal 親子タスク (PDCA #29)** — Phase 11 (業務階層) 開始。governance/16 Phase 2 実装: `parent=<ID>` 規約 (CLI 新フラグ不要、free-form details で互換維持)、`tasksToTree()` で 親→子→孫 の ツリー構築、ネスト UI 描画 (.journal-children + .is-child + depth クラス)、DSL `parent:<ID>|none|any` (8 例 chip)、19 新 unit tests
