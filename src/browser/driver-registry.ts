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
import { MetaPlaywrightDriver } from './meta-driver.js';

export interface BrowserProviderDescriptor {
  readonly name: string;
  readonly label: string;
  readonly url: string;
  readonly authentication: 'required' | 'optional';
  factory(options?: any): BrowserLoginDriver;
}

const CHATGPT: BrowserProviderDescriptor = {
  name: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/', authentication: 'required',
  factory: (opts) => new ChatGptPlaywrightDriver(opts),
};
const CLAUDE: BrowserProviderDescriptor = {
  name: 'claude', label: 'Claude', url: 'https://claude.ai/', authentication: 'required',
  factory: (opts) => new ClaudePlaywrightDriver(opts),
};
const GEMINI: BrowserProviderDescriptor = {
  name: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/app', authentication: 'required',
  factory: (opts) => new GeminiPlaywrightDriver(opts),
};
const DEEPSEEK: BrowserProviderDescriptor = {
  name: 'deepseek', label: 'DeepSeek', url: 'https://chat.deepseek.com/', authentication: 'required',
  factory: (opts) => new DeepSeekPlaywrightDriver(opts),
};
const ZAI: BrowserProviderDescriptor = {
  name: 'zai', label: 'Z.ai', url: 'https://chat.z.ai/', authentication: 'required',
  factory: (opts) => new ZaiPlaywrightDriver(opts),
};
const MINIMAX: BrowserProviderDescriptor = {
  name: 'minimax', label: 'MiniMax Agent', url: 'https://agent.minimax.io/', authentication: 'required',
  factory: (opts) => new MinimaxPlaywrightDriver(opts),
};
const KIMI: BrowserProviderDescriptor = {
  name: 'kimi', label: 'Kimi', url: 'https://kimi.com/', authentication: 'required',
  factory: (opts) => new KimiPlaywrightDriver(opts),
};
const QWEN: BrowserProviderDescriptor = {
  name: 'qwen', label: 'Qwen Chat', url: 'https://chat.qwen.ai/', authentication: 'required',
  factory: (opts) => new QwenPlaywrightDriver(opts),
};
const GROK: BrowserProviderDescriptor = {
  name: 'grok', label: 'Grok', url: 'https://grok.com/', authentication: 'required',
  factory: (opts) => new GrokPlaywrightDriver(opts),
};
const MISTRAL: BrowserProviderDescriptor = {
  name: 'mistral', label: 'Mistral Le Chat', url: 'https://chat.mistral.ai/', authentication: 'required',
  factory: (opts) => new MistralPlaywrightDriver(opts),
};
const ARENA: BrowserProviderDescriptor = {
  name: 'arena', label: 'LMSYS Chatbot Arena', url: 'https://chat.lmsys.org/', authentication: 'optional',
  factory: (opts) => new ArenaPlaywrightDriver(opts),
};
const META: BrowserProviderDescriptor = {
  name: 'meta', label: 'Meta AI', url: 'https://www.meta.ai/', authentication: 'required',
  factory: (opts) => new MetaPlaywrightDriver(opts),
};

/**
 * Known browser drivers for the login and probe CLIs.
 *
 * Adding a driver here does NOT register it in the model inventory. It only
 * makes the `--provider` flag work for login and probe commands. The provider
 * registry owns inventory; current evidence controls default discovery.
 */
const PROVIDERS: readonly BrowserProviderDescriptor[] = [
  CHATGPT, CLAUDE, GEMINI, DEEPSEEK, ZAI, MINIMAX, KIMI, QWEN, GROK, MISTRAL, META, ARENA,
];

export function listBrowserProviderNames(): string[] {
  return PROVIDERS.map((p) => p.name);
}

export function listBrowserProviders(): readonly BrowserProviderDescriptor[] {
  return PROVIDERS;
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
