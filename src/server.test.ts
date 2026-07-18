import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from './server.js';

process.env.RELAY_API_TOKEN = 'test-token';

test('models endpoint advertises the browser batch transport', async () => {
  // Enable mock browser so browser providers are marked as ready.
  const original = process.env.RELAY_MOCK_BROWSER;
  process.env.RELAY_MOCK_BROWSER = 'true';

  // Re-import to pick up the env change (capability tracking initializes at import time).
  // We need to use dynamic import to get fresh capability state.
  const { capabilityTracker } = await import('./capabilities/tracker.js');
  // Manually mark browser providers as ready for this test.
  for (const id of [
    'browser-chatgpt', 'browser-gemini', 'browser-arena',
    'browser-deepseek', 'browser-zai', 'browser-minimax',
    'browser-kimi', 'browser-qwen', 'browser-grok',
    'browser-mistral', 'browser-claude', 'browser-meta',
  ]) {
    capabilityTracker.setStatus(id, 'ready', undefined, 'Test environment');
  }

  const app = buildApp({
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
    defaultModel: 'mock-gpt-4o-mini',
  });

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/models',
      headers: { authorization: 'Bearer test-token' }
    });
    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      data: Array<{ id: string; x_relay?: { execution_style: string } }>;
    };
    const model = body.data.find((candidate) => candidate.id === 'browser-chatgpt-free');
    assert.equal(model?.x_relay?.execution_style, 'batch');
  } finally {
    await app.close();
    // Restore env
    if (original === undefined) {
      delete process.env.RELAY_MOCK_BROWSER;
    } else {
      process.env.RELAY_MOCK_BROWSER = original;
    }
  }
});

test('streaming chat completions use OpenAI-compatible SSE', async () => {
  const app = buildApp({ host: '127.0.0.1', port: 0, logLevel: 'silent', defaultModel: 'mock-gpt-4o-mini' });
  try {
    const response = await app.inject({
      method: 'POST', url: '/v1/chat/completions',
      headers: { authorization: 'Bearer test-token' },
      payload: { model: 'mock-gpt-4o-mini', stream: true, messages: [{ role: 'user', content: 'Hermes stream check' }] },
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'] ?? '', /^text\/event-stream/);
    const events = response.body.trim().split('\n\n');
    assert.equal(events.at(-1), 'data: [DONE]');
    const chunks = events.slice(0, -1).map((event) =>
      JSON.parse(event.slice('data: '.length)),
    );
    assert.equal(chunks[0].object, 'chat.completion.chunk');
    const streamedContent = chunks
      .map((chunk) => chunk.choices[0].delta.content ?? '')
      .join('');
    assert.match(streamedContent, /Hermes stream check/);
    assert.equal(chunks.at(-1).choices[0].finish_reason, 'stop');
  } finally {
    await app.close();
  }
});
