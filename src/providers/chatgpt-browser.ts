import type { BrowserChatDriver } from '../browser/types.js';
import { ChatGptPlaywrightDriver } from '../browser/chatgpt-driver.js';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ModelCard,
} from '../types/openai.js';
import type { Provider, ProviderRequestContext } from './types.js';
import { ConversationPlanner } from './conversation-planner.js';

const MODEL_ID = 'browser-chatgpt-free';

function estimateTokens(text: string): number {
  if (!text.trim()) return 0;
  return Math.max(1, Math.round(text.trim().split(/\s+/).length * 1.3));
}

export class ChatGptBrowserProvider implements Provider {
  readonly id = 'browser-chatgpt';
  private readonly planner = new ConversationPlanner();

  constructor(private readonly driver: BrowserChatDriver = new ChatGptPlaywrightDriver()) {}

  listModels(): ModelCard[] {
    return [{
      id: MODEL_ID,
      object: 'model',
      created: 1_752_192_000,
      owned_by: 'local-ai-relay',
      x_relay: {
        transport: 'browser',
        execution_style: 'batch',
        supports_sessions: true,
        supports_streaming: false,
        max_parallel_requests: 1,
      },
    }];
  }

  async complete(
    req: ChatCompletionRequest,
    model: string,
    context: ProviderRequestContext = {},
  ): Promise<ChatCompletionResponse> {
    const plan = this.planner.plan(req.messages, context.sessionId);
    const result = await this.driver.send({
      prompt: plan.prompt,
      resetSession: plan.resetSession,
      ...(context.sessionId ? { sessionId: context.sessionId } : {}),
      ...(context.signal ? { signal: context.signal } : {}),
    });
    plan.remember(result.text);

    const promptTokens = estimateTokens(plan.prompt);
    const completionTokens = estimateTokens(result.text);
    return {
      id: `chatcmpl-browser-${crypto.randomUUID()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: result.text },
        finish_reason: 'stop',
        logprobs: null,
      }],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    };
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}
