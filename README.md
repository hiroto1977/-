# 業務向け Web ツールセット

ビルド不要・完全静的・プライバシー優先の Web アプリ集。
2 つの独立したシステムを同梱しています。

| パス | 内容 |
|---|---|
| **`/desktop/`** | みんなのデスクトップ — 6 つの業務アプリ統合（タスク / メモ / カレンダー / 電卓 / 連絡先 / タイマー） |
| **`/v19/ui/`** | v19 ダッシュボード — **7 ルート 統合** UI (overview / integrations / **integration-claude** / **orchestrate** / **governance** / audit / settings)。3 AI プロバイダ + ローカル専用モード + 感情適応モード + ブラウザ audit + ストレージメーター |
| **`/cowork/`** | ローカル AI と Chat する最短ルート（CLI + 自動起動スクリプト） |
| **`/governance/`** | ローカルファースト業務運用のガバナンス文書群 16 本（法制度・データ分類・運用・士業別ルール・**統合システム設計図 (27 反復)**・**チーム オーケストレーション (4 × 4)**・**ブートストラップ知識**・**感情倫理ガード** 他） |
| **`/funding/`** | 経営戦略 × 資金調達（補助金・助成金・公庫融資・民間融資）フレームワーク + 9 プログラム別チェックリスト |
| **`/templates/`** | 汎用業務テンプレ集（人事 / 法務 / オペ / 営業 / 危機 / マーケ / 財務） |
| **`/scripts/`** | 21 本 — preflight / PII 検出 / ストレージ衛生 / 監査 / **L8 オーケストレーション (orchestrate / orchestrate-watch / orchestrate-kpi)** / 4 チーム ブリーフ / PDCA・OODA サイクル定義 |
| **`/scripts/win/`** | Windows PowerShell 6 本 (preflight / BitLocker / Defender / Task / WSL2 / audit) |
| **`/tests/`** | 24 ファイル / 200+ テスト (smoke-test ~48s) — bash unit / browser JS (Node vm) / PowerShell 構造 / cross-OS integration |
| **`/CLAUDE.md`** | AI 支援者（Claude Code 等）が従うルール |
| **`/LOCAL_LLM_GUIDE.md`** | Claude Code を含む全コミュニケーションをローカル LLM 化する選択肢 (A/B/C) |

## 起動

```bash
python3 -m http.server 8000   # リポジトリ ルートで実行
```

- みんなのデスクトップ: <http://127.0.0.1:8000/desktop/index.html>
- v19 ダッシュボード:    <http://127.0.0.1:8000/v19/ui/dashboard.html>
- Claude 連携画面に直接: <http://127.0.0.1:8000/v19/ui/dashboard.html#integration-claude>

両方とも純粋な HTML/CSS/JS のため、Nginx / Apache / S3 / GitHub Pages / Cloudflare Pages などの静的ホスティングへそのまま配置できます。

---

## 1. みんなのデスクトップ (`desktop/`)

PC 初心者から大企業の実務者まで、誰でも安心して使える業務用デスクトップ。

### 特徴
- **完全オフライン動作** — データは端末内のみ。インターネット送信なし
- **PWA 対応** — Service Worker でオフライン動作 / ホーム画面に追加可能
- **アクセシビリティ最優先** — 高コントラストテーマ、特大文字、キーボード操作、ARIA 対応
- **3 テーマ × 4 文字サイズ × 2 密度** の組み合わせ

### 同梱アプリ

| アプリ | 用途 |
|---|---|
| ✅ やること | タスク・ToDo 管理 |
| 📝 メモ | 自由なメモ帳（自動保存） |
| 📅 カレンダー | 予定とイベント管理 |
| 🧮 電卓 | 計算履歴プレビュー付き |
| 👥 連絡先 | 住所録・電話帳 |
| ⏱️ タイマー | タイマー＆ストップウォッチ |

### キーボードショートカット
| 操作 | キー |
|---|---|
| ホームへ戻る | `Esc` |
| ヘルプを開く | `F1` |
| 設定を開く | `Ctrl` + `,` |
| 新規追加（各アプリ） | `Ctrl` + `N` |

