import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatGptPlaywrightDriver } from './chatgpt-driver.js';
import { BaseBrowserDriver } from './base-driver.js';
import type { SiteConfig } from './base-driver.js';

/**
 * Regression test for the ChatGPT driver migration to BaseBrowserDriver.
 *
 * The ChatGPT driver was previously a standalone class that threw plain
 * Error and had no login/captcha/rate-limit detection. It now extends
 * BaseBrowserDriver and inherits the full BrowserFailure taxonomy. These
 * tests verify the migration without launching a real browser.
 */

/** Test subclass that exposes the protected config() for verification. */
class TestableChatGptDriver extends ChatGptPlaywrightDriver {
  getConfig(): SiteConfig {
    return this.config();
  }
}

test('ChatGPT driver extends BaseBrowserDriver', () => {
  const driver = new ChatGptPlaywrightDriver({ headless: true });
  assert.ok(driver instanceof BaseBrowserDriver,
    'ChatGptPlaywrightDriver must extend BaseBrowserDriver so it inherits BrowserFailure taxonomy');
});

test('ChatGPT driver config has correct site URL and profile env var', () => {
  const driver = new TestableChatGptDriver({ headless: true });
  const cfg = driver.getConfig();
  assert.equal(cfg.name, 'chatgpt');
  assert.equal(cfg.url, 'https://chatgpt.com/');
  assert.equal(cfg.profileEnvVar, 'RELAY_BROWSER_PROFILE');
});

test('ChatGPT driver config has layered composer selectors including the primary div#prompt-textarea', () => {
  const driver = new TestableChatGptDriver({ headless: true });
  const cfg = driver.getConfig();
  assert.ok(cfg.composerSelectors.length >= 2, 'composer should have layered fallback selectors');
  assert.equal(cfg.composerSelectors[0], 'div#prompt-textarea');
});

test('ChatGPT driver config has send and stop button selectors', () => {
  const driver = new TestableChatGptDriver({ headless: true });
  const cfg = driver.getConfig();
  assert.ok(cfg.sendButtonSelectors.some((s) => s.includes('send-button')));
  assert.ok(cfg.stopButtonSelectors.some((s) => s.includes('stop-button')));
});

test('ChatGPT driver config has assistant message selector for data-message-author-role', () => {
  const driver = new TestableChatGptDriver({ headless: true });
  const cfg = driver.getConfig();
  assert.ok(cfg.assistantMessageSelectors.some((s) => s.includes('data-message-author-role')));
});

test('ChatGPT driver config has login detection patterns', () => {
  const driver = new TestableChatGptDriver({ headless: true });
  const cfg = driver.getConfig();
  assert.ok(cfg.loginUrlPattern instanceof RegExp);
  assert.ok(cfg.loginUrlPattern.test('/login'));
  assert.ok(cfg.signInButtonLabels.length > 0);
});

test('ChatGPT driver config has rate limit and quota patterns', () => {
  const driver = new TestableChatGptDriver({ headless: true });
  const cfg = driver.getConfig();
  // ChatGPT says "You've reached your limit" (with apostrophe).
  assert.ok(cfg.rateLimitPattern?.test("You've reached your limit"));
  assert.ok(cfg.rateLimitPattern?.test('rate limit'));
  assert.ok(cfg.quotaPattern?.test('out of quota'));
});

test('ChatGPT driver config preserves forceClick for headful systemd compatibility', () => {
  const driver = new TestableChatGptDriver({ headless: true });
  const cfg = driver.getConfig();
  assert.equal(cfg.forceClick, true,
    'forceClick must be true to preserve the known-working Fedora systemd behavior');
});

test('ChatGPT driver constructor accepts the same options shape as before migration', () => {
  // driver-registry.ts calls: new ChatGptPlaywrightDriver({ headless: false })
  // This must continue to work.
  const driver = new ChatGptPlaywrightDriver({ headless: false });
  assert.ok(driver instanceof BaseBrowserDriver);
});
