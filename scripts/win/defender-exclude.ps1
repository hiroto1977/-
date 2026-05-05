<#
.SYNOPSIS
    Windows Defender に開発系ディレクトリの除外を設定 (パフォーマンス向上)
.DESCRIPTION
    .git / node_modules / Ollama models 等は大量 I/O が発生し、リアルタイム
    保護で速度が大きく低下する。governance/11_PLATFORM_NOTES.md A-5 と連動。

    既定: 既存の除外を 一覧表示 (read-only)
    -Add: 標準的な開発系パスを除外に追加
    -List: 現在の除外設定を表示
    -Remove <Path>: 個別パス削除

    ※ 除外したパスはマルウェアスキャン対象外になる。
       信頼できるディレクトリのみ。~/Downloads は除外しない。
.PARAMETER Add
    標準的な開発系パスを Defender 除外に追加 (要 管理者)
.PARAMETER List
    現在の除外パス / 除外プロセス を表示
.PARAMETER Remove
    指定したパスを除外から削除 (要 管理者)
.PARAMETER WhatIf
    変更内容を表示するだけで実行しない
.EXAMPLE
    pwsh -File scripts/win/defender-exclude.ps1 -List
.EXAMPLE
    Start-Process pwsh -Verb RunAs -ArgumentList '-File','scripts/win/defender-exclude.ps1','-Add'
#>
[CmdletBinding(SupportsShouldProcess, DefaultParameterSetName = 'List')]
param(
    [Parameter(ParameterSetName = 'Add')][switch]$Add,
    [Parameter(ParameterSetName = 'List')][switch]$List,
    [Parameter(ParameterSetName = 'Remove')][string]$Remove
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

# デフォルトは List
if (-not $Add -and -not $Remove) { $List = $true }

# === List ===
if ($List) {
    Write-AuditLog -Event 'defender.list' -Details ''
    try {
        $pref = Get-MpPreference
        Write-Host '==========================================================='
        Write-Host ' Defender 除外設定 (現在)' -ForegroundColor Cyan
        Write-Host '==========================================================='
        Write-Host '  ExclusionPath:'
        if ($pref.ExclusionPath) {
            $pref.ExclusionPath | ForEach-Object { Write-Host "    $_" }
        } else { Write-Host '    (なし)' -ForegroundColor DarkGray }
        Write-Host ''
        Write-Host '  ExclusionProcess:'
        if ($pref.ExclusionProcess) {
            $pref.ExclusionProcess | ForEach-Object { Write-Host "    $_" }
        } else { Write-Host '    (なし)' -ForegroundColor DarkGray }
        Write-Host ''
        Write-Host '  ExclusionExtension:'
        if ($pref.ExclusionExtension) {
            $pref.ExclusionExtension | ForEach-Object { Write-Host "    $_" }
        } else { Write-Host '    (なし)' -ForegroundColor DarkGray }
    } catch {
        Write-Host "❌ Get-MpPreference 失敗: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
    exit 0
}

# === Add ===
if ($Add) {
    if (-not (Test-IsAdmin)) {
        Write-Host '❌ -Add には管理者権限が必要です。' -ForegroundColor Red
        exit 2
    }

    $userProfile = $env:USERPROFILE
    $candidates = [System.Collections.ArrayList]@(
        # AI ローカル インフラ
        (Join-Path $userProfile '.ollama'),
        # Node / Python の重い系
        (Join-Path $userProfile '.npm'),
        (Join-Path $userProfile '.yarn'),
        (Join-Path $userProfile '.cargo'),
        (Join-Path $userProfile '.cache'),
        # WSL ファイルシステム (Windows 側からのスキャン抑制)
        '\\wsl$',
        '\\wsl.localhost'
    )

    Write-Host '==========================================================='
    Write-Host ' Defender 除外を 標準パスに追加' -ForegroundColor Cyan
    Write-Host '==========================================================='
    Write-Host ''
    Write-Host '対象パス (候補):'
    foreach ($p in $candidates) { Write-Host "  $p" }
    Write-Host ''
    Write-Host '⚠️  除外したパスは マルウェアスキャン 対象外。' -ForegroundColor Yellow
    Write-Host '   ~/Downloads は意図的に除外していません (信頼できないファイル想定)。'
    Write-Host ''

    $added = 0; $skipped = 0; $missing = 0
    foreach ($p in $candidates) {
        if (-not (Test-Path -LiteralPath $p)) {
            Write-Host "  [skip]  $p (ディレクトリ未存在)" -ForegroundColor DarkGray
            $missing++; continue
        }
        $current = (Get-MpPreference).ExclusionPath
        if ($current -and ($current -contains $p)) {
            Write-Host "  [skip]  $p (既に除外済)" -ForegroundColor DarkGray
            $skipped++; continue
        }
        if ($PSCmdlet.ShouldProcess($p, 'Add-MpPreference -ExclusionPath')) {
            try {
                Add-MpPreference -ExclusionPath $p -ErrorAction Stop
                Write-Host "  [OK]    $p" -ForegroundColor Green
                Write-AuditLog -Event 'defender.add' -Details "path=$p"
                $added++
            } catch {
                Write-Host "  [FAIL]  $p — $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }
    Write-Host ''
    Write-Host "  追加: $added  /  既存: $skipped  /  対象なし: $missing"
    exit 0
}

# === Remove ===
if ($Remove) {
    if (-not (Test-IsAdmin)) {
        Write-Host '❌ -Remove には管理者権限が必要です。' -ForegroundColor Red
        exit 2
    }
    if ($PSCmdlet.ShouldProcess($Remove, 'Remove-MpPreference -ExclusionPath')) {
        try {
            Remove-MpPreference -ExclusionPath $Remove -ErrorAction Stop
            Write-Host "✅ 除外解除: $Remove" -ForegroundColor Green
            Write-AuditLog -Event 'defender.remove' -Details "path=$Remove"
        } catch {
            Write-Host "❌ 失敗: $($_.Exception.Message)" -ForegroundColor Red
            exit 1
        }
    }
    exit 0
}
