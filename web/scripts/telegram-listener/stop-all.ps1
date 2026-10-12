<#
Stops the telegram-listener supervisor and all 3 instances it started.

Uses the PIDs recorded in supervisor.pids.json (written by supervisor.ps1) rather than
matching on process name -- python.exe might be used by other things on this machine, and we
only ever want to touch the processes we actually started.

The supervisor is stopped first, so it doesn't notice an instance disappearing (because we're
about to kill it on purpose) and try to resurrect it mid-shutdown. Each instance is then hard-
killed (Stop-Process -Force), which is safe here: listener.py saves state.json after every
single group it polls, so the worst case is re-polling the one group it was mid-poll on --
dedup on the Karvon side makes that harmless.

Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\stop-all.ps1
#>

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $Here 'supervisor.pids.json'

if (-not (Test-Path $PidFile)) {
    Write-Host "No $PidFile found -- nothing appears to be running via the supervisor (or it was already stopped)."
    Write-Host "If you started instances manually in their own terminals instead, close/Ctrl+C those terminals directly."
    exit 0
}

$entries = @(Get-Content $PidFile -Raw | ConvertFrom-Json)
if (-not $entries -or $entries.Count -eq 0) {
    Write-Host "PID file is empty -- nothing to stop."
    Remove-Item $PidFile -ErrorAction SilentlyContinue
    exit 0
}

# Supervisor first, then instances (see header comment for why).
$ordered = @($entries | Where-Object { $_.Name -eq 'supervisor' }) + @($entries | Where-Object { $_.Name -ne 'supervisor' })

foreach ($e in $ordered) {
    try {
        Get-Process -Id $e.Pid -ErrorAction Stop | Out-Null
        Stop-Process -Id $e.Pid -Force -ErrorAction Stop
        Write-Host "stopped $($e.Name) (PID $($e.Pid))"
    } catch {
        Write-Host "$($e.Name) (PID $($e.Pid)) was not running -- skipping"
    }
}

Remove-Item $PidFile -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "Done. state.json / state_2.json / state_3.json were last saved after each instance's most recent group poll, so restarting later (start-background.bat or supervisor.ps1) picks back up with nothing lost."
