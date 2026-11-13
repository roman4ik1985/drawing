param(
  [string]$Config = ""
)

Set-Location -LiteralPath $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($Config)) {
  $Config = Join-Path $PSScriptRoot "dwg-service.json"
}

$configPath = [System.IO.Path]::GetFullPath($Config)
$examplePath = Join-Path $PSScriptRoot "dwg-service.example.json"

if (-not (Test-Path -LiteralPath $configPath)) {
  if (-not (Test-Path -LiteralPath $examplePath)) {
    Write-Error "Не найден конфиг '$configPath' и отсутствует шаблон '$examplePath'."
    exit 1
  }

  Copy-Item -LiteralPath $examplePath -Destination $configPath
  Write-Host "Создан конфиг из шаблона: $configPath"
  Write-Host "Проверьте converter.command_template и при необходимости отредактируйте файл перед повторным запуском."
  exit 1
}

python .\dwg_service.py --config $Config
