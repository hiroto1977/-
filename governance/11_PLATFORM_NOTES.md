# 11. プラットフォーム別 手順ノート

本リポジトリの bash スクリプト群は POSIX 互換 (Linux / macOS / WSL) を前提。
Windows ネイティブと macOS 固有の操作はここに集約する。

> ⚠️ ここに書かれているコマンドは AI 自動化対象外。
> ハーネスの永続化禁止規約 (`CLAUDE.md`) と物理アクセスを伴うため、**実行はユーザー本人**。

---

## A. Windows

### A-1. WSL を推奨

本リポジトリのスクリプト群を Windows で動かす最も安全な経路は **WSL2 (Ubuntu)**:

```powershell
# 管理者 PowerShell で
wsl --install -d Ubuntu
# 再起動 → Ubuntu 起動 → 通常の bash 環境
git clone https://github.com/hiroto1977/-.git ~/repo
cd ~/repo
bash scripts/preflight.sh
```

WSL を使うと governance/ の全スクリプトがそのまま動く。

### A-2. ネイティブ PowerShell で動かす場合

bash スクリプトは Git Bash / MSYS2 経由で動作するが、保証外。
**推奨: 主要操作を PowerShell で書き直す** (将来課題、現状は WSL 優先)。

### A-3. BitLocker でディスク暗号化

`02_DATA_CLASSIFICATION.md` の C2 以上は端末暗号化が前提。

```powershell
# 状態確認 (管理者 PowerShell)
manage-bde -status C:

# 有効化 (要再起動)
manage-bde -on C: -RecoveryPassword
# → Recovery key を必ず別場所 (1Password / 紙 / 別端末) に保管
```

**注意点**:
- Recovery key を紛失すると **再インストール以外復旧不能**
- 1Password / Bitwarden / 紙の三重保管推奨
- TPM の有無で動作が変わる (古い PC では BitLocker 自体使えない場合あり)

### A-4. Scheduled Task (storage-orchestrator 自動化)

```powershell
# 管理者 PowerShell
$taskName = "ClaudeStorageOrchestrator"
$action = New-ScheduledTaskAction `
  -Execute "C:\Windows\System32\wsl.exe" `
  -Argument "bash -c 'cd ~/repo && bash scripts/storage-orchestrator.sh --routine weekly --json-report >> ~/.local/state/storage-weekly.log'"

$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 9:00am

Register-ScheduledTask -TaskName $taskName `
  -Action $action -Trigger $trigger `
  -Description "毎週月曜 9:00 にストレージ衛生 ルーティン実行"

# 確認
Get-ScheduledTask -TaskName $taskName

# 削除
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
```

### A-5. Windows Defender 除外設定 (パフォーマンス向上)

`~/repo/.git/`, `node_modules/`, `~/.ollama/` などは大量 I/O が発生し、
リアルタイム保護でパフォーマンス低下。

```powershell
# 管理者 PowerShell
Add-MpPreference -ExclusionPath "C:\Users\$env:USERNAME\repo\.git"
Add-MpPreference -ExclusionPath "C:\Users\$env:USERNAME\.ollama"

# WSL 配下 (パフォーマンスが大きく改善)
Add-MpPreference -ExclusionPath "\\wsl.localhost\Ubuntu\home"
```

> ⚠️ 除外したパスはマルウェアスキャン対象外。**信頼できるディレクトリのみ**。
> `~/Downloads` は除外しない (危険)。

### A-6. PowerShell の実行ポリシー

```powershell
# 現在のポリシー確認
Get-ExecutionPolicy -List

# CurrentUser に RemoteSigned を設定 (管理者 不要)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## B. macOS

### B-1. FileVault (ディスク暗号化)

```sh
# 状態確認
fdesetup status

# 有効化 (システム設定 → プライバシーとセキュリティ → FileVault でも可)
sudo fdesetup enable
# Recovery key の選択 (Apple ID 連動 or ローカル) に注意
```

### B-2. launchd で storage-orchestrator 自動化

`~/Library/LaunchAgents/com.example.storage-orchestrator.plist` を作成:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.example.storage-orchestrator</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>cd ~/repo &amp;&amp; bash scripts/storage-orchestrator.sh --routine weekly --json-report >> ~/.local/state/storage-weekly.log</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key>
    <integer>1</integer>
    <key>Hour</key>
    <integer>9</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
</dict>
</plist>
```

```sh
# ロード
launchctl load ~/Library/LaunchAgents/com.example.storage-orchestrator.plist

# 動作確認 (即時実行)
launchctl start com.example.storage-orchestrator

# アンロード
launchctl unload ~/Library/LaunchAgents/com.example.storage-orchestrator.plist
```

