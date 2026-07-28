import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCanaryEnvironment, runChatGptCanary } from './chatgpt-canary.js';
import { loadPersistedCapability } from '../capabilities/evidence-store.js';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

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
  assert.match(result.message, /5 consecutive canary missions passed in mock simulation/);
  assert.match(result.message, /live readiness was not persisted/);
});

test('live canary performs real driver submissions before persisting readiness', async () => {
  const path = join(tmpdir(), `chatgpt-canary-${crypto.randomUUID()}`, 'capabilities.json');
  const originalHeadless = process.env.RELAY_BROWSER_HEADLESS;
  process.env.RELAY_BROWSER_HEADLESS = '1';
  let sends = 0;
  const driver = {
    async openForLogin() {},
    async waitUntilReady() {},
    async send() {
      sends += 1;
      return { text: 'ORANGE', conversationUrl: 'https://chatgpt.com/c/test' };
    },
    async close() {},
  };

  try {
    const result = await runChatGptCanary({
      consecutiveTarget: 3,
      driver,
      capabilityStorePath: path,
    });
    assert.equal(result.ok, true);
    assert.equal(sends, 3);
    assert.equal(loadPersistedCapability('browser-chatgpt', path)?.status, 'ready');
  } finally {
    if (originalHeadless === undefined) delete process.env.RELAY_BROWSER_HEADLESS;
    else process.env.RELAY_BROWSER_HEADLESS = originalHeadless;
    await rm(dirname(path), { recursive: true, force: true });
  }
});
