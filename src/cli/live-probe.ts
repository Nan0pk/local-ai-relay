import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { ChatGptPlaywrightDriver } from '../browser/chatgpt-driver.js';
import { browserBinariesDir } from '../browser/paths.js';

const EXPECTED = 'LOCAL AI RELAY READY';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function distroName(): Promise<string> {
  if (process.platform !== 'linux') return process.platform;
  try {
    const source = await readFile('/etc/os-release', 'utf8');
    return source.match(/^PRETTY_NAME=(?:"([^"]+)"|(.+))$/m)?.slice(1).find(Boolean)
      ?? 'Unknown Linux';
  } catch {
    return 'Unknown Linux';
  }
}

async function runBrowserInstall(): Promise<void> {
  console.log('No relay Chromium installation was found; installing it now.');
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli/browser-install.ts'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });
  const code = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (value) => resolve(value ?? 1));
  });
  if (code !== 0) {
    throw new Error(
      'Chromium installation failed. On Debian/Ubuntu, run `npx playwright install-deps chromium` once, then retry.',
    );
  }
}

async function main(): Promise<void> {
  console.log('Local AI Relay — ChatGPT browser live probe');
  console.log(`OS: ${await distroName()}`);
  console.log(`Node: ${process.version}`);

  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) throw new Error('Node.js 22 or newer is required.');
  if (
    process.platform === 'linux'
    && process.env.RELAY_BROWSER_HEADLESS !== '1'
    && !process.env.DISPLAY
    && !process.env.WAYLAND_DISPLAY
  ) {
    throw new Error('No graphical Linux session was detected (DISPLAY/WAYLAND_DISPLAY is missing).');
  }

  const explicitBrowser = process.env.RELAY_BROWSER_EXECUTABLE;
  const hasExplicitBrowser = explicitBrowser ? await exists(explicitBrowser) : false;
  let hasRelayBrowser = false;
  try {
    process.env.PLAYWRIGHT_BROWSERS_PATH ??= browserBinariesDir();
    const { chromium } = await import('playwright');
    hasRelayBrowser = await exists(chromium.executablePath());
  } catch {
    hasRelayBrowser = false;
  }
  if (!hasExplicitBrowser && !hasRelayBrowser) await runBrowserInstall();

  const driver = new ChatGptPlaywrightDriver({ headless: false });
  try {
    console.log('Opening the dedicated profile. Sign in normally if ChatGPT asks.');
    console.log('The probe will continue automatically when the composer becomes available.');
    await driver.openForLogin();
    await driver.waitUntilReady();
    console.log('Composer detected. Sending one harmless verification message.');
    const result = await driver.send({
      prompt: `Reply with exactly these words and nothing else: ${EXPECTED}`,
      sessionId: 'local-ai-relay-live-probe',
      resetSession: true,
    });
    if (!result.text.toUpperCase().includes(EXPECTED)) {
      throw new Error(`A response was extracted, but it did not contain the expected marker. Received: ${result.text.slice(0, 160)}`);
    }
    console.log('PASS: ChatGPT submission, completion detection, and response extraction worked.');
    console.log(`Conversation: ${result.conversationUrl ?? 'URL unavailable'}`);
  } finally {
    await driver.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL: ${message}`);
  console.error('If the browser opened, a local failure screenshot may have been saved.');
  process.exitCode = 1;
});
