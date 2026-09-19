$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env.local"

function Read-SecretText([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Validate-PostgresUrl([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "$Name is required." }
  try { $uri = [Uri]$Value } catch { throw "$Name is not a valid URL." }
  if ($uri.Scheme -notin @("postgres","postgresql")) { throw "$Name must use postgres:// or postgresql://." }
  if ([string]::IsNullOrWhiteSpace($uri.Host)) { throw "$Name must include a host." }
  if ([string]::IsNullOrWhiteSpace($uri.UserInfo)) { throw "$Name must include database credentials." }
}

Write-Host "BharatShop guarded database migration setup" -ForegroundColor Cyan
Write-Host "Values are written only to .env.local (ignored by Git) and are never printed."
Write-Host "SOURCE_DATABASE_URL = legacy Render production source"
Write-Host "SUPABASE_DB_URL = Supabase PostgreSQL target"
Write-Host ""

$source = Read-SecretText "SOURCE_DATABASE_URL"
$target = Read-SecretText "SUPABASE_DB_URL"

Validate-PostgresUrl "SOURCE_DATABASE_URL" $source
Validate-PostgresUrl "SUPABASE_DB_URL" $target

if ($source -eq $target) { throw "Source and target database URLs must be different." }

$existing = @()
if (Test-Path $envFile) {
  $existing = Get-Content -LiteralPath $envFile
  Copy-Item -LiteralPath $envFile -Destination "$envFile.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')" -Force
}

$filtered = $existing | Where-Object {
  $_ -notmatch '^SOURCE_DATABASE_URL=' -and
  $_ -notmatch '^SUPABASE_DB_URL='
}

$newLines = @($filtered)
$newLines += "SOURCE_DATABASE_URL=$source"
$newLines += "SUPABASE_DB_URL=$target"

Set-Content -LiteralPath $envFile -Value $newLines -Encoding UTF8

Write-Host ""
Write-Host "Migration connection settings saved safely." -ForegroundColor Green
Write-Host "File: $envFile"
Write-Host "Secret values: [HIDDEN]"
Write-Host "No database query or mutation was performed."
Write-Host ""
Write-Host "Next: npm.cmd run db:migration:preflight:local"
