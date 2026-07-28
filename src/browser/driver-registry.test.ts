import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findBrowserProvider,
  listBrowserProviderNames,
} from './driver-registry.js';

test('browser provider registry exposes all unique live-probe targets', () => {
  const names = listBrowserProviderNames();
  assert.equal(names.length, 12);
  assert.equal(new Set(names).size, names.length);
  for (const name of names) assert.equal(findBrowserProvider(name).name, name);
});

test('driver factories honor the headless environment default', async () => {
  const original = process.env.RELAY_BROWSER_HEADLESS;
  process.env.RELAY_BROWSER_HEADLESS = '1';
  const driver = findBrowserProvider('chatgpt').factory() as unknown as {
    options: { headless: boolean };
    close(): Promise<void>;
  };
  try {
    assert.equal(driver.options.headless, true);
  } finally {
    await driver.close();
    if (original === undefined) delete process.env.RELAY_BROWSER_HEADLESS;
    else process.env.RELAY_BROWSER_HEADLESS = original;
  }
});
