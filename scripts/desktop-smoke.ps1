[CmdletBinding()]
param(
  [string]$ExePath = "C:\drawing\dist\DrawingApp.exe",
  [int]$StartupTimeoutSec = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($PSVersionTable.PSVersion.Major -lt 7) {
  throw "Use PowerShell 7+ (pwsh) to run desktop-smoke.ps1."
}

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$backendDir = Join-Path $repoRoot "backend"
$mockConfigPath = Join-Path $backendDir "dwg-service.mock.json"

if (-not (Test-Path -LiteralPath $ExePath)) {
  throw "Desktop executable not found: $ExePath"
}
if (-not (Test-Path -LiteralPath $mockConfigPath)) {
  throw "Mock config not found: $mockConfigPath"
}

function Get-ProcessTreeIds {
  param([int]$RootProcessId)

  $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
  $queue = [System.Collections.Generic.Queue[int]]::new()
  $ids = [System.Collections.Generic.HashSet[int]]::new()
  $queue.Enqueue($RootProcessId)

  while ($queue.Count -gt 0) {
    $current = $queue.Dequeue()
    if (-not $ids.Add($current)) {
      continue
    }
    foreach ($child in $all | Where-Object { $_.ParentProcessId -eq $current }) {
      $queue.Enqueue([int]$child.ProcessId)
    }
  }

  return @($ids)
}

function Stop-ProcessTree {
  param([int]$RootProcessId)

  $ids = Get-ProcessTreeIds -RootProcessId $RootProcessId | Sort-Object -Descending
  foreach ($id in $ids) {
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  }
}

$python = (Get-Command python).Source
$tempConfigPath = Join-Path $env:TEMP ("drawing-desktop-smoke-{0}.json" -f [guid]::NewGuid().ToString("N"))
$mockConfig = Get-Content -LiteralPath $mockConfigPath -Raw | ConvertFrom-Json
$mockConfig.converter.command_template[0] = $python
$mockConfig | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $tempConfigPath -Encoding UTF8

$process = $null
try {
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $ExePath
  $startInfo.WorkingDirectory = Split-Path -Parent $ExePath
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.Environment["DRAWING_DWG_CONFIG"] = $tempConfigPath

  $process = [System.Diagnostics.Process]::Start($startInfo)
  if (-not $process) {
    throw "Failed to start desktop executable."
  }

  $deadline = (Get-Date).AddSeconds($StartupTimeoutSec)
  $backendHealth = $null
  $backendReady = $false
  $uiPort = $null

  while ((Get-Date) -lt $deadline) {
    if ($process.HasExited) {
      throw "Desktop executable exited early with code $($process.ExitCode)."
    }

    try {
      $backendHealth = Invoke-RestMethod -Uri "http://127.0.0.1:8765/health" -TimeoutSec 2
      $backendReady = $true
    } catch {
      # keep the last successful payload; UI port detection may lag slightly behind backend startup
    }

    $treeIds = Get-ProcessTreeIds -RootProcessId $process.Id
    $uiPort = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $_.OwningProcess -in $treeIds -and $_.LocalPort -ne 8765 } |
      Select-Object -First 1 -ExpandProperty LocalPort

    if ($backendReady -and $uiPort) {
      break
    }

    Start-Sleep -Milliseconds 300
  }

  if (-not $backendReady) {
    throw "Embedded backend did not respond on 127.0.0.1:8765."
  }
  if (-not $uiPort) {
    throw "UI server port was not detected."
  }

  $uiResponse = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/index.html" -f $uiPort) -TimeoutSec 5
  if ($uiResponse.StatusCode -ne 200 -or $uiResponse.Content -notmatch "Учебное двумерное черчение") {
    throw "UI server did not return the expected application page."
  }

  [pscustomobject]@{
    ExePath = $ExePath
    RootPid = $process.Id
    UiPort = $uiPort
    Backend = $backendHealth
  } | ConvertTo-Json -Depth 10
} finally {
  if ($process) {
    Stop-ProcessTree -RootProcessId $process.Id
  }
  Remove-Item -LiteralPath $tempConfigPath -Force -ErrorAction SilentlyContinue
}
