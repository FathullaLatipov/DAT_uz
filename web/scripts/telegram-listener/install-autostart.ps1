<#
One-time, opt-in setup: registers a Windows Task Scheduler task that starts the
telegram-listener supervisor (all 3 instances) automatically at logon, so it's running again
after a reboot/login with zero manual steps -- not even double-clicking start-background.bat.

Run this ONCE, as the Windows user who normally logs in day-to-day. No admin rights are
required (it's a per-user logon task, not a SYSTEM service).

Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install-autostart.ps1

To remove it later:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall-autostart.ps1

Note: this does NOT help with a brand-new Telegram account's first run, which needs an
interactive phone-number/login-code prompt in a visible terminal -- see README.md,
"First-time setup of a new account". Only add an instance to the supervisor (and to this
autostart task, implicitly, since it just runs supervisor.ps1) after that one-time manual
login has already created its .session file.
#>

$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$TaskName = 'KarvonTelegramListenerSupervisor'
$SupervisorPath = Join-Path $Here 'supervisor.ps1'

if (-not (Test-Path $SupervisorPath)) {
    throw "supervisor.ps1 not found next to this script ($Here) -- aborting."
}

$pwsh = (Get-Command powershell.exe).Source
$action = New-ScheduledTaskAction -Execute $pwsh `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$SupervisorPath`"" `
    -WorkingDirectory $Here
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Write-Host "Task '$TaskName' already exists -- replacing it with this configuration."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
    -Description 'Starts the Karvon telegram-listener supervisor (3 instances) at user logon. See web/scripts/telegram-listener/README.md.' | Out-Null

Write-Host "Installed scheduled task '$TaskName'."
Write-Host "It will start the supervisor automatically next time you log in to Windows."
Write-Host ""
Write-Host "To start it right now without logging out/in:"
Write-Host "    Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "To check it's running:  Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo"
Write-Host "To remove it later:     .\uninstall-autostart.ps1"
