param(
  [ValidateSet("Bootstrap", "Status", "Stop")]
  [string]$Mode = "Bootstrap"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Runtime = Join-Path $Root ".runtime\enhancements"
$EnvFile = Join-Path $Root ".env.local"
$SecretsFile = Join-Path $Runtime "secrets.env"
$AiDir = Join-Path $Root "services\ai-gateway"
$ResearchDir = Join-Path $Root "services\research-runner"
$AiPort = 8209
$ResearchPort = 8207
$UptimePort = 8210
$UptimeImage = "louislam/uptime-kuma:2.5.4"

New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
if (!(Test-Path $EnvFile)) { New-Item -ItemType File -Path $EnvFile | Out-Null }
if (!(Test-Path $SecretsFile)) { New-Item -ItemType File -Path $SecretsFile | Out-Null }

function Set-EnvFileValue([string]$File, [string]$Key, [string]$Value) {
  $lines = @(Get-Content $File -ErrorAction SilentlyContinue)
  $rx = "^\s*" + [regex]::Escape($Key) + "\s*="
  $lines = @($lines | Where-Object { $_ -notmatch $rx })
  $lines += "$Key=$Value"
  Set-Content -Path $File -Value $lines -Encoding UTF8
}
function Set-DotEnvValue([string]$Key, [string]$Value) { Set-EnvFileValue $EnvFile $Key $Value }
function Get-DotEnvValue([string]$Key) {
  $line = Get-Content $EnvFile -ErrorAction SilentlyContinue | Where-Object { $_ -match ("^\s*" + [regex]::Escape($Key) + "\s*=") } | Select-Object -Last 1
  if (!$line) { return "" }
  return ($line -replace ("^\s*" + [regex]::Escape($Key) + "\s*="), "").Trim()
}
function New-HexSecret([int]$Bytes = 24) {
  $buffer = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
  return (($buffer | ForEach-Object { $_.ToString("x2") }) -join "")
}
function Get-RuntimeSecret([string]$Key, [int]$Bytes = 24) {
  $line = Get-Content $SecretsFile -ErrorAction SilentlyContinue | Where-Object { $_ -match ("^" + [regex]::Escape($Key) + "=") } | Select-Object -Last 1
  if ($line) { return $line.Substring($Key.Length + 1) }
  $value = New-HexSecret $Bytes
  Add-Content -Path $SecretsFile -Value "$Key=$value" -Encoding UTF8
  return $value
}
function Test-Listening([int]$Port) {
  try { return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1) } catch { return $false }
}
function Wait-Http([string]$Url, [hashtable]$Headers = @{}, [int]$Seconds = 120) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    try {
      $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -Headers $Headers -TimeoutSec 8
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { return $true }
    } catch {}
    Start-Sleep 2
  } while ((Get-Date) -lt $deadline)
  return $false
}
function Start-NodeService([string]$Name, [string]$Dir, [int]$Port, [hashtable]$ExtraEnv) {
  if (Test-Listening $Port) { return }
  & npm.cmd install --prefix $Dir --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "$Name dependencies failed to install." }
  foreach ($entry in $ExtraEnv.GetEnumerator()) { Set-Item -Path "Env:$($entry.Key)" -Value ([string]$entry.Value) }
  $out = Join-Path $Runtime "$Name.out.log"
  $err = Join-Path $Runtime "$Name.err.log"
  $p = Start-Process -FilePath "node" -ArgumentList "server.mjs" -WorkingDirectory $Dir -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
  Set-Content -Path (Join-Path $Runtime "$Name.pid") -Value $p.Id -Encoding ascii
}
function Stop-Pid([string]$Name) {
  $file = Join-Path $Runtime "$Name.pid"
  if (Test-Path $file) {
    $pidValue = Get-Content $file -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pidValue) { Stop-Process -Id ([int]$pidValue) -Force -ErrorAction SilentlyContinue }
    Remove-Item $file -Force -ErrorAction SilentlyContinue
  }
}
function Docker-Ready {
  try { & docker info *> $null; return ($LASTEXITCODE -eq 0) } catch { return $false }
}
function Show-Status {
  Write-Host "`nBharatShop enhancement stack" -ForegroundColor Cyan
  @(
    [pscustomobject]@{ Service="Crawlee Research"; Port=$ResearchPort; Ready=(Test-Listening $ResearchPort) },
    [pscustomobject]@{ Service="AI SDK Gateway"; Port=$AiPort; Ready=(Test-Listening $AiPort) },
    [pscustomobject]@{ Service="Uptime Kuma"; Port=$UptimePort; Ready=(Test-Listening $UptimePort) }
  ) | Format-Table -AutoSize
}

