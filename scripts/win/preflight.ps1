<#
.SYNOPSIS
    Windows 環境向け 業務開始前 自動チェック (scripts/preflight.sh の Windows 版)
.DESCRIPTION
    BitLocker / WSL / git / pwsh / ガバナンス文書 / Defender 状態 をひと通り確認し、
    governance/03_OPERATIONS.md A 節の朝のルーティンを Windows でも回せるようにする。
.PARAMETER Json
    JSON 形式で出力 (cron / Task Scheduler 連携用)
.EXAMPLE
    pwsh -File scripts/win/preflight.ps1
.EXAMPLE
    pwsh -File scripts/win/preflight.ps1 -Json
#>
[CmdletBinding()]
param(
    [switch]$Json
)

$ErrorActionPreference = 'Continue'

# Audit logging
$libPath = Join-Path $PSScriptRoot 'lib/audit.ps1'
if (Test-Path $libPath) { . $libPath }
if (-not (Get-Command Write-AuditLog -ErrorAction SilentlyContinue)) {
    function Write-AuditLog { param($Event, $Details) }
}
Write-AuditLog -Event 'preflight.win.start' -Details ''

$pass = 0; $warn = 0; $fail = 0
$results = [System.Collections.ArrayList]::new()

function Add-Result {
    param([string]$Status, [string]$Label, [string]$Detail = '')
    $null = $results.Add([PSCustomObject]@{ Status = $Status; Label = $Label; Detail = $Detail })
    switch ($Status) {
        'OK'   { $script:pass++ }
        'WARN' { $script:warn++ }
        'FAIL' { $script:fail++ }
    }
}

# 1) BitLocker (端末暗号化)
try {
    $bl = Get-BitLockerVolume -MountPoint 'C:' -ErrorAction Stop
    if ($bl.ProtectionStatus -eq 'On') {
        Add-Result 'OK' 'BitLocker (C:)' "Encryption: $($bl.EncryptionMethod)"
    } else {
        Add-Result 'FAIL' 'BitLocker (C:) 無効' '対処: pwsh scripts/win/bitlocker-check.ps1 -Apply'
    }
} catch {
    Add-Result 'WARN' 'BitLocker 状態取得 失敗' '管理者権限が必要 / 一部 SKU で利用不可'
}

# 2) WSL2
try {
    $null = & wsl --status 2>&1
    if ($LASTEXITCODE -eq 0) {
        $distros = (& wsl --list --quiet) -split "`n" | Where-Object { $_ -and $_.Trim() -ne '' }
        Add-Result 'OK' 'WSL2' "Distros: $($distros -join ', ')"
    } else {
        Add-Result 'WARN' 'WSL 未インストール' '対処: pwsh scripts/win/install-wsl.ps1'
    }
} catch {
    Add-Result 'WARN' 'WSL 確認 不可' $_.Exception.Message
}

# 3) git
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) {
    Add-Result 'OK' 'git' "$(($gitCmd.Path))"
} else {
    Add-Result 'FAIL' 'git 未インストール' '対処: winget install Git.Git または scoop install git'
}

# 4) pwsh / Windows PowerShell バージョン
$psVer = $PSVersionTable.PSVersion.ToString()
if ($PSVersionTable.PSVersion.Major -ge 7) {
    Add-Result 'OK' "PowerShell" "$psVer"
} elseif ($PSVersionTable.PSVersion.Major -ge 5) {
    Add-Result 'WARN' "Windows PowerShell" "$psVer (PowerShell 7+ 推奨: winget install Microsoft.PowerShell)"
} else {
    Add-Result 'FAIL' "PowerShell 5.1 未満" "$psVer"
}

# 5) Windows Defender
try {
    $mp = Get-MpComputerStatus -ErrorAction Stop
    if ($mp.AntivirusEnabled -and $mp.RealTimeProtectionEnabled) {
        $age = (New-TimeSpan -Start $mp.AntivirusSignatureLastUpdated -End (Get-Date)).TotalDays
        if ($age -lt 7) {
            Add-Result 'OK' 'Windows Defender' "RTP On / Signature ${age:n1} 日前"
        } else {
            Add-Result 'WARN' 'Defender Signature 古い' "${age:n0} 日前 — Update-MpSignature を実行"
        }
    } else {
        Add-Result 'WARN' 'Defender RTP 無効' '別の AV を利用していなければ有効化推奨'
    }
} catch {
    Add-Result 'WARN' 'Defender 状態取得失敗' $_.Exception.Message
}

# 6) ガバナンス文書 (このリポジトリ内に居る前提)
$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..') -ErrorAction SilentlyContinue
if ($repoRoot) {
    foreach ($f in @('CLAUDE.md', 'governance/02_DATA_CLASSIFICATION.md', 'governance/03_OPERATIONS.md', 'governance/11_PLATFORM_NOTES.md')) {
        $p = Join-Path $repoRoot $f
        if (Test-Path -LiteralPath $p) {
            Add-Result 'OK' "doc: $f" ''
        } else {
            Add-Result 'FAIL' "doc: $f 不在" "$p"
        }
    }
} else {
    Add-Result 'WARN' 'ガバナンス文書' 'リポジトリ ルート未検出 (このスクリプトをリポジトリ内 scripts/win/ から実行)'
}

# 7) 業務 PC 推奨設定
$lockTimeout = (Get-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name ScreenSaveTimeOut -ErrorAction SilentlyContinue).ScreenSaveTimeOut
if ($lockTimeout -and [int]$lockTimeout -le 600) {
    Add-Result 'OK' '画面ロック (≤10 分)' "${lockTimeout} 秒"
} else {
    Add-Result 'WARN' '画面ロック設定' '<=10 分 推奨 (governance/06)'
}

# Output
if ($Json) {
    [PSCustomObject]@{
        timestamp = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
        host = [System.Net.Dns]::GetHostName()
        pass = $pass
        warn = $warn
        fail = $fail
        results = $results
    } | ConvertTo-Json -Depth 4
} else {
    Write-Host '==========================================================='
    Write-Host (' preflight (Windows): {0}  ({1})' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), [System.Net.Dns]::GetHostName())
    Write-Host '==========================================================='
    foreach ($r in $results) {
        $color = switch ($r.Status) { 'OK' {'Green'} 'WARN' {'Yellow'} 'FAIL' {'Red'} default {'White'} }
        Write-Host -NoNewline ('  [{0}]  ' -f $r.Status) -ForegroundColor $color
        Write-Host -NoNewline $r.Label
        if ($r.Detail) { Write-Host ('  — {0}' -f $r.Detail) -ForegroundColor DarkGray } else { Write-Host '' }
    }
    Write-Host ''
    Write-Host ('  PASS: {0}  /  WARN: {1}  /  FAIL: {2}' -f $pass, $warn, $fail)
    Write-Host '==========================================================='
}

Write-AuditLog -Event 'preflight.win.summary' -Details "pass=$pass warn=$warn fail=$fail"

if ($fail -gt 0) { exit 1 }
exit 0
