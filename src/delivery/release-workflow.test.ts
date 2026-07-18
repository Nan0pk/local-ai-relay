import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const workflows = join(process.cwd(), '.github', 'workflows');

test('CI pins actions and runs delivery tests on Ubuntu and Windows', async () => {
  const ci = await readFile(join(workflows, 'ci.yml'), 'utf8');
  assert.match(ci, /os: \[ubuntu-latest, windows-latest\]/);
  assert.match(ci, /run: npm run test:delivery/);
  assert.match(ci, /run: node scripts\/validate-release\.mjs/);
  assert.doesNotMatch(ci, /uses:\s+\S+@(?![a-f0-9]{40}(?:\s|$))/);
});

test('release workflow publishes the authenticated stable-tag contract', async () => {
  const release = await readFile(join(workflows, 'release.yml'), 'utf8');
  assert.match(release, /tags:\s*\['v\*'\]/);
  assert.match(release, /refs\/tags\/v/);
  assert.match(release, /v\$\{version\}/);
  assert.match(release, /node-version:\s*22/);
  assert.match(release, /npm run test:delivery/);
  assert.match(release, /node scripts\/validate-release\.mjs/);
  assert.doesNotMatch(release, /uses:\s+\S+@(?![a-f0-9]{40}(?:\s|$))/);

  for (const asset of [
    'release-manifest.json',
    'verify-release.mjs',
    'local-ai-relay-${tag}-linux-x64.tar.gz',
    'local-ai-relay-${tag}-windows-x64.zip',
    'bootstrap.sh',
    'bootstrap.ps1',
    'SHA256SUMS',
    'local-ai-relay-${tag}.spdx.json',
  ]) {
    assert.ok(release.includes(asset), `release workflow must name ${asset}`);
  }

  assert.match(release, /actions\/attest-build-provenance@[a-f0-9]{40}/);
  assert.match(release, /subject-path:\s*release\/\*/);
  assert.match(release, /gh release create/);
  assert.match(release, /scripts\/build-release\.mjs/);
  assert.ok(release.indexOf('node scripts/validate-release.mjs') < release.indexOf('actions/attest-build-provenance@'));
  assert.ok(release.indexOf('node scripts/validate-release.mjs') < release.indexOf('gh release create'));
});
