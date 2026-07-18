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
const linuxTest = process.platform === 'win32' ? test.skip : test;

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
  await writeFile(join(payload, 'package-lock.json'), '{"lockfileVersion":3}\n');
  await mkdir(join(payload, 'dist'));
  await writeFile(join(payload, 'dist', 'index.js'), '/* built fixture */\n');
  await writeFile(join(payload, '.env'), 'FIXTURE=1\n');
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
printf 'called\n' >> "$CURL_LOG"
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
printf '%s\n' "$*" >> "$POLICY_LOG"
[[ " $* " == *" --repo Nan0pk/local-ai-relay "* ]]
[[ " $* " == *" --signer-workflow Nan0pk/local-ai-relay/.github/workflows/release.yml "* ]]
[[ " $* " == *" --deny-self-hosted-runners "* ]]
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
      CURL_LOG: join(f.root, 'curl.log'),
      ATTEST_LOG: join(f.root, 'attest.log'),
      POLICY_LOG: join(f.root, 'policy.log'),
      ROOT_MARKER: marker,
      SERVICE_UNIT: join(f.home, '.config', 'systemd', 'user', 'local-ai-relay.service'),
      SYSTEMCTL_LOG: join(f.root, 'systemctl.log'),
      SERVICE_RUNTIME: join(f.root, 'service-runtime'),
      ...extra,
    },
  });
  return { ...result, marker, output: `${result.stdout}${result.stderr}` };
}

async function pointer(f: Fixture, name: string) {
  return basename((await readFile(join(f.data, 'local-ai-relay', name), 'utf8')).trim());
}

async function stubServiceNpm(f: Fixture) {
  await writeFile(join(f.bin, 'npm'), `#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$*" == "run service:install" ]]
version="\${PWD##*/}"
mkdir -p "\${SERVICE_UNIT%/*}"
printf 'unit for %s\n' "$version" > "$SERVICE_UNIT"
printf '%s\n' "$version" > "$SERVICE_RUNTIME"
[[ "$version" != "\${FAIL_SERVICE_VERSION:-}" ]]
`);
  await writeFile(join(f.bin, 'systemctl'), `#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "$SYSTEMCTL_LOG"
if [[ "$*" == "--user disable --now local-ai-relay.service" ]]; then
  printf 'stopped\n' > "$SERVICE_RUNTIME"
fi
`);
  await Promise.all([chmod(join(f.bin, 'npm'), 0o755), chmod(join(f.bin, 'systemctl'), 0o755)]);
}

async function seedVersion(install: string, version: string, authenticated = true) {
  const root = join(install, 'versions', version);
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'package.json'), '{"name":"installed"}\n');
  await writeFile(join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
  await writeFile(join(root, 'setup-linux.sh'), '#!/usr/bin/env bash\n');
  await chmod(join(root, 'setup-linux.sh'), 0o755);
  await mkdir(join(root, 'dist'));
  await writeFile(join(root, 'dist', 'index.js'), '/* built */\n');
  await writeFile(join(root, '.env'), 'INSTALLED=1\n');
  if (authenticated) await writeFile(join(root, '.authenticated-release'), `${version}\n`);
}

linuxTest('installs only an explicit authenticated release and records all attestations', async () => {
  const f = await fixture();
  const missing = run(f, []);
  assert.notEqual(missing.status, 0);
  assert.match(missing.output, /--version/);

  const result = run(f, ['--version', f.version, '--no-browser']);
  assert.equal(result.status, 0, result.output);
  assert.equal(await pointer(f, 'current'), f.version);
  assert.equal(await readFile(join(f.data, 'local-ai-relay', 'versions', f.version, '.authenticated-release'), 'utf8'), `${f.version}\n`);
  assert.equal(await readFile(result.marker, 'utf8'), '');
  await assert.rejects(readFile(join(f.data, 'local-ai-relay', 'service-managed')));
  assert.deepEqual(
    (await readFile(join(f.root, 'attest.log'), 'utf8')).trim().split('\n').sort(),
    [f.artifact, 'release-manifest.json', 'verify-release.mjs'].sort(),
  );
  const policyCalls = (await readFile(join(f.root, 'policy.log'), 'utf8')).trim().split('\n');
  assert.equal(policyCalls.length, 3);
  for (const call of policyCalls) {
    assert.match(call, /--repo Nan0pk\/local-ai-relay/);
    assert.match(call, /--signer-workflow Nan0pk\/local-ai-relay\/\.github\/workflows\/release\.yml/);
    assert.match(call, /--deny-self-hosted-runners/);
  }
});

