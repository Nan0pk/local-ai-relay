import { join } from 'node:path';

/** One predictable browser-binary location shared by install and runtime. */
export function browserBinariesDir(): string {
  return process.env.PLAYWRIGHT_BROWSERS_PATH
    ?? join(process.cwd(), '.relay-browser', 'browsers');
}
