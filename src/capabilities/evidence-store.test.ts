import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  loadPersistedCapability,
  persistCapability,
} from './evidence-store.js';
import type { ProviderCapabilityRecord } from './tracker.js';
import { capabilityTracker, listReadyModels } from '../providers/registry.js';

function probeRecord(): ProviderCapabilityRecord {
  const recordedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  return {
    providerId: 'browser-chatgpt',
    status: 'reachable',
    evidence: {
      reference: `live-probe:chatgpt:${recordedAt}`,
      recordedAt,
      expiresAt,
    },
    detail: 'Live probe passed; full mission verification is still required before discovery.',
    updatedAt: recordedAt,
  };
}

test('persists a fresh live capability record with private file permissions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'relay-capability-'));
  const path = join(directory, 'capabilities.json');
  try {
    const record = probeRecord();
    await persistCapability(record, path);
    assert.deepEqual(loadPersistedCapability('browser-chatgpt', path), record);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.doesNotMatch(await readFile(path, 'utf8'), /LOCAL AI RELAY READY/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('never loads expired or malformed persisted capability evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'relay-capability-'));
  const path = join(directory, 'capabilities.json');
  try {
    const expired = probeRecord();
    expired.evidence!.expiresAt = '2020-01-01T00:00:00.000Z';
    await writeFile(path, `${JSON.stringify({ version: 1, records: [expired] })}\n`);
    assert.equal(loadPersistedCapability('browser-chatgpt', path), undefined);
    await writeFile(path, '{not json');
    assert.equal(loadPersistedCapability('browser-chatgpt', path), undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('fresh persisted ready evidence restores model discovery after relay restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'relay-capability-'));
  const path = join(directory, 'capabilities.json');
  const previous = process.env.RELAY_CAPABILITY_STORE;
  try {
    const record = probeRecord();
    record.status = 'ready';
    await persistCapability(record, path);
    process.env.RELAY_CAPABILITY_STORE = path;
    capabilityTracker.reset();
    assert.ok(listReadyModels().some((model) => model.id === 'browser-chatgpt-free'));
  } finally {
    capabilityTracker.reset();
    if (previous === undefined) delete process.env.RELAY_CAPABILITY_STORE;
    else process.env.RELAY_CAPABILITY_STORE = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test('concurrent probe writes retain evidence for both providers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'relay-capability-'));
  const path = join(directory, 'capabilities.json');
  try {
    const chatgpt = probeRecord();
    const gemini = probeRecord();
    gemini.providerId = 'browser-gemini';
    await Promise.all([persistCapability(chatgpt, path), persistCapability(gemini, path)]);
    assert.deepEqual(loadPersistedCapability('browser-chatgpt', path), chatgpt);
    assert.deepEqual(loadPersistedCapability('browser-gemini', path), gemini);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