if ($Mode -eq "Status") { Show-Status; exit 0 }
if ($Mode -eq "Stop") {
  Stop-Pid "research-runner"
  Stop-Pid "ai-gateway"
  if (Docker-Ready) { try { & docker rm -f bharatshop-uptime-kuma *> $null } catch {} }
  Show-Status
  exit 0
}

$researchToken = Get-RuntimeSecret "RESEARCH_RUNNER_TOKEN"
Start-NodeService "research-runner" $ResearchDir $ResearchPort @{
  RESEARCH_RUNNER_PORT="$ResearchPort"; RESEARCH_RUNNER_HOST="127.0.0.1"; RESEARCH_RUNNER_TOKEN=$researchToken
}
if (!(Wait-Http "http://127.0.0.1:$ResearchPort/health" @{} 120)) { throw "Crawlee research runner did not become ready. See .runtime/enhancements/research-runner.err.log" }
Set-DotEnvValue "BHARATSHOP_CRAWLEE_RESEARCH_ENABLED" "true"
Set-DotEnvValue "RESEARCH_RUNNER_URL" "http://127.0.0.1:$ResearchPort"
Set-DotEnvValue "RESEARCH_RUNNER_TOKEN" $researchToken

$aiToken = Get-RuntimeSecret "AI_GATEWAY_TOKEN"
$aiEnv = @{
  AI_GATEWAY_PORT="$AiPort"; AI_GATEWAY_HOST="127.0.0.1"; AI_GATEWAY_TOKEN=$aiToken
}
foreach ($key in @("AI_PROVIDER","GEMINI_API_KEY","GOOGLE_AI_API_KEY","GEMINI_MODEL","AI_BASE_URL","AI_API_KEY","AI_TEXT_MODEL","LOCAL_AI_BASE_URL","LOCAL_AI_API_KEY","LOCAL_AI_TEXT_MODEL")) {
  $value = Get-DotEnvValue $key
  if ($value) { $aiEnv[$key] = $value }
}
Start-NodeService "ai-gateway" $AiDir $AiPort $aiEnv
if (!(Wait-Http "http://127.0.0.1:$AiPort/health" @{} 120)) { throw "AI SDK gateway did not become ready. See .runtime/enhancements/ai-gateway.err.log" }
Set-DotEnvValue "BHARATSHOP_AI_SDK_GATEWAY_ENABLED" "true"
Set-DotEnvValue "AI_GATEWAY_URL" "http://127.0.0.1:$AiPort"
Set-DotEnvValue "AI_GATEWAY_TOKEN" $aiToken

if (Docker-Ready) {
  & docker pull $UptimeImage
  if ($LASTEXITCODE -ne 0) { throw "Uptime Kuma image pull failed." }
  try { & docker rm -f bharatshop-uptime-kuma *> $null } catch {}
  & docker run -d --name bharatshop-uptime-kuma --restart unless-stopped -p "127.0.0.1:$UptimePort`:3001" -v "bharatshop-uptime-kuma:/app/data" $UptimeImage | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Uptime Kuma container failed to start." }
  if (!(Wait-Http "http://127.0.0.1:$UptimePort/" @{} 180)) { throw "Uptime Kuma did not become ready." }
  Set-DotEnvValue "BHARATSHOP_UPTIME_KUMA_ENABLED" "true"
  Set-DotEnvValue "UPTIME_KUMA_URL" "http://127.0.0.1:$UptimePort"
} else {
  Write-Host "Docker is not ready; Uptime Kuma was skipped." -ForegroundColor Yellow
  Set-DotEnvValue "BHARATSHOP_UPTIME_KUMA_ENABLED" "false"
  Set-DotEnvValue "UPTIME_KUMA_URL" ""
}

Show-Status
Write-Host "`nEnhancement stack configured. Uptime Kuma requires one-time UI setup on first launch." -ForegroundColor Green
