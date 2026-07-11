/**
 * Provider interface.
 *
 * Every provider (mock now, real LLMs later, browser-bridged chat later)
 * implements this. Milestone 1 ships only {@link MockProvider}.
 *
 * Deliberately minimal — no streaming, no tool calls yet. Those land in
 * later milestones and will extend this interface without breaking the
 * mock shape.
 */

import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ModelCard,
} from '../types/openai.js';

export interface Provider {
  /** Stable identifier used in logs and metrics. */
  readonly id: string;
  /** Models this provider can serve. */
  listModels(): ModelCard[];
  /**
   * Produce a non-streaming chat completion. Must not throw on malformed
   * input — call sites convert thrown errors to OpenAI-shaped error
   * responses.
   */
  complete(req: ChatCompletionRequest, model: string): Promise<ChatCompletionResponse>;
}
