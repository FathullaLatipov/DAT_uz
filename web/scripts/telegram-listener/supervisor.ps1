<#
Supervisor for the 3 telegram-listener instances (A -> .env, B -> .env.2, C -> .env.3).

Launches each instance as `.venv\Scripts\python.exe listener.py` with its own ENV_FILE,
watches them, and relaunches any instance that exits unexpectedly after a short backoff
(default 30s) so a crash doesn't turn into a crash-restart-crash loop hammering Telegram.

listener.py already does its own file logging per instance (listener.log / listener_2.log /
listener_3.log) and saves state.json after every single group it polls, so a hard kill of an
instance loses at most the group it was mid-poll on -- nothing is corrupted. This supervisor's
own stdout/stderr redirection (crash-logs\<name>.std{out,err}.log) is purely a safety net for
an uncaught Python-level crash/traceback that happens before listener.py's own logging is set
up (or a crash so fundamental logging itself never ran).

Usage:
    .\.venv\Scripts\python.exe --version   # sanity check the venv exists, if unsure
    powershell -NoProfile -ExecutionPolicy Bypass -File .\supervisor.ps1

Normally you don't run this directly -- use start-background.bat (double-click, default) or
install-autostart.ps1 (opt-in Task Scheduler) instead. See README.md.

Stop everything with .\stop-all.ps1 -- don't just close this window; stop-all.ps1 stops the
supervisor first (so it doesn't try to resurrect an instance you're deliberately stopping),
then each instance, by the PIDs recorded in supervisor.pids.json.
#>

$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Here

$Python = Join-Path $Here '.venv\Scripts\python.exe'
if (-not (Test-Path $Python)) {
    throw "Python venv not found at $Python -- set it up first (see README.md: python -m venv .venv; pip install -r requirements.txt)."
}

$CrashLogDir = Join-Path $Here 'crash-logs'
New-Item -ItemType Directory -Force -Path $CrashLogDir | Out-Null

$PidFile = Join-Path $Here 'supervisor.pids.json'
$SupervisorLog = Join-Path $Here 'supervisor.log'

# Each instance needs its own account/session/state file -- that's all driven by ENV_FILE
# (see README.md "Running more than one account at once"). Add a 4th here (with a matching
# .env.4 and updated SHARD=i/4 in every .env* file) if you ever add another account.
$Instances = @(
    [pscustomobject]@{ Name = 'A'; EnvFile = '.env' },
    [pscustomobject]@{ Name = 'B'; EnvFile = '.env.2' },
    [pscustomobject]@{ Name = 'C'; EnvFile = '.env.3' }
)

$RestartBackoffSeconds = 30
$CheckIntervalSeconds = 10
$StartupStaggerSeconds = 3   # don't start all 3 Telethon clients in the same instant

function Write-SupervisorLog {
    param([string]$Message)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [supervisor] $Message"
    try { Write-Host $line } catch {}
    Add-Content -Path $SupervisorLog -Value $line -ErrorAction SilentlyContinue
}

function Start-Instance {
    param($Instance)
    $env:ENV_FILE = $Instance.EnvFile
    $stdout = Join-Path $CrashLogDir "$($Instance.Name).stdout.log"
    $stderr = Join-Path $CrashLogDir "$($Instance.Name).stderr.log"
    $proc = Start-Process -FilePath $Python -ArgumentList 'listener.py' `
        -WorkingDirectory $Here -NoNewWindow -PassThru `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    # Touch .Handle now: a documented .NET Process quirk means .ExitCode reads back empty later
    # unless a handle with query rights was cached while the process was still alive.
    $null = $proc.Handle
    Write-SupervisorLog "started instance $($Instance.Name) (ENV_FILE=$($Instance.EnvFile)) as PID $($proc.Id)"
    return $proc
}

function Save-PidFile {
    $rows = @()
    foreach ($name in $Tracked.Keys) {
        $t = $Tracked[$name]
        if ($t.Process -and -not $t.Process.HasExited) {
            $rows += [pscustomobject]@{ Name = $name; EnvFile = $t.Instance.EnvFile; Pid = $t.Process.Id }
        }
    }
    $rows += [pscustomobject]@{ Name = 'supervisor'; EnvFile = $null; Pid = $PID }
    $rows | ConvertTo-Json | Set-Content -Path $PidFile
}

$Tracked = @{}
foreach ($inst in $Instances) {
    $Tracked[$inst.Name] = @{ Instance = $inst; Process = (Start-Instance $inst); LastStart = Get-Date; RestartAt = $null }
    Start-Sleep -Seconds $StartupStaggerSeconds
}

Write-SupervisorLog "supervisor started (PID $PID), watching $($Instances.Count) instance(s); restart backoff=${RestartBackoffSeconds}s"
Save-PidFile

try {
    while ($true) {
        Start-Sleep -Seconds $CheckIntervalSeconds
        $changed = $false
        foreach ($name in @($Tracked.Keys)) {
            $t = $Tracked[$name]

            if ($t.Process -and $t.Process.HasExited -and -not $t.RestartAt) {
                $exitCode = $t.Process.ExitCode
                $ranFor = [int]((Get-Date) - $t.LastStart).TotalSeconds
                Write-SupervisorLog "instance $name (PID $($t.Process.Id)) exited (code=$exitCode) after ${ranFor}s -- restarting in ${RestartBackoffSeconds}s"
                $t.RestartAt = (Get-Date).AddSeconds($RestartBackoffSeconds)
                $Tracked[$name] = $t
                $changed = $true
            }
            elseif ($t.RestartAt -and (Get-Date) -ge $t.RestartAt) {
                $newProc = Start-Instance $t.Instance
                $Tracked[$name] = @{ Instance = $t.Instance; Process = $newProc; LastStart = Get-Date; RestartAt = $null }
                $changed = $true
            }
        }
        if ($changed) { Save-PidFile }
    }
}
finally {
    Write-SupervisorLog "supervisor loop exiting"
}
