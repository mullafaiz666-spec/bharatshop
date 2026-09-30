param([string]$ProjectRoot = 'C:\Users\faizm\bharatshop-harness')
$ErrorActionPreference = 'Stop'
$script = Join-Path $ProjectRoot 'scripts\jarvis\server.mjs'
if (-not (Test-Path -LiteralPath $script)) { throw 'Jarvis server missing; nothing stopped.' }
$source = Get-Content -LiteralPath $script -Raw
if ($source -notmatch 'function lastQuestionAnswer\(task\)' -or $source -match 'Assistant \(unverified earlier reply\)') {
  throw 'Chat repair is not installed in this checkout; nothing stopped.'
}
& node --check $script
if ($LASTEXITCODE -ne 0) { throw 'Jarvis syntax check failed; nothing stopped.' }

$listener = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $ownerProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
  $full = [regex]::Escape($script)
  $relative = '\.\\scripts\\jarvis\\server\.mjs(?:\"|\s|$)'
  if ($ownerProcess.Name -ne 'node.exe' -or
      ($ownerProcess.CommandLine -notmatch $full -and $ownerProcess.CommandLine -notmatch $relative)) {
    throw 'Port 3002 belongs to an unrecognized process; nothing stopped.'
  }
  try { $page = (Invoke-WebRequest 'http://127.0.0.1:3002/' -UseBasicParsing -TimeoutSec 5).Content }
  catch { throw 'Port 3002 is not serving the Jarvis page; nothing stopped.' }
  if ($page -notmatch 'JARVIS' -or $page -notmatch 'BHARATSHOP') { throw 'The page is not Jarvis/BharatShop; nothing stopped.' }
  Stop-Process -Id $ownerProcess.ProcessId
  for ($i = 0; $i -lt 20 -and (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 250 }
  if (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue) { throw 'Jarvis did not release port 3002.' }
}

$stamp = [guid]::NewGuid().ToString('N')
$log = Join-Path $env:TEMP "jarvis-chat-$stamp.out.log"
$err = Join-Path $env:TEMP "jarvis-chat-$stamp.err.log"
$started = Start-Process -FilePath 'node.exe' -ArgumentList "`"$script`"" -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $err -PassThru
$key = ''
for ($i = 0; $i -lt 30; $i++) {
  if (Test-Path $log) { $key = [regex]::Match((Get-Content $log -Raw), '\b[a-f0-9]{64}\b').Value }
  if ($key.Length -eq 64 -and (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue)) { break }
  if ($started.HasExited) { throw "Jarvis exited; inspect $err" }
  Start-Sleep -Seconds 1
}
if ($key.Length -ne 64) { throw "Jarvis did not become ready; inspect $err" }
$headers = @{ Authorization = "Bearer $key" }
$health = Invoke-RestMethod 'http://127.0.0.1:3002/api/health' -Headers $headers -TimeoutSec 8
if ($health.root -ne $ProjectRoot -or -not $health.modelInstalled) { throw 'Jarvis health mismatch or model missing; investigate before use.' }
$body = @{ text = 'what did i just ask you'; mode = 'chat' } | ConvertTo-Json
$reply = Invoke-RestMethod 'http://127.0.0.1:3002/api/jobs' -Method Post -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 8
if ($reply.status -ne 'worker_finished' -or $reply.output -notmatch 'cannot verify an earlier question') {
  throw 'Grounded chat verification failed.'
}
Set-Clipboard -Value $key
'JARVIS CHAT VERIFIED: the reply uses recorded conversation and does not invent an earlier question.'
'Pairing key copied to clipboard. Refresh http://127.0.0.1:3002 and reconnect.'
