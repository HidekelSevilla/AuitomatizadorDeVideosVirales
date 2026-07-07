# flowbot_status.ps1 - estado de los servicios del autopiloto.
function Test-Proc([string]$match) {
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like $match } | Select-Object -First 1
}
$dev = Test-Proc '*reload-server.mjs*'
$ren = Test-Proc '*build.mjs*--watch*'
$tel = Test-Proc '*telegram-bridge.mjs*'
if ($dev) { Write-Host "[OK] dev-server activo   (PID $($dev.ProcessId))." } else { Write-Host "[--] dev-server apagado." }
if ($ren) { Write-Host "[OK] render watch activo (PID $($ren.ProcessId))." } else { Write-Host "[--] render watch apagado." }
if ($tel) { Write-Host "[OK] telegram bridge activo (PID $($tel.ProcessId))." } else { Write-Host "[--] telegram bridge apagado/opcional." }
$port = Get-NetTCPConnection -LocalPort 35729 -State Listen -ErrorAction SilentlyContinue
if ($port) { Write-Host "[OK] Puerto 35729 escuchando (puente listo)." } else { Write-Host "[--] Puerto 35729 cerrado." }
Write-Host "Falta tuyo: Chrome con Flow abierto + extension recargada en chrome://extensions."
