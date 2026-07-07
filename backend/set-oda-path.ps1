param(
  [string]$Config = "C:\drawing\backend\dwg-service.json",
  [string[]]$SearchRoots = @(
    "C:\Program Files",
    "C:\Program Files (x86)"
  ),
  [string[]]$ExecutableNames = @(
    "ODAFileConverter.exe",
    "TeighaFileConverter.exe"
  )
)

$configPath = [System.IO.Path]::GetFullPath($Config)

if (-not (Test-Path -LiteralPath $configPath)) {
  Write-Error "Не найден конфиг: $configPath"
  exit 1
}

$found = foreach ($root in $SearchRoots) {
  if (Test-Path -LiteralPath $root) {
    foreach ($exeName in $ExecutableNames) {
      Get-ChildItem -LiteralPath $root -Filter $exeName -File -Recurse -ErrorAction SilentlyContinue
    }
  }
}

$registryCandidates = @(
  "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
  "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
) | ForEach-Object {
  Get-ItemProperty $_ -ErrorAction SilentlyContinue
} | Where-Object {
  $_.DisplayName -match "ODA|Teigha|Open Design Alliance"
} | ForEach-Object {
  @($_.InstallLocation, $_.DisplayIcon)
} | Where-Object { $_ } | ForEach-Object {
  $value = $_.Trim('"')
  if (Test-Path -LiteralPath $value -PathType Leaf) {
    Get-Item -LiteralPath $value
  } elseif (Test-Path -LiteralPath $value -PathType Container) {
    foreach ($exeName in $ExecutableNames) {
      Get-ChildItem -LiteralPath $value -Filter $exeName -File -Recurse -ErrorAction SilentlyContinue
    }
  }
}

$exe = @($found) + @($registryCandidates) |
  Where-Object { $_ } |
  Sort-Object FullName |
  Select-Object -First 1 -ExpandProperty FullName

if (-not $exe) {
  Write-Error "Не найден ODA/Teigha File Converter. Проверены диски/каталоги: $($SearchRoots -join ', ') и типовые записи реестра."
  exit 1
}

$json = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json

if (-not $json.converter) {
  Write-Error "В конфиге отсутствует секция converter"
  exit 1
}

if (-not $json.converter.command_template -or $json.converter.command_template.Count -lt 1) {
  Write-Error "В конфиге отсутствует converter.command_template"
  exit 1
}

$json.converter.command_template[0] = $exe

$json | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $configPath -Encoding UTF8

Write-Host "Найден ODAFileConverter.exe:"
Write-Host "  $exe"
Write-Host "Обновлён конфиг:"
Write-Host "  $configPath"
