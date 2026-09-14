param(
  [ValidateSet("Bootstrap", "Status", "Stop")]
  [string]$Mode = "Bootstrap"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Runtime = Join-Path $Root ".runtime\local-stack"
$EnvFile = Join-Path $Root ".env.local"
$SecretsFile = Join-Path $Runtime "secrets.env"
$SearxDir = Join-Path $Runtime "searxng"
$SearxSettings = Join-Path $SearxDir "settings.yml"
$PgEnv = Join-Path $Runtime "postgres.env"
$ShimPid = Join-Path $Runtime "ollama-shim.pid"
$ShimOut = Join-Path $Runtime "ollama-shim.out.log"
$ShimErr = Join-Path $Runtime "ollama-shim.err.log"
$NextOut = Join-Path $Runtime "next.out.log"
$NextErr = Join-Path $Runtime "next.err.log"

$PgContainer = "bharatshop-local-postgres"
$SearxContainer = "bharatshop-local-searxng"
$PgImage = "postgres:17-alpine"
$SearxImage = "searxng/searxng:latest"
$PgPort = 55432
$SearxPort = 8888
$ShimPort = 11555
$AppPort = 3000

New-Item -ItemType Directory -Force -Path $Runtime, $SearxDir | Out-Null
if (!(Test-Path $EnvFile)) { New-Item -ItemType File -Path $EnvFile | Out-Null }
if (!(Test-Path $SecretsFile)) { New-Item -ItemType File -Path $SecretsFile | Out-Null }

function Write-Utf8Lines([string]$Path, [string[]]$Lines) {
  [System.IO.File]::WriteAllLines($Path, $Lines, [System.Text.UTF8Encoding]::new($false))
}

function Set-EnvValue([string]$Key, [string]$Value) {
  $lines = @(Get-Content $EnvFile -ErrorAction SilentlyContinue)
  $rx = "^\s*" + [regex]::Escape($Key) + "\s*="
  $lines = @($lines | Where-Object { $_ -notmatch $rx })
  $lines += "$Key=$Value"
  Write-Utf8Lines $EnvFile $lines
}

function New-HexSecret([int]$Bytes = 32) {
  $buffer = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
  return (($buffer | ForEach-Object { $_.ToString("x2") }) -join "")
}

function Get-OrCreateSecret([string]$Key, [int]$Bytes = 32) {
  $line = Get-Content $SecretsFile -ErrorAction SilentlyContinue | Where-Object { $_ -match ("^" + [regex]::Escape($Key) + "=") } | Select-Object -Last 1
  if ($line) { return $line.Substring($Key.Length + 1) }
  $value = New-HexSecret $Bytes
  Add-Content -Path $SecretsFile -Value "$Key=$value" -Encoding UTF8
  return $value
}

function Test-Port([int]$Port) {
  try { return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1) } catch { return $false }
}

function Wait-Http([string]$Url, [int]$Seconds = 120) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 8
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return $true }
    } catch {}
    Start-Sleep 2
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Docker-Ready {
  if (!(Get-Command docker -ErrorAction SilentlyContinue)) { return $false }
  try { docker info *> $null; return ($LASTEXITCODE -eq 0) } catch { return $false }
}

function Container-Exists([string]$Name) {
  docker inspect $Name *> $null
  return ($LASTEXITCODE -eq 0)
}

function Container-Running([string]$Name) {
  if (!(Container-Exists $Name)) { return $false }
  $running = docker inspect -f "{{.State.Running}}" $Name 2>$null
  return ($LASTEXITCODE -eq 0 -and ([string]$running).Trim().ToLowerInvariant() -eq "true")
}

function Stop-TrackedProcess([string]$PidFile) {
  if (!(Test-Path $PidFile)) { return }
  $raw = Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($raw -match '^\d+$') { Stop-Process -Id ([int]$raw) -Force -ErrorAction SilentlyContinue }
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

function Show-Endpoint([string]$Url) {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 45
    Write-Host "$Url -> $($response.StatusCode)"
    if ($response.Content -and $Url -match '/api/health') { Write-Host $response.Content }
  } catch {
    $response = $_.Exception.Response
    if ($response) {
      Write-Host "$Url -> HTTP $([int]$response.StatusCode)"
      try {
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        $text = $reader.ReadToEnd()
        $reader.Dispose()
        if ($text) { Write-Host $text }
      } catch {}
    } else {
      Write-Host "$Url -> $($_.Exception.Message)"
    }
  }
}

