param([string]$ProjectRoot = 'C:\Users\faizm\bharatshop-harness')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $ProjectRoot).Path
$target = Join-Path $root 'services\browser-use-local\runner.py'
if (-not (Test-Path -LiteralPath $target)) { throw 'Jarvis browser worker is missing. Nothing changed.' }
$expectedOld = '0CC74EEE2AD0DBE1BF8DB18DB6E60B5696C8EBd8E99031A9EF4A16CE44E24EFA'
$expectedNew = '8C732D00EB277A4019C8B18330BD90115F27EC128BC3E53FCBA52E46A4CA028A'
$current = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
if ($current -eq $expectedNew) { Write-Host 'Browser worker update already installed.'; return }
if ($current -ne $expectedOld) { throw 'Local browser worker has custom changes. Nothing was overwritten.' }
$incoming = Join-Path $env:TEMP ('jarvis-browser-' + [guid]::NewGuid().ToString('N') + '.py')
try {
    Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/mullafaiz666-spec/bharatshop/c85d51ee2579197f84a850dd5ee2bdc2595e7e65/services/browser-use-local/runner.py' -OutFile $incoming -UseBasicParsing
    if ((Get-FileHash -LiteralPath $incoming -Algorithm SHA256).Hash -ne $expectedNew) { throw 'Download verification failed. Nothing changed.' }
    $backup = Join-Path $env:LOCALAPPDATA ('BharatShop\JarvisBackups\browser-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.py')
    New-Item -ItemType Directory -Force -Path (Split-Path $backup) | Out-Null
    Copy-Item -LiteralPath $target -Destination $backup
    Copy-Item -LiteralPath $incoming -Destination $target
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $expectedNew) {
        Copy-Item -LiteralPath $backup -Destination $target -Force
        throw 'Installed file verification failed. Previous worker restored.'
    }
    Write-Host 'Jarvis browser worker updated. Existing connector can stay open.'
    Write-Host 'Try a browser task with an exact website URL. The result will show whether Chromium launches.'
} finally { Remove-Item -LiteralPath $incoming -Force -ErrorAction SilentlyContinue }
