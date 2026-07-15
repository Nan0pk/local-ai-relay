import type { BrowserContext } from 'patchright';
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

export async function launchPersistentRelayContext(
  userDataDir: string,
  options: PersistentContextOptions,
): Promise<BrowserContext> {
  if (process.env.RELAY_MOCK_BROWSER === 'true') {
    const { MockBrowserContext } = await import('./mock-browser.js');
    return new MockBrowserContext() as unknown as BrowserContext;
  }
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
