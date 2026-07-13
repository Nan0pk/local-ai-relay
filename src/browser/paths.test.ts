import assert from 'node:assert/strict';
import test from 'node:test';
import { findSystemBrowser } from './paths.js';

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
