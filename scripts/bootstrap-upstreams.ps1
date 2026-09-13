param(
  [ValidateSet("Bootstrap", "Status", "Stop", "Dify", "LibreChat")]
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
$DifyPort = 8204
$DifySslPort = 8244
$LibreChatPort = 8205
$LibreChatAdminPort = 8206
$OpenHandsImage = "ghcr.io/openhands/agent-canvas:1.18.0"
$MumuPin = "600be7038539e4dd0568b63e6e534fdcfaf91687"
$MumuImage = "bharatshop-mumu:$($MumuPin.Substring(0,12))"
$DifyPin = "79effdd498a0c53218fe85c11f565b680468e455"
$LibreChatPin = "e18606e5ce739af2d39a0d3c41bedb164ac69cb5"
$DifyDir = Join-Path $Runtime "dify-$DifyPin-docker"
$LibreChatDir = Join-Path $Runtime "librechat-$LibreChatPin"

New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
if (!(Test-Path $EnvFile)) { New-Item -ItemType File -Path $EnvFile | Out-Null }
if (!(Test-Path $SecretsFile)) { New-Item -ItemType File -Path $SecretsFile | Out-Null }

function Set-EnvFileValue([string]$File, [string]$Key, [string]$Value) {
  if (!(Test-Path $File)) { New-Item -ItemType File -Path $File -Force | Out-Null }
  $lines = @(Get-Content $File -ErrorAction SilentlyContinue)
  $rx = "^\s*" + [regex]::Escape($Key) + "\s*="
  $lines = @($lines | Where-Object { $_ -notmatch $rx })
  $lines += "$Key=$Value"
  Set-Content -Path $File -Value $lines -Encoding UTF8
}

function Set-DotEnvValue([string]$Key, [string]$Value) {
  Set-EnvFileValue $EnvFile $Key $Value
}

function New-HexSecret([int]$Bytes = 24) {
  $buffer = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
  return (($buffer | ForEach-Object { $_.ToString("x2") }) -join "")
}

function Get-RuntimeSecret([string]$Key, [int]$Bytes = 24) {
  $existing = Get-Content $SecretsFile -ErrorAction SilentlyContinue |
    Where-Object { $_ -match ("^" + [regex]::Escape($Key) + "=") } |
    Select-Object -Last 1
  if ($existing) { return $existing.Substring($Key.Length + 1) }
  $value = New-HexSecret $Bytes
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
      $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -Headers $Headers -TimeoutSec 8 -MaximumRedirection 8
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

function Ensure-PinnedArchive([string]$Repository, [string]$Pin, [string]$Target) {
  if (Test-Path $Target) { return }
  $zip = Join-Path $Runtime "$Pin.zip"
  $extract = Join-Path $Runtime "extract-$Pin"
  Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
  Invoke-WebRequest "https://github.com/$Repository/archive/$Pin.zip" -UseBasicParsing -OutFile $zip
  Expand-Archive $zip -DestinationPath $extract -Force
  $folder = Get-ChildItem $extract -Directory | Select-Object -First 1
  if (!$folder) { throw "Could not extract pinned source for $Repository." }
  Move-Item $folder.FullName $Target
  Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item $zip -Force -ErrorAction SilentlyContinue
}

function Start-Dify {
  if (!(Docker-Ready)) { throw "Docker Desktop must be running before Dify can start." }
  Write-Host "`n[Dify] pinned workflow/agent studio" -ForegroundColor Cyan
  $sourceRoot = Join-Path $Runtime "dify-source-$DifyPin"
  if (!(Test-Path (Join-Path $sourceRoot "docker\docker-compose.yaml"))) {
    Ensure-PinnedArchive "langgenius/dify" $DifyPin $sourceRoot
  }
  if (!(Test-Path $DifyDir)) {
    Copy-Item (Join-Path $sourceRoot "docker") $DifyDir -Recurse -Force
  }
  $difyEnv = Join-Path $DifyDir ".env"
  if (!(Test-Path $difyEnv)) { Copy-Item (Join-Path $DifyDir ".env.example") $difyEnv -Force }
  Set-EnvFileValue $difyEnv "EXPOSE_NGINX_PORT" "127.0.0.1:$DifyPort"
  Set-EnvFileValue $difyEnv "EXPOSE_NGINX_SSL_PORT" "127.0.0.1:$DifySslPort"
  Set-EnvFileValue $difyEnv "SECRET_KEY" (Get-RuntimeSecret "DIFY_SECRET_KEY" 32)
  Set-EnvFileValue $difyEnv "DEPLOY_ENV" "PRODUCTION"
  & docker compose --project-name bharatshop-dify --env-file $difyEnv -f (Join-Path $DifyDir "docker-compose.yaml") up -d
  if ($LASTEXITCODE -ne 0) { throw "Dify Docker stack failed to start." }
  if (!(Wait-Http "http://127.0.0.1:$DifyPort/" @{} 600)) { throw "Dify did not become ready. Run: docker compose --project-name bharatshop-dify -f `"$DifyDir\docker-compose.yaml`" logs" }
  Set-DotEnvValue "BHARATSHOP_DIFY_ENABLED" "true"
  Set-DotEnvValue "DIFY_SERVICE_URL" "http://127.0.0.1:$DifyPort"
  Set-DotEnvValue "DIFY_SERVICE_TOKEN" ""
  Write-Host "Dify READY on 127.0.0.1:$DifyPort (single-workspace mode; upstream branding/license terms preserved)." -ForegroundColor Green
}

function Start-LibreChat {
  if (!(Docker-Ready)) { throw "Docker Desktop must be running before LibreChat can start." }
  Write-Host "`n[LibreChat] operator chat/agent workspace" -ForegroundColor Cyan
  New-Item -ItemType Directory -Force -Path $LibreChatDir | Out-Null
  $compose = Join-Path $LibreChatDir "docker-compose.yml"
  $libreEnv = Join-Path $LibreChatDir ".env"
  if (!(Test-Path $compose)) {
    Invoke-WebRequest "https://raw.githubusercontent.com/danny-avila/LibreChat/$LibreChatPin/docker-compose.yml" -UseBasicParsing -OutFile $compose
    Invoke-WebRequest "https://raw.githubusercontent.com/danny-avila/LibreChat/$LibreChatPin/.env.example" -UseBasicParsing -OutFile (Join-Path $LibreChatDir ".env.example")
    $raw = Get-Content $compose -Raw
    $raw = $raw.Replace('container_name: LibreChat', 'container_name: bharatshop-librechat')
    $raw = $raw.Replace('container_name: admin-panel', 'container_name: bharatshop-librechat-admin')
    $raw = $raw.Replace('container_name: chat-mongodb', 'container_name: bharatshop-librechat-mongodb')
    $raw = $raw.Replace('container_name: chat-meilisearch', 'container_name: bharatshop-librechat-meilisearch')
    $raw = $raw.Replace('container_name: vectordb', 'container_name: bharatshop-librechat-vectordb')
    $raw = $raw.Replace('container_name: rag_api', 'container_name: bharatshop-librechat-rag')
    $raw = $raw.Replace('- "${PORT}:${PORT}"', '- "127.0.0.1:${PORT}:${PORT}"')
    $raw = $raw.Replace('- "${ADMIN_PANEL_PORT:-3000}:3000"', '- "127.0.0.1:${ADMIN_PANEL_PORT:-3000}:3000"')
    Set-Content $compose $raw -Encoding UTF8
  }
  if (!(Test-Path $libreEnv)) { Copy-Item (Join-Path $LibreChatDir ".env.example") $libreEnv -Force }
  Set-EnvFileValue $libreEnv "HOST" "0.0.0.0"
  Set-EnvFileValue $libreEnv "PORT" "$LibreChatPort"
  Set-EnvFileValue $libreEnv "DOMAIN_CLIENT" "http://localhost:$LibreChatPort"
  Set-EnvFileValue $libreEnv "DOMAIN_SERVER" "http://localhost:$LibreChatPort"
  Set-EnvFileValue $libreEnv "ADMIN_PANEL_URL" "http://localhost:$LibreChatAdminPort"
  Set-EnvFileValue $libreEnv "ADMIN_PANEL_PORT" "$LibreChatAdminPort"
  Set-EnvFileValue $libreEnv "ADMIN_PANEL_SESSION_SECRET" (Get-RuntimeSecret "LIBRECHAT_ADMIN_PANEL_SESSION_SECRET" 32)
  Set-EnvFileValue $libreEnv "MEILI_MASTER_KEY" (Get-RuntimeSecret "LIBRECHAT_MEILI_MASTER_KEY" 32)
  Set-EnvFileValue $libreEnv "CREDS_KEY" (Get-RuntimeSecret "LIBRECHAT_CREDS_KEY" 32)
  Set-EnvFileValue $libreEnv "CREDS_IV" (Get-RuntimeSecret "LIBRECHAT_CREDS_IV" 16)
  Set-EnvFileValue $libreEnv "JWT_SECRET" (Get-RuntimeSecret "LIBRECHAT_JWT_SECRET" 32)
  Set-EnvFileValue $libreEnv "JWT_REFRESH_SECRET" (Get-RuntimeSecret "LIBRECHAT_JWT_REFRESH_SECRET" 32)
  Set-EnvFileValue $libreEnv "UID" "1000"
  Set-EnvFileValue $libreEnv "GID" "1000"
  Set-EnvFileValue $libreEnv "ALLOW_REGISTRATION" "true"
  Set-EnvFileValue $libreEnv "ALLOW_EMAIL_LOGIN" "true"
  Set-EnvFileValue $libreEnv "CONFIG_PATH" "/app/librechat.yaml"
  foreach ($dir in @("images", "uploads", "logs", "skill", "data-node", "meili_data_v1.35.1")) { New-Item -ItemType Directory -Force -Path (Join-Path $LibreChatDir $dir) | Out-Null }
  @'
version: 1.3.16
cache: true
endpoints:
  custom:
    - name: Ollama
      apiKey: ollama
      baseURL: http://host.docker.internal:11434/v1/
      models:
        default:
          - functiongemma:270m
        fetch: true
'@ | Set-Content (Join-Path $LibreChatDir "librechat.yaml") -Encoding UTF8
  $override = @"
services:
  api:
    volumes:
      - ./librechat.yaml:/app/librechat.yaml:ro
"@
  $override | Set-Content (Join-Path $LibreChatDir "docker-compose.override.yml") -Encoding UTF8
  & docker compose --project-name bharatshop-librechat --env-file $libreEnv -f $compose -f (Join-Path $LibreChatDir "docker-compose.override.yml") up -d
  if ($LASTEXITCODE -ne 0) { throw "LibreChat Docker stack failed to start." }
  if (!(Wait-Http "http://127.0.0.1:$LibreChatPort/" @{} 420)) { throw "LibreChat did not become ready. Run: docker compose --project-name bharatshop-librechat -f `"$compose`" logs" }
  Set-DotEnvValue "BHARATSHOP_LIBRECHAT_ENABLED" "true"
  Set-DotEnvValue "LIBRECHAT_SERVICE_URL" "http://127.0.0.1:$LibreChatPort"
  Set-DotEnvValue "LIBRECHAT_SERVICE_TOKEN" ""
  Write-Host "LibreChat READY on 127.0.0.1:$LibreChatPort with local Ollama exposed as the FunctionGemma endpoint." -ForegroundColor Green
}

function Show-Status {
  Write-Host "`nBharatShop upstream runtime" -ForegroundColor Cyan
  $rows = @(
    [pscustomobject]@{ Service="Remotion"; Port=$RemotionPort; Ready=(Test-Listening $RemotionPort) },
    [pscustomobject]@{ Service="OpenHands"; Port=$OpenHandsPort; Ready=(Test-Listening $OpenHandsPort) },
    [pscustomobject]@{ Service="MuMuAINovel"; Port=$MumuPort; Ready=(Test-Listening $MumuPort) },
    [pscustomobject]@{ Service="Dify"; Port=$DifyPort; Ready=(Test-Listening $DifyPort) },
    [pscustomobject]@{ Service="LibreChat"; Port=$LibreChatPort; Ready=(Test-Listening $LibreChatPort) },
    [pscustomobject]@{ Service="Marketing Skills"; Port="-"; Ready=(Test-Path (Join-Path $Root ".agents\skills\.bharatshop-marketingskills.json")) }
  )
  $rows | Format-Table -AutoSize
  Write-Host "PersonaLive remains policy-blocked until commercial/model rights are approved." -ForegroundColor Yellow
  Write-Host "Dify is integrated for a single BharatShop workspace; multi-tenant SaaS use requires separate license review." -ForegroundColor Yellow
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
    if (Test-Path (Join-Path $DifyDir "docker-compose.yaml")) { & docker compose --project-name bharatshop-dify -f (Join-Path $DifyDir "docker-compose.yaml") down *> $null }
    if (Test-Path (Join-Path $LibreChatDir "docker-compose.yml")) { & docker compose --project-name bharatshop-librechat -f (Join-Path $LibreChatDir "docker-compose.yml") -f (Join-Path $LibreChatDir "docker-compose.override.yml") down *> $null }
  }
  Show-Status
  exit 0
}

if ($Mode -eq "Status") {
  Show-Status
  exit 0
}

if ($Mode -eq "Dify") {
  Start-Dify
  Show-Status
  exit 0
}

if ($Mode -eq "LibreChat") {
  Start-LibreChat
  Show-Status
  exit 0
}

Write-Host "`n=== BharatShop automated upstream runtime ===" -ForegroundColor Cyan
Write-Host "Project: $Root"

Write-Host "`n[1/6] Marketing Skills" -ForegroundColor Cyan
& npm run skills:marketing:sync
if ($LASTEXITCODE -ne 0) { throw "Marketing Skills sync failed." }
Set-DotEnvValue "BHARATSHOP_MARKETING_SKILLS_ENABLED" "true"

Write-Host "`n[2/6] Remotion render service" -ForegroundColor Cyan
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
  Write-Host "`nDocker Desktop is not running. OpenHands, MuMu, Dify and LibreChat require isolated Docker runtimes and will not be launched unsandboxed." -ForegroundColor Yellow
  Write-Host "Install/start Docker Desktop, then rerun: npm run upstreams:bootstrap" -ForegroundColor Yellow
  foreach ($pair in @(
    @("BHARATSHOP_OPENHANDS_ENABLED", "false"), @("OPENHANDS_AGENT_SERVER_URL", ""),
    @("BHARATSHOP_MUMU_ENABLED", "false"), @("MUMU_AI_SERVICE_URL", ""),
    @("BHARATSHOP_DIFY_ENABLED", "false"), @("DIFY_SERVICE_URL", ""),
    @("BHARATSHOP_LIBRECHAT_ENABLED", "false"), @("LIBRECHAT_SERVICE_URL", "")
  )) { Set-DotEnvValue $pair[0] $pair[1] }
} else {
  Write-Host "`n[3/6] OpenHands sandbox" -ForegroundColor Cyan
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

  Write-Host "`n[4/6] MuMuAINovel isolated creative service" -ForegroundColor Cyan
  $mumuSource = Join-Path $Runtime "mumu-$MumuPin"
  if (!(Test-Path (Join-Path $mumuSource "Dockerfile"))) {
    Ensure-PinnedArchive "xiamuceer-j/MuMuAINovel" $MumuPin $mumuSource
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
    "APP_NAME=MuMuAINovel", "APP_HOST=0.0.0.0", "APP_PORT=8000", "DEBUG=false", "TZ=Asia/Kolkata",
    "POSTGRES_DB=mumuai_novel", "POSTGRES_USER=mumuai", "POSTGRES_PASSWORD=$dbPassword",
    "DATABASE_URL=postgresql+asyncpg://mumuai:$dbPassword@bharatshop-mumu-db:5432/mumuai_novel",
    "OPENAI_API_KEY=ollama", "OPENAI_BASE_URL=http://host.docker.internal:11434/v1",
    "DEFAULT_AI_PROVIDER=openai", "DEFAULT_MODEL=functiongemma:270m", "ALLOW_PRIVATE_AI_ENDPOINTS=true",
    "ALLOWED_AI_HOSTS=host.docker.internal,127.0.0.1", "LOCAL_AUTH_ENABLED=true", "LOCAL_AUTH_USERNAME=admin",
    "LOCAL_AUTH_PASSWORD=$adminPassword", "LOCAL_AUTH_DISPLAY_NAME=BharatShop Creative Agent", "SESSION_COOKIE_SECURE=false",
    "FRONTEND_URL=http://localhost:$MumuPort", "EMAIL_AUTH_ENABLED=false", "EMAIL_REGISTER_ENABLED=false", "WORKSHOP_MODE=client"
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

  Write-Host "`n[5/6] Dify workflow/agent studio" -ForegroundColor Cyan
  Start-Dify

  Write-Host "`n[6/6] LibreChat operator workspace" -ForegroundColor Cyan
  Start-LibreChat
}

Set-DotEnvValue "BHARATSHOP_PERSONALIVE_ENABLED" "false"
Set-DotEnvValue "PERSONALIVE_COMMERCIAL_USE_APPROVED" "false"

Write-Host "`nValidating BharatShop source..." -ForegroundColor Cyan
& npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "BharatShop typecheck failed." }

Show-Status
Write-Host "`nRuntime configuration written to .env.local. Secrets remain local under .runtime/upstreams and are not printed." -ForegroundColor Green
Write-Host "Start the complete workstation with: npm run dev:full" -ForegroundColor Green
