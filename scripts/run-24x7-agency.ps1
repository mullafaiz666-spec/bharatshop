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
$WorkerScript = Join-Path $PSScriptRoot "run-company-autopilot.ps1"

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

$envMap = Read-EnvFile $EnvFile

if ([string]::IsNullOrWhiteSpace($Origin)) {
  if (-not [string]::IsNullOrWhiteSpace($env:BHARATSHOP_AGENT_ORIGIN)) {
    $Origin = $env:BHARATSHOP_AGENT_ORIGIN
  } elseif ($envMap.ContainsKey("BHARATSHOP_AGENT_ORIGIN") -and -not [string]::IsNullOrWhiteSpace([string]$envMap["BHARATSHOP_AGENT_ORIGIN"])) {
    $Origin = [string]$envMap["BHARATSHOP_AGENT_ORIGIN"]
  } else {
    $Origin = "http://127.0.0.1:3000"
  }
}
$Origin = $Origin.TrimEnd('/')

if ([string]::IsNullOrWhiteSpace($Model)) {
  if (-not [string]::IsNullOrWhiteSpace($env:PERSONAL_AI_MODEL)) {
    $Model = $env:PERSONAL_AI_MODEL
  } elseif ($envMap.ContainsKey("PERSONAL_AI_MODEL") -and -not [string]::IsNullOrWhiteSpace([string]$envMap["PERSONAL_AI_MODEL"])) {
    $Model = [string]$envMap["PERSONAL_AI_MODEL"]
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
  $candidates = @(
    (Join-Path ($env:LOCALAPPDATA | ForEach-Object { $_ }) "Programs\Ollama\ollama.exe"),
    (Join-Path ($env:ProgramFiles | ForEach-Object { $_ }) "Ollama\ollama.exe")
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
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

function Get-AutomationToken {
  if (-not [string]::IsNullOrWhiteSpace($env:BHARATSHOP_AUTOMATION_TOKEN)) { return $env:BHARATSHOP_AUTOMATION_TOKEN }
  if ($envMap.ContainsKey("BHARATSHOP_AUTOMATION_TOKEN") -and -not [string]::IsNullOrWhiteSpace([string]$envMap["BHARATSHOP_AUTOMATION_TOKEN"])) {
    return [string]$envMap["BHARATSHOP_AUTOMATION_TOKEN"]
  }
  if (-not [string]::IsNullOrWhiteSpace($env:AUTOMATION_TOKEN)) { return $env:AUTOMATION_TOKEN }
  if ($envMap.ContainsKey("AUTOMATION_TOKEN") -and -not [string]::IsNullOrWhiteSpace([string]$envMap["AUTOMATION_TOKEN"])) {
    return [string]$envMap["AUTOMATION_TOKEN"]
  }
  return ""
}

function Write-Heartbeat([string]$State, [int]$RestartCount, [string]$WorkerState = "") {
  $payload = [ordered]@{
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
    supervisorPid = $PID
    state = $State
    workerState = $WorkerState
    restartCount = $RestartCount
    origin = $Origin
    localModel = $Model
    ollama = if (Test-OllamaReady) { "READY" } else { "DOWN" }
    originReady = [bool](Test-OriginReady)
  }
  $payload | ConvertTo-Json -Depth 4 | Set-Content -Path $HeartbeatFile -Encoding UTF8
}

if (!(Test-Path $WorkerScript)) {
  throw "Company autopilot worker is missing: $WorkerScript"
}

$isLocalOrigin = Test-IsLocalOrigin $Origin
if (!$isLocalOrigin -and [string]::IsNullOrWhiteSpace((Get-AutomationToken))) {
  throw "A remote BharatShop origin requires BHARATSHOP_AUTOMATION_TOKEN in .env.local, matching the live site's server-side token."
}

$env:PERSONAL_AI_MODEL = $Model
$env:AGENCY_MODEL = $Model
$env:OLLAMA_BASE_URL = "http://127.0.0.1:11434"
$env:PERSONAL_AI_CONTEXT = if ($env:PERSONAL_AI_CONTEXT) { $env:PERSONAL_AI_CONTEXT } else { "4096" }
$env:AGENCY_CONTEXT = if ($env:AGENCY_CONTEXT) { $env:AGENCY_CONTEXT } else { "4096" }

Write-Log "BharatShop 24x7 agency supervisor starting. Origin=$Origin Model=$Model"
Write-Log "Ollama stays private on 127.0.0.1; no public Ollama listener is created."

$restartCount = 0
while ($true) {
  try {
    Ensure-Ollama

    if (!$isLocalOrigin) {
      while (!(Test-OriginReady)) {
        Write-Heartbeat "WAITING_FOR_STOREFRONT" $restartCount "NOT_STARTED"
        Write-Log "Live BharatShop health endpoint is unavailable; waiting without exposing or replacing the storefront." "WARN"
        Start-Sleep -Seconds 30
      }
    }

    Write-Heartbeat "STARTING_WORKER" $restartCount "STARTING"
    Write-Log "Starting guarded BharatShop company-agent loop."

    $job = Start-Job -ScriptBlock {
      param($ScriptPath, $WorkerOrigin, $WorkerPoll, $WorkerRoot)
      Set-Location $WorkerRoot
      & $ScriptPath -Mode Loop -Origin $WorkerOrigin -PollSeconds $WorkerPoll
    } -ArgumentList $WorkerScript, $Origin, ([Math]::Max(10, $PollSeconds)), $Root

    try {
      while ($job.State -eq "Running") {
        $lines = @(Receive-Job -Job $job)
        if ($lines.Count -gt 0) {
          $text = ($lines | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
          Add-Content -Path $WorkerLog -Value $text -Encoding UTF8
        }
        Write-Heartbeat "RUNNING" $restartCount $job.State
        Start-Sleep -Seconds 10
        $job = Get-Job -Id $job.Id
      }

      $lines = @(Receive-Job -Job $job -ErrorAction SilentlyContinue)
      if ($lines.Count -gt 0) {
        $text = ($lines | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
        Add-Content -Path $WorkerLog -Value $text -Encoding UTF8
      }
      Write-Log "Company-agent worker exited with state $($job.State); watchdog will restart it." "WARN"
    } finally {
      if ($job) {
        Stop-Job -Job $job -ErrorAction SilentlyContinue
        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {
    Write-Log "Supervisor cycle error: $($_.Exception.Message)" "ERROR"
  }

  $restartCount += 1
  Write-Heartbeat "RESTARTING" $restartCount "STOPPED"
  Start-Sleep -Seconds ([Math]::Max(5, $RestartDelaySeconds))
}