データは `localStorage`（5〜10 MB 目安）。設定からバックアップを JSON 書き出し / 復元できます。

---

## 2. v19 ダッシュボード (`v19/ui/`)

複数の AI プロバイダを切り替えながら使える対話コンソール。**API キー / プロンプト / 履歴は全てブラウザ内に閉じます**（中継サーバーなし）。

### 対応プロバイダ

| プロバイダ | 認証 | 既定モデル | CORS | 備考 |
|---|---|---|---|---|
| 🏠 **Ollama (ローカル)** | 不要 | `llama3.2` | — | **既定**。事前に `OLLAMA_ORIGINS=* ollama serve` |
| 🤖 Anthropic Claude | API キー | `claude-opus-4-7` | ✅ 直接通信 | 有償・最高品質 |
| ✨ Google Gemini | API キー | `gemini-2.5-flash` | ✅ 直接通信 | 無料枠あり |

OpenAI はブラウザ直叩きを禁じる CORS 設定（403）のため、現状未対応。プロキシ経由か、ローカルの Ollama 経由で互換モデルをご利用ください。

### 機能

- **マルチセッション**: ブラウザのタブ風 UI で複数の独立した会話を保持。タイトル自動生成 + ダブルクリックでリネーム
- **8 種のプロンプトプリセット**: 翻訳 / 要約 / 校正 / コードレビュー / コード解説 / ビジネスメール / ブレスト / 議事録整形
- **画像入力 (Vision)**: 📎 ボタン / クリップボード貼り付け / ドラッグ&ドロップ。複数枚（最大 5）対応。長辺 1568px に自動ダウンスケール
- **ストリーミング応答**: SSE / NDJSON を解析しトークン単位で表示。停止ボタンで中断可
- **Markdown 描画**: コードブロック（コピーボタン付）・箇条書き・見出し・リンク。XSS 安全
- **3 テーマ**: ライト / ダーク / 高コントラスト
- **完全クライアント側永続化**: チャット履歴・設定はブラウザに保存。書き出し / 全消去あり

### Ollama (ローカル LLM) の最短手順

```bash
# 1. インストール
curl -fsSL https://ollama.com/install.sh | sh

# 2. ブラウザからの呼び出しを許可しつつ起動
OLLAMA_ORIGINS='*' ollama serve

# 3. 使うモデルを取得
ollama pull llama3.2                  # 軽量・テキスト用
ollama pull llama3.2-vision           # 画像入力対応
```

ブラウザで v19 ダッシュボードを開き、プロバイダ「🏠 Ollama (ローカル)」が選択された状態で送信してください。

### 🔒 ローカル専用モード

設定 → プライバシー → 「ローカル専用モード」をオンにすると、Anthropic / Google のプロバイダが UI から消え、Ollama のみが選択可能になります。機密データを扱う場面で、誤ってクラウド API へ送信するのを防げます。

### Claude Code 自体をローカル LLM 化したい場合

「ブラウザでの対話」ではなく **Claude Code CLI そのもの** をローカル LLM で動かしたい・あるいは Claude Code 以外の代替 (Aider / Continue / gptme / opencode 等) を使いたい場合は、[**LOCAL_LLM_GUIDE.md**](LOCAL_LLM_GUIDE.md) に 3 系統の選択肢と実践手順をまとめています。

### ファイル構成

```
v19/ui/
├── dashboard.html      # エントリポイント
├── dashboard.css       # スタイル（テーマ含む）
└── dashboard.js        # アプリ本体（ESモジュール）
```

### データ保存とプライバシー

- すべて `localStorage` に保存（API キー / 履歴 / 添付画像のサムネイル）
- 「保存しない」を選ぶとプロバイダ別に API キーをセッション中だけ保持
- 設定 → 全データ削除 で完全クリア
- 通信: **ユーザーが選んだプロバイダの API エンドポイント以外には何も送信しません**

### テスト

ヘッドレスでロジックを検証する単体テスト (`tests/`) が付属（API キー不要）:

```bash
bash tests/smoke-test.sh           # 全部 (Bash + JS + PowerShell 構造)
bash tests/smoke-test.sh js        # ブラウザ JS のみ
bash tests/smoke-test.sh unit      # シェル スクリプト 単体テスト
```

