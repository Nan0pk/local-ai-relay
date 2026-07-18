import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  authenticatedIdentity,
  terminateRecordedProcess,
  windowsConfigPath,
  windowsStateDirectory,
} from './start-windows-service.js';

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
  assert.equal(
    windowsConfigPath(fixture.installRoot),
    join(resolve(fixture.installRoot), 'config', '.env'),
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

test('recorded process termination reconciles an unavailable process without orphaning it', async () => {
  const killed: number[] = [];
  let alive = true;
  await terminateRecordedProcess(42, 'v1.2.3', 'relay-process-42', {
    kill(pid) { killed.push(pid); alive = false; },
    alive() { return alive; },
    async identity() { return 'relay-process-42'; },
    async wait() {},
  });
  assert.deepEqual(killed, [42]);

  await terminateRecordedProcess(43, 'v1.2.3', 'relay-process-43', {
    kill() {
      const error = new Error('gone') as NodeJS.ErrnoException;
      error.code = 'ESRCH';
      throw error;
    },
    alive() { return true; },
    async identity() { return 'relay-process-43'; },
    async wait() {},
  });
});

test('recorded process termination fails closed when a PID was reused', async () => {
  let killed = false;
  await assert.rejects(
    terminateRecordedProcess(42, 'v1.2.3', 'original-relay', {
      kill() { killed = true; },
      alive() { return true; },
      async identity() { return 'unrelated-reused-process'; },
      async wait() {},
    }),
    /no longer belongs/i,
  );
  assert.equal(killed, false);
});
