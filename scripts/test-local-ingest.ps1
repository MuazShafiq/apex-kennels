<#
.SYNOPSIS
  Test local booking persistence using ONLY the local Worker at 127.0.0.1:8787.
.DESCRIPTION
  Requires a Neon local-development branch URL and separate local API token in .dev.vars.
  Creates one clearly synthetic booking on that development branch.
  Sends an identical retry, verifies the same booking ID, and prints no credentials.
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$url = 'http://127.0.0.1:8787/api/ingest'
$secure = Read-Host 'Enter the LOCAL INTAKE_API_SECRET from .dev.vars' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

$fixtureId = 'apex-local-' + [guid]::NewGuid().ToString('N')
$body = @{
  source = 'google_form'
  externalResponseId = $fixtureId
  customerName = 'Synthetic Local Owner'
  phone = '03000000000'
  petName = 'Synthetic Local Pet'
  startDate = '2026-12-10'
  endDate = '2026-12-12'
} | ConvertTo-Json

try {
  $first = $null
  for ($attempt = 1; $attempt -le 2; $attempt++) {
    $response = Invoke-WebRequest -Uri $url -Method POST -Headers @{ Authorization = 'Bearer ' + $token } -ContentType 'application/json' -Body $body -UseBasicParsing
    $parsed = $response.Content | ConvertFrom-Json

    if ($attempt -eq 1) {
      if ($response.StatusCode -ne 201 -or -not $parsed.created) {
        throw ('First local intake expected HTTP 201 Created, got ' + $response.StatusCode)
      }
      $first = $parsed.bookingId
    }
    else {
      if ($response.StatusCode -ne 200 -or $parsed.created -or $parsed.bookingId -ne $first) {
        throw 'Repeated local intake did not return the same booking without duplication.'
      }
    }
    Write-Host ('Attempt ' + $attempt + ': HTTP ' + $response.StatusCode) -ForegroundColor Green
  }
  Write-Host ('Local development booking saved and retry verified. Fixture ID: ' + $fixtureId) -ForegroundColor Green
}
finally {
  Remove-Variable token -ErrorAction SilentlyContinue
}
