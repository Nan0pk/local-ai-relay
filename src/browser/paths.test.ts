import assert from 'node:assert/strict';
import test from 'node:test';
import { findSystemBrowser, systemBrowserCandidates } from './paths.js';

test('explicit executable is preferred on every supported platform', async () => {
  const previous = process.env.RELAY_BROWSER_EXECUTABLE;
  process.env.RELAY_BROWSER_EXECUTABLE = process.execPath;
  try {
    assert.equal(await findSystemBrowser(), process.execPath);
  } finally {
    if (previous === undefined) delete process.env.RELAY_BROWSER_EXECUTABLE;
    else process.env.RELAY_BROWSER_EXECUTABLE = previous;
  }
});

test('discovers normal Chrome installs on Windows and macOS without a browser download', () => {
  assert.deepEqual(
    systemBrowserCandidates('win32', {
      PROGRAMFILES: 'C:\\Program Files',
      LOCALAPPDATA: 'C:\\Users\\relay\\AppData\\Local',
    }).slice(0, 2),
    [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Users\\relay\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    ],
  );
  assert.equal(
    systemBrowserCandidates('darwin', { HOME: '/Users/relay' })[0],
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  );
});

test('discovers Fedora and other Linux browser commands through known paths and PATH', () => {
  const candidates = systemBrowserCandidates('linux', {
    PATH: '/home/person/.local/bin:/usr/local/bin:/usr/bin',
  });
  assert.equal(candidates[0], '/usr/bin/google-chrome-stable');
  assert.ok(candidates.includes('/opt/google/chrome/google-chrome'));
  assert.ok(candidates.includes('/home/person/.local/bin/google-chrome-stable'));
  assert.ok(candidates.includes('/usr/local/bin/chromium'));
  assert.equal(candidates.length, new Set(candidates).size);
});
