<#
.SYNOPSIS
  Prepare Apex Kennels on Windows PowerShell 5.1+ without contacting production.
.DESCRIPTION
  Requires an existing local clone and Node.js 22 or 24.
  Copies disabled .dev.vars placeholders only when the file is missing.
  Installs packages and executes TypeScript, unit tests, Wrangler dry-run.
  Does not deploy, connect Neon, seed bookings or mutate live data.
#>
[CmdletBinding()]
param(
  [switch]$SkipInstall,
  [switch]$SkipChecks
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $root
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js not found. Install Node.js 24 LTS, reopen PowerShell, then rerun.'
  }
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw 'npm.cmd not found. Repair your Node.js installation, then rerun.'
  }

  $nodeVersion = (& node --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(22|24)\.') {
    throw ('Apex supports Node.js 22.x or 24.x. Current version: ' + $nodeVersion)
  }
  Write-Host ('Node: ' + $nodeVersion) -ForegroundColor Cyan

  $devVars = Join-Path $root '.dev.vars'
  if (-not (Test-Path -LiteralPath $devVars)) {
    Copy-Item -LiteralPath (Join-Path $root '.dev.vars.example') -Destination $devVars
    Write-Host 'Created .dev.vars with DISABLED placeholders. No production database connection.' -ForegroundColor Yellow
  }
  else {
    Write-Host 'Existing .dev.vars preserved. Its contents will NOT be shown.' -ForegroundColor Yellow
  }

  if (-not $SkipInstall) {
    Write-Host 'Installing pinned npm dependencies...' -ForegroundColor Cyan
    & npm.cmd install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
  }

  if (-not $SkipChecks) {
    Write-Host 'Checking TypeScript, tests and Cloudflare bundle...' -ForegroundColor Cyan
    & npm.cmd run cf:check
    if ($LASTEXITCODE -ne 0) { throw 'cf:check failed. Do not deploy until fixed.' }
  }

  Write-Host ''
  Write-Host 'LOCAL SETUP READY' -ForegroundColor Green
  Write-Host 'Start server: npm.cmd run dev'
  Write-Host 'Open:         http://127.0.0.1:8787/demo/staff'
  Write-Host 'Invoice demo: http://127.0.0.1:8787/demo/invoice'
  Write-Host 'Health:       http://127.0.0.1:8787/api/health'
  Write-Host 'Verify:       npm.cmd run local:check  (in a second PowerShell window)'
  Write-Host ''
  Write-Host 'Do not put production credentials in .dev.vars. See docs/local-windows.md.' -ForegroundColor Yellow
}
finally {
  Pop-Location
}
