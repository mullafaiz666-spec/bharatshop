param(
  [ValidateSet("Bootstrap", "Status", "Stop")]
  [string]$Mode = "Bootstrap"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Runtime = Join-Path $Root ".runtime\upstreams"
$EnvFile = Join-Path $Root ".env.local"
$SecretsFile = Join-Path $Runtime "secrets.env"
$RemotionDir = Join-Path $Root "services\remotion"
$RemotionPort = 8201
$OpenHandsPort = 8202
$MumuPort = 8203
$MumuDbPort = 55433
$OpenHandsImage = "ghcr.io/openhands/agent-canvas:1.18.0"
$MumuPin = "600be7038539e4dd0568b63e6e534fdcfaf91687"
$MumuImage = "bharatshop-mumu:$($MumuPin.Substring(0,12))"

New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
if (!(Test-Path $EnvFile)) { New-Item -ItemType File -Path $EnvFile | Out-Null }
if (!(Test-Path $SecretsFile)) { New-Item -ItemType File -Path $SecretsFile | Out-Null }

function Set-DotEnvValue([string]$Key, [string]$Value) {
  $lines = @(Get-Content $EnvFile -ErrorAction SilentlyContinue)
  $rx = "^\s*" + [regex]::Escape($Key) + "\s*="
  $lines = @($lines | Where-Object { $_ -notmatch $rx })
  $lines += "$Key=$Value"
  Set-Content -Path $EnvFile -Value $lines -Encoding UTF8
}

function New-HexSecret([int]$Bytes = 24) {
  $buffer = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
  return (($buffer | ForEach-Object { $_.ToString("x2") }) -join "")
}

function Get-RuntimeSecret([string]$Key) {
  $existing = Get-Content $SecretsFile -ErrorAction SilentlyContinue |
    Where-Object { $_ -match ("^" + [regex]::Escape($Key) + "=") } |
    Select-Object -Last 1
  if ($existing) { return $existing.Substring($Key.Length + 1) }
  $value = New-HexSecret
  Add-Content -Path $SecretsFile -Value "$Key=$value" -Encoding UTF8
  return $value
}

function Test-Listening([int]$Port) {
  try {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1)
  } catch { return $false }
}

function Wait-Http([string]$Url, [hashtable]$Headers = @{}, [int]$Seconds = 120) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    try {
      $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -Headers $Headers -TimeoutSec 6
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { return $true }
    } catch {}
    Start-Sleep 2
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Docker-Ready {
  if (!(Get-Command docker -ErrorAction SilentlyContinue)) { return $false }
  try { & docker info *> $null; return ($LASTEXITCODE -eq 0) } catch { return $false }
}

function Remove-Container([string]$Name) {
  try { & docker rm -f $Name *> $null } catch {}
}

function Show-Status {
  Write-Host "`nBharatShop upstream runtime" -ForegroundColor Cyan
  $rows = @(
    [pscustomobject]@{ Service="Remotion"; Port=$RemotionPort; Ready=(Test-Listening $RemotionPort) },
    [pscustomobject]@{ Service="OpenHands"; Port=$OpenHandsPort; Ready=(Test-Listening $OpenHandsPort) },
    [pscustomobject]@{ Service="MuMuAINovel"; Port=$MumuPort; Ready=(Test-Listening $MumuPort) },
    [pscustomobject]@{ Service="Marketing Skills"; Port="-"; Ready=(Test-Path (Join-Path $Root ".agents\skills\.bharatshop-marketingskills.json")) }
  )
  $rows | Format-Table -AutoSize
  Write-Host "PersonaLive remains policy-blocked until commercial/model rights are approved." -ForegroundColor Yellow
}

if ($Mode -eq "Stop") {
  $pidFile = Join-Path $Runtime "remotion.pid"
  if (Test-Path $pidFile) {
    $pidValue = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pidValue) { Stop-Process -Id ([int]$pidValue) -Force -ErrorAction SilentlyContinue }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
  }
  if (Docker-Ready) {
    Remove-Container "bharatshop-openhands"
    Remove-Container "bharatshop-mumu"
    Remove-Container "bharatshop-mumu-db"
  }
  Show-Status
  exit 0
}

if ($Mode -eq "Status") {
  Show-Status
  exit 0
}

Write-Host "`n=== BharatShop automated upstream runtime ===" -ForegroundColor Cyan
Write-Host "Project: $Root"

Write-Host "`n[1/4] Marketing Skills" -ForegroundColor Cyan
& npm run skills:marketing:sync
if ($LASTEXITCODE -ne 0) { throw "Marketing Skills sync failed." }
Set-DotEnvValue "BHARATSHOP_MARKETING_SKILLS_ENABLED" "true"

