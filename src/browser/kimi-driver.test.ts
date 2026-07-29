import assert from 'node:assert/strict';
import test from 'node:test';
import type { SiteConfig } from './base-driver.js';
import { KimiPlaywrightDriver } from './kimi-driver.js';

class TestableKimiDriver extends KimiPlaywrightDriver {
  getConfig(): SiteConfig {
    return this.config();
  }
}

test('Kimi driver uses the current icon send control and post-send login modal', () => {
  const cfg = new TestableKimiDriver({ headless: true }).getConfig();
  assert.equal(cfg.url, 'https://www.kimi.com/');
  assert.ok(cfg.sendButtonSelectors.includes('div.send-button-container'));
  assert.ok(cfg.loginRequiredSelectors?.includes('.login-modal-mask'));
});
