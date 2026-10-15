param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$webRoot = $PSScriptRoot
$runtime = Join-Path $webRoot 'runtime\node.exe'
$serverEntry = Join-Path $webRoot 'runtime\resources\app\server.cjs'
$dataDir = Join-Path $webRoot 'data'
$launchFile = Join-Path $dataDir 'launch.json'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

# Admin must open as its own entry point. It shares the same local server/database, but
# never routes the operator through the customer Studio page.
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
Remove-Item -LiteralPath (Join-Path $dataDir 'server-error.log') -Force -ErrorAction SilentlyContinue
function Test-WebHealth($Origin, [int]$TimeoutSec = 2) {
  try {
    $health = Invoke-RestMethod -Uri ($Origin + '/health') -TimeoutSec $TimeoutSec
    return [bool]$health.ok
  } catch {
    return $false
  }
}
function Read-LaunchFile {
  if (!(Test-Path -LiteralPath $launchFile)) { return $null }
  try {
    return Get-Content -Raw -LiteralPath $launchFile | ConvertFrom-Json
  } catch {
    Remove-Item -LiteralPath $launchFile -Force -ErrorAction SilentlyContinue
    return $null
  }
}
$existing = $null
if (Test-Path -LiteralPath $launchFile) {
  $existing = Read-LaunchFile
  $serverProcess = if ($existing) { Get-Process -Id $existing.pid -ErrorAction SilentlyContinue } else { $null }
  if (!$existing -or !$serverProcess -or $serverProcess.Path -ne $runtime) {
    Remove-Item -LiteralPath $launchFile -Force -ErrorAction SilentlyContinue
    $existing = $null
  } else {
    if (!(Test-WebHealth $existing.origin 2)) {
      Remove-Item -LiteralPath $launchFile -Force -ErrorAction SilentlyContinue
      $existing = $null
    }
  }
}

if (!$existing) {
  $lastExitError = $null
  for ($attempt = 0; $attempt -lt 2 -and !$existing; $attempt++) {
    $env:ELECTRON_RUN_AS_NODE = $null
    $env:NP_WEB_DATA = $dataDir
    $env:NP_WEB_PORT = [string]$webPort
    Remove-Item -LiteralPath $launchFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $startupError -Force -ErrorAction SilentlyContinue
    $process = Start-Process -FilePath $runtime -ArgumentList ('"' + $serverEntry + '"') -WorkingDirectory (Split-Path $runtime) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataDir 'server.log') -RedirectStandardError (Join-Path $dataDir 'server-error.log')
    $deadline = (Get-Date).AddSeconds(30)
    do {
      Start-Sleep -Milliseconds 300
      if ($process.HasExited) {
        $lastExitError = if (Test-Path -LiteralPath $startupError) { Get-Content -Raw -LiteralPath $startupError } else { '' }
        if ($lastExitError -match 'EADDRINUSE') {
          $webPort = Find-WebPort ($webPort + 1)
          break
        }
        throw "Web server exited. Check data\server-error.log and data\startup-error.txt."
      }
      $candidate = Read-LaunchFile
      if ($candidate -and $candidate.pid -eq $process.Id) { $existing = $candidate; break }
    } while ((Get-Date) -lt $deadline)
  }
  if (!$existing) { throw 'Web server did not become ready within 30 seconds.' }
}

$healthy = $false
for ($i = 0; $i -lt 10 -and !$healthy; $i++) {
  $healthy = Test-WebHealth $existing.origin 2
  if (!$healthy) { Start-Sleep -Milliseconds 500 }
}
if (!$healthy) { Write-Warning 'Web server health check did not respond yet; opening admin URL from launch file.' }

$adminUrl = $existing.url + '&next=/backoffice/admin.html'
Write-Host ('Digital NP Studio Admin: ' + $adminUrl)
if (!$NoBrowser) { Start-Process $adminUrl }