Write-Host "`n[2/4] Remotion render service" -ForegroundColor Cyan
& npm install --prefix $RemotionDir --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "Remotion service dependencies failed to install." }
$remotionToken = Get-RuntimeSecret "REMOTION_SERVICE_TOKEN"
if (!(Test-Listening $RemotionPort)) {
  $env:REMOTION_SERVICE_PORT = "$RemotionPort"
  $env:REMOTION_SERVICE_TOKEN = $remotionToken
  $stdout = Join-Path $Runtime "remotion.out.log"
  $stderr = Join-Path $Runtime "remotion.err.log"
  $p = Start-Process -FilePath "node" -ArgumentList "server.mjs" -WorkingDirectory $RemotionDir -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  Set-Content -Path (Join-Path $Runtime "remotion.pid") -Value $p.Id -Encoding ascii
}
$remotionHeaders = @{ Authorization = "Bearer $remotionToken" }
if (!(Wait-Http "http://127.0.0.1:$RemotionPort/health" $remotionHeaders 90)) { throw "Remotion service did not become ready. See .runtime/upstreams/remotion.err.log" }
Set-DotEnvValue "BHARATSHOP_REMOTION_ENABLED" "true"
Set-DotEnvValue "REMOTION_SERVICE_URL" "http://127.0.0.1:$RemotionPort"
Set-DotEnvValue "REMOTION_SERVICE_TOKEN" $remotionToken
Write-Host "Remotion READY on 127.0.0.1:$RemotionPort" -ForegroundColor Green

