import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { findBrowserProvider } from '../browser/driver-registry.js';
import { browserBinariesDir, findSystemBrowser } from '../browser/paths.js';

const EXPECTED = 'LOCAL AI RELAY READY';

function parseProvider(argv: string[]): string {
  const idx = argv.indexOf('--provider');
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1]!;
  if (argv[0] && !argv[0].startsWith('-')) return argv[0];
  return 'chatgpt';
}

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

async function main(): Promise<void> {
  const descriptor = findBrowserProvider(parseProvider(process.argv.slice(2)));
  console.log(`Local AI Relay — ${descriptor.label} browser live probe`);
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

  const systemBrowser = await findSystemBrowser();
  if (systemBrowser) {
    console.log(`Browser: using installed ${systemBrowser} with the isolated relay profile`);
  }
  let hasRelayBrowser = false;
  try {
    process.env.PLAYWRIGHT_BROWSERS_PATH ??= browserBinariesDir();
    const { chromium } = await import('patchright');
    hasRelayBrowser = await exists(chromium.executablePath());
  } catch {
    hasRelayBrowser = false;
  }
  if (!systemBrowser && !hasRelayBrowser) {
    throw new Error(
      'No installed Chrome/Chromium was found. Install Google Chrome (recommended), set RELAY_BROWSER_EXECUTABLE, or explicitly run `npm run browser:install` for the optional managed Chromium download.',
    );
  }

  const driver = descriptor.factory();
  try {
    console.log(`Opening the dedicated ${descriptor.label} profile. Sign in normally if asked.`);
    console.log('The probe will continue automatically when the composer becomes available.');
    await driver.openForLogin();
    await driver.waitUntilReady();
    console.log('Composer detected. Sending one harmless verification message.');
    const result = await driver.send({
      prompt: `Reply with exactly these words and nothing else: ${EXPECTED}`,
      sessionId: `local-ai-relay-live-probe-${descriptor.name}`,
      resetSession: true,
    });
    if (!result.text.toUpperCase().includes(EXPECTED)) {
      throw new Error(`A response was extracted, but it did not contain the expected marker. Received: ${result.text.slice(0, 160)}`);
    }
    console.log(`PASS: ${descriptor.label} submission, completion detection, and response extraction worked.`);
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
