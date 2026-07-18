import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const verifier = join(process.cwd(), 'scripts', 'verify-release.mjs');
const artifactName = 'local-ai-relay-v1.2.3-linux-x64.tar.gz';
const artifact = Buffer.from('authenticated release bytes');
const sha256 = createHash('sha256').update(artifact).digest('hex');

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    repository: 'Nan0pk/local-ai-relay',
    version: 'v1.2.3',
    node: { minMajor: 22, maxMajor: 24 },
    artifacts: {
      'linux-x64': { name: artifactName, sha256 },
      'windows-x64': {
        name: 'local-ai-relay-v1.2.3-windows-x64.zip',
        sha256: '0'.repeat(64),
      },
    },
    ...overrides,
  };
}

async function run(options: { manifest?: unknown; bytes?: Buffer; version?: string; platform?: string } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'relay-verifier-'));
  const manifestPath = join(directory, 'release-manifest.json');
  const artifactPath = join(directory, artifactName);
  await writeFile(manifestPath, JSON.stringify(options.manifest ?? manifest()));
  await writeFile(artifactPath, options.bytes ?? artifact);
  return spawnSync(process.execPath, [
    verifier,
    '--manifest', manifestPath,
    '--artifact', artifactPath,
    '--version', options.version ?? 'v1.2.3',
    '--platform', options.platform ?? 'linux-x64',
  ], { encoding: 'utf8' });
}

test('accepts an exact versioned artifact with a matching digest', async () => {
  const result = await run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /verified v1\.2\.3 linux-x64/);
});

test('rejects tampered artifact bytes', async () => {
  const result = await run({ bytes: Buffer.from('tampered') });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checksum mismatch/i);
});

test('rejects an incorrect checksum for unchanged artifact bytes', async () => {
  const incorrect = manifest();
  incorrect.artifacts['linux-x64'].sha256 = 'f'.repeat(64);
  const result = await run({ manifest: incorrect });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checksum mismatch/i);
});

test('rejects a manifest for a different release', async () => {
  const result = await run({ version: 'v1.2.4' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /version mismatch/i);
});

test('rejects malformed and unsupported release input', async () => {
  const malformed = await run({ manifest: { schemaVersion: 1 } });
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /repository/i);

  const unsupported = await run({ platform: 'darwin-arm64' });
  assert.notEqual(unsupported.status, 0);
  assert.match(unsupported.stderr, /unsupported platform/i);
});
