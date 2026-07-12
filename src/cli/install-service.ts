import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from '../config.js';
import { selectPort } from '../startup/port-selection.js';
import { buildServiceUnit } from '../service/unit.js';

const execFileAsync = promisify(execFile);

async function persistPort(envPath: string, port: number): Promise<void> {
  let source = '';
  try { source = await readFile(envPath, 'utf8'); } catch { /* created below */ }
  if (/^PORT=/m.test(source)) source = source.replace(/^PORT=.*$/m, `PORT=${port}`);
  else source += `${source.endsWith('\n') || !source ? '' : '\n'}PORT=${port}\n`;
  await writeFile(envPath, source, { mode: 0o600 });
}

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      const body = await response.json() as { service?: string };
      if (body.service === 'local-ai-relay') return;
    } catch { /* service is starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Relay service did not become healthy on port ${port}. Run: journalctl --user -u local-ai-relay -n 100`);
}

async function main(): Promise<void> {
  if (process.platform !== 'linux') throw new Error('The automatic service installer currently supports Linux only.');
  const root = process.cwd();
  const envPath = join(root, '.env');
  const requested = loadConfig();
  const selected = await selectPort(requested.host, requested.port);
  if (selected.existingRelay) console.log(`Updating service for the relay on port ${selected.port}.`);
  await persistPort(envPath, selected.port);
  await chmod(envPath, 0o600);

  const unitPath = join(homedir(), '.config', 'systemd', 'user', 'local-ai-relay.service');
  await mkdir(dirname(unitPath), { recursive: true });
  const unit = buildServiceUnit(root, process.execPath, envPath);
  await writeFile(unitPath, unit);

  const environmentNames = ['DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS']
    .filter((name) => process.env[name]);
  if (environmentNames.length) {
    await execFileAsync('systemctl', ['--user', 'import-environment', ...environmentNames]);
  }
  await execFileAsync('systemctl', ['--user', 'daemon-reload']);
  await execFileAsync('systemctl', ['--user', 'enable', 'local-ai-relay.service']);
  await execFileAsync('systemctl', ['--user', 'restart', 'local-ai-relay.service']);
  await waitForHealth(selected.port);
  await mkdir(join(root, '.relay-browser'), { recursive: true });
  await writeFile(join(root, '.relay-browser', 'active-port'), `${selected.port}\n`);
  console.log(`PASS: background relay service is healthy at http://127.0.0.1:${selected.port}`);
}

main().catch((error: unknown) => {
  console.error(`SERVICE SETUP FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
