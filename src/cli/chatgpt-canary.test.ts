import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCanaryEnvironment, runChatGptCanary } from './chatgpt-canary.js';

test('checkCanaryEnvironment catches missing DISPLAY on Linux when not headless', () => {
  const result = checkCanaryEnvironment({ DISPLAY: '' });
  if (process.platform === 'linux') {
    assert.equal(result.ok, false);
    assert.equal(result.failureClass, 'no_display');
  } else {
    assert.equal(result.ok, true);
  }
});

test('runChatGptCanary executes 5 consecutive missions in mock mode', async () => {
  const result = await runChatGptCanary({ mockMode: true, consecutiveTarget: 5 });
  assert.equal(result.ok, true);
  assert.match(result.message, /5 consecutive canary missions passed/);
});
