import { execFile, spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTokenPath } from '../auth/token.js';
import { resolveRelayPort } from '../startup/relay-location.js';

async function relayIsHealthy(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(800),
    });
    const body = await response.json() as { service?: string };
    return response.ok && body.service === 'local-ai-relay';
  } catch {
    return false;
  }
}

function startRelay(): void {
  const root = process.cwd();
  const args = ['--import', 'tsx', join(root, 'src', 'index.ts')];
  const logPath = join(homedir(), '.local-ai-relay', 'relay.log');
  mkdirSync(dirname(logPath), { recursive: true, mode: 0o700 });
  const log = openSync(logPath, 'a', 0o600);
  const child = spawn(process.execPath, args, {
    cwd: root,
    detached: true,
    stdio: ['ignore', log, log],
  });
  child.unref();
  closeSync(log);
}

async function waitForRelay(): Promise<number> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const port = await resolveRelayPort();
    if (await relayIsHealthy(port)) return port;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `The relay did not become healthy. Review ${join(homedir(), '.local-ai-relay', 'relay.log')}.`,
  );
}

function openUrl(url: string): void {
  if (process.platform === 'win32') {
    execFile('cmd.exe', ['/d', '/s', '/c', 'start', '""', url], () => {});
  } else if (process.platform === 'darwin') {
    execFile('open', [url], () => {});
  } else {
    execFile('xdg-open', [url], () => {});
  }
}

export async function openDashboard(options: { openBrowser?: boolean } = {}): Promise<string> {
  let port = await resolveRelayPort();
  if (!await relayIsHealthy(port)) {
    startRelay();
    port = await waitForRelay();
  }
  const url = `http://127.0.0.1:${port}/ui`;
  if (options.openBrowser !== false) openUrl(url);
  console.log(`Dashboard: ${url}`);
  console.log(`Unlock token: ${getTokenPath()}`);
  return url;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void openDashboard({
    openBrowser: !process.argv.includes('--no-open'),
  }).catch((error: unknown) => {
    console.error(`Could not open the dashboard: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
