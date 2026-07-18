#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

function fail(message) {
  throw new Error(message);
}

function args(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) fail('usage: verify-release.mjs --manifest FILE --artifact FILE --version vX.Y.Z --platform PLATFORM');
    result[key.slice(2)] = value;
  }
  for (const key of ['manifest', 'artifact', 'version', 'platform']) {
    if (!result[key]) fail(`missing --${key}`);
  }
  return result;
}

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object`);
  return value;
}

async function main() {
  const input = args(process.argv.slice(2));
  if (!/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(input.version)) {
    fail('version must be an explicit stable vX.Y.Z tag');
  }
  if (!['linux-x64', 'windows-x64'].includes(input.platform)) fail(`unsupported platform: ${input.platform}`);

  let manifest;
  try {
    manifest = object(JSON.parse(await readFile(input.manifest, 'utf8')), 'manifest');
  } catch (error) {
    fail(`malformed manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (manifest.schemaVersion !== 1) fail('unsupported manifest schemaVersion');
  if (manifest.repository !== 'Nan0pk/local-ai-relay') fail('manifest repository must be Nan0pk/local-ai-relay');
  if (manifest.version !== input.version) fail(`version mismatch: requested ${input.version}, manifest has ${String(manifest.version)}`);

  const node = object(manifest.node, 'manifest node support');
  if (!Number.isInteger(node.minMajor) || !Number.isInteger(node.maxMajor) || node.minMajor > node.maxMajor) {
    fail('manifest node support range is malformed');
  }
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < node.minMajor || nodeMajor > node.maxMajor) {
    fail(`unsupported Node.js ${nodeMajor}; release supports ${node.minMajor}-${node.maxMajor}`);
  }

  const artifacts = object(manifest.artifacts, 'manifest artifacts');
  const artifact = object(artifacts[input.platform], `manifest artifact ${input.platform}`);
  const extension = input.platform === 'linux-x64' ? 'tar.gz' : 'zip';
  const expectedName = `local-ai-relay-${input.version}-${input.platform}.${extension}`;
  if (artifact.name !== expectedName || basename(input.artifact) !== expectedName) {
    fail(`artifact name mismatch: expected ${expectedName}`);
  }
  if (typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(artifact.sha256)) {
    fail('artifact sha256 is malformed');
  }
  const actual = createHash('sha256').update(await readFile(input.artifact)).digest('hex');
  if (actual !== artifact.sha256) fail(`checksum mismatch: expected ${artifact.sha256}, got ${actual}`);
  process.stdout.write(`verified ${input.version} ${input.platform} ${artifact.name}\n`);
}

main().catch((error) => {
  process.stderr.write(`FAIL: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
