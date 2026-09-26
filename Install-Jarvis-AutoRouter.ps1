param(
  [string]$ProjectRoot = 'C:\Users\faizm\bharatshop-harness'
)

$ErrorActionPreference = 'Stop'
$commit = '1b60b3de721734d5ae382ab8b3158b04a15a18fc'
$server = Join-Path $ProjectRoot 'scripts\jarvis\server.mjs'
$worker = Join-Path $ProjectRoot 'scripts\personal-ai.mjs'
$gemini = Join-Path $ProjectRoot 'scripts\jarvis\gemini-chat.mjs'

foreach ($path in @($server, $worker, $gemini)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Required Jarvis file is missing: $path"
  }
}

$listener = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $ownerProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
  if ($ownerProcess.Name -ne 'node.exe' -or $ownerProcess.CommandLine -notmatch 'scripts[\\/]jarvis[\\/]server\.mjs') {
    throw 'Port 3002 belongs to another process. Nothing was changed.'
  }
}

$backup = Join-Path $env:LOCALAPPDATA ('BharatShop\JarvisBackups\auto-router-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $backup | Out-Null
Copy-Item -LiteralPath $server -Destination (Join-Path $backup 'server.mjs')
Copy-Item -LiteralPath $worker -Destination (Join-Path $backup 'personal-ai.mjs')
Copy-Item -LiteralPath $gemini -Destination (Join-Path $backup 'gemini-chat.mjs')

$temp = Join-Path $env:TEMP ('jarvis-router-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $temp | Out-Null

$files = @(
  @{ Rel='scripts/personal-ai.mjs'; Temp=(Join-Path $temp 'personal-ai.mjs'); Dest=$worker },
  @{ Rel='scripts/jarvis/server.mjs'; Temp=(Join-Path $temp 'server.mjs'); Dest=$server },
  @{ Rel='scripts/jarvis/gemini-chat.mjs'; Temp=(Join-Path $temp 'gemini-chat.mjs'); Dest=$gemini }
)

try {
  foreach ($file in $files) {
    $url = "https://raw.githubusercontent.com/mullafaiz666-spec/bharatshop/$commit/$($file.Rel)"
    Invoke-WebRequest -Uri $url -OutFile $file.Temp -UseBasicParsing
    & node.exe --check $file.Temp
    if ($LASTEXITCODE -ne 0) { throw "Syntax check failed for $($file.Rel)" }
  }

  $workerText = Get-Content (Join-Path $temp 'personal-ai.mjs') -Raw
  $serverText = Get-Content (Join-Path $temp 'server.mjs') -Raw
  $geminiText = Get-Content (Join-Path $temp 'gemini-chat.mjs') -Raw

  foreach ($required in @('JARVIS_CODING_MODEL','JARVIS_FAST_MODEL','JARVIS_TOOL_MODEL','PERSONAL_AI_CHAT_PROVIDER')) {
    if ($workerText -notmatch [regex]::Escape($required)) { throw "Router marker missing: $required" }
  }
  if ($serverText -notmatch "version:\s*'2\.1\.0'") { throw 'Jarvis server 2.1.0 marker missing.' }
  if ($serverText -notmatch "/api/jobs/") { throw 'Per-job result endpoint marker missing.' }
  if ($geminiText -notmatch "gemini-3\.5-flash") { throw 'Gemini 3.5 Flash marker missing.' }

  foreach ($file in $files) {
    Copy-Item -LiteralPath $file.Temp -Destination $file.Dest -Force
  }
}
catch {
  Copy-Item -LiteralPath (Join-Path $backup 'server.mjs') -Destination $server -Force
  Copy-Item -LiteralPath (Join-Path $backup 'personal-ai.mjs') -Destination $worker -Force
  Copy-Item -LiteralPath (Join-Path $backup 'gemini-chat.mjs') -Destination $gemini -Force
  throw
}

$secure = Read-Host 'Paste your Gemini API key here (input hidden)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ([string]::IsNullOrWhiteSpace($plain)) {
  throw "Gemini API key was empty. Files are installed but Jarvis was not restarted. Backup: $backup"
}

if ($listener) {
  Stop-Process -Id $ownerProcess.ProcessId
  for ($i = 0; $i -lt 30; $i++) {
    if (-not (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 250
  }
}
if (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue) {
  throw "Port 3002 did not close. Files are installed; restart was not attempted. Backup: $backup"
}

$env:GEMINI_API_KEY = $plain
$env:PERSONAL_AI_CHAT_PROVIDER = 'auto'
$env:PERSONAL_AI_GEMINI_MODEL = 'gemini-3.5-flash'
$env:PERSONAL_AI_MODEL = 'deepseek-coder-v2:16b'
$env:JARVIS_CODING_MODEL = 'deepseek-coder-v2:16b'
$env:JARVIS_FAST_MODEL = 'qwen3.5:4b'
$env:JARVIS_TOOL_MODEL = 'functiongemma:270m'

$stamp = [guid]::NewGuid().ToString('N')
$out = Join-Path $env:TEMP "jarvis-router-$stamp.out.log"
$err = Join-Path $env:TEMP "jarvis-router-$stamp.err.log"

try {
  $started = Start-Process -FilePath 'node.exe' -ArgumentList "`"$server`"" -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
}
finally {
  Remove-Item Env:GEMINI_API_KEY, Env:PERSONAL_AI_CHAT_PROVIDER, Env:PERSONAL_AI_GEMINI_MODEL, Env:PERSONAL_AI_MODEL, Env:JARVIS_CODING_MODEL, Env:JARVIS_FAST_MODEL, Env:JARVIS_TOOL_MODEL -ErrorAction SilentlyContinue
  $plain = $null
}

$key = ''
for ($i = 0; $i -lt 40; $i++) {
  if (Test-Path $out) {
    $text = Get-Content $out -Raw -ErrorAction SilentlyContinue
    if ($text) { $key = [regex]::Match($text, '\b[a-f0-9]{64}\b').Value }
  }
  if ($key.Length -eq 64 -and (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue)) { break }
  if ($started.HasExited) { throw "Jarvis exited during startup. Check $err. Backup: $backup" }
  Start-Sleep -Seconds 1
}
if ($key.Length -ne 64) { throw "Jarvis did not become ready. Check $err. Backup: $backup" }

$headers = @{ Authorization = "Bearer $key" }
$health = Invoke-RestMethod 'http://127.0.0.1:3002/api/health' -Headers $headers -TimeoutSec 10
if ($health.version -ne '2.1.0') { throw "Unexpected Jarvis version $($health.version). Backup: $backup" }
if ($health.root -ne $ProjectRoot) { throw "Jarvis workspace mismatch. Backup: $backup" }

Set-Clipboard -Value $key

Write-Host ''
Write-Host 'JARVIS AUTO ROUTER INSTALLED' -ForegroundColor Green
Write-Host "Version:       $($health.version)"
Write-Host "Chat:          Gemini 3.5 Flash -> visible Ollama fallback"
Write-Host "Coding:        deepseek-coder-v2:16b"
Write-Host "Fast local:    qwen3.5:4b"
Write-Host "Tool router:   functiongemma:270m"
Write-Host "Job endpoint:  GET /api/jobs/{id}"
Write-Host "Backup:        $backup"
Write-Host 'Pairing key copied to clipboard.'
Write-Host 'Open: http://127.0.0.1:3002'
