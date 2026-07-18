import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { authenticatedIdentity, windowsStateDirectory } from './start-windows-service.js';

async function release(version = 'v1.2.3') {
  const installRoot = await mkdtemp(join(tmpdir(), 'relay-windows-service-'));
  const releaseRoot = join(installRoot, 'versions', version);
  await mkdir(join(releaseRoot, 'dist'), { recursive: true });
  await writeFile(join(releaseRoot, 'package.json'), '{}');
  await writeFile(join(releaseRoot, 'dist', 'index.js'), 'void 0;\n');
  await writeFile(
    join(releaseRoot, '.authenticated-install.json'),
    JSON.stringify({ version, runtimeEntry: 'dist/index.js' }),
  );
  return { installRoot, releaseRoot };
}

test('authenticated Windows service identity binds version, runtime, and managed root', async () => {
  const fixture = await release();
  assert.deepEqual(
    await authenticatedIdentity(fixture.releaseRoot, fixture.installRoot),
    { version: 'v1.2.3', root: resolve(fixture.releaseRoot) },
  );
  assert.equal(
    windowsStateDirectory(fixture.releaseRoot, fixture.installRoot),
    join(resolve(fixture.installRoot), 'runtime'),
  );

  await assert.rejects(
    authenticatedIdentity(fixture.releaseRoot, join(fixture.installRoot, 'other')),
    /outside RELAY_INSTALL_ROOT/i,
  );
  await rm(join(fixture.releaseRoot, 'dist', 'index.js'));
  await assert.rejects(authenticatedIdentity(fixture.releaseRoot, fixture.installRoot));
});

test('authenticated Windows service identity rejects a mismatched marker', async () => {
  const fixture = await release();
  await writeFile(
    join(fixture.releaseRoot, '.authenticated-install.json'),
    JSON.stringify({ version: 'v1.2.4', runtimeEntry: 'dist/index.js' }),
  );
  await assert.rejects(
    authenticatedIdentity(fixture.releaseRoot, fixture.installRoot),
    /outside RELAY_INSTALL_ROOT/i,
  );
});
