param(
  [string]$Origin = "",
  [int]$PollSeconds = 20,
  [int]$RestartDelaySeconds = 10,
  [string]$Model = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$EnvFile = Join-Path $Root ".env.local"
$AutopilotScript = Join-Path $PSScriptRoot "run-company-autopilot.ps1"
$LocalWorkerScript = Join-Path $PSScriptRoot "run-local-company-worker.mjs"
$ShimScript = Join-Path $Root "services\ollama-qwen-shim\server.mjs"

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

function Import-EnvMap([hashtable]$Map) {
  foreach ($key in $Map.Keys) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($key, "Process"))) {
      [Environment]::SetEnvironmentVariable($key, [string]$Map[$key], "Process")
    }
  }
}

$envMap = Read-EnvFile $EnvFile
Import-EnvMap $envMap

if ([string]::IsNullOrWhiteSpace($Origin)) {
  if (-not [string]::IsNullOrWhiteSpace($env:BHARATSHOP_AGENT_ORIGIN)) {
    $Origin = $env:BHARATSHOP_AGENT_ORIGIN
  } elseif (-not [string]::IsNullOrWhiteSpace($env:BHARATSHOP_PUBLIC_ORIGIN)) {
    $Origin = $env:BHARATSHOP_PUBLIC_ORIGIN
  } else {
    $Origin = "http://127.0.0.1:3000"
  }
}
$Origin = $Origin.TrimEnd('/')

if ([string]::IsNullOrWhiteSpace($Model)) {
  if (-not [string]::IsNullOrWhiteSpace($env:PERSONAL_AI_MODEL)) {
    $Model = $env:PERSONAL_AI_MODEL
  } elseif (-not [string]::IsNullOrWhiteSpace($env:AI_TEXT_MODEL)) {
    $Model = $env:AI_TEXT_MODEL
  } else {
    $Model = "qwen3.5:4b"
  }
}

$StateHome = if (-not [string]::IsNullOrWhiteSpace($env:BHARATSHOP_AGENCY_STATE_HOME)) {
  $env:BHARATSHOP_AGENCY_STATE_HOME
} else {
  Join-Path $env:LOCALAPPDATA "BharatShop\Agency24x7"
}
New-Item -ItemType Directory -Path $StateHome -Force | Out-Null
$SupervisorLog = Join-Path $StateHome "supervisor.log"
$WorkerLog = Join-Path $StateHome "worker.log"
$HeartbeatFile = Join-Path $StateHome "heartbeat.json"

function Write-Log([string]$Message, [string]$Level = "INFO") {
  $line = "{0} [{1}] {2}" -f (Get-Date).ToUniversalTime().ToString("o"), $Level, $Message
  Add-Content -Path $SupervisorLog -Value $line -Encoding UTF8
  Write-Host $line
}

function Test-IsLocalOrigin([string]$Value) {
  try {
    $uri = [Uri]$Value
    return @("127.0.0.1", "localhost", "::1") -contains $uri.Host.ToLowerInvariant()
  } catch {
    return $false
  }
}

function Test-OriginReady {
  try {
    $response = Invoke-WebRequest -Uri "$Origin/api/health" -UseBasicParsing -TimeoutSec 8
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Find-Ollama {
  $command = Get-Command ollama.exe -ErrorAction SilentlyContinue
  if ($command -and $command.Source) { return $command.Source }
  $candidates = @()
  if ($env:LOCALAPPDATA) { $candidates += (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe") }
  if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles "Ollama\ollama.exe") }
  return ($candidates | Where-Object { Test-Path $_ } | Select-Object -First 1)
}

function Test-OllamaReady {
  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5
    return $null -ne $response
  } catch {
    return $false
  }
}

function Ensure-Ollama {
  if (!(Test-OllamaReady)) {
    $ollama = Find-Ollama
    if ([string]::IsNullOrWhiteSpace($ollama)) {
      throw "Ollama is not installed or could not be located."
    }
    Write-Log "Starting private Ollama runtime on 127.0.0.1:11434."
    $env:OLLAMA_HOST = "127.0.0.1:11434"
    $env:OLLAMA_NUM_PARALLEL = "1"
    $env:OLLAMA_MAX_LOADED_MODELS = "1"
    Start-Process -FilePath $ollama -ArgumentList "serve" -WindowStyle Hidden | Out-Null
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Seconds 1
      if (Test-OllamaReady) { break }
    }
  }

  if (!(Test-OllamaReady)) {
    throw "Ollama did not become ready on 127.0.0.1:11434."
  }

  $tags = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 10
  $models = @($tags.models | ForEach-Object { if ($_.name) { $_.name } elseif ($_.model) { $_.model } })
  if ($models -notcontains $Model) {
    $ollama = Find-Ollama
    if ([string]::IsNullOrWhiteSpace($ollama)) { throw "Ollama executable was not found for model setup." }
    Write-Log "Local model $Model is missing; downloading it through Ollama."
    & $ollama pull $Model
    if ($LASTEXITCODE -ne 0) { throw "Ollama could not pull $Model." }
  }
}

