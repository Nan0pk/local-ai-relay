# Authenticated Windows bootstrap for versioned local-ai-relay releases.
[CmdletBinding()]
param(
  [string]$Version,
  [string]$InstallRoot,
  [switch]$NoBrowser,
  [switch]$Rollback
)

$ErrorActionPreference = 'Stop'
$Repository = 'Nan0pk/local-ai-relay'

if (-not $InstallRoot) {
  if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA is required unless -InstallRoot is supplied.' }
  $InstallRoot = Join-Path $env:LOCALAPPDATA 'local-ai-relay'
}

function Set-Pointer([string]$Name, [string]$Value) {
  $path = Join-Path $InstallRoot $Name
  $temporary = "$path.tmp-$([Guid]::NewGuid().ToString('N'))"
  Set-Content -LiteralPath $temporary -Value $Value -NoNewline
  Move-Item -LiteralPath $temporary -Destination $path -Force
}

function Set-ManagedRuntime([string]$Version) {
  Set-Pointer 'managed-runtime' $Version
}

function Assert-AuthenticatedInstall([string]$ReleasePath, [string]$ExpectedVersion) {
  $markerPath = Join-Path $ReleasePath '.authenticated-install.json'
  if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
    throw "Release $ExpectedVersion is missing its authenticated install marker."
  }
  try {
    $marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
  } catch {
    throw "Release $ExpectedVersion has a malformed authenticated install marker."
  }
  if ($marker.version -ne $ExpectedVersion -or $marker.runtimeEntry -ne 'dist/index.js') {
    throw "Release $ExpectedVersion has a mismatched authenticated install marker."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $ReleasePath 'package.json') -PathType Leaf) -or -not (Test-Path -LiteralPath (Join-Path $ReleasePath 'dist/index.js') -PathType Leaf)) {
    throw "Release $ExpectedVersion is missing package.json or dist/index.js."
  }
}

function Start-ManagedRuntime([string]$ReleasePath, [string]$ExpectedVersion) {
  Assert-AuthenticatedInstall $ReleasePath $ExpectedVersion
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw 'npm.cmd is required to activate a managed Windows runtime.'
  }
  $oldInstallRoot = $env:RELAY_INSTALL_ROOT
  Push-Location $ReleasePath
  try {
    $env:RELAY_INSTALL_ROOT = $InstallRoot
    & npm.cmd run service:start:windows
    if ($LASTEXITCODE -ne 0) { throw "Managed runtime activation failed for $ReleasePath." }
  } finally {
    $env:RELAY_INSTALL_ROOT = $oldInstallRoot
    Pop-Location
  }
}

if ($Rollback) {
  if ($PSBoundParameters.ContainsKey('Version') -or $PSBoundParameters.ContainsKey('NoBrowser')) {
    throw '-Rollback cannot be combined with -Version or -NoBrowser.'
  }
  $currentPath = Join-Path $InstallRoot 'current-version'
  $previousPath = Join-Path $InstallRoot 'previous-version'
  if (-not (Test-Path -LiteralPath $currentPath) -or -not (Test-Path -LiteralPath $previousPath)) {
    throw 'Rollback requires both current-version and previous-version pointers.'
  }
  $current = (Get-Content -LiteralPath $currentPath -Raw).Trim()
  $previous = (Get-Content -LiteralPath $previousPath -Raw).Trim()
  $stableVersion = '^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$'
  if ($current -notmatch $stableVersion -or $previous -notmatch $stableVersion) {
    throw 'Rollback pointers must contain explicit stable vX.Y.Z versions.'
  }
  $versionsRoot = Join-Path $InstallRoot 'versions'
  $currentRelease = Join-Path $versionsRoot $current
  $previousRelease = Join-Path $versionsRoot $previous
  if (-not (Test-Path -LiteralPath $currentRelease -PathType Container)) {
    throw "Current rollback source '$current' is not installed."
  }
  if (-not (Test-Path -LiteralPath $previousRelease -PathType Container)) {
    throw "Rollback target '$previous' is not installed."
  }
  $managedPath = Join-Path $InstallRoot 'managed-runtime'
  $oldManaged = if (Test-Path -LiteralPath $managedPath) {
    (Get-Content -LiteralPath $managedPath -Raw).Trim()
  } else {
    $null
  }
  if ($oldManaged -and ($oldManaged -notmatch $stableVersion -or $oldManaged -ne $current)) {
    throw 'managed-runtime must match the current stable release before rollback.'
  }
  Assert-AuthenticatedInstall $currentRelease $current
  Assert-AuthenticatedInstall $previousRelease $previous
  try {
    if ($oldManaged) {
      Start-ManagedRuntime $previousRelease $previous
      Set-ManagedRuntime $previous
    }
    Set-Pointer 'previous-version' $current
    Set-Pointer 'current-version' $previous
  } catch {
    $rollbackError = $_
    $runtimeRecoveryError = $null
    try {
      if ($oldManaged) {
        Start-ManagedRuntime $currentRelease $current
      }
    } catch {
      $runtimeRecoveryError = $_
    }
    try {
      Set-Pointer 'previous-version' $previous
      Set-Pointer 'current-version' $current
      if ($oldManaged) { Set-ManagedRuntime $oldManaged }
    } catch {
      throw "Rollback failed and pointer recovery also failed: $($_.Exception.Message)"
    }
    if ($runtimeRecoveryError) {
      throw "Rollback failed and current runtime recovery also failed: $($runtimeRecoveryError.Exception.Message)"
    }
    throw $rollbackError
  }
  Write-Host "Rolled back from $current to $previous."
  exit 0
}

