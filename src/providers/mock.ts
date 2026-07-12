/**
 * Mock provider.
 *
 * Returns deterministic, OpenAI-shaped responses. Used to bootstrap the
 * relay before any real provider is wired in. No network calls, no
 * secrets, no provider-bypass logic.
 *
 * Token counts are estimated from whitespace-split word counts so the
 * response shape matches what real providers return. This is a rough
 * heuristic and will be replaced with a proper tokenizer when the first
 * real provider lands.
 */

import type { Provider } from './types.js';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ModelCard,
} from '../types/openai.js';

const MOCK_MODELS: readonly ModelCard[] = [
  {
    id: 'mock-gpt-4o-mini',
    object: 'model',
    created: 1_715_000_000,
    owned_by: 'local-ai-relay',
  },
  {
    id: 'mock-gpt-4o',
    object: 'model',
    created: 1_715_000_000,
    owned_by: 'local-ai-relay',
  },
] as const;

function estimateTokens(text: string): number {
  if (!text) return 0;
  // ~1.3 tokens per whitespace-separated word — crude but stable.
  return Math.max(1, Math.round(text.trim().split(/\s+/).length * 1.3));
}

function lastUserMessage(req: ChatCompletionRequest): string {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    const m = req.messages[i];
    if (m && m.role === 'user') return m.content ?? '';
  }
  return '';
}

function makeId(): string {
  return 'chatcmpl-' + Math.random().toString(36).slice(2, 12);
}

export class MockProvider implements Provider {
  readonly id = 'mock';

  listModels(): ModelCard[] {
    return MOCK_MODELS.map((m) => ({ ...m }));
  }

  async complete(
    req: ChatCompletionRequest,
    model: string,
  ): Promise<ChatCompletionResponse> {
    const prompt = lastUserMessage(req);
    const completionText =
      `[mock] Echoing last user message (${prompt.length} chars): ` +
      `"${prompt.length > 200 ? prompt.slice(0, 200) + '…' : prompt}". ` +
      `Model=${model}. This is a deterministic mock response from local-ai-relay.`;

    const promptTokens = estimateTokens(
      req.messages.map((m) => m.content ?? '').join('\n'),
    );
    const completionTokens = estimateTokens(completionText);

    return {
      id: makeId(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: completionText },
          finish_reason: 'stop',
          logprobs: null,
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    };
  }
}
