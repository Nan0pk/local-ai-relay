import assert from 'node:assert/strict';
import test from 'node:test';
import { listBrowserProviders } from '../browser/driver-registry.js';
import { capabilityTracker } from '../capabilities/tracker.js';
import { ProviderActionManager } from './provider-actions.js';

test('startup discovery probes likely anonymous providers sequentially with bounded settings', async () => {
  capabilityTracker.reset();
  let active = 0;
  let maximumActive = 0;
  const calls: Array<{ provider: string; automatic?: boolean; readinessTimeoutMs?: number }> = [];
  const manager = new ProviderActionManager(async (provider, options) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    calls.push({
      provider,
      automatic: options?.automatic,
      readinessTimeoutMs: options?.readinessTimeoutMs,
    });
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;
    return { providerId: `browser-${provider}` };
  });

  const started = manager.startDiscovery();
  assert.equal(started.status, 'running');
  while (manager.discoveryStatus().status === 'running') {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }

  const expected = listBrowserProviders().filter((provider) => provider.anonymousCandidate);
  assert.deepEqual(calls.map((call) => call.provider), expected.map((provider) => provider.name));
  assert.ok(calls.every((call) => call.automatic === true));
  assert.ok(calls.every((call) => call.readinessTimeoutMs === 12_000));
  assert.equal(maximumActive, 1);
  assert.deepEqual(manager.discoveryStatus(), {
    status: 'completed',
    attempted: expected.length,
    total: expected.length,
    succeeded: expected.length,
    failed: 0,
    startedAt: manager.discoveryStatus().startedAt,
    finishedAt: manager.discoveryStatus().finishedAt,
  });
  capabilityTracker.reset();
});

test('completed startup discovery is idempotent unless a rescan is requested', async () => {
  capabilityTracker.reset();
  let calls = 0;
  const manager = new ProviderActionManager(async (provider) => {
    calls += 1;
    return { providerId: `browser-${provider}` };
  });
  manager.startDiscovery();
  while (manager.discoveryStatus().status === 'running') {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  const firstCalls = calls;
  assert.equal(manager.startDiscovery().status, 'completed');
  assert.equal(calls, firstCalls);
  assert.equal(manager.startDiscovery(true).status, 'running');
  while (manager.discoveryStatus().status === 'running') {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(calls, firstCalls * 2);
  capabilityTracker.reset();
});
