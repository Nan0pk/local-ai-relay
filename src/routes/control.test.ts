import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../server.js';
import { browserExtensionBridge } from '../extension/browser-bridge.js';
import { harnessTokens } from '../auth/harness-tokens.js';

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

    const pairResponse = await app.inject({
      method: 'POST',
      url: '/v1/control/browser-pair',
      headers: { authorization: 'Bearer control-test-token' },
    });
    assert.equal(pairResponse.statusCode, 200);
    const pair = pairResponse.json();
    assert.match(pair.token, /^lar_browser-extension_/);

    const extensionHeaders = {
      authorization: `Bearer ${pair.token}`,
      origin: 'chrome-extension://unpacked-extension-id',
      'content-type': 'application/json',
    };
    const register = await app.inject({
      method: 'POST',
      url: '/v1/control/browser-extension/register',
      headers: extensionHeaders,
      payload: { session_id: 'chrome-control-test' },
    });
    assert.equal(register.statusCode, 200);
    assert.equal(register.headers['access-control-allow-origin'], extensionHeaders.origin);

    const forbidden = await app.inject({
      method: 'GET',
      url: '/v1/control/overview',
      headers: extensionHeaders,
    });
    assert.equal(forbidden.statusCode, 403);
    assert.equal(forbidden.json().error.code, 'cors_blocked');
    const scopedForbidden = await app.inject({
      method: 'GET',
      url: '/v1/control/overview',
      headers: { authorization: `Bearer ${pair.token}` },
    });
    assert.equal(scopedForbidden.statusCode, 403);
    assert.equal(scopedForbidden.json().error.code, 'insufficient_scope');

    const complete = await app.inject({
      method: 'POST',
      url: '/v1/control/browser-pair-complete',
      headers: { authorization: 'Bearer control-test-token' },
      payload: { token_id: pair.token_id },
    });
    assert.equal(complete.statusCode, 200);
    const pairedOverview = await app.inject({
      method: 'GET',
      url: '/v1/control/overview',
      headers: { authorization: 'Bearer control-test-token' },
    });
    assert.equal(pairedOverview.json().browser_bridge.mode, 'existing_browser');

    const disconnect = await app.inject({
      method: 'POST',
      url: '/v1/control/browser-disconnect',
      headers: { authorization: 'Bearer control-test-token' },
    });
    assert.equal(disconnect.statusCode, 200);
    const revokedRegister = await app.inject({
      method: 'POST',
      url: '/v1/control/browser-extension/register',
      headers: extensionHeaders,
      payload: { session_id: 'chrome-control-test' },
    });
    assert.equal(revokedRegister.statusCode, 401);

    const doctor = await app.inject({
      method: 'GET',
      url: '/v1/control/doctor',
      headers: { authorization: 'Bearer control-test-token' },
    });
    assert.equal(doctor.statusCode, 200);
    assert.ok(doctor.json().checks.some((check: { id: string }) => check.id === 'relay'));
    assert.equal(typeof doctor.json().diagnosticsDirectory, 'string');
  } finally {
    browserExtensionBridge.reset();
    await harnessTokens.revokeHarness('browser-extension');
    await app.close();
    if (previous === undefined) delete process.env.RELAY_API_TOKEN;
    else process.env.RELAY_API_TOKEN = previous;
  }
});
