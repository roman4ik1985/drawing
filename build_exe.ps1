Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location "C:\drawing"

python -m pip install --upgrade pip
python -m pip install pywebview pyinstaller
python .\tools\generate_icon.py

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
