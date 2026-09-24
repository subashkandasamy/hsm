# Start the mock Uyirly, or restart it if a previous step's copy is gone.
#
# GitHub Actions does not carry a step's background processes into the next
# step, so anything that needs the mock starts it itself. The server reloads
# received.json, so restarting does not lose what it has already recorded.

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$alive = $false
try {
  Invoke-WebRequest -Uri 'http://127.0.0.1:8787/api/device/ping' -UseBasicParsing -TimeoutSec 2 | Out-Null
  $alive = $true
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 401) { $alive = $true }
}
if ($alive) { Write-Host 'mock already running'; return }

Start-Process node -ArgumentList "$here\mock-server.mjs",'8787',"$here\..\received.json" `
  -RedirectStandardOutput "$here\..\mock.log" -RedirectStandardError "$here\..\mock.err"

foreach ($i in 1..40) {
  try {
    Invoke-WebRequest -Uri 'http://127.0.0.1:8787/api/device/ping' -UseBasicParsing -TimeoutSec 2 | Out-Null
    Write-Host 'mock started'; return
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 401) { Write-Host 'mock started'; return }
    Start-Sleep -Milliseconds 500
  }
}
Get-Content "$here\..\mock.err" -ErrorAction SilentlyContinue
throw 'mock server never came up'
