param([string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path)
$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
if (-not (Test-Path (Join-Path $ProjectRoot 'scripts\jarvis\server.mjs'))) { throw 'Jarvis server missing from project.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required on PATH.' }
$state = Join-Path $env:LOCALAPPDATA 'BharatShop\Jarvis'
New-Item -ItemType Directory -Force -Path $state | Out-Null
$keyFile = Join-Path $state 'pairing-key.dpapi'
if (-not (Test-Path $keyFile)) {
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $key = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
    ConvertTo-SecureString $key -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -Path $keyFile -NoNewline
}
$taskName = 'BharatShop Jarvis'
$launcher = Join-Path $ProjectRoot 'scripts\jarvis\start-persistent.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}" -ProjectRoot "{1}"' -f $launcher, $ProjectRoot)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -RestartCount 100 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Jarvis local connector for BharatShop; runs while this user is signed in.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host 'Jarvis installed for restart at Windows sign-in. Open http://127.0.0.1:3002 when this laptop is on and signed in.'
Write-Host 'To display the pairing key locally, run scripts\jarvis\show-pairing-key.ps1.'
