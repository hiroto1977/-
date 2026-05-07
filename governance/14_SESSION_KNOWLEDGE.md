# 14. セッション ナレッジ — 新規セッション 起動 ガイド

> **目的**: 新しい Claude Code セッションが本リポジトリを引き継ぐ際の **ブートストラップ文書**。
> 過去 16 反復で得たメンタルモデル・落とし穴・暗黙のルール を、次の AI が **30 秒で読める形** に圧縮した。
>
> **読み手**: 新規セッションで起動する Claude / 別 AI / 引継ぎを受ける人間
> **使い方**: `CLAUDE.md` → `governance/12_SYSTEM_DESIGN.md` → 本文書 の順で読めば、即作業可能。

---

## 0. このプロジェクトを 3 行で

1. **ローカル ファースト × ガバナンス強制 × クロス OS 監査** の業務 AI 運用基盤 (静的、依存ゼロ、ビルドなし)
2. **L8 オーケストレーション AI** が 4 チーム × 4 役で PDCA/OODA を回し、自分で歪みを発見し自分で塞ぐ
3. **板 (`~/.claude/audit.jsonl`)** に SHA-256 連鎖で全活動を記録、改竄検知可能

設計図 **v40**、PDCA × **29** + OODA × **2** が稼働実績。§10 課題は全 **40** 件 実装済。
v31 で **業務 引継ぎ Free システム** (governance/16 + work-journal.sh)、v32 で **Resilience テスト 15 件** (tests/resilience/) — 業務記録が止まらないことを機械検証。
v33 で **設計図 全面書直し** (16 章で 30 分把握)、v34-v35 で `#journal` UI + DSL、v36-v37 で v19 最適化再構築 (L6 UI 8 モジュール)、v38 で UX 統合、v39 で 観測性 + オフライン強化、**v40 で #journal 親子タスク** — governance/16 Phase 2、`parent=<ID>` 規約 + `tasksToTree()` + ネスト UI + DSL `parent:<ID>|none|any` (Phase 11 業務階層 開始)。
v18 で affect-aware (gender-blind) chat、v19 で v19 ダッシュボード統合、v20 で永続キャッシュ、v21 で テスト 2.2x 高速化、v22 で knowledge doc を drift sniff 連動更新、v23 で README を drift sniff 連動更新、v24 で `orchestrate.sh --auto` (bootstrap/pdca/ooda/monitor) 半自動モード追加、v25 で audit-verify を Python 化 (smoke 19s、v21 比 5.7x)、v26 で 過去の罠 12 件を回帰テスト化 (tests/regression/)。

---

## 1. メンタルモデル (これだけは覚えて)

### 1.1 階層 (L1=foundation → L8=orchestration)
```
L8  Orchestration : orchestrate / orchestrate-watch / orchestrate-kpi
L7  Governance    : governance/01-16 + funding/ + templates/
L6  UI            : desktop/ + v19/ui/ + cowork/  (v36-v37 で 8 モジュール構成へ)
                    └ v19/ui/modules/{markdown, audit-browser, affect, journal,
                       orchestrate, providers, sessions, audit-viewer}.js
                       各モジュール = 純粋ロジック層 (DOM 非依存・Node テスト可能)
L5  AI Provider   : Ollama (default) / Anthropic / Google  (v39 で 拡張思考対応)
L4  Op Scripts    : preflight, storage-*, audit-*, pii-scan, work-journal, funding-deadline
L3  Safety        : pre-commit hook, trash-first, audit backup
L2  Audit         : lib/audit.{sh,ps1} → ~/.claude/audit.jsonl + audit-verify (Python 化、600x)
L1  Tests         : tests/{unit,js,ps,integration,regression,resilience} + smoke-test.sh
                    全 6 スイート / 200+ bash + 548 JS = 750+ tests
```

### 1.2 4 チーム × 4 役
- **α (Architect)**: 設計 / INV / 失敗モード ─ 構想 → 設計 → 執筆 → 査読
- **β (Implement)**: コード ─ Tech Lead → Engineer → Coder → Reviewer
- **γ (Quality)**: テスト / PII / セキュリティ ─ QA → Test Architect → Engineer → Security Reviewer
- **δ (Operations)**: 文書 / 法令 / 運用 ─ Ops Lead → Policy → Writer → Compliance

