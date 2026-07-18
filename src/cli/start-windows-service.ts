import { open, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { loadConfig } from '../config.js';
import { selectPort } from '../startup/port-selection.js';

const root = resolve(process.cwd());
const installRoot = process.env.RELAY_INSTALL_ROOT;
export function windowsStateDirectory(releaseRoot: string, managedInstallRoot?: string): string {
  return managedInstallRoot
    ? join(resolve(managedInstallRoot), 'runtime')
    : join(resolve(releaseRoot), '.relay-browser');
}

export function windowsConfigPath(managedInstallRoot: string): string {
  return join(resolve(managedInstallRoot), 'config', '.env');
}

const stateDir = windowsStateDirectory(root, installRoot);
const activePortPath = join(stateDir, 'active-port');
const pidPath = join(stateDir, 'windows-relay.pid');
const logPath = join(stateDir, 'windows-relay.log');
const activeReleasePath = join(stateDir, 'active-release.json');

type ReleaseIdentity = { version: string; root: string };
type ActiveReleaseIdentity = ReleaseIdentity & { processIdentity: string };

export async function authenticatedIdentity(
  releaseRoot = root,
  managedInstallRoot = installRoot,
): Promise<ReleaseIdentity> {
  let marker: unknown;
  try {
    marker = JSON.parse((await readFile(join(releaseRoot, '.authenticated-install.json'), 'utf8')).trim());
  } catch {
    throw new Error(`Missing or malformed authenticated install marker: ${join(releaseRoot, '.authenticated-install.json')}`);
  }
  const value = marker as { version?: unknown; runtimeEntry?: unknown };
  if (typeof value.version !== 'string' ||
      !/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(value.version) ||
      value.runtimeEntry !== 'dist/index.js') {
    throw new Error('Authenticated install marker does not match a supported Windows runtime.');
  }
  if (!managedInstallRoot ||
      resolve(releaseRoot) !== join(resolve(managedInstallRoot), 'versions', value.version)) {
    throw new Error('Authenticated release path is outside RELAY_INSTALL_ROOT or mismatches its version.');
  }
  await Promise.all([
    readFile(join(releaseRoot, 'package.json')),
    readFile(join(releaseRoot, 'dist', 'index.js')),
  ]);
  return { version: value.version, root: resolve(releaseRoot) };
}

async function activeIdentity(): Promise<ActiveReleaseIdentity | undefined> {
  try {
    const value = JSON.parse(await readFile(activeReleasePath, 'utf8')) as Partial<ActiveReleaseIdentity>;
    if (typeof value.version !== 'string' ||
        typeof value.root !== 'string' ||
        typeof value.processIdentity !== 'string') return undefined;
    const authenticated = await authenticatedIdentity(resolve(value.root));
    return authenticated.version === value.version
      ? { ...authenticated, processIdentity: value.processIdentity }
      : undefined;
  } catch {
    return undefined;
  }
}

async function clearManagedState(): Promise<void> {
  await Promise.all([
    rm(pidPath, { force: true }),
    rm(activePortPath, { force: true }),
    rm(activeReleasePath, { force: true }),
  ]);
}

type ProcessControl = {
  kill(pid: number): void;
  alive(pid: number): boolean;
  identity(pid: number): Promise<string | undefined>;
  wait(milliseconds: number): Promise<void>;
};

const execFileAsync = promisify(execFile);

async function windowsProcessIdentity(pid: number): Promise<string | undefined> {
  const command = [
    `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}";`,
    'if ($p) { [pscustomobject]@{',
    'CreationDate=$p.CreationDate; ExecutablePath=$p.ExecutablePath; CommandLine=$p.CommandLine',
    '} | ConvertTo-Json -Compress }',
  ].join(' ');
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command,
  ], { windowsHide: true });
  const value = stdout.trim();
  return value || undefined;
}

const processControl: ProcessControl = {
  kill(pid) {
    process.kill(pid, 'SIGTERM');
  },
  alive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
      throw error;
    }
  },
  identity: windowsProcessIdentity,
  wait(milliseconds) {
    return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
  },
};

