# Obsidian + Docker + GitHub 連携セットアップ / 業務効率化の仕組み化

Linux 上に **Obsidian (ローカル知識ベース)** と **Docker (コンテナ基盤)** を置き、
**GitHub と連携してセキュリティを強化**したうえで、両者の機能をフル活用して
**業務効率化を仕組み化**するためのランブック。Service Hub のダッシュボードには
`Obsidian` / `Docker` の 2 サービスページ (`分析・ツール` カテゴリ) が対応し、
本書の運用状態 (同期・脆弱性・自動化) を 1 画面で可視化する。

> スクリプトは実機 (ユーザーの Linux) 上での実行を想定。CI では構文・strict-mode のみ検査する。
> 破壊的操作は行わず、未導入のものは導入手順を提示して安全側に倒す設計。

## 全体像

```
GitHub (private repo / GHCR / Actions)
   ├── business-vault (Obsidian Vault を git 管理: 履歴・復元・署名)
   └── service-hub イメージ (GitHub Actions で build → GHCR へ push → Trivy スキャン)
Linux ホスト
   ├── Obsidian … ~/vaults/BusinessVault (Markdown) を暗号化ディスク上に配置
   └── Docker  … rootless デーモン + compose スタック (アプリ/DB/キャッシュ)
```

## 1. セットアップ (冪等スクリプト)

```bash
# まずは dry-run で行う操作を確認
bash scripts/setup-obsidian-docker.sh \
  --vault ~/vaults/BusinessVault \
  --remote git@github.com:USER/business-vault.git \
  --rootless --dry-run

# 問題なければ本実行
bash scripts/setup-obsidian-docker.sh \
  --vault ~/vaults/BusinessVault \
  --remote git@github.com:USER/business-vault.git \
  --rootless
```

行う内容:

1. **Docker** … 導入確認 (rootless 推奨) + イメージ脆弱性スキャナ Trivy の確認。
2. **Obsidian Vault** … `git init` → `.gitignore` 整備 (`.obsidian/workspace*.json` / `.env` / `*.secret` 等を除外) → GitHub プライベートリポジトリの `origin` 設定。
3. **セキュリティ** … コミット署名 (GPG/SSH) の確認、`gitleaks` の pre-commit hook 設置 (機密情報の混入防止)。
4. **自動化の雛形** … Vault の自動コミット & push、Docker ボリュームの暗号化バックアップの設定例を提示。

## 2. セキュリティ自己点検

```bash
bash scripts/security-audit.sh --vault ~/vaults/BusinessVault
```

- git コミット署名 (`commit.gpgsign`) の有効化 → GitHub 上で **Verified** 表示。
- `gitleaks` pre-commit hook の有無 → Vault への秘密情報混入を防止。
- Docker **rootless** モードの稼働 → 権限昇格リスクの低減。
- **Trivy** によるイメージ脆弱性スキャン → `CRITICAL`/`HIGH` をリリースゲートに。
- GitHub リモート (private 前提) → 履歴・復元・第三者レビュー。

GitHub 側では **Secret scanning / Dependabot / 署名付きコミットの必須化 (branch protection)** を
併用し、ローカルとリモートの双方で多層防御する。

## 3. 業務効率化の仕組み化

### Obsidian (ナレッジ)
- **デイリーノート自動生成** (Templater) — 当日のタスク・議題を定型生成。
- **会議議事録テンプレート** — 議題/決定事項/ToDo を定型化し転記コストを削減。
- **Obsidian Git** — 一定間隔で自動 commit & push しチーム間で共有。
- **MOC / バックリンク** — タグと地図ノートで社内ナレッジを横断検索可能化。

### Docker (実行基盤)
- **`docker compose up`** — アプリ・DB・キャッシュを再現性高く一括起動。
- **GitHub Actions → GHCR** — `main` への push でイメージを自動 build & push。
- **ボリューム自動バックアップ** — cron コンテナで永続データを暗号化バックアップ。
- **本番デプロイの手動承認** — タグ付けリリースは人手レビューを挟み誤デプロイを防止。

## 4. ダッシュボードでの可視化

Service Hub の `Obsidian` / `Docker` ページが、上記運用の状態
(Vault 同期・暗号化・自動化率、コンテナ稼働・イメージ脆弱性・セキュリティ達成状況) を
スナップショットとして表示する。実 Vault / 実 Engine 統計の live 取得 (fs / Docker socket) は
Phase 6 で実装予定で、現状は `src/renderer/data/snapshot.ts` のサンプルデータを描画する。

関連実装: `src/main/clients/obsidian.ts` / `src/main/clients/docker.ts` /
`src/renderer/pages/ObsidianPage.tsx` / `src/renderer/pages/DockerPage.tsx`。
