param(
  [ValidateSet("Bootstrap", "Status", "Stop", "Dify", "LibreChat")]
  [string]$Mode = "Bootstrap"
)

$ErrorActionPreference = "Stop"

function Resolve-DockerCli {
  $existing = Get-Command docker -ErrorAction SilentlyContinue
  if ($existing) { return $existing.Source }

  $candidates = @(
    (Join-Path $env:ProgramFiles "Docker\Docker\resources\bin\docker.exe"),
    (Join-Path $env:ProgramFiles "Docker\Docker\resources\docker.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Docker\Docker\resources\bin\docker.exe")
  ) | Where-Object { $_ -and (Test-Path $_) }

  $docker = $candidates | Select-Object -First 1
  if ($docker) {
    $bin = Split-Path -Parent $docker
    if (($env:PATH -split ';') -notcontains $bin) { $env:PATH = "$bin;$env:PATH" }
    return $docker
  }
  return $null
}

function Ensure-DockerDesktopReady([int]$Seconds = 240) {
  $docker = Resolve-DockerCli
  if (!$docker) { return $false }

  try {
    & $docker info *> $null
    if ($LASTEXITCODE -eq 0) { return $true }
  } catch {}

  $desktop = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
  if (Test-Path $desktop) {
    if (!(Get-Process "Docker Desktop" -ErrorAction SilentlyContinue)) {
      Write-Host "Starting Docker Desktop..." -ForegroundColor Cyan
      Start-Process $desktop | Out-Null
    }
  }

  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    try {
      & $docker info *> $null
      if ($LASTEXITCODE -eq 0) { return $true }
    } catch {}
    Start-Sleep 3
  } while ((Get-Date) -lt $deadline)

  return $false
}

$needsDocker = $Mode -in @("Bootstrap", "Dify", "LibreChat")
$docker = Resolve-DockerCli

if ($needsDocker) {
  if (!$docker) {
    Write-Host "Docker CLI was not found. Install Docker Desktop, complete its first-run/WSL setup, then rerun this command." -ForegroundColor Yellow
  } elseif (!(Ensure-DockerDesktopReady)) {
    Write-Host "Docker Desktop is installed but its engine did not become ready. Open Docker Desktop, complete any WSL/restart prompt, then rerun this command." -ForegroundColor Yellow
  } else {
    Write-Host "Docker Desktop READY: $docker" -ForegroundColor Green
  }
} elseif ($docker) {
  $bin = Split-Path -Parent $docker
  if (($env:PATH -split ';') -notcontains $bin) { $env:PATH = "$bin;$env:PATH" }
}

& (Join-Path $PSScriptRoot "bootstrap-upstreams.ps1") -Mode $Mode
exit $LASTEXITCODE