### 1.3 PDCA vs OODA
- **PDCA**: 通常運転 (週次)。§10 から課題を選び 1 → 2 → 3 → 4 を順次
- **OODA**: 異常事態 (60 秒)。preflight 失敗 / audit-verify 失敗 / pre-commit 阻止 等で起動

### 1.4 板 (board) = audit.jsonl
新規 DB 不要。チーム間ハンドオフは `orchestrate.sh --emit` または `--handoff` 経由で板に記録。SHA-256 連鎖で改竄検知。

---

## 2. 30 秒で 起動チェック

```sh
bash scripts/orchestrate.sh --auto bootstrap   # ★ v24 から: 上記 4 つを 1 コマンドで
# (内訳: preflight FAST + status + KPI + watcher --once)

# 個別実行も可
bash scripts/preflight.sh                     # 8 チェック (本番)
bash scripts/orchestrate.sh --status          # チーム活動状況
bash scripts/orchestrate-kpi.sh               # 4 チーム KPI
bash scripts/orchestrate-watch.sh --once      # 4 異常チェック (clean なら exit 0)
bash tests/smoke-test.sh                       # 全テスト (~ 48s, v21 から)
```

「今、何が動いていて、何が壊れているか」が 1 分で分かる。

### サイクル実行 — v24 から半自動

```sh
bash scripts/orchestrate.sh --auto pdca       # 次に打つ 1 行コマンドを提示
bash scripts/orchestrate.sh --auto ooda       # watcher → breach → 自動応答
bash scripts/orchestrate.sh --auto monitor 60 # 60s ループ で 監視 + 自動応答
```

---

## 3. 主要コマンド チート シート

### 通常運転 (PDCA)
```sh
bash scripts/orchestrate.sh --cycle pdca                # 起動
bash scripts/orchestrate.sh --prompt-for alpha.1        # α1 用 sub-agent prompt (live §10 込)
bash scripts/orchestrate.sh --emit team.alpha.1.scoped "issue=N priority=high"
bash scripts/orchestrate.sh --handoff alpha.1 alpha.2 "issue=N context"
bash scripts/orchestrate.sh --emit pdca.cycle.complete "issue=N v=NN"
```

### テスト (v21 で 2.2x 高速化)
```sh
bash tests/smoke-test.sh                       # 全部 (~ 48s — v21 から)
PREFLIGHT_FAST=1 bash scripts/preflight.sh     # ネット + audit-verify skip (テスト用)
PREFLIGHT_SKIP_NET=1 ...                       # ネットだけ skip (audit-verify は走らせたい時)
```

### 異常時 (OODA)
```sh
bash scripts/orchestrate-watch.sh --once                      # 一度だけ
bash scripts/orchestrate-watch.sh --loop 60                   # 60 秒ごと常駐
bash scripts/orchestrate.sh --cycle ooda --trigger watch
bash scripts/orchestrate.sh --propose-response audit_chain_broken    # IR Playbook 自動提示
bash scripts/orchestrate.sh --propose-response chat_error_storm
bash scripts/orchestrate.sh --propose-response inv12_concurrent_scope
bash scripts/orchestrate.sh --propose-response pii_scan_stale
```

### 監査 / 復旧
```sh
bash scripts/audit-verify.sh                  # チェーン検証
bash scripts/audit-export.sh ~/Desktop/bak    # USB に持出 (sha256 manifest 付)
bash scripts/orchestrate.sh --board --tail 50 # 直近 50 件
```

### ストレージ衛生
```sh
bash scripts/storage-health.sh                                  # 診断
bash scripts/storage-cleanup.sh                                  # dry-run
bash scripts/storage-cleanup.sh --apply --aggressive            # trash 経由削除
bash scripts/storage-cleanup.sh --restore                        # 復旧
bash scripts/storage-orchestrator.sh --routine monthly          # 月次 (rotate + backup 自動)
```

---

## 4. **絶対やってはいけない** こと (落とし穴)

