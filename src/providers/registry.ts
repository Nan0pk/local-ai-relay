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

const mockProvider = new MockProvider();

/** Registered providers, in registration order. */
const providers: Provider[] = [mockProvider];

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

export { mockProvider };
