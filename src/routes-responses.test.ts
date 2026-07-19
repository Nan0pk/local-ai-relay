import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from './server.js';

const token = 'responses-test-token';
const headers = { authorization: `Bearer ${token}` };

test('Responses API maps text input onto existing providers', async () => {
  process.env.RELAY_API_TOKEN = token;
  const app = buildApp({ host: '127.0.0.1', port: 8787, logLevel: 'silent', defaultModel: 'mock-gpt-4o-mini' });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers,
      payload: { model: 'mock-gpt-4o-mini', input: 'v2 transport check' },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.object, 'response');
    assert.equal(body.status, 'completed');
    assert.equal(body.model, 'mock-gpt-4o-mini');
    assert.match(body.output_text, /v2 transport check/);
    assert.equal(body.output[0].type, 'message');
  } finally {
    await app.close();
    delete process.env.RELAY_API_TOKEN;
  }
});

test('Responses API emits standard SSE event sequence', async () => {
  process.env.RELAY_API_TOKEN = token;
  const app = buildApp({ host: '127.0.0.1', port: 8787, logLevel: 'silent', defaultModel: 'mock-gpt-4o-mini' });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers,
      payload: { model: 'mock-gpt-4o-mini', input: 'stream check', stream: true },
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /event: response\.created/);
    assert.match(response.body, /event: response\.output_text\.delta/);
    assert.match(response.body, /event: response\.completed/);
  } finally {
    await app.close();
    delete process.env.RELAY_API_TOKEN;
  }
});

test('Responses API rejects media instead of silently dropping it', async () => {
  process.env.RELAY_API_TOKEN = token;
  const app = buildApp({ host: '127.0.0.1', port: 8787, logLevel: 'silent', defaultModel: 'mock-gpt-4o-mini' });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers,
      payload: {
        model: 'mock-gpt-4o-mini',
        input: [{ role: 'user', content: [{ type: 'input_image', image_url: 'data:image/png;base64,AA==' }] }],
      },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, 'unsupported_input');
  } finally {
    await app.close();
    delete process.env.RELAY_API_TOKEN;
  }
});
