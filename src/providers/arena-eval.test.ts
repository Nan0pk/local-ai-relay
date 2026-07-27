import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePairwise } from '../eval/arena-eval.js';

test('evaluatePairwise executes mock pairwise comparison', async () => {
  process.env.RELAY_MOCK_BROWSER = 'true';
  const result = await evaluatePairwise('Hello world');
  assert.equal(result.prompt, 'Hello world');
  assert.equal(result.modelA, 'browser-chatgpt-free');
  assert.equal(result.modelB, 'browser-claude-free');
  assert.ok(result.timestamp);
});
