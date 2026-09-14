param(
  [string]$SiteId = "75b5c168-6679-479d-b3a6-244e393fe1b0",
  [string]$Origin = "https://bharatshop-35fd.netlify.app"
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
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllLines($Path, $lines, $utf8)
}

$envMap = Read-EnvFile $EnvFile
$token = ""
if ($envMap.ContainsKey("BHARATSHOP_AUTOMATION_TOKEN")) { $token = [string]$envMap["BHARATSHOP_AUTOMATION_TOKEN"] }
if ([string]::IsNullOrWhiteSpace($token) -and $envMap.ContainsKey("AUTOMATION_TOKEN")) { $token = [string]$envMap["AUTOMATION_TOKEN"] }
if ([string]::IsNullOrWhiteSpace($token)) { $token = New-SecretToken }

Upsert-Env $EnvFile "BHARATSHOP_AUTOMATION_TOKEN" $token
Upsert-Env $EnvFile "AUTOMATION_TOKEN" $token
Upsert-Env $EnvFile "BHARATSHOP_AGENT_ORIGIN" $Origin
Upsert-Env $EnvFile "BHARATSHOP_PUBLIC_ORIGIN" $Origin
Upsert-Env $EnvFile "PERSONAL_AI_MODEL" "qwen3.5:4b"
Upsert-Env $EnvFile "AI_PROVIDER" "local-openai-compatible"
Upsert-Env $EnvFile "AI_BASE_URL" "http://127.0.0.1:11555"
Upsert-Env $EnvFile "AI_TEXT_MODEL" "qwen3.5:4b"

try {
  $health = Invoke-RestMethod -Uri "$Origin/api/health" -TimeoutSec 20
  $revision = [string]$health.revision
  if ($revision -match '^[a-f0-9]{40}$') {
    Upsert-Env $EnvFile "BHARATSHOP_NATIVE_REVISION" $revision
  } else {
    Write-Host "Live revision was not available yet; the worker will remain safely blocked until a matching deployment is accepted." -ForegroundColor Yellow
  }
} catch {
  Write-Host "Live health check is currently unavailable; local configuration was preserved and no worker task was claimed." -ForegroundColor Yellow
}

Write-Host "Pairing the private worker token with the existing Netlify production Functions environment. The token value will not be printed." -ForegroundColor Cyan
# Netlify env:set requires the value argument. It is supplied only to the local CLI
# process and is never echoed by this script or committed to git.
& npx.cmd --yes netlify-cli@latest env:set BHARATSHOP_AUTOMATION_TOKEN $token --context production --scope functions --secret --site $SiteId
if ($LASTEXITCODE -ne 0) {
  throw "Netlify token pairing failed. Authenticate the Netlify CLI and rerun this command."
}

Write-Host "Live origin and private automation authentication are paired." -ForegroundColor Green
Write-Host "Netlify environment changes require a new deployment before the running production Functions receive the token." -ForegroundColor Yellow
Write-Host "The 24x7 worker will still refuse production execution until the shared production database migration and live revision gates are verified." -ForegroundColor Yellow
