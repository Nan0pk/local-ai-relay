import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../server.js';

test('control overview is authenticated and exposes relay, provider, routing, bridge, and harness state', async () => {
  const previous = process.env.RELAY_API_TOKEN;
  process.env.RELAY_API_TOKEN = 'control-test-token';
  const app = buildApp({
    host: '127.0.0.1',
    port: 8787,
    logLevel: 'silent',
    defaultModel: 'mock-gpt-4o-mini',
  });
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/v1/control/overview' })).statusCode, 401);
    const response = await app.inject({
      method: 'GET',
      url: '/v1/control/overview',
      headers: { authorization: 'Bearer control-test-token' },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.relay.status, 'running');
    assert.equal(body.providers.length, 12);
    assert.equal(body.harnesses.length, 3);
    assert.equal(typeof body.routing.enabled, 'boolean');
    assert.equal(typeof body.browser_bridge.connected, 'boolean');
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.RELAY_API_TOKEN;
    else process.env.RELAY_API_TOKEN = previous;
  }
});
