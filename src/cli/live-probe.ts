import { readFile } from 'node:fs/promises';
import {
  createAdaptiveBrowserDriver,
  findBrowserProvider,
} from '../browser/driver-registry.js';
import { isExistingBrowserConnected } from '../browser/extension-driver.js';
import { ensureBrowserInstalled } from '../browser/runtime.js';
import { persistCapability } from '../capabilities/evidence-store.js';
import type { ProviderCapabilityRecord } from '../capabilities/tracker.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED = 'LOCAL AI RELAY READY';
const READINESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type LiveProbeStage =
  | 'checking_environment'
  | 'installing_browser'
  | 'opening_browser'
  | 'waiting_for_login'
  | 'verifying'
  | 'ready';

export interface LiveProbeOptions {
  signal?: AbortSignal;
  onStage?: (stage: LiveProbeStage, detail: string) => void;
  /** Short, non-interactive probe used by dashboard startup discovery. */
  automatic?: boolean;
  readinessTimeoutMs?: number;
  verificationTimeoutMs?: number;
}

function parseProvider(argv: string[]): string {
  const idx = argv.indexOf('--provider');
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1]!;
  if (argv[0] && !argv[0].startsWith('-')) return argv[0];
  return 'chatgpt';
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

export async function runLiveProbe(providerName: string, options: LiveProbeOptions = {}): Promise<{
  providerId: string;
  conversationUrl?: string;
}> {
  try { process.loadEnvFile?.(); } catch { /* optional .env */ }
  const descriptor = findBrowserProvider(providerName);
  options.onStage?.('checking_environment', 'Checking the browser and graphical session.');
  console.log(`Local AI Relay — ${descriptor.label} browser live probe`);
  console.log(`OS: ${await distroName()}`);
  console.log(`Node: ${process.version}`);

  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) throw new Error('Node.js 22 or newer is required.');
  const useExistingBrowser = isExistingBrowserConnected();
  if (
    !useExistingBrowser
    && !options.automatic
    && process.platform === 'linux'
    && process.env.RELAY_BROWSER_HEADLESS !== '1'
    && !process.env.DISPLAY
    && !process.env.WAYLAND_DISPLAY
  ) {
    throw new Error('No graphical Linux session was detected (DISPLAY/WAYLAND_DISPLAY is missing).');
  }

  if (useExistingBrowser) {
    console.log('Browser: using a relay-owned tab in the paired, already signed-in Chrome profile');
  } else {
    const browser = await ensureBrowserInstalled({
      onInstallStart: (destination) => {
        options.onStage?.(
          'installing_browser',
          `No compatible installed browser was found. Installing managed Chromium once into ${destination}.`,
        );
      },
    });
    console.log(
      browser.source === 'system'
        ? `Browser: using installed ${browser.executablePath} with the shared relay profile`
        : `Browser: using ${browser.installedNow ? 'newly installed' : 'existing'} managed Chromium at ${browser.executablePath}`,
    );
  }

  const driver = createAdaptiveBrowserDriver(
    descriptor.name,
    options.automatic
      ? {
          fallback: {
            headless: true,
            interactive: false,
            timeoutMs: options.verificationTimeoutMs ?? 45_000,
          },
          existingBrowser: {
            background: true,
            sendTimeoutMs: options.verificationTimeoutMs ?? 45_000,
          },
        }
      : {},
  );
  try {
    if (options.signal?.aborted) throw new Error('Connection was cancelled.');
    options.onStage?.(
      'opening_browser',
      options.automatic
        ? `Checking ${descriptor.label} quietly for anonymous access.`
        : useExistingBrowser
        ? `Opening ${descriptor.label} in this Chrome profile.`
        : `Opening ${descriptor.label} in the shared relay browser.`,
    );
    console.log(
      options.automatic
        ? `Checking ${descriptor.label} in a background ${useExistingBrowser ? 'Chrome tab' : 'relay-browser session'}.`
        : useExistingBrowser
        ? `Opening a relay-owned ${descriptor.label} tab in this Chrome profile.`
        : `Opening ${descriptor.label} in the shared relay browser. Sign in normally if asked.`,
    );
    console.log(options.automatic
      ? 'Checking for a usable signed-out composer without starting a sign-in flow.'
      : 'The probe will continue automatically when the composer becomes available.');
    await driver.openForLogin();
    options.onStage?.(
      'waiting_for_login',
      options.automatic
        ? 'Checking for anonymous access.'
        : 'Waiting for sign-in and a usable chat composer.',
    );
    await driver.waitUntilReady(
      options.readinessTimeoutMs ?? (options.automatic ? 12_000 : undefined),
      options.signal,
    );
    options.onStage?.('verifying', 'Composer detected; sending one transparent readiness check.');
    console.log('Composer detected. Sending one harmless verification message.');
    const result = await driver.send({
      prompt: `Reply with exactly these words and nothing else: ${EXPECTED}`,
      sessionId: `local-ai-relay-live-probe-${descriptor.name}`,
      resetSession: true,
      signal: options.signal,
    });
    if (!result.text.toUpperCase().includes(EXPECTED)) {
      throw new Error(`A response was extracted, but it did not contain the expected marker. Received: ${result.text.slice(0, 160)}`);
    }
    const recordedAt = new Date().toISOString();
    const record: ProviderCapabilityRecord = {
      providerId: `browser-${descriptor.name}`,
      status: 'ready',
      evidence: {
        reference: `live-probe:${descriptor.name}:${recordedAt}`,
        recordedAt,
        expiresAt: new Date(Date.now() + READINESS_TTL_MS).toISOString(),
      },
      detail: `${descriptor.label} live submission, completion detection, and response extraction passed.`,
      updatedAt: recordedAt,
    };
    await persistCapability(record);
    options.onStage?.('ready', `${descriptor.label} is connected and verified.`);
    console.log(`PASS: ${descriptor.label} submission, completion detection, and response extraction worked.`);
    console.log(`Conversation: ${result.conversationUrl ?? 'URL unavailable'}`);
    console.log('Readiness evidence recorded for 7 days and refreshed by successful real use.');
    return {
      providerId: record.providerId,
      ...(result.conversationUrl ? { conversationUrl: result.conversationUrl } : {}),
    };
  } finally {
    await driver.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLiveProbe(parseProvider(process.argv.slice(2))).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL: ${message}`);
    console.error('If the browser opened, a local failure screenshot may have been saved.');
    process.exitCode = 1;
  });
}
