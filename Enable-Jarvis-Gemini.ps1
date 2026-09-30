param([string]$ProjectRoot = 'C:\Users\faizm\bharatshop-harness')
$ErrorActionPreference = 'Stop'
$server = Join-Path $ProjectRoot 'scripts\jarvis\server.mjs'
$worker = Join-Path $ProjectRoot 'scripts\personal-ai.mjs'
$adapter = Join-Path $ProjectRoot 'scripts\jarvis\gemini-chat.mjs'
if (-not (Test-Path $server) -or -not (Test-Path $worker) -or -not (Test-Path $adapter)) { throw 'Jarvis or Gemini adapter missing. Nothing changed.' }
if ((Get-Content $worker -Raw) -notmatch "PERSONAL_AI_CHAT_PROVIDER === 'gemini'") { throw 'Gemini worker is not installed. Nothing changed.' }

$old = "        const child = run(command, args, { cwd: root, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PERSONAL_AI_MODEL: job.model, PERSONAL_AI_CONTEXT: process.env.PERSONAL_AI_CONTEXT || '4096', PERSONAL_AI_MEMORY: 'false' } });"
$new = @'
        const workerEnv = { ...process.env, PERSONAL_AI_MODEL: job.model, PERSONAL_AI_CONTEXT: process.env.PERSONAL_AI_CONTEXT || '4096', PERSONAL_AI_MEMORY: 'false' };
        if (job.route !== 'chat') { delete workerEnv.GEMINI_API_KEY; delete workerEnv.PERSONAL_AI_CHAT_PROVIDER; }
        const child = run(command, args, { cwd: root, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: workerEnv });
'@
$source = Get-Content $server -Raw
if (-not $source.Contains($new.TrimEnd()) -and ([regex]::Matches($source, [regex]::Escape($old))).Count -ne 1) {
  throw 'Local server differs from expected version. Nothing changed.'
}
$backup = Join-Path $env:LOCALAPPDATA ('BharatShop\JarvisBackups\gemini-server-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Copy-Item $server (Join-Path $backup 'server.mjs')
try {
  if (-not $source.Contains($new.TrimEnd())) {
    [IO.File]::WriteAllText($server, $source.Replace($old, $new.TrimEnd()), [Text.UTF8Encoding]::new($false))
  }
  & node --check $server
  if ($LASTEXITCODE -ne 0) { throw 'Server syntax check failed.' }
} catch {
  Copy-Item (Join-Path $backup 'server.mjs') $server -Force
  throw
}

$secure = Read-Host 'Paste your Gemini API key here (input hidden)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ([string]::IsNullOrWhiteSpace($plain)) { throw 'Empty key. Server was not restarted.' }

$listener = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $ownerProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
  if ($ownerProcess.Name -ne 'node.exe' -or $ownerProcess.CommandLine -notmatch [regex]::Escape($server)) {
    throw 'Port 3002 is not owned by the expected Jarvis process. Nothing stopped.'
  }
  Stop-Process -Id $ownerProcess.ProcessId
  for ($i = 0; $i -lt 20 -and (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 250 }
}
$env:GEMINI_API_KEY = $plain
$env:PERSONAL_AI_CHAT_PROVIDER = 'gemini'
$env:PERSONAL_AI_GEMINI_MODEL = 'gemini-2.5-flash'
$stamp = [guid]::NewGuid().ToString('N')
$log = Join-Path $env:TEMP "jarvis-gemini-$stamp.out.log"
$err = Join-Path $env:TEMP "jarvis-gemini-$stamp.err.log"
try { $started = Start-Process -FilePath 'node.exe' -ArgumentList "`"$server`"" -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $err -PassThru }
finally { Remove-Item Env:GEMINI_API_KEY, Env:PERSONAL_AI_CHAT_PROVIDER, Env:PERSONAL_AI_GEMINI_MODEL -ErrorAction SilentlyContinue; $plain = $null }
$key = ''
for ($i = 0; $i -lt 30; $i++) {
  if (Test-Path $log) {
    $content = Get-Content $log -Raw -ErrorAction SilentlyContinue
    if ($content) { $key = [regex]::Match($content, '\b[a-f0-9]{64}\b').Value }
  }
  if ($key.Length -eq 64 -and (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue)) { break }
  if ($started.HasExited) { throw "Jarvis exited. Check $err" }
  Start-Sleep -Seconds 1
}
if ($key.Length -ne 64) { throw "Jarvis did not become ready. Check $err" }
$headers = @{ Authorization = "Bearer $key" }
$health = Invoke-RestMethod 'http://127.0.0.1:3002/api/health' -Headers $headers -TimeoutSec 8
if ($health.root -ne $ProjectRoot) { throw 'Jarvis workspace mismatch.' }
Set-Clipboard -Value $key
'JARVIS RUNNING WITH GEMINI CHAT SELECTED. Pairing key copied to clipboard.'
'Refresh http://127.0.0.1:3002 and reconnect. A successful response will say Provider: Google Gemini.'
'No Gemini API request was sent by this setup script.'
