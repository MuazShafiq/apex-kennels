# Dot-sourced by each user's PowerShell profile (not a standalone executable).
# Native Codex credentials and sessions remain isolated by CODEX_HOME.
# Existing cc-muaz / cc-umer functions are not changed.
function global:Invoke-ApexCodexProfile {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('18', '74')]
        [string]$Account,
        [string[]]$CodexArguments = @()
    )

    # npm on Windows often installs both codex.ps1 and codex.cmd; prefer
    # the .cmd shim to avoid PowerShell execution-policy restrictions.
    $command = Get-Command codex.cmd -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        $command = Get-Command codex -ErrorAction SilentlyContinue
    }
    if ($null -eq $command) {
        throw 'Codex CLI was not found on PATH. Install Codex CLI, then retry.'
    }

    $codexHome = Join-Path $HOME ('.codex-' + $Account)
    if (-not (Test-Path -LiteralPath $codexHome -PathType Container)) {
        [void][System.IO.Directory]::CreateDirectory($codexHome)
    }

    # Restrict these overrides to THIS invocation. Never mutate parent login
    # or Claude environment, and prevent inherited paid-API variables taking over.
    $names = @(
        'CODEX_HOME', 'CODEX_SQLITE_HOME', 'OPENAI_API_KEY',
        'CODEX_ACCESS_TOKEN', 'CODEX_API_KEY', 'OPENAI_BASE_URL',
        'OPENAI_ORG_ID', 'OPENAI_PROJECT_ID'
    )
    $previous = @{}
    foreach ($name in $names) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }

    try {
        foreach ($name in $names) {
            [Environment]::SetEnvironmentVariable($name, $null, 'Process')
        }
        [Environment]::SetEnvironmentVariable('CODEX_HOME', $codexHome, 'Process')
        [Environment]::SetEnvironmentVariable('CODEX_SQLITE_HOME', $codexHome, 'Process')
        & $command @CodexArguments
    }
    finally {
        foreach ($name in $names) {
            [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
        }
    }
}

function global:cdx-18 {
    Invoke-ApexCodexProfile -Account '18' -CodexArguments $args
}

function global:cdx-74 {
    Invoke-ApexCodexProfile -Account '74' -CodexArguments $args
}
