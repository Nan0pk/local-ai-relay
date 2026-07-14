/**
 * Provider registry.
 *
 * Maps model ids → providers. Milestone 1 registers only the mock
 * provider. Later milestones register real providers here; routing logic
 * stays the same.
 *
 * No fallback chains, no provider bypass: if a model isn't registered,
 * the request fails with an OpenAI-shaped 404.
 */

import type { Provider } from './types.js';
import { MockProvider } from './mock.js';
import { ChatGptBrowserProvider } from './chatgpt-browser.js';
import { GeminiBrowserProvider } from './gemini-browser.js';

const mockProvider = new MockProvider();
const chatGptBrowserProvider = new ChatGptBrowserProvider();
const geminiBrowserProvider = new GeminiBrowserProvider();

/** Registered providers, in registration order. */
const providers: Provider[] = [mockProvider, chatGptBrowserProvider, geminiBrowserProvider];

/** Map from model id → provider. */
const modelIndex = new Map<string, Provider>();
for (const p of providers) {
  for (const m of p.listModels()) {
    modelIndex.set(m.id, p);
  }
}

export function listAllModels() {
  return providers.flatMap((p) => p.listModels());
}

export function findProviderForModel(model: string): Provider | undefined {
  return modelIndex.get(model);
}

export async function closeProviders(): Promise<void> {
  await Promise.all(providers.map((provider) => provider.close?.()));
}

export { mockProvider, chatGptBrowserProvider };
