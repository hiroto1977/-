<#
.SYNOPSIS
    storage-orchestrator を Windows Task Scheduler に登録 (週次/月次)
.DESCRIPTION
    governance/03_OPERATIONS.md H-2 節および 11_PLATFORM_NOTES.md A-4 と連動。
    WSL 内の bash scripts/storage-orchestrator.sh を定期実行する。

    既定: 毎週月曜 09:00 に --routine weekly を実行
.PARAMETER TaskName
    タスク名。既定: ClaudeStorageOrchestrator
.PARAMETER Routine
    daily / weekly / monthly のいずれか。既定: weekly
.PARAMETER Time
    実行時刻 (HH:mm 形式)。既定: 09:00
.PARAMETER DayOfWeek
    weekly のときの曜日。既定: Monday
.PARAMETER RepoPath
    リポジトリの WSL パス (~/repo 等)。既定: ~/repo
.PARAMETER Action
    Register / Unregister / Status のいずれか。既定: Register
.EXAMPLE
    Start-Process pwsh -Verb RunAs -ArgumentList '-File','scripts/win/register-storage-task.ps1'
.EXAMPLE
    pwsh -File scripts/win/register-storage-task.ps1 -Action Status
.EXAMPLE
    pwsh -File scripts/win/register-storage-task.ps1 -Routine monthly -Time '02:00' -DayOfWeek Sunday
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$TaskName = 'ClaudeStorageOrchestrator',
    [ValidateSet('daily','weekly','monthly')][string]$Routine = 'weekly',
    [string]$Time = '09:00',
    [ValidateSet('Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday')]
    [string]$DayOfWeek = 'Monday',
    [string]$RepoPath = '~/repo',
    [ValidateSet('Register','Unregister','Status')][string]$Action = 'Register'
)

$ErrorActionPreference = 'Stop'

$libPath = Join-Path $PSScriptRoot 'lib/audit.ps1'
if (Test-Path $libPath) { . $libPath }
if (-not (Get-Command Write-AuditLog -ErrorAction SilentlyContinue)) {
    function Write-AuditLog { param($Event, $Details) }
}

function Test-IsAdmin {
    ([Security.Principal.WindowsPrincipal]::new(
        [Security.Principal.WindowsIdentity]::GetCurrent()
    )).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Status
if ($Action -eq 'Status') {
    Write-AuditLog -Event 'task.status' -Details "name=$TaskName"
    try {
        $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
        $info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction Stop
        Write-Host '==========================================================='
        Write-Host (' Task: {0}' -f $TaskName) -ForegroundColor Cyan
        Write-Host '==========================================================='
        Write-Host ('  State           : {0}' -f $task.State)
        Write-Host ('  LastRunTime     : {0}' -f $info.LastRunTime)
        Write-Host ('  LastTaskResult  : 0x{0:X8}' -f $info.LastTaskResult)
        Write-Host ('  NextRunTime     : {0}' -f $info.NextRunTime)
        Write-Host ('  Description     : {0}' -f $task.Description)
        Write-Host ''
        Write-Host '  Action:'
        foreach ($a in $task.Actions) {
            Write-Host ('    Execute   : {0}' -f $a.Execute)
            Write-Host ('    Arguments : {0}' -f $a.Arguments)
        }
    } catch {
        Write-Host ('タスク "{0}" は存在しません' -f $TaskName) -ForegroundColor Yellow
        exit 1
    }
    exit 0
}

# Unregister
if ($Action -eq 'Unregister') {
    if (-not (Test-IsAdmin)) { Write-Host '❌ 管理者権限必要' -ForegroundColor Red; exit 2 }
    if ($PSCmdlet.ShouldProcess($TaskName, 'Unregister-ScheduledTask')) {
        try {
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
            Write-Host ('✅ 削除: {0}' -f $TaskName) -ForegroundColor Green
            Write-AuditLog -Event 'task.unregister' -Details "name=$TaskName"
        } catch {
            Write-Host ('❌ 削除失敗: {0}' -f $_.Exception.Message) -ForegroundColor Red
            exit 1
        }
    }
    exit 0
}

# Register
if (-not (Test-IsAdmin)) {
    Write-Host '❌ 登録には管理者権限が必要です。' -ForegroundColor Red
    Write-Host '   実行例: Start-Process pwsh -Verb RunAs -ArgumentList ''-File'', ''scripts/win/register-storage-task.ps1'''
    exit 2
}

# WSL コマンド ライン
$bashCmd = ('cd {0} && bash scripts/storage-orchestrator.sh --routine {1} --json-report >> ~/.local/state/storage-{1}.log' -f $RepoPath, $Routine)
$exec = 'C:\Windows\System32\wsl.exe'
$args_ = ('bash -lc "{0}"' -f $bashCmd)

$action = New-ScheduledTaskAction -Execute $exec -Argument $args_

# トリガ
$trigger = switch ($Routine) {
    'daily'   { New-ScheduledTaskTrigger -Daily -At $Time }
    'weekly'  { New-ScheduledTaskTrigger -Weekly -DaysOfWeek $DayOfWeek -At $Time }
    'monthly' { New-ScheduledTaskTrigger -Weekly -DaysOfWeek $DayOfWeek -At $Time -WeeksInterval 4 }
}

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 10) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

$desc = ('[Routine={0} Time={1}] storage-orchestrator を WSL 内で実行 (governance/03 H-2)' -f $Routine, $Time)

if ($PSCmdlet.ShouldProcess($TaskName, 'Register-ScheduledTask')) {
    try {
        # 既存があれば置き換え
        $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if ($existing) {
            Write-Host '⚠️  同名タスクを上書き登録します' -ForegroundColor Yellow
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        }
        Register-ScheduledTask -TaskName $TaskName `
            -Action $action -Trigger $trigger `
            -Settings $settings -Principal $principal `
            -Description $desc -ErrorAction Stop | Out-Null

        Write-Host '==========================================================='
        Write-Host ' Scheduled Task 登録 完了' -ForegroundColor Green
        Write-Host '==========================================================='
        Write-Host ('  TaskName      : {0}' -f $TaskName)
        Write-Host ('  Routine       : {0}' -f $Routine)
        Write-Host ('  Trigger       : {0} {1}' -f $DayOfWeek, $Time)
        Write-Host ('  Execute       : {0}' -f $exec)
        Write-Host ('  Arguments     : {0}' -f $args_)
        Write-Host ''
        Write-Host '  確認: pwsh -File scripts/win/register-storage-task.ps1 -Action Status'
        Write-Host '  即時実行: Start-ScheduledTask -TaskName {0}' -f $TaskName
        Write-Host '  削除: pwsh -File scripts/win/register-storage-task.ps1 -Action Unregister'

        Write-AuditLog -Event 'task.register' -Details "name=$TaskName routine=$Routine time=$Time"
    } catch {
        Write-Host ('❌ 登録失敗: {0}' -f $_.Exception.Message) -ForegroundColor Red
        Write-AuditLog -Event 'task.register.failed' -Details "$($_.Exception.Message)"
        exit 1
    }
}

exit 0
