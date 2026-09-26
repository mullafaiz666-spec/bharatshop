param(
  [string]$ProjectRoot = 'C:\Users\faizm\bharatshop-harness'
)

$ErrorActionPreference = 'Stop'
$commit = '45df9ea76722d2255d7e4beaed0267258458f9c6'
$server = Join-Path $ProjectRoot 'scripts\jarvis\server.mjs'

if (-not (Test-Path -LiteralPath $server)) { throw "Jarvis server missing: $server" }

$listener = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) { throw 'Jarvis is not listening on port 3002.' }

$ownerProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
if ($ownerProcess.Name -ne 'node.exe' -or $ownerProcess.CommandLine -notmatch 'scripts[\\/]jarvis[\\/]server\.mjs') {
  throw 'Port 3002 belongs to another process. Nothing was changed.'
}

$backup = Join-Path $env:LOCALAPPDATA ('BharatShop\JarvisBackups\route-fix-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $backup | Out-Null
Copy-Item -LiteralPath $server -Destination (Join-Path $backup 'server.mjs')

$temp = Join-Path $env:TEMP ('jarvis-server-route-fix-' + [guid]::NewGuid().ToString('N') + '.mjs')
Invoke-WebRequest "https://raw.githubusercontent.com/mullafaiz666-spec/bharatshop/$commit/scripts/jarvis/server.mjs" -OutFile $temp -UseBasicParsing
& node.exe --check $temp
if ($LASTEXITCODE -ne 0) { throw 'Downloaded server syntax check failed. Nothing was changed.' }

$text = Get-Content $temp -Raw
if ($text -notmatch 'open .*https\?:' -and $text -notmatch 'https\?:\\/\\/') { throw 'Browser route fix marker missing.' }
if ($text -notmatch 'bharatshop\\s\+\)\?') { throw 'Company route fix marker missing.' }

Copy-Item -LiteralPath $temp -Destination $server -Force

$secure = Read-Host 'Paste your Gemini API key here (input hidden)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ([string]::IsNullOrWhiteSpace($plain)) { throw "Gemini API key was empty. Server file is patched; restart not attempted. Backup: $backup" }

Stop-Process -Id $ownerProcess.ProcessId
for ($i = 0; $i -lt 30; $i++) {
  if (-not (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 250
}
if (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue) { throw "Port 3002 did not close. Backup: $backup" }

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
    $raw = Get-Content $out -Raw -ErrorAction SilentlyContinue
    if ($raw) { $key = [regex]::Match($raw, '\b[a-f0-9]{64}\b').Value }
  }
  if ($key.Length -eq 64 -and (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue)) { break }
  if ($started.HasExited) { throw "Jarvis exited. Check $err. Backup: $backup" }
  Start-Sleep -Seconds 1
}
if ($key.Length -ne 64) { throw "Jarvis did not become ready. Check $err. Backup: $backup" }

$headers = @{ Authorization = "Bearer $key" }
$health = Invoke-RestMethod 'http://127.0.0.1:3002/api/health' -Headers $headers -TimeoutSec 10
if ($health.version -ne '2.1.0') { throw "Unexpected Jarvis version $($health.version)." }

Set-Clipboard -Value $key
Write-Host ''
Write-Host 'JARVIS ROUTE FIX INSTALLED' -ForegroundColor Green
Write-Host 'Browser URL inspection phrases: fixed'
Write-Host 'BharatShop company-agent phrases: fixed'
Write-Host "Backup: $backup"
Write-Host 'Pairing key copied to clipboard.'
Write-Host 'Open: http://127.0.0.1:3002'
