import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { browserBinariesDir } from '../browser/paths.js';

async function main(): Promise<void> {
  const destination = browserBinariesDir();
  await mkdir(destination, { recursive: true });
  console.log(`Installing relay Chromium into ${destination}`);

  const cli = join(process.cwd(), 'node_modules', 'playwright', 'cli.js');
  const child = spawn(process.execPath, [cli, 'install', 'chromium'], {
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: destination },
  });
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) process.exitCode = exitCode;
}

void main();
