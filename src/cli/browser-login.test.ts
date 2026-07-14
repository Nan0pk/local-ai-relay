import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProvider } from './browser-login.js';

test('parseProvider parses command line args correctly', () => {
  assert.equal(parseProvider([]), 'chatgpt');
  assert.equal(parseProvider(['claude']), 'claude');
  assert.equal(parseProvider(['--provider', 'gemini']), 'gemini');
  assert.equal(parseProvider(['--provider', 'grok', 'extra']), 'grok');
  assert.equal(parseProvider(['-flag', 'gemini']), 'chatgpt');
});
