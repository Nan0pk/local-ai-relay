import test from 'node:test';
import assert from 'node:assert/strict';
import { stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  capabilityEvidencePath,
  clearPersistedCapability,
  isEvidenceCurrent,
  loadPersistedCapability,
  persistCapability,
} from './evidence-store.js';

test('capabilityEvidencePath respects env overrides', () => {
  const custom = '/tmp/custom-capabilities.json';
  assert.equal(capabilityEvidencePath({ RELAY_CAPABILITY_STORE: custom }), custom);
});

test('isEvidenceCurrent validates ISO timestamps and expiration', () => {
  const now = Date.now();
  const past = new Date(now - 10000).toISOString();
  const future = new Date(now + 10000).toISOString();

  assert.equal(isEvidenceCurrent(null), false);
  assert.equal(isEvidenceCurrent({ reference: 'ref', recordedAt: past }), false);
  assert.equal(isEvidenceCurrent({ reference: 'ref', recordedAt: past, expiresAt: future }), true);
  assert.equal(isEvidenceCurrent({ reference: 'ref', recordedAt: past, expiresAt: past }), false);
});

test('persistCapability and loadPersistedCapability manage store file securely', async () => {
  const tempDir = join(tmpdir(), `relay-test-${crypto.randomUUID()}`);
  const storePath = join(tempDir, 'capabilities.json');

  try {
    const recordedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    await persistCapability({
      providerId: 'browser-chatgpt',
      status: 'reachable',
      detail: 'Probe passed',
      updatedAt: recordedAt,
      evidence: { reference: 'probe:test', recordedAt, expiresAt },
    }, storePath);

    const loaded = loadPersistedCapability('browser-chatgpt', storePath);
    assert.equal(loaded?.providerId, 'browser-chatgpt');
    assert.equal(loaded?.status, 'reachable');

    if (process.platform !== 'win32') {
      const fileStat = await stat(storePath);
      assert.equal(fileStat.mode & 0o777, 0o600);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('clearPersistedCapability removes only the requested provider', async () => {
  const tempDir = join(tmpdir(), `relay-test-${crypto.randomUUID()}`);
  const storePath = join(tempDir, 'capabilities.json');
  const recordedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3600000).toISOString();

  try {
    for (const providerId of ['browser-chatgpt', 'browser-claude']) {
      await persistCapability({
        providerId,
        status: 'reachable',
        detail: 'Probe passed',
        updatedAt: recordedAt,
        evidence: { reference: `probe:${providerId}`, recordedAt, expiresAt },
      }, storePath);
    }

    await clearPersistedCapability('browser-chatgpt', storePath);
    assert.equal(loadPersistedCapability('browser-chatgpt', storePath), undefined);
    assert.equal(loadPersistedCapability('browser-claude', storePath)?.providerId, 'browser-claude');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