$dockerReady = Docker-Ready
if (!$dockerReady) {
  Write-Host "`nDocker Desktop is not running. OpenHands and MuMu require the isolated Docker path and will not be launched unsandboxed." -ForegroundColor Yellow
  Write-Host "Install/start Docker Desktop, then rerun: npm run upstreams:bootstrap" -ForegroundColor Yellow
  Set-DotEnvValue "BHARATSHOP_OPENHANDS_ENABLED" "false"
  Set-DotEnvValue "OPENHANDS_AGENT_SERVER_URL" ""
  Set-DotEnvValue "BHARATSHOP_MUMU_ENABLED" "false"
  Set-DotEnvValue "MUMU_AI_SERVICE_URL" ""
} else {
  Write-Host "`n[3/4] OpenHands sandbox" -ForegroundColor Cyan
  $ohHome = Join-Path $Runtime "openhands-home"
  New-Item -ItemType Directory -Force -Path $ohHome | Out-Null
  & docker pull $OpenHandsImage
  if ($LASTEXITCODE -ne 0) { throw "OpenHands image pull failed." }
  Remove-Container "bharatshop-openhands"
  & docker run -d --name bharatshop-openhands --restart unless-stopped -p "127.0.0.1:$OpenHandsPort`:8000" -v "$ohHome`:/home/openhands/.openhands" -v "$Root`:/projects/bharatshop" $OpenHandsImage | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "OpenHands container failed to start." }
  if (!(Wait-Http "http://127.0.0.1:$OpenHandsPort/" @{} 180)) { throw "OpenHands did not become ready. Run: docker logs bharatshop-openhands" }
  Set-DotEnvValue "BHARATSHOP_OPENHANDS_ENABLED" "true"
  Set-DotEnvValue "OPENHANDS_AGENT_SERVER_URL" "http://127.0.0.1:$OpenHandsPort"
  Set-DotEnvValue "OPENHANDS_AGENT_SERVER_TOKEN" ""
  Write-Host "OpenHands READY on 127.0.0.1:$OpenHandsPort with only this BharatShop folder mounted into /projects/bharatshop" -ForegroundColor Green

  Write-Host "`n[4/4] MuMuAINovel isolated creative service" -ForegroundColor Cyan
  $mumuSource = Join-Path $Runtime "mumu-$MumuPin"
  if (!(Test-Path (Join-Path $mumuSource "Dockerfile"))) {
    $zip = Join-Path $Runtime "mumu-$MumuPin.zip"
    $extract = Join-Path $Runtime "mumu-extract"
    Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
    Invoke-WebRequest "https://github.com/xiamuceer-j/MuMuAINovel/archive/$MumuPin.zip" -UseBasicParsing -OutFile $zip
    Expand-Archive $zip -DestinationPath $extract -Force
    $folder = Get-ChildItem $extract -Directory | Select-Object -First 1
    if (!$folder) { throw "Could not extract pinned MuMuAINovel source." }
    Move-Item $folder.FullName $mumuSource
    Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
  }
  & docker image inspect $MumuImage *> $null
  if ($LASTEXITCODE -ne 0) {
    & docker build -t $MumuImage $mumuSource
    if ($LASTEXITCODE -ne 0) { throw "Pinned MuMuAINovel Docker build failed." }
  }
  try { & docker network create bharatshop-upstreams *> $null } catch {}
  $dbPassword = Get-RuntimeSecret "MUMU_POSTGRES_PASSWORD"
  $adminPassword = Get-RuntimeSecret "MUMU_LOCAL_ADMIN_PASSWORD"
  $mumuEnv = Join-Path $Runtime "mumu.env"
  @(
    "APP_NAME=MuMuAINovel",
    "APP_HOST=0.0.0.0",
    "APP_PORT=8000",
    "DEBUG=false",
    "TZ=Asia/Kolkata",
    "POSTGRES_DB=mumuai_novel",
    "POSTGRES_USER=mumuai",
    "POSTGRES_PASSWORD=$dbPassword",
    "DATABASE_URL=postgresql+asyncpg://mumuai:$dbPassword@bharatshop-mumu-db:5432/mumuai_novel",
    "OPENAI_API_KEY=ollama",
    "OPENAI_BASE_URL=http://host.docker.internal:11434/v1",
    "DEFAULT_AI_PROVIDER=openai",
    "DEFAULT_MODEL=functiongemma:270m",
    "ALLOW_PRIVATE_AI_ENDPOINTS=true",
    "ALLOWED_AI_HOSTS=host.docker.internal,127.0.0.1",
    "LOCAL_AUTH_ENABLED=true",
    "LOCAL_AUTH_USERNAME=admin",
    "LOCAL_AUTH_PASSWORD=$adminPassword",
    "LOCAL_AUTH_DISPLAY_NAME=BharatShop Creative Agent",
    "SESSION_COOKIE_SECURE=false",
    "FRONTEND_URL=http://localhost:$MumuPort",
    "EMAIL_AUTH_ENABLED=false",
    "EMAIL_REGISTER_ENABLED=false",
    "WORKSHOP_MODE=client"
  ) | Set-Content -Path $mumuEnv -Encoding UTF8

  Remove-Container "bharatshop-mumu"
  Remove-Container "bharatshop-mumu-db"
  $initSql = Join-Path $mumuSource "backend\scripts\init_postgres.sql"
  & docker run -d --name bharatshop-mumu-db --network bharatshop-upstreams --restart unless-stopped -p "127.0.0.1:$MumuDbPort`:5432" -e "POSTGRES_DB=mumuai_novel" -e "POSTGRES_USER=mumuai" -e "POSTGRES_PASSWORD=$dbPassword" -v "bharatshop-mumu-pg:/var/lib/postgresql/data" --mount "type=bind,source=$initSql,target=/docker-entrypoint-initdb.d/init.sql,readonly" postgres:18-alpine | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "MuMu PostgreSQL container failed to start." }
  $dbReady = $false
  for ($i=0; $i -lt 60; $i++) {
    & docker exec bharatshop-mumu-db pg_isready -U mumuai -d mumuai_novel *> $null
    if ($LASTEXITCODE -eq 0) { $dbReady = $true; break }
    Start-Sleep 2
  }
  if (!$dbReady) { throw "MuMu PostgreSQL did not become ready." }
  & docker run -d --name bharatshop-mumu --network bharatshop-upstreams --restart unless-stopped -p "127.0.0.1:$MumuPort`:8000" --env-file $mumuEnv --add-host "host.docker.internal:host-gateway" $MumuImage | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "MuMuAINovel container failed to start." }
  if (!(Wait-Http "http://127.0.0.1:$MumuPort/health" @{} 240)) { throw "MuMuAINovel did not become ready. Run: docker logs bharatshop-mumu" }
  Set-DotEnvValue "BHARATSHOP_MUMU_ENABLED" "true"
  Set-DotEnvValue "MUMU_AI_SERVICE_URL" "http://127.0.0.1:$MumuPort"
  Set-DotEnvValue "MUMU_AI_SERVICE_TOKEN" ""
  Write-Host "MuMuAINovel READY on 127.0.0.1:$MumuPort and connected to local Ollama through host.docker.internal" -ForegroundColor Green
}

Set-DotEnvValue "BHARATSHOP_PERSONALIVE_ENABLED" "false"
Set-DotEnvValue "PERSONALIVE_COMMERCIAL_USE_APPROVED" "false"

Write-Host "`nValidating BharatShop source..." -ForegroundColor Cyan
& npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "BharatShop typecheck failed." }

Show-Status
Write-Host "`nRuntime configuration written to .env.local. Secrets remain local under .runtime/upstreams and are not printed." -ForegroundColor Green
Write-Host "Start the complete workstation with: npm run dev:full" -ForegroundColor Green