if (-not $Version -or $Version -notmatch '^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$') {
  throw '-Version must be an explicit stable vX.Y.Z tag.'
}
foreach ($command in 'gh', 'node') {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "Missing prerequisite: $command."
  }
}

$baseUrl = if ($env:RELAY_RELEASE_BASE_URL) {
  $env:RELAY_RELEASE_BASE_URL.TrimEnd('/','\')
} else {
  "https://github.com/$Repository/releases/download/$Version"
}
$artifactName = "local-ai-relay-$Version-windows-x64.zip"
$downloadRoot = Join-Path $InstallRoot ".staging\download-$([Guid]::NewGuid().ToString('N'))"
$extractRoot = Join-Path $downloadRoot 'extracted'
New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null

function Receive-ReleaseFile([string]$Name, [string]$Destination) {
  if ($env:RELAY_RELEASE_BASE_URL -and (Test-Path -LiteralPath $baseUrl -PathType Container)) {
    Copy-Item -LiteralPath (Join-Path $baseUrl $Name) -Destination $Destination
  } else {
    Invoke-WebRequest -Uri "$baseUrl/$Name" -OutFile $Destination -UseBasicParsing
  }
}

function Assert-Attestation([string]$Path) {
  & gh attestation verify $Path `
    --repo $Repository `
    --signer-workflow "$Repository/.github/workflows/release.yml" `
    --deny-self-hosted-runners
  if ($LASTEXITCODE -ne 0) { throw "GitHub attestation verification failed for $(Split-Path -Leaf $Path)." }
}

try {
  $manifest = Join-Path $downloadRoot 'release-manifest.json'
  $verifier = Join-Path $downloadRoot 'verify-release.mjs'
  $artifact = Join-Path $downloadRoot $artifactName
  Receive-ReleaseFile 'release-manifest.json' $manifest
  Receive-ReleaseFile 'verify-release.mjs' $verifier
  Receive-ReleaseFile $artifactName $artifact

  # Authenticate every executable input before parsing metadata or extracting code.
  Assert-Attestation $manifest
  Assert-Attestation $verifier
  Assert-Attestation $artifact

  & node $verifier --manifest $manifest --artifact $artifact --version $Version --platform windows-x64
  if ($LASTEXITCODE -ne 0) { throw 'Release checksum or manifest verification failed.' }

  Expand-Archive -LiteralPath $artifact -DestinationPath $extractRoot
  $setups = @(Get-ChildItem -LiteralPath $extractRoot -Filter 'setup-windows.ps1' -File -Recurse)
  if ($setups.Count -ne 1) { throw 'Verified artifact must contain exactly one setup-windows.ps1.' }

  $oldContext = $env:RELAY_VERIFIED_RELEASE_VERSION
  try {
    $env:RELAY_VERIFIED_RELEASE_VERSION = $Version
    & $setups[0].FullName -Version $Version -InstallRoot $InstallRoot -ReleaseRoot $setups[0].DirectoryName -NoBrowser:$NoBrowser
    if ($LASTEXITCODE -ne 0) { throw "setup-windows.ps1 exited with code $LASTEXITCODE." }
  } finally {
    $env:RELAY_VERIFIED_RELEASE_VERSION = $oldContext
  }
} finally {
  Remove-Item -LiteralPath $downloadRoot -Recurse -Force -ErrorAction SilentlyContinue
}
