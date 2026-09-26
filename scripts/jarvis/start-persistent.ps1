param([string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path)
$ErrorActionPreference = 'Stop'
$state = Join-Path $env:LOCALAPPDATA 'BharatShop\Jarvis'
$keyFile = Join-Path $state 'pairing-key.dpapi'
if (-not (Test-Path $keyFile)) { throw 'Jarvis pairing key missing. Run install-persistent.ps1 as this Windows user.' }
$secure = Get-Content -Raw $keyFile | ConvertTo-SecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $env:JARVIS_PAIRING_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
try {
    Set-Location $ProjectRoot
    & node (Join-Path $ProjectRoot 'scripts\jarvis\server.mjs')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally { Remove-Item Env:\JARVIS_PAIRING_KEY -ErrorAction SilentlyContinue }
