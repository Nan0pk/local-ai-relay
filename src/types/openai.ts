/**
 * Minimal OpenAI-compatible type surface.
 *
 * Only the subset required for milestone 1 (mock provider) is modeled.
 * Streaming and tool-calling shapes will be added in later milestones.
 */

export interface ChatRoleMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ChatToolCall[];
}

export interface ChatToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
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
  tools?: ChatToolDefinition[];
  tool_choice?: 'auto' | 'none' | 'required' | Record<string, unknown>;
}

export interface ChatCompletionChoice {
  index: number;
  message: { role: 'assistant'; content: string | null; tool_calls?: ChatToolCall[] };
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

/**
 * Maps a BrowserFailureKind to an OpenAI-shaped HTTP error response.
 *
 * The relay preserves the BrowserFailure taxonomy at the HTTP boundary so
 * OpenAI-compatible clients (including Hermes and generic harnesses) can
 * distinguish failure modes and decide whether to retry, prompt the user to
 * sign in, or surface a quota message.
 *
 * HTTP status follows OpenAI conventions:
 *  - 401 for auth-required failures (login_required)
 *  - 403 for provider-side access control (captcha, quota_exhausted)
 *  - 429 for rate-limit failures (rate_limit)
 *  - 409 for transient state conflicts (composer_disabled, generation_interrupted)
 *  - 422 for unprocessable page state (layout_changed, empty_response)
 *  - 408 for timeouts (timeout)
 *  - 499 for client cancellation (cancelled)
 *  - 500 for anything else (internal_error)
 */
export const BROWSER_FAILURE_HTTP_MAP: Record<string, {
  status: number;
  type: string;
  code: string;
}> = {
  login_required:        { status: 401, type: 'authentication_error',  code: 'login_required' },
  captcha:               { status: 403, type: 'permission_denied',     code: 'captcha_required' },
  rate_limit:            { status: 429, type: 'rate_limit_error',      code: 'rate_limit_exceeded' },
  quota_exhausted:       { status: 403, type: 'permission_denied',     code: 'quota_exhausted' },
  composer_disabled:     { status: 409, type: 'conflict',              code: 'composer_disabled' },
  generation_interrupted:{ status: 409, type: 'conflict',              code: 'generation_interrupted' },
  layout_changed:        { status: 422, type: 'unprocessable_entity',  code: 'layout_changed' },
  empty_response:        { status: 422, type: 'unprocessable_entity',  code: 'empty_response' },
  timeout:               { status: 408, type: 'request_timeout',       code: 'browser_timeout' },
  cancelled:             { status: 499, type: 'client_closed_request', code: 'cancelled' },
  invalid_tool_call:     { status: 422, type: 'invalid_request_error', code: 'invalid_tool_call' },
};

/** OpenAI error body for a BrowserFailureKind, or null if kind is unknown. */
export function browserFailureErrorBody(kind: string, message: string): { status: number; body: ErrorResponse } | null {
  const mapping = BROWSER_FAILURE_HTTP_MAP[kind];
  if (!mapping) return null;
  return {
    status: mapping.status,
    body: { error: { message, type: mapping.type, param: null, code: mapping.code } },
  };
}
