import { listReadyModels } from '../providers/registry.js';

export type ModelAlias = 'auto' | 'fast' | 'smart' | string;

export interface RouterSelection {
  selectedModel: string;
  providerId: string;
  isFallback: boolean;
  reason: string;
}

export function selectBestReadyModel(requestedAlias: ModelAlias): RouterSelection {
  const readyModels = listReadyModels();

  if (readyModels.length === 0) {
    throw new Error('No real provider is connected and ready.');
  }

  // Alias routing
  if (requestedAlias === 'auto' || requestedAlias === 'fast') {
    const chatgpt = readyModels.find((m) => m.id.includes('chatgpt'));
    if (chatgpt) {
      return { selectedModel: chatgpt.id, providerId: 'browser-chatgpt', isFallback: false, reason: 'Matched ready ChatGPT model.' };
    }
  }

  if (requestedAlias === 'smart') {
    const claude = readyModels.find((m) => m.id.includes('claude'));
    if (claude) {
      return { selectedModel: claude.id, providerId: 'browser-claude', isFallback: false, reason: 'Matched ready Claude model.' };
    }
  }

  // Direct match or first ready model
  const directMatch = readyModels.find((m) => m.id === requestedAlias);
  if (directMatch) {
    return { selectedModel: directMatch.id, providerId: directMatch.owned_by, isFallback: false, reason: 'Direct model match.' };
  }

  const selected = readyModels[0]!;
  return {
    selectedModel: selected.id,
    providerId: selected.owned_by,
    isFallback: true,
    reason: `Requested model ${requestedAlias} not ready; routed to first ready model ${selected.id}.`,
  };
}
