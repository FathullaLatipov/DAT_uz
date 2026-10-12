@echo off
rem Double-click this to stop the supervisor and all 3 telegram-listener instances it started.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-all.ps1"
pause
