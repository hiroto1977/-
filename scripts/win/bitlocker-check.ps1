<#
.SYNOPSIS
    BitLocker の状態確認 + 任意で有効化 (governance/02 C2 以上の前提条件)
.DESCRIPTION
    既定: 状態のみ表示 (read-only).
    -Apply: BitLocker を有効化する (要 管理者権限 + 再起動)。
    Recovery key が表示されたら必ず別場所 (パスワードマネージャ + 紙の予備) に保管すること。
    Recovery key 紛失は再インストール以外で復旧不能。
.PARAMETER MountPoint
    対象ドライブ。既定: C:
.PARAMETER Apply
    有効化を実行する。指定なしなら read-only。
.EXAMPLE
    pwsh -File scripts/win/bitlocker-check.ps1
.EXAMPLE
    Start-Process pwsh -Verb RunAs -ArgumentList '-File','scripts/win/bitlocker-check.ps1','-Apply'
.NOTES
    governance/11_PLATFORM_NOTES.md A-3 と連動。
    governance/09_INCIDENT_PLAYBOOK.md I-3 (端末紛失) では BitLocker 有効が前提。
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$MountPoint = 'C:',
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'

$libPath = Join-Path $PSScriptRoot 'lib/audit.ps1'
if (Test-Path $libPath) { . $libPath }
if (-not (Get-Command Write-AuditLog -ErrorAction SilentlyContinue)) {
    function Write-AuditLog { param($Event, $Details) }
}
Write-AuditLog -Event 'bitlocker.check.start' -Details "mount=$MountPoint apply=$Apply"

function Test-IsAdmin {
    ([Security.Principal.WindowsPrincipal]::new(
        [Security.Principal.WindowsIdentity]::GetCurrent()
    )).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# 状態取得
try {
    $vol = Get-BitLockerVolume -MountPoint $MountPoint -ErrorAction Stop
} catch {
    Write-Host "❌ BitLocker 情報を取得できません: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '   原因の候補: 管理者権限なし / Home エディション / TPM 不在' -ForegroundColor DarkGray
    Write-AuditLog -Event 'bitlocker.check.error' -Details "$($_.Exception.Message)"
    exit 1
}

Write-Host '==========================================================='
Write-Host ' BitLocker Status' -ForegroundColor Cyan
Write-Host '==========================================================='
Write-Host ('  MountPoint        : {0}' -f $vol.MountPoint)
Write-Host ('  ProtectionStatus  : {0}' -f $vol.ProtectionStatus)
Write-Host ('  VolumeStatus      : {0}' -f $vol.VolumeStatus)
Write-Host ('  EncryptionMethod  : {0}' -f $vol.EncryptionMethod)
Write-Host ('  EncryptionPercent : {0}%' -f $vol.EncryptionPercentage)
Write-Host ('  KeyProtector      : {0}' -f (($vol.KeyProtector | ForEach-Object { $_.KeyProtectorType }) -join ', '))

if ($vol.ProtectionStatus -eq 'On') {
    Write-Host ''
    Write-Host '✅ BitLocker は有効' -ForegroundColor Green
    Write-AuditLog -Event 'bitlocker.check.on' -Details "method=$($vol.EncryptionMethod)"
    exit 0
}

Write-Host ''
Write-Host '⚠️  BitLocker は無効' -ForegroundColor Yellow
Write-AuditLog -Event 'bitlocker.check.off' -Details ''

if (-not $Apply) {
    Write-Host ''
    Write-Host '   有効化するには (管理者 PowerShell):'
    Write-Host '     Start-Process pwsh -Verb RunAs -ArgumentList ''-File'', ''scripts/win/bitlocker-check.ps1'', ''-Apply'''
    exit 0
}

# Apply mode
if (-not (Test-IsAdmin)) {
    Write-Host '❌ -Apply には管理者権限が必要です。' -ForegroundColor Red
    Write-Host '   右クリック PowerShell → 管理者として実行 で起動してください。'
    exit 2
}

if (-not $PSCmdlet.ShouldProcess($MountPoint, 'Enable BitLocker')) { exit 0 }

Write-Host ''
Write-Host '⚠️  BitLocker 有効化を開始します。Recovery Password を生成します。' -ForegroundColor Yellow
Write-Host '   (TPM が無い PC では別途 USB Key 等が必要)'
Write-Host ''

try {
    $result = Enable-BitLocker -MountPoint $MountPoint -EncryptionMethod XtsAes256 -RecoveryPasswordProtector -ErrorAction Stop
    $rp = ($result.KeyProtector | Where-Object { $_.KeyProtectorType -eq 'RecoveryPassword' } | Select-Object -First 1).RecoveryPassword

    Write-Host '======================================================' -ForegroundColor Yellow
    Write-Host '  Recovery Password (二度と表示されません — 必ず保管)  ' -ForegroundColor Yellow
    Write-Host '======================================================' -ForegroundColor Yellow
    Write-Host ''
    Write-Host "    $rp" -ForegroundColor White
    Write-Host ''
    Write-Host '保管先 (3 箇所):' -ForegroundColor Cyan
    Write-Host '  1. パスワード マネージャ (1Password / Bitwarden)'
    Write-Host '  2. 紙にメモして 物理金庫 / 別の場所'
    Write-Host '  3. 別端末の暗号化メモ'
    Write-Host ''
    Write-Host '※ 紛失すると再インストール以外で復旧不能。' -ForegroundColor Red

    Write-AuditLog -Event 'bitlocker.enable.success' -Details "method=XtsAes256 mount=$MountPoint"
    Write-Host ''
    Write-Host '✅ 暗号化処理 開始 (バックグラウンドで進行)。再起動で完了。' -ForegroundColor Green
    Write-Host '   進捗: Get-BitLockerVolume -MountPoint ' + $MountPoint
} catch {
    Write-Host "❌ 有効化失敗: $($_.Exception.Message)" -ForegroundColor Red
    Write-AuditLog -Event 'bitlocker.enable.failed' -Details "$($_.Exception.Message)"
    exit 1
}

exit 0
