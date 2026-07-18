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
if (Test-Path -LiteralPath $targetRelease) {
  throw "Version $Version is already installed; refusing to replace it."
}

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

$currentPath = Join-Path $InstallRoot 'current-version'
$previousPath = Join-Path $InstallRoot 'previous-version'
$oldCurrent = if (Test-Path -LiteralPath $currentPath) {
  (Get-Content -LiteralPath $currentPath -Raw).Trim()
} else {
  $null
}
$oldPrevious = if (Test-Path -LiteralPath $previousPath) {
  (Get-Content -LiteralPath $previousPath -Raw).Trim()
} else {
  $null
}
$stableVersion = '^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$'
if (($oldCurrent -and $oldCurrent -notmatch $stableVersion) -or ($oldPrevious -and $oldPrevious -notmatch $stableVersion)) {
  throw 'Install pointers must contain explicit stable vX.Y.Z versions.'
}
$oldRelease = if ($oldCurrent) { Join-Path $versionsRoot $oldCurrent } else { $null }
$targetCreated = $false
$activationAttempted = $false

try {
  New-Item -ItemType Directory -Path $versionsRoot, $transactionRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $stagedRelease -Force | Out-Null
  Get-ChildItem -LiteralPath $resolvedReleaseRoot -Force |
    Copy-Item -Destination $stagedRelease -Recurse -Force

  $configRoot = Join-Path $InstallRoot 'config'
  $persistentEnv = Join-Path $configRoot '.env'
  New-Item -ItemType Directory -Path $configRoot -Force | Out-Null
  if (-not (Test-Path -LiteralPath $persistentEnv)) {
    $exampleEnv = Join-Path $resolvedReleaseRoot '.env.example'
    if (-not (Test-Path -LiteralPath $exampleEnv -PathType Leaf)) {
      throw 'Verified release is missing .env.example.'
    }
    Copy-Item -LiteralPath $exampleEnv -Destination $persistentEnv
  }
  $stagedEnv = Join-Path $stagedRelease '.env'
  if (Test-Path -LiteralPath $stagedEnv) {
    throw 'Verified release must not contain a preconfigured .env file.'
  }
  Copy-Item -LiteralPath $persistentEnv -Destination $stagedEnv

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

  Move-Item -LiteralPath $stagedRelease -Destination $targetRelease
  $targetCreated = $true
  if (-not $NoBrowser) {
    $activationAttempted = $true
    Push-Location $targetRelease
    try {
      Invoke-Npm run probe:chatgpt
      Invoke-Npm run service:start:windows
    } finally {
      Pop-Location
    }
  }
  if ($oldCurrent -and $oldCurrent -ne $Version) {
    Set-Pointer 'previous-version' $oldCurrent
  }
  Set-Pointer 'current-version' $Version
} catch {
  $installError = $_
  try {
    if ($activationAttempted -and $oldRelease -and (Test-Path -LiteralPath (Join-Path $oldRelease 'package.json') -PathType Leaf)) {
      Push-Location $oldRelease
      try { Invoke-Npm run service:start:windows } finally { Pop-Location }
    }
    if ($oldPrevious) {
      Set-Pointer 'previous-version' $oldPrevious
    } elseif (Test-Path -LiteralPath $previousPath) {
      Remove-Item -LiteralPath $previousPath -Force
    }
    if ($oldCurrent) {
      Set-Pointer 'current-version' $oldCurrent
    } elseif (Test-Path -LiteralPath $currentPath) {
      Remove-Item -LiteralPath $currentPath -Force
    }
  } catch {
    throw "Install failed and current runtime recovery also failed: $($_.Exception.Message)"
  } finally {
    if ($targetCreated) {
      Remove-Item -LiteralPath $targetRelease -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
  throw $installError
} finally {
  Remove-Item -LiteralPath $transactionRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Installed and activated local-ai-relay $Version at $targetRelease."
