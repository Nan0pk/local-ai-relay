/**
 * Provider registry.
 *
 * Maps model ids to providers. Deterministic mock providers are explicit test
 * fixtures and are excluded from normal runtime inventory.
 *
 * No fallback chains, no provider bypass: if a model isn't registered,
 * the request fails with an OpenAI-shaped 404.
 *
 * Capability-aware discovery: the registry tracks provider readiness
 * through the capability tracker so `/v1/models` advertises only models
 * from genuinely usable providers. Direct requests also enforce readiness.
 */

import type { Provider } from './types.js';
import type { ModelCard } from '../types/openai.js';
import { MockProvider } from './mock.js';
import { ChatGptBrowserProvider } from './chatgpt-browser.js';
import { GeminiBrowserProvider } from './gemini-browser.js';
import { ArenaBrowserProvider } from './arena-browser.js';
import { DeepSeekBrowserProvider } from './deepseek-browser.js';
import { ZaiBrowserProvider } from './zai-browser.js';
import { MinimaxBrowserProvider } from './minimax-browser.js';
import { KimiBrowserProvider } from './kimi-browser.js';
import { QwenBrowserProvider } from './qwen-browser.js';
import { GrokBrowserProvider } from './grok-browser.js';
import { MistralBrowserProvider } from './mistral-browser.js';
import { ClaudeBrowserProvider } from './claude-browser.js';
import { MetaBrowserProvider } from './meta-browser.js';
import { capabilityTracker } from '../capabilities/tracker.js';
import { loadPersistedCapability } from '../capabilities/evidence-store.js';
import { createAdaptiveBrowserDriver } from '../browser/driver-registry.js';

const mockProvider = new MockProvider();
const chatGptBrowserProvider = new ChatGptBrowserProvider(createAdaptiveBrowserDriver('chatgpt'));
const geminiBrowserProvider = new GeminiBrowserProvider(createAdaptiveBrowserDriver('gemini'));
const arenaBrowserProvider = new ArenaBrowserProvider(createAdaptiveBrowserDriver('arena'));
const deepSeekBrowserProvider = new DeepSeekBrowserProvider(createAdaptiveBrowserDriver('deepseek'));
const zaiBrowserProvider = new ZaiBrowserProvider(createAdaptiveBrowserDriver('zai'));
const minimaxBrowserProvider = new MinimaxBrowserProvider(createAdaptiveBrowserDriver('minimax'));
const kimiBrowserProvider = new KimiBrowserProvider(createAdaptiveBrowserDriver('kimi'));
const qwenBrowserProvider = new QwenBrowserProvider(createAdaptiveBrowserDriver('qwen'));
const grokBrowserProvider = new GrokBrowserProvider(createAdaptiveBrowserDriver('grok'));
const mistralBrowserProvider = new MistralBrowserProvider(createAdaptiveBrowserDriver('mistral'));
const claudeBrowserProvider = new ClaudeBrowserProvider(createAdaptiveBrowserDriver('claude'));
const metaBrowserProvider = new MetaBrowserProvider(createAdaptiveBrowserDriver('meta'));

/** Registered providers, in registration order. */
const providers: Provider[] = [
  mockProvider,
  chatGptBrowserProvider,
  geminiBrowserProvider,
  arenaBrowserProvider,
  deepSeekBrowserProvider,
  zaiBrowserProvider,
  minimaxBrowserProvider,
  kimiBrowserProvider,
  qwenBrowserProvider,
  grokBrowserProvider,
  mistralBrowserProvider,
  claudeBrowserProvider,
  metaBrowserProvider,
];

/**
 * Deterministic providers are test fixtures, not user-facing AI backends.
 * They are available only when a caller opts into the explicit test runtime.
 */
export function areTestProvidersEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.RELAY_ENABLE_TEST_PROVIDERS === '1'
    || env.RELAY_MOCK_BROWSER === 'true';
}

function activeProviders(): Provider[] {
  return providers.filter(
    (provider) => provider.id !== 'mock' || areTestProvidersEnabled(),
  );
}

/**
 * Check if we're running in a mock browser environment (for testing).
 * This is checked lazily so the env var can be set before the capability
 * tracker is queried.
 */
function isMockBrowserEnvironment(): boolean {
  return process.env.RELAY_MOCK_BROWSER === 'true';
}

/**
 * Initialize capability tracking for a provider.
 * Called lazily on first query to allow env vars to be set after imports.
 */
