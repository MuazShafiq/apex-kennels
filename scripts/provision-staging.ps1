<#
.SYNOPSIS
  Provision a separate Apex Cloudflare staging Worker against Neon local-development.
.DESCRIPTION
  Never touches the production Worker name/config. Prompts for the dedicated
  development Neon URL without showing it or storing it in Git.
  Generates a random staging-only intake token, sets Cloudflare secrets,
  checks the staging health endpoint, and places the staging token in the
  Windows clipboard for one-time insertion into Apps Script Script Properties.
  No real Form response, customer email, invoice or historical replay occurs.
#>
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$wrangler=Join-Path $root 'node_modules\.bin\wrangler.cmd'
$stagingUrl='https://apex-kennels-intake-staging.muaz-shafiq18.workers.dev'
Push-Location -LiteralPath $root
try {
  if (-not (Test-Path -LiteralPath $wrangler)) {
    throw 'Wrangler missing. Run npm.cmd ci first from the Apex repository.'
  }
  if (-not (Test-Path -LiteralPath '.\wrangler.staging.jsonc')) {
    throw 'Missing staging config. Ensure you checked out feat/full-form-intake-staging.'
  }
  $answer=Read-Host 'Type local-development to confirm the Neon branch you will use (never production)'
  if ($answer -cne 'local-development') {
    throw 'Aborted. Confirm the Neon development branch before any Worker secrets are set.'
  }
  Write-Host 'Deploying the isolated staging Worker; no production Worker or database is modified...' -ForegroundColor Cyan
  & $wrangler deploy --config wrangler.staging.jsonc
  if ($LASTEXITCODE -ne 0) {throw 'Staging deploy failed. Ensure Wrangler is logged into the correct Cloudflare account.'}

  $devUrlSecure=Read-Host 'Paste the Neon local-development branch pooled DATABASE_URL (hidden)' -AsSecureString
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($devUrlSecure)
  try { $devUrl=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  try {
    if ($devUrl -notmatch '^postgres(ql)?://\S+$') {
      throw 'Invalid development Postgres URL. Use the pooled connection string from the local-development branch.'
    }
    $devUrl | & $wrangler secret put DATABASE_URL --config wrangler.staging.jsonc
    if ($LASTEXITCODE -ne 0) {throw 'Setting staging development DATABASE_URL failed.'}
  }
  finally { Remove-Variable devUrl -ErrorAction SilentlyContinue }

  $bytes=New-Object byte[] 32
  $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  $token=-join ($bytes | ForEach-Object { $_.ToString('x2') })
  try {
    $token | & $wrangler secret put INTAKE_API_SECRET --config wrangler.staging.jsonc
    if ($LASTEXITCODE -ne 0) {throw 'Setting staging intake secret failed.'}
    $health=Invoke-RestMethod -Uri ($stagingUrl+'/api/health') -TimeoutSec 20 -Method GET
    if ($health.status -ne 'ok') {throw 'Staging health did not return ok.'}
    Set-Clipboard -Value $token
    Write-Host ''
    Write-Host 'STAGING WORKER HEALTHY. STAGING TOKEN COPIED TO WINDOWS CLIPBOARD.' -ForegroundColor Green
    Write-Host 'In the existing Google Apps Script project, open Project Settings > Script Properties:'
    Write-Host '  Add APEX_STAGING_INTAKE_TOKEN and paste the clipboard value.'
    Write-Host '  DO NOT change APEX_INTAKE_ENABLED=false or add a trigger.'
    Write-Host 'Then run only apexTestStagingDelivery() in the Apps Script function dropdown.'
    Write-Host ('Staging endpoint: '+$stagingUrl+'/api/ingest')
    Write-Host 'After pasting the token, clear the clipboard with: Set-Clipboard -Value ''' -ForegroundColor Yellow
  }
  finally {
    Remove-Variable token -ErrorAction SilentlyContinue
    [Array]::Clear($bytes,0,$bytes.Length)
  }
}
finally { Pop-Location }
