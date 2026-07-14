# bootstrap.ps1 - one-liner entry point for Windows.
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
#   - does not exist      -> clone, then run setup
#   - exists, healthy     -> pull, then run setup
#   - exists, broken      -> preserve as a timestamped backup, then clone
#
# It never asks the user to manually git pull, Remove-Item, or git clone.
# It passes all args through to setup-windows.cmd.

[CmdletBinding()]
param(
  [switch]$Fresh,
  [switch]$Yes,
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

function Get-CanonicalRepository([string]$value) {
  return (($value -replace '^git@github\.com:', 'github.com/' -replace '^(https?://)?(www\.)?github\.com/', '' -replace '\.git/?$', '' -replace '/$', '').ToLowerInvariant())
}

$expectedRepository = if ($env:RELAY_EXPECTED_REPOSITORY) { $env:RELAY_EXPECTED_REPOSITORY } else { 'Nan0pk/local-ai-relay' }
if ((Get-CanonicalRepository $Repo) -ne (Get-CanonicalRepository $expectedRepository)) {
  throw "Repository '$Repo' does not match expected GitHub repository '$expectedRepository'."
}
if ($Fresh -and -not $Yes) {
  throw '--Fresh deletes the target directory and therefore also requires --Yes.'
}

function Move-ToBackup([string]$path) {
  $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
  $backup = "$path.backup-$stamp"
  $suffix = 1
  while (Test-Path $backup) { $backup = "$path.backup-$stamp-$suffix"; $suffix++ }
  Write-Step "Preserving existing directory as $backup"
  Move-Item -LiteralPath $path -Destination $backup
  Write-Ok 'local environment, diagnostics, logs, and patches preserved'
}

# Decide what to do with the target directory.
$action = 'clone'
if (Test-Path $Dir) {
  $isGitRepo = Test-Path (Join-Path $Dir '.git')
  if ($Fresh -and $Yes) {
    Write-Step "--Fresh --Yes requested: deleting $Dir"
    Remove-Item -Recurse -Force $Dir
    $action = 'clone'
  } elseif (-not $isGitRepo) {
    Write-Warn "$Dir exists but is not a Git repository"
    Move-ToBackup $Dir
    $action = 'clone'
  } else {
    $origin = (& git -C $Dir remote get-url origin 2>$null)
    if ($LASTEXITCODE -ne 0 -or (Get-CanonicalRepository $origin) -ne (Get-CanonicalRepository $expectedRepository)) {
      Write-Warn "$Dir has unexpected origin '$origin'; it will not be updated"
      Move-ToBackup $Dir
      $action = 'clone'
    } else {
      Write-Step "Pulling latest in $Dir"
      & git -C $Dir pull --ff-only 2>&1 | Out-Null
      if ($LASTEXITCODE -eq 0) {
        Write-Ok 'pull succeeded'
      } else {
        Write-Warn 'pull failed; preserving the current checkout and continuing without updating'
        Write-Warn 'This can mean offline access, local changes/commits, or a temporary Git failure.'
      }
      $action = 'setup'
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
  Write-Step "setup-windows.cmd missing - pulling latest"
  git pull --ff-only 2>&1 | Out-Null
}

if (-not (Test-Path 'setup-windows.cmd')) {
  throw "setup-windows.cmd still missing after pull. The repo may be on a branch without it."
}

# Hand off to setup-windows.cmd, passing through all remaining args.
Write-Step "Running setup-windows.cmd"
$argsPassThrough = @()
# Collect extra bound parameters the user passed (except our own -Fresh/-Repo/-Dir)
foreach ($key in $PSBoundParameters.Keys) {
  if ($key -notin 'Fresh','Yes','Repo','Dir') {
    $argsPassThrough += "-$key"
  }
}
& .\setup-windows.cmd @argsPassThrough
exit $LASTEXITCODE
