/**
 * Minimal OpenAI-compatible type surface.
 *
 * Only the subset required for milestone 1 (mock provider) is modeled.
 * Streaming and tool-calling shapes will be added in later milestones.
 */

export interface ChatRoleMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

export interface ChatCompletionRequest {
  model?: string;
  messages: ChatRoleMessage[];
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  /** Accepted but ignored by the mock provider. */
  max_tokens?: number;
  /** Accepted but ignored by the mock provider. */
  stop?: string | string[];
  user?: string;
}

export interface ChatCompletionChoice {
  index: number;
  message: { role: 'assistant'; content: string };
  finish_reason: 'stop' | 'length' | 'tool_calls' | null;
  logprobs?: null;
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ModelCard {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  /** Relay-specific capability hints. OpenAI clients safely ignore this. */
  x_relay?: {
    transport: 'mock' | 'browser' | 'api' | 'local';
    execution_style: 'direct' | 'batch' | 'delegate';
    supports_sessions: boolean;
    supports_streaming: boolean;
    max_parallel_requests: number;
  };
}

export interface ModelListResponse {
  object: 'list';
  data: ModelCard[];
}

export interface ErrorResponse {
  error: {
    message: string;
    type: string;
    param?: string | null;
    code?: string | null;
  };
}
