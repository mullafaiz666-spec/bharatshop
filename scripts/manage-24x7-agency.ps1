param(
  [ValidateSet("Install", "Start", "Stop", "Status", "Uninstall")]
  [string]$Mode = "Status"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Supervisor = Join-Path $PSScriptRoot "run-24x7-agency.ps1"
$TaskName = "BharatShop-Agency-24x7"
$StateHome = if (-not [string]::IsNullOrWhiteSpace($env:BHARATSHOP_AGENCY_STATE_HOME)) {
  $env:BHARATSHOP_AGENCY_STATE_HOME
} else {
  Join-Path $env:LOCALAPPDATA "BharatShop\Agency24x7"
}
$HeartbeatFile = Join-Path $StateHome "heartbeat.json"
$SupervisorLog = Join-Path $StateHome "supervisor.log"
$WorkerLog = Join-Path $StateHome "worker.log"

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-TaskSafe {
  return Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

function Show-Status {
  $task = Get-TaskSafe
  Write-Host "`n=== BharatShop 24x7 Agency ===" -ForegroundColor Cyan
  Write-Host "TASK INSTALLED: $([bool]($null -ne $task))"
  if ($task) {
    Write-Host "TASK STATE: $($task.State)"
    try {
      $info = Get-ScheduledTaskInfo -TaskName $TaskName
      Write-Host "LAST RUN: $($info.LastRunTime)"
      Write-Host "LAST RESULT: $($info.LastTaskResult)"
      Write-Host "NEXT RUN: $($info.NextRunTime)"
    } catch {}
  }

  if (Test-Path $HeartbeatFile) {
    try {
      $heartbeat = Get-Content $HeartbeatFile -Raw | ConvertFrom-Json
      Write-Host "SUPERVISOR STATE: $($heartbeat.state)"
      Write-Host "WORKER STATE: $($heartbeat.workerState)"
      Write-Host "UPDATED: $($heartbeat.updatedAt)"
      Write-Host "ORIGIN: $($heartbeat.origin)"
      Write-Host "LOCAL MODEL: $($heartbeat.localModel)"
      Write-Host "OLLAMA: $($heartbeat.ollama)"
      Write-Host "STOREFRONT READY: $($heartbeat.originReady)"
      Write-Host "WATCHDOG RESTARTS: $($heartbeat.restartCount)"
    } catch {
      Write-Host "HEARTBEAT: unreadable ($($_.Exception.Message))" -ForegroundColor Yellow
    }
  } else {
    Write-Host "HEARTBEAT: not written yet" -ForegroundColor Yellow
  }

  Write-Host "STATE HOME: $StateHome"
  Write-Host "SUPERVISOR LOG: $SupervisorLog"
  Write-Host "WORKER LOG: $WorkerLog"
}

switch ($Mode) {
  "Install" {
    if (!(Test-Path $Supervisor)) { throw "24x7 supervisor is missing: $Supervisor" }
    New-Item -ItemType Directory -Path $StateHome -Force | Out-Null

    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $powershell = (Get-Command powershell.exe).Source
    $arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Supervisor`""
    $action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $Root
    $settings = New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries `
      -StartWhenAvailable `
      -RestartCount 999 `
      -RestartInterval (New-TimeSpan -Minutes 1) `
      -ExecutionTimeLimit ([TimeSpan]::Zero) `
      -MultipleInstances IgnoreNew

    $isAdmin = Test-IsAdministrator
    if ($isAdmin) {
      $triggers = @(
        (New-ScheduledTaskTrigger -AtStartup),
        (New-ScheduledTaskTrigger -AtLogOn -User $currentUser)
      )
      $principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType S4U -RunLevel Highest
      Write-Host "Installing startup + logon task using the current Windows account." -ForegroundColor Cyan
    } else {
      $triggers = @((New-ScheduledTaskTrigger -AtLogOn -User $currentUser))
      $principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
      Write-Host "Installing logon task without elevation. Run once as Administrator later if you want pre-login startup." -ForegroundColor Yellow
    }

    $task = New-ScheduledTask -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description "BharatShop local Ollama agency supervisor with watchdog. Ollama remains private on localhost and high-impact actions stay guarded by the app."
    Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 3
    Write-Host "BharatShop 24x7 agency task installed and started." -ForegroundColor Green
    Show-Status
  }

  "Start" {
    $task = Get-TaskSafe
    if (!$task) { throw "Task $TaskName is not installed. Run the Install mode first." }
    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 2
    Show-Status
  }

  "Stop" {
    $task = Get-TaskSafe
    if ($task) {
      Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
      Write-Host "BharatShop 24x7 agency task stopped." -ForegroundColor Yellow
    }
    Show-Status
  }

  "Uninstall" {
    $task = Get-TaskSafe
    if ($task) {
      Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
      Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
      Write-Host "BharatShop 24x7 agency scheduled task removed. Logs and heartbeat were preserved." -ForegroundColor Green
    } else {
      Write-Host "BharatShop 24x7 agency task is not installed."
    }
  }

  default {
    Show-Status
  }
}