### 4.1 既存 INV の bypass
- **INV-11**: チーム間 handoff は必ず `orchestrate.sh --handoff` 経由。直接 audit.jsonl 編集禁止
- **INV-4**: ユーザー データ削除は `_trash_move` 経由必須。`rm -rf` を直接書かない (例外: rebuild artifacts のみ `--aggressive` 時許可)
- **INV-12**: 同 issue を複数チームが同時 scoped 不可

### 4.2 過去に踏んだ罠 (繰り返し禁止)
| 罠 | 学び |
|---|---|
| `kpi_gamma` が smoke-test を内部で走らせ、smoke-test が KPI を呼ぶ → 無限再帰 | `--check` モードは γ をスキップ。テスト内では `ORCHESTRATE_KPI_NO_GAMMA=1` を必ず付ける |
| `audit_rotate` が古い行を削除するだけで、残行の prev_hash が浮く → verify 失敗 | rotate は `audit.rotation.checkpoint` を新 genesis に挿入 + 残行を再チェーン化 (実装済) |
| JS テストの brace extractor が文字列内 `{` で破綻 (regex 含む関数) | 抽出は不安定。テスト用に必要なら関数を inline copy する方針 (test_audit_browser.mjs 参照) |
| `set -u` で `$USER` が unset エラー | `${USER:-$(whoami)}` または `\$USER` で escape |
| pwsh 不在環境で signing 失敗 | テスト用 git repo に `git config commit.gpgsign false` を入れる |
| `pii-scan.sh` の grep が `-----BEGIN ...` をオプションと誤解釈 | `grep -anHE -e "$pattern"` で `-e` 明示 |
| 7 ステップだった preflight に 8 ステップ目を追加するとき step 番号を全部書き換え忘れる | sed で一括置換 |
| 並行書込で同じ prev_hash を 2 行が使い チェーン破断 (v17 で発覚) | `audit_log` に flock 追加済。並列テストでも race しない |
| 男女別 / 年齢別 で感情分類すると APPI / EU AI Act / 科学的根拠 全てに抵触 | gender-blind を選択。protected attribute 推定を実装上 禁止、テストで担保 (governance/15) |
| dashboard.js を ESM 分割しようとすると INV (XSS, audit chain, etc.) を壊すリスク | 漸進的拡張 (新ルート追加) を選択、大型 refactor は将来課題 |
| smoke-test の test-preflight が curl タイムアウト × 4 回 + audit-verify (bash 2200 行) で 62.7s | `PREFLIGHT_FAST=1` でテスト時のみ skip。本番 preflight は変えない (人間が朝に走らせる) |
| `--prompt-for` が静的ブリーフだけで §10 が古い情報になりやすい | alpha.1 限定で governance/12 §10 を Python で動的抽出 (v16 から) |
| `#orchestrate` ロード結果がリロードで消える | localStorage キャッシュ (LRU 5 件 / 各 500KB)、storage meter と整合 (v20 から) |
| `kpi_alpha` が tests/ で grep INV-N するが、INV-N 文字列は test ファイル名にない | 設計図 §4 の「検証」カラムを Python で parse (v11 から) |
| dashboard.js から symbol を grab する旧テスト (`test_providers/images/sessions/presets/integration`) が モジュール抽出後に "not found" で落ちる | v36-v37 で抽出時に **同 commit で** テストの読み元を `modules/*.js` に切替。`extractAt` は `export ` プレフィクスを許容する形に拡張 |
| ESM module 抽出 で 状態を持つ helper (`getSessionSystemPrompt` 等) が外部依存 (`getPresetById`) を要求 | **依存逆転**: モジュール側は引数注入、dashboard.js 側に薄い wrapper を残す。同パターン: `deriveTitleFromHistory({textOf, hasImages})` / `verifyAuditChain({sha256Hex, reconstructBody})` |
| `verifyAuditChain` テスト で 「連鎖切断」 を出すには chain_hash を **REAL_PREV** で再計算 + prev_hash だけ偽装する必要がある (両方偽装すると 「改竄疑い」になる) | governance/16 §5: 「prev mismatch」 と 「chain mismatch」 は別検出経路。テスト は `entries[1].chain_hash = sha256(entries[0].chain_hash + body_with_fake_prev)` で構築 |
| `parseAuditJsonl` の line 番号 が 元テキストの行番号 と ずれる (空行を filter で先に落とすため) | filter 後の index + 1 が記録される仕様。expected を計算するときは filter 後の位置で考える |
| `tasksToTree` で 親が フィルタ で 落ちた 子 を どう扱うか | **ルート に昇格**。`isOrphan=true` フラグで UI に「🪶 親不在」 マーク表示。フィルタ済み配列を入力に取れる API にすると 自然に解決 |
| KPI / 監査トレンド の `Date.now()` が テストで決定論にならない | `now` を 引数で受け取る (既定 `Date.now()`)。Node テストでは `FIXED_NOW = Date.parse('2026-05-30')` で 決定論的に検証 — `computeKpiTrend` / `summarizeAuditTrend` 共通パターン |
| Anthropic 拡張思考 (`thinkingBudget`) を有効化したいが Anthropic 仕様で `budget_tokens >= 1024` 必須 | `Number.isFinite(budget) && budget >= 1024` でガード、`Math.min(budget, max_tokens-1)` で クリップ。違反時は thinking フィールドを付けない (silent ignore) |
| PWA Service Worker の cache-first は 古いバージョンが残り続ける | v39 で **stale-while-revalidate** に変更: 即返却 + 裏で更新。+ GET-only / cross-origin 介入なし / ナビゲーション fallback で安全側に倒す |
| `localStorage.setItem` の Quota 超過で全データ吹き飛ぶリスク | キャッシュ系は **末尾優先 trim + 黙殺 catch** が共通パターン (`v19.orch.audit_cache` / `v19.gov.docs_cache` / `v19.journal.audit_cache` すべて同形) |
| 親子タスク (governance/16 Phase 2) を CLI で表現する自然な方法 | **新フラグなし**: `parent=<ID>` を `--start` の details 文字列に含めるだけ。free-form details + extractKey で parser 共通化 → 後方互換が自動的に保たれる |

