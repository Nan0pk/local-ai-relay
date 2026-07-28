import assert from 'node:assert/strict';
import test from 'node:test';
import { createDaemonClient } from './daemon-client.js';

test('daemon client uses implemented v1 routes and forwards bearer auth', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/v1/providers/status')) {
      return Response.json({
        object: 'list',
        data: [{ provider_id: 'browser-chatgpt', status: 'installed' }],
      });
    }
    return Response.json({ object: 'list', data: [] });
  };
  const client = createDaemonClient('http://127.0.0.1:8787/', 'secret-token', fakeFetch);

  assert.deepEqual(
    await client.getProviderStatus('browser-chatgpt'),
    { provider_id: 'browser-chatgpt', status: 'installed' },
  );
  await client.listModels(true);
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      'http://127.0.0.1:8787/v1/providers/status',
      'http://127.0.0.1:8787/v1/models?include=all',
    ],
  );
  assert.equal((calls[0]?.init?.headers as Record<string, string>).Authorization, 'Bearer secret-token');
  assert.equal(calls[0]?.init?.redirect, 'error');
  await assert.rejects(() => client.getProviderStatus('missing'), /Unknown provider/);
});

test('daemon client rejects non-loopback and ambiguous destinations before fetching', () => {
  let called = false;
  const fakeFetch: typeof fetch = async () => {
    called = true;
    return Response.json({});
  };

  for (const url of [
    'https://example.com',
    'http://localhost:8787',
    'http://0.0.0.0:8787',
    'http://user:pass@127.0.0.1:8787',
    'http://127.0.0.1:8787/proxy',
  ]) {
    assert.throws(
      () => createDaemonClient(url, 'must-not-leak', fakeFetch),
      /Relay URL must/,
    );
  }
  assert.equal(called, false);
});
