# flowbot_start.ps1 - levanta los 2 procesos del autopiloto:
#   1) dev-server (puente extension <-> disco, puerto 35729): /secrets /save /move /queue /charfile
#   2) render watch de Remotion: renderiza cada video cuando sus medios estan listos (no gasta tokens)
# Evita duplicados (chequea la linea de comando), arranca en ventana minimizada y verifica.
$ErrorActionPreference = "Stop"
$Root     = Split-Path -Parent $PSScriptRoot
$Remotion = Join-Path $Root "remotion-editor"

function Test-Proc([string]$match) {
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like $match } | Select-Object -First 1
}

# 1. dev-server
if (Test-Proc '*reload-server.mjs*') {
  Write-Host "[OK] dev-server ya estaba corriendo."
} else {
  Write-Host "[*] Iniciando dev-server (puente, puerto 35729)..."
  Start-Process node -ArgumentList 'dev/reload-server.mjs' -WorkingDirectory $Root -WindowStyle Minimized
  Start-Sleep -Seconds 2
}

# 2. render watch
if (Test-Proc '*build.mjs*--watch*') {
  Write-Host "[OK] render watch ya estaba corriendo."
} else {
  Write-Host "[*] Iniciando render watch (Remotion)..."
  Start-Process node -ArgumentList 'orchestrator/build.mjs','--watch' -WorkingDirectory $Remotion -WindowStyle Minimized
  Start-Sleep -Seconds 2
}

# 3. estado final
& (Join-Path $PSScriptRoot "flowbot_status.ps1")
