import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  const npmLog = join(root, 'npm.log');
  await Promise.all([mkdir(release), mkdir(downloads), mkdir(bin), mkdir(install), mkdir(join(release, 'dist'))]);
  await copyFile(setup, join(release, 'setup-windows.ps1'));
  await writeFile(join(release, '.env.example'), 'RELAY_FIXTURE=default\n');
  await writeFile(join(release, 'dist', 'index.js'), 'void 0;\n');
  await writeFile(join(release, 'package.json'), JSON.stringify({
    name: 'delivery-fixture',
    version: '1.0.0',
    scripts: {
      typecheck: 'node -e ""',
      test: 'node -e ""',
      build: 'node -e ""',
      'smoke:startup': 'node -e ""',
      'probe:chatgpt': 'node -e ""',
      'service:start:windows': 'node -e ""',
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
  await writeFile(join(bin, 'npm.cmd'), '@echo off\r\nnode "%~dp0npm-stub.cjs" %*\r\nexit /b %errorlevel%\r\n');
  await writeFile(join(bin, 'npm-stub.cjs'), `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.RELAY_NPM_LOG, process.cwd() + '|' + args.join(' ') + '|' + (process.env.RELAY_INSTALL_ROOT || '') + '\\n');
if (args.includes('service:start:windows') &&
    path.basename(process.cwd()).toLowerCase() === (process.env.RELAY_FAIL_SERVICE_VERSION || '').toLowerCase()) {
  process.exitCode = 1;
}
`);
  return { root, downloads, bin, install, ghLog, npmLog };
}

function run(
  version: string | undefined,
  paths: Awaited<ReturnType<typeof fixture>>,
  extra: string[] = [],
  env: NodeJS.ProcessEnv = {},
  noBrowser = true,
) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', bootstrap];
  if (version) args.push('-Version', version);
  args.push('-InstallRoot', paths.install);
  if (noBrowser) args.push('-NoBrowser');
  args.push(...extra);
  return spawnSync('powershell.exe', args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      PATH: `${paths.bin};${process.env.PATH}`,
      RELAY_GH_LOG: paths.ghLog,
      RELAY_NPM_LOG: paths.npmLog,
      RELAY_RELEASE_BASE_URL: paths.downloads,
    },
  });
}

test('Windows bootstrap installs only an explicit authenticated release', { skip: !windows }, async () => {
  const paths = await fixture('v1.2.3');
  const result = run('v1.2.3', paths);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(join(paths.install, 'current-version'), 'utf8'), 'v1.2.3');
  assert.equal(await readFile(join(paths.install, 'config', '.env'), 'utf8'), 'RELAY_FIXTURE=default\n');
  assert.equal(await readFile(join(paths.install, 'versions', 'v1.2.3', '.env'), 'utf8'), 'RELAY_FIXTURE=default\n');
  assert.match(
    await readFile(join(paths.install, 'versions', 'v1.2.3', '.authenticated-install.json'), 'utf8'),
    /"version":"v1\.2\.3"/,
  );
  const attestations = (await readFile(paths.ghLog, 'utf8')).trim().split(/\r?\n/);
  assert.equal(attestations.length, 3);
  assert.ok(attestations.every((line) =>
    line.includes('--repo Nan0pk/local-ai-relay') &&
    line.includes('--signer-workflow Nan0pk/local-ai-relay/.github/workflows/release.yml') &&
    line.includes('--deny-self-hosted-runners')));
});

