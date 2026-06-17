# flowbot_stop.ps1 - detiene SOLO el dev-server y el render watch (por su linea de comando).
function Stop-Match([string]$match, [string]$label) {
  $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like $match }
  if ($procs) {
    foreach ($p in $procs) {
      try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Write-Host "[OK] $label detenido (PID $($p.ProcessId))." }
      catch { Write-Host "[!] No pude detener $label (PID $($p.ProcessId)): $_" }
    }
  } else { Write-Host "[--] $label no estaba corriendo." }
}
Stop-Match '*reload-server.mjs*' 'dev-server'
Stop-Match '*build.mjs*--watch*'  'render watch'