### 4.3 依存追加 / ビルド導入の禁止 (CLAUDE.md 厳守)
- npm / pip パッケージを足さない (bash + node + python3 + 標準ツールのみ)
- ビルドステップを足さない (`python3 -m http.server 8000` で動く)
- CI を導入しない (ローカル前提)

---

## 5. INV (不変条件) ─ 全 11 件、自動テスト カバー 100% + 倫理ガード (governance/15)

| ID | 不変条件 | テスト |
|---|---|---|
| INV-1 | localOnly=true で UI から Anthropic/Google 不可視 | tests/js/test_localonly.mjs |
| INV-2 | audit.jsonl の各行が SHA-256 連鎖 (v17 から flock で並行書込安全) | tests/unit/test-audit-lib.sh |
| INV-3 | user-script (8 本) が `audit_log "*.start"` を呼ぶ | tests/unit/test-inv3-audit-start.sh |
| INV-4 | ユーザー データ削除は trash 経由 (rebuild artifacts は例外) | tests/unit/test-storage-cleanup.sh |
| INV-5 | C4 はクラウドに送信不可 | tests/unit/test-storage-archive.sh |
| INV-6 | PII commit は pre-commit hook が阻止 | tests/unit/test-hooks.sh |
| INV-8 | UI Markdown は XSS 安全 | tests/js/test_md.mjs |
| INV-9 | Anthropic SSE で input/output_tokens 両方保持 | tests/js/test_providers.mjs |
| INV-10 | audit.jsonl 改竄は audit-verify で検出 | tests/unit/test-audit-lib.sh |
| INV-11 | チーム間 handoff は orchestrate.sh 経由のみ | tests/unit/test-orchestrate.sh |
| INV-12 | 同 issue を複数チーム同時 scoped 不可 | tests/unit/test-orchestrate-kpi.sh |

