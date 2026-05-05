# ローカルファースト業務運用 ガバナンス

「個人/小規模事業者が、機微情報を含む業務をローカル環境（または最小限のクラウド）で安全・合法に進めるための仕組みとルール」を定義する。

## ⚠️ 法的免責

本ドキュメント群は **2026 年現在の公知情報** に基づく一般的な整理である。法律の具体的適用・解釈は **必ず弁護士・社労士・税理士・行政書士等の有資格専門家** に確認すること。記載内容に基づく一切の損害について本リポジトリ著者は責任を負わない。

## なぜローカル ファーストか

| リスク | クラウド AI 利用時の論点 |
|---|---|
| **個人情報の外部送信** | 個人情報保護法 (APPI) の第三者提供／越境移転規制への抵触可能性 |
| **営業秘密の漏えい** | 不正競争防止法上の「秘密管理性」要件不充足のリスク |
| **NDA 違反** | 委託元との秘密保持契約に AI 利用が抵触する可能性 |
| **学習目的での再利用** | プロンプト・添付物が学習データに混入するリスク (各社 opt-out 対応がまちまち) |
| **越境移転** | 米国・EU・他の事業者経由で越境した場合の本人同意・基準適合性確認義務 |
| **アカウント停止リスク** | 単一ベンダ依存による業務継続性の毀損 |

ローカル LLM (Ollama 等) を一次線として、**「秘密度の高いデータがクラウドに出ない」状態を既定値にする** ことで上記リスクの大半が消える。

## 5 つの原則

1. **既定はローカル** — 全タスクをまずローカルで処理可能か検討する
2. **データを分類してから道具を選ぶ** — 直感ではなく `02_DATA_CLASSIFICATION.md` のマトリクスで判断
3. **入れる前に確認、出す前に確認** — 入力時はマスキング、出力時は再レビュー
4. **記録を残す** — どのデータを誰がいつどのツールに入れたか追跡可能に
5. **失敗を前提に運用** — インシデント対応手順を平時に準備

## ナビゲーション

| ファイル | 内容 | 想定読者 |
|---|---|---|
| [`01_LEGAL_FRAMEWORK.md`](01_LEGAL_FRAMEWORK.md) | 関連する日本法と業界ガイドラインの整理 | 経営者・管理者 |
| [`02_DATA_CLASSIFICATION.md`](02_DATA_CLASSIFICATION.md) | 5 段階データ分類と取り扱いマトリクス | 全員（最初に読む） |
| [`03_OPERATIONS.md`](03_OPERATIONS.md) | 日常運用ルール・インシデント対応 | 全員 |
| [`04_VENDOR_REVIEW.md`](04_VENDOR_REVIEW.md) | クラウド AI ベンダ評価チェックリスト | 経営者・調達担当 |
| [`05_TEMPLATES.md`](05_TEMPLATES.md) | プロンプト・チェックリストのテンプレ集 | 実務担当者 |
| [`06_ONBOARDING.md`](06_ONBOARDING.md) | 新メンバー オンボーディング手順 | 全員 |
| [`07_PROFESSIONAL_RULES.md`](07_PROFESSIONAL_RULES.md) | 14 士業別 AI 利用ルール とスキーム | 該当士業者 |
| [`08_ATTACK_CATALOG.md`](08_ATTACK_CATALOG.md) | 30+ 攻撃シナリオ (MITRE ATT&CK 紐付) | 経営者・管理者 |
| [`09_INCIDENT_PLAYBOOK.md`](09_INCIDENT_PLAYBOOK.md) | 8 シナリオ × 5 ステップの IR プレイブック | 全員 |
| [`10_STORAGE_HYGIENE.md`](10_STORAGE_HYGIENE.md) | ストレージ衛生 — クラス別保存先・ライフサイクル・ルーティン | 全員 |
| [`11_PLATFORM_NOTES.md`](11_PLATFORM_NOTES.md) | Win/Mac/Linux 個別手順 (BitLocker/FileVault/LUKS, 定期実行) | 環境構築担当 |
| [`../CLAUDE.md`](../CLAUDE.md) | AI 支援者（Claude Code 等）が従うルール | AI 自身 |
| [`../scripts/preflight.sh`](../scripts/preflight.sh) | 業務開始前の自動チェック | 実行可能 |
| [`../scripts/pii-scan.sh`](../scripts/pii-scan.sh) | ファイルから PII 検出 (16 種パターン) | 実行可能 |
| [`../scripts/funding-deadline.sh`](../scripts/funding-deadline.sh) | 補助金/助成金/融資 期限ダッシュボード | 実行可能 |
| [`../scripts/storage-health.sh`](../scripts/storage-health.sh) | ストレージ健康診断 | 実行可能 |
| [`../scripts/storage-cleanup.sh`](../scripts/storage-cleanup.sh) | trash-first 安全削除 (`--restore`/`--purge-trash`) | 実行可能 |
| [`../scripts/storage-archive.sh`](../scripts/storage-archive.sh) | rclone でクラス別アーカイブ | 実行可能 |
| [`../scripts/storage-orchestrator.sh`](../scripts/storage-orchestrator.sh) | health→cleanup→archive オーケストレータ | 実行可能 |
| [`../scripts/audit-verify.sh`](../scripts/audit-verify.sh) | 監査ログの SHA-256 連鎖検証 (改竄検知) | 実行可能 |
| [`../scripts/lib/audit.sh`](../scripts/lib/audit.sh) | 監査ログ ライブラリ (各スクリプトが source) | source 用 |
| [`../scripts/win/`](../scripts/win/) | Windows 用 PowerShell スクリプト (preflight / BitLocker / Defender / Scheduled Task / WSL) | Win 環境 |

## このガバナンスの守備範囲

| カバーする | カバーしない |
|---|---|
| 個人 〜 小規模事業者 (社員 50 名程度まで) | 大企業の IT 統制 (ISO27001/SOC2 等の正式な証跡管理は別途必要) |
| AI 活用に伴う情報セキュリティ・コンプライアンス | 一般的な情報セキュリティ全般 (物理セキュリティ・パッチ管理等) |
| 日本法を一次の参照 | EU/US 法は概要のみ言及 |
| 2026 年時点の枠組み | 法改正・新ガイドラインへの追従はユーザーの責任 |

## 改定履歴

- 2026-05: 初版（本リポジトリ PR #1 と同時公開）
