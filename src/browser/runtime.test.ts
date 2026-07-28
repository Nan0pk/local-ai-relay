import assert from 'node:assert/strict';
import test from 'node:test';
import { browserLaunchTarget, ensureBrowserInstalled } from './runtime.js';

test('uses Patchright Chrome channel for an auto-detected Chrome install', () => {
  assert.deepEqual(browserLaunchTarget(undefined, '/usr/bin/google-chrome-stable'), {
    channel: 'chrome',
  });
  assert.deepEqual(browserLaunchTarget(undefined, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'), {
    channel: 'chrome',
  });
  assert.deepEqual(browserLaunchTarget(undefined, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'), {
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

test('automatically installs managed Chromium when no system browser exists', async () => {
  let installed = false;
  let announcedDestination: string | undefined;
  const result = await ensureBrowserInstalled({
    findSystem: async () => undefined,
    managedExecutablePath: async () => '/managed/chromium',
    isExecutable: async () => installed,
    installManaged: async () => { installed = true; },
    onInstallStart: (destination) => { announcedDestination = destination; },
  });
  assert.deepEqual(result, {
    source: 'managed',
    executablePath: '/managed/chromium',
    installedNow: true,
  });
  assert.ok(announcedDestination);
});

test('uses installed Chrome without downloading managed Chromium', async () => {
  let installCalled = false;
  const result = await ensureBrowserInstalled({
    findSystem: async () => '/usr/bin/google-chrome-stable',
    installManaged: async () => { installCalled = true; },
  });
  assert.deepEqual(result, {
    source: 'system',
    executablePath: '/usr/bin/google-chrome-stable',
    installedNow: false,
  });
  assert.equal(installCalled, false);
});
