import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from './server.js';

test('models endpoint advertises the browser batch transport', async () => {
  const app = buildApp({
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
    defaultModel: 'mock-gpt-4o-mini',
  });

  try {
    const response = await app.inject({ method: 'GET', url: '/v1/models' });
    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      data: Array<{ id: string; x_relay?: { execution_style: string } }>;
    };
    const model = body.data.find((candidate) => candidate.id === 'browser-chatgpt-free');
    assert.equal(model?.x_relay?.execution_style, 'batch');
  } finally {
    await app.close();
  }
});

test('streaming chat completions use OpenAI-compatible SSE', async () => {
  const app = buildApp({ host: '127.0.0.1', port: 0, logLevel: 'silent', defaultModel: 'mock-gpt-4o-mini' });
  try {
    const response = await app.inject({
      method: 'POST', url: '/v1/chat/completions',
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
