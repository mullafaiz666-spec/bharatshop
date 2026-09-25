param([string]$ProjectRoot = 'C:\Users\faizm\bharatshop-harness')
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath $ProjectRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json')) -or
    -not (Test-Path -LiteralPath (Join-Path $root 'scripts\personal-ai.mjs'))) {
    throw 'The BharatShop checkout is missing its package.json or Personal AI worker. Nothing changed.'
}
Get-Command node -ErrorAction Stop | Out-Null

$revision = 'b06c55d7f79dec3b009fdb4970ebdf2f4a74d121'
$base = "https://raw.githubusercontent.com/mullafaiz666-spec/bharatshop/$revision/scripts/jarvis"
$files = [ordered]@{
    'server.mjs' = '09ebfc126ad627b5acb7539ec4f4ebbb31ad12a4bcbbca8092667482c68decfb'
    'ui/index.html' = '7b2ff44820adb7f186d1c5a55f0140175e87bf868559b5b5fc4ca95ee51b654b'
    'ui/app.js' = 'a42a26bbad0efa06ad3fadc9cc946f977eecf5e403b7218e552bf20acbdebab9'
    'ui/style.css' = 'fac63fa195a499d652397f8c31dd13331c3cdf926642c792f014efa1daee90d6'
}
$managed = @{
    'server.mjs' = @('5a09b1eb3ae571e44cffd7cb7591162567a64606fcacd178bf748f60651d05c8', 'bb48e86a238e7c6f2662ce07437dd27cfdfbed1e55903d6c4047f5be5c54f647')
    'ui/index.html' = @('81afd8bfe5a107dbf4d336265ac70dd947ac8c887691eda25ad312975903c244', '0c24f5087123c8b6a79f561c6893e9d9648a1758fda5702c0767d6ec4806bd85', '7b2ff44820adb7f186d1c5a55f0140175e87bf868559b5b5fc4ca95ee51b654b')
    'ui/app.js' = @('665ea449a59d8b2416df56f907620407a8e70f7b3045cdc971cf405b2a01bba6', '327e728b6029300392980f541548014eeb8c79c966283e7a586abac10637025e', '6c86d9ce0bafc4c477cab5bf6dd8b532139127c6ba85b426a7726da37bd39a5b')
    'ui/style.css' = @('25077be36154a5f155419cff3b8780fdc5daf0eb34925d4580c8401efd5b23c1', '8d2a174a336c8d2d0fc1e2ed9bc663f6bb474e069faefdb226322b855d2bfc34', 'fac63fa195a499d652397f8c31dd13331c3cdf926642c792f014efa1daee90d6')
}
$target = Join-Path $root 'scripts\jarvis'
$staging = Join-Path $env:TEMP ('JarvisDeepSeek-' + [guid]::NewGuid().ToString('N'))
$backup = $null
try {
    foreach ($relative in $files.Keys) {
        $incoming = Join-Path $staging $relative
        New-Item -ItemType Directory -Force -Path (Split-Path $incoming) | Out-Null
        Invoke-WebRequest -Uri "$base/$relative" -OutFile $incoming -UseBasicParsing
        if ((Get-FileHash -LiteralPath $incoming -Algorithm SHA256).Hash -ne $files[$relative]) {
            throw "Download verification failed: $relative. Nothing changed."
        }
    }

    if (Test-Path -LiteralPath $target) {
        foreach ($relative in $files.Keys) {
            $existing = Join-Path $target $relative
            if (-not (Test-Path -LiteralPath $existing)) { throw "Incomplete Jarvis installation: $relative. Nothing changed." }
            $hash = (Get-FileHash -LiteralPath $existing -Algorithm SHA256).Hash
            if ($hash -ne $files[$relative] -and $hash -notin $managed[$relative]) {
                throw "Custom Jarvis file: $relative. Preserve it and reconcile changes first. Nothing changed."
            }
        }
        $backup = Join-Path $env:LOCALAPPDATA ('BharatShop\JarvisBackups\' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Force -Path (Split-Path $backup) | Out-Null
        Copy-Item -LiteralPath $target -Destination $backup -Recurse -Force
        Write-Host "Previous Jarvis backed up to $backup"
    }

    $listener = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
        $ownerProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
        $expectedScript = Join-Path $target 'server.mjs'
        if ($ownerProcess.Name -ne 'node.exe' -or $ownerProcess.CommandLine -notmatch [regex]::Escape($expectedScript)) {
            throw 'Port 3002 belongs to another process. Nothing changed.'
        }
        Stop-Process -Id $ownerProcess.ProcessId
    }

    try {
        foreach ($relative in $files.Keys) {
            $destination = Join-Path $target $relative
            New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
            Copy-Item -LiteralPath (Join-Path $staging $relative) -Destination $destination -Force
            if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $files[$relative]) {
                throw "Copy verification failed: $relative"
            }
        }
    } catch {
        if ($backup) {
            foreach ($relative in $files.Keys) {
                $destination = Join-Path $target $relative
                New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
                Copy-Item -LiteralPath (Join-Path $backup $relative) -Destination $destination -Force
            }
            Write-Host 'Previous Jarvis files restored.' -ForegroundColor Yellow
        }
        throw
    }

    Write-Host 'Jarvis DeepSeek connector installed. Starting on http://127.0.0.1:3002.' -ForegroundColor Green
    Set-Location -LiteralPath $root
    & node (Join-Path $target 'server.mjs')
} finally {
    Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
}
