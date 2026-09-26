param(
  [string]$ProjectRoot = 'C:\Users\faizm\bharatshop-harness',
  [string]$JobId = '8e039da6-9dc2-48bc-a804-4630421460dd'
)

$ErrorActionPreference = 'Stop'
$commit = 'c8ffa8dae8b9e3e7b7ea4c1454216f08d1820448'
$worker = Join-Path $ProjectRoot 'scripts\personal-ai.mjs'

if (-not (Test-Path -LiteralPath $worker)) { throw "Worker missing: $worker" }

$log = Get-ChildItem $env:TEMP -Filter 'jarvis-router-*.out.log' -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $log) { throw 'Current Jarvis router log not found.' }

$raw = Get-Content $log.FullName -Raw
$key = [regex]::Match($raw, '\b[a-f0-9]{64}\b').Value
if ($key.Length -ne 64) { throw 'Current pairing key not found.' }
$headers = @{ Authorization = "Bearer $key" }

Write-Host '=== STOPPING ONLY THE STUCK BUILD JOB ===' -ForegroundColor Cyan
try {
  $job = Invoke-RestMethod "http://127.0.0.1:3002/api/jobs/$JobId" -Headers $headers -TimeoutSec 10
  if ($job.status -eq 'running') {
    Invoke-RestMethod 'http://127.0.0.1:3002/api/stop' -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ id = $JobId } | ConvertTo-Json) | Out-Null
    Write-Host "Stop requested for $JobId" -ForegroundColor Yellow
  } else {
    Write-Host "Job is already $($job.status); no stop required."
  }
}
catch {
  Write-Host "Could not query/stop old job: $($_.Exception.Message)" -ForegroundColor Yellow
}

for ($i = 0; $i -lt 30; $i++) {
  $alive = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match [regex]::Escape($JobId) -or $_.CommandLine -match '@deepseek-ai/dsh@0\.1\.5-rc\.2' }
  if (-not $alive) { break }
  Start-Sleep -Milliseconds 500
}

$backupDir = Join-Path $env:LOCALAPPDATA ('BharatShop\JarvisBackups\ollama-harness-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Copy-Item -LiteralPath $worker -Destination (Join-Path $backupDir 'personal-ai.mjs')

$temp = Join-Path $env:TEMP ('personal-ai-ollama-harness-' + [guid]::NewGuid().ToString('N') + '.mjs')
Invoke-WebRequest "https://raw.githubusercontent.com/mullafaiz666-spec/bharatshop/$commit/scripts/personal-ai.mjs" -OutFile $temp -UseBasicParsing

& node.exe --check $temp
if ($LASTEXITCODE -ne 0) { throw 'Downloaded worker syntax check failed. Existing worker was not replaced.' }

$patched = Get-Content $temp -Raw
if ($patched -notmatch "ollama.*launch.*dsh" -and $patched -notmatch "'launch', 'dsh'") {
  throw 'Expected Ollama Harness launcher marker not found. Existing worker was not replaced.'
}
if ($patched -match "@deepseek-ai/dsh@0\.1\.5-rc\.2.*--profile.*headless") {
  throw 'Legacy npx build launcher still present. Existing worker was not replaced.'
}

Copy-Item -LiteralPath $temp -Destination $worker -Force

Write-Host ''
Write-Host 'JARVIS BUILD WORKER REPAIRED' -ForegroundColor Green
Write-Host 'Old stuck job: stop requested'
Write-Host 'Coding launcher: Ollama -> DeepSeek Harness'
Write-Host 'Legacy direct npx build launcher: removed'
Write-Host "Backup: $backupDir"
Write-Host 'Jarvis server restart is NOT required.'
Write-Host 'Pairing key remains valid.'
