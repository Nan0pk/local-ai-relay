import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { RELAY_VERSION } from './version.js';

test('runtime version matches package metadata', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as { version: string };
  assert.equal(RELAY_VERSION, packageJson.version);
});
