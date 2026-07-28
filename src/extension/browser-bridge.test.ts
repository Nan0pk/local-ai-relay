import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { BrowserExtensionBridge } from './browser-bridge.js';

const config = {
  name: 'example',
  label: 'Example',
  url: 'https://example.com/',
  composerSelectors: ['textarea'],
  sendButtonSelectors: ['button'],
  stopButtonSelectors: [],
  assistantMessageSelectors: ['article'],
  loginUrlPattern: { source: '/login', flags: 'i' },
  signInButtonLabels: ['Sign in'],
};

test('browser bridge dispatches to a registered extension and resolves its result', async () => {
  const previous = process.env.RELAY_BROWSER_BRIDGE_STATUS;
  const root = await mkdtemp(join(tmpdir(), 'relay-browser-bridge-'));
  process.env.RELAY_BROWSER_BRIDGE_STATUS = join(root, 'status.json');
  const bridge = new BrowserExtensionBridge();
  try {
    bridge.register('chrome-test');
    const resultPromise = bridge.dispatch({
      action: 'wait_until_ready',
      provider: 'example',
      config,
      timeout_ms: 1_000,
    });
    const command = await bridge.poll('chrome-test', 50);
    assert.equal(command?.action, 'wait_until_ready');
    bridge.complete('chrome-test', {
      command_id: command!.id,
      ok: true,
      ready: true,
    });
    assert.equal((await resultPromise).ready, true);
  } finally {
    bridge.reset();
    if (previous === undefined) delete process.env.RELAY_BROWSER_BRIDGE_STATUS;
    else process.env.RELAY_BROWSER_BRIDGE_STATUS = previous;
  }
});

test('browser bridge rejects a request that was already cancelled', async () => {
  const bridge = new BrowserExtensionBridge();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    bridge.dispatch({
      action: 'open_provider',
      provider: 'example',
      config,
      timeout_ms: 100,
    }, { signal: controller.signal }),
    /cancelled/i,
  );
});
