#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.cwd();
const argv = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, all) => {
    if (index % 2 === 0) pairs.push([value, all[index + 1]]);
    return pairs;
  }, []),
);
const output = resolve(root, argv['--output'] ?? '');
const tag = argv['--tag'];
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

if (!argv['--output'] || !tag) throw new Error('usage: build-release.mjs --output DIR --tag vX.Y.Z');
if (output === root) throw new Error('output directory must not be the repository root');
if (!/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(tag) || tag !== `v${packageJson.version}`) {
  throw new Error(`tag must exactly match package version v${packageJson.version}`);
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourceRoots = [
  '.env.example',
  'LICENSE',
  'bootstrap.ps1',
  'bootstrap.sh',
  'package-lock.json',
  'package.json',
  'setup-linux.sh',
  'setup-windows.cmd',
  'setup-windows.ps1',
  'tsconfig.json',
  'scripts',
  'src',
];

async function filesAt(path) {
  const absolute = join(root, path);
  const entries = await readdir(absolute, { withFileTypes: true }).catch(() => null);
  if (!entries) return [path];
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (path === 'scripts' && entry.name === 'build-release.mjs') continue;
    const child = posix.join(path, entry.name);
    if (entry.isDirectory()) files.push(...await filesAt(child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

const sourceFiles = (await Promise.all(sourceRoots.map(filesAt))).flat().sort();
const entries = await Promise.all(sourceFiles.map(async (name) => ({
  name,
  mode: /\.(?:sh|mjs)$/.test(name) ? 0o755 : 0o644,
  bytes: await readFile(join(root, name)),
})));

function octal(value, length) {
  return Buffer.from(value.toString(8).padStart(length - 1, '0') + '\0');
}

function tarHeader(entry) {
  const header = Buffer.alloc(512);
  header.write(entry.name, 0, 100, 'utf8');
  octal(entry.mode, 8).copy(header, 100);
  octal(0, 8).copy(header, 108);
  octal(0, 8).copy(header, 116);
  octal(entry.bytes.length, 12).copy(header, 124);
  octal(0, 12).copy(header, 136);
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  header.write('root', 265, 4, 'ascii');
  header.write('root', 297, 4, 'ascii');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  Buffer.from(checksum.toString(8).padStart(6, '0') + '\0 ').copy(header, 148);
  return header;
}

function createTar() {
  const parts = [];
  for (const entry of entries) {
    parts.push(tarHeader(entry), entry.bytes);
    const padding = (512 - entry.bytes.length % 512) % 512;
    if (padding) parts.push(Buffer.alloc(padding));
  }
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts), { level: 9, mtime: 0 });
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

function createZip() {
  const local = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const crc = crc32(entry.bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(entry.bytes.length, 18);
    header.writeUInt32LE(entry.bytes.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, entry.bytes);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(0x031e, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(0, 10);
    directory.writeUInt16LE(0, 12);
    directory.writeUInt16LE(0x21, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(entry.bytes.length, 20);
    directory.writeUInt32LE(entry.bytes.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(entry.mode << 16, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + name.length + entry.bytes.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const linuxName = `local-ai-relay-${tag}-linux-x64.tar.gz`;
const windowsName = `local-ai-relay-${tag}-windows-x64.zip`;
const assets = new Map([
  [linuxName, createTar()],
  [windowsName, createZip()],
  ['bootstrap.sh', await readFile(join(root, 'bootstrap.sh'))],
  ['bootstrap.ps1', await readFile(join(root, 'bootstrap.ps1'))],
  ['verify-release.mjs', await readFile(join(root, 'scripts', 'verify-release.mjs'))],
]);
const manifest = {
  schemaVersion: 1,
  repository: 'Nan0pk/local-ai-relay',
  version: tag,
  node: { minMajor: 22, maxMajor: 24 },
  artifacts: {
    'linux-x64': { name: linuxName, sha256: sha256(assets.get(linuxName)) },
    'windows-x64': { name: windowsName, sha256: sha256(assets.get(windowsName)) },
  },
};
assets.set('release-manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));

const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
const packages = Object.entries(lock.packages ?? {})
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([path, value], index) => ({
    SPDXID: `SPDXRef-Package-${index + 1}`,
    name: value.name ?? (path ? path.slice(path.lastIndexOf('node_modules/') + 13) : packageJson.name),
    versionInfo: value.version ?? 'NOASSERTION',
    downloadLocation: value.resolved ?? 'NOASSERTION',
    filesAnalyzed: false,
    licenseConcluded: 'NOASSERTION',
    licenseDeclared: value.license ?? 'NOASSERTION',
    copyrightText: 'NOASSERTION',
  }));
const sbomName = `local-ai-relay-${tag}.spdx.json`;
const sbom = {
  spdxVersion: 'SPDX-2.3',
  dataLicense: 'CC0-1.0',
  SPDXID: 'SPDXRef-DOCUMENT',
  name: `local-ai-relay-${tag}`,
  documentNamespace: `https://github.com/Nan0pk/local-ai-relay/releases/tag/${tag}#spdx`,
  creationInfo: { created: '1980-01-01T00:00:00Z', creators: ['Tool: scripts/build-release.mjs'] },
  packages,
  files: [...assets].sort(([left], [right]) => left.localeCompare(right)).map(([name, bytes], index) => ({
    SPDXID: `SPDXRef-File-${index + 1}`,
    fileName: name,
    checksums: [{ algorithm: 'SHA256', checksumValue: sha256(bytes) }],
    licenseConcluded: 'NOASSERTION',
    licenseInfoInFiles: ['NOASSERTION'],
    copyrightText: 'NOASSERTION',
  })),
};
assets.set(sbomName, Buffer.from(`${JSON.stringify(sbom, null, 2)}\n`));

for (const [name, bytes] of assets) await writeFile(join(output, name), bytes);
const sums = [...assets]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([name, bytes]) => `${sha256(bytes)}  ${name}`)
  .join('\n');
await writeFile(join(output, 'SHA256SUMS'), `${sums}\n`);
process.stdout.write(`built ${assets.size + 1} deterministic assets for ${tag}\n`);
