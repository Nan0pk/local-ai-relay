import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  activePortPath,
  clearActivePort,
  recordActivePort,
  resolveRelayPort,
} from './relay-location.js';

test('resolveRelayPort discovers a live fallback port', async () => {
  const root = join(tmpdir(), `relay-location-${crypto.randomUUID()}`);
  try {
    assert.equal(
      await resolveRelayPort({
        root,
        env: { PORT: '9000' },
        probe: async (port) => port === 9003,
      }),
      9003,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('recorded active port wins and cleanup cannot delete another process port', async () => {
  const root = join(tmpdir(), `relay-location-${crypto.randomUUID()}`);
  try {
    await recordActivePort(9100, root);
    assert.equal(
      await resolveRelayPort({
        root,
        env: { PORT: '9000' },
        probe: async (port) => port === 9100,
      }),
      9100,
    );
    await clearActivePort(9000, root);
    assert.equal((await readFile(activePortPath(root), 'utf8')).trim(), '9100');
    await clearActivePort(9100, root);
    await assert.rejects(() => readFile(activePortPath(root)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('invalid recorded state is ignored in favor of configured port', async () => {
  const root = join(tmpdir(), `relay-location-${crypto.randomUUID()}`);
  try {
    await mkdir(join(root, '.relay-browser'), { recursive: true });
    await writeFile(activePortPath(root), 'not-a-port');
    assert.equal(
      await resolveRelayPort({ root, env: { PORT: '9200' }, probe: async () => false }),
      9200,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
