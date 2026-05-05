# scripts/win/ — Windows 用 PowerShell スクリプト

`governance/11_PLATFORM_NOTES.md` の Windows 向け手順を実行可能化したもの。
すべて **PowerShell 7+** 推奨 (Windows PowerShell 5.1 でも動作はする)。

## ⚠️ 共通の注意事項

- 管理者権限が必要なものは `Test-IsAdmin` で検出し、未昇格時は明確にエラー
- 状態変更を伴うコマンドは `-Apply` または `-Action Register` 等 **明示的なフラグ必須** (既定は read-only)
- 重要な操作には `-WhatIf` / `-Confirm` をサポート
- 監査ログは `lib/audit.ps1` 経由で `~/.claude/audit.jsonl` に追記
  (bash 版 `scripts/lib/audit.sh` と SHA-256 連鎖が継続)

## ファイル

| ファイル | 役割 | 管理者要否 |
|---|---|---|
| [`preflight.ps1`](preflight.ps1) | Windows 環境健全性チェック (BitLocker / WSL / git / Defender / 文書) | 一部 |
| [`bitlocker-check.ps1`](bitlocker-check.ps1) | BitLocker 状態確認 / `-Apply` で有効化 + Recovery key 表示 | `-Apply` で要 |
| [`defender-exclude.ps1`](defender-exclude.ps1) | Defender 除外パスの一覧/追加/削除 (.ollama / .npm / WSL 等) | `-Add`/`-Remove` で要 |
| [`register-storage-task.ps1`](register-storage-task.ps1) | storage-orchestrator を Task Scheduler 登録 (週次/月次) | `-Action Register` で要 |
| [`install-wsl.ps1`](install-wsl.ps1) | WSL2 + Ubuntu のインストール補助 | `-Apply` で要 |
| [`lib/audit.ps1`](lib/audit.ps1) | 監査ログ ライブラリ (`. `してから `Write-AuditLog`) | 不要 |

## 推奨セットアップ手順 (新 PC で 1 回だけ)

```powershell
# 0. PowerShell 7+ 推奨
winget install Microsoft.PowerShell

# 1. リポジトリ クローン (Windows 側に置いておく)
git clone https://github.com/hiroto1977/-.git C:\Users\$env:USERNAME\repo
cd C:\Users\$env:USERNAME\repo

# 2. 健全性チェック (read-only)
pwsh -File scripts/win/preflight.ps1

# 3. WSL2 (まだなら) — 管理者
Start-Process pwsh -Verb RunAs -ArgumentList '-File','scripts/win/install-wsl.ps1','-Apply'
# → 再起動 → Ubuntu 起動 → ユーザー作成 → cd ~/repo (WSL 側)

# 4. BitLocker 確認 / 有効化 — 管理者
Start-Process pwsh -Verb RunAs -ArgumentList '-File','scripts/win/bitlocker-check.ps1','-Apply'
# → Recovery Password が表示されたら必ず 1Password + 紙メモ + 別端末 に三重保管

# 5. Defender 除外 (パフォーマンス向上) — 管理者
Start-Process pwsh -Verb RunAs -ArgumentList '-File','scripts/win/defender-exclude.ps1','-Add'

# 6. 週次自動化 (storage-orchestrator) — 管理者
Start-Process pwsh -Verb RunAs -ArgumentList '-File','scripts/win/register-storage-task.ps1'
```

## 日常運用

```powershell
# 朝の健全性チェック (governance/03 A 節)
pwsh -File scripts/win/preflight.ps1

# Scheduled Task の動作確認
pwsh -File scripts/win/register-storage-task.ps1 -Action Status

# Defender 除外の現状
pwsh -File scripts/win/defender-exclude.ps1 -List
```

## 監査ログ確認

```powershell
# 最新 20 件
Get-Content $HOME\.claude\audit.jsonl -Tail 20

# WSL 内の bash 版検証スクリプトで連鎖検証
wsl bash ~/repo/scripts/audit-verify.sh

# または v19 ダッシュボードでブラウザ可視化
# http://127.0.0.1:8000/v19/ui/dashboard.html#audit
```

## トラブル

| 症状 | 対処 |
|---|---|
| `この実行ポリシーでは...` | `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| `Get-BitLockerVolume コマンドが見つかりません` | Windows Home エディションでは BitLocker 不可 (Pro 以上必要) |
| `wsl --install` が失敗 | Windows 10 1903+ または Windows 11 必要 / Hyper-V 機能を有効化 |
| `Add-MpPreference エラー` | 第三者 AV を入れている場合 Defender が無効化されている可能性 |
| Scheduled Task 実行されない | WSL の自動起動 / ユーザー ログイン状態 / バッテリー設定 を確認 |

## クロスプラットフォーム 一覧

| 役割 | Linux/macOS bash | Windows PowerShell |
|---|---|---|
| 業務開始前チェック | `scripts/preflight.sh` | `scripts/win/preflight.ps1` |
| 監査ログ ライブラリ | `scripts/lib/audit.sh` | `scripts/win/lib/audit.ps1` |
| 監査ログ検証 | `scripts/audit-verify.sh` | (WSL から bash 版 / ブラウザ) |
| ストレージ ヘルス | `scripts/storage-health.sh` | (WSL から bash 版) |
| ストレージ クリーンアップ | `scripts/storage-cleanup.sh` | (WSL から bash 版) |
| 定期実行登録 | systemd timer / cron / launchd | `register-storage-task.ps1` |
| ディスク暗号化 | LUKS / FileVault | `bitlocker-check.ps1` |
| AV 除外設定 | (各 AV 製品) | `defender-exclude.ps1` |
| WSL インストール | (該当なし) | `install-wsl.ps1` |

## 関連文書

- [`../../governance/11_PLATFORM_NOTES.md`](../../governance/11_PLATFORM_NOTES.md) — 各 OS 別の手順書
- [`../../governance/03_OPERATIONS.md`](../../governance/03_OPERATIONS.md) — 日常運用ルール
- [`../../governance/06_ONBOARDING.md`](../../governance/06_ONBOARDING.md) — 新メンバー オンボーディング
- [`../../governance/09_INCIDENT_PLAYBOOK.md`](../../governance/09_INCIDENT_PLAYBOOK.md) — 端末紛失等の対応 (BitLocker 前提)
