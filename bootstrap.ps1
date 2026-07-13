# bootstrap.ps1 — one-liner entry point for Windows.
#
# Invoke from anywhere (even a machine with nothing cloned):
#
#   irm https://raw.githubusercontent.com/Nan0pk/local-ai-relay/main/bootstrap.ps1 | iex
#
# Or save-and-run if pipe-to-iex is blocked:
#
#   curl.exe -fsSL https://raw.githubusercontent.com/Nan0pk/local-ai-relay/main/bootstrap.ps1 -o bootstrap.ps1
#   powershell -ExecutionPolicy Bypass -File bootstrap.ps1
#
# This script handles every state of ~/local-ai-relay:
#   - does not exist      → clone, then run setup
#   - exists, healthy     → pull, then run setup
#   - exists, broken      → wipe, clone, then run setup
#
# It never asks the user to manually git pull, Remove-Item, or git clone.
# It passes all args through to setup-windows.cmd.

[CmdletBinding()]
param(
  [switch]$Fresh,
  [string]$Repo = 'https://github.com/Nan0pk/local-ai-relay.git',
  [string]$Dir
)

$ErrorActionPreference = 'Stop'

if (-not $Dir) {
  $Dir = Join-Path $HOME 'local-ai-relay'
}

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }

# Decide what to do with the target directory.
$action = 'clone'
if (Test-Path $Dir) {
  $isGitRepo = Test-Path (Join-Path $Dir '.git')
  if ($Fresh) {
    Write-Step "--fresh requested: wiping $Dir"
    Remove-Item -Recurse -Force $Dir
    $action = 'clone'
  } elseif (-not $isGitRepo) {
    Write-Step "$Dir exists but is not a git repo — wiping and re-cloning"
    Remove-Item -Recurse -Force $Dir
    $action = 'clone'
  } else {
    # Try a pull. If it fails (diverged, conflicts, broken), wipe and re-clone.
    Write-Step "Pulling latest in $Dir"
    Push-Location $Dir
    try {
      git pull --ff-only 2>&1 | Out-Null
      if ($LASTEXITCODE -eq 0) {
        $action = 'setup'
        Write-Ok "pull succeeded"
      } else {
        Write-Warn "pull failed — wiping and re-cloning for a clean start"
        Pop-Location
        Remove-Item -Recurse -Force $Dir
        $action = 'clone'
      }
    } catch {
      Write-Warn "pull errored — wiping and re-cloning for a clean start"
      Pop-Location
      Remove-Item -Recurse -Force $Dir
      $action = 'clone'
    }
  }
}

if ($action -eq 'clone') {
  Write-Step "Cloning $Repo into $Dir"
  git clone $Repo $Dir
  if ($LASTEXITCODE -ne 0) {
    throw "git clone failed. Check your network and the repo URL: $Repo"
  }
}

Set-Location $Dir

# Make sure setup-windows.cmd exists; if not, pull once more (belt + suspenders).
if (-not (Test-Path 'setup-windows.cmd')) {
  Write-Step "setup-windows.cmd missing — pulling latest"
  git pull --ff-only 2>&1 | Out-Null
}

if (-not (Test-Path 'setup-windows.cmd')) {
  throw "setup-windows.cmd still missing after pull. The repo may be on a branch without it."
}

# Hand off to setup-windows.cmd, passing through all remaining args.
Write-Step "Running setup-windows.cmd"
$argsPassThrough = @()
if ($Fresh) { $argsPassThrough += '--fresh' }
# Collect extra bound parameters the user passed (except our own -Fresh/-Repo/-Dir)
foreach ($key in $PSBoundParameters.Keys) {
  if ($key -notin 'Fresh','Repo','Dir') {
    $argsPassThrough += "-$key"
  }
}
& .\setup-windows.cmd @argsPassThrough
exit $LASTEXITCODE
