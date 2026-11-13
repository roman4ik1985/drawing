Set-StrictMode -Version Latest

$script:WikiLogAllowedTypes = @(
    'ingest', 'query', 'lint', 'config',
    'implementation', 'savepoint', 'handoff', 'closure'
)
$script:WikiLogMarker = '<!-- wiki-log-canonical-v1 -->'
$script:WikiLogUtf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
$script:WikiLogUtf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Resolve-WikiLogPath {
    param(
        [Parameter(Mandatory = $true)][string]$ProjectRoot,
        [string]$LogPath = ''
    )

    $root = [System.IO.Path]::GetFullPath($ProjectRoot)
    if (-not [string]::IsNullOrWhiteSpace($LogPath)) {
        if ([System.IO.Path]::IsPathRooted($LogPath)) {
            return [System.IO.Path]::GetFullPath($LogPath)
        }
        return [System.IO.Path]::GetFullPath((Join-Path $root $LogPath))
    }

    $projectLog = Join-Path $root 'PROJECT_LOG.md'
    if (Test-Path -LiteralPath $projectLog -PathType Leaf) {
        return [System.IO.Path]::GetFullPath($projectLog)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $root 'wiki\log.md'))
}

function Open-WikiLogExclusive {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][System.IO.FileMode]$Mode,
        [ValidateRange(0.05, 60.0)][double]$LockTimeoutSeconds = 10.0
    )

    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    do {
        $stream = $null
        try {
            $stream = New-Object System.IO.FileStream(
                $Path,
                $Mode,
                [System.IO.FileAccess]::ReadWrite,
                [System.IO.FileShare]::None
            )
            $stream.Lock(0, 1)
            return $stream
        }
        catch [System.IO.IOException] {
            if ($null -ne $stream) { $stream.Dispose() }
            if ($timer.Elapsed.TotalSeconds -ge $LockTimeoutSeconds) {
                throw [System.TimeoutException]::new(
                    "BLOCKED: timed out acquiring the wiki-log OS lock after ${LockTimeoutSeconds}s: $Path",
                    $_.Exception
                )
            }
            Start-Sleep -Milliseconds 25
        }
        catch [System.UnauthorizedAccessException] {
            if ($null -ne $stream) { $stream.Dispose() }
            throw "BLOCKED: access denied while acquiring the wiki-log OS lock: $Path"
        }
    } while ($true)
}

function Close-WikiLogExclusive {
    param([AllowNull()][System.IO.FileStream]$Stream)
    if ($null -eq $Stream) { return }
    try { $Stream.Unlock(0, 1) } catch { }
    $Stream.Dispose()
}

function Read-WikiLogBytes {
    param([Parameter(Mandatory = $true)][System.IO.FileStream]$Stream)
    $Stream.Position = 0
    $bytes = New-Object byte[] $Stream.Length
    $offset = 0
    while ($offset -lt $bytes.Length) {
        $read = $Stream.Read($bytes, $offset, $bytes.Length - $offset)
        if ($read -le 0) { throw 'FAIL: unexpected end of wiki-log stream.' }
        $offset += $read
    }
    return $bytes
}

function Test-WikiLogBytes {
    param(
        [Parameter(Mandatory = $true)][byte[]]$Bytes,
        [Parameter(Mandatory = $true)][string]$Path
    )

    if ($Bytes.Length -eq 0) { throw "FAIL: wiki log is empty: $Path" }
    if ($Bytes.Length -ge 3 -and $Bytes[0] -eq 0xEF -and $Bytes[1] -eq 0xBB -and $Bytes[2] -eq 0xBF) {
        throw "FAIL: wiki log must be UTF-8 without BOM: $Path"
    }
    if ($Bytes -contains [byte]0x0D) { throw "FAIL: wiki log must use LF-only line endings: $Path" }
    if ($Bytes -contains [byte]0x00) { throw "FAIL: wiki log contains a NUL byte: $Path" }

    try { $text = $script:WikiLogUtf8Strict.GetString($Bytes) }
    catch { throw "FAIL: wiki log is not valid UTF-8: $Path" }
    if (-not $text.EndsWith("`n", [System.StringComparison]::Ordinal)) {
        throw "FAIL: wiki log must end with LF: $Path"
    }

    $lines = @($text -split "`n")
    $contentLineCount = $lines.Count - 1
    $markerIndexes = @()
    for ($index = 0; $index -lt $contentLineCount; $index++) {
        if ($lines[$index] -ceq $script:WikiLogMarker) { $markerIndexes += $index }
    }
    if ($markerIndexes.Count -ne 1) {
        throw "FAIL: wiki log must contain exactly one canonical marker, found $($markerIndexes.Count): $Path"
    }

    $rowPattern = '^- \[(?<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2})\] (?<type>ingest|query|lint|config|implementation|savepoint|handoff|closure) - (?<files>\S(?:.*\S)?) - (?<summary>\S(?:.*\S)?)$'
    $rowCount = 0
    for ($index = $markerIndexes[0] + 1; $index -lt $contentLineCount; $index++) {
        $match = [regex]::Match($lines[$index], $rowPattern)
        if (-not $match.Success) {
            throw "FAIL: malformed canonical wiki-log row at line $($index + 1): $Path"
        }
        $parsedTimestamp = [DateTime]::MinValue
        if (-not [DateTime]::TryParseExact(
            $match.Groups['timestamp'].Value,
            'yyyy-MM-dd HH:mm',
            [Globalization.CultureInfo]::InvariantCulture,
            [Globalization.DateTimeStyles]::None,
            [ref]$parsedTimestamp
        )) {
            throw "FAIL: invalid timestamp at wiki-log line $($index + 1): $Path"
        }
        $rowCount++
    }

    [pscustomobject]@{
        Path = $Path
        Text = $text
        RowCount = $rowCount
        MarkerLine = $markerIndexes[0] + 1
    }
}

function Write-WikiLogBytes {
    param(
        [Parameter(Mandatory = $true)][System.IO.FileStream]$Stream,
        [Parameter(Mandatory = $true)][byte[]]$Bytes
    )
    $Stream.Position = 0
    $Stream.SetLength(0)
    $Stream.Write($Bytes, 0, $Bytes.Length)
    $Stream.Flush($true)
}

function Get-WikiLogInitialBytes {
    $text = "# Project Log`n`n$script:WikiLogMarker`n"
    return $script:WikiLogUtf8NoBom.GetBytes($text)
}

function Assert-WikiLogField {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [AllowNull()][string]$Value
    )
    if ([string]::IsNullOrWhiteSpace($Value)) { throw "FAIL: $Name must not be empty." }
    if ($Value -match "[`r`n`0]") { throw "FAIL: $Name must be a single line without NUL." }
    if ($Value -cne $Value.Trim()) { throw "FAIL: $Name must not have leading or trailing whitespace." }
}

function Get-WikiLogTimestamp {
    param([string]$Timestamp = '')
    if ([string]::IsNullOrWhiteSpace($Timestamp)) { return (Get-Date -Format 'yyyy-MM-dd HH:mm') }
    $parsed = [DateTime]::MinValue
    if (-not [DateTime]::TryParseExact(
        $Timestamp,
        'yyyy-MM-dd HH:mm',
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::None,
        [ref]$parsed
    )) { throw 'FAIL: Timestamp must use yyyy-MM-dd HH:mm and contain a real local date/time.' }
    return $Timestamp
}