function Show-Status {
  Write-Host "`n=== BharatShop local runtime ===" -ForegroundColor Cyan
  @(
    [pscustomobject]@{ Service="Ollama"; Port=11434; Ready=(Test-Port 11434) }
    [pscustomobject]@{ Service="Ollama Qwen shim"; Port=$ShimPort; Ready=(Test-Port $ShimPort) }
    [pscustomobject]@{ Service="Local PostgreSQL"; Port=$PgPort; Ready=(Test-Port $PgPort) }
    [pscustomobject]@{ Service="SearXNG"; Port=$SearxPort; Ready=(Test-Port $SearxPort) }
    [pscustomobject]@{ Service="BharatShop Next"; Port=$AppPort; Ready=(Test-Port $AppPort) }
  ) | Format-Table -AutoSize
}

if ($Mode -eq "Status") {
  Show-Status
  if (Test-Port $AppPort) {
    Show-Endpoint "http://127.0.0.1:$AppPort/api/health"
    Show-Endpoint "http://127.0.0.1:$AppPort/api/health/agents"
  }
  exit 0
}

if ($Mode -eq "Stop") {
  Stop-TrackedProcess $ShimPid
  if (Docker-Ready) {
    if (Container-Running $SearxContainer) { docker stop $SearxContainer | Out-Null }
    if (Container-Running $PgContainer) { docker stop $PgContainer | Out-Null }
  }
  Show-Status
  exit 0
}

Write-Host "=== BharatShop local runtime bootstrap ===" -ForegroundColor Cyan
Write-Host "This uses isolated local services and does not modify the production database."

if (!(Docker-Ready)) { throw "Docker Desktop is not ready." }
if (!(Test-Port 11434)) { throw "Ollama is not listening on 127.0.0.1:11434." }

try {
  $models = Invoke-RestMethod "http://127.0.0.1:11434/v1/models" -TimeoutSec 15
  $modelNames = @($models.data | ForEach-Object { $_.id })
  if ($modelNames -notcontains "qwen3.5:4b") { throw "qwen3.5:4b is not installed in Ollama." }
} catch {
  throw "Ollama model discovery failed: $($_.Exception.Message)"
}

# Local Qwen shim: Ollama Qwen can spend the completion budget on hidden reasoning
# unless think=false is sent. The shim injects that field only for Qwen requests.
if (!(Test-Port $ShimPort)) {
  Stop-TrackedProcess $ShimPid
  $shim = Join-Path $Root "services\ollama-qwen-shim\server.mjs"
  $process = Start-Process -FilePath "node" -ArgumentList $shim -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput $ShimOut -RedirectStandardError $ShimErr -PassThru
  Set-Content -Path $ShimPid -Value $process.Id -Encoding ascii
}
if (!(Wait-Http "http://127.0.0.1:$ShimPort/health" 60)) { throw "Ollama Qwen shim did not become ready. See $ShimErr" }

# Dedicated local database on 55432. Existing PostgreSQL on 5432 is deliberately untouched.
$pgPassword = Get-OrCreateSecret "LOCAL_POSTGRES_PASSWORD" 24
Write-Utf8Lines $PgEnv @(
  "POSTGRES_USER=bharatshop",
  "POSTGRES_PASSWORD=$pgPassword",
  "POSTGRES_DB=bharatshop"
)

if (!(Container-Exists $PgContainer)) {
  docker pull $PgImage
  if ($LASTEXITCODE -ne 0) { throw "Could not pull $PgImage" }
  docker run -d --name $PgContainer --restart unless-stopped --env-file $PgEnv -p "127.0.0.1:$PgPort`:5432" -v "bharatshop-local-pgdata:/var/lib/postgresql/data" $PgImage | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Local PostgreSQL container failed to start." }
} elseif (!(Container-Running $PgContainer)) {
  docker start $PgContainer | Out-Null
}

