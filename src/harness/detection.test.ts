import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';
import { findExecutable } from './detection.js';
import { getHarnessLaunchCommand } from './launcher.js';

test('harness executable detection searches the supplied PATH exactly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'relay-harness-detection-'));
  const filename = process.platform === 'win32' ? 'hermes.EXE' : 'hermes';
  const executable = join(root, filename);
  await writeFile(executable, '');
  if (process.platform !== 'win32') await chmod(executable, 0o700);
  assert.equal(await findExecutable('hermes', { PATH: root }), executable);
  assert.equal(await findExecutable('hermes', { PATH: [join(root, 'missing'), root].join(delimiter) }), executable);
});

test('Linux harness launch uses a visible detected terminal', {
  skip: process.platform !== 'linux',
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'relay-harness-terminal-'));
  const terminal = join(root, 'xdg-terminal-exec');
  await writeFile(terminal, '');
  await chmod(terminal, 0o700);
  const command = await getHarnessLaunchCommand('hermes', '/usr/bin/hermes', { PATH: root });
  assert.deepEqual(command, {
    command: terminal,
    args: ['/usr/bin/hermes'],
  });
});
