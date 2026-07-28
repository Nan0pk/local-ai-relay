import type { BrowserContext } from 'patchright';
import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { browserBinariesDir, findSystemBrowser } from './paths.js';

interface PersistentContextOptions {
  headless: boolean;
  viewport: { width: number; height: number };
}

export interface BrowserAvailability {
  source: 'system' | 'managed';
  executablePath: string;
  installedNow: boolean;
}

export interface EnsureBrowserOptions {
  findSystem?: () => Promise<string | undefined>;
  managedExecutablePath?: () => Promise<string>;
  isExecutable?: (path: string) => Promise<boolean>;
  installManaged?: (destination: string) => Promise<void>;
  onInstallStart?: (destination: string) => void;
}

export type BrowserLaunchTarget =
  | { channel: 'chrome' }
  | { executablePath: string }
  | Record<string, never>;

/**
 * Prefer real installed Chrome through Patchright's channel integration.
 * Explicit executable overrides remain exact, and Chromium installations or
 * the relay-managed browser remain supported as fallbacks.
 */
export function browserLaunchTarget(
  explicitExecutable: string | undefined,
  discoveredExecutable: string | undefined,
): BrowserLaunchTarget {
  if (explicitExecutable) return { executablePath: explicitExecutable };
  const normalized = discoveredExecutable?.replaceAll('\\', '/').toLowerCase();
  if (
    normalized?.includes('google-chrome')
    || normalized?.includes('/google/chrome/')
    || normalized?.includes('/google chrome.app/')
  ) return { channel: 'chrome' };
  if (discoveredExecutable) return { executablePath: discoveredExecutable };
  return {};
}

async function managedExecutablePath(): Promise<string> {
  const { chromium } = await import('patchright');
  return chromium.executablePath();
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function installManagedBrowser(destination: string): Promise<void> {
  console.log(`[local-ai-relay] System browser not found. Auto-installing Chromium into ${destination}...`);
  await mkdir(destination, { recursive: true });
  const cli = join(process.cwd(), 'node_modules', 'patchright', 'cli.js');
  const child = spawn(process.execPath, [cli, 'install', 'chromium'], {
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: destination },
  });
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error(`Managed Chromium installation failed with exit code ${exitCode}.`);
  }
}

export async function ensureBrowserInstalled(
  options: EnsureBrowserOptions = {},
): Promise<BrowserAvailability> {
  const findSystem = options.findSystem ?? findSystemBrowser;
  const getManagedPath = options.managedExecutablePath ?? managedExecutablePath;
  const checkExecutable = options.isExecutable ?? isExecutable;
  const installManaged = options.installManaged ?? installManagedBrowser;
  const discoveredExecutable = await findSystem();
  if (discoveredExecutable) {
    return { source: 'system', executablePath: discoveredExecutable, installedNow: false };
  }

  const destination = browserBinariesDir();
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= destination;
  let managedPath = await getManagedPath();
  if (await checkExecutable(managedPath)) {
    return { source: 'managed', executablePath: managedPath, installedNow: false };
  }

  options.onInstallStart?.(destination);
  await installManaged(destination);
  managedPath = await getManagedPath();
  if (!await checkExecutable(managedPath)) {
    throw new Error('Managed Chromium installation completed but its executable could not be found.');
  }
  return { source: 'managed', executablePath: managedPath, installedNow: true };
}

export async function launchPersistentRelayContext(
  userDataDir: string,
  options: PersistentContextOptions,
): Promise<BrowserContext> {
  if (process.env.RELAY_MOCK_BROWSER === 'true') {
    const { MockBrowserContext } = await import('./mock-browser.js');
    return new MockBrowserContext() as unknown as BrowserContext;
  }
  const availability = await ensureBrowserInstalled();
  const explicitExecutable = availability.source === 'system'
    && process.env.RELAY_BROWSER_EXECUTABLE === availability.executablePath
    ? availability.executablePath
    : undefined;
  const discoveredExecutable = availability.source === 'system'
    ? availability.executablePath
    : undefined;
  if (!discoveredExecutable) {
    process.env.PLAYWRIGHT_BROWSERS_PATH ??= browserBinariesDir();
  }
  const { chromium } = await import('patchright');
  return chromium.launchPersistentContext(userDataDir, {
    ...options,
    ...browserLaunchTarget(explicitExecutable, discoveredExecutable),
  });
}
