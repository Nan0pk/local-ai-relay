import { open, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { selectPort } from '../startup/port-selection.js';

const root = process.cwd();
const stateDir = join(root, '.relay-browser');
const activePortPath = join(stateDir, 'active-port');
const pidPath = join(stateDir, 'windows-relay.pid');
const logPath = join(stateDir, 'windows-relay.log');

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
  const [pid, port] = await Promise.all([readInteger(pidPath), readInteger(activePortPath)]);
  if (!pid || !port || !(await isHealthy(port))) {
    await rm(pidPath, { force: true });
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    await rm(pidPath, { force: true });
    return;
  }
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && await isHealthy(port)) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await rm(pidPath, { force: true });
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
  await mkdir(stateDir, { recursive: true });
  await stopPreviousManagedRelay();

  const requested = loadConfig();
  const selected = await selectPort(requested.host, requested.port);
  if (selected.existingRelay) {
    await writeFile(activePortPath, `${selected.port}\n`);
    console.log(`PASS: existing relay is healthy at http://127.0.0.1:${selected.port}`);
    return;
  }

  const log = await open(logPath, 'a');
  const child = spawn(
    process.execPath,
    ['--env-file-if-exists=.env', 'dist/index.js'],
    {
      cwd: root,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', log.fd, log.fd],
      env: { ...process.env, HOST: requested.host, PORT: String(selected.port) },
    },
  );
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  child.unref();
  await log.close();

  if (!child.pid) throw new Error('Windows did not return a process id for the background relay.');
  await Promise.all([
    writeFile(pidPath, `${child.pid}\n`),
    writeFile(activePortPath, `${selected.port}\n`),
  ]);
  try {
    await waitForHealth(selected.port);
  } catch (error) {
    try { process.kill(child.pid, 'SIGTERM'); } catch { /* already exited */ }
    throw error;
  }
  console.log(`PASS: background relay is healthy at http://127.0.0.1:${selected.port}`);
  console.log(`Log: ${logPath}`);
}

main().catch((error: unknown) => {
  console.error(`WINDOWS SERVICE SETUP FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
