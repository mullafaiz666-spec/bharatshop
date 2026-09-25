param([string]$ProjectRoot = 'C:\Users\faizm\bharatshop-harness')
$ErrorActionPreference = 'Stop'
$script = Join-Path $ProjectRoot 'scripts\jarvis\server.mjs'
$listener = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) { throw 'Jarvis is not listening on port 3002. Send this error; no process was changed.' }
$ownerProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
if ($ownerProcess.Name -ne 'node.exe' -or $ownerProcess.CommandLine -notmatch [regex]::Escape($script)) {
  throw 'Port 3002 is not owned by the restarted Jarvis process. No process was changed.'
}
$logs = @(Get-ChildItem -Path $env:TEMP -Filter 'jarvis-chat-*.out.log' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
$key = ''
foreach ($log in $logs) {
  if ($log.LastWriteTime -lt $ownerProcess.CreationDate) { continue }
  $content = Get-Content -LiteralPath $log.FullName -Raw -ErrorAction SilentlyContinue
  if ([string]::IsNullOrEmpty($content)) { continue }
  $key = [regex]::Match($content, '\b[a-f0-9]{64}\b').Value
  if ($key.Length -eq 64) { break }
}
if ($key.Length -ne 64) { throw 'The running Jarvis pairing key was not found in its new log. No process was changed.' }
$headers = @{ Authorization = "Bearer $key" }
$health = Invoke-RestMethod 'http://127.0.0.1:3002/api/health' -Headers $headers -TimeoutSec 8
if ($health.root -ne $ProjectRoot -or -not $health.modelInstalled) { throw 'Running Jarvis root or model does not match. No process was changed.' }
$body = @{ text = 'what did i just ask you'; mode = 'chat' } | ConvertTo-Json
$reply = Invoke-RestMethod 'http://127.0.0.1:3002/api/jobs' -Method Post -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 8
if ($reply.status -ne 'worker_finished' -or $reply.output -notmatch 'cannot verify an earlier question') {
  throw "Grounded chat verification failed. Status: $($reply.status); response: $($reply.output)"
}
Set-Clipboard -Value $key
'JARVIS CHAT VERIFIED. Current pairing key copied to clipboard.'
'Refresh http://127.0.0.1:3002 and reconnect with the copied key.'
