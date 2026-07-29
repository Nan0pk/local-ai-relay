import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ExistingBrowserDriver } from './extension-driver.js';
import { browserExtensionBridge } from '../extension/browser-bridge.js';

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

test('existing-browser login wait survives a login-required poll and then becomes ready', async () => {
  const previous = process.env.RELAY_BROWSER_BRIDGE_STATUS;
  const root = await mkdtemp(join(tmpdir(), 'relay-extension-driver-'));
  process.env.RELAY_BROWSER_BRIDGE_STATUS = join(root, 'status.json');
  try {
    browserExtensionBridge.register('chrome-driver-test');
    const driver = new ExistingBrowserDriver(config);
    const ready = driver.waitUntilReady(2_000);

    const first = await browserExtensionBridge.poll('chrome-driver-test', 50);
    browserExtensionBridge.complete('chrome-driver-test', {
      command_id: first!.id,
      ok: false,
      error: { kind: 'login_required', message: 'Sign in.' },
    });

    const second = await browserExtensionBridge.poll('chrome-driver-test', 50);
    browserExtensionBridge.complete('chrome-driver-test', {
      command_id: second!.id,
      ok: true,
      ready: true,
    });
    await ready;
    assert.equal(second?.action, 'wait_until_ready');
  } finally {
    browserExtensionBridge.reset();
    if (previous === undefined) delete process.env.RELAY_BROWSER_BRIDGE_STATUS;
    else process.env.RELAY_BROWSER_BRIDGE_STATUS = previous;
  }
});

test('background existing-browser checks mark bridge commands as non-activating', async () => {
  const previous = process.env.RELAY_BROWSER_BRIDGE_STATUS;
  const root = await mkdtemp(join(tmpdir(), 'relay-extension-driver-background-'));
  process.env.RELAY_BROWSER_BRIDGE_STATUS = join(root, 'status.json');
  try {
    browserExtensionBridge.register('chrome-background-test');
    const driver = new ExistingBrowserDriver(config, { background: true });
    const opening = driver.openForLogin();
    const command = await browserExtensionBridge.poll('chrome-background-test', 50);
    assert.equal(command?.action, 'open_provider');
    assert.equal(command?.background, true);
    browserExtensionBridge.complete('chrome-background-test', {
      command_id: command!.id,
      ok: true,
    });
    await opening;
  } finally {
    browserExtensionBridge.reset();
    if (previous === undefined) delete process.env.RELAY_BROWSER_BRIDGE_STATUS;
    else process.env.RELAY_BROWSER_BRIDGE_STATUS = previous;
  }
});
