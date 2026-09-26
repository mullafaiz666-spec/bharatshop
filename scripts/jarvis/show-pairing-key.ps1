$ErrorActionPreference = 'Stop'
$keyFile = Join-Path $env:LOCALAPPDATA 'BharatShop\Jarvis\pairing-key.dpapi'
$secure = Get-Content -Raw $keyFile | ConvertTo-SecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    Set-Clipboard -Value $key
    Write-Host 'Jarvis pairing key copied to clipboard for this Windows user.'
}
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
