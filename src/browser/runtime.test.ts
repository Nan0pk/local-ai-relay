import assert from 'node:assert/strict';
import test from 'node:test';
import { browserLaunchTarget } from './runtime.js';

test('uses Patchright Chrome channel for an auto-detected Chrome install', () => {
  assert.deepEqual(browserLaunchTarget(undefined, '/usr/bin/google-chrome-stable'), {
    channel: 'chrome',
  });
});

test('honors an explicit executable instead of replacing it with a channel', () => {
  assert.deepEqual(browserLaunchTarget('/opt/chrome/custom', '/usr/bin/google-chrome-stable'), {
    executablePath: '/opt/chrome/custom',
  });
});

test('keeps Chromium and managed-browser fallbacks', () => {
  assert.deepEqual(browserLaunchTarget(undefined, '/usr/bin/chromium'), {
    executablePath: '/usr/bin/chromium',
  });
  assert.deepEqual(browserLaunchTarget(undefined, undefined), {});
});