function Test-ShimReady {
  try {
    $status = Invoke-RestMethod -Uri "http://127.0.0.1:11555/health" -TimeoutSec 5
    return ($status.ok -eq $true -and @($status.models) -contains $Model)
  } catch {
    return $false
  }
}

function Ensure-QwenShim {
  if (Test-ShimReady) { return }
  if (!(Test-Path $ShimScript)) { throw "Ollama Qwen shim is missing: $ShimScript" }
  Write-Log "Starting private BharatShop Qwen shim on 127.0.0.1:11555."
  $env:OLLAMA_BASE_URL = "http://127.0.0.1:11434"
  Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @($ShimScript) -WindowStyle Hidden -WorkingDirectory $Root | Out-Null
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    if (Test-ShimReady) { return }
  }
  throw "Private Qwen shim did not become ready on 127.0.0.1:11555."
}

function Get-AutomationToken {
  if (-not [string]::IsNullOrWhiteSpace($env:BHARATSHOP_AUTOMATION_TOKEN)) { return $env:BHARATSHOP_AUTOMATION_TOKEN }
  if (-not [string]::IsNullOrWhiteSpace($env:AUTOMATION_TOKEN)) { return $env:AUTOMATION_TOKEN }
  return ""
}

function Invoke-RemoteSchedule([string]$Token) {
  $headers = @{
    Authorization = "Bearer $Token"
    "x-automation-token" = $Token
  }
  $response = Invoke-WebRequest -Uri "$Origin/api/automation/free-stack-schedule" -Method POST -Headers $headers -ContentType "application/json" -Body "{}" -UseBasicParsing -TimeoutSec 45
  return ($response.Content | ConvertFrom-Json)
}

function Write-Heartbeat([string]$State, [int]$RestartCount, [string]$WorkerState = "", [string]$Detail = "") {
  $payload = [ordered]@{
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
    supervisorPid = $PID
    state = $State
    workerState = $WorkerState
    restartCount = $RestartCount
    origin = $Origin
    localModel = $Model
    ollama = if (Test-OllamaReady) { "READY" } else { "DOWN" }
    qwenShim = if (Test-ShimReady) { "READY" } else { "DOWN" }
    originReady = [bool](Test-OriginReady)
    detail = $Detail
  }
  $payload | ConvertTo-Json -Depth 4 | Set-Content -Path $HeartbeatFile -Encoding UTF8
}

if (!(Test-Path $AutopilotScript)) { throw "Company autopilot worker is missing: $AutopilotScript" }
if (!(Test-Path $LocalWorkerScript)) { throw "Local company worker is missing: $LocalWorkerScript" }

$env:PERSONAL_AI_MODEL = $Model
$env:AGENCY_MODEL = $Model
$env:AI_PROVIDER = "local-openai-compatible"
$env:AI_BASE_URL = "http://127.0.0.1:11555"
$env:AI_TEXT_MODEL = $Model
$env:LOCAL_AI_BASE_URL = "http://127.0.0.1:11555"
$env:LOCAL_AI_TEXT_MODEL = $Model
$env:PERSONAL_AI_CONTEXT = if ($env:PERSONAL_AI_CONTEXT) { $env:PERSONAL_AI_CONTEXT } else { "4096" }
$env:AGENCY_CONTEXT = if ($env:AGENCY_CONTEXT) { $env:AGENCY_CONTEXT } else { "4096" }

