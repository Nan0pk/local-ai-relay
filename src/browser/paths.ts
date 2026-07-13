import { join, win32 } from 'node:path';
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

/** Known Chrome/Chromium locations without downloading a managed browser. */
export function systemBrowserCandidates(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (platform === 'win32') {
    return [
      env.PROGRAMFILES && win32.join(env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      env['PROGRAMFILES(X86)'] && win32.join(env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
      env.LOCALAPPDATA && win32.join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      env.PROGRAMFILES && win32.join(env.PROGRAMFILES, 'Chromium', 'Application', 'chrome.exe'),
    ].filter((candidate): candidate is string => Boolean(candidate));
  }
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      env.HOME && join(env.HOME, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ].filter((candidate): candidate is string => Boolean(candidate));
  }
  return platform === 'linux' ? [...LINUX_BROWSER_CANDIDATES] : [];
}

/** Prefer an explicit executable, then an installed Chrome/Chromium. */
export async function findSystemBrowser(): Promise<string | undefined> {
  const candidates = [
    process.env.RELAY_BROWSER_EXECUTABLE,
    ...systemBrowserCandidates(),
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
