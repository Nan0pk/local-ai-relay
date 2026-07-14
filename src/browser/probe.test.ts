import assert from 'node:assert/strict';
import test from 'node:test';
import { BrowserFailure } from './types.js';
import { classifyProbeError } from './probe-utils.js';

test('classifyProbeError maps BrowserFailure kinds correctly', () => {
  assert.equal(classifyProbeError(new BrowserFailure('login_required', 'msg')), 'login_required');
  assert.equal(classifyProbeError(new BrowserFailure('captcha', 'msg')), 'blocked_by_anti_bot');
  assert.equal(classifyProbeError(new BrowserFailure('rate_limit', 'msg')), 'rate_limited');
  assert.equal(classifyProbeError(new BrowserFailure('quota_exhausted', 'msg')), 'quota_exhausted');
  assert.equal(classifyProbeError(new BrowserFailure('layout_changed', 'msg')), 'layout_changed');
  assert.equal(classifyProbeError(new BrowserFailure('timeout', 'msg')), 'timeout');
  assert.equal(classifyProbeError(new BrowserFailure('empty_response', 'msg')), 'layout_changed');
});

test('classifyProbeError maps raw Error messages correctly', () => {
  assert.equal(classifyProbeError(new Error('Browser launch failed')), 'browser_launch_failure');
  assert.equal(classifyProbeError(new Error('executable not found')), 'browser_launch_failure');
  assert.equal(classifyProbeError(new Error('navigation timed out after 30000ms')), 'timeout');
  assert.equal(classifyProbeError(new Error('cloudflare challenge page detected')), 'blocked_by_anti_bot');
  assert.equal(classifyProbeError(new Error('provider is not available on this region')), 'unsupported');
  assert.equal(classifyProbeError(new Error('random unknown error')), 'unsupported');
});
