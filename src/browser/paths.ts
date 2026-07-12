import { join } from 'node:path';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

/** One predictable browser-binary location shared by install and runtime. */
export function browserBinariesDir(): string {
  return process.env.PLAYWRIGHT_BROWSERS_PATH
    ?? join(process.cwd(), '.relay-browser', 'browsers');
}

const LINUX_BROWSER_CANDIDATES = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
] as const;

/** Prefer an explicit executable, then an installed Linux Chrome/Chromium. */
export async function findSystemBrowser(): Promise<string | undefined> {
  const candidates = [
    process.env.RELAY_BROWSER_EXECUTABLE,
    ...(process.platform === 'linux' ? LINUX_BROWSER_CANDIDATES : []),
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through known browser locations.
    }
  }
  return undefined;
}
