param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$webRoot = $PSScriptRoot
$runtime = Join-Path $webRoot 'runtime\node.exe'
$serverEntry = Join-Path $webRoot 'runtime\resources\app\server.cjs'
$dataDir = Join-Path $webRoot 'data'
$launchFile = Join-Path $dataDir 'launch.json'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
# NP uses its own local SQLite database; no BMK connection is loaded.
function Test-LocalPortAvailable([int]$Port) {
  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse('127.0.0.1'), $Port)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($listener) { $listener.Stop() }
  }
}
function Find-WebPort([int]$Preferred) {
  if (Test-LocalPortAvailable $Preferred) { return $Preferred }
  for ($candidate = 4174; $candidate -le 4210; $candidate++) {
    if (Test-LocalPortAvailable $candidate) { return $candidate }
  }
  throw 'No available local web port between 4173 and 4210.'
}
$webPort = if ($env:NP_WEB_PORT) { [int]$env:NP_WEB_PORT } else { Find-WebPort 4173 }
$env:NP_WEB_PORT = [string]$webPort
$startupError = Join-Path $dataDir 'startup-error.txt'
Remove-Item -LiteralPath $startupError -Force -ErrorAction SilentlyContinue
$existing = $null
if (Test-Path -LiteralPath $launchFile) {
  $existing = Get-Content -Raw -LiteralPath $launchFile | ConvertFrom-Json
  $serverProcess = Get-Process -Id $existing.pid -ErrorAction SilentlyContinue
  if (!$serverProcess -or $serverProcess.Path -ne $runtime -or $existing.origin -ne "http://127.0.0.1:$webPort") {
    Remove-Item -LiteralPath $launchFile -Force -ErrorAction SilentlyContinue
    $existing = $null
  }
}
if (!$existing) {
  $env:ELECTRON_RUN_AS_NODE = $null
  $env:NP_WEB_DATA = $dataDir
  $process = Start-Process -FilePath $runtime -ArgumentList ('"' + $serverEntry + '"') -WorkingDirectory (Split-Path $runtime) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataDir 'server.log') -RedirectStandardError (Join-Path $dataDir 'server-error.log')
  $deadline = (Get-Date).AddSeconds(30)
  do {
    Start-Sleep -Milliseconds 300
    if ($process.HasExited) { throw "Web server exited. Check data\server-error.log and data\startup-error.txt." }
    if (Test-Path -LiteralPath $launchFile) {
      $candidate = Get-Content -Raw -LiteralPath $launchFile | ConvertFrom-Json
      if ($candidate.pid -eq $process.Id) { $existing = $candidate; break }
    }
  } while ((Get-Date) -lt $deadline)
  if (!$existing) { throw 'Web server did not become ready within 30 seconds.' }
}
$health = Invoke-RestMethod -Uri ($existing.origin + '/health') -TimeoutSec 5
if (!$health.ok) { throw 'Web server health check failed.' }
Write-Host ('Digital NP Studio Web: ' + $existing.origin)
if (!$NoBrowser) { Start-Process $existing.url }
