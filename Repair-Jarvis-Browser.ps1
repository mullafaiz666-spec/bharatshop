param([string]$ProjectRoot = 'C:\Users\faizm\bharatshop-harness')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $ProjectRoot).Path
$target = Join-Path $root 'services\browser-use-local\runner.py'
if (-not (Test-Path -LiteralPath $target)) { throw 'Jarvis browser worker is missing. Nothing changed.' }
$original = [IO.File]::ReadAllText($target)
$pattern = 'os.getenv("PERSONAL_AI_BROWSER_HEADLESS", "").lower()'
$replacement = 'os.getenv("PERSONAL_AI_BROWSER_HEADLESS", "true").lower()'
if ($original.Contains($replacement)) { Write-Host 'Headless browser default already set.'; return }
if (-not $original.Contains($pattern)) {
    throw 'Browser worker uses a different configuration. Nothing was overwritten; send its runner.py for a tailored fix.'
}
if (($original.Split([string[]]@($pattern), [StringSplitOptions]::None)).Count -ne 2) {
    throw 'Browser setting appears more than once. Nothing was overwritten.'
}
$updated = $original.Replace($pattern, $replacement)
if ($updated -eq $original) { throw 'No browser setting changed.' }
$backup = Join-Path $env:LOCALAPPDATA ('BharatShop\JarvisBackups\browser-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.py')
New-Item -ItemType Directory -Force -Path (Split-Path $backup) | Out-Null
Copy-Item -LiteralPath $target -Destination $backup
try {
    [IO.File]::WriteAllText($target, $updated, [Text.UTF8Encoding]::new($false))
    if (-not ([IO.File]::ReadAllText($target)).Contains($replacement)) { throw 'Browser setting verification failed.' }
} catch {
    Copy-Item -LiteralPath $backup -Destination $target -Force
    throw
}
Write-Host 'Headless browser default applied; other local changes preserved.'
Write-Host 'Existing Jarvis connector can stay open. Retry with an exact website URL.'
