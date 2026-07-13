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
  if (discoveredExecutable?.includes('google-chrome')) return { channel: 'chrome' };
  if (discoveredExecutable) return { executablePath: discoveredExecutable };
  return {};
}

export async function launchPersistentRelayContext(
  userDataDir: string,
  options: PersistentContextOptions,
): Promise<BrowserContext> {
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
