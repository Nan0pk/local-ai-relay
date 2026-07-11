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
