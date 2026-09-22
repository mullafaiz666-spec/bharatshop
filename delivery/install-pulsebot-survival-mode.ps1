$ErrorActionPreference = "Stop"

$downloads = Join-Path $HOME "Downloads"
$zip = Join-Path $downloads "PulseBot-Survival-Mode-v1.zip"
$dst = Join-Path $downloads "PulseBot-Survival-Mode-v1"
$base = "https://raw.githubusercontent.com/mullafaiz666-spec/bharatshop/delivery/pulsebot-one-click-fix-20260922/delivery/PulseBot-Survival-Mode-v1.zip.b64.part"
$expected = "4940d1edc9549d877815a730bcccd5cfb7256d82dc2b92d6dedf7cd72803fcae"

Write-Host "`n=== FETCHING PULSEBOT SURVIVAL MODE ===" -ForegroundColor Cyan
$b64 = ""
0..4 | ForEach-Object {
  Write-Host "Downloading verified package part $_ ..."
  $b64 += (Invoke-WebRequest -UseBasicParsing -Uri "$base$_" -TimeoutSec 60).Content.Trim()
}

[IO.File]::WriteAllBytes($zip,[Convert]::FromBase64String(($b64 -replace '\s','')))
$actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
Write-Host "SHA256:" $actual
if ($actual -ne $expected) {
  Remove-Item $zip -Force -ErrorAction SilentlyContinue
  throw "Package checksum failed. Nothing was installed."
}
Write-Host "PACKAGE VERIFIED" -ForegroundColor Green

Remove-Item $dst -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -LiteralPath $zip -DestinationPath $downloads -Force

$installer = Join-Path $dst "APPLY_SURVIVAL_MODE.ps1"
if (!(Test-Path $installer)) { throw "Installer missing after extraction: $installer" }

powershell.exe -ExecutionPolicy Bypass -File $installer
if ($LASTEXITCODE -ne 0) { throw "Survival Mode installation failed." }

Write-Host "`nSURVIVAL MODE INSTALLATION COMPLETE" -ForegroundColor Green
