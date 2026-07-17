import assert from 'node:assert/strict';
import test from 'node:test';
import { BaseBrowserDriver, type SiteConfig } from './base-driver.js';
import { MetaPlaywrightDriver } from './meta-driver.js';

class TestableMetaDriver extends MetaPlaywrightDriver {
  getConfig(): SiteConfig {
    return this.config();
  }
}

test('Meta driver uses the authenticated composer, send, and response test IDs', () => {
  const driver = new TestableMetaDriver({ headless: true });
  const cfg = driver.getConfig();

  assert.ok(driver instanceof BaseBrowserDriver);
  assert.equal(cfg.url, 'https://www.meta.ai/');
  assert.equal(cfg.profileEnvVar, 'RELAY_BROWSER_PROFILE_META');
  assert.equal(cfg.composerSelectors[0], '[data-testid="composer-input"][contenteditable="true"]');
  assert.ok(cfg.sendButtonSelectors.includes('[data-testid="composer-send-button"]'));
  assert.ok(cfg.assistantMessageSelectors.includes('[data-testid="assistant-message"]'));
});
