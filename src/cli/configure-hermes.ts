import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hermesConfigCommands } from '../hermes/config.js';

const execFileAsync = promisify(execFile);

async function activePort(): Promise<number> {
  try {
    const value = Number.parseInt((await readFile(join(process.cwd(), '.relay-browser', 'active-port'), 'utf8')).trim(), 10);
    if (Number.isInteger(value) && value > 0 && value < 65536) return value;
  } catch { /* fall through */ }
  const env = await readFile(join(process.cwd(), '.env'), 'utf8');
  const value = Number.parseInt(env.match(/^PORT=(\d+)$/m)?.[1] ?? '8787', 10);
  return value;
}

async function setHermes(path: string, value: string): Promise<void> {
  await execFileAsync('hermes', ['config', 'set', path, value]);
}

async function main(): Promise<void> {
  const port = await activePort();
  const baseUrl = `http://127.0.0.1:${port}/v1`;
  const response = await fetch(`${baseUrl}/models`);
  if (!response.ok) throw new Error(`Relay model discovery returned HTTP ${response.status}.`);
  const body = await response.json() as { data?: Array<{ id?: string }> };
  if (!body.data?.some((model) => model.id === 'browser-chatgpt-free')) {
    throw new Error('The running relay does not advertise browser-chatgpt-free.');
  }

  for (const command of hermesConfigCommands(baseUrl)) {
    await setHermes(command.path, command.value);
  }
  console.log(`PASS: Hermes now uses browser-chatgpt-free through ${baseUrl}`);
  console.log('Start a new Hermes session for the change to take effect.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`HERMES SETUP FAILED: ${message}`);
  console.error('The relay remains installed and healthy; Hermes configuration was not reported as complete.');
  process.exitCode = 1;
});