$pgDeadline = (Get-Date).AddSeconds(120)
do {
  docker exec $PgContainer pg_isready -U bharatshop -d bharatshop *> $null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep 2
} while ((Get-Date) -lt $pgDeadline)
if ($LASTEXITCODE -ne 0) { throw "Local PostgreSQL did not become ready." }

# Local SearXNG with JSON search enabled for BharatShop evidence discovery.
$searxSecret = Get-OrCreateSecret "SEARXNG_SECRET" 32
$settings = @(
  "use_default_settings: true",
  "server:",
  "  bind_address: '0.0.0.0'",
  "  port: 8080",
  "  secret_key: '$searxSecret'",
  "search:",
  "  safe_search: 0",
  "  default_lang: 'en'",
  "  formats:",
  "    - html",
  "    - json"
)
Write-Utf8Lines $SearxSettings $settings

if (!(Container-Exists $SearxContainer)) {
  docker pull $SearxImage
  if ($LASTEXITCODE -ne 0) { throw "Could not pull $SearxImage" }
  docker run -d --name $SearxContainer --restart unless-stopped -p "127.0.0.1:$SearxPort`:8080" --mount "type=bind,source=$SearxSettings,target=/etc/searxng/settings.yml,readonly" $SearxImage | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "SearXNG container failed to start." }
} elseif (!(Container-Running $SearxContainer)) {
  docker start $SearxContainer | Out-Null
}
if (!(Wait-Http "http://127.0.0.1:$SearxPort/" 180)) { throw "SearXNG did not become ready." }

$escapedPgPassword = [System.Uri]::EscapeDataString($pgPassword)
$databaseUrl = "postgresql://bharatshop:$escapedPgPassword@127.0.0.1:$PgPort/bharatshop"
$automationToken = Get-OrCreateSecret "BHARATSHOP_AUTOMATION_TOKEN" 32
$adminSessionSecret = Get-OrCreateSecret "ADMIN_SESSION_SECRET" 32

Set-EnvValue "DATABASE_URL" $databaseUrl
Set-EnvValue "AI_BASE_URL" "http://127.0.0.1:$ShimPort"
Set-EnvValue "AI_TEXT_MODEL" "qwen3.5:4b"
Set-EnvValue "AI_VISION_MODEL" "local-evidence-v1"
Set-EnvValue "AI_MIN_TIMEOUT_MS" "30000"
Set-EnvValue "IMAGE_VERIFIER_MODE" "local-evidence"
Set-EnvValue "SEARXNG_URL" "http://127.0.0.1:$SearxPort"
Set-EnvValue "BHARATSHOP_AUTOMATION_TOKEN" $automationToken
Set-EnvValue "AUTOMATION_TOKEN" $automationToken
Set-EnvValue "ADMIN_SESSION_SECRET" $adminSessionSecret

$env:DATABASE_URL = $databaseUrl
Write-Host "`nApplying the tracked BharatShop schema to the isolated local database..." -ForegroundColor Cyan
& npm.cmd run db:push
if ($LASTEXITCODE -ne 0) { throw "Local schema push failed." }

# Restart only the process currently listening on BharatShop's local development port.
if (Test-Port $AppPort) {
  $listener = Get-NetTCPConnection -LocalPort $AppPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener -and $listener.OwningProcess) {
    Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep 2
  }
}

$next = Start-Process -FilePath "npm.cmd" -ArgumentList "run","dev" -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput $NextOut -RedirectStandardError $NextErr -PassThru
Set-Content -Path (Join-Path $Runtime "next.pid") -Value $next.Id -Encoding ascii

if (!(Wait-Http "http://127.0.0.1:$AppPort/" 120)) { throw "BharatShop Next dev server did not become ready. See $NextErr" }

Show-Status
Write-Host "`n=== Live local readiness ===" -ForegroundColor Cyan
Show-Endpoint "http://127.0.0.1:$AppPort/api/health"
Show-Endpoint "http://127.0.0.1:$AppPort/api/health/agents"
Write-Host "`nLocal runtime bootstrap finished. Secrets remain only in gitignored local files." -ForegroundColor Green
