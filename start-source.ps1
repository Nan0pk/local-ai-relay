[CmdletBinding()]
param(
  [string]$Ref = $(if ($env:RELAY_SOURCE_REF) { $env:RELAY_SOURCE_REF } else { 'main' }),
  [string]$InstallRoot,
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$RepositoryUrl = if ($env:RELAY_SOURCE_REPOSITORY) {
  $env:RELAY_SOURCE_REPOSITORY
} else {
  'https://github.com/Nan0pk/local-ai-relay.git'
}
if (-not $InstallRoot) {
  if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA is required unless -InstallRoot is supplied.' }
  $InstallRoot = Join-Path $env:LOCALAPPDATA 'local-ai-relay'
}
$SourceRoot = Join-Path $InstallRoot 'source'

foreach ($command in 'git', 'node', 'npm.cmd') {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "Required command '$command' was not found. Install Git and Node.js 22+, then run this same command again."
  }
}

$NodeMajor = [int](& node -p 'Number(process.versions.node.split(".")[0])')
if ($LASTEXITCODE -ne 0 -or $NodeMajor -lt 22) {
  throw "Node.js 22 or newer is required; found $(& node --version)."
}

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
$NewCheckout = $false
if (-not (Test-Path -LiteralPath $SourceRoot)) {
  Write-Host 'Downloading Local AI Relay...'
  & git clone --filter=blob:none --no-checkout $RepositoryUrl $SourceRoot
  if ($LASTEXITCODE -ne 0) { throw 'Could not clone Local AI Relay.' }
  $NewCheckout = $true
} elseif (-not (Test-Path -LiteralPath (Join-Path $SourceRoot '.git') -PathType Container)) {
  throw "$SourceRoot already exists but is not a Local AI Relay source checkout. Move it aside or choose -InstallRoot."
}

$OriginUrl = (& git -C $SourceRoot remote get-url origin).Trim()
if ($LASTEXITCODE -ne 0 -or $OriginUrl -ne $RepositoryUrl) {
  throw "$SourceRoot points to '$OriginUrl', not the expected official repository '$RepositoryUrl'."
}
if (-not $NewCheckout -and (& git -C $SourceRoot status --porcelain)) {
  throw "$SourceRoot contains local changes. They were preserved; choose another -InstallRoot or clean that checkout yourself."
}

Write-Host "Updating from $Ref..."
& git -C $SourceRoot fetch --depth 1 origin $Ref
if ($LASTEXITCODE -ne 0) { throw "Could not fetch '$Ref' from the official repository." }
& git -C $SourceRoot checkout --detach --force FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw "Could not activate '$Ref'." }

$LockHash = (& git -C $SourceRoot hash-object package-lock.json).Trim()
$Stamp = Join-Path $SourceRoot 'node_modules\.local-ai-relay-lock'
$InstallDependencies = -not (Test-Path -LiteralPath $Stamp -PathType Leaf)
if (-not $InstallDependencies) {
  $InstallDependencies = (Get-Content -LiteralPath $Stamp -Raw).Trim() -ne $LockHash
}
if ($InstallDependencies) {
  Write-Host 'Installing verified npm dependencies...'
  Push-Location $SourceRoot
  try {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'npm dependency installation failed.' }
    Set-Content -LiteralPath $Stamp -Value $LockHash
  } finally {
    Pop-Location
  }
} else {
  Write-Host 'Dependencies are already current.'
}

Write-Host 'Creating the Local AI Relay application launcher...'
$OldInstallRoot = $env:RELAY_INSTALL_ROOT
$OldSourceRoot = $env:RELAY_SOURCE_ROOT
Push-Location $SourceRoot
try {
  $env:RELAY_INSTALL_ROOT = $InstallRoot
  $env:RELAY_SOURCE_ROOT = $SourceRoot
  & npm.cmd run launcher:install
  if ($LASTEXITCODE -ne 0) { throw 'Application launcher creation failed.' }

  Write-Host 'Opening the Local AI Relay Control Center...'
  if ($NoOpen) {
    & npm.cmd run dashboard -- --no-open --replace-running
  } else {
    & npm.cmd run dashboard -- --replace-running
  }
  if ($LASTEXITCODE -ne 0) { throw 'Control Center startup failed.' }
} finally {
  $env:RELAY_INSTALL_ROOT = $OldInstallRoot
  $env:RELAY_SOURCE_ROOT = $OldSourceRoot
  Pop-Location
}
