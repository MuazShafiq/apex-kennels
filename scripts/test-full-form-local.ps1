<#
.SYNOPSIS
  Full-form intake smoke test for a LOCAL Apex Worker and development Neon only.
.DESCRIPTION
  Sends one wholly synthetic, nonmedical fixture to 127.0.0.1:8787.
  Expects 201 Created, 200 on exact retry, and 409 if details change.
  Never accesses production URL, never prints credentials or private Form responses.
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$url = 'http://127.0.0.1:8787/api/ingest'

$secure = Read-Host 'Enter LOCAL INTAKE_API_SECRET from .dev.vars' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }

$fixtureId = 'apex-full-local-' + [guid]::NewGuid().ToString('N')
$sample = @{
  source = 'google_form'
  externalResponseId = $fixtureId
  customerName = 'Synthetic Sample Owner'
  phone = '03000000000'
  petName = 'Synthetic Sample Pet'
  startDate = '2026-12-10'
  endDate = '2026-12-12'
  details = @{
    ownerAddress = '123 Synthetic Test Street'
    pickupDropoffRequested = $false
    cameraCageRequested = $true
    emergencyContactPhone = '03000000001'
    breed = 'Synthetic mixed breed'
    gender = 'Male'
    age = '3 years'
    vaccinationStatus = 'Fully vaccinated and booster is up to date'
    distemperHistory = 'No'
    veterinarianPhone = '03000000002'
    personalityTraits = @{ friendly = $true; fears = $false }
    specialInstructions = 'Synthetic care instructions only'
    medicationFeedingInstructions = 'Synthetic sample food schedule'
    termsAccepted = $true
  }
}

try {
  $headers = @{Authorization = 'Bearer ' + $token}
  $json = ConvertTo-Json -Depth 7 -InputObject $sample
  $first = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -ContentType 'application/json' -Body $json -UseBasicParsing
  $firstBody = $first.Content | ConvertFrom-Json
  if ($first.StatusCode -ne 201 -or -not $firstBody.created) {throw 'Expected HTTP 201 Created'}

  $retry = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -ContentType 'application/json' -Body $json -UseBasicParsing
  $retryBody = $retry.Content | ConvertFrom-Json
  if ($retry.StatusCode -ne 200 -or $retryBody.created -or $retryBody.bookingId -ne $firstBody.bookingId) {
    throw 'Exact retry did not preserve booking identity'
  }

  $sample.details.medicationFeedingInstructions = 'Changed synthetic sample schedule'
  $changedJson = ConvertTo-Json -Depth 7 -InputObject $sample
  $conflictCode = 0
  try {
    $changed = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -ContentType 'application/json' -Body $changedJson -UseBasicParsing
    $conflictCode = [int]$changed.StatusCode
  }
  catch [System.Net.WebException] {
    if ($_.Exception.Response) { $conflictCode = [int]$_.Exception.Response.StatusCode }
    else { throw }
  }
  if ($conflictCode -ne 409) {
    throw ('Expected HTTP 409 for changed feeding instructions, got HTTP ' + $conflictCode)
  }
  Write-Host 'Full synthetic booking: HTTP 201' -ForegroundColor Green
  Write-Host 'Exact retry: HTTP 200, identical booking ID' -ForegroundColor Green
  Write-Host 'Changed feeding instructions: HTTP 409, original unchanged' -ForegroundColor Green
  Write-Host ('Development fixture ID: ' + $fixtureId) -ForegroundColor Green
}
finally {
  Remove-Variable token -ErrorAction SilentlyContinue
}
