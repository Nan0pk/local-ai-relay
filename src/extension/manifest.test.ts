import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

test('MV3 manifest.json parses and contains required MV3 fields', async () => {
  const path = join(process.cwd(), 'extension', 'manifest.json');
  const content = await readFile(path, 'utf8');
  const manifest = JSON.parse(content);

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'Local AI Relay Sidecar');
  assert.ok(Array.isArray(manifest.permissions));
  assert.ok(manifest.permissions.includes('activeTab'));
  assert.equal(manifest.background.service_worker, 'background.js');
});
