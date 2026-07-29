import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dashboardAccessLines,
  needsRuntimeReplacement,
} from './open-dashboard.js';

test('dashboard access output makes the token and recovery path obvious', () => {
  const lines = dashboardAccessLines(
    'local-test-token',
    '/home/operator/.local-ai-relay/token',
    true,
  );
  const output = lines.join('\n');
  assert.match(output, /Local access token: local-test-token/);
  assert.match(output, /\/home\/operator\/\.local-ai-relay\/token/);
  assert.match(output, /npm run dashboard/);
  assert.match(output, /opened and unlocked/);
  assert.match(output, /Keep this token private/);
});

test('no-open dashboard output tells the operator where to paste the token', () => {
  const output = dashboardAccessLines('local-test-token', 'RELAY_API_TOKEN', false).join('\n');
  assert.match(output, /Paste the token above/);
});

test('source update replaces an older or unidentified running revision', () => {
  const current = 'a'.repeat(40);
  assert.equal(needsRuntimeReplacement(true, current, undefined), true);
  assert.equal(needsRuntimeReplacement(true, current, null), true);
  assert.equal(needsRuntimeReplacement(true, current, 'b'.repeat(40)), true);
  assert.equal(needsRuntimeReplacement(true, current, current), false);
  assert.equal(needsRuntimeReplacement(false, current, 'b'.repeat(40)), false);
});
