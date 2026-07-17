import assert from 'node:assert/strict';
import test from 'node:test';
import { capabilityTracker } from './tracker.js';

test('tracker starts empty and registers a provider', () => {
  capabilityTracker.reset();
  capabilityTracker.register('test-provider', 'installed', 'Just compiled');
  const status = capabilityTracker.getStatus('test-provider');
  assert.ok(status);
  assert.equal(status!.providerId, 'test-provider');
  assert.equal(status!.status, 'installed');
  assert.equal(status!.detail, 'Just compiled');
  assert.equal(status!.evidence, null);
});

test('installed provider is not ready', () => {
  capabilityTracker.reset();
  capabilityTracker.register('test-provider', 'installed');
  assert.equal(capabilityTracker.isReady('test-provider'), false);
});

test('authenticated provider is not ready', () => {
  capabilityTracker.reset();
  capabilityTracker.register('test-provider', 'authenticated');
  assert.equal(capabilityTracker.isReady('test-provider'), false);
});

test('reachable provider is not ready', () => {
  capabilityTracker.reset();
  capabilityTracker.register('test-provider', 'reachable');
  assert.equal(capabilityTracker.isReady('test-provider'), false);
});

test('ready provider is ready', () => {
  capabilityTracker.reset();
  capabilityTracker.register('test-provider', 'ready');
  assert.equal(capabilityTracker.isReady('test-provider'), true);
});

test('degraded provider is still ready (partially usable)', () => {
  capabilityTracker.reset();
  capabilityTracker.register('test-provider', 'degraded');
  assert.equal(capabilityTracker.isReady('test-provider'), true);
});

test('disabled provider is not ready', () => {
  capabilityTracker.reset();
  capabilityTracker.register('test-provider', 'disabled');
  assert.equal(capabilityTracker.isReady('test-provider'), false);
});

test('unknown provider is not ready', () => {
  capabilityTracker.reset();
  assert.equal(capabilityTracker.isReady('nonexistent'), false);
});

test('setStatus updates the provider status and records timestamp', () => {
  capabilityTracker.reset();
  capabilityTracker.register('test-provider', 'installed');
  capabilityTracker.setStatus('test-provider', 'ready', {
    reference: 'probe-abc-123',
    recordedAt: new Date().toISOString(),
  }, 'Live probe succeeded');

  const status = capabilityTracker.getStatus('test-provider');
  assert.ok(status);
  assert.equal(status!.status, 'ready');
  assert.equal(status!.evidence?.reference, 'probe-abc-123');
  assert.equal(status!.detail, 'Live probe succeeded');
  assert.ok(status!.updatedAt);
});

test('setStatus auto-registers unknown providers', () => {
  capabilityTracker.reset();
  capabilityTracker.setStatus('auto-registered', 'reachable', undefined, 'Auto');
  const status = capabilityTracker.getStatus('auto-registered');
  assert.ok(status);
  assert.equal(status!.status, 'reachable');
});

test('evidence expiration detection', () => {
  capabilityTracker.reset();
  const past = new Date(Date.now() - 86400000).toISOString(); // yesterday
  const future = new Date(Date.now() + 86400000).toISOString(); // tomorrow

  capabilityTracker.register('expired-provider', 'ready');
  capabilityTracker.setStatus('expired-provider', 'ready', {
    reference: 'old-evidence',
    recordedAt: past,
    expiresAt: past,
  });

  capabilityTracker.register('valid-provider', 'ready');
  capabilityTracker.setStatus('valid-provider', 'ready', {
    reference: 'fresh-evidence',
    recordedAt: past,
    expiresAt: future,
  });

  capabilityTracker.register('no-expiry', 'ready');
  capabilityTracker.setStatus('no-expiry', 'ready', {
    reference: 'permanent-evidence',
    recordedAt: past,
  });

  assert.equal(capabilityTracker.isEvidenceExpired('expired-provider'), true);
  assert.equal(capabilityTracker.isEvidenceExpired('valid-provider'), false);
  assert.equal(capabilityTracker.isEvidenceExpired('no-expiry'), false);
  assert.equal(capabilityTracker.isEvidenceExpired('nonexistent'), false);
});

