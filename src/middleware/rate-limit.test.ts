import test from 'node:test';
import assert from 'node:assert/strict';
import { SlidingWindowRateLimiter } from './rate-limit.js';

test('SlidingWindowRateLimiter enforces request quota and returns remaining count', () => {
  const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, maxRequests: 2 });

  let check = limiter.isAllowed('client-1');
  assert.equal(check.allowed, true);
  assert.equal(check.remaining, 1);

  check = limiter.isAllowed('client-1');
  assert.equal(check.allowed, true);
  assert.equal(check.remaining, 0);

  check = limiter.isAllowed('client-1');
  assert.equal(check.allowed, false);
  assert.equal(check.remaining, 0);
  assert.ok(check.resetMs > 0);
});
