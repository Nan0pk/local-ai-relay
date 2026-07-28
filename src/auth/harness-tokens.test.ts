import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { HarnessTokenRegistry } from './harness-tokens.js';

test('harness tokens are scoped, hashed at rest, replaceable, and revocable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'relay-harness-token-'));
  const path = join(root, 'tokens.json');
  const registry = new HarnessTokenRegistry(path);

  const first = await registry.issue('hermes');
  assert.equal(registry.verify(first.token), true);
  assert.doesNotMatch(await import('node:fs/promises').then(({ readFile }) => readFile(path, 'utf8')), new RegExp(first.token));

  const replacement = await registry.issue('hermes');
  assert.equal(registry.verify(first.token), false);
  assert.equal(registry.verify(replacement.token), true);

  await registry.revokeHarness('hermes');
  assert.equal(registry.verify(replacement.token), false);
  if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o777, 0o600);
});
