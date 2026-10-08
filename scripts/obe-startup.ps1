<#
  OBE DUT - boot-time startup script, run by Task Scheduler
  (register it with scripts\register-startup-task.ps1; see docs\DEPLOYMENT.md step 8).

    1. Wait for PostgreSQL (try to start the local service if it is stopped)
    2. Bring back obe-backend / obe-frontend under PM2
         - nothing in PM2 yet   -> pm2 resurrect (list saved by `pm2 save`)
         - app missing          -> pm2 start ecosystem.config.cjs --only <app>
         - app stopped/errored  -> pm2 restart <app>
         - app already online   -> left alone (safe to run again by hand)
    3. Check ports 4000 / 5173 and write the result to <repo>\logs\obe-startup.log

  Kept ASCII-only on purpose: Windows PowerShell 5.1 reads a BOM-less .ps1 in the
  system code page, so non-ASCII text here would be garbled.
#>
param(
  [int]$DbWaitSeconds = 180,
  [int]$AppWaitSeconds = 60
)

$ErrorActionPreference = 'Continue'
$Root   = Split-Path -Parent $PSScriptRoot          # this file lives in <repo>\scripts
$Apps   = @('obe-backend', 'obe-frontend')
$LogDir = Join-Path $Root 'logs'
$Log    = Join-Path $LogDir 'obe-startup.log'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
if ((Test-Path $Log) -and (Get-Item $Log).Length -gt 1MB) { Move-Item $Log "$Log.old" -Force }

function Write-Log([string]$Message) {
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -Path $Log -Value $line -Encoding UTF8
  Write-Output $line
}

function Test-Port([string]$HostName, [int]$Port, [int]$TimeoutMs = 2000) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $ar = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $ar.AsyncWaitHandle.WaitOne($TimeoutMs)) { return $false }
    $client.EndConnect($ar)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Wait-Port([string]$HostName, [int]$Port, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Port $HostName $Port) { return $true }
    Start-Sleep -Seconds 3
  }
  return $false
}

function Invoke-Pm2 {
  # pm2 output goes to the log, one line at a time
  & $script:Pm2 @args 2>&1 | ForEach-Object { Write-Log "    $_" }
}

function Get-Pm2Apps {
  # `pm2 jlist` prints the JSON array on one line; it may also print "[PM2] ..." status lines
  # (e.g. when it has to start the daemon), so pick the last line that starts with "[" but not "[PM2".
  $json = & $script:Pm2 jlist 2>$null |
    Where-Object { $_ -match '^\s*\[' -and $_ -notmatch '^\s*\[PM2' } | Select-Object -Last 1
  if (-not $json) { return @() }
  # -InputObject, not a pipe: in PowerShell 5.1 a piped JSON array comes back as ONE object
  try { $parsed = ConvertFrom-Json -InputObject $json } catch { return @() }
  return $parsed
}

Write-Log "===== OBE DUT startup (user: $env:USERNAME, root: $Root) ====="

# ---- 0. node / pm2 on PATH (a scheduled task may start with a minimal PATH) ----
foreach ($dir in @((Join-Path $env:ProgramFiles 'nodejs'), (Join-Path $env:APPDATA 'npm'))) {
  if ((Test-Path $dir) -and ($env:Path -notlike "*$dir*")) { $env:Path = "$dir;$env:Path" }
}
$env:FORCE_COLOR = '0'                               # no ANSI colour codes in the log
$script:Pm2 = (Get-Command pm2.cmd -ErrorAction SilentlyContinue).Source
if (-not $script:Pm2) {
  Write-Log 'ERROR: pm2.cmd not found. Install it with: npm install -g pm2'
  exit 1
}
Write-Log "pm2: $script:Pm2"

# ---- 1. PostgreSQL ----
$dbHost = 'localhost'
$dbPort = 5432
$envFile = Join-Path $Root 'packages\backend\.env'
$urlLine = Get-Content $envFile -ErrorAction SilentlyContinue |
  Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if ($urlLine) {
  try {
    $uri = [Uri](($urlLine -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"'))
    $dbHost = $uri.Host
    if ($uri.Port -gt 0) { $dbPort = $uri.Port }
  } catch {
    Write-Log "WARN: cannot parse DATABASE_URL in $envFile; using ${dbHost}:${dbPort}"
  }
} else {
  Write-Log "WARN: DATABASE_URL not found in $envFile; using ${dbHost}:${dbPort}"
}

$svc = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($svc) {
  Write-Log "PostgreSQL service $($svc.Name): $($svc.Status) / StartType $($svc.StartType)"
  if ($svc.Status -ne 'Running') {
    try {
      Start-Service -Name $svc.Name -ErrorAction Stop
      Write-Log "Started service $($svc.Name)"
    } catch {
      Write-Log "WARN: cannot start $($svc.Name) ($($_.Exception.Message)); waiting for Windows to start it"
    }
  }
} else {
  Write-Log 'No local PostgreSQL service (database on another host?)'
}

if (Wait-Port $dbHost $dbPort $DbWaitSeconds) {
  Write-Log "Database reachable: ${dbHost}:${dbPort}"
} else {
  Write-Log "WARN: database ${dbHost}:${dbPort} not reachable after $DbWaitSeconds s; starting the apps anyway (backend connects on first request)"
}

# ---- 2. PM2: backend + frontend ----
Set-Location $Root
# @(...): a single result has no .Count in PowerShell 5.1
$list = @(Get-Pm2Apps)
if ($list.Count -eq 0) {
  Write-Log 'PM2 has no processes: pm2 resurrect'
  Invoke-Pm2 resurrect
  Start-Sleep -Seconds 3
  $list = @(Get-Pm2Apps)
}

$changed = $false
foreach ($app in $Apps) {
  $proc = $list | Where-Object { $_.name -eq $app } | Select-Object -First 1
  if (-not $proc) {
    Write-Log "$app not in PM2: pm2 start ecosystem.config.cjs --only $app"
    Invoke-Pm2 start (Join-Path $Root 'ecosystem.config.cjs') --only $app
    $changed = $true
  } elseif (@('online', 'launching') -notcontains $proc.pm2_env.status) {
    Write-Log "$app is $($proc.pm2_env.status): pm2 restart $app"
    Invoke-Pm2 restart $app
  } else {
    Write-Log "$app already $($proc.pm2_env.status)"
  }
}
if ($changed) {
  Write-Log 'pm2 save'
  Invoke-Pm2 save
}

# ---- 3. Verify ----
$ok = $true
foreach ($port in @(4000, 5173)) {
  if (Wait-Port '127.0.0.1' $port $AppWaitSeconds) {
    Write-Log "Port $port listening"
  } else {
    Write-Log "ERROR: port $port not listening after $AppWaitSeconds s (check: pm2 logs)"
    $ok = $false
  }
}
foreach ($p in (Get-Pm2Apps)) { Write-Log ('    {0,-14} {1}' -f $p.name, $p.pm2_env.status) }

if ($ok) {
  Write-Log 'Startup complete'
  exit 0
}
Write-Log 'Startup finished with errors'
exit 2
