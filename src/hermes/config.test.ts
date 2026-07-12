import assert from 'node:assert/strict';
import test from 'node:test';
import { upsertHermesRelayConfig } from './config.js';

test('registers a named provider visible to Hermes /model', () => {
  const config = upsertHermesRelayConfig({ terminal: { backend: 'local' } }, 'http://127.0.0.1:8788/v1');
  assert.deepEqual(config, {
    terminal: { backend: 'local' },
    custom_providers: [{
      name: 'local-ai-relay',
      base_url: 'http://127.0.0.1:8788/v1',
      model: 'browser-chatgpt-free',
      api_mode: 'chat_completions',
      models: { 'browser-chatgpt-free': {} },
    }],
    model: {
      provider: 'custom:local-ai-relay',
      default: 'browser-chatgpt-free',
      base_url: 'http://127.0.0.1:8788/v1',
      api_mode: 'chat_completions',
    },
  });
});

test('updates its entry without deleting other providers or settings', () => {
  const config = upsertHermesRelayConfig({
    model: { temperature: 0.2 },
    custom_providers: [
      { name: 'other', base_url: 'http://other/v1' },
      { name: 'local-ai-relay', base_url: 'http://old/v1', extra_body: { keep: true } },
    ],
  }, 'http://127.0.0.1:8789/v1');
  assert.equal((config.model as Record<string, unknown>).temperature, 0.2);
  const providers = config.custom_providers as Array<Record<string, unknown>>;
  assert.equal(providers.length, 2);
  assert.equal(providers[0]?.name, 'other');
  assert.equal(providers[1]?.base_url, 'http://127.0.0.1:8789/v1');
  assert.deepEqual(providers[1]?.extra_body, { keep: true });
});
