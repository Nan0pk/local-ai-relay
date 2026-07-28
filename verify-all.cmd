@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo  local-ai-relay - complete verification
echo ============================================================
echo.

where node >nul 2>nul || (
  echo ERROR: Node.js 22 or newer is required.
  exit /b 1
)
where npm.cmd >nul 2>nul || (
  echo ERROR: npm is required.
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)"
if errorlevel 1 (
  echo ERROR: Node.js 22 or newer is required.
  exit /b 1
)

echo [1/2] Installing the lockfile and running deterministic verification.
call npm.cmd ci
if errorlevel 1 exit /b %errorlevel%
call npm.cmd run verify
if errorlevel 1 exit /b %errorlevel%

echo.
echo [2/2] Running every authenticated browser probe.
echo The only manual steps are provider-controlled sign-in, 2FA, or CAPTCHA.
echo.
call npm.cmd run probe:all
if errorlevel 1 exit /b %errorlevel%

echo.
echo PASS: deterministic and authenticated browser verification completed.
exit /b 0
