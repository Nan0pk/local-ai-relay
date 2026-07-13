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
