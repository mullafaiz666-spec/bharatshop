param([string]$ProjectRoot = 'C:\Users\faizm\bharatshop-harness')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $ProjectRoot).Path
if (-not (Test-Path (Join-Path $root 'package.json')) -or -not (Test-Path (Join-Path $root 'scripts\personal-ai.mjs'))) {
    throw 'Choose the existing BharatShop checkout containing scripts\personal-ai.mjs. No files were changed.'
}
Get-Command node -ErrorAction Stop | Out-Null
$source = Join-Path $PSScriptRoot 'scripts\jarvis'
$target = Join-Path $root 'scripts\jarvis'
$files = @('server.mjs','ui/index.html','ui/app.js','ui/style.css')
$knownPath = Join-Path $PSScriptRoot 'jarvis-upgrade-known.json'
if (-not (Test-Path $knownPath)) { throw 'Extract the complete integration ZIP, including jarvis-upgrade-known.json.' }
$known = Get-Content -LiteralPath $knownPath -Raw | ConvertFrom-Json
$changes = @()
foreach ($relative in $files) {
    $incoming = Join-Path $source $relative
    if (-not (Test-Path $incoming)) { throw "Incomplete bundle: $relative. No files were changed." }
    $existing = Join-Path $target $relative
    if (Test-Path $existing) {
        $currentHash = (Get-FileHash -LiteralPath $existing -Algorithm SHA256).Hash
        $newHash = (Get-FileHash -LiteralPath $incoming -Algorithm SHA256).Hash
        if ($currentHash -eq $newHash) { continue }
        $property = $known.PSObject.Properties[$relative]
        if ($null -eq $property -or $currentHash -ne $property.Value) {
            throw "Custom or unknown Jarvis file: $relative. Preserve and reconcile it first. Nothing was overwritten."
        }
    } elseif (Test-Path $target) {
        throw "Existing Jarvis installation is incomplete: $relative. Nothing was overwritten."
    }
    $changes += $relative
}
if (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Port 3002 is in use. Stop the old Jarvis connector with Ctrl+C, then run this installer again.'
}
$backup = $null
if ($changes.Count -gt 0 -and (Test-Path $target)) {
    $backupRoot = Join-Path $env:LOCALAPPDATA 'BharatShop\JarvisBackups'
    $backup = Join-Path $backupRoot ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N'))
    foreach ($relative in $files) {
        $destination = Join-Path $backup $relative
        New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
        Copy-Item -LiteralPath (Join-Path $target $relative) -Destination $destination
    }
    Write-Host "Previous Jarvis version backed up to: $backup"
}
try {
    foreach ($relative in $changes) {
        $destination = Join-Path $target $relative
        New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
        Copy-Item -LiteralPath (Join-Path $source $relative) -Destination $destination -Force
        if ((Get-FileHash -LiteralPath $destination).Hash -ne (Get-FileHash -LiteralPath (Join-Path $source $relative)).Hash) { throw "Copy verification failed: $relative" }
    }
} catch {
    if ($backup) {
        foreach ($relative in $files) { Copy-Item -LiteralPath (Join-Path $backup $relative) -Destination (Join-Path $target $relative) -Force }
        Write-Host 'Upgrade failed; previous Jarvis files restored.' -ForegroundColor Yellow
    }
    throw
}
Write-Host "`nJarvis V2 is ready in your existing BharatShop checkout." -ForegroundColor Green
Write-Host 'Starting the local connector. Keep this window open; Ctrl+C stops it.'
Set-Location -LiteralPath $root
& node (Join-Path $target 'server.mjs')
if ($LASTEXITCODE -ne 0) { throw "Jarvis stopped with exit code $LASTEXITCODE" }
