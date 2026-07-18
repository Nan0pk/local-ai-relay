import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const windows = process.platform === 'win32';
const bootstrap = join(process.cwd(), 'bootstrap.ps1');
const setup = join(process.cwd(), 'setup-windows.ps1');
const wrapper = join(process.cwd(), 'setup-windows.cmd');
const verifier = join(process.cwd(), 'scripts', 'verify-release.mjs');

async function fixture(version: string, options: { tamper?: boolean; attestation?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'relay-windows-delivery-'));
  const release = join(root, 'release');
  const downloads = join(root, 'downloads');
  const bin = join(root, 'bin');
  const install = join(root, 'install');
  const ghLog = join(root, 'gh.log');
  await Promise.all([mkdir(release), mkdir(downloads), mkdir(bin), mkdir(install)]);
  await copyFile(setup, join(release, 'setup-windows.ps1'));
  await writeFile(join(release, 'package.json'), JSON.stringify({
    name: 'delivery-fixture',
    version: '1.0.0',
    scripts: {
      typecheck: 'node -e ""',
      test: 'node -e ""',
      build: 'node -e ""',
      'smoke:startup': 'node -e ""',
    },
  }));
  await writeFile(join(release, 'package-lock.json'), JSON.stringify({
    name: 'delivery-fixture',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: { '': { name: 'delivery-fixture', version: '1.0.0' } },
  }));
  const artifactName = `local-ai-relay-${version}-windows-x64.zip`;
  const artifactPath = join(downloads, artifactName);
  const archive = spawnSync('powershell.exe', [
    '-NoProfile', '-Command',
    `Compress-Archive -Path '${release.replaceAll("'", "''")}\\*' -DestinationPath '${artifactPath.replaceAll("'", "''")}'`,
  ], { encoding: 'utf8' });
  assert.equal(archive.status, 0, archive.stderr);
  if (options.tamper) await writeFile(artifactPath, Buffer.from('tampered zip'));
  const digest = createHash('sha256').update(await readFile(artifactPath)).digest('hex');
  await copyFile(verifier, join(downloads, 'verify-release.mjs'));
  await writeFile(join(downloads, 'release-manifest.json'), JSON.stringify({
    schemaVersion: 1,
    repository: 'Nan0pk/local-ai-relay',
    version,
    node: { minMajor: 22, maxMajor: 99 },
    artifacts: { 'windows-x64': { name: artifactName, sha256: options.tamper ? '0'.repeat(64) : digest } },
  }));
  await writeFile(join(bin, 'gh.cmd'), `@echo off\r\necho %*>>"%RELAY_GH_LOG%"\r\nexit /b ${options.attestation === false ? 1 : 0}\r\n`);
  return { root, downloads, bin, install, ghLog };
}

function run(version: string | undefined, paths: Awaited<ReturnType<typeof fixture>>, extra: string[] = [], env = {}) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', bootstrap];
  if (version) args.push('-Version', version);
  args.push('-InstallRoot', paths.install, '-NoBrowser', ...extra);
  return spawnSync('powershell.exe', args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      PATH: `${paths.bin};${process.env.PATH}`,
      RELAY_GH_LOG: paths.ghLog,
      RELAY_RELEASE_BASE_URL: paths.downloads,
    },
  });
}

test('Windows bootstrap installs only an explicit authenticated release', { skip: !windows }, async () => {
  const paths = await fixture('v1.2.3');
  const result = run('v1.2.3', paths);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(join(paths.install, 'current-version'), 'utf8'), 'v1.2.3');
  const attestations = (await readFile(paths.ghLog, 'utf8')).trim().split(/\r?\n/);
  assert.equal(attestations.length, 3);
  assert.ok(attestations.every((line) => line.includes('--repo Nan0pk/local-ai-relay')));
});

test('Windows bootstrap fails closed on checksum or attestation failure', { skip: !windows }, async () => {
  const tampered = await fixture('v1.2.3', { tamper: true });
  assert.notEqual(run('v1.2.3', tampered).status, 0);
  const unauthenticated = await fixture('v1.2.3', { attestation: false });
  assert.notEqual(run('v1.2.3', unauthenticated).status, 0);
  assert.rejects(readFile(join(tampered.install, 'current-version')));
  assert.rejects(readFile(join(unauthenticated.install, 'current-version')));
});

test('Windows bootstrap rejects missing, malformed, and unsupported versions before download', { skip: !windows }, async () => {
  const paths = await fixture('v1.2.3');
  for (const version of [undefined, 'latest', 'v01.2.3', 'v1.2']) {
    const result = run(version, paths);
    assert.notEqual(result.status, 0, `${version ?? 'missing'} unexpectedly succeeded`);
  }
});

test('interrupted update preserves active install, configuration, and diagnostics; rollback swaps pointers only', { skip: !windows }, async () => {
  const first = await fixture('v1.2.3');
  assert.equal(run('v1.2.3', first).status, 0);
  await mkdir(join(first.install, 'config'));
  await mkdir(join(first.install, 'diagnostics'));
  await writeFile(join(first.install, 'config', 'relay.json'), 'keep');
  await writeFile(join(first.install, 'diagnostics', 'last.log'), 'keep');

  const second = await fixture('v1.2.4');
  second.install = first.install;
  const interrupted = run('v1.2.4', second, [], { RELAY_TEST_INTERRUPT_BEFORE_ACTIVATE: '1' });
  assert.notEqual(interrupted.status, 0);
  assert.equal(await readFile(join(first.install, 'current-version'), 'utf8'), 'v1.2.3');
  assert.equal(await readFile(join(first.install, 'config', 'relay.json'), 'utf8'), 'keep');
  assert.equal(await readFile(join(first.install, 'diagnostics', 'last.log'), 'utf8'), 'keep');

  assert.equal(run('v1.2.4', second).status, 0);
  const rollback = run(undefined, second, ['-Rollback']);
  assert.equal(rollback.status, 0, rollback.stderr);
  assert.equal(await readFile(join(first.install, 'current-version'), 'utf8'), 'v1.2.3');
  assert.equal(await readFile(join(first.install, 'previous-version'), 'utf8'), 'v1.2.4');
});

test('PowerShell entry points parse and the batch wrapper only launches verified setup', { skip: !windows }, async () => {
  for (const path of [bootstrap, setup]) {
    const result = spawnSync('powershell.exe', [
      '-NoProfile', '-Command',
      `[void][scriptblock]::Create((Get-Content -LiteralPath '${path.replaceAll("'", "''")}' -Raw))`,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  const batch = await readFile(wrapper, 'utf8');
  assert.match(batch, /powershell\.exe .* -File "%~dp0setup-windows\.ps1" %\*/i);
  assert.doesNotMatch(batch, /\b(?:curl|git|irm|Invoke-WebRequest)\b/i);
});
