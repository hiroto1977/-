# audit.ps1 — Windows PowerShell 用 監査ログ ライブラリ
#
# scripts/lib/audit.sh と byte-exact 互換: 同じ ~/.claude/audit.jsonl に
# 追記しても SHA-256 連鎖が破れない。
#
# 使い方 (呼び出し側):
#   . "$PSScriptRoot/lib/audit.ps1"
#   Write-AuditLog -Event 'preflight.start' -Details ''
#
# 環境変数:
#   $env:AUDIT_LOG_PATH   既定: $HOME/.claude/audit.jsonl
#   $env:AUDIT_LOG_OFF    "1" でロギング無効化 (テスト用)

$Script:AuditLogPath = if ($env:AUDIT_LOG_PATH) { $env:AUDIT_LOG_PATH } else { Join-Path $HOME '.claude/audit.jsonl' }

function Get-AuditLastHash {
    if (-not (Test-Path -LiteralPath $Script:AuditLogPath)) { return $null }
    $line = Get-Content -LiteralPath $Script:AuditLogPath -Tail 1 -ErrorAction SilentlyContinue
    if (-not $line) { return $null }
    if ($line -match '"chain_hash":"([0-9a-f]{64})"') { return $Matches[1] }
    return $null
}

function ConvertTo-AuditEscape {
    param([Parameter(ValueFromPipeline = $true)][AllowNull()][string]$Value)
    process {
        if ($null -eq $Value) { return '' }
        $Value -replace '\\', '\\\\' -replace '"', '\"' -replace "`n", '\n' -replace "`t", '\t'
    }
}

function Get-Sha256Hex {
    param([Parameter(Mandatory)][string]$Text)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
        $hash = $sha.ComputeHash($bytes)
        ($hash | ForEach-Object { $_.ToString('x2') }) -join ''
    } finally { $sha.Dispose() }
}

function Write-AuditLog {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Event,
        [string]$Details = ''
    )

    if ($env:AUDIT_LOG_OFF -eq '1') { return }

    # ログディレクトリ確保
    $dir = Split-Path -Parent $Script:AuditLogPath
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    # 前のチェーン (なければ全 0)
    $prev = Get-AuditLastHash
    if (-not $prev) { $prev = '0' * 64 }

    # フィールド
    $ts = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
    $hostName = [System.Net.Dns]::GetHostName()
    $userName = $env:USERNAME
    $myPid = $PID
    $script = if ($MyInvocation.ScriptName) {
        Split-Path -Leaf $MyInvocation.ScriptName
    } elseif ($MyInvocation.MyCommand.Path) {
        Split-Path -Leaf $MyInvocation.MyCommand.Path
    } else { 'pwsh' }

    # body (bash 版と同じ順序・同じエスケープ)
    $tsE = ConvertTo-AuditEscape $ts
    $hostE = ConvertTo-AuditEscape $hostName
    $userE = ConvertTo-AuditEscape $userName
    $scriptE = ConvertTo-AuditEscape $script
    $eventE = ConvertTo-AuditEscape $Event
    $detailsE = ConvertTo-AuditEscape $Details

    $body = '{"ts":"' + $tsE + '","host":"' + $hostE + '","user":"' + $userE +
            '","pid":' + $myPid + ',"script":"' + $scriptE +
            '","event":"' + $eventE + '","details":"' + $detailsE +
            '","prev_hash":"' + $prev + '"'

    $chain = Get-Sha256Hex -Text ($prev + $body)
    $line = $body + ',"chain_hash":"' + $chain + '"}'

    # LF 改行で append (bash 版と一致)
    [System.IO.File]::AppendAllText($Script:AuditLogPath, $line + "`n", [System.Text.UTF8Encoding]::new($false))
}
