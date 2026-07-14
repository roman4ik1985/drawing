param(
    [switch]$BootstrapDependencies,
    [switch]$RegenerateIcon
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location "C:\drawing"

function Test-PythonModule {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ModuleName
    )

    python -c "import $ModuleName" *> $null
    return $LASTEXITCODE -eq 0
}

if ($BootstrapDependencies) {
    python -m pip install --upgrade pip
    python -m pip install pywebview pyinstaller
} else {
    $missingPackages = @()
    if (-not (Test-PythonModule -ModuleName "webview")) {
        $missingPackages += "pywebview"
    }
    if (-not (Test-PythonModule -ModuleName "PyInstaller")) {
        $missingPackages += "pyinstaller"
    }
    if ($missingPackages.Count -gt 0) {
        $scriptPath = Join-Path (Get-Location) "build_exe.ps1"
        throw "Missing Python packages: $($missingPackages -join ', '). Run `powershell -ExecutionPolicy Bypass -File $scriptPath -BootstrapDependencies` once, then repeat the build."
    }
}

$iconPath = Join-Path "assets" "drawing_app.ico"
if ($RegenerateIcon -or -not (Test-Path $iconPath)) {
    python .\tools\generate_icon.py
} else {
    Write-Host "Using existing icon at $iconPath"
}

pyinstaller `
  --noconfirm `
  --clean `
  --name DrawingApp `
  --onefile `
  --windowed `
  --icon "assets\\drawing_app.ico" `
  --add-data "index.html;." `
  --add-data "styles.css;." `
  --add-data "app.js;." `
  --add-data "backend;backend" `
  desktop_app.py