**倫理ガード** (governance/15、v18 から):
- **性別 / 年齢 / 民族 / 宗教 / 性的指向 / 政治志向 / 障害有無** での感情分類 全禁止
- 推定値はユーザーに常時可視化、外部送信ゼロ
- `tests/js/test_affect.mjs` で「男性/女性 表記 で valence 差 < 0.05」を機械検証

INV-7 は GOAL-7 (バイト互換) に降格 — pwsh 不在環境では検証不能のため。

---

## 6. プロジェクト 哲学 (なぜそうなっているか)

### 6.1 なぜ静的のみ?
- 顧客情報 を扱う業務環境で、ビルド/CI 経由の SaaS リスクを排除
- 「`python3 -m http.server` だけで動く」という保証が運用者の信頼に直結
- 5 年後も同じ手順で動く (依存パッケージ の脆弱性 / 廃止 リスクなし)

### 6.2 なぜ audit.jsonl を「板」に流用?
- 新規 DB を増やすと運用負担増 / バックアップ追加 / 鍵管理 必要
- audit.jsonl はもう改竄検知 + バックアップ + 検証ツール 完備
- チーム間メッセージ も「監査が必要な活動」なので親和性高い

### 6.3 なぜ 4 チーム × 4 役?
- ドメイン責務 を 4 つに分けると業務 AI の自然なオーバーラップに収まる
- 4 役 (構想/設計/実行/査読) は **思考レイヤ** であり機能ではない → どんなチームにも適用可
- 16 ロールで「兼務禁止 / ハンドオフ強制」をしないと sub-agent が役割境界を越えてカオス化する

### 6.4 なぜ PDCA と OODA を併用?
- PDCA: 「次に何を改善するか」の計画駆動 (週次が自然)
- OODA: 「今 起きている異常への即応」(60 秒)
- 同じシステム で両方回す ─ 普段は PDCA、breach 検出で OODA に瞬間切替

### 6.5 なぜローカル LLM (Ollama) を既定?
- API キー漏洩 リスク回避 (UI から localStorage に保存 → DevTools で読める)
- C3 以上の機密 データ を扱う場面で、選択肢を物理的 (UI レベル) に消したい
- 速度・コスト の予測可能性 (オフライン / 定額)

---

## 7. 拡張パターン

### 新 INV を追加する
1. α2: governance/12 §4 INV テーブルに追加 (「守る場所」「検証」を埋める)
2. γ3: テストを `tests/unit/test-inv-XX-*.sh` に書く
3. α4: 既存 INV と矛盾しないか確認

### 新 script を追加する
1. β1: `scripts/<name>.sh` に書く
2. 冒頭で `source lib/audit.sh; audit_log "<name>.start" "args=$*"` を必ず呼ぶ
3. γ3: `tests/unit/test-<name>.sh` (assert.sh を source)
4. δ3: README の「実行可能スクリプト」節に 1 行追加

### 新ガバナンス文書を追加する
1. δ3: `governance/<NN>_<TITLE>.md` (連番)
2. governance/README.md ナビに追加
3. CLAUDE.md ファイル構成 に反映

### 新チームを追加する (4 チーム × 4 役 を変える時)
1. α2: governance/13 を全面改訂 (4 → N チームに変更する場合は §1 から)
2. β1: scripts/teams/<name>.md を作成
3. orchestrate.sh の cmd_prompt_for に case 追加
4. tests/unit/test-orchestrate.sh に case 追加

---

## 8. 起動 / 停止

### 起動 (常駐)
```sh
# (a) Ollama を CORS 許可で起動 (ブラウザから localhost:11434 を叩くため)
OLLAMA_ORIGINS='*' ollama serve &

# (b) 静的 サーバー (どこかで)
python3 -m http.server 8000 &

# (c) v19 ダッシュボード を開く
open http://127.0.0.1:8000/v19/ui/dashboard.html

# (d) 自動監視 を バックグラウンド で
nohup bash scripts/orchestrate-watch.sh --loop 60 &
```

### 停止
```sh
pkill -f "ollama serve"
pkill -f "http.server 8000"
pkill -f "orchestrate-watch.sh --loop"
```

