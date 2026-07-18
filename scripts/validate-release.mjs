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

const crcTable = Array.from({ length: 256 }, (_, number) => {
  let crc = number;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1;
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ crc >>> 8;
  return (crc ^ 0xffffffff) >>> 0;
}

function zipEntries(bytes) {
  assert.ok(bytes.length >= 22, 'truncated ZIP');
  const endOffset = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(endOffset), 0x06054b50, 'ZIP EOCD must end the archive');
  assert.equal(bytes.readUInt16LE(endOffset + 4), 0, 'multi-disk ZIP is unsupported');
  assert.equal(bytes.readUInt16LE(endOffset + 6), 0, 'multi-disk ZIP is unsupported');
  const diskEntries = bytes.readUInt16LE(endOffset + 8);
  const totalEntries = bytes.readUInt16LE(endOffset + 10);
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  assert.equal(bytes.readUInt16LE(endOffset + 20), 0, 'ZIP comments are unsupported');
  assert.equal(diskEntries, totalEntries, 'ZIP entry counts differ');
  assert.equal(centralOffset + centralSize, endOffset, 'ZIP central-directory bounds are invalid');

  const local = [];
  for (let offset = 0; offset < centralOffset;) {
    assert.ok(offset + 30 <= centralOffset, 'truncated ZIP local header');
    assert.equal(bytes.readUInt32LE(offset), 0x04034b50, 'invalid ZIP local header');
    assert.equal(bytes.readUInt16LE(offset + 6), 0x0800, 'unexpected ZIP flags');
    assert.equal(bytes.readUInt16LE(offset + 8), 0, 'zip entries must be stored deterministically');
    const crc = bytes.readUInt32LE(offset + 14);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const size = bytes.readUInt32LE(offset + 22);
    assert.equal(compressedSize, size, 'stored ZIP sizes differ');
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + size;
    assert.ok(dataEnd <= centralOffset, 'ZIP entry exceeds local-data bounds');
    const name = bytes.subarray(nameStart, nameStart + nameLength).toString();
    assert.ok(name && !name.startsWith('/') && !name.split('/').includes('..'), `unsafe ZIP path: ${name}`);
    assert.equal(crc32(bytes.subarray(dataStart, dataEnd)), crc, `ZIP CRC mismatch for ${name}`);
    local.push({ name, crc, size, offset, dataStart });
    offset = dataEnd;
  }
  assert.equal(local.length, totalEntries, 'ZIP local entry count mismatch');

  let cursor = centralOffset;
  for (const entry of local) {
    assert.ok(cursor + 46 <= endOffset, 'truncated ZIP central header');
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50, 'invalid ZIP central header');
    assert.equal(bytes.readUInt16LE(cursor + 8), 0x0800, 'central ZIP flags differ');
    assert.equal(bytes.readUInt16LE(cursor + 10), 0, 'central ZIP compression differs');
    assert.equal(bytes.readUInt32LE(cursor + 16), entry.crc, `central ZIP CRC differs for ${entry.name}`);
    assert.equal(bytes.readUInt32LE(cursor + 20), entry.size, `central ZIP compressed size differs for ${entry.name}`);
    assert.equal(bytes.readUInt32LE(cursor + 24), entry.size, `central ZIP size differs for ${entry.name}`);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    assert.equal(bytes.readUInt16LE(cursor + 34), 0, 'central ZIP disk differs');
    assert.equal(bytes.readUInt32LE(cursor + 42), entry.offset, `central ZIP offset differs for ${entry.name}`);
    const nameStart = cursor + 46;
    const next = nameStart + nameLength + extraLength + commentLength;
    assert.ok(next <= endOffset, 'ZIP central entry exceeds bounds');
    assert.equal(bytes.subarray(nameStart, nameStart + nameLength).toString(), entry.name, 'ZIP names differ');
    cursor = next;
  }
  assert.equal(cursor, endOffset, 'ZIP central-directory size mismatch');
  return local;
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
  const zipBytes = await readFile(join(first, windows));
  const zipEntriesChecked = zipEntries(zipBytes);
  const zip = zipEntriesChecked.map((entry) => entry.name).sort();
  assert.deepEqual(tar, zip, 'Linux and Windows payload contents differ');
  assert.ok(tar.includes('setup-linux.sh'), 'setup-linux.sh must be at archive root');
  assert.ok(zip.includes('setup-windows.ps1'), 'setup-windows.ps1 must be at archive root');
  assert.ok(tar.every((name) => !name.startsWith('/') && !name.split('/').includes('..')), 'unsafe archive path');
  const corruptedZip = Buffer.from(zipBytes);
  corruptedZip[zipEntriesChecked[0].dataStart] ^= 1;
  assert.throws(() => zipEntries(corruptedZip), /ZIP CRC mismatch/, 'corrupt ZIP must fail validation');
  assert.throws(() => zipEntries(zipBytes.subarray(0, -1)), /ZIP EOCD/, 'truncated ZIP must fail validation');

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
