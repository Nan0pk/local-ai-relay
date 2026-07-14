@echo off
REM setup-windows.cmd - batch wrapper that launches setup-windows.ps1 with
REM execution policy bypassed. Batch files are not subject to PowerShell's
REM execution policy, so this always works regardless of system settings.
REM
REM Usage:
REM   setup-windows.cmd               full setup, including ChatGPT probe
REM   setup-windows.cmd -NoBrowser    skip browser probe, service, Hermes
REM
REM Note: -Fresh -Yes (explicit wipe and re-clone) is handled by bootstrap.ps1 before
REM this script is invoked. Do NOT add rmdir logic here: a .cmd file cannot
REM delete the directory it is running from because Windows holds an
REM exclusive lock on it. bootstrap.ps1 handles the explicit fresh operation at the parent
REM directory level where the lock does not apply.

setlocal enabledelayedexpansion
cd /d "%~dp0"

REM If setup-windows.ps1 is missing (stale clone), pull it first.
if not exist "%~dp0setup-windows.ps1" (
  echo ==> setup-windows.ps1 missing; pulling latest from origin/main
  git pull --ff-only
  if errorlevel 1 (
    echo FAIL: could not pull setup-windows.ps1 from origin.
    echo        Run: git clone https://github.com/Nan0pk/local-ai-relay.git
    exit /b 1
  )
)

REM Launch PowerShell with execution policy bypassed for this process only.
REM -NoProfile avoids any user profile scripts that might interfere.
REM Use -File (not -Command) so positional args pass through cleanly to the
REM .ps1 script's param() block. The .ps1 is saved as UTF-8 with BOM so
REM Windows PowerShell reads it as UTF-8 regardless of system codepage.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1" %*
exit /b %errorlevel%
