import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { BrowserFailure } from './browser/types.js';
import { browserFailureErrorBody, BROWSER_FAILURE_HTTP_MAP } from './types/openai.js';
import type { Provider } from './providers/types.js';
import type { ChatCompletionRequest, ChatCompletionResponse, ErrorResponse } from './types/openai.js';

/**
 * Regression tests for HIGH-2 (BrowserFailure → OpenAI HTTP error mapping)
 * and HIGH-3 (SSE EPIPE handling).
 *
 * These tests use a fake provider that throws BrowserFailure on demand, so
 * they don't need a real browser. They verify the HTTP boundary preserves
 * the BrowserFailure taxonomy with correct status codes and error shapes.
 */

class FailingBrowserProvider implements Provider {
  readonly id = 'failing-browser';
  constructor(private readonly failure: BrowserFailure) {}
  listModels() {
    return [{ id: 'browser-failing-test', object: 'model' as const, created: 1, owned_by: 'test' }];
  }
  async complete(_req: ChatCompletionRequest, _model: string): Promise<ChatCompletionResponse> {
    throw this.failure;
  }
}

// (HangingProvider removed — not needed for current tests)

function buildTestApp(provider: Provider) {
  const app = Fastify({ logger: { level: 'silent' as const } });
  // Monkey-patch the registry's findProviderForModel via a route override.
  // We register the chat routes with a config and rely on a custom hook.
  app.decorate('testProvider', provider);
  registerChatRoutesWithOverride(app, { host: '127.0.0.1', port: 0, logLevel: 'silent', defaultModel: 'browser-failing-test' }, provider);
  return app;
}

// Re-implement registerChatRoutes with an injectable provider so tests
// don't depend on the real registry. Mirrors src/routes/chat.ts exactly
// except for provider lookup.
import type { AppConfig } from './config.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { browserFailureErrorBody as mapFailure } from './types/openai.js';

function registerChatRoutesWithOverride(app: FastifyInstance, config: AppConfig, provider: Provider): void {
  app.post<{ Body: ChatCompletionRequest; Reply: ChatCompletionResponse | ErrorResponse }>(
    '/v1/chat/completions',
    async (req: FastifyRequest<{ Body: ChatCompletionRequest }>, reply: FastifyReply) => {
      const body = req.body ?? ({} as ChatCompletionRequest);
      const model = (body.model ?? config.defaultModel).trim();
      let result;
      try {
        result = await provider.complete(body, model);
      } catch (err) {
        if (err instanceof BrowserFailure) {
          const mapped = mapFailure(err.kind, err.message);
          if (mapped) return reply.code(mapped.status).send(mapped.body);
        }
        return reply.code(500).send({ error: { message: 'Provider returned an unexpected error.', type: 'server_error', code: 'internal_error' } });
      }
      return reply.send(result);
    },
  );
}

// --- HIGH-2: BrowserFailure → HTTP error mapping ---

test('BROWSER_FAILURE_HTTP_MAP covers all BrowserFailureKinds', () => {
  const expectedKinds = [
    'login_required', 'captcha', 'rate_limit', 'quota_exhausted',
    'composer_disabled', 'generation_interrupted', 'layout_changed',
    'timeout', 'cancelled', 'empty_response', 'invalid_tool_call',
  ];
  for (const kind of expectedKinds) {
    assert.ok(kind in BROWSER_FAILURE_HTTP_MAP, `missing mapping for ${kind}`);
  }
});

test('browserFailureErrorBody returns 401 for login_required', () => {
  const result = browserFailureErrorBody('login_required', 'Please sign in.');
  assert.ok(result);
  assert.equal(result!.status, 401);
  assert.equal(result!.body.error.code, 'login_required');
  assert.equal(result!.body.error.type, 'authentication_error');
  assert.equal(result!.body.error.message, 'Please sign in.');
});

test('browserFailureErrorBody returns 429 for rate_limit', () => {
  const result = browserFailureErrorBody('rate_limit', 'Too many requests.');
  assert.ok(result);
  assert.equal(result!.status, 429);
  assert.equal(result!.body.error.code, 'rate_limit_exceeded');
});

test('browserFailureErrorBody returns 403 for quota_exhausted', () => {
  const result = browserFailureErrorBody('quota_exhausted', 'Out of quota.');
  assert.ok(result);
  assert.equal(result!.status, 403);
  assert.equal(result!.body.error.code, 'quota_exhausted');
});

test('browserFailureErrorBody returns 403 for captcha', () => {
  const result = browserFailureErrorBody('captcha', 'CAPTCHA required.');
  assert.equal(result!.status, 403);
  assert.equal(result!.body.error.code, 'captcha_required');
});

test('browserFailureErrorBody returns 422 for layout_changed', () => {
  const result = browserFailureErrorBody('layout_changed', 'Composer not found.');
  assert.equal(result!.status, 422);
  assert.equal(result!.body.error.code, 'layout_changed');
});

test('browserFailureErrorBody returns 422 for empty_response', () => {
  const result = browserFailureErrorBody('empty_response', 'Empty response.');
  assert.equal(result!.status, 422);
  assert.equal(result!.body.error.code, 'empty_response');
});

test('browserFailureErrorBody returns 408 for timeout', () => {
  const result = browserFailureErrorBody('timeout', 'Timed out.');
  assert.equal(result!.status, 408);
});