function ensureProviderInitialized(providerId: string): void {
  const existing = capabilityTracker.getStatus(providerId);
  if (existing) return; // Already initialized

  if (providerId === 'mock') {
    capabilityTracker.register(providerId, 'ready', 'Deterministic mock, always available.');
  } else {
    // Browser provider
    if (isMockBrowserEnvironment()) {
      capabilityTracker.register(
        providerId,
        'ready',
        'Mock browser active — provider available for testing.',
      );
    } else {
      const persisted = loadPersistedCapability(providerId);
      capabilityTracker.register(providerId, 'installed', 'Adapter compiled; awaiting login and live verification.');
      if (persisted) {
        capabilityTracker.setStatus(
          providerId,
          persisted.status,
          persisted.evidence ?? undefined,
          persisted.detail ?? undefined,
        );
      }
    }
  }
}

/**
 * Ensure all providers are initialized before querying capability state.
 */
function ensureAllProvidersInitialized(): void {
  for (const provider of activeProviders()) {
    ensureProviderInitialized(provider.id);
  }
}

/** Map from model id → provider. */
const modelIndex = new Map<string, Provider>();
for (const p of providers) {
  for (const m of p.listModels()) {
    modelIndex.set(m.id, p);
  }
}

/** Map from provider id → provider instance. */
const providerIndex = new Map<string, Provider>();
for (const p of providers) {
  providerIndex.set(p.id, p);
}

/**
 * List models from all registered providers (including non-ready).
 *
 * This is the production adapter inventory for diagnostics.
 * For discovery that reflects runtime readiness, use `listReadyModels()`.
 */
export function listAllModels() {
  return activeProviders().flatMap((p) => p.listModels());
}

/**
 * List models from providers that are currently ready for use.
 *
 * This is what `/v1/models` should advertise to avoid promoting
 * unavailable providers as usable.
 */
export function listReadyModels() {
  ensureAllProvidersInitialized();
  const readyIds = new Set(capabilityTracker.getReadyProviderIds());
  return activeProviders()
    .filter((p) => readyIds.has(p.id))
    .flatMap((p) => p.listModels());
}

/**
 * Find a provider for a model ID, regardless of readiness.
 *
 * Route layers must also enforce readiness before sending a request.
 */
export function findProviderForModel(model: string): Provider | undefined {
  const provider = modelIndex.get(model);
  if (provider?.id === 'mock' && !areTestProvidersEnabled()) return undefined;
  return provider;
}

/**
 * Check whether a specific model's provider is currently ready.
 */
export function isModelReady(model: string): boolean {
  ensureAllProvidersInitialized();
  const provider = modelIndex.get(model);
  if (!provider) return false;
  if (provider.id === 'mock' && !areTestProvidersEnabled()) return false;
  return capabilityTracker.isReady(provider.id);
}

/**
 * Get the capability status for a specific model's provider.
 * Returns null if the model is not registered.
 */
export function getCapabilityForModel(model: string) {
  ensureAllProvidersInitialized();
  const provider = modelIndex.get(model);
  if (!provider) return null;
  if (provider.id === 'mock' && !areTestProvidersEnabled()) return null;
  return capabilityTracker.getStatus(provider.id) ?? null;
}

/**
 * Get the model cards for a specific provider by its ID.
 * Used by the diagnostic models endpoint.
 */
export function getModelsForProvider(providerId: string): ModelCard[] {
  ensureAllProvidersInitialized();
  const provider = providerIndex.get(providerId);
  if (!provider) return [];
  if (provider.id === 'mock' && !areTestProvidersEnabled()) return [];
  return provider.listModels();
}

/**
 * Get all capability records paired with their models.
 * Used by the diagnostic models endpoint.
 */
export function getAllCapabilityRecords() {
  ensureAllProvidersInitialized();
  return capabilityTracker.getAllStatuses().filter(
    (record) => record.providerId !== 'mock' || areTestProvidersEnabled(),
  );
}

export async function closeProviders(): Promise<void> {
  await Promise.all(providers.map((provider) => provider.close?.()));
}

export {
  mockProvider,
  chatGptBrowserProvider,
  arenaBrowserProvider,
  deepSeekBrowserProvider,
  zaiBrowserProvider,
  minimaxBrowserProvider,
  kimiBrowserProvider,
  qwenBrowserProvider,
  grokBrowserProvider,
  mistralBrowserProvider,
  claudeBrowserProvider,
  metaBrowserProvider,
  capabilityTracker,
};
