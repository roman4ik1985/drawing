[CmdletBinding()]
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$LogPath = '',
    [Parameter(Mandatory = $true)]
    [ValidateSet('ingest', 'query', 'lint', 'config', 'implementation', 'savepoint', 'handoff', 'closure')]
    [string]$Type,
    [Parameter(Mandatory = $true)][string]$Files,
    [Parameter(Mandatory = $true)][string]$Summary,
    [string]$Timestamp = '',
    [ValidateRange(0.05, 60.0)][double]$LockTimeoutSeconds = 10.0
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'WikiLog.Common.ps1')

Assert-WikiLogField -Name 'Files' -Value $Files
Assert-WikiLogField -Name 'Summary' -Value $Summary
$effectiveTimestamp = Get-WikiLogTimestamp -Timestamp $Timestamp
$effectiveType = $Type.ToLowerInvariant()
$row = "- [$effectiveTimestamp] $effectiveType - $Files - $Summary"
$rowBytes = $script:WikiLogUtf8NoBom.GetBytes("$row`n")
$resolvedPath = Resolve-WikiLogPath -ProjectRoot $ProjectRoot -LogPath $LogPath
$parent = Split-Path -Parent $resolvedPath
if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
    [System.IO.Directory]::CreateDirectory($parent) | Out-Null
}

$stream = $null
$rollbackLength = $null
try {
    $stream = Open-WikiLogExclusive -Path $resolvedPath -Mode OpenOrCreate -LockTimeoutSeconds $LockTimeoutSeconds
    if ($stream.Length -eq 0) {
        Write-WikiLogBytes -Stream $stream -Bytes (Get-WikiLogInitialBytes)
    }
    $preflight = Test-WikiLogBytes -Bytes (Read-WikiLogBytes -Stream $stream) -Path $resolvedPath
    $rollbackLength = $stream.Length
    try {
        $stream.Position = $stream.Length
        $stream.Write($rowBytes, 0, $rowBytes.Length)
        $stream.Flush($true)
        $postcheck = Test-WikiLogBytes -Bytes (Read-WikiLogBytes -Stream $stream) -Path $resolvedPath
        if ($postcheck.RowCount -ne ($preflight.RowCount + 1) -or
            -not $postcheck.Text.EndsWith("$row`n", [System.StringComparison]::Ordinal)) {
            throw 'FAIL: wiki-log post-check did not observe exactly the appended row.'
        }
    }
    catch {
        if ($null -ne $rollbackLength) {
            $stream.SetLength([long]$rollbackLength)
            $stream.Flush($true)
        }
        throw
    }
    Write-Output $row
}
finally { Close-WikiLogExclusive -Stream $stream }
