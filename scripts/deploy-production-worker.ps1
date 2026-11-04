<#
.SYNOPSIS
  Deploy Apex production Worker from clean main, without activating Form intake.
.DESCRIPTION
  Requires production Cloudflare DATABASE_URL secret.
  Checks clean and up-to-date main, runs tests and Worker dry-run, and requires
  explicit typed confirmation. -RotateIntakeToken generates a separate random
  production token and puts it on the Windows clipboard for Apps Script.
  Does not alter Form triggers, enable intake, backfill, or send invoices.
#>
[CmdletBinding()]
param([switch]$RotateIntakeToken)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$wrangler=Join-Path $root 'node_modules\.bin\wrangler.cmd'
$url='https://apex-kennels-api.muaz-shafiq18.workers.dev'
Push-Location -LiteralPath $root
try {
  if (-not (Test-Path -LiteralPath $wrangler)) {
    throw 'Wrangler missing; stop Apex dev servers and run npm.cmd ci.'
  }
  $branch=(& git branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0 -or $branch -cne 'main') {
    throw 'Refusing production deployment outside main.'
  }
  & git fetch origin main --quiet
  if ($LASTEXITCODE -ne 0) {throw 'Cannot verify remote main.'}
  $head=(& git rev-parse HEAD).Trim()
  $remote=(& git rev-parse origin/main).Trim()
  if ($head -cne $remote) {throw 'Local main differs from remote; run git pull --ff-only first.'}
  $dirty=@(& git status --porcelain)
  if ($dirty.Count -ne 0) {throw 'Working tree has uncommitted changes; refusing production deploy.'}

  Write-Host 'Running Node typecheck, tests, and Worker dry-run before deployment...' -ForegroundColor Cyan
  & npm.cmd run cf:check
  if ($LASTEXITCODE -ne 0) {throw 'Worker verification failed.'}

  $raw=@(& $wrangler secret list --config wrangler.jsonc)
  if ($LASTEXITCODE -ne 0) {throw 'Could not inspect production Cloudflare secret names.'}
  try { $secretNames=@(($raw | Out-String | ConvertFrom-Json) | ForEach-Object {$_.name}) }
  catch {throw 'Unexpected Wrangler secret-list output; abort rather than guessing.'}
  if ($secretNames -notcontains 'DATABASE_URL') {
    throw 'Production Worker DATABASE_URL secret missing. Do not supply development connection string.'
  }
  if (-not $RotateIntakeToken -and $secretNames -notcontains 'INTAKE_API_SECRET') {
    throw 'Production Worker intake secret missing. Re-run explicitly with -RotateIntakeToken.'
  }

  $ack=Read-Host 'Type DEPLOY-APEX-PRODUCTION to deploy Worker code (Google Form intake stays OFF)'
  if ($ack -cne 'DEPLOY-APEX-PRODUCTION') {throw 'Deployment cancelled.'}
  & $wrangler deploy --config wrangler.jsonc
  if ($LASTEXITCODE -ne 0) {throw 'Production Worker deployment failed.'}
  $health=Invoke-RestMethod -Uri ($url+'/api/health') -Method GET -TimeoutSec 20
  if ($health.status -ne 'ok') {throw 'Production Worker health check failed.'}
  Write-Host 'PRODUCTION WORKER DEPLOYED, HEALTHY. Form intake is unchanged and remains disabled.' -ForegroundColor Green

  if ($RotateIntakeToken) {
    $bytes=New-Object byte[] 32
    $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally {$rng.Dispose()}
    $token=-join ($bytes | ForEach-Object {$_.ToString('x2')})
    try {
      $token | & $wrangler secret put INTAKE_API_SECRET --config wrangler.jsonc
      if ($LASTEXITCODE -ne 0) {throw 'Production intake token rotation failed.'}
      Set-Clipboard -Value $token
      Write-Host 'Production-only intake token rotated and copied to your Windows clipboard.' -ForegroundColor Green
      Write-Host 'Paste into Form-bound Apps Script > Project Settings > Script Properties: APEX_INTAKE_TOKEN'
      Write-Host ('Set APEX_API_URL to '+$url+'/api/ingest')
      Write-Host 'Keep APEX_INTAKE_ENABLED=false and APEX_OWNER_APPROVED_LIVE=false.'
      Write-Host "Clear clipboard afterward: Set-Clipboard -Value ''"
    } finally {
      Remove-Variable token -ErrorAction SilentlyContinue
      [Array]::Clear($bytes,0,$bytes.Length)
    }
  }
}
finally {Pop-Location}
