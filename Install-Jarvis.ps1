param([string]$ProjectRoot = 'C:\Users\faizm\bharatshop-harness')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $ProjectRoot).Path
if (-not (Test-Path (Join-Path $root 'package.json')) -or -not (Test-Path (Join-Path $root 'scripts\personal-ai.mjs'))) {
    throw 'Choose the existing BharatShop checkout containing scripts\personal-ai.mjs. No files were changed.'
}
Get-Command node -ErrorAction Stop | Out-Null
$source = Join-Path $PSScriptRoot 'scripts\jarvis'
$target = Join-Path $root 'scripts\jarvis'
if (-not (Test-Path (Join-Path $source 'server.mjs'))) { throw 'Extract the complete ZIP first.' }
if (Test-Path $target) {
    foreach ($relative in @('server.mjs','ui\index.html','ui\app.js','ui\style.css')) {
        $existing = Join-Path $target $relative
        if (-not (Test-Path $existing) -or (Get-FileHash -LiteralPath $existing).Hash -ne (Get-FileHash -LiteralPath (Join-Path $source $relative)).Hash) {
            throw 'A different Jarvis installation already exists. Preserve it and reconcile changes before installing. Nothing was overwritten.'
        }
    }
} else {
    Copy-Item -LiteralPath $source -Destination $target -Recurse
}
Write-Host "`nJarvis installed in your existing BharatShop checkout." -ForegroundColor Green
Write-Host 'Starting the local connector. Keep this window open; Ctrl+C stops it.'
Set-Location -LiteralPath $root
& node (Join-Path $target 'server.mjs')
if ($LASTEXITCODE -ne 0) { throw "Jarvis stopped with exit code $LASTEXITCODE" }