検証内容: プロバイダ別リクエスト形状 / SSE・NDJSON ストリーム解析 / セッション分離 / プリセット解決 / Markdown 描画 + XSS / 画像マーシャリング / PII 検出 / 監査ログ チェーン整合 / ストレージ trash-first / 期限分類。詳細は [`tests/README.md`](tests/README.md)。

---

## ローカル AI Chat の最短起動 (`cowork/`)

ご自身の PC で **3 通りの方法** でローカル LLM と即対話できます。

```bash
# A. ターミナルだけで対話 (1 コマンド)
python3 cowork/local-chat-cli.py

# B. ブラウザで GUI 対話
python3 -m http.server 8000
# → http://127.0.0.1:8000/v19/ui/dashboard.html

# C. 全部自動で立ち上げる (Ollama 確認 + サーバー + ブラウザ + CLI)
bash cowork/local-cowork.sh
```

CLI の機能: マルチターン履歴、`/model` でモデル切替、`/system` でプロンプト変更、`/save` で Markdown 保存、`/usage` でトークン使用量。詳細は [`cowork/README.md`](cowork/README.md)。

## 経営戦略 × 資金調達 (`funding/`)

補助金・助成金・公庫融資・民間融資 を **戦略的に組み合わせる** ためのフレームワーク + テンプレ + チェックリスト。

| ファイル | 内容 |
|---|---|
| [`funding/README.md`](funding/README.md) | 哲学 + 5 つの原則 + 4 種の資金調達 早見表 |
| [`funding/01_LANDSCAPE.md`](funding/01_LANDSCAPE.md) | 補助金 / 助成金 / 公庫 / 民間 の本質的違い |
| [`funding/02_DECISION.md`](funding/02_DECISION.md) | 状況別 10 ケースの判断フロー + 自己診断 12 問 |
| [`funding/03_PROGRAMS.md`](funding/03_PROGRAMS.md) | 主要プログラム カタログ (補助金 / 助成金 / 公庫 / 民間) |
| [`funding/04_APPLICATION.md`](funding/04_APPLICATION.md) | 申請ライフサイクル + リスク チェックリスト |
| [`funding/05_BUSINESS_PLAN.md`](funding/05_BUSINESS_PLAN.md) | 事業計画書 ひな形 (15 セクション) |
| [`funding/06_FINANCIAL_MODEL.md`](funding/06_FINANCIAL_MODEL.md) | 財務モデル (3〜5 年) シート構成 + KPI |
| [`funding/07_AI_PROMPTS.md`](funding/07_AI_PROMPTS.md) | 申請書ドラフト用 AI プロンプト 12 種 |
| [`funding/checklists/`](funding/checklists/) | 9 プログラム別 チェックリスト (ものづくり / 持続化 / IT 導入 / 事業承継 / 公庫国民 / 公庫中小 / 民間融資 / キャリアアップ / 雇用調整) |
| [`funding/docs/`](funding/docs/) | 公庫面談 自己紹介 / 銀行面談 アジェンダ / 不採択 振り返り / 経営者保証解除 申請 |

## 汎用業務テンプレ (`templates/`)

| サブディレクトリ | 内容 |
|---|---|
| [`templates/hr/`](templates/hr/) | 求人票 / 面接シート / 雇用契約書 / 1on1 シート |
| [`templates/legal/`](templates/legal/) | NDA / 業務委託契約 / プライバシーポリシー / 利用規約 / 特商法表記 |
| [`templates/ops/`](templates/ops/) | SOP 標準作業手順 / 月次経営レビュー / インシデント報告 |
| [`templates/sales/`](templates/sales/) | 提案書 / 見積書 / 請求書 (インボイス対応) |
| [`templates/crisis/`](templates/crisis/) | 売上急落 / 取引先倒産 / SNS 炎上 |
| [`templates/marketing/`](templates/marketing/) | プレスリリース |
| [`templates/finance/`](templates/finance/) | 24 ヶ月 資金繰り表 |

詳細は [`templates/README.md`](templates/README.md)。

## ガバナンス文書 (`governance/`)

