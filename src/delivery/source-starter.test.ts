import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = process.cwd();
const linuxStarter = join(root, 'start-source.sh');
const linuxTest = process.platform === 'win32' ? test.skip : test;

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'relay-source-starter-'));
  const remote = join(base, 'remote');
  const home = join(base, 'home');
  const data = join(base, 'data');
  const bin = join(base, 'bin');
  const npmLog = join(base, 'npm.log');
  await Promise.all([
    mkdir(remote),
    mkdir(home),
    mkdir(data),
    mkdir(bin),
  ]);
  await writeFile(join(remote, 'package.json'), '{"name":"starter-fixture"}\n');
  await writeFile(join(remote, 'package-lock.json'), '{"lockfileVersion":3}\n');
  await writeFile(join(remote, '.gitignore'), 'node_modules/\n');
  const initialize = spawnSync('git', ['init', '-b', 'main'], { cwd: remote, encoding: 'utf8' });
  assert.equal(initialize.status, 0, initialize.stderr);
  assert.equal(spawnSync('git', ['add', '.'], { cwd: remote }).status, 0);
  assert.equal(spawnSync(
    'git',
    ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture'],
    { cwd: remote },
  ).status, 0);

  const npm = join(bin, 'npm');
  await writeFile(npm, `#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "$NPM_LOG"
if [[ "\${1:-}" == "ci" ]]; then mkdir -p node_modules; fi
`);
  await chmod(npm, 0o755);
  return { base, remote, home, data, bin, npmLog };
}

function run(
  f: Awaited<ReturnType<typeof fixture>>,
  extra: Record<string, string> = {},
) {
  return spawnSync('bash', [linuxStarter, '--no-open'], {
    cwd: f.home,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: f.home,
      XDG_DATA_HOME: f.data,
      PATH: `${f.bin}:${process.env.PATH}`,
      NPM_LOG: f.npmLog,
      RELAY_SOURCE_REPOSITORY: f.remote,
      ...extra,
    },
  });
}

linuxTest('source starter works from an empty home and is repeatable', async () => {
  const f = await fixture();
  const first = run(f);
  assert.equal(first.status, 0, `${first.stdout}${first.stderr}`);
  assert.match(first.stdout, /Downloading Local AI Relay/);
  assert.match(first.stdout, /Opening the Local AI Relay Control Center/);
  assert.deepEqual(
    (await readFile(f.npmLog, 'utf8')).trim().split('\n'),
    ['ci', 'run launcher:install', 'run dashboard -- --no-open'],
  );

  const second = run(f);
  assert.equal(second.status, 0, `${second.stdout}${second.stderr}`);
  assert.match(second.stdout, /Dependencies are already current/);
  assert.deepEqual(
    (await readFile(f.npmLog, 'utf8')).trim().split('\n'),
    [
      'ci',
      'run launcher:install',
      'run dashboard -- --no-open',
      'run launcher:install',
      'run dashboard -- --no-open',
    ],
  );
});

linuxTest('source starter preserves unexpected folders and local changes', async () => {
  const unexpected = await fixture();
  const source = join(unexpected.data, 'local-ai-relay', 'source');
  await mkdir(source, { recursive: true });
  await writeFile(join(source, 'personal.txt'), 'keep me');
  const rejectedFolder = run(unexpected);
  assert.notEqual(rejectedFolder.status, 0);
  assert.match(rejectedFolder.stderr, /not a Local AI Relay source checkout/);
  assert.equal(await readFile(join(source, 'personal.txt'), 'utf8'), 'keep me');

  const dirty = await fixture();
  assert.equal(run(dirty).status, 0);
  const checkout = join(dirty.data, 'local-ai-relay', 'source');
  await writeFile(join(checkout, 'personal.txt'), 'keep me');
  const rejectedChange = run(dirty);
  assert.notEqual(rejectedChange.status, 0);
  assert.match(rejectedChange.stderr, /contains local changes/);
  assert.equal(await readFile(join(checkout, 'personal.txt'), 'utf8'), 'keep me');
});

test('README starts with a runnable current path and no phantom release command', async () => {
  const readme = await readFile(join(root, 'README.md'), 'utf8');
  const start = readme.indexOf('## Install and open');
  const workflow = readme.indexOf('## Get to work');
  const proof = readme.indexOf('## Privacy and current proof');
  assert.ok(start > 0 && start < workflow && workflow < proof);
  assert.match(
    readme,
    /curl -fsSL https:\/\/raw\.githubusercontent\.com\/Nan0pk\/local-ai-relay\/main\/start-source\.sh -o \/tmp\/local-ai-relay-start\.sh && bash \/tmp\/local-ai-relay-start\.sh/,
  );
  assert.match(readme, /start-source\.ps1/);
  assert.doesNotMatch(readme, /\.\/bootstrap\.(?:sh|ps1).*v0\.1\.0/);
  assert.match(readme, /currently a \*\*source preview\*\*, not a signed desktop release/);
  assert.match(readme, /no standalone `bootstrap\.sh`/);
});
