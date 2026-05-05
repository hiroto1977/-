# tests/

このディレクトリは、リポジトリ内のスクリプトと UI ロジックを検証するための
**軽量・依存なし** のテスト ハーネスです。`npm` も `pytest` も不要で、
`bash` と `node` (任意) と `python3` だけで動きます。

## ディレクトリ構成

```
tests/
├── smoke-test.sh           # 統合ランナー (これを呼ぶだけで全部回る)
├── lib/
│   └── assert.sh           # 共通アサーション (assert_eq / assert_contains / ...)
├── fixtures/
│   ├── pii-positive.txt    # PII 検出を期待するダミーデータ
│   └── pii-negative.txt    # 検出されてはいけないクリーン テキスト
├── unit/                   # Bash スクリプト 単体テスト
│   ├── test-pii-scan.sh
│   ├── test-audit-lib.sh
│   ├── test-storage-cleanup.sh
│   ├── test-storage-health.sh
│   ├── test-storage-archive.sh
│   ├── test-funding-deadline.sh
│   ├── test-preflight.sh
│   └── test-hooks.sh
├── js/                     # ブラウザ JS の単体テスト (Node.js vm 経由)
│   ├── test_localonly.mjs
│   ├── test_providers.mjs
│   ├── test_sessions.mjs
│   ├── test_md.mjs
│   ├── test_presets.mjs
│   └── test_images.mjs
└── ps/
    └── structural-check.sh # PowerShell 構造チェック (Linux で動く)
```

## 実行方法

### 全部まとめて

```sh
bash tests/smoke-test.sh
```

`exit 0` なら全合格、`exit 1` で何か失敗。

### 部分的に

```sh
bash tests/smoke-test.sh unit   # Bash 単体テストのみ
bash tests/smoke-test.sh js     # JS 単体テストのみ
bash tests/smoke-test.sh ps     # PowerShell 構造チェックのみ
```

### 個別に

```sh
bash tests/unit/test-pii-scan.sh
node  tests/js/test_localonly.mjs
bash tests/ps/structural-check.sh
```

## 何をテストしているか

| 領域 | テスト | 検証内容 |
|---|---|---|
| PII | `test-pii-scan.sh` | 17 パターンが正例で検出され、負例で誤検出しない |
| 監査ログ | `test-audit-lib.sh` | SHA-256 チェーン整合 / 改竄検出 / `AUDIT_LOG_OFF` |
| ストレージ | `test-storage-cleanup.sh` | dry-run 既定 / `--apply` で trash に退避 / `--restore` で復元 |
| ストレージ | `test-storage-health.sh` | 概要表示 / `--json` 出力 / 大型ファイル列挙 |
| ストレージ | `test-storage-archive.sh` | `--setup` 案内 / rclone 不在時の案内 / C4 拒否 |
| 資金 | `test-funding-deadline.sh` | CSV 雛形 / 期限分類 (急ぎ/注意/余裕あり) / exit 1 |
| 起動前 | `test-preflight.sh` | 7 チェック セクション / Score 行 |
| Git フック | `test-hooks.sh` | install/status/uninstall サイクル / PII 阻止 / クリーン許可 / `--no-verify` 回避 |
| UI | `test_localonly.mjs` | ローカル専用モードの可視性と active 強制 |
| UI | `test_providers.mjs` | 3 プロバイダ (Ollama/Anthropic/Google) の挙動 |
| UI | `test_sessions.mjs` | セッション CRUD と LRU |
| UI | `test_md.mjs` | Markdown レンダラ (コードブロック / リスト / リンク) |
| UI | `test_presets.mjs` | 8 プリセット プロンプト の適用 |
| UI | `test_images.mjs` | 画像入力 (Vision モデル) のメッセージ生成 |
| Win | `structural-check.sh` | ブレース/括弧バランス / `[CmdletBinding()]` / `.SYNOPSIS` |

## 設計方針

- **静的・依存なし**: `tests/` を含めて npm モジュールは追加しない
- **副作用ゼロ**: 各テストは `mktemp -d` を使い `$HOME` を一時上書き
- **CI なし、ローカル前提**: GitHub Actions のための変更はしない
- **失敗は早期表示**: `assert_*` が失敗した時点で何を期待し何が来たかを出す
- **環境依存テストはスキップ**: `rclone` 未導入なら C4 拒否テストはスキップ

## 新しいテストの追加

1. `tests/unit/test-<対象>.sh` を作成
2. ヘッダで `source "$SCRIPT_DIR/../lib/assert.sh"`
3. `t_xxx()` 関数を作り `run_test "説明" t_xxx` で呼ぶ
4. 末尾に `report` を呼ぶ
5. `tests/smoke-test.sh` は自動で拾う (パターン: `unit/test-*.sh`)

## 注意

- このリポジトリは **静的・ビルド不要** が原則。テストを足してもこの原則は変えないこと
- テスト ファイル自体は **コミットする** (CLAUDE.md の「テスト ファイルはコミットしない」は `/tmp/test_*.mjs` のような揮発的な探索テストを指す)
