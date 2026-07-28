import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  getBrowserBridgeStatus,
  recordBrowserBridgeHeartbeat,
} from './bridge-status.js';

test('browser bridge heartbeat reports connected and expires safely', async () => {
  const previous = process.env.RELAY_BROWSER_BRIDGE_STATUS;
  const root = await mkdtemp(join(tmpdir(), 'relay-bridge-'));
  process.env.RELAY_BROWSER_BRIDGE_STATUS = join(root, 'status.json');
  try {
    assert.equal(getBrowserBridgeStatus().installed, false);
    recordBrowserBridgeHeartbeat('extension-test');
    const current = getBrowserBridgeStatus();
    assert.equal(current.connected, true);
    assert.equal(current.session_id, 'extension-test');
    assert.equal(getBrowserBridgeStatus(Date.now() + 300_000).connected, false);
  } finally {
    if (previous === undefined) delete process.env.RELAY_BROWSER_BRIDGE_STATUS;
    else process.env.RELAY_BROWSER_BRIDGE_STATUS = previous;
  }
});