### crontab 化 (Linux/macOS)
```cron
# 毎朝 09:00 業務開始前 チェック
0 9 * * * cd /path/to/repo && bash scripts/preflight.sh

# 平日 10 分ごと 自動監視
*/10 9-19 * * 1-5 cd /path/to/repo && bash scripts/orchestrate-watch.sh --once

# 月初 02:00 ストレージ ルーティン (audit rotate + backup 含)
0 2 1 * * cd /path/to/repo && bash scripts/storage-orchestrator.sh --routine monthly
```

---

## 9. 過去のセッションで得た **暗黙の判断**

(未来の AI が「なぜそうなっているの?」と疑問に思いそうな選択)

- **OpenAI 未対応**: ブラウザ直叩きで CORS 403。プロキシ前提の構成は静的方針と矛盾するため切る
- **rclone crypt 採用**: ベンダーの平文閲覧を防ぐが通信メタは漏れる (mitigates not eliminates)
- **C4 を Ollama でも要承認**: ローカルでも AI 入力時点で「漏洩経路ができる」リスクあり (運用ルール上)
- **--no-verify は人間承認**: pre-commit を bypass できる経路は残す (緊急 / 開発体験) が CLAUDE.md で明文禁止
- **`audit_log "storage_health"` に `.start` がなかった → INV-3 違反 → v2 で修正**: 些細な漏れも CI なし環境では機械検証で守る
- **node_modules / 90日超ログ は trash 経由しない**: 再生成可能なので INV-4 の例外
- **bash↔PowerShell バイト互換**: `audit.ps1` に rotate 未実装 (storage-orchestrator は bash 専用なので OK)
- **テスト用 git repo は gpgsign=false**: サンドボックスで signing が壊れている
- **男女別 感情分類は受け取らない (v18)**: ユーザー要求でも APPI / EU AI Act / 科学的根拠 で抵触 → α1 が対案を出して合意
- **dashboard.js を ESM 分割しない (v19)**: 2700 行で巨大だが大型 refactor は INV を壊すリスク高 → 漸進的拡張で済ませる
- **#orchestrate / #governance の永続化 は localStorage (v20)**: IndexedDB は API が複雑、localStorage で 5MB あれば十分、storage meter で容量監視
- **`PREFLIGHT_FAST=1` は本番では使わない (v21)**: 人間が朝に走らせる preflight では curl + audit-verify の本物の結果が欲しい。テスト用フラグは本番運用に影響させない設計

---

## 10. 「次に何をするか」の標準パターン

新セッション開始時にやること:

1. `bash scripts/preflight.sh` で全 8 チェックを通す
2. `bash scripts/orchestrate-kpi.sh` で 4 KPI 確認
3. `bash scripts/orchestrate.sh --status` で板を確認 (前回の続きが見える)
4. `bash scripts/orchestrate.sh --prompt-for alpha.1` で α1 prompt を取り、§10 を確認
5. **§10 が空** なら新たな歪みを探す (このリポは現在この状態)
6. **§10 に未着手** なら最高優先を選び PDCA 起動

新たな歪みの探し方:
- `tests/smoke-test.sh` で全合格を確認 (どれか falling は即 OODA)
- `audit-verify.sh` で改竄なし
- `governance/12 §5` 失敗モード を見て「カバー状態」が ⚠️ の項目を改善候補に

---

## 11. 1 サイクル完遂 の DoD (Definition of Done)

| 項目 | 確認 |
|---|---|
| smoke-test 通過 | `bash tests/smoke-test.sh` exit 0 |
| audit-verify 通過 | `bash scripts/audit-verify.sh` exit 0 |
| INV カバレッジ 維持 | `bash scripts/orchestrate-kpi.sh` で α が 100% |
| INV-12 違反なし | `bash scripts/orchestrate-kpi.sh --check` で OK |
| 設計図 反映 | `governance/12_SYSTEM_DESIGN.md` の §10 と §11 が更新済 |
| Snapshot | `governance/design-iterations/v{N+1}.md` 存在 |
| commit + push | リモートで `gh pr view` で見える |

---

## 11.5. v18-v40 で追加された 主要機能 (新セッションが知るべき)

