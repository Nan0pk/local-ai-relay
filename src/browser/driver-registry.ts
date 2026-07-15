import type { BrowserLoginDriver } from './types.js';
import { ChatGptPlaywrightDriver } from './chatgpt-driver.js';
import { ClaudePlaywrightDriver } from './claude-driver.js';
import { GeminiPlaywrightDriver } from './gemini-driver.js';
import { DeepSeekPlaywrightDriver } from './deepseek-driver.js';
import { ZaiPlaywrightDriver } from './zai-driver.js';
import { MinimaxPlaywrightDriver } from './minimax-driver.js';
import { KimiPlaywrightDriver } from './kimi-driver.js';
import { QwenPlaywrightDriver } from './qwen-driver.js';
import { GrokPlaywrightDriver } from './grok-driver.js';
import { MistralPlaywrightDriver } from './mistral-driver.js';
import { ArenaPlaywrightDriver } from './arena-driver.js';

export interface BrowserProviderDescriptor {
  readonly name: string;
  readonly label: string;
  readonly url: string;
  factory(options?: any): BrowserLoginDriver;
}

const CHATGPT: BrowserProviderDescriptor = {
  name: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/',
  factory: (opts) => new ChatGptPlaywrightDriver({ headless: false, ...opts }),
};
const CLAUDE: BrowserProviderDescriptor = {
  name: 'claude', label: 'Claude', url: 'https://claude.ai/',
  factory: (opts) => new ClaudePlaywrightDriver({ headless: false, ...opts }),
};
const GEMINI: BrowserProviderDescriptor = {
  name: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/app',
  factory: (opts) => new GeminiPlaywrightDriver({ headless: false, ...opts }),
};
const DEEPSEEK: BrowserProviderDescriptor = {
  name: 'deepseek', label: 'DeepSeek', url: 'https://chat.deepseek.com/',
  factory: (opts) => new DeepSeekPlaywrightDriver({ headless: false, ...opts }),
};
const ZAI: BrowserProviderDescriptor = {
  name: 'zai', label: 'Z.ai', url: 'https://chat.z.ai/',
  factory: (opts) => new ZaiPlaywrightDriver({ headless: false, ...opts }),
};
const MINIMAX: BrowserProviderDescriptor = {
  name: 'minimax', label: 'MiniMax Agent', url: 'https://agent.minimax.io/',
  factory: (opts) => new MinimaxPlaywrightDriver({ headless: false, ...opts }),
};
const KIMI: BrowserProviderDescriptor = {
  name: 'kimi', label: 'Kimi', url: 'https://kimi.com/',
  factory: (opts) => new KimiPlaywrightDriver({ headless: false, ...opts }),
};
const QWEN: BrowserProviderDescriptor = {
  name: 'qwen', label: 'Qwen Chat', url: 'https://chat.qwen.ai/',
  factory: (opts) => new QwenPlaywrightDriver({ headless: false, ...opts }),
};
const GROK: BrowserProviderDescriptor = {
  name: 'grok', label: 'Grok', url: 'https://grok.com/',
  factory: (opts) => new GrokPlaywrightDriver({ headless: false, ...opts }),
};
const MISTRAL: BrowserProviderDescriptor = {
  name: 'mistral', label: 'Mistral Le Chat', url: 'https://chat.mistral.ai/',
  factory: (opts) => new MistralPlaywrightDriver({ headless: false, ...opts }),
};
const ARENA: BrowserProviderDescriptor = {
  name: 'arena', label: 'LMSYS Chatbot Arena', url: 'https://chat.lmsys.org/',
  factory: (opts) => new ArenaPlaywrightDriver({ headless: false, ...opts }),
};

/**
 * Known browser drivers for the login and probe CLIs.
 *
 * Adding a driver here does NOT register it in `/v1/models` or Hermes. It
 * only makes the `--provider` flag work for `npm run login:<name>` and
 * `npm run probe:<name>`. A provider enters `/v1/models` only after
 * `registry.ts` lists it, which only happens after live E2E passes.
 */
const PROVIDERS: readonly BrowserProviderDescriptor[] = [
  CHATGPT, CLAUDE, GEMINI, DEEPSEEK, ZAI, MINIMAX, KIMI, QWEN, GROK, MISTRAL, ARENA,
];

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
