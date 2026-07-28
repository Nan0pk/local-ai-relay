import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function assertSafePath(path: string): void {
  if (!path || /[\0\r\n]/.test(path)) throw new Error('Install root contains unsupported characters.');
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function desktopQuote(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('`', '\\`').replaceAll('$', '\\$')}"`;
}

export function linuxLauncherScript(installRoot: string): string {
  assertSafePath(installRoot);
  return `#!/usr/bin/env bash
set -Eeuo pipefail
install_root=${shellQuote(installRoot)}
version="$(tr -d '\\r\\n' <"$install_root/current")"
[[ "$version" =~ ^v(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$ ]] || {
  echo 'Local AI Relay install pointer is missing or invalid.' >&2
  exit 1
}
cd "$install_root/versions/$version"
exec npm run dashboard
`;
}

export function linuxSourceLauncherScript(sourceRoot: string): string {
  assertSafePath(sourceRoot);
  return `#!/usr/bin/env bash
set -Eeuo pipefail
cd ${shellQuote(sourceRoot)}
exec npm run dashboard
`;
}

export function windowsLauncherScript(installRoot: string): string {
  assertSafePath(installRoot);
  const literal = installRoot.replaceAll("'", "''");
  return `$ErrorActionPreference = 'Stop'
$InstallRoot = '${literal}'
$Version = (Get-Content -LiteralPath (Join-Path $InstallRoot 'current-version') -Raw).Trim()
if ($Version -notmatch '^v(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)$') {
  throw 'Local AI Relay install pointer is missing or invalid.'
}
Push-Location (Join-Path (Join-Path $InstallRoot 'versions') $Version)
try {
  & npm.cmd run dashboard
  if ($LASTEXITCODE -ne 0) { throw "Dashboard launcher exited with code $LASTEXITCODE." }
} finally {
  Pop-Location
}
`;
}

export function windowsSourceLauncherScript(sourceRoot: string): string {
  assertSafePath(sourceRoot);
  const literal = sourceRoot.replaceAll("'", "''");
  return `$ErrorActionPreference = 'Stop'
Push-Location '${literal}'
try {
  & npm.cmd run dashboard
  if ($LASTEXITCODE -ne 0) { throw "Dashboard launcher exited with code $LASTEXITCODE." }
} finally {
  Pop-Location
}
`;
}

async function installLinux(installRoot: string, sourceRoot?: string): Promise<string[]> {
  const launcher = join(installRoot, 'local-ai-relay-dashboard');
  const desktop = join(homedir(), '.local', 'share', 'applications', 'local-ai-relay.desktop');
  await mkdir(dirname(launcher), { recursive: true });
  await writeFile(
    launcher,
    sourceRoot ? linuxSourceLauncherScript(sourceRoot) : linuxLauncherScript(installRoot),
    { mode: 0o700 },
  );
  await chmod(launcher, 0o700);
  await mkdir(dirname(desktop), { recursive: true });
  await writeFile(desktop, `[Desktop Entry]
Type=Application
Name=Local AI Relay
Comment=Open the local provider and harness Control Center
Exec=${desktopQuote(launcher)}
Terminal=false
Categories=Development;Utility;
`, { mode: 0o600 });
  return [launcher, desktop];
}

async function createWindowsShortcut(
  launcher: string,
  shortcutPath: string,
): Promise<void> {
  const command = [
    '$w=New-Object -ComObject WScript.Shell;',
    '$s=$w.CreateShortcut($args[1]);',
    '$s.TargetPath="powershell.exe";',
    '$s.Arguments=("-NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $args[0]);',
    '$s.WorkingDirectory=(Split-Path -Parent $args[0]);',
    '$s.Description="Open Local AI Relay Control Center";',
    '$s.Save();',
  ].join('');
  await mkdir(dirname(shortcutPath), { recursive: true });
  await execFileAsync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    command,
    launcher,
    shortcutPath,
  ], { windowsHide: true });
}

async function installWindows(installRoot: string, sourceRoot?: string): Promise<string[]> {
  const launcher = join(installRoot, 'Local AI Relay.ps1');
  await mkdir(dirname(launcher), { recursive: true });
  await writeFile(
    launcher,
    sourceRoot ? windowsSourceLauncherScript(sourceRoot) : windowsLauncherScript(installRoot),
  );
  const startMenu = join(
    process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Local AI Relay.lnk',
  );
  const desktop = join(process.env.USERPROFILE ?? homedir(), 'Desktop', 'Local AI Relay.lnk');
  await createWindowsShortcut(launcher, startMenu);
  await createWindowsShortcut(launcher, desktop);
  return [launcher, startMenu, desktop];
}

async function main(): Promise<void> {
  const installRoot = process.env.RELAY_INSTALL_ROOT;
  if (!installRoot) throw new Error('RELAY_INSTALL_ROOT is required.');
  const sourceRoot = process.env.RELAY_SOURCE_ROOT;
  const installed = process.platform === 'linux'
    ? await installLinux(installRoot, sourceRoot)
    : process.platform === 'win32'
      ? await installWindows(installRoot, sourceRoot)
      : (() => { throw new Error('Launcher installation currently supports Linux and Windows.'); })();
  console.log(`Installed Local AI Relay launcher:\n${installed.join('\n')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(`LAUNCHER SETUP FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
