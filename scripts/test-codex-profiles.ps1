<#
  CI test for profile installers. No real Codex installation, login, API calls,
  or production access. Run in a fresh -NoProfile -File process on PowerShell
  5.1 or 7. All home-relative filesystem operations use a temporary fixture.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$work=Join-Path ([System.IO.Path]::GetTempPath()) ('apex-codex-profiles-'+[Guid]::NewGuid().ToString('N'))
[void][System.IO.Directory]::CreateDirectory($work)
$profile=Join-Path $work 'test-profile.ps1'
$log=Join-Path $work 'observations.txt'
$fixtureHome=Join-Path $work 'home'
[void][System.IO.Directory]::CreateDirectory($fixtureHome)
$env:APEX_PROFILE_TEST_HOME=$fixtureHome
$realFiles=@(
    (Join-Path $HOME '.codex-launchers\codex-profiles.ps1'),
    (Join-Path $HOME '.codex-18\config.toml'),
    (Join-Path $HOME '.codex-74\config.toml')
)
$realFingerprints=@{}
foreach($file in $realFiles){
    $realFingerprints[$file]=if(Test-Path -LiteralPath $file){(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash}else{'absent'}
}
# Test-only command interception keeps the actual installer and loader unchanged.
# Do not overwrite HOME or point a real Codex process at this fixture.
function global:Join-Path {
    param([string]$Path,[string]$ChildPath)
    if($Path -ceq $HOME){
        if(-not $env:APEX_PROFILE_TEST_HOME){throw 'Missing synthetic home fixture'}
        $Path=$env:APEX_PROFILE_TEST_HOME
    }
    Microsoft.PowerShell.Management\Join-Path -Path $Path -ChildPath $ChildPath
}
try {
    $fixture = 'function global:cc-muaz { "muaz-ok" }' + [Environment]::NewLine +
        'function global:cc-umer { "umer-ok" }' + [Environment]::NewLine
    [System.IO.File]::WriteAllText($profile, $fixture)
    & (Join-Path $root 'scripts\install-codex-profiles.ps1') -ProfilePaths @($profile)
    & (Join-Path $root 'scripts\install-codex-profiles.ps1') -ProfilePaths @($profile)
    $contents=[System.IO.File]::ReadAllText($profile)
    $markers=[regex]::Matches($contents,'# BEGIN APEX CODEX PROFILES')
    if($markers.Count -ne 1){throw 'Non-idempotent install: duplicate launcher block'}
    $installedLauncher=Join-Path $HOME '.codex-launchers\codex-profiles.ps1'
    if(-not (Test-Path -LiteralPath $installedLauncher)){
        throw 'Expected portable user-home launcher copy'
    }
    . $profile
    if((cc-muaz) -ne 'muaz-ok' -or (cc-umer) -ne 'umer-ok'){
        throw 'Existing Claude launchers were modified'
    }
    $env:APEX_PROFILE_TEST_LOG=$log
    function global:codex {
        if ($args[0] -eq '--synthetic-failure') { throw 'SYNTHETIC_CODEX_FAILURE' }
        $data=@(
            $env:CODEX_HOME,
            $env:CODEX_SQLITE_HOME,
            $(if($null -eq $env:OPENAI_API_KEY){'NO_API_KEY'}else{'API_KEY_LEAK'}),
            $(if($null -eq $env:CODEX_ACCESS_TOKEN){'NO_ACCESS_TOKEN'}else{'ACCESS_TOKEN_LEAK'}),
            ($args -join '|')
        )
        [System.IO.File]::AppendAllText($env:APEX_PROFILE_TEST_LOG,
            ($data -join ';')+[Environment]::NewLine)
    }
    # Mock the preferred Windows shim too, even when a real CLI is installed.
    function global:codex.cmd { codex @args }
    $env:CODEX_HOME='PREVIOUS_HOME'
    $env:CODEX_SQLITE_HOME='PREVIOUS_SQLITE'
    $env:OPENAI_API_KEY='DUMMY_SENTINEL_NOT_A_SECRET'
    $env:CODEX_ACCESS_TOKEN='DUMMY_SENTINEL_NOT_A_SECRET'
    cdx-18 login status
    cdx-74 resume --last
    $lines=[System.IO.File]::ReadAllLines($log)
    if($lines.Length -ne 2){throw 'Expected exactly two isolated Codex invocations'}
    if(-not $lines[0].Contains('.codex-18;') -or
        -not $lines[0].EndsWith('NO_API_KEY;NO_ACCESS_TOKEN;login|status')){
        throw ('Wrong primary Codex environment: '+$lines[0])
    }
    if(-not $lines[0].StartsWith($fixtureHome+[IO.Path]::DirectorySeparatorChar) -or
       -not $lines[1].StartsWith($fixtureHome+[IO.Path]::DirectorySeparatorChar)){
        throw 'Mock CLI escaped the synthetic home fixture'
    }
    if(-not $lines[1].Contains('.codex-74;') -or
        -not $lines[1].EndsWith('NO_API_KEY;NO_ACCESS_TOKEN;resume|--last')){
        throw ('Wrong secondary Codex environment: '+$lines[1])
    }
    if($env:CODEX_HOME -ne 'PREVIOUS_HOME' -or
        $env:CODEX_SQLITE_HOME -ne 'PREVIOUS_SQLITE' -or
        $env:OPENAI_API_KEY -ne 'DUMMY_SENTINEL_NOT_A_SECRET' -or
        $env:CODEX_ACCESS_TOKEN -ne 'DUMMY_SENTINEL_NOT_A_SECRET'){
        throw 'Codex launcher did not restore parent shell environment'
    }
    try {
        cdx-18 --synthetic-failure
        throw 'Expected synthetic command failure'
    } catch {
        if ($_.Exception.Message -ne 'SYNTHETIC_CODEX_FAILURE') { throw }
    }
    if($env:CODEX_HOME -ne 'PREVIOUS_HOME' -or
        $env:OPENAI_API_KEY -ne 'DUMMY_SENTINEL_NOT_A_SECRET'){
        throw 'Codex launcher did not restore environment after command failure'
    }
    foreach($name in @('CODEX_HOME','CODEX_SQLITE_HOME','OPENAI_API_KEY','CODEX_ACCESS_TOKEN')){
        Remove-Item -LiteralPath ('Env:'+$name) -ErrorAction SilentlyContinue
    }
    cdx-74 login status
    foreach($name in @('CODEX_HOME','CODEX_SQLITE_HOME','OPENAI_API_KEY','CODEX_ACCESS_TOKEN')){
        if($null -ne [Environment]::GetEnvironmentVariable($name,'Process')){
            throw ('Codex launcher did not restore absent environment variable: '+$name)
        }
    }
    foreach($account in @('18','74')){
        $config=Join-Path (Join-Path $HOME ('.codex-'+$account)) 'config.toml'
        if(-not (Test-Path -LiteralPath $config)){
            throw ('Expected isolated Codex config: '+$config)
        }
        $text=[System.IO.File]::ReadAllText($config)
        if(-not $text.Contains('forced_login_method = "chatgpt"')){
            throw ('Expected ChatGPT-only login config in '+$config)
        }
    }
    foreach($file in $realFiles){
        $after=if(Test-Path -LiteralPath $file){(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash}else{'absent'}
        if($after -cne $realFingerprints[$file]){throw 'Real user-home launcher/config changed during synthetic test'}
    }
    Write-Host 'Codex profiles: temporary home isolation, installation, idempotency, auth isolation, argument forwarding and parent env restoration PASS'
}
finally {
    Remove-Item Env:APEX_PROFILE_TEST_LOG -ErrorAction SilentlyContinue
    Remove-Item Env:CODEX_HOME -ErrorAction SilentlyContinue
    Remove-Item Env:CODEX_SQLITE_HOME -ErrorAction SilentlyContinue
    Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:CODEX_ACCESS_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Function:codex -ErrorAction SilentlyContinue
    Remove-Item Function:codex.cmd -ErrorAction SilentlyContinue
    Remove-Item Function:cdx-18 -ErrorAction SilentlyContinue
    Remove-Item Function:cdx-74 -ErrorAction SilentlyContinue
    Remove-Item Function:Invoke-ApexCodexProfile -ErrorAction SilentlyContinue
    Remove-Item Function:Join-Path -ErrorAction SilentlyContinue
    Remove-Item Env:APEX_PROFILE_TEST_HOME -ErrorAction SilentlyContinue
    $resolvedWork=[IO.Path]::GetFullPath($work)
    $resolvedTemp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
    if(-not $resolvedWork.StartsWith($resolvedTemp,[StringComparison]::OrdinalIgnoreCase) -or
       -not ([IO.Path]::GetFileName($resolvedWork)).StartsWith('apex-codex-profiles-')){
        throw 'Unsafe fixture cleanup path'
    }
    Remove-Item -LiteralPath $resolvedWork -Recurse -Force
}
