import test from 'node:test';
import assert from 'node:assert/strict';
import { executeControlVerb, isKillSwitchActive } from './provider-control.js';
import { capabilityTracker } from '../capabilities/tracker.js';

test('isKillSwitchActive detects kill switch env variable', () => {
  assert.equal(isKillSwitchActive({ RELAY_BROWSER_KILL_SWITCH: '1' }), true);
  assert.equal(isKillSwitchActive({ RELAY_BROWSER_KILL_SWITCH: 'true' }), true);
  assert.equal(isKillSwitchActive({}), false);
});

test('executeControlVerb handles enable, disable, and status', async () => {
  capabilityTracker.register('browser-test', 'installed', 'Initial');

  let res = await executeControlVerb('disable', 'browser-test', {});
  assert.equal(res.ok, true);
  assert.equal(capabilityTracker.getStatus('browser-test')?.status, 'disabled');

  res = await executeControlVerb('enable', 'browser-test', {});
  assert.equal(res.ok, true);
  assert.equal(capabilityTracker.getStatus('browser-test')?.status, 'installed');
});

test('executeControlVerb blocks operations when kill switch is active', async () => {
  const res = await executeControlVerb('enable', 'browser-test', { RELAY_BROWSER_KILL_SWITCH: '1' });
  assert.equal(res.ok, false);
  assert.match(res.message, /kill switch is active/i);
});
