import type { BrowserChatDriver } from '../browser/types.js';
import { QwenPlaywrightDriver } from '../browser/qwen-driver.js';
import type { ChatCompletionRequest, ChatCompletionResponse, ModelCard } from '../types/openai.js';
import type { Provider, ProviderRequestContext } from './types.js';
import { ConversationPlanner } from './conversation-planner.js';
import { createToolBridgeContext, parseBrowserResponse, toolInstructions } from './tool-bridge.js';

const MODEL_ID = 'browser-qwen-free';

function estimateTokens(text: string): number {
  if (!text.trim()) return 0;
  return Math.max(1, Math.round(text.trim().split(/\s+/).length * 1.3));
}

export class QwenBrowserProvider implements Provider {
  readonly id = 'browser-qwen';
  private readonly planner = new ConversationPlanner();
  constructor(private readonly driver: BrowserChatDriver = new QwenPlaywrightDriver()) {}
  listModels(): ModelCard[] {
    return [{ id: MODEL_ID, object: 'model', created: 1_752_192_000, owned_by: 'local-ai-relay',
      x_relay: { transport: 'browser', execution_style: 'batch', supports_sessions: true, supports_streaming: false, max_parallel_requests: 1 } }];
  }
  async complete(req: ChatCompletionRequest, model: string, context: ProviderRequestContext = {}): Promise<ChatCompletionResponse> {
    const plan = this.planner.plan(req.messages, context.sessionId);
    const toolBridge = createToolBridgeContext(req.tools, req.tool_choice);
    const prompt = plan.prompt + toolInstructions(toolBridge);
    const result = await this.driver.send({ prompt, resetSession: plan.resetSession, sessionId: plan.sessionId, ...(context.signal ? { signal: context.signal } : {}) });
    const parsed = parseBrowserResponse(result.text, toolBridge);
    const assistantMessage = { role: 'assistant' as const, content: parsed.content, ...(parsed.toolCalls ? { tool_calls: parsed.toolCalls } : {}) };
    plan.remember(assistantMessage);
    const promptTokens = estimateTokens(prompt);
    const completionTokens = estimateTokens(result.text);
    return { id: `chatcmpl-browser-${crypto.randomUUID()}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model,
      choices: [{ index: 0, message: assistantMessage, finish_reason: parsed.toolCalls ? 'tool_calls' : 'stop', logprobs: null }],
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens } };
  }
  async close(): Promise<void> { await this.driver.close(); }
}