export async function terminateRecordedProcess(
  pid: number,
  version: string,
  expectedIdentity: string,
  control: ProcessControl = processControl,
): Promise<void> {
  if (!control.alive(pid)) return;
  const actualIdentity = await control.identity(pid);
  if (!actualIdentity) {
    if (!control.alive(pid)) return;
    throw new Error(`Unable to verify recorded process identity for ${version}.`);
  }
  if (actualIdentity !== expectedIdentity) {
    throw new Error(`Recorded PID ${pid} no longer belongs to managed relay ${version}; refusing to terminate it.`);
  }
  try {
    control.kill(pid);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
    throw new Error(`Unable to stop previous managed relay ${version}.`, { cause: error });
  }
  const deadline = Date.now() + 5_000;
  while (control.alive(pid) && Date.now() < deadline) {
    await control.wait(100);
  }
  if (control.alive(pid)) throw new Error(`Previous managed relay ${version} did not stop.`);
}

async function readInteger(path: string): Promise<number | undefined> {
  try {
    const value = Number.parseInt((await readFile(path, 'utf8')).trim(), 10);
    return Number.isInteger(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

async function isHealthy(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(750),
    });
    const body = await response.json() as { service?: string };
    return body.service === 'local-ai-relay';
  } catch {
    return false;
  }
}

async function stopPreviousManagedRelay(): Promise<void> {
  const [pid, port, identity] = await Promise.all([
    readInteger(pidPath),
    readInteger(activePortPath),
    activeIdentity(),
  ]);
  if (!pid && !port && !identity) return;
  if (!pid || !port || !identity) {
    throw new Error('Managed runtime state is incomplete; refusing to stop an unverified process.');
  }
  await terminateRecordedProcess(pid, identity.version, identity.processIdentity);
  await clearManagedState();
}

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await isHealthy(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Background relay did not become healthy. Inspect ${logPath}`);
}

async function main(): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('This background launcher is for Windows only. Linux uses the systemd user service.');
  }
  if (!installRoot) {
    throw new Error('RELAY_INSTALL_ROOT is required for the authenticated Windows service.');
  }
  const cliArgs = process.argv.slice(2);
  if (cliArgs.some((argument) => argument !== '--stop')) {
    throw new Error('Usage: start-windows-service.ts [--stop]');
  }
  const stopOnly = cliArgs.includes('--stop');
  const targetIdentity = await authenticatedIdentity();
  await mkdir(stateDir, { recursive: true });
  await stopPreviousManagedRelay();
  if (stopOnly) {
    console.log(`PASS: managed Windows relay stopped by authenticated release ${targetIdentity.version}`);
    return;
  }

  const configPath = windowsConfigPath(installRoot);
  process.loadEnvFile(configPath);
  const requested = loadConfig();
  const selected = await selectPort(requested.host, requested.port);
  if (selected.existingRelay) {
    throw new Error(`Port ${selected.port} is occupied by a relay that is not the authenticated target ${targetIdentity.version}.`);
  }

  const log = await open(logPath, 'a');
  const child = spawn(process.execPath, [`--env-file-if-exists=${configPath}`, 'dist/index.js'], {
    cwd: root,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log.fd, log.fd],
    env: { ...process.env, HOST: requested.host, PORT: String(selected.port) },
  });
  try {
    await new Promise<void>((resolveSpawn, rejectSpawn) => {
      child.once('spawn', resolveSpawn);
      child.once('error', rejectSpawn);
    });
    child.unref();
    await log.close();
    if (!child.pid) throw new Error('Windows did not return a process id for the background relay.');
    const childProcessIdentity = await windowsProcessIdentity(child.pid);
    if (!childProcessIdentity) throw new Error('Could not record the background relay process identity.');
    await writeFile(pidPath, `${child.pid}\n`);
    await writeFile(activePortPath, `${selected.port}\n`);
    await writeFile(activeReleasePath, `${JSON.stringify({
      ...targetIdentity,
      processIdentity: childProcessIdentity,
    })}\n`);
    await waitForHealth(selected.port);
  } catch (error) {
    if (child.pid) {
      try { child.kill('SIGTERM'); } catch { /* already exited */ }
    }
    try { await log.close(); } catch { /* already closed */ }
    await clearManagedState();
    throw error;
  }
  console.log(`PASS: background relay is healthy at http://127.0.0.1:${selected.port}`);
  console.log(`Log: ${logPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(`WINDOWS SERVICE SETUP FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