業務で AI を使う際のルールと仕組みを言語化。日本法 + 士業別 + 実務テンプレ。

| ファイル | 内容 |
|---|---|
| [`governance/README.md`](governance/README.md) | 哲学・ナビゲーション・5 つの原則 |
| [`governance/01_LEGAL_FRAMEWORK.md`](governance/01_LEGAL_FRAMEWORK.md) | 関連する日本法 (APPI / マイナンバー / 不正競争防止 / 著作権 / 労基 / 電帳 / GDPR) |
| [`governance/02_DATA_CLASSIFICATION.md`](governance/02_DATA_CLASSIFICATION.md) | 5 段階データ分類 + 取扱マトリクス + 50 ケース集 (**最初に読む**) |
| [`governance/03_OPERATIONS.md`](governance/03_OPERATIONS.md) | 日常運用ルール・ファイル管理・ログ・**インシデント対応 (報告期限含む)** |
| [`governance/04_VENDOR_REVIEW.md`](governance/04_VENDOR_REVIEW.md) | クラウド AI ベンダ評価チェックリスト |
| [`governance/05_TEMPLATES.md`](governance/05_TEMPLATES.md) | プロンプト・チェックリストのテンプレ集 |
| [`governance/06_ONBOARDING.md`](governance/06_ONBOARDING.md) | 新メンバー オンボーディング手順 |
| [`governance/07_PROFESSIONAL_RULES.md`](governance/07_PROFESSIONAL_RULES.md) | **士業別ルールとスキーム** (弁護士/会計士/税理士/司法書士/行政書士/社労士/弁理士/不動産鑑定士/中小企業診断士/土地家屋調査士/医師 他) |
| [`governance/08_ATTACK_CATALOG.md`](governance/08_ATTACK_CATALOG.md) | **30+ 攻撃シナリオ** (MITRE ATT&CK 紐付・各シナリオに既存対策と補強提案) |
| [`governance/09_INCIDENT_PLAYBOOK.md`](governance/09_INCIDENT_PLAYBOOK.md) | **8 シナリオ IR プレイブック** (検知→60秒対応→評価→封じ込め→復旧→学び) |
| [`governance/10_STORAGE_HYGIENE.md`](governance/10_STORAGE_HYGIENE.md) | **ストレージ衛生** — クラス別保存先 + ライフサイクル 5 段階 + 日次/週次/月次ルーティン |
| [`governance/11_PLATFORM_NOTES.md`](governance/11_PLATFORM_NOTES.md) | **プラットフォーム別手順** (BitLocker/FileVault/LUKS、Scheduled Task/launchd/systemd) |
| [`governance/12_SYSTEM_DESIGN.md`](governance/12_SYSTEM_DESIGN.md) | **統合システム設計図** (22 反復で改稿、L1-L8 層モデル / 12 INV / 失敗モード / 保証/制約) |
| [`governance/13_TEAM_ORCHESTRATION.md`](governance/13_TEAM_ORCHESTRATION.md) | **4 チーム × 4 役 + PDCA/OODA** によるオーケストレーション AI 仕組み |
| [`governance/14_SESSION_KNOWLEDGE.md`](governance/14_SESSION_KNOWLEDGE.md) | **新セッション ブートストラップ知識** (30 秒で読める落とし穴 + チートシート + 暗黙の判断) |
| [`governance/15_AFFECT_ETHICS.md`](governance/15_AFFECT_ETHICS.md) | **感情適応モード倫理ガード** (gender-blind / protected attribute 禁止 / APPI・EU AI Act 整合) |

⚠️ **法的免責**: 本ドキュメント群は一般的整理であり、解釈・適用は必ず有資格専門家へ。

### 実行可能スクリプト

