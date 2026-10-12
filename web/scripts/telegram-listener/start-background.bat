@echo off
rem Double-click this to start the telegram-listener supervisor (all 3 instances) running
rem silently in the background -- no visible window, keeps running after you close this.
rem
rem This is the simple, no-setup option: run it once after each reboot/login. For it to start
rem itself automatically on every login with no double-click at all, run install-autostart.ps1
rem once instead (see README.md).
rem
rem To stop everything later: double-click stop-all.bat, or run stop-all.ps1.

start "" /B "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0supervisor.ps1"
