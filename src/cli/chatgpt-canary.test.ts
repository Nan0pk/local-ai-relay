import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { hermesVersionFrom, isExactMarker, sessionIdFrom, streamedTextFromSse, writeHermesConfig } from './chatgpt-canary.js';

test('accepts only an exact normalized marker', () => {
  assert.equal(isExactMarker('  READY\n', 'READY'), true);
  assert.equal(isExactMarker('I cannot say READY', 'READY'), false);
  assert.equal(isExactMarker('READY extra', 'READY'), false);
});

test('extracts Hermes session ids from quiet chat output', () => {
  assert.equal(sessionIdFrom('warning\nsession_id: abc_123\nreply'), 'abc_123');
  assert.equal(sessionIdFrom('no session'), undefined);
});

test('reconstructs only completed SSE content', () => {
  const stream = [
    'data: {"choices":[{"delta":{"content":"RELAY_"}}]}',
    '',
    'data: {"choices":[{"delta":{"content":"STREAM_OK"}}]}',
    '',
    'data: [DONE]',
    '',
  ].join('\n');
  assert.equal(streamedTextFromSse(stream), 'RELAY_STREAM_OK');
  assert.equal(streamedTextFromSse('data: {"choices":[{"delta":{"content":"RELAY_STREAM_OK"}}]}\n'), undefined);
});

test('sanitizes Hermes version evidence', () => {
  assert.equal(hermesVersionFrom('Hermes Agent v0.18.2\nupstream a1b2c3d4\n/home/victus/.hermes'), 'v0.18.2 a1b2c3d4');
  assert.equal(hermesVersionFrom('/home/victus/.hermes'), 'unknown');
});

test('creates an isolated one-tool Hermes configuration', async () => {
  const home = await mkdtemp(join(tmpdir(), 'relay-hermes-canary-test-'));
  try {
    const countPath = await writeHermesConfig(home, 'http://127.0.0.1:9999/v1', 'test-token');
    const config = await readFile(join(home, 'config.yaml'), 'utf8');
    const plugin = await readFile(join(home, 'plugins', 'relay_canary', '__init__.py'), 'utf8');
    assert.equal(countPath, join(home, 'relay-canary-tool-count'));
    assert.match(config, /plugins:\n  enabled:\n    - relay_canary/);
    assert.match(config, /cli:\n    - relay_canary\n    - no_mcp/);
    assert.match(plugin, /relay_canary_readonly/);
    assert.match(plugin, /SAFE_TOOL_RESULT_OK/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