### v18 (governance/15) — affect-aware adaptive chat (gender-blind)
- 4 次元 PAD-like (valence/arousal/urgency/formality) を heuristic 推定
- 設定 → 「🎭 感情適応モード」を ON で起動 (既定 OFF)
- 性別/年齢/民族 等での分類は実装上 禁止、テスト で機械検証
- 関連: `modules/affect.js` (v29 で抽出)、`tests/js/test_affect.mjs`

### v19 — v19 統合 ダッシュボード
- ナビ に `#orchestrate` (運用) / `#governance` (文書) を追加
- 8 ルート: overview / integrations / integration-claude / orchestrate / governance / journal / audit / settings

### v20 — localStorage キャッシュ層
- `v19.orch.audit_cache` / `v19.gov.docs_cache` / `v19.journal.audit_cache` すべて 500KB 上限
- 末尾優先 trim + Quota 黙殺 catch が共通パターン (governance/14 §4.2 参照)

### v21-v25 — 性能 + 自動化
- v21: `PREFLIGHT_FAST=1` で smoke 1m48s → 48s (2.2x)
- v22-v23: knowledge / README drift sniff (governance/12 と一致を機械検証)
- v24: `orchestrate.sh --auto bootstrap|pdca|ooda|monitor` 半自動モード
- v25: audit-verify を Python 化 → 30s → 0.05s (600x)

### v26-v30 — 品質 + モジュール化 始動
- v26: regression suite (governance/14 §4.2 罠 12 件 を テスト化)
- v27-v28: 包括監査 + hook self-diagnosis (preflight 8 ステップ)
- v29-v30: 最初の ESM 抽出 (`affect.js` / `audit-browser.js` / `markdown.js`) — INV-8 (XSS) を独立 セキュリティ境界に

### v31-v32 — 業務継続性
- governance/16 + `scripts/work-journal.sh` (8 イベント: start/decision/comm/artifact/block/resume/handoff/complete)
- audit.jsonl に `work.task.*` プレフィックスで統合 → INV-2/INV-10 を継承
- Resilience テスト 15 件 (A 監査異常 5 / B 権限 3 / C 入力 4 / D work-journal 3)

### v33 — 設計図 全面書直し
- governance/12 を 16 章 構造 に再編 (集大成版)
- TL;DR / 5 哲学 / L1-L8 / INV / 信頼境界 / 7 データフロー / 15 Resilience / 6 テスト / 16 ガバナンス / Phase 進化 / Open issues / INDEX
- 30 分で全体像 把握できる ブートストラップ 化

### v34-v35 — `#journal` UI ルート + DSL
- v34: `#journal` ルート 実装 (`modules/journal.js` + 状態色 + キャッシュ + 55 unit tests)
- v35: 横断検索 DSL (`state:` / `stakeholder:` / `id:` / `parent:` / `deadline<` / `deadline>` / `has:`) + UI 例 chip

