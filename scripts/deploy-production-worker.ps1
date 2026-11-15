<#
.SYNOPSIS
  Deploy Apex production Worker from clean main, preserving Form configuration.
.DESCRIPTION
  Requires production Cloudflare DATABASE_URL secret.
  Checks clean and up-to-date main, runs tests and Worker dry-run, and requires
  explicit typed confirmation. Verifies remote closed gates and full production
  smoke before/after deployment. -RotateIntakeToken generates a separate random
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

function Assert-ApexClosedDeployment {
  $rawDeployments=@(& $wrangler deployments list --config wrangler.jsonc --json)
  if ($LASTEXITCODE -ne 0) {throw 'Cannot inspect deployed Worker versions.'}
  try {
    $deployments=@(($rawDeployments | Out-String | ConvertFrom-Json))
    $latest=$deployments | Sort-Object created_on | Select-Object -Last 1
    $active=@($latest.versions | Where-Object {$_.percentage -gt 0})
    if ($active.Count -eq 0) {throw 'No active version'}
  } catch {throw 'Unexpected deployment inventory; refusing to guess gate state.'}
  foreach ($version in $active) {
    $rawVersion=@(& $wrangler versions view $version.version_id --config wrangler.jsonc --json)
    if ($LASTEXITCODE -ne 0) {throw 'Cannot inspect active Worker bindings.'}
    try {
      $details=$rawVersion | Out-String | ConvertFrom-Json
      $bindings=@($details.resources.bindings)
      if ($details.id -cne $version.version_id -or $bindings.Count -eq 0 -or
          @($bindings | Where-Object {$_.name -eq 'DATABASE_URL'}).Count -ne 1 -or
          @($bindings | Where-Object {$_.name -eq 'ASSETS'}).Count -ne 1) {throw 'Incomplete binding identity'}
      foreach ($gate in @('APEX_PUBLIC_BOOKING_ENABLED','APEX_INVOICE_APPROVAL_ENABLED',
          'APEX_INVOICE_ISSUANCE_ENABLED','APEX_INVOICE_WHATSAPP_ENABLED','WHATSAPP_ALERTS_ENABLED')) {
        $gateEntries=@($bindings | Where-Object {$_.name -ceq $gate})
        if ($gateEntries.Count -gt 1 -or ($gateEntries.Count -eq 1 -and
            ($gateEntries[0].type -cne 'plain_text' -or $gateEntries[0].text -cne 'false'))) {
          throw 'Activation gate is enabled or cannot be verified disabled'
        }
      }
    } catch {throw 'Cannot establish disabled activation gates on every active version; stop and inspect privately.'}
  }
  Write-Host 'Remote activation gates are absent/false on every active version.'
}

function Assert-ApexProductionSmoke {
  $previousOrigin=[Environment]::GetEnvironmentVariable('APEX_WORKER_ORIGIN','Process')
  try {
    $env:APEX_WORKER_ORIGIN=$url
    & node scripts/check-production.mjs
    if ($LASTEXITCODE -ne 0) {throw 'Production smoke failed; keep gates closed and investigate. No automatic rollback or credential change.'}
  } finally {
    if ($null -eq $previousOrigin) {Remove-Item Env:APEX_WORKER_ORIGIN -ErrorAction SilentlyContinue}
    else {$env:APEX_WORKER_ORIGIN=$previousOrigin}
  }
}

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
    throw 'Production Worker intake secret missing. Investigate existing Form configuration; do not rotate credentials as a deployment workaround.'
  }

  Assert-ApexClosedDeployment
  Assert-ApexProductionSmoke
  $ack=Read-Host 'Type DEPLOY-APEX-PRODUCTION to deploy Worker code (existing Google Form configuration is preserved)'
  if ($ack -cne 'DEPLOY-APEX-PRODUCTION') {throw 'Deployment cancelled.'}
  & $wrangler deploy --config wrangler.jsonc
  if ($LASTEXITCODE -ne 0) {throw 'Production Worker deployment failed.'}
  Assert-ApexClosedDeployment
  Assert-ApexProductionSmoke
  Write-Host 'PRODUCTION WORKER DEPLOYED; closed-gate endpoint checks passed. Form configuration is unchanged; authenticated Form submission was not tested.' -ForegroundColor Green

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
