#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';

const root = process.cwd();
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const tag = `v${packageJson.version}`;
const temporary = await mkdtemp(join(tmpdir(), 'local-ai-relay-release-'));
const first = join(temporary, 'first');
const second = join(temporary, 'second');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function run(script, args) {
  const result = spawnSync(process.execPath, [join(root, script), ...args], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${script} failed:\n${result.stdout}${result.stderr}`);
}

function tarNames(bytes) {
  const archive = gunzipSync(bytes);
  const names = [];
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, '');
    const sizeText = header.subarray(124, 136).toString().replace(/\0.*$/, '').trim();
    const size = Number.parseInt(sizeText || '0', 8);
    assert.ok(name && Number.isSafeInteger(size), 'malformed tar entry');
    names.push(name);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return names.sort();
}

function zipNames(bytes) {
  const names = [];
  for (let offset = 0; offset + 4 <= bytes.length;) {
    const signature = bytes.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;
    assert.equal(bytes.readUInt16LE(offset + 8), 0, 'zip entries must be stored deterministically');
    const size = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    names.push(bytes.subarray(nameStart, nameStart + nameLength).toString());
    offset = nameStart + nameLength + extraLength + size;
  }
  return names.sort();
}

try {
  run('scripts/build-release.mjs', ['--output', first, '--tag', tag]);
  run('scripts/build-release.mjs', ['--output', second, '--tag', tag]);

  const linux = `local-ai-relay-${tag}-linux-x64.tar.gz`;
  const windows = `local-ai-relay-${tag}-windows-x64.zip`;
  const sbom = `local-ai-relay-${tag}.spdx.json`;
  const expectedAssets = [
    'SHA256SUMS',
    'bootstrap.ps1',
    'bootstrap.sh',
    linux,
    windows,
    sbom,
    'release-manifest.json',
    'verify-release.mjs',
  ].sort();
  assert.deepEqual((await readdir(first)).sort(), expectedAssets, 'release asset contract changed');
  assert.deepEqual((await readdir(second)).sort(), expectedAssets, 'repeat release asset contract changed');

  for (const name of expectedAssets) {
    assert.deepEqual(await readFile(join(first, name)), await readFile(join(second, name)), `${name} is not deterministic`);
  }

  const sums = (await readFile(join(first, 'SHA256SUMS'), 'utf8')).trim().split('\n');
  assert.equal(sums.length, expectedAssets.length - 1, 'SHA256SUMS must cover every other asset');
  const checked = [];
  for (const line of sums) {
    const match = /^([a-f0-9]{64})  ([^\r\n]+)$/.exec(line);
    assert.ok(match, `malformed SHA256SUMS line: ${line}`);
    assert.equal(sha256(await readFile(join(first, match[2]))), match[1], `checksum mismatch for ${match[2]}`);
    checked.push(match[2]);
  }
  assert.deepEqual(checked.sort(), expectedAssets.filter((name) => name !== 'SHA256SUMS').sort());

  const tar = tarNames(await readFile(join(first, linux)));
  const zip = zipNames(await readFile(join(first, windows)));
  assert.deepEqual(tar, zip, 'Linux and Windows payload contents differ');
  assert.ok(tar.includes('setup-linux.sh'), 'setup-linux.sh must be at archive root');
  assert.ok(zip.includes('setup-windows.ps1'), 'setup-windows.ps1 must be at archive root');
  assert.ok(tar.every((name) => !name.startsWith('/') && !name.split('/').includes('..')), 'unsafe archive path');

  const manifest = JSON.parse(await readFile(join(first, 'release-manifest.json'), 'utf8'));
  assert.deepEqual(
    {
      schemaVersion: manifest.schemaVersion,
      repository: manifest.repository,
      version: manifest.version,
      node: manifest.node,
      linux: manifest.artifacts?.['linux-x64']?.name,
      windows: manifest.artifacts?.['windows-x64']?.name,
    },
    {
      schemaVersion: 1,
      repository: 'Nan0pk/local-ai-relay',
      version: tag,
      node: { minMajor: 22, maxMajor: 24 },
      linux,
      windows,
    },
  );
  for (const [platform, artifact] of [['linux-x64', linux], ['windows-x64', windows]]) {
    run('scripts/verify-release.mjs', [
      '--manifest', join(first, 'release-manifest.json'),
      '--artifact', join(first, artifact),
      '--version', tag,
      '--platform', platform,
    ]);
  }

  const spdx = JSON.parse(await readFile(join(first, sbom), 'utf8'));
  assert.equal(spdx.spdxVersion, 'SPDX-2.3');
  assert.equal(spdx.dataLicense, 'CC0-1.0');
  assert.equal(spdx.SPDXID, 'SPDXRef-DOCUMENT');
  assert.ok(Array.isArray(spdx.packages) && spdx.packages.some((item) => item.name === packageJson.name));
  const describedFiles = new Set(spdx.files?.map((item) => item.fileName));
  for (const name of expectedAssets.filter((name) => !['SHA256SUMS', sbom].includes(name))) {
    assert.ok(describedFiles.has(name), `SPDX is missing ${name}`);
  }

  process.stdout.write(`validated 8 deterministic authenticated release assets for ${tag}\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
