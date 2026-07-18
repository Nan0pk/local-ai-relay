@echo off
setlocal
REM Safe wrapper only: setup-windows.ps1 never downloads or self-updates.
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1" %*
exit /b %errorlevel%
