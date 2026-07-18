import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repositoryRoot = process.cwd();
const bootstrapSource = join(repositoryRoot, 'bootstrap.sh');
const verifierSource = join(repositoryRoot, 'scripts', 'verify-release.mjs');

type Fixture = {
  root: string;
  home: string;
  data: string;
  assets: string;
  bin: string;
  version: string;
  artifact: string;
};

async function fixture(setupBody = '#!/usr/bin/env bash\nset -Eeuo pipefail\ntouch "$ROOT_MARKER"\n'): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'relay-linux-bootstrap-'));
  const home = join(root, 'home');
  const data = join(root, 'data');
  const assets = join(root, 'assets');
  const bin = join(root, 'bin');
  const payload = join(root, 'payload');
  const version = 'v1.2.3';
  const artifact = `local-ai-relay-${version}-linux-x64.tar.gz`;
  await Promise.all([mkdir(home), mkdir(data), mkdir(assets), mkdir(bin), mkdir(payload)]);
  await writeFile(join(payload, 'setup-linux.sh'), setupBody);
  await chmod(join(payload, 'setup-linux.sh'), 0o755);
  await writeFile(join(payload, 'package.json'), '{"name":"fixture"}\n');
  const packed = spawnSync('tar', ['-czf', join(assets, artifact), '-C', payload, '.']);
  assert.equal(packed.status, 0, packed.stderr.toString());
  const checksum = createHash('sha256').update(await readFile(join(assets, artifact))).digest('hex');
  await writeFile(join(assets, 'release-manifest.json'), JSON.stringify({
    schemaVersion: 1,
    repository: 'Nan0pk/local-ai-relay',
    version,
    node: { minMajor: 18, maxMajor: 99 },
    artifacts: { 'linux-x64': { name: artifact, sha256: checksum } },
  }));
  await cp(verifierSource, join(assets, 'verify-release.mjs'));

  await writeFile(join(bin, 'curl'), `#!/usr/bin/env bash
set -Eeuo pipefail
out=
url=
while (($#)); do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
cp "$FIXTURE_ASSETS/\${url##*/}" "$out"
`);
  await writeFile(join(bin, 'gh'), `#!/usr/bin/env bash
set -Eeuo pipefail
file=
while (($#)); do
  [[ -f "$1" ]] && file="$1"
  shift
done
printf '%s\n' "\${file##*/}" >> "$ATTEST_LOG"
[[ "\${file##*/}" != "\${FAIL_ATTEST:-}" ]]
`);
  await Promise.all([chmod(join(bin, 'curl'), 0o755), chmod(join(bin, 'gh'), 0o755)]);
  return { root, home, data, assets, bin, version, artifact };
}

function run(f: Fixture, args: string[], extra: Record<string, string> = {}) {
  const marker = join(f.root, 'setup-ran');
  const result = spawnSync('bash', [bootstrapSource, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: f.home,
      XDG_DATA_HOME: f.data,
      PATH: `${f.bin}:${process.env.PATH}`,
      RELAY_RELEASE_BASE_URL: 'https://fixtures.invalid/releases',
      FIXTURE_ASSETS: f.assets,
      ATTEST_LOG: join(f.root, 'attest.log'),
      ROOT_MARKER: marker,
      ...extra,
    },
  });
  return { ...result, marker, output: `${result.stdout}${result.stderr}` };
}

async function pointer(f: Fixture, name: string) {
  return basename((await readFile(join(f.data, 'local-ai-relay', name), 'utf8')).trim());
}

test('installs only an explicit authenticated release and records all attestations', async () => {
  const f = await fixture();
  const missing = run(f, []);
  assert.notEqual(missing.status, 0);
  assert.match(missing.output, /--version/);

  const result = run(f, ['--version', f.version, '--no-browser']);
  assert.equal(result.status, 0, result.output);
  assert.equal(await pointer(f, 'current'), f.version);
  assert.equal(await readFile(result.marker, 'utf8'), '');
  assert.deepEqual(
    (await readFile(join(f.root, 'attest.log'), 'utf8')).trim().split('\n').sort(),
    [f.artifact, 'release-manifest.json', 'verify-release.mjs'].sort(),
  );
});

test('fails closed before setup for tampering, checksum mismatch, or bad attestation', async () => {
  for (const failure of ['checksum', 'manifest-attestation', 'verifier-attestation', 'artifact-attestation'] as const) {
    const f = await fixture();
    const extra: Record<string, string> = {};
    if (failure === 'checksum') {
      await writeFile(join(f.assets, f.artifact), 'tampered');
    } else {
      extra.FAIL_ATTEST = failure === 'manifest-attestation'
        ? 'release-manifest.json'
        : failure === 'verifier-attestation' ? 'verify-release.mjs' : f.artifact;
    }
    const result = run(f, ['--version', f.version], extra);
    assert.notEqual(result.status, 0, `${failure} unexpectedly passed`);
    await assert.rejects(readFile(result.marker), `${failure} ran setup`);
    await assert.rejects(readFile(join(f.data, 'local-ai-relay', 'current')));
  }
});