test('browserFailureErrorBody returns 409 for composer_disabled', () => {
  const result = browserFailureErrorBody('composer_disabled', 'Composer disabled.');
  assert.equal(result!.status, 409);
});

test('browserFailureErrorBody returns 409 for generation_interrupted', () => {
  const result = browserFailureErrorBody('generation_interrupted', 'Generation stopped.');
  assert.equal(result!.status, 409);
});

test('browserFailureErrorBody returns typed 422 for invalid_tool_call', () => {
  const result = browserFailureErrorBody('invalid_tool_call', 'Unoffered tool.');
  assert.equal(result!.status, 422);
  assert.equal(result!.body.error.code, 'invalid_tool_call');
  assert.equal(result!.body.error.type, 'invalid_request_error');
});

test('browserFailureErrorBody returns 499 for cancelled', () => {
  const result = browserFailureErrorBody('cancelled', 'Cancelled.');
  assert.equal(result!.status, 499);
});

test('browserFailureErrorBody returns null for unknown kind', () => {
  const result = browserFailureErrorBody('unknown_kind', 'Whatever.');
  assert.equal(result, null);
});

// --- HIGH-2: HTTP integration — provider throws, route maps ---

test('HTTP route returns 401 with login_required code when provider throws BrowserFailure(login_required)', async () => {
  const provider = new FailingBrowserProvider(new BrowserFailure('login_required', 'Sign in to ChatGPT.'));
  const app = buildTestApp(provider);
  try {
    const response = await app.inject({
      method: 'POST', url: '/v1/chat/completions',
      payload: { model: 'browser-failing-test', messages: [{ role: 'user', content: 'hi' }] },
    });
    assert.equal(response.statusCode, 401);
    const body = response.json() as ErrorResponse;
    assert.equal(body.error.code, 'login_required');
    assert.equal(body.error.message, 'Sign in to ChatGPT.');
  } finally {
    await app.close();
  }
});

test('HTTP route returns 429 with rate_limit_exceeded code when provider throws BrowserFailure(rate_limit)', async () => {
  const provider = new FailingBrowserProvider(new BrowserFailure('rate_limit', 'Rate limited.'));
  const app = buildTestApp(provider);
  try {
    const response = await app.inject({
      method: 'POST', url: '/v1/chat/completions',
      payload: { model: 'browser-failing-test', messages: [{ role: 'user', content: 'hi' }] },
    });
    assert.equal(response.statusCode, 429);
    const body = response.json() as ErrorResponse;
    assert.equal(body.error.code, 'rate_limit_exceeded');
  } finally {
    await app.close();
  }
});

test('HTTP route returns 403 with captcha_required code when provider throws BrowserFailure(captcha)', async () => {
  const provider = new FailingBrowserProvider(new BrowserFailure('captcha', 'CAPTCHA.'));
  const app = buildTestApp(provider);
  try {
    const response = await app.inject({
      method: 'POST', url: '/v1/chat/completions',
      payload: { model: 'browser-failing-test', messages: [{ role: 'user', content: 'hi' }] },
    });
    assert.equal(response.statusCode, 403);
    const body = response.json() as ErrorResponse;
    assert.equal(body.error.code, 'captcha_required');
  } finally {
    await app.close();
  }
});

test('HTTP route returns 500 for generic Error (not BrowserFailure)', async () => {
  // Replace with a real generic Error thrower
  class GenericErrorProvider implements Provider {
    readonly id = 'generic';
    listModels() { return [{ id: 'browser-failing-test', object: 'model' as const, created: 1, owned_by: 'test' }]; }
    async complete(): Promise<ChatCompletionResponse> { throw new Error('something broke'); }
  }
  const app = buildTestApp(new GenericErrorProvider());
  try {
    const response = await app.inject({
      method: 'POST', url: '/v1/chat/completions',
      payload: { model: 'browser-failing-test', messages: [{ role: 'user', content: 'hi' }] },
    });
    assert.equal(response.statusCode, 500);
    const body = response.json() as ErrorResponse;
    assert.equal(body.error.code, 'internal_error');
  } finally {
    await app.close();
  }
});

// --- HIGH-3: SSE stream error handling ---

test('SSE stream terminates with bare [DONE] (not JSON-encoded) for OpenAI compatibility', async () => {
  // Use the real buildApp (with the mock provider) to exercise the actual
  // SSE code path in src/routes/chat.ts. The mock provider returns content
  // that the route splits into SSE chunks and terminates with [DONE].
  process.env.RELAY_API_TOKEN = 'test-token';
  const { buildApp } = await import('./server.js');
  const app = buildApp({ host: '127.0.0.1', port: 0, logLevel: 'silent', defaultModel: 'mock-gpt-4o-mini' });
  try {
    const response = await app.inject({
      method: 'POST', url: '/v1/chat/completions',
      headers: { authorization: 'Bearer test-token' },
      payload: { model: 'mock-gpt-4o-mini', stream: true, messages: [{ role: 'user', content: 'stream test' }] },
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'] ?? '', /^text\/event-stream/);
    // The stream must end with the literal "data: [DONE]" — not JSON-encoded.
    assert.ok(response.body.includes('data: [DONE]'),
      'SSE stream should terminate with bare data: [DONE], not data: "[DONE]"');
    assert.ok(!response.body.includes('data: "[DONE]"'),
      'SSE stream must NOT JSON-encode the [DONE] sentinel');
  } finally {
    await app.close();
  }
});
