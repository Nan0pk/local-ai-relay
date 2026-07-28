import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { capabilityTracker } from '../capabilities/tracker.js';
import { RoutingManager } from './routing.js';

test('routing persists policy, selects allowed ready providers, and offers failovers', async () => {
  const previousMock = process.env.RELAY_MOCK_BROWSER;
  process.env.RELAY_MOCK_BROWSER = 'true';
  try {
    capabilityTracker.setStatus('browser-chatgpt', 'ready', undefined, 'Routing test.');
    capabilityTracker.setStatus('browser-claude', 'ready', undefined, 'Routing test.');
    const root = await mkdtemp(join(tmpdir(), 'relay-routing-'));
    const path = join(root, 'routing.json');
    const manager = new RoutingManager(path);
    await manager.update({
      mode: 'priority',
      preset: 'reliable',
      selectedProviders: ['browser-chatgpt', 'browser-claude'],
      priorityProviders: ['browser-claude', 'browser-chatgpt'],
      manualModel: 'browser-claude-free',
      allowFallbacks: true,
    });

    const primary = manager.resolve('relay-auto');
    assert.equal(primary?.providerId, 'browser-claude');
    assert.equal(manager.fallbacks(primary!)[0]?.providerId, 'browser-chatgpt');
    await manager.update({ mode: 'automatic' });
    manager.recordAttempt('browser-claude', 800, false);
    manager.recordAttempt('browser-chatgpt', 200, true);
    assert.equal(manager.resolve('relay-auto')?.providerId, 'browser-chatgpt');

    const restored = new RoutingManager(path).getConfig();
    assert.equal(restored.mode, 'automatic');
    assert.deepEqual(restored.priorityProviders, ['browser-claude', 'browser-chatgpt']);
  } finally {
    if (previousMock === undefined) delete process.env.RELAY_MOCK_BROWSER;
    else process.env.RELAY_MOCK_BROWSER = previousMock;
  }
});

test('routing rejects providers and models that are not registered', async () => {
  const root = await mkdtemp(join(tmpdir(), 'relay-routing-invalid-'));
  const manager = new RoutingManager(join(root, 'routing.json'));
  await assert.rejects(
    manager.update({ selectedProviders: ['browser-not-real'] }),
    /Unknown provider/,
  );
  await assert.rejects(
    manager.update({ manualModel: 'model-not-real' }),
    /Unknown manual model/,
  );
});
