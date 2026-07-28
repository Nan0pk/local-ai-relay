import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('production inventory and API never expose the test mock provider', async () => {
  const previousTestProviders = process.env.RELAY_ENABLE_TEST_PROVIDERS;
  const previousMockBrowser = process.env.RELAY_MOCK_BROWSER;
  const previousEvidence = process.env.RELAY_CAPABILITY_STORE;
  const previousToken = process.env.RELAY_API_TOKEN;
  delete process.env.RELAY_ENABLE_TEST_PROVIDERS;
  delete process.env.RELAY_MOCK_BROWSER;
  process.env.RELAY_CAPABILITY_STORE = join(
    await mkdtemp(join(tmpdir(), 'relay-production-safety-')),
    'capabilities.json',
  );
  process.env.RELAY_API_TOKEN = 'production-safety-token';
  try {
    const { areTestProvidersEnabled, listAllModels } = await import('./providers/registry.js');
    const { buildApp } = await import('./server.js');
    const { HarnessManager } = await import('./harness/manager.js');
    const { HarnessTokenRegistry } = await import('./auth/harness-tokens.js');
    assert.equal(areTestProvidersEnabled(), false);
    assert.ok(listAllModels().length > 0);
    assert.ok(listAllModels().every((model) => !model.id.startsWith('mock-')));

    const managerRoot = await mkdtemp(join(tmpdir(), 'relay-production-harness-'));
    const manager = new HarnessManager(
      join(managerRoot, 'ledger.json'),
      new HarnessTokenRegistry(join(managerRoot, 'tokens.json')),
    );
    await assert.rejects(
      manager.connect('generic', 'http://127.0.0.1:8787/v1'),
      /Connect and verify at least one real provider/,
    );

    const app = buildApp({
      host: '127.0.0.1',
      port: 8787,
      logLevel: 'silent',
      defaultModel: 'relay-auto',
    });
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/models?include=all',
        headers: { authorization: 'Bearer production-safety-token' },
      });
      assert.equal(response.statusCode, 200);
      assert.ok(response.json().data.every((model: { id: string }) => !model.id.startsWith('mock-')));

      const completion = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: { authorization: 'Bearer production-safety-token' },
        payload: {
          model: 'mock-gpt-4o-mini',
          messages: [{ role: 'user', content: 'This must never reach a mock.' }],
        },
      });
      assert.equal(completion.statusCode, 404);
    } finally {
      await app.close();
    }
  } finally {
    if (previousTestProviders === undefined) delete process.env.RELAY_ENABLE_TEST_PROVIDERS;
    else process.env.RELAY_ENABLE_TEST_PROVIDERS = previousTestProviders;
    if (previousMockBrowser === undefined) delete process.env.RELAY_MOCK_BROWSER;
    else process.env.RELAY_MOCK_BROWSER = previousMockBrowser;
    if (previousEvidence === undefined) delete process.env.RELAY_CAPABILITY_STORE;
    else process.env.RELAY_CAPABILITY_STORE = previousEvidence;
    if (previousToken === undefined) delete process.env.RELAY_API_TOKEN;
    else process.env.RELAY_API_TOKEN = previousToken;
  }
});
