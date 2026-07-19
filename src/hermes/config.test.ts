import assert from 'node:assert/strict';
import test from 'node:test';
import { upsertHermesRelayConfig } from './config.js';

test('registers a named provider visible to Hermes /model', () => {
  const config = upsertHermesRelayConfig(
    { terminal: { backend: 'local' } },
    'http://127.0.0.1:8788/v1',
    'token',
    ['browser-chatgpt-free'],
  );
  assert.deepEqual(config, {
    terminal: { backend: 'local' },
    custom_providers: [{
      name: 'local-ai-relay',
      base_url: 'http://127.0.0.1:8788/v1',
      api_key: 'token',
      model: 'browser-chatgpt-free',
      api_mode: 'codex_responses',
      models: { 'browser-chatgpt-free': {} },
    }],
    model: {
      provider: 'custom:local-ai-relay',
      default: 'browser-chatgpt-free',
      base_url: 'http://127.0.0.1:8788/v1',
      api_key: 'token',
      api_mode: 'codex_responses',
    },
  });
});

test('updates its entry without deleting other providers or settings', () => {
  const config = upsertHermesRelayConfig({
    model: { temperature: 0.2 },
    custom_providers: [
      { name: 'other', base_url: 'http://other/v1' },
      {
        name: 'local-ai-relay',
        base_url: 'http://old/v1',
        extra_body: { keep: true },
        models: { 'browser-chatgpt-free': { context_length: 1234 } },
      },
    ],
  }, 'http://127.0.0.1:8789/v1', 'new-token', ['browser-chatgpt-free']);
  assert.equal((config.model as Record<string, unknown>).temperature, 0.2);
  const providers = config.custom_providers as Array<Record<string, unknown>>;
  assert.equal(providers.length, 2);
  assert.equal(providers[0]?.name, 'other');
  assert.equal(providers[1]?.base_url, 'http://127.0.0.1:8789/v1');
  assert.deepEqual(providers[1]?.extra_body, { keep: true });
  assert.deepEqual(
    (providers[1]?.models as Record<string, unknown>)['browser-chatgpt-free'],
    { context_length: 1234 },
  );
});

test('registers every model and selects requested default', () => {
  const config = upsertHermesRelayConfig(
    {},
    'http://127.0.0.1:8790/v1',
    'token',
    ['mock-gpt-4o-mini', 'browser-chatgpt-free', 'browser-claude-free'],
    'browser-chatgpt-free',
  );
  const provider = (config.custom_providers as Array<Record<string, unknown>>)[0]!;
  assert.equal(provider.model, 'browser-chatgpt-free');
  const models = provider.models as Record<string, unknown>;
  assert.deepEqual(Object.keys(models), ['mock-gpt-4o-mini', 'browser-chatgpt-free', 'browser-claude-free']);
  assert.equal((config.model as Record<string, unknown>).default, 'browser-chatgpt-free');
});

test('additional model ids are de-duplicated and never replace the default', () => {
  const config = upsertHermesRelayConfig({}, 'http://127.0.0.1:8791/v1', 'token', [
    'browser-chatgpt-free',
    'browser-claude-free',
    'browser-claude-free',
  ]);
  const provider = (config.custom_providers as Array<Record<string, unknown>>)[0]!;
  const models = provider.models as Record<string, unknown>;
  assert.deepEqual(Object.keys(models), ['browser-chatgpt-free', 'browser-claude-free']);
});
