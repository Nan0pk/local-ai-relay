import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSensitive } from './redact.js';

test('redactSensitive redacts tokens and bearer headers', () => {
  const input = 'Authorization: Bearer sk-live-not-hex and "token": "my-secret-token" password=hunter2 session=secret';
  const output = redactSensitive(input);
  assert.ok(output.includes('Bearer ***REDACTED***'));
  assert.ok(!output.includes('sk-live-not-hex'));
  assert.ok(!output.includes('my-secret-token'));
  assert.ok(!output.includes('hunter2'));
  assert.ok(!output.includes('session=secret'));
});
