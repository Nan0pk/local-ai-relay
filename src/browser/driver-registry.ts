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
import { AdaptiveBrowserDriver } from './adaptive-driver.js';
import type { BrowserAutomationConfig } from '../extension/browser-bridge.js';
import type { BaseDriverOptions } from './base-driver.js';
import type { ExistingBrowserDriverOptions } from './extension-driver.js';

export interface BrowserProviderDescriptor {
  readonly name: string;
  readonly label: string;
  readonly url: string;
  /**
   * Provider access changes by region, quota, rollout, and account state.
   * Drivers therefore verify the live composer instead of assuming login state.
   */
  readonly authentication: 'dynamic';
  /** A recent signed-out prompt completed; only these providers are tried automatically. */
  readonly anonymousCandidate: boolean;
  factory(options?: any): BrowserLoginDriver;
}

const CHATGPT: BrowserProviderDescriptor = {
  name: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/', authentication: 'dynamic', anonymousCandidate: false,
  factory: (opts) => new ChatGptPlaywrightDriver(opts),
};
const CLAUDE: BrowserProviderDescriptor = {
  name: 'claude', label: 'Claude', url: 'https://claude.ai/', authentication: 'dynamic', anonymousCandidate: false,
  factory: (opts) => new ClaudePlaywrightDriver(opts),
};
const GEMINI: BrowserProviderDescriptor = {
  name: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/app', authentication: 'dynamic', anonymousCandidate: true,
  factory: (opts) => new GeminiPlaywrightDriver(opts),
};
const DEEPSEEK: BrowserProviderDescriptor = {
  name: 'deepseek', label: 'DeepSeek', url: 'https://chat.deepseek.com/', authentication: 'dynamic', anonymousCandidate: false,
  factory: (opts) => new DeepSeekPlaywrightDriver(opts),
};
const ZAI: BrowserProviderDescriptor = {
  name: 'zai', label: 'Z.ai', url: 'https://chat.z.ai/', authentication: 'dynamic', anonymousCandidate: true,
  factory: (opts) => new ZaiPlaywrightDriver(opts),
};
const MINIMAX: BrowserProviderDescriptor = {
  name: 'minimax', label: 'MiniMax Agent', url: 'https://agent.minimax.io/', authentication: 'dynamic', anonymousCandidate: false,
  factory: (opts) => new MinimaxPlaywrightDriver(opts),
};
const KIMI: BrowserProviderDescriptor = {
  name: 'kimi', label: 'Kimi', url: 'https://www.kimi.com/', authentication: 'dynamic', anonymousCandidate: false,
  factory: (opts) => new KimiPlaywrightDriver(opts),
};
const QWEN: BrowserProviderDescriptor = {
  name: 'qwen', label: 'Qwen Chat', url: 'https://chat.qwen.ai/', authentication: 'dynamic', anonymousCandidate: true,
  factory: (opts) => new QwenPlaywrightDriver(opts),
};
const GROK: BrowserProviderDescriptor = {
  name: 'grok', label: 'Grok', url: 'https://grok.com/', authentication: 'dynamic', anonymousCandidate: false,
  factory: (opts) => new GrokPlaywrightDriver(opts),
};
const MISTRAL: BrowserProviderDescriptor = {
  name: 'mistral', label: 'Mistral Le Chat', url: 'https://chat.mistral.ai/', authentication: 'dynamic', anonymousCandidate: false,
  factory: (opts) => new MistralPlaywrightDriver(opts),
};
const ARENA: BrowserProviderDescriptor = {
  name: 'arena', label: 'Arena', url: 'https://arena.ai/', authentication: 'dynamic', anonymousCandidate: false,
  factory: (opts) => new ArenaPlaywrightDriver(opts),
};
const META: BrowserProviderDescriptor = {
  name: 'meta', label: 'Meta AI', url: 'https://www.meta.ai/', authentication: 'dynamic', anonymousCandidate: false,
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

export interface AdaptiveBrowserDriverOptions {
  fallback?: BaseDriverOptions;
  existingBrowser?: ExistingBrowserDriverOptions;
}

export function createAdaptiveBrowserDriver(
  name: string,
  options: AdaptiveBrowserDriverOptions = {},
): BrowserLoginDriver {
  const descriptor = findBrowserProvider(name);
  const fallback = descriptor.factory(options.fallback);
  const configurable = fallback as BrowserLoginDriver & {
    automationConfig(label?: string): BrowserAutomationConfig;
  };
  if (typeof configurable.automationConfig !== 'function') {
    throw new Error(`${descriptor.label} does not expose an extension automation contract.`);
  }
  return new AdaptiveBrowserDriver(
    configurable.automationConfig(descriptor.label),
    fallback,
    options.existingBrowser,
  );
}