test('getReadyProviderIds returns only ready and degraded providers', () => {
  capabilityTracker.reset();
  capabilityTracker.register('ready-one', 'ready');
  capabilityTracker.register('degraded-one', 'degraded');
  capabilityTracker.register('installed-one', 'installed');
  capabilityTracker.register('disabled-one', 'disabled');

  const readyIds = capabilityTracker.getReadyProviderIds();
  assert.ok(readyIds.includes('ready-one'));
  assert.ok(readyIds.includes('degraded-one'));
  assert.equal(readyIds.includes('installed-one'), false);
  assert.equal(readyIds.includes('disabled-one'), false);
});

test('getAllStatuses returns all registered providers', () => {
  capabilityTracker.reset();
  capabilityTracker.register('a', 'ready');
  capabilityTracker.register('b', 'installed');
  capabilityTracker.register('c', 'degraded');

  const all = capabilityTracker.getAllStatuses();
  assert.equal(all.length, 3);
  const ids = all.map((r) => r.providerId).sort();
  assert.deepEqual(ids, ['a', 'b', 'c']);
});

// --- Logged-out state simulation ---

test('logged-out browser provider stays in installed state', () => {
  capabilityTracker.reset();
  // Simulating a browser provider that was registered but never logged in.
  capabilityTracker.register('browser-chatgpt', 'installed', 'Adapter compiled; awaiting login and live verification.');

  assert.equal(capabilityTracker.isReady('browser-chatgpt'), false);
  const status = capabilityTracker.getStatus('browser-chatgpt');
  assert.equal(status!.status, 'installed');
  assert.match(status!.detail ?? '', /awaiting login/i);
});

// --- Challenge page state simulation ---

test('provider encountering a challenge page is degraded', () => {
  capabilityTracker.reset();
  capabilityTracker.register('browser-gemini', 'degraded', 'Challenge page detected — manual intervention needed.');

  assert.equal(capabilityTracker.isReady('browser-gemini'), true); // degraded is still partially usable
  const status = capabilityTracker.getStatus('browser-gemini');
  assert.equal(status!.status, 'degraded');
  assert.match(status!.detail ?? '', /challenge/i);
});

// --- Quota state simulation ---

test('provider near quota is degraded', () => {
  capabilityTracker.reset();
  capabilityTracker.register('browser-deepseek', 'degraded', 'Usage quota nearing limit.');

  assert.equal(capabilityTracker.isReady('browser-deepseek'), true);
  const status = capabilityTracker.getStatus('browser-deepseek');
  assert.equal(status!.status, 'degraded');
  assert.match(status!.detail ?? '', /quota/i);
});

// --- Disconnected state simulation ---

test('disconnected provider falls back to installed', () => {
  capabilityTracker.reset();
  // Provider was ready but the connection was lost.
  capabilityTracker.register('browser-claude', 'installed', 'Connection lost; re-verification needed.');

  assert.equal(capabilityTracker.isReady('browser-claude'), false);
  const status = capabilityTracker.getStatus('browser-claude');
  assert.equal(status!.status, 'installed');
});

// --- Stale evidence simulation ---

test('stale evidence is detected by the tracker', () => {
  capabilityTracker.reset();
  const staleDate = new Date(Date.now() - 7 * 86400000).toISOString(); // 7 days ago

  capabilityTracker.register('browser-kimi', 'ready');
  capabilityTracker.setStatus('browser-kimi', 'ready', {
    reference: 'probe-xyz-789',
    recordedAt: staleDate,
    expiresAt: staleDate, // already expired
  });

  assert.equal(capabilityTracker.isEvidenceExpired('browser-kimi'), true);
  // The provider is still marked ready, but evidence is stale.
  // Consumers should re-verify before trusting readiness.
  assert.equal(capabilityTracker.isReady('browser-kimi'), true);
});

test('reset clears all state', () => {
  capabilityTracker.register('temp', 'ready');
  capabilityTracker.reset();
  assert.equal(capabilityTracker.getStatus('temp'), undefined);
  assert.deepEqual(capabilityTracker.getAllStatuses(), []);
});
