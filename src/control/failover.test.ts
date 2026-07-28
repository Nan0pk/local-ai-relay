import assert from 'node:assert/strict';
import test from 'node:test';
import { BrowserFailure } from '../browser/types.js';
import { canSafelyFailOver } from './failover.js';

test('failover is allowed only for known pre-submission browser failures', () => {
  for (const kind of [
    'login_required',
    'captcha',
    'rate_limit',
    'quota_exhausted',
    'composer_disabled',
  ] as const) {
    assert.equal(canSafelyFailOver(new BrowserFailure(kind, kind)), true);
  }
  for (const kind of [
    'timeout',
    'cancelled',
    'generation_interrupted',
    'empty_response',
    'layout_changed',
  ] as const) {
    assert.equal(canSafelyFailOver(new BrowserFailure(kind, kind)), false);
  }
  assert.equal(canSafelyFailOver(new Error('unknown')), false);
});
