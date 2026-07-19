import assert from 'node:assert/strict';
import test from 'node:test';
import { upsertOpenCodeRelayConfig } from './config.js';

test('populates all OpenCode models without replacing unrelated config', () => {
  const result = upsertOpenCodeRelayConfig(
    {
      theme: 'system',
      provider: {
        other: { npm: 'other' },
        'local-ai-relay': {
          models: { 'mock-gpt-4o-mini': { limit: { context: 8192 } } },
        },
      },
    },
    'http://127.0.0.1:8787/v1',
    'token',
    [
      { id: 'mock-gpt-4o-mini', status: 'ready' },
      { id: 'browser-claude-free', status: 'installed' },
    ],
  );
  assert.equal(result.theme, 'system');
  const providers = result.provider as Record<string, Record<string, unknown>>;
  assert.deepEqual(providers.other, { npm: 'other' });
  assert.equal(providers['local-ai-relay']?.npm, '@ai-sdk/openai');
  assert.deepEqual(providers['local-ai-relay']?.models, {
    'mock-gpt-4o-mini': { limit: { context: 8192 }, name: 'mock-gpt-4o-mini' },
    'browser-claude-free': { name: 'browser-claude-free (installed)' },
  });
});
