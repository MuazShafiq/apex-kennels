<#
.SYNOPSIS
  Persist cdx-18 and cdx-74 commands across PowerShell sessions.
.DESCRIPTION
  Adds one dot-source block to the current user's PowerShell profiles and
  creates two independent CODEX_HOME roots. Does NOT authenticate either
  account, edit existing cc-* launchers, copy existing Codex tokens, or run
  production commands. Re-running this installer is idempotent.
#>
[CmdletBinding()]
param(
    # For CI / advanced use. Normally omitted to install both Windows PowerShell
    # and PowerShell 7 all-hosts profiles for the current Windows user.
    [string[]]$ProfilePaths
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$launchers = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'codex-profiles.ps1')).Path

foreach ($account in @('18', '74')) {
    $directory = Join-Path $HOME ('.codex-' + $account)
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
        [void][System.IO.Directory]::CreateDirectory($directory)
    }
    $config = Join-Path $directory 'config.toml'
    if (-not (Test-Path -LiteralPath $config)) {
        # Only ChatGPT subscription authentication; per-account file store.
        # No paid OpenAI API key is used. Never overwrite existing profile config.
        [System.IO.File]::WriteAllText($config, @'
forced_login_method = "chatgpt"
cli_auth_credentials_store = "file"
'@ + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
    }
}

if (-not $PSBoundParameters.ContainsKey('ProfilePaths')) {
    $documents = [Environment]::GetFolderPath('MyDocuments')
    $ProfilePaths = @(
        $PROFILE.CurrentUserAllHosts
        (Join-Path $documents 'WindowsPowerShell\profile.ps1')
        (Join-Path $documents 'PowerShell\profile.ps1')
    )
}

$startMarker = '# BEGIN APEX CODEX PROFILES'
$endMarker = '# END APEX CODEX PROFILES'
$quotedPath = $launchers.Replace("'", "''")
$block = $startMarker + [Environment]::NewLine +
    ". '$quotedPath'" + [Environment]::NewLine +
    $endMarker + [Environment]::NewLine

foreach ($profilePath in ($ProfilePaths | Select-Object -Unique)) {
    if ([string]::IsNullOrWhiteSpace($profilePath)) { continue }
    $parent = Split-Path -Parent $profilePath
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
        [void][System.IO.Directory]::CreateDirectory($parent)
    }
    if (-not (Test-Path -LiteralPath $profilePath)) {
        [System.IO.File]::WriteAllText($profilePath, $block,
            (New-Object System.Text.UTF8Encoding($false)))
        Write-Host ('Created profile launcher in: ' + $profilePath)
        continue
    }
    $existing = [System.IO.File]::ReadAllText($profilePath)
    $start = $existing.IndexOf($startMarker, [StringComparison]::Ordinal)
    $end = $existing.IndexOf($endMarker, [StringComparison]::Ordinal)
    if ($start -ge 0 -or $end -ge 0) {
        if ($start -lt 0 -or $end -lt $start) {
            throw ('Incomplete Apex launcher markers in ' + $profilePath)
        }
        # Replace only our own block; leave any existing aliases and functions.
        $afterMarker = $end + $endMarker.Length
        while ($afterMarker -lt $existing.Length -and
            ($existing[$afterMarker] -eq [char]13 -or $existing[$afterMarker] -eq [char]10)) {
            $afterMarker++
        }
        $replacement = $existing.Substring(0, $start) + $block +
            $existing.Substring($afterMarker)
        if ($replacement -ne $existing) {
            [System.IO.File]::WriteAllText($profilePath, $replacement,
                (New-Object System.Text.UTF8Encoding($false)))
            Write-Host ('Updated Apex launcher block in: ' + $profilePath)
        } else {
            Write-Host ('Apex launcher already installed: ' + $profilePath)
        }
    } else {
        $newline = if ($existing.Length -eq 0 -or $existing.EndsWith([Environment]::NewLine)) {
            ''
        } else {
            [Environment]::NewLine
        }
        [System.IO.File]::AppendAllText($profilePath, $newline + $block,
            (New-Object System.Text.UTF8Encoding($false)))
        Write-Host ('Added Apex launcher block to: ' + $profilePath)
    }
}

Write-Host 'Configured isolated Codex homes: ~/.codex-18 and ~/.codex-74.'
Write-Host 'Open a NEW PowerShell terminal (or dot-source your profile).'
Write-Host 'Sign in individually: cdx-18 login ; cdx-74 login'
Write-Host 'Check modes: cdx-18 login status ; cdx-74 login status'
Write-Host 'The login browser must use the intended ChatGPT account for each alias.'
