<#
.SYNOPSIS
    WSL2 + Ubuntu のセットアップ補助 (governance/11_PLATFORM_NOTES.md A-1 と連動)
.DESCRIPTION
    本リポジトリの bash スクリプト群を Windows で動かす最も安全な経路は WSL2。
    このスクリプトは:
      1. 現状を確認 (WSL 有無 / 既存ディストリ)
      2. -Apply 指定時に `wsl --install -d Ubuntu` を実行
      3. 後続手順を画面表示 (再起動 + Ubuntu 初回起動 + git clone)

    ※ 初回 wsl --install は 管理者 PowerShell 必須 + 再起動 必要。
.PARAMETER Apply
    実際にインストールを実行 (要 管理者)
.PARAMETER Distro
    インストールするディストリ。既定: Ubuntu
.EXAMPLE
    pwsh -File scripts/win/install-wsl.ps1
.EXAMPLE
    Start-Process pwsh -Verb RunAs -ArgumentList '-File','scripts/win/install-wsl.ps1','-Apply'
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [switch]$Apply,
    [string]$Distro = 'Ubuntu'
)

$ErrorActionPreference = 'Continue'

$libPath = Join-Path $PSScriptRoot 'lib/audit.ps1'
if (Test-Path $libPath) { . $libPath }
if (-not (Get-Command Write-AuditLog -ErrorAction SilentlyContinue)) {
    function Write-AuditLog { param($Event, $Details) }
}
Write-AuditLog -Event 'wsl.install.start' -Details "apply=$Apply distro=$Distro"

function Test-IsAdmin {
    ([Security.Principal.WindowsPrincipal]::new(
        [Security.Principal.WindowsIdentity]::GetCurrent()
    )).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

Write-Host '==========================================================='
Write-Host ' WSL2 セットアップ補助' -ForegroundColor Cyan
Write-Host '==========================================================='

# 1. 現状確認
$wslExists = Get-Command wsl -ErrorAction SilentlyContinue
if ($wslExists) {
    Write-Host '✅ wsl コマンド: 利用可能' -ForegroundColor Green
    try {
        $status = & wsl --status 2>&1 | Out-String
        Write-Host ''
        Write-Host '--- wsl --status ---'
        Write-Host $status
        $distros = & wsl --list --quiet 2>$null
        if ($distros) {
            Write-Host '--- Installed distros ---'
            $distros | ForEach-Object { if ($_) { Write-Host "  $_" } }
        }
    } catch {
        Write-Host "状態取得失敗: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host '⚠️  wsl コマンド: 未インストール' -ForegroundColor Yellow
}

if (-not $Apply) {
    Write-Host ''
    Write-Host '実行するには: 管理者 PowerShell で以下:'
    Write-Host '  Start-Process pwsh -Verb RunAs -ArgumentList ''-File'',''scripts/win/install-wsl.ps1'',''-Apply'''
    Write-Host ''
    Write-Host '手動でも可:'
    Write-Host ('  wsl --install -d {0}' -f $Distro)
    exit 0
}

# Apply mode
if (-not (Test-IsAdmin)) {
    Write-Host '❌ -Apply には管理者権限が必要です。' -ForegroundColor Red
    exit 2
}

if ($PSCmdlet.ShouldProcess($Distro, "wsl --install -d $Distro")) {
    Write-Host ''
    Write-Host ('インストール開始: {0}' -f $Distro) -ForegroundColor Cyan
    & wsl --install -d $Distro
    $rc = $LASTEXITCODE

    if ($rc -eq 0) {
        Write-AuditLog -Event 'wsl.install.success' -Details "distro=$Distro"
        Write-Host ''
        Write-Host '✅ インストール開始 — 再起動が必要です' -ForegroundColor Green
        Write-Host ''
        Write-Host '次のステップ:'
        Write-Host '  1. Windows を再起動'
        Write-Host '  2. スタートメニューから Ubuntu (or 選択ディストリ) を起動'
        Write-Host '  3. UNIX ユーザー名 + パスワード を設定'
        Write-Host '  4. リポジトリ クローン:'
        Write-Host '       git clone https://github.com/hiroto1977/-.git ~/repo'
        Write-Host '       cd ~/repo'
        Write-Host '       bash scripts/preflight.sh'
        Write-Host '  5. Ollama を WSL 内 で起動:'
        Write-Host '       curl -fsSL https://ollama.com/install.sh | sh'
        Write-Host "       OLLAMA_ORIGINS='*' ollama serve &"
        Write-Host '       ollama pull llama3.2'
    } else {
        Write-Host ('❌ インストール失敗 (exit {0})' -f $rc) -ForegroundColor Red
        Write-AuditLog -Event 'wsl.install.failed' -Details "rc=$rc"
        exit 1
    }
}

exit 0
