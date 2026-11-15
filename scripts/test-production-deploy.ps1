<# Synthetic isolated deploy-flow tests. No real CLI, profile, credentials or network. #>
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repository=Split-Path -Parent $PSScriptRoot
$fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('apex-deploy-test-'+[Guid]::NewGuid().ToString('N'))
$fixtureScript=Join-Path $fixtureRoot 'scripts\deploy-production-worker.ps1'
$fixtureBin=Join-Path $fixtureRoot 'node_modules\.bin'
$fixtureLog=Join-Path $fixtureRoot 'calls.txt'
$savedOrigin=[Environment]::GetEnvironmentVariable('APEX_WORKER_ORIGIN','Process')
[void][IO.Directory]::CreateDirectory((Split-Path -Parent $fixtureScript))
[void][IO.Directory]::CreateDirectory($fixtureBin)
Copy-Item -LiteralPath (Join-Path $repository 'scripts\deploy-production-worker.ps1') -Destination $fixtureScript
$fake=@'
@echo off
echo %1 %2>>"%APEX_DEPLOY_FIXTURE_LOG%"
if "%1"=="secret" (
  echo [{"name":"DATABASE_URL"},{"name":"INTAKE_API_SECRET"}]
  exit /b 0
)
if "%1"=="deployments" (
  if "%APEX_DEPLOY_FIXTURE_MODE%"=="split-enabled" (
    echo [{"created_on":"2026-11-16T00:00:00Z","versions":[{"version_id":"synthetic-version","percentage":50},{"version_id":"synthetic-risky","percentage":50}]}]
    exit /b 0
  )
  echo [{"created_on":"2026-11-16T00:00:00Z","versions":[{"version_id":"synthetic-version","percentage":100}]}]
  exit /b 0
)
if "%1"=="versions" (
  if "%2"=="synthetic-risky" (
    echo {"id":"synthetic-risky","resources":{"bindings":[{"name":"DATABASE_URL"},{"name":"ASSETS"},{"name":"APEX_INVOICE_APPROVAL_ENABLED","type":"plain_text","text":"true"}]}}
    exit /b 0
  )
  if "%APEX_DEPLOY_FIXTURE_MODE%"=="post-enabled" if "%APEX_DEPLOY_FIXTURE_STAGE%"=="after-confirmation" (
    echo {"id":"synthetic-version","resources":{"bindings":[{"name":"DATABASE_URL"},{"name":"ASSETS"},{"name":"WHATSAPP_ALERTS_ENABLED","type":"plain_text","text":"true"}]}}
    exit /b 0
  )
  if "%APEX_DEPLOY_FIXTURE_MODE%"=="enabled" (
    echo {"id":"synthetic-version","resources":{"bindings":[{"name":"DATABASE_URL"},{"name":"ASSETS"},{"name":"WHATSAPP_ALERTS_ENABLED","type":"plain_text","text":"true"}]}}
    exit /b 0
  )
  if "%APEX_DEPLOY_FIXTURE_MODE%"=="unreadable" (
    echo {"id":"synthetic-version","resources":{"bindings":[{"name":"DATABASE_URL"},{"name":"ASSETS"},{"name":"APEX_INVOICE_ISSUANCE_ENABLED","type":"secret_text"}]}}
    exit /b 0
  )
  if "%APEX_DEPLOY_FIXTURE_MODE%"=="empty" (
    echo {"id":"synthetic-version","resources":{"bindings":[]}}
    exit /b 0
  )
  echo {"id":"synthetic-version","resources":{"bindings":[{"name":"DATABASE_URL"},{"name":"ASSETS"},{"name":"APEX_PUBLIC_BOOKING_ENABLED","type":"plain_text","text":"false"}]}}
  exit /b 0
)
if "%1"=="deploy" exit /b 0
exit /b 1
'@
[IO.File]::WriteAllText((Join-Path $fixtureBin 'wrangler.cmd'),$fake.Replace("`r`n","`n").Replace("`n","`r`n"))
$env:APEX_DEPLOY_FIXTURE_LOG=$fixtureLog

