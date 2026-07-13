@echo off
REM verify-all.cmd - one command to verify every browser provider.
REM
REM   verify-all.cmd
REM
REM What it does:
REM   1. Installs deps + browser + tests + build + smoke (setup-windows -NoBrowser).
REM   2. For each of the 9 unverified providers (claude, gemini, deepseek, zai,
REM      minimax, kimi, qwen, grok, mistral):
REM        a. Opens the dedicated profile (login:<name>).
REM        b. Waits for the user to sign in normally and press a key.
REM        c. Runs the live probe (probe:<name>).
REM        d. Records PASS/FAIL with the conversation URL.
REM   3. Prints a final summary table.
REM
REM The user only runs: verify-all.cmd
REM Everything else is automated. Sign-in is the only manual step, and it's
REM a normal browser action the user would do anyway.

setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================================
echo  local-ai-relay - full verification (9 providers)
echo ============================================================
echo.

REM Stage 1: code verification (no browser).
echo [1/2] Running setup-windows.cmd -NoBrowser ...
call .\setup-windows.cmd -NoBrowser
if errorlevel 1 (
  echo.
  echo FAIL: setup stage failed. Fix the errors above before continuing.
  exit /b 1
)
echo.
echo [1/2] Code verification PASS.
echo.

REM Stage 2: per-provider login + probe.
set "PROVIDERS=claude gemini deepseek zai minimax kimi qwen grok mistral"
set /a TOTAL=0
set /a PASSED=0
set /a FAILED=0
set "RESULTS="

echo [2/2] Verifying 9 providers. A browser window will open for each.
echo       Sign in normally, then come back here and press any key.
echo.

for %%P in (%PROVIDERS%) do (
  set /a TOTAL+=1
  echo ------------------------------------------------------------
  echo  [!TOTAL!/9] Provider: %%P
  echo ------------------------------------------------------------
  echo Opening %%P login window ...
  call npm.cmd run login:%%P
  echo.
  echo Sign in to %%P in the browser window if you haven't already.
  echo When the %%P composer is visible, come back here and press any key.
  pause >nul
  echo.
  echo Running %%P probe ...
  call npm.cmd run probe:%%P
  if !errorlevel! equ 0 (
    set /a PASSED+=1
    set "RESULTS=!RESULTS!%%P PASS^|"
    echo.
    echo [%%P] PASS
  ) else (
    set /a FAILED+=1
    set "RESULTS=!RESULTS!%%P FAIL^|"
    echo.
    echo [%%P] FAIL - see error above. Continuing to next provider.
  )
  echo.
)

echo ============================================================
echo  SUMMARY
echo ============================================================
echo  Total:   %TOTAL%
echo  Passed:  %PASSED%
echo  Failed:  %FAILED%
echo.
echo  Per-provider:
echo  %RESULTS%
echo ============================================================
echo.
echo Paste the SUMMARY block above back to the assistant.
echo For any FAIL, also paste the error output for that provider.
exit /b %FAILED%