linuxTest('fails closed before setup for tampering, checksum mismatch, or bad attestation', async () => {
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

linuxTest('setup requires verified release context and installs only the lockfile', async () => {
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
  assert.equal(npmCommands.includes('run service:install'), false);
  assert.equal(npmCommands.includes('run hermes:configure'), false);
  assert.equal(await readFile(join(install, 'config', '.env'), 'utf8'), 'RELAY_API_TOKEN=change-me\n');
  assert.equal(await readFile(join(payload, '.env'), 'utf8'), 'RELAY_API_TOKEN=change-me\n');
});

linuxTest('rejects unsupported versions, platforms, and conflicting rollback input', async () => {
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

linuxTest('rejects unsupported hosts before downloading release inputs', async () => {
  for (const [hostOs, hostArch] of [['Darwin', 'x86_64'], ['Linux', 'aarch64']]) {
    const f = await fixture();
    await writeFile(join(f.bin, 'uname'), `#!/usr/bin/env bash
case "$1" in
  -s) echo "$HOST_OS" ;;
  -m) echo "$HOST_ARCH" ;;
  *) exit 2 ;;
esac
`);
    await chmod(join(f.bin, 'uname'), 0o755);

    const result = run(f, ['--version', f.version], { HOST_OS: hostOs, HOST_ARCH: hostArch });
    assert.notEqual(result.status, 0);
    assert.match(result.output, /unsupported host/);
    await assert.rejects(readFile(join(f.root, 'curl.log')));
  }
});

linuxTest('interrupted update preserves active release, configuration, and diagnostics', async () => {
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

linuxTest('rollback swaps release pointers without changing preserved state', async () => {
  const f = await fixture();
  const install = join(f.data, 'local-ai-relay');
  await seedVersion(install, 'v1.0.0');
  await seedVersion(install, 'v1.1.0');
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

linuxTest('managed update switches runtime, and activation failure restores runtime and state', async () => {
  for (const failActivation of [false, true]) {
    const f = await fixture();
    await stubServiceNpm(f);
    const install = join(f.data, 'local-ai-relay');
    const runtime = join(f.root, 'service-runtime');
    await seedVersion(install, 'v1.0.0');
    await mkdir(join(install, 'config'), { recursive: true });
    await mkdir(join(install, 'diagnostics'), { recursive: true });
    await writeFile(join(install, 'current'), 'v1.0.0\n');
    await writeFile(join(install, 'service-managed'), 'v1.0.0\n');
    await writeFile(join(install, 'config', 'settings.json'), 'keep-config');
    await writeFile(join(install, 'diagnostics', 'last.log'), 'keep-diagnostics');
    await writeFile(runtime, 'v1.0.0\n');

    const result = run(f, ['--version', f.version, '--no-browser'], {
      SERVICE_RUNTIME: runtime,
      ...(failActivation ? { FAIL_SERVICE_VERSION: f.version } : {}),
    });
    if (failActivation) {
      assert.notEqual(result.status, 0);
      assert.equal(await pointer(f, 'current'), 'v1.0.0');
      assert.equal((await readFile(runtime, 'utf8')).trim(), 'v1.0.0');
      await assert.rejects(readFile(join(install, 'versions', f.version, 'package.json')));
    } else {
      assert.equal(result.status, 0, result.output);
      assert.equal(await pointer(f, 'current'), f.version);
      assert.equal((await readFile(runtime, 'utf8')).trim(), f.version);
      assert.equal(await readFile(join(install, 'service-managed'), 'utf8'), `${f.version}\n`);
    }
    assert.equal(await readFile(join(install, 'config', 'settings.json'), 'utf8'), 'keep-config');
    assert.equal(await readFile(join(install, 'diagnostics', 'last.log'), 'utf8'), 'keep-diagnostics');
  }
});

linuxTest('first managed activation failures deactivate and remove only the newly-created unit', async () => {
  for (const failure of ['activation', 'finalization'] as const) {
    const f = await fixture();
    await stubServiceNpm(f);
    const install = join(f.data, 'local-ai-relay');
    const unit = join(f.home, '.config', 'systemd', 'user', 'local-ai-relay.service');
    const result = run(f, ['--version', f.version], {
      ...(failure === 'activation' ? { FAIL_SERVICE_VERSION: f.version } : { RELAY_TEST_FAIL_FINALIZE_AFTER: 'current' }),
    });
    assert.notEqual(result.status, 0);
    await assert.rejects(readFile(join(install, 'current')));
    await assert.rejects(readFile(join(install, 'service-managed')));
    await assert.rejects(readFile(unit));
    await assert.rejects(readFile(join(install, 'versions', f.version, 'package.json')));
    assert.equal((await readFile(join(f.root, 'service-runtime'), 'utf8')).trim(), 'stopped');
    const systemctl = await readFile(join(f.root, 'systemctl.log'), 'utf8');
    assert.match(systemctl, /--user disable --now local-ai-relay\.service/);
    assert.match(systemctl, /--user daemon-reload/);
  }
});

linuxTest('first managed install refuses a pre-existing unmanaged fixed service unit', async () => {
  const f = await fixture();
  await stubServiceNpm(f);
  const unit = join(f.home, '.config', 'systemd', 'user', 'local-ai-relay.service');
  await mkdir(join(f.home, '.config', 'systemd', 'user'), { recursive: true });
  await writeFile(unit, 'owner-managed unit\n');

  const result = run(f, ['--version', f.version]);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /refusing to overwrite unmanaged service unit/);
  assert.equal(await readFile(unit, 'utf8'), 'owner-managed unit\n');
  await assert.rejects(readFile(join(f.root, 'service-runtime')));
});

linuxTest('managed rollback switches runtime, and activation failure restores it before pointers', async () => {
  for (const failActivation of [false, true]) {
    const f = await fixture();
    await stubServiceNpm(f);
    const install = join(f.data, 'local-ai-relay');
    const runtime = join(f.root, 'service-runtime');
    await seedVersion(install, 'v1.0.0');
    await seedVersion(install, 'v1.1.0');
    await mkdir(join(install, 'config'), { recursive: true });
    await mkdir(join(install, 'diagnostics'), { recursive: true });
    await writeFile(join(install, 'current'), 'v1.1.0\n');
    await writeFile(join(install, 'previous'), 'v1.0.0\n');
    await writeFile(join(install, 'service-managed'), 'v1.1.0\n');
    await writeFile(join(install, 'config', 'settings.json'), 'keep-config');
    await writeFile(join(install, 'diagnostics', 'last.log'), 'keep-diagnostics');
    await writeFile(runtime, 'v1.1.0\n');

    const result = run(f, ['--rollback'], {
      SERVICE_RUNTIME: runtime,
      ...(failActivation ? { FAIL_SERVICE_VERSION: 'v1.0.0' } : {}),
    });
    if (failActivation) {
      assert.notEqual(result.status, 0);
      assert.equal(await pointer(f, 'current'), 'v1.1.0');
      assert.equal(await pointer(f, 'previous'), 'v1.0.0');
      assert.equal((await readFile(runtime, 'utf8')).trim(), 'v1.1.0');
    } else {
      assert.equal(result.status, 0, result.output);
      assert.equal(await pointer(f, 'current'), 'v1.0.0');
      assert.equal(await pointer(f, 'previous'), 'v1.1.0');
      assert.equal((await readFile(runtime, 'utf8')).trim(), 'v1.0.0');
      assert.equal(await readFile(join(install, 'service-managed'), 'utf8'), 'v1.0.0\n');
    }
    assert.equal(await readFile(join(install, 'config', 'settings.json'), 'utf8'), 'keep-config');
    assert.equal(await readFile(join(install, 'diagnostics', 'last.log'), 'utf8'), 'keep-diagnostics');
  }
});

linuxTest('rollback fails closed on malformed trust state or incomplete recovery releases', async () => {
  for (const invalid of ['malformed-pointer', 'missing-marker', 'managed-mismatch', 'invalid-current'] as const) {
    const f = await fixture();
    const install = join(f.data, 'local-ai-relay');
    await seedVersion(install, 'v1.0.0', invalid !== 'missing-marker');
    await seedVersion(install, 'v1.1.0', invalid !== 'invalid-current');
    await writeFile(join(install, 'current'), invalid === 'malformed-pointer' ? 'latest\n' : 'v1.1.0\n');
    await writeFile(join(install, 'previous'), 'v1.0.0\n');
    if (invalid === 'managed-mismatch' || invalid === 'invalid-current') {
      await writeFile(join(install, 'service-managed'), invalid === 'managed-mismatch' ? 'v9.9.9\n' : 'v1.1.0\n');
    }

    const result = run(f, ['--rollback']);
    assert.notEqual(result.status, 0);
    const expected = invalid === 'malformed-pointer'
      ? /current release pointer is malformed/
      : invalid === 'managed-mismatch'
        ? /does not match current/
        : invalid === 'invalid-current'
          ? /current recovery release .* is not an authenticated runnable/
          : /previous release .* is not an authenticated runnable/;
    assert.match(result.output, expected);
    assert.equal(await readFile(join(install, 'current'), 'utf8'), invalid === 'malformed-pointer' ? 'latest\n' : 'v1.1.0\n');
    assert.equal(await readFile(join(install, 'previous'), 'utf8'), 'v1.0.0\n');
  }
});

linuxTest('pointer-finalization failure restores exact pointers, marker, and managed runtime', async () => {
  for (const operation of ['update', 'rollback'] as const) {
    const f = await fixture();
    await stubServiceNpm(f);
    const install = join(f.data, 'local-ai-relay');
    const runtime = join(f.root, 'service-runtime');
    await seedVersion(install, 'v1.0.0');
    await seedVersion(install, 'v1.1.0');
    await mkdir(join(install, 'config'), { recursive: true });
    await mkdir(join(install, 'diagnostics'), { recursive: true });
    const current = operation === 'update' ? 'v1.0.0' : 'v1.1.0';
    const previous = operation === 'update' ? 'v0.9.0' : 'v1.0.0';
    await writeFile(join(install, 'current'), `${current}\n`);
    await writeFile(join(install, 'previous'), `${previous}\n`);
    await writeFile(join(install, 'service-managed'), `${current}\n`);
    await writeFile(join(install, 'config', 'settings.json'), 'keep-config');
    await writeFile(join(install, 'diagnostics', 'last.log'), 'keep-diagnostics');
    await writeFile(runtime, `${current}\n`);

    const result = run(f, operation === 'update' ? ['--version', f.version, '--no-browser'] : ['--rollback'], {
      SERVICE_RUNTIME: runtime,
      RELAY_TEST_FAIL_FINALIZE_AFTER: 'current',
    });
    assert.notEqual(result.status, 0);
    assert.equal(await readFile(join(install, 'current'), 'utf8'), `${current}\n`);
    assert.equal(await readFile(join(install, 'previous'), 'utf8'), `${previous}\n`);
    assert.equal(await readFile(join(install, 'service-managed'), 'utf8'), `${current}\n`);
    assert.equal((await readFile(runtime, 'utf8')).trim(), current);
    assert.equal(await readFile(join(install, 'config', 'settings.json'), 'utf8'), 'keep-config');
    assert.equal(await readFile(join(install, 'diagnostics', 'last.log'), 'utf8'), 'keep-diagnostics');
  }
});
