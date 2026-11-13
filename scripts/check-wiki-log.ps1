[CmdletBinding()]
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$LogPath = '',
    [ValidateRange(0.05, 60.0)][double]$LockTimeoutSeconds = 10.0
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'WikiLog.Common.ps1')

$resolvedPath = Resolve-WikiLogPath -ProjectRoot $ProjectRoot -LogPath $LogPath
if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
    throw "FAIL: wiki log not found: $resolvedPath"
}

$stream = $null
try {
    $stream = Open-WikiLogExclusive -Path $resolvedPath -Mode Open -LockTimeoutSeconds $LockTimeoutSeconds
    $result = Test-WikiLogBytes -Bytes (Read-WikiLogBytes -Stream $stream) -Path $resolvedPath
    Write-Output "Wiki log check PASS: rows=$($result.RowCount); markerLine=$($result.MarkerLine); path=$resolvedPath"
}
finally { Close-WikiLogExclusive -Stream $stream }