### B-3. 環境変数の永続化

`~/.zshrc` または `~/.bash_profile` に:

```sh
export OLLAMA_ORIGINS='*'
export AUDIT_LOG_PATH="$HOME/.claude/audit.jsonl"
```

GUI アプリにも環境変数を渡すには:

```sh
launchctl setenv OLLAMA_ORIGINS '*'
```

### B-4. Spotlight 除外 (パフォーマンス)

システム設定 → Spotlight → プライバシー で:
- `~/repo/.git/` 等の大量小ファイル ディレクトリ
- `~/.ollama/models/` (大型モデル)
- `~/Library/Caches`

を除外 → 検索インデックス が速くなる + バッテリー消費 軽減。

---

## C. Linux (Ubuntu/Debian/Fedora 等)

### C-1. LUKS (ディスク暗号化)

インストール時に「Encrypt the new Ubuntu installation」を選ぶのが最も簡単。
事後追加は再インストール推奨 (`cryptsetup` でのオンライン暗号化は危険)。

確認:

```sh
lsblk -o NAME,TYPE,FSTYPE,MOUNTPOINT
# crypt / LUKS が出れば OK
```

### C-2. systemd timer で自動化

```sh
# ~/.config/systemd/user/storage-orchestrator.service
[Unit]
Description=Storage Orchestrator weekly

[Service]
Type=oneshot
WorkingDirectory=%h/repo
ExecStart=/bin/bash scripts/storage-orchestrator.sh --routine weekly --json-report
StandardOutput=append:%h/.local/state/storage-weekly.log

# ~/.config/systemd/user/storage-orchestrator.timer
[Unit]
Description=Run storage-orchestrator weekly

[Timer]
OnCalendar=Mon *-*-* 09:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```sh
# 有効化
systemctl --user daemon-reload
systemctl --user enable --now storage-orchestrator.timer

# 確認
systemctl --user list-timers --all

# 即時実行
systemctl --user start storage-orchestrator.service
```

### C-3. cron (古典的代替)

```sh
crontab -e
# 末尾に
0 9 * * 1 cd ~/repo && bash scripts/storage-orchestrator.sh --routine weekly --json-report >> ~/.local/state/storage-weekly.log 2>&1
```

### C-4. auditd (高度な改竄検知)

scripts/lib/audit.sh の改竄検知を OS レイヤでも:

```sh
sudo apt install auditd
sudo auditctl -w ~/.claude/audit.jsonl -p wa -k claude_audit
sudo ausearch -k claude_audit
```

---

## D. クロスプラットフォーム 比較

| 項目 | Windows | macOS | Linux |
|---|---|---|---|
| ディスク暗号化 | BitLocker | FileVault | LUKS |
| 定期実行 | Scheduled Task | launchd | systemd timer / cron |
| EDR / AV | Defender | XProtect / 3rd party | (任意) |
| WSL | ✓ 推奨 | (Mac 上で動かない) | (ネイティブ) |
| インデックス除外 | 設定 → 検索 | システム設定 → Spotlight | Tracker 等 |
| 環境変数 GUI 反映 | システム環境変数 | launchctl setenv | (X session) |

---

## E. 推奨セットアップ チェックリスト

```
プラットフォーム共通:
□ ディスク暗号化 ON
□ 自動ロック 5 分以内
□ MFA 全 SaaS で有効化
□ パスワード マネージャ
□ scripts/preflight.sh が ✅
□ scripts/storage-orchestrator.sh --routine weekly を 定期実行に登録

Windows:
□ WSL2 + Ubuntu インストール
□ BitLocker -on C: + Recovery key 三重保管
□ Defender 除外 (.git / .ollama)
□ Scheduled Task 登録 (--routine weekly)

macOS:
□ FileVault ON
□ Spotlight 除外 (.git / .ollama / Caches)
□ launchd plist 登録
□ launchctl setenv OLLAMA_ORIGINS '*'

Linux:
□ LUKS インストール時選択 (or 暗号化済 SSD)
□ systemd timer または cron 登録
□ auditd でログ改竄検知 (任意)
```

---

## F. 関連文書

- `02_DATA_CLASSIFICATION.md` — 暗号化要否の判断
- `03_OPERATIONS.md` H 節 — 平時の訓練 / H-2 節 ルーティン
- `06_ONBOARDING.md` — 新メンバー向け OS 設定手順
- `10_STORAGE_HYGIENE.md` — ストレージ衛生 + cron/Scheduled Task 連携例
- `09_INCIDENT_PLAYBOOK.md` I-3 — 端末紛失時 (BitLocker / FileVault が無いと壊滅的)