test('Windows bootstrap fails closed on checksum or attestation failure', { skip: !windows }, async () => {
  const tampered = await fixture('v1.2.3', { tamper: true });
  assert.notEqual(run('v1.2.3', tampered).status, 0);
  const unauthenticated = await fixture('v1.2.3', { attestation: false });
  assert.notEqual(run('v1.2.3', unauthenticated).status, 0);
  await assert.rejects(readFile(join(tampered.install, 'current-version')));
  await assert.rejects(readFile(join(unauthenticated.install, 'current-version')));
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
  await mkdir(join(first.install, 'diagnostics'));
  await writeFile(join(first.install, 'config', 'relay.json'), 'keep');
  await writeFile(join(first.install, 'config', '.env'), 'RELAY_FIXTURE=custom\n');
  await writeFile(join(first.install, 'diagnostics', 'last.log'), 'keep');

  const second = await fixture('v1.2.4');
  second.install = first.install;
  const interrupted = run('v1.2.4', second, [], { RELAY_TEST_INTERRUPT_BEFORE_ACTIVATE: '1' });
  assert.notEqual(interrupted.status, 0);
  assert.equal(await readFile(join(first.install, 'current-version'), 'utf8'), 'v1.2.3');
  assert.equal(await readFile(join(first.install, 'config', 'relay.json'), 'utf8'), 'keep');
  assert.equal(await readFile(join(first.install, 'diagnostics', 'last.log'), 'utf8'), 'keep');

  assert.equal(run('v1.2.4', second).status, 0);
  assert.equal(await readFile(join(first.install, 'versions', 'v1.2.4', '.env'), 'utf8'), 'RELAY_FIXTURE=custom\n');
  assert.notEqual(run('v1.2.4', second).status, 0, 'existing version was replaced');

  assert.notEqual(run('v1.2.4', second, ['-Rollback'], {}, false).status, 0);
  assert.notEqual(run(undefined, second, ['-Rollback']).status, 0);
  await writeFile(join(first.install, 'previous-version'), '../outside');
  assert.notEqual(run(undefined, second, ['-Rollback'], {}, false).status, 0);
  await writeFile(join(first.install, 'previous-version'), 'v1.2.3');

  const previousMarker = join(first.install, 'versions', 'v1.2.3', '.authenticated-install.json');
  const validMarker = await readFile(previousMarker, 'utf8');
  await rm(previousMarker);
  assert.notEqual(run(undefined, second, ['-Rollback'], {}, false).status, 0);
  assert.equal(await readFile(join(first.install, 'current-version'), 'utf8'), 'v1.2.4');
  await writeFile(previousMarker, validMarker);

  const failedRollback = run(undefined, second, ['-Rollback'], {
    RELAY_FAIL_SERVICE_VERSION: 'v1.2.3',
  }, false);
  assert.notEqual(failedRollback.status, 0);
  assert.equal(await readFile(join(first.install, 'current-version'), 'utf8'), 'v1.2.4');
  assert.equal(await readFile(join(first.install, 'previous-version'), 'utf8'), 'v1.2.3');
  const failedRollbackLog = await readFile(second.npmLog, 'utf8');
  assert.match(failedRollbackLog, /v1\.2\.3\|run service:start:windows/);
  assert.match(failedRollbackLog, /v1\.2\.4\|run service:start:windows/);

  const rollback = run(undefined, second, ['-Rollback'], {}, false);
  assert.equal(rollback.status, 0, rollback.stderr);
  assert.equal(await readFile(join(first.install, 'current-version'), 'utf8'), 'v1.2.3');
  assert.equal(await readFile(join(first.install, 'previous-version'), 'utf8'), 'v1.2.4');
  assert.equal(await readFile(join(first.install, 'managed-runtime'), 'utf8'), 'v1.2.3');
});

test('failed service activation restores the old runtime and leaves pointers unchanged', { skip: !windows }, async () => {
  const first = await fixture('v1.2.3');
  assert.equal(run('v1.2.3', first, [], {}, false).status, 0);
  const second = await fixture('v1.2.4');
  second.install = first.install;
  const failed = run('v1.2.4', second, [], { RELAY_FAIL_SERVICE_VERSION: 'v1.2.4' }, false);
  assert.notEqual(failed.status, 0);
  assert.equal(await readFile(join(first.install, 'current-version'), 'utf8'), 'v1.2.3');
  await assert.rejects(readFile(join(first.install, 'versions', 'v1.2.4', 'package.json')));
  const npmLog = await readFile(second.npmLog, 'utf8');
  assert.match(npmLog, /v1\.2\.4\|run service:start:windows/);
  assert.match(npmLog, /v1\.2\.3\|run service:start:windows/);
});

test('NoBrowser restarts an already managed runtime but leaves an unmanaged install pointer-only', { skip: !windows }, async () => {
  const unmanaged = await fixture('v1.2.3');
  assert.equal(run('v1.2.3', unmanaged).status, 0);
  await assert.rejects(readFile(join(unmanaged.install, 'managed-runtime')));
  assert.doesNotMatch(await readFile(unmanaged.npmLog, 'utf8'), /service:start:windows/);

  const managed = await fixture('v2.0.0');
  assert.equal(run('v2.0.0', managed, [], {}, false).status, 0);
  assert.equal(await readFile(join(managed.install, 'managed-runtime'), 'utf8'), 'v2.0.0');
  const update = await fixture('v2.0.1');
  update.install = managed.install;
  assert.equal(run('v2.0.1', update).status, 0);
  assert.equal(await readFile(join(managed.install, 'current-version'), 'utf8'), 'v2.0.1');
  assert.equal(await readFile(join(managed.install, 'managed-runtime'), 'utf8'), 'v2.0.1');
  const updateLog = await readFile(update.npmLog, 'utf8');
  assert.match(updateLog, /v2\.0\.1\|run service:start:windows\|/);
  assert.match(updateLog, new RegExp(managed.install.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(updateLog, /probe:chatgpt/);
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
