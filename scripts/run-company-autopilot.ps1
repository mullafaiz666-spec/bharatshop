param(
  [ValidateSet("Status", "Once", "Drain", "Loop")]
  [string]$Mode = "Loop",
  [string]$Origin = "http://127.0.0.1:3000",
  [int]$PollSeconds = 20
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$EnvFile = Join-Path $Root ".env.local"

function Read-EnvFile([string]$Path) {
  $map = @{}
  if (!(Test-Path $Path)) { return $map }
  Get-Content $Path | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      $map[$matches[1].Trim()] = $matches[2].Trim()
    }
  }
  return $map
}

function New-SecretToken {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return (($bytes | ForEach-Object { $_.ToString("x2") }) -join "")
}

function Upsert-Env([string]$Path, [string]$Key, [string]$Value) {
  $lines = @()
  if (Test-Path $Path) {
    $lines = @(Get-Content $Path | Where-Object { $_ -notmatch ("^\s*" + [regex]::Escape($Key) + "\s*=") })
  }
  $lines += "$Key=$Value"
  Set-Content -Path $Path -Value $lines -Encoding UTF8
}

function Invoke-BharatShopJson([string]$Url, [string]$Method = "GET", [hashtable]$Headers = @{}, [int]$TimeoutSec = 30) {
  $params = @{
    Uri = $Url
    Method = $Method
    Headers = $Headers
    UseBasicParsing = $true
    TimeoutSec = $TimeoutSec
  }
  if ($Method -ne "GET") {
    $params["ContentType"] = "application/json"
    $params["Body"] = "{}"
  }
  $response = Invoke-WebRequest @params
  if ([string]::IsNullOrWhiteSpace($response.Content)) { return @{} }
  return ($response.Content | ConvertFrom-Json)
}

