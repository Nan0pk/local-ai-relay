import assert from 'node:assert/strict';
import test from 'node:test';
import { findSystemBrowser } from './paths.js';

test('explicit executable is preferred for Fedora/system-browser operation', async () => {
  const previous = process.env.RELAY_BROWSER_EXECUTABLE;
  process.env.RELAY_BROWSER_EXECUTABLE = '/bin/sh';
  try {
    assert.equal(await findSystemBrowser(), '/bin/sh');
  } finally {
    if (previous === undefined) delete process.env.RELAY_BROWSER_EXECUTABLE;
    else process.env.RELAY_BROWSER_EXECUTABLE = previous;
  }
});