# Functions exist only inside this test's scope. The real script is executed
# unchanged from the temporary fixture, resolving its own fake Wrangler path.
function git {
  $global:LASTEXITCODE=0
  if($args[0] -eq 'branch') {'main'}
  elseif($args[0] -eq 'rev-parse') {'synthetic-same-commit'}
}
function npm.cmd { $global:LASTEXITCODE=0 }
function Read-Host { $env:APEX_DEPLOY_FIXTURE_STAGE='after-confirmation'; 'DEPLOY-APEX-PRODUCTION' }
function node {
  if($args[0] -ne 'scripts/check-production.mjs'){throw 'Unexpected Node command'}
  if($env:APEX_WORKER_ORIGIN -cne 'https://apex-kennels-api.muaz-shafiq18.workers.dev'){
    throw 'Smoke did not pin the actual production origin'
  }
  $global:ApexDeploySmokeCalls++
  Add-Content -LiteralPath $fixtureLog -Value 'smoke'
  $global:LASTEXITCODE=0
  if(($env:APEX_DEPLOY_FIXTURE_MODE -eq 'fail-pre-smoke' -and $global:ApexDeploySmokeCalls -eq 1) -or
     ($env:APEX_DEPLOY_FIXTURE_MODE -eq 'fail-post-smoke' -and $global:ApexDeploySmokeCalls -eq 2)){
    $global:LASTEXITCODE=1
  }
}
try {
  foreach($mode in @('closed','enabled','unreadable','empty','split-enabled','post-enabled','fail-pre-smoke','fail-post-smoke')){
    $env:APEX_DEPLOY_FIXTURE_MODE=$mode
    $env:APEX_DEPLOY_FIXTURE_STAGE='before-confirmation'
    $env:APEX_WORKER_ORIGIN='https://synthetic-wrong-origin.invalid'
    $global:ApexDeploySmokeCalls=0
    [IO.File]::WriteAllText($fixtureLog,'')
    $failure=$null
    try { & $fixtureScript } catch { $failure=$_.Exception.Message }
    $calls=[IO.File]::ReadAllLines($fixtureLog)
    $deployCalls=@($calls | Where-Object {$_ -like 'deploy *'}).Count
    if($mode -eq 'closed'){
      if($null -ne $failure){throw ('Closed-flow failed: '+$failure)}
      if($deployCalls -ne 1 -or $global:ApexDeploySmokeCalls -ne 2){throw 'Expected one deploy bracketed by two smoke checks'}
      if(@($calls | Where-Object {$_ -like 'versions *'}).Count -ne 2){throw 'Expected remote gate checks before and after deploy'}
    } else {
      if($null -eq $failure){throw ('Expected refusal for '+$mode)}
      $expectedDeploys=0
      if($mode -in @('fail-post-smoke','post-enabled')){$expectedDeploys=1}
      if($deployCalls -ne $expectedDeploys){throw ('Unexpected deployment on '+$mode)}
    }
    if($env:APEX_WORKER_ORIGIN -cne 'https://synthetic-wrong-origin.invalid'){throw 'Parent origin was not restored'}
    if(@($calls | Where-Object {$_ -like 'secret put*'}).Count -ne 0){throw 'Routine deployment rotated credentials'}
  }
  Write-Host 'PASS: closed deploy, enabled/unreadable/empty gate refusal, pre/post smoke failure, origin restoration, no token rotation (synthetic only)'
} finally {
  if($null -eq $savedOrigin){Remove-Item Env:APEX_WORKER_ORIGIN -ErrorAction SilentlyContinue}
  else{$env:APEX_WORKER_ORIGIN=$savedOrigin}
  Remove-Item Env:APEX_DEPLOY_FIXTURE_LOG -ErrorAction SilentlyContinue
  Remove-Item Env:APEX_DEPLOY_FIXTURE_MODE -ErrorAction SilentlyContinue
  Remove-Item Env:APEX_DEPLOY_FIXTURE_STAGE -ErrorAction SilentlyContinue
  # Verify the absolute recursive-delete target is the fixture we created.
  $resolvedFixture=[IO.Path]::GetFullPath($fixtureRoot)
  $resolvedTemp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
  if(-not $resolvedFixture.StartsWith($resolvedTemp,[StringComparison]::OrdinalIgnoreCase) -or
     -not ([IO.Path]::GetFileName($resolvedFixture)).StartsWith('apex-deploy-test-')){throw 'Unsafe fixture cleanup path'}
  Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
}
# GitHub's PowerShell wrapper propagates LASTEXITCODE even after an expected
# synthetic native failure. Reach this only when every assertion/cleanup passed.
$global:LASTEXITCODE=0
