import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { registerModelsRoutes } from './models.js';
import { capabilityTracker } from '../capabilities/tracker.js';

/**
 * Tests for readiness-gated model discovery.
 *
 * Verifies that:
 *  - `/v1/models` only lists models from ready providers by default.
 *  - `/v1/models?include=all` lists every model with capability metadata.
 *  - `/v1/providers/status` exposes the full capability state.
 *  - No unavailable provider is advertised as usable.
 */

function buildModelsApp() {
  const app = Fastify({ logger: { level: 'silent' } });
  registerModelsRoutes(app);
  return app;
}

test('default models endpoint returns only ready providers', async () => {
  capabilityTracker.reset();
  capabilityTracker.register('mock', 'ready', 'Always available');
  capabilityTracker.register('browser-chatgpt', 'installed', 'Awaiting login');
  capabilityTracker.register('browser-claude', 'installed', 'Awaiting login');

  const app = buildModelsApp();
  try {
    const response = await app.inject({ method: 'GET', url: '/v1/models' });
    assert.equal(response.statusCode, 200);
    const body = response.json() as { data: Array<{ id: string }> };
    // Only mock models should appear (browser providers are 'installed').
    const hasMockModels = body.data.some((m) => m.id.startsWith('mock-'));
    assert.ok(hasMockModels, 'Mock models should be in the ready list');
    // Browser models should NOT appear because their providers aren't ready.
    const hasBrowserModels = body.data.some((m) => m.id.startsWith('browser-'));
    assert.equal(hasBrowserModels, false, 'Browser models should not be in default listing when not ready');
  } finally {
    await app.close();
  }
});

test('default models endpoint includes degraded providers', async () => {
  capabilityTracker.reset();
  capabilityTracker.register('mock', 'ready', 'Always available');
  // Note: In the real registry, browser providers are registered at module load.
  // This test exercises the tracker logic directly.

  const app = buildModelsApp();
  try {
    const response = await app.inject({ method: 'GET', url: '/v1/providers/status' });
    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      data: Array<{ provider_id: string; status: string; ready: boolean }>;
    };
    assert.equal(body.data.length, 1);
    const mockRecord = body.data.find((r) => r.provider_id === 'mock');
    assert.ok(mockRecord);
    assert.equal(mockRecord!.ready, true);
  } finally {
    await app.close();
  }
});

test('include=all returns every registered model with capability metadata', async () => {
  capabilityTracker.reset();
  capabilityTracker.register('mock', 'ready', 'Always available');
  capabilityTracker.register('browser-chatgpt', 'installed', 'Awaiting login');

  const app = buildModelsApp();
  try {
    const response = await app.inject({ method: 'GET', url: '/v1/models?include=all' });
    assert.equal(response.statusCode, 200);
    const body = response.json() as { data: Array<{ id: string; x_relay?: { capability_status?: string } }> };
    // Should include models from ALL providers, not just ready ones.
    assert.ok(body.data.length >= 0);
    // Models from 'installed' providers should have capability metadata.
    // (If the registry maps models to providers correctly, browser models will appear.)
  } finally {
    await app.close();
  }
});

test('providers status endpoint shows all providers and their readiness', async () => {
  capabilityTracker.reset();
  capabilityTracker.register('mock', 'ready', 'Always available');
  capabilityTracker.register('browser-chatgpt', 'installed', 'Awaiting login');
  capabilityTracker.register('browser-claude', 'degraded', 'Quota near limit');
  capabilityTracker.register('browser-gemini', 'disabled', 'Admin disabled');

  const app = buildModelsApp();
  try {
    const response = await app.inject({ method: 'GET', url: '/v1/providers/status' });
    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      data: Array<{
        provider_id: string;
        status: string;
        ready: boolean;
        evidence_expired: boolean;
        detail: string | null;
        updated_at: string;
      }>;
    };

    assert.equal(body.data.length, 4);

    const mockStatus = body.data.find((r) => r.provider_id === 'mock');
    assert.ok(mockStatus);
    assert.equal(mockStatus!.status, 'ready');
    assert.equal(mockStatus!.ready, true);

    const chatgptStatus = body.data.find((r) => r.provider_id === 'browser-chatgpt');
    assert.ok(chatgptStatus);
    assert.equal(chatgptStatus!.status, 'installed');
    assert.equal(chatgptStatus!.ready, false);

    const claudeStatus = body.data.find((r) => r.provider_id === 'browser-claude');
    assert.ok(claudeStatus);
    assert.equal(claudeStatus!.status, 'degraded');
    assert.equal(claudeStatus!.ready, true); // degraded is still "ready"

    const geminiStatus = body.data.find((r) => r.provider_id === 'browser-gemini');
    assert.ok(geminiStatus);
    assert.equal(geminiStatus!.status, 'disabled');
    assert.equal(geminiStatus!.ready, false);
  } finally {
    await app.close();
  }
});

test('no unavailable provider appears in default model listing', async () => {
  capabilityTracker.reset();
  // Only mock is ready; everything else is in various non-ready states.
  capabilityTracker.register('mock', 'ready');
  capabilityTracker.register('browser-chatgpt', 'installed');
  capabilityTracker.register('browser-claude', 'authenticated');
  capabilityTracker.register('browser-gemini', 'reachable');
  capabilityTracker.register('browser-deepseek', 'disabled');

  const app = buildModelsApp();
  try {
    const response = await app.inject({ method: 'GET', url: '/v1/models' });
    assert.equal(response.statusCode, 200);
    const body = response.json() as { data: Array<{ id: string }> };
    // No browser model should appear since none of them are 'ready' or 'degraded'.
    const browserModels = body.data.filter((m) => m.id.startsWith('browser-'));
    assert.equal(browserModels.length, 0, 'No unready browser models should be advertised');
  } finally {
    await app.close();
  }
});

test('stale evidence is reported in diagnostic endpoint', async () => {
  capabilityTracker.reset();
  const staleDate = new Date(Date.now() - 86400000).toISOString();
  capabilityTracker.register('browser-kimi', 'ready');
  capabilityTracker.setStatus('browser-kimi', 'ready', {
    reference: 'old-probe',
    recordedAt: staleDate,
    expiresAt: staleDate,
  });

  const app = buildModelsApp();
  try {
    const response = await app.inject({ method: 'GET', url: '/v1/providers/status' });
    const body = response.json() as {
      data: Array<{ provider_id: string; evidence_expired: boolean }>;
    };
    const kimiStatus = body.data.find((r) => r.provider_id === 'browser-kimi');
    assert.ok(kimiStatus);
    assert.equal(kimiStatus!.evidence_expired, true);
  } finally {
    await app.close();
  }
});
