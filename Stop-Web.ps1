$ErrorActionPreference = 'Stop'
$runtime = Join-Path $PSScriptRoot 'runtime\node.exe'
$launchFile = Join-Path $PSScriptRoot 'data\launch.json'
if (!(Test-Path -LiteralPath $launchFile)) { Write-Host 'Web server is not running.'; exit 0 }
$launch = Get-Content -Raw -LiteralPath $launchFile | ConvertFrom-Json
$serverProcess = Get-Process -Id $launch.pid -ErrorAction SilentlyContinue
if ($serverProcess -and $serverProcess.Path -eq $runtime) {
  Stop-Process -Id $serverProcess.Id -Force
  $serverProcess.WaitForExit(10000) | Out-Null
  Remove-Item -LiteralPath $launchFile -Force -ErrorAction SilentlyContinue
  Write-Host 'Web server is stopping.'
} else {
  Remove-Item -LiteralPath $launchFile -Force -ErrorAction SilentlyContinue
  Write-Host 'Web server is not running.'
}