function Test-AppReady {
  try {
    $health = Invoke-WebRequest -Uri "$Origin/api/health" -UseBasicParsing -TimeoutSec 4
    return ($health.StatusCode -ge 200 -and $health.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Stop-OnlyOriginListener {
  try {
    $uri = [Uri]$Origin
    $port = $uri.Port
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener -and $listener.OwningProcess) {
      Write-Host "Restarting only the process listening on port $port so the new automation token is loaded..." -ForegroundColor Yellow
      Stop-Process -Id $listener.OwningProcess -Force -ErrorAction Stop
      Start-Sleep -Seconds 2
    }
  } catch {
    Write-Warning "Could not restart the existing app listener automatically: $($_.Exception.Message)"
  }
}

function Start-LocalApp {
  Write-Host "Starting BharatShop locally with Webpack..." -ForegroundColor Cyan
  $command = "Set-Location '" + $Root.Replace("'", "''") + "'; npx.cmd next dev --webpack"
  Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-NoExit", "-Command", $command) | Out-Null
  for ($i = 0; $i -lt 90; $i++) {
    if (Test-AppReady) {
      Write-Host "BharatShop app READY at $Origin" -ForegroundColor Green
      return
    }
    Start-Sleep -Seconds 2
  }
  throw "BharatShop did not become ready at $Origin within 180 seconds."
}

$envMap = Read-EnvFile $EnvFile
$token = ""
if ($envMap.ContainsKey("BHARATSHOP_AUTOMATION_TOKEN")) { $token = [string]$envMap["BHARATSHOP_AUTOMATION_TOKEN"] }
if ([string]::IsNullOrWhiteSpace($token) -and $envMap.ContainsKey("AUTOMATION_TOKEN")) { $token = [string]$envMap["AUTOMATION_TOKEN"] }

$tokenCreated = $false
if ([string]::IsNullOrWhiteSpace($token)) {
  if ($Mode -eq "Status") {
    Write-Host "AUTOMATION TOKEN: NOT CONFIGURED" -ForegroundColor Yellow
  } else {
    $token = New-SecretToken
    Upsert-Env $EnvFile "BHARATSHOP_AUTOMATION_TOKEN" $token
    $tokenCreated = $true
    Write-Host "Generated a private BharatShop automation token in .env.local (value not printed)." -ForegroundColor Green
  }
}

$appWasReady = Test-AppReady
if ($Mode -ne "Status") {
  if ($tokenCreated -and $appWasReady) {
    Stop-OnlyOriginListener
    $appWasReady = $false
  }
  if (!$appWasReady) { Start-LocalApp }
}

if ($Mode -eq "Status") {
  Write-Host "`n=== BharatShop Autopilot Status ===" -ForegroundColor Cyan
  Write-Host "APP READY: $([bool](Test-AppReady))"
  Write-Host "AUTOMATION TOKEN CONFIGURED: $([bool](-not [string]::IsNullOrWhiteSpace($token)))"
  try {
    $agentHealth = Invoke-BharatShopJson "$Origin/api/health/agents" "GET" @{} 65
    Write-Host "AGENT SUITE: $($agentHealth.suite)"
    Write-Host "AGENTS READY: $($agentHealth.summary.ready) / $($agentHealth.summary.total)"
    Write-Host "ALL OPERATIONAL: $($agentHealth.allOperational)"
  } catch {
    Write-Host "AGENT HEALTH: BLOCKED ($($_.Exception.Message))" -ForegroundColor Yellow
  }
  exit 0
}

$headers = @{
  Authorization = "Bearer $token"
  "x-automation-token" = $token
}

Write-Host "`nQueueing the idempotent daily company plan..." -ForegroundColor Cyan
$schedule = Invoke-BharatShopJson "$Origin/api/automation/free-stack-schedule" "POST" $headers 45
Write-Host "PLAN STATUS: $($schedule.status) | NEW TASKS: $($schedule.newlyQueuedCount) | AGENTS: $($schedule.plannedAgentCount)" -ForegroundColor Green

function Run-OneCycle {
  try {
    $cycle = Invoke-BharatShopJson "$Origin/api/automation/company-cycle?limit=1" "POST" $headers 300
    if ($cycle.status -eq "QUEUED" -and [int]$cycle.claimed -eq 0) {
      Write-Host "WORKER DEFERRED: this host is configured to execute tasks in a separate worker." -ForegroundColor Yellow
      return @{ deferred = $true; claimed = 0 }
    }
    $claimed = [int]($cycle.claimed)
    if ($claimed -gt 0) {
      Write-Host "AGENT WORK COMPLETED/ATTEMPTED: $claimed | $((Get-Date).ToString('HH:mm:ss'))" -ForegroundColor Green
    } else {
      Write-Host "QUEUE IDLE: no queued work claimed | $((Get-Date).ToString('HH:mm:ss'))" -ForegroundColor DarkGray
    }
    return @{ deferred = $false; claimed = $claimed }
  } catch {
    Write-Host "AGENT CYCLE ERROR: $($_.Exception.Message)" -ForegroundColor Red
    return @{ deferred = $false; claimed = -1 }
  }
}

if ($Mode -eq "Once") {
  [void](Run-OneCycle)
  exit 0
}

if ($Mode -eq "Drain") {
  Write-Host "`nDraining the current company queue and exiting when no queued work remains..." -ForegroundColor Cyan
  $processed = 0
  while ($true) {
    $result = Run-OneCycle
    if ($result.deferred) {
      Write-Host "DRAIN DEFERRED: use the configured native worker to finish queued work." -ForegroundColor Yellow
      exit 2
    }
    if ([int]$result.claimed -lt 0) {
      Write-Host "DRAIN FAILED: a company cycle returned an error." -ForegroundColor Red
      exit 1
    }
    if ([int]$result.claimed -eq 0) {
      Write-Host "QUEUE DRAINED: $processed work item(s) processed in this run. BharatShop agent queue is finished for the current plan." -ForegroundColor Green
      exit 0
    }
    $processed += [int]$result.claimed
    Start-Sleep -Milliseconds 500
  }
}

Write-Host "`nBharatShop agents are now working from the shared queue." -ForegroundColor Green
Write-Host "Leave this window open. Press Ctrl+C to stop the worker. Hard approval gates remain enforced." -ForegroundColor Yellow

$lastScheduleDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
while ($true) {
  $result = Run-OneCycle
  if ($result.deferred) { break }

  $utcDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
  if ($utcDate -ne $lastScheduleDate) {
    try {
      $schedule = Invoke-BharatShopJson "$Origin/api/automation/free-stack-schedule" "POST" $headers 45
      Write-Host "NEW DAILY PLAN: $($schedule.status)" -ForegroundColor Cyan
      $lastScheduleDate = $utcDate
    } catch {
      Write-Host "DAILY PLAN REFRESH ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
  }

  Start-Sleep -Seconds ([Math]::Max(10, $PollSeconds))
}
