import { execFile, spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { getOrGenerateToken, getTokenPath } from '../auth/token.js';
import { resolveRelayPort } from '../startup/relay-location.js';

const execFileAsync = promisify(execFile);

interface RelayHealth {
  service?: string;
  source_revision?: string | null;
}

async function relayHealth(port: number): Promise<RelayHealth | undefined> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(800),
    });
    const body = await response.json() as RelayHealth;
    return response.ok && body.service === 'local-ai-relay' ? body : undefined;
  } catch {
    return undefined;
  }
}

async function currentSourceRevision(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: process.cwd(),
      timeout: 2_000,
    });
    const revision = stdout.trim();
    return /^[0-9a-f]{40}$/i.test(revision) ? revision : undefined;
  } catch {
    return undefined;
  }
}

async function stopReplaceableRuntime(port: number, token: string): Promise<void> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/control/runtime/stop`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return;
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      if (!await relayHealth(port)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } catch {
    // Older source revisions do not expose controlled shutdown. The new
    // runtime will use a successor port and become the recorded active relay.
  }
}

export function needsRuntimeReplacement(
  replaceRunning: boolean,
  currentRevision: string | undefined,
  runningRevision: string | null | undefined,
): boolean {
  return replaceRunning
    && currentRevision !== undefined
    && runningRevision !== currentRevision;
}

function startRelay(options: {
  replaceRunning?: boolean;
  sourceRevision?: string;
} = {}): void {
  const root = process.cwd();
  const args = ['--import', 'tsx', join(root, 'src', 'index.ts')];
  const logPath = join(homedir(), '.local-ai-relay', 'relay.log');
  mkdirSync(dirname(logPath), { recursive: true, mode: 0o700 });
  const log = openSync(logPath, 'a', 0o600);
  const child = spawn(process.execPath, args, {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      ...(options.replaceRunning ? { RELAY_REPLACE_RUNNING: '1' } : {}),
      ...(options.sourceRevision ? { RELAY_SOURCE_REVISION: options.sourceRevision } : {}),
    },
    stdio: ['ignore', log, log],
  });
  child.unref();
  closeSync(log);
}

async function waitForRelay(expectedRevision?: string): Promise<number> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const port = await resolveRelayPort();
    const health = await relayHealth(port);
    if (health && (!expectedRevision || health.source_revision === expectedRevision)) return port;
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

export function dashboardAccessLines(
  token: string,
  tokenSource: string,
  opened: boolean,
): string[] {
  return [
    '',
    '=== Local AI Relay dashboard access ===',
    `Local access token: ${token}`,
    `Token source: ${tokenSource}`,
    opened
      ? 'Dashboard opened and unlocked for this local session.'
      : 'Paste the token above into the dashboard unlock box.',
    'Reopen later with the desktop launcher or run: npm run dashboard',
    'Keep this token private: it controls your local relay dashboard.',
    '=======================================',
  ];
}

export async function openDashboard(options: {
  openBrowser?: boolean;
  replaceRunning?: boolean;
} = {}): Promise<string> {
  const token = await getOrGenerateToken();
  let port = await resolveRelayPort();
  const running = await relayHealth(port);
  const sourceRevision = options.replaceRunning ? await currentSourceRevision() : undefined;
  const replace = needsRuntimeReplacement(
    options.replaceRunning === true,
    sourceRevision,
    running?.source_revision,
  );
  if (!running || replace) {
    if (replace && running?.source_revision) {
      await stopReplaceableRuntime(port, token);
    }
    startRelay({ replaceRunning: replace, sourceRevision });
    port = await waitForRelay(sourceRevision);
  }
  const url = `http://127.0.0.1:${port}/ui`;
  if (options.openBrowser !== false) {
    openUrl(`${url}#token=${encodeURIComponent(token)}`);
  }
  console.log(`Dashboard: ${url}`);
  const tokenSource = process.env.RELAY_API_TOKEN
    ? 'RELAY_API_TOKEN environment variable'
    : getTokenPath();
  for (const line of dashboardAccessLines(token, tokenSource, options.openBrowser !== false)) {
    console.log(line);
  }
  return url;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void openDashboard({
    openBrowser: !process.argv.includes('--no-open'),
    replaceRunning: process.argv.includes('--replace-running'),
  }).catch((error: unknown) => {
    console.error(`Could not open the dashboard: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