### v36-v37 — Phase 9 モジュール 集大成 (dashboard.js 2620 → 2098 行)
- v36: `modules/orchestrate.js` (KPI + INV-12 + board + OODA, 48 tests) + `modules/providers.js` (3 sender + ProviderError + content helpers, 57 tests)
- v37: `modules/sessions.js` (会話セッション ライフサイクル, 46 tests) + `modules/audit-viewer.js` (#audit 純粋分析層, 52 tests)
- **L6 UI 8 モジュール構成 完成**: markdown / audit-browser / affect / journal / orchestrate / providers / sessions / audit-viewer
- INV-2/INV-10 (audit chain) は audit-viewer.js の `verifyAuditChain` に集約 (sha256 / reconstructBody は audit-browser.js から関数注入で循環参照回避)

### v38 — Phase 10 UX 統合
- `computeKpiTrend(events, windowDays, now)` — 7d/30d/全期間 切替 (now 注入で決定論)
- ARIA 強化: `aria-current="page"` / `aria-live="polite"` / `role="listitem"` / `aria-describedby`
- `#journal` DSL 例 6 chip (進行中 / ブロック / 引継ぎ待ち / 成果物あり / 意思決定あり / クリア)

### v39 — 観測性 + オフライン強化
- Anthropic 拡張思考: `thinking_delta` SSE → 別 callback (`onThinking`) + `thinkingBudget >= 1024` で 自動有効化
- 監査ログ トレンド: `summarizeAuditTrend(entries, days, now)` で `#audit` も 7d/30d/全期間 切替
- PWA SW v3: cache-first → **stale-while-revalidate** (GET-only / cross-origin 介入なし / ナビゲーション fallback)

### v40 — Phase 11 業務階層 (governance/16 Phase 2)
- 親子タスク: `parent=<ID>` を `--start` の details に含めるだけ (CLI 新フラグなし、後方互換)
- `tasksToTree(map | array)` 純粋関数 — 親不在子は ルート 昇格 + `isOrphan` マーク
- DSL `parent:<ID>|none|any` 拡張、UI 8 chip + ネスト描画 (.journal-children + .is-child + depth クラス)

## 12. 累積で学んだ「やってよかった」こと

### 初期 (v1-v17)
- **設計を反復で書く**: 1 発で完璧を目指さず、解析 → 修正のループ
- **板を audit.jsonl に流用**: 新規 DB なし、改竄検知 もタダで付いてくる
- **テストは依存ゼロ**: bash + node + python3 だけで動く制約が長寿命を保証
- **失敗モードを honest に書く**: 「保証する」と「保証しない」の表を分けることでオーバー セルを防ぐ
- **`incident.detected` に統一**: watcher / preflight / pre-commit すべて同じイベント型 → handler 共通化

### 中期 (v18-v33)
- **gender-blind affect 設計** (governance/15): 性別/年齢推定を 設計レベル で禁止 → APPI/EU AI Act 準拠が自然に達成
- **drift sniff (knowledge / README)**: 「設計図 と 文書が乖離していないか」を **テスト** で機械検証 → 文書腐敗を防ぐ
- **work-journal を audit.jsonl に統合**: 新規 ストレージなし、INV-2/10 を 自動継承
- **Resilience テスト 15 件**: 「業務記録が止まらない」 を機械検証 (governance/16 の哲学を テスト化)
- **設計図 全面書直し (v33)**: 既存 32 反復 を 16 章 30 分把握 に再編 → 新セッションの ramp-up コスト 激減

### モジュール化期 (v34-v40)
- **純粋ロジック を 純粋ロジック として 抽出**: DOM 非依存 = Node から 直接 import + テスト可能。`journal.js` のパターンが他 7 モジュールの 雛形 に
- **依存逆転で 循環参照 回避**: `audit-viewer#verifyAuditChain({sha256Hex, reconstructBody})` は audit-browser.js の関数を **引数注入** で受ける → モジュール間に 静的依存ゼロ で INV-2 境界 が単一実装
- **drift sniff を モジュール抽出 と 同 commit で 更新**: 旧テストが dashboard.js から symbol を grab するため、抽出と テスト読み元 の切替を 同時に PR に乗せないと 必ず壊れる (経験則)
- **`now` の引数化で 時間依存 を 決定論 に**: `computeKpiTrend(events, windowDays, now=Date.now())` のパターン。テストで `FIXED_NOW` を渡せば 流れる時間を凍結できる — 同パターンを `summarizeAuditTrend` でも踏襲
- **CLI 新フラグなしで 機能追加** (v40 親子タスク): `parent=<ID>` を 既存 `details` 文字列 に詰めるだけ → 後方互換 が **書く前から** 保証される。「拡張点 を free-form に保つ」 設計の威力

---

## 13. このドキュメント自身の更新方針

新しいサイクル を回したら、本文書も更新する:
- §4 の罠リストに新しい学びを追加
- §9 暗黙の判断 に新しい選択を追記
- §3 の チート シートに新コマンドを追加

`governance/12_SYSTEM_DESIGN.md` が「設計の体系」なら、本文書は「**運用の知恵**」。
体系は静的、知恵は動的。

---

⚠️ **新セッション ようこそ**: 上記を読み終わったら、まず `bash scripts/preflight.sh` を実行して、現在の状態を把握してください。何かする前に **まず板を見る** が鉄則です。