```bash
bash scripts/preflight.sh                          # 業務開始前の自動チェック
bash scripts/pii-scan.sh path/to/file.txt          # ファイル内の PII 検出
bash scripts/pii-scan.sh --staged                  # git ステージ済の差分のみ
bash scripts/pii-scan.sh --diff                    # git のすべての変更
bash scripts/funding-deadline.sh                   # 補助金/助成金/融資 期限ダッシュボード
bash scripts/storage-health.sh                     # ストレージ健康診断
bash scripts/storage-cleanup.sh                    # 安全削除 (--dry-run 既定)
bash scripts/storage-archive.sh --plan             # クラス別アーカイブ計画 (rclone)
bash scripts/storage-orchestrator.sh --routine daily   # 日次 / weekly / monthly
bash scripts/storage-cleanup.sh --apply                # trash-first (~/.local/state/storage-hygiene/trash/ へ退避、30 日後 purge)
bash scripts/storage-cleanup.sh --restore              # 直近 trash バッチを元の場所に復元
bash scripts/storage-cleanup.sh --list-trash           # trash の中身一覧
bash scripts/audit-verify.sh                           # 監査ログ SHA-256 連鎖の改竄検知
bash scripts/install-hooks.sh                          # git pre-commit に PII スキャンを仕込む
bash scripts/install-hooks.sh --status                 # 現状確認 / --uninstall で取り外し
bash scripts/audit-export.sh /Volumes/USB/audit-bak    # 監査ログをオフライン媒体へ tar.gz + sha256 で書出
PREFLIGHT_FAST=1 bash scripts/preflight.sh             # テスト用 高速モード (curl + audit-verify を skip)

# L8 オーケストレーション AI (4 チーム × 4 役 + PDCA/OODA、v10 から)
bash scripts/orchestrate.sh --cycle pdca               # 通常 PDCA サイクル起動
bash scripts/orchestrate.sh --cycle ooda --trigger watch  # 異常時 OODA (60 秒対応)
bash scripts/orchestrate.sh --status                   # チーム活動 / ハンドオフ / インシデント の状態
bash scripts/orchestrate.sh --board --tail 50          # 板の直近 50 件 (audit.jsonl)
bash scripts/orchestrate.sh --prompt-for alpha.1       # sub-agent 起動用 prompt (live §10 込)
bash scripts/orchestrate.sh --propose-response audit_chain_broken  # breach → IR Playbook 自動マッピング
bash scripts/orchestrate-watch.sh --once               # 4 異常チェック (W1 audit / W2 chat.error / W3 INV-12 / W4 PII)
bash scripts/orchestrate-watch.sh --loop 60            # 60 秒ごと 自動監視 (常駐)
bash scripts/orchestrate-kpi.sh                        # 4 チーム KPI (α INV カバレッジ / β cycle 中央時間 / γ pass 率 / δ 文書鮮度)
bash scripts/orchestrate-kpi.sh --check                # INV-12 違反のみ高速チェック
bash scripts/audit-export.sh ~/Desktop/audit-bak       # 監査ログを USB 等にオフライン エクスポート
bash scripts/orchestrate.sh --cycle pdca               # オーケストレーション AI 4 チーム × 4 役 (週次)
bash scripts/orchestrate.sh --cycle ooda --trigger preflight  # 異常事態 (60 秒対応)
bash scripts/orchestrate.sh --status                   # チーム活動 / ハンドオフ / インシデント の状況
bash scripts/orchestrate.sh --prompt-for alpha.1       # 親エージェントへ sub-agent prompt を出力
```

すべてのスクリプトは `~/.claude/audit.jsonl` に実行記録を残し、`audit-verify.sh` で改竄検知できます (詳細: [`scripts/lib/audit.sh`](scripts/lib/audit.sh))。

`scripts/install-hooks.sh` を実行しておくと、commit する直前に `pii-scan.sh --staged` が走り、PII を含む commit が物理的にブロックされます。緊急回避は `git commit --no-verify` (CLAUDE.md ルール上は人間承認が前提)。月次ルーティン (`storage-orchestrator.sh --routine monthly`) では `audit.jsonl` も自動でローテーション (90 日 既定)。

**Windows 用 PowerShell スクリプト** は [`scripts/win/`](scripts/win/) — preflight / BitLocker / Defender 除外 / Scheduled Task / WSL2 セットアップ。bash 版と同じ `~/.claude/audit.jsonl` に書き込むため、ブラウザの監査ログビューア (`#audit`) で OS 横断の実行記録を可視化できます。

## ライセンス

MIT
