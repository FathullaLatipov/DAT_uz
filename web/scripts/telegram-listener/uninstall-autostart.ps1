<#
Removes the Task Scheduler task created by install-autostart.ps1. Does not stop a currently
running supervisor/instances -- run stop-all.ps1 for that.

Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall-autostart.ps1
#>

$TaskName = 'KarvonTelegramListenerSupervisor'

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task '$TaskName'."
} else {
    Write-Host "Task '$TaskName' was not found -- nothing to remove."
}
