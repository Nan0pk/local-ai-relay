# setup-windows.ps1 - Windows equivalent of setup-linux.sh
#
# Self-elevates its own execution policy so the user does not have to run
# Set-ExecutionPolicy manually. Uses `npm.cmd` (batch file, not subject to
# PowerShell execution policy) for all npm invocations so the bypass is not
# even strictly required at the shell level.
#
# Usage:
#   .\setup-windows.ps1               # full setup, including ChatGPT probe
#   .\setup-windows.ps1 -NoBrowser    # skip browser probe, service, Hermes
#
# The relay never asks for passwords, cookies, session tokens, API keys, or
# GitHub tokens. Login is a normal visible browser action.

[CmdletBinding()]
param(
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

# Self-update: pull latest before doing anything else so a stale clone can
# never block setup. Non-fatal if offline, diverged, or not a git repo.
# This is what makes `.\setup-windows.ps1` work even on a clone from before
# this script existed - as long as the script is present, it pulls the rest.
try {
  Write-Host "==> Pulling latest from origin/main"
  git pull --ff-only 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "    (pull skipped - offline, diverged, or no upstream; continuing with current tree)"
  }
} catch {
  Write-Host "    (pull skipped - git not available or not a git repo; continuing with current tree)"
}

# Self-bypass execution policy for THIS process only. No admin, no permanent
# change, no GPO conflict. Safe to run repeatedly.
try {
  $current = Get-ExecutionPolicy -Scope Process
  if ($current -ne 'Bypass') {
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force -ErrorAction SilentlyContinue
  }
} catch {
  # If even Process-scope bypass is blocked, fall through to npm.cmd which
  # is a batch file and not subject to PowerShell execution policy at all.
}

function Invoke-Npm {
  param([Parameter(Mandatory=$true, ValueFromRemainingArguments=$true)][string[]]$NpmArgs)
  # Prefer npm.cmd (batch file, no execution-policy restriction) over npm.ps1.
  $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($npmCmd) {
    & npm.cmd @NpmArgs
  } else {
    # Fall back to npm (PowerShell will pick .ps1 if policy allows, else .cmd).
    & npm @NpmArgs
  }
  if ($LASTEXITCODE -ne 0) {
    throw "npm $($NpmArgs -join ' ') exited with code $LASTEXITCODE"
  }
}

function Section($msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

Section 'Checking prerequisites'
foreach ($cmd in 'node','npm','git') {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "Missing prerequisite: $cmd. Install Node.js 22+ and Git first."
  }
}
$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]"))
if ($nodeMajor -lt 22) {
  throw "Node.js 22 or newer is required; found $(node -v)."
}
Write-Host "Node: $(node -v)"
Write-Host "npm:  $(npm.cmd -v 2>$null)"
Write-Host "git:  $(git --version)"

Section 'Installing project dependencies'
Invoke-Npm install

Section 'Creating local .env from .env.example (if missing)'
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "Created .env"
} else {
  Write-Host "Keeping existing .env"
}

Section 'Type-check'
Invoke-Npm run typecheck

Section 'Unit tests'
Invoke-Npm test

Section 'Build'
Invoke-Npm run build

Section 'Occupied-port startup smoke'
Invoke-Npm run smoke:startup

if ($NoBrowser) {
  Write-Host ""
  Write-Host "SIMULATION COMPLETE (browser, service, and Hermes stages intentionally skipped)" -ForegroundColor Green
  exit 0
}

Section 'ChatGPT browser authentication and live probe'
Write-Host 'A visible installed Chrome/Chromium window will open with the dedicated relay profile.'
Write-Host 'Sign in to https://chatgpt.com normally. The probe continues automatically'
Write-Host 'when the composer is available. Never paste cookies or tokens into the relay.'
Invoke-Npm run probe:chatgpt

Section 'Starting background relay'
Invoke-Npm run service:start:windows

Section 'Configuring Hermes (if installed)'
$hermes = Get-Command hermes -ErrorAction SilentlyContinue
if ($hermes) {
  Invoke-Npm run hermes:configure
} else {
  Write-Host 'Hermes was not found; skipping Hermes configuration.'
  Write-Host 'Install Hermes later, then run: npm.cmd run hermes:configure'
}

Write-Host ""
Write-Host "SETUP COMPLETE" -ForegroundColor Green
Write-Host "Relay default model: browser-chatgpt-free"
Write-Host "Verify other providers with: npm.cmd run login:<provider> ; npm.cmd run probe:<provider>"
Write-Host "Known providers: chatgpt, claude, gemini, deepseek, zai, minimax, kimi, qwen, grok, mistral, meta"