Write-Log "BharatShop 24x7 agency supervisor starting. Origin=$Origin Model=$Model"
Write-Log "Ollama and the Qwen compatibility shim remain private on loopback only."

$isLocalOrigin = Test-IsLocalOrigin $Origin
$restartCount = 0
$lastScheduleDate = ""

while ($true) {
  try {
    Ensure-Ollama
    Ensure-QwenShim

    if ($isLocalOrigin) {
      Write-Heartbeat "STARTING_LOCAL_AUTOPILOT" $restartCount "STARTING" "Local development mode"
      Write-Log "Starting guarded local BharatShop company-agent loop."
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $AutopilotScript -Mode Loop -Origin $Origin -PollSeconds ([Math]::Max(10, $PollSeconds)) *>> $WorkerLog
      $restartCount += 1
      Write-Heartbeat "RESTARTING" $restartCount "STOPPED" "Local autopilot exited"
      Start-Sleep -Seconds ([Math]::Max(5, $RestartDelaySeconds))
      continue
    }

    $token = Get-AutomationToken
    if ([string]::IsNullOrWhiteSpace($token)) {
      Write-Heartbeat "BLOCKED_CONFIGURATION" $restartCount "NOT_STARTED" "Remote worker requires a private automation token"
      Write-Log "Remote 24x7 worker is blocked until BHARATSHOP_AUTOMATION_TOKEN is paired with the live site." "WARN"
      Start-Sleep -Seconds 60
      continue
    }

    if (!(Test-OriginReady)) {
      Write-Heartbeat "WAITING_FOR_STOREFRONT" $restartCount "NOT_STARTED" "Live health endpoint unavailable"
      Write-Log "Live BharatShop health endpoint is unavailable; waiting without replacing the storefront." "WARN"
      Start-Sleep -Seconds 30
      continue
    }

    $utcDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
    if ($utcDate -ne $lastScheduleDate) {
      try {
        $schedule = Invoke-RemoteSchedule $token
        Write-Log "Daily company plan checked: status=$($schedule.status) newTasks=$($schedule.newlyQueuedCount)."
        $lastScheduleDate = $utcDate
      } catch {
        Write-Heartbeat "BLOCKED_AUTH_OR_SCHEDULE" $restartCount "NOT_STARTED" "Live schedule call failed"
        Write-Log "Live schedule call failed; verify the paired automation token and deployment configuration." "ERROR"
        Start-Sleep -Seconds 60
        continue
      }
    }

    & node.exe $LocalWorkerScript --check *>> $WorkerLog
    if ($LASTEXITCODE -ne 0) {
      Write-Heartbeat "BLOCKED_CONFIGURATION" $restartCount "NOT_STARTED" "Shared database/revision/local-worker gate not yet accepted"
      Write-Log "Local company worker preflight is blocked. No production task was claimed." "WARN"
      Start-Sleep -Seconds 60
      continue
    }

    Write-Heartbeat "RUNNING" $restartCount "CLAIMING_ONE" "Local Ollama worker connected to the shared company queue"
    & node.exe $LocalWorkerScript *>> $WorkerLog
    if ($LASTEXITCODE -ne 0) {
      $restartCount += 1
      Write-Heartbeat "WORKER_ERROR" $restartCount "STOPPED" "Worker stopped; watchdog will retry"
      Write-Log "Local company worker did not finish cleanly; watchdog will retry without automatic replay of interrupted work." "ERROR"
      Start-Sleep -Seconds ([Math]::Max(10, $RestartDelaySeconds))
      continue
    }

    Write-Heartbeat "RUNNING" $restartCount "IDLE_OR_COMPLETED" "One guarded queue pass completed"
    Start-Sleep -Seconds ([Math]::Max(10, $PollSeconds))
  } catch {
    $restartCount += 1
    Write-Heartbeat "SUPERVISOR_ERROR" $restartCount "STOPPED" "Supervisor recovered from an error"
    Write-Log "Supervisor cycle error: $($_.Exception.Message)" "ERROR"
    Start-Sleep -Seconds ([Math]::Max(10, $RestartDelaySeconds))
  }
}
