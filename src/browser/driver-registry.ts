import type { BrowserLoginDriver } from './types.js';
import { ChatGptPlaywrightDriver } from './chatgpt-driver.js';
import { ClaudePlaywrightDriver } from './claude-driver.js';

export interface BrowserProviderDescriptor {
  /** CLI name used in `--provider <name>`. */
  readonly name: string;
  /** Marketing/site name shown to the user. */
  readonly label: string;
  /** Canonical webchat URL. */
  readonly url: string;
  /** Construct a fresh driver instance. */
  factory(): BrowserLoginDriver;
}

const CHATGPT: BrowserProviderDescriptor = {
  name: 'chatgpt',
  label: 'ChatGPT',
  url: 'https://chatgpt.com/',
  factory: () => new ChatGptPlaywrightDriver({ headless: false }),
};

const CLAUDE: BrowserProviderDescriptor = {
  name: 'claude',
  label: 'Claude',
  url: 'https://claude.ai/',
  factory: () => new ClaudePlaywrightDriver({ headless: false }),
};

/**
 * Known browser drivers for the login and probe CLIs.
 *
 * Adding a driver here does NOT register it in `/v1/models` or Hermes. It
 * only makes the `--provider` flag work for `npm run browser:login` and
 * `npm run probe:<name>`. A provider enters `/v1/models` only after
 * `registry.ts` lists it, which only happens after live E2E passes.
 */
const PROVIDERS: readonly BrowserProviderDescriptor[] = [CHATGPT, CLAUDE];

export function listBrowserProviderNames(): string[] {
  return PROVIDERS.map((p) => p.name);
}

export function findBrowserProvider(name: string | undefined): BrowserProviderDescriptor {
  const target = (name ?? 'chatgpt').toLowerCase();
  const descriptor = PROVIDERS.find((p) => p.name === target);
  if (!descriptor) {
    throw new Error(
      `Unknown browser provider '${name ?? ''}'. Known providers: ${listBrowserProviderNames().join(', ')}.`,
    );
  }
  return descriptor;
}
