import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { BrowserFailure } from '../browser/types.js';
import { loadPersistedCapability } from './evidence-store.js';
import { recordProviderFailure, recordSuccessfulProviderUse } from './runtime-evidence.js';
import { capabilityTracker } from './tracker.js';

test('real success refresh is throttled and classified failures invalidate readiness', async () => {
  const previousTestProviders = process.env.RELAY_ENABLE_TEST_PROVIDERS;
  const previousMockBrowser = process.env.RELAY_MOCK_BROWSER;
  const previousStore = process.env.RELAY_CAPABILITY_STORE;
  delete process.env.RELAY_ENABLE_TEST_PROVIDERS;
  delete process.env.RELAY_MOCK_BROWSER;
  process.env.RELAY_CAPABILITY_STORE = join(
    await mkdtemp(join(tmpdir(), 'relay-runtime-evidence-')),
    'capabilities.json',
  );
  capabilityTracker.reset();
  const providerId = 'browser-chatgpt';
  capabilityTracker.register(providerId);
  try {
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    capabilityTracker.setStatus(providerId, 'ready', {
      reference: 'recent',
      recordedAt: recent,
      expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await recordSuccessfulProviderUse(providerId);
    assert.equal(loadPersistedCapability(providerId), undefined);

    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    capabilityTracker.setStatus(providerId, 'ready', {
      reference: 'old',
      recordedAt: old,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await recordSuccessfulProviderUse(providerId);
    assert.match(loadPersistedCapability(providerId)?.evidence?.reference ?? '', /^successful-request:/);

    await recordProviderFailure(
      providerId,
      new BrowserFailure('rate_limit', 'The provider is rate limited.'),
    );
    assert.equal(loadPersistedCapability(providerId), undefined);
    assert.equal(capabilityTracker.getStatus(providerId)?.status, 'installed');
    assert.match(capabilityTracker.getStatus(providerId)?.detail ?? '', /Wait for the provider limit/);
  } finally {
    capabilityTracker.reset();
    if (previousTestProviders === undefined) delete process.env.RELAY_ENABLE_TEST_PROVIDERS;
    else process.env.RELAY_ENABLE_TEST_PROVIDERS = previousTestProviders;
    if (previousMockBrowser === undefined) delete process.env.RELAY_MOCK_BROWSER;
    else process.env.RELAY_MOCK_BROWSER = previousMockBrowser;
    if (previousStore === undefined) delete process.env.RELAY_CAPABILITY_STORE;
    else process.env.RELAY_CAPABILITY_STORE = previousStore;
  }
});
