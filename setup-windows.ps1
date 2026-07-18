# Runs only from an artifact already authenticated by bootstrap.ps1.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Version,
  [Parameter(Mandatory=$true)][string]$InstallRoot,
  [string]$ReleaseRoot,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ReleaseRoot) { $ReleaseRoot = $scriptRoot }
$resolvedScriptRoot = (Resolve-Path -LiteralPath $scriptRoot).Path
$resolvedReleaseRoot = (Resolve-Path -LiteralPath $ReleaseRoot).Path

if ($Version -notmatch '^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$') {
  throw '-Version must be an explicit stable vX.Y.Z tag.'
}
if ($env:RELAY_VERIFIED_RELEASE_VERSION -ne $Version) {
  throw 'Missing or mismatched verified release context; run bootstrap.ps1.'
}
if ($resolvedReleaseRoot -ne $resolvedScriptRoot) {
  throw 'ReleaseRoot must be the directory containing setup-windows.ps1.'
}
foreach ($command in 'node', 'npm.cmd') {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Missing prerequisite: $command." }
}
$nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 22) { throw "Node.js 22 or newer is required; found $(& node -v)." }

$versionsRoot = Join-Path $InstallRoot 'versions'
$transactionRoot = Join-Path $InstallRoot ".staging\install-$([Guid]::NewGuid().ToString('N'))"
$stagedRelease = Join-Path $transactionRoot 'release'
$targetRelease = Join-Path $versionsRoot $Version
New-Item -ItemType Directory -Path $versionsRoot, $transactionRoot -Force | Out-Null

function Invoke-Npm {
  param([Parameter(Mandatory=$true, ValueFromRemainingArguments=$true)][string[]]$Arguments)
  & npm.cmd @Arguments
  if ($LASTEXITCODE -ne 0) { throw "npm $($Arguments -join ' ') exited with code $LASTEXITCODE." }
}

function Set-Pointer([string]$Name, [string]$Value) {
  $path = Join-Path $InstallRoot $Name
  $temporary = "$path.tmp-$([Guid]::NewGuid().ToString('N'))"
  Set-Content -LiteralPath $temporary -Value $Value -NoNewline
  Move-Item -LiteralPath $temporary -Destination $path -Force
}

try {
  New-Item -ItemType Directory -Path $stagedRelease -Force | Out-Null
  Get-ChildItem -LiteralPath $resolvedReleaseRoot -Force |
    Copy-Item -Destination $stagedRelease -Recurse -Force
  Push-Location $stagedRelease
  try {
    Invoke-Npm ci
    Invoke-Npm run typecheck
    Invoke-Npm test
    Invoke-Npm run build
    Invoke-Npm run smoke:startup
  } finally {
    Pop-Location
  }

  if ($env:RELAY_TEST_INTERRUPT_BEFORE_ACTIVATE -eq '1') {
    throw 'Simulated interruption before activation.'
  }

  if (-not (Test-Path -LiteralPath $targetRelease)) {
    Move-Item -LiteralPath $stagedRelease -Destination $targetRelease
  }
  $currentPath = Join-Path $InstallRoot 'current-version'
  $oldCurrent = if (Test-Path -LiteralPath $currentPath) {
    (Get-Content -LiteralPath $currentPath -Raw).Trim()
  } else {
    $null
  }
  if ($oldCurrent -and $oldCurrent -ne $Version) {
    Set-Pointer 'previous-version' $oldCurrent
  }
  Set-Pointer 'current-version' $Version
} finally {
  Remove-Item -LiteralPath $transactionRoot -Recurse -Force -ErrorAction SilentlyContinue
}

if (-not $NoBrowser) {
  Push-Location $targetRelease
  try {
    Invoke-Npm run probe:chatgpt
    Invoke-Npm run service:start:windows
  } finally {
    Pop-Location
  }
}
Write-Host "Installed and activated local-ai-relay $Version at $targetRelease."
