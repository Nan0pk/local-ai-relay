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

export async function ensureBrowserInstalled(): Promise<void> {
  const discoveredExecutable = await findSystemBrowser();
  if (discoveredExecutable || process.env.RELAY_BROWSER_EXECUTABLE) return;
  const destination = browserBinariesDir();
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= destination;
  const { chromium } = await import('patchright');
  try {
    await access(chromium.executablePath(), constants.X_OK);
  } catch {
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
      throw new Error(`Patchright Chromium installation failed with exit code ${exitCode}.`);
    }
  }
}

export async function launchPersistentRelayContext(
  userDataDir: string,
  options: PersistentContextOptions,
): Promise<BrowserContext> {
  if (process.env.RELAY_MOCK_BROWSER === 'true') {
    const { MockBrowserContext } = await import('./mock-browser.js');
    return new MockBrowserContext() as unknown as BrowserContext;
  }
  await ensureBrowserInstalled();
  const explicitExecutable = process.env.RELAY_BROWSER_EXECUTABLE;
  const discoveredExecutable = await findSystemBrowser();
  if (!discoveredExecutable) {
    process.env.PLAYWRIGHT_BROWSERS_PATH ??= browserBinariesDir();
  }
  const { chromium } = await import('patchright');
  return chromium.launchPersistentContext(userDataDir, {
    ...options,
    ...browserLaunchTarget(explicitExecutable, discoveredExecutable),
  });
}