test('setup requires verified release context and installs only the lockfile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'relay-linux-setup-'));
  const bin = join(root, 'bin');
  const install = join(root, 'install');
  const payload = join(root, 'payload');
  const npmLog = join(root, 'npm.log');
  await Promise.all([mkdir(bin), mkdir(install), mkdir(payload)]);
  await cp(join(repositoryRoot, 'setup-linux.sh'), join(payload, 'setup-linux.sh'));
  await writeFile(join(payload, '.env.example'), 'RELAY_API_TOKEN=change-me\n');
  await writeFile(join(bin, 'node'), `#!/usr/bin/env bash
[[ "\${1:-}" == "-p" ]] && { echo 22; exit 0; }
echo v22.0.0
`);
  await writeFile(join(bin, 'npm'), `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$NPM_LOG"
`);
  await Promise.all([chmod(join(bin, 'node'), 0o755), chmod(join(bin, 'npm'), 0o755)]);
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    NPM_LOG: npmLog,
    RELAY_INSTALL_ROOT: install,
  };
  const setup = join(payload, 'setup-linux.sh');
  const rejected = spawnSync('bash', [setup, '--no-browser'], { env, encoding: 'utf8' });
  assert.notEqual(rejected.status, 0);

  const accepted = spawnSync('bash', [setup, '--no-browser'], {
    encoding: 'utf8',
    env: {
      ...env,
      RELAY_VERIFIED_RELEASE: '1',
      RELAY_RELEASE_VERSION: 'v1.2.3',
      RELAY_RELEASE_PLATFORM: 'linux-x64',
    },
  });
  assert.equal(accepted.status, 0, `${accepted.stdout}${accepted.stderr}`);
  const npmCommands = (await readFile(npmLog, 'utf8')).trim().split('\n');
  assert.equal(npmCommands[0], 'ci');
  assert.equal(npmCommands.includes('install'), false);
  assert.equal(await readFile(join(install, 'config', '.env'), 'utf8'), 'RELAY_API_TOKEN=change-me\n');
  assert.equal(await readFile(join(payload, '.env'), 'utf8'), 'RELAY_API_TOKEN=change-me\n');
});

test('rejects unsupported versions, platforms, and conflicting rollback input', async () => {
  const f = await fixture();
  for (const args of [
    ['--version', 'latest'],
    ['--version', 'v1.2.3-beta.1'],
    ['--platform', 'darwin-x64', '--version', f.version],
    ['--rollback', '--version', f.version],
  ]) {
    const result = run(f, args);
    assert.notEqual(result.status, 0, `${args.join(' ')} unexpectedly passed`);
  }
});

test('interrupted update preserves active release, configuration, and diagnostics', async () => {
  const f = await fixture(`#!/usr/bin/env bash
set -Eeuo pipefail
touch "$ROOT_MARKER"
exit 73
`);
  const install = join(f.data, 'local-ai-relay');
  await mkdir(join(install, 'versions', 'v1.0.0'), { recursive: true });
  await mkdir(join(install, 'config'), { recursive: true });
  await mkdir(join(install, 'diagnostics'), { recursive: true });
  await writeFile(join(install, 'current'), 'v1.0.0\n');
  await writeFile(join(install, 'config', 'settings.json'), 'keep-config');
  await writeFile(join(install, 'diagnostics', 'last.log'), 'keep-diagnostics');

  const result = run(f, ['--version', f.version]);
  assert.equal(result.status, 73, result.output);
  assert.equal(await pointer(f, 'current'), 'v1.0.0');
  await assert.rejects(readFile(join(install, 'versions', f.version, 'package.json')));
  assert.equal(await readFile(join(install, 'config', 'settings.json'), 'utf8'), 'keep-config');
  assert.equal(await readFile(join(install, 'diagnostics', 'last.log'), 'utf8'), 'keep-diagnostics');
});

test('rollback swaps release pointers without changing preserved state', async () => {
  const f = await fixture();
  const install = join(f.data, 'local-ai-relay');
  await mkdir(join(install, 'versions', 'v1.0.0'), { recursive: true });
  await mkdir(join(install, 'versions', 'v1.1.0'), { recursive: true });
  await mkdir(join(install, 'config'), { recursive: true });
  await mkdir(join(install, 'diagnostics'), { recursive: true });
  await writeFile(join(install, 'current'), 'v1.1.0\n');
  await writeFile(join(install, 'previous'), 'v1.0.0\n');
  await writeFile(join(install, 'config', 'settings.json'), 'keep-config');
  await writeFile(join(install, 'diagnostics', 'last.log'), 'keep-diagnostics');

  const result = run(f, ['--rollback']);
  assert.equal(result.status, 0, result.output);
  assert.equal(await pointer(f, 'current'), 'v1.0.0');
  assert.equal(await pointer(f, 'previous'), 'v1.1.0');
  assert.equal(await readFile(join(install, 'config', 'settings.json'), 'utf8'), 'keep-config');
  assert.equal(await readFile(join(install, 'diagnostics', 'last.log'), 'utf8'), 'keep-diagnostics');
});
