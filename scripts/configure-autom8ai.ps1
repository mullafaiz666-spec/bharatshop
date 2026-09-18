param(
  [string]$EnvFile = (Join-Path (Split-Path -Parent $PSScriptRoot) ".env.local")
)

$ErrorActionPreference = "Stop"

function Protect-DotEnvValue([string]$Value) {
  $escaped = $Value.Replace("\\", "\\\\").Replace('"', '\"').Replace("`r", "\r").Replace("`n", "\n")
  return '"' + $escaped + '"'
}

function Upsert-DotEnvValue {
  param(
    [string[]]$Lines,
    [string]$Name,
    [string]$Value
  )

  $replacement = "$Name=$(Protect-DotEnvValue $Value)"
  $found = $false
  $output = foreach ($line in $Lines) {
    if ($line -match "^[ ]*$([regex]::Escape($Name))[ ]*=") {
      if (-not $found) {
        $found = $true
        $replacement
      }
    } else {
      $line
    }
  }

  if (-not $found) {
    $output += $replacement
  }

  return @($output)
}

Write-Host "BharatShop Autom8AI activation" -ForegroundColor Cyan
Write-Host "This writes only to .env.local, which is ignored by Git."
Write-Host "A webhook token is optional. If your Autom8AI webhook has no token, press Enter when asked."

$url = (Read-Host "Autom8AI webhook URL").Trim()
if (-not $url) { throw "Webhook URL is required." }

try {
  $uri = [Uri]$url
} catch {
  throw "Webhook URL is not valid."
}

$localHost = @("localhost", "127.0.0.1", "::1") -contains $uri.Host
if ($uri.Scheme -ne "https" -and -not $localHost) {
  throw "Webhook URL must use HTTPS unless it targets localhost."
}

$secure = Read-Host "Autom8AI webhook token (optional; press Enter if none)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

$lines = @()
if (Test-Path -LiteralPath $EnvFile) {
  $lines = @(Get-Content -LiteralPath $EnvFile)
  $backup = "$EnvFile.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -LiteralPath $EnvFile -Destination $backup -Force
  Write-Host "Backup created: $backup"
}

$lines = @(Upsert-DotEnvValue -Lines $lines -Name "AUTOM8AI_WEBHOOK_URL" -Value $url)
$tokenUsed = -not [string]::IsNullOrWhiteSpace($token)
if ($tokenUsed) {
  $lines = @(Upsert-DotEnvValue -Lines $lines -Name "AUTOM8AI_WEBHOOK_TOKEN" -Value $token)
} else {
  $lines = @($lines | Where-Object { $_ -notmatch "^[ ]*AUTOM8AI_WEBHOOK_TOKEN[ ]*=" })
}

$encoding = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllLines($EnvFile, $lines, $encoding)

$token = $null
$secure = $null

Write-Host ""
Write-Host "Autom8AI configuration saved safely." -ForegroundColor Green
Write-Host "File: $EnvFile"
Write-Host "Webhook host: $($uri.Host)"
Write-Host ("Token: " + ($(if ($tokenUsed) { "configured (hidden)" } else { "not used" })))
Write-Host ""
Write-Host "Next: restart the BharatShop storefront so .env.local is reloaded."
