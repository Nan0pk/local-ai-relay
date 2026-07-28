import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('container defaults stay private and compose requires an operator-supplied token', async () => {
  const [dockerfile, compose] = await Promise.all([
    readFile('Dockerfile', 'utf8'),
    readFile('docker-compose.yml', 'utf8'),
  ]);
  assert.match(dockerfile, /ENV HOST=127\.0\.0\.1/);
  assert.doesNotMatch(dockerfile, /ENV RELAY_UNSAFE_BIND_ACK/);
  assert.match(compose, /127\.0\.0\.1:8787:8787/);
  assert.match(compose, /HOST=0\.0\.0\.0/);
  assert.match(compose, /RELAY_UNSAFE_BIND_ACK=1/);
  assert.match(compose, /RELAY_API_TOKEN=\$\{RELAY_API_TOKEN:\?/);
  assert.doesNotMatch(compose, /local-ai-relay-token/);
  assert.match(compose, /healthcheck:/);
});
