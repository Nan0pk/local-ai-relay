@echo off
REM setup-windows.cmd — batch wrapper that launches setup-windows.ps1 with
REM execution policy bypassed. Batch files are not subject to PowerShell's
REM execution policy, so this always works regardless of system settings.
REM
REM Usage:
REM   setup-windows.cmd               full setup, including ChatGPT probe
REM   setup-windows.cmd -NoBrowser    skip browser probe, service, Hermes
REM   setup-windows.cmd --fresh       wipe and re-clone before setup

setlocal enabledelayedexpansion
cd /d "%~dp0"

REM If --fresh, wipe and re-clone so a broken/stale clone never blocks setup.
if /i "%~1"=="--fresh" (
  echo ==> Wiping current directory and re-cloning from origin
  cd /d "%~dp0.."
  rmdir /s /q "%~dp0" 2>nul
  git clone https://github.com/Nan0pk/local-ai-relay.git "%~dp0"
  if errorlevel 1 (
    echo FAIL: git clone failed. Check your network and try again.
    exit /b 1
  )
  cd /d "%~dp0"
  shift
)

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
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1" %*
exit /b %errorlevel%
