import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSensitive } from './redact.js';

test('redactSensitive redacts tokens and bearer headers', () => {
  const input = 'Authorization: Bearer 1234567890abcdef1234567890abcdef12345';
  const output = redactSensitive(input);
  assert.ok(output.includes('***REDACTED***'));
  assert.ok(!output.includes('1234567890abcdef1234567890abcdef12345'));
});
