import { BaseBrowserDriver, type SiteConfig } from './base-driver.js';

/**
 * ChatGPT (chatgpt.com) webchat driver.
 *
 * Extends {@link BaseBrowserDriver} so it inherits the shared profile
 * lifecycle, serial queue, native Patchright input, completion-stability
 * detection, and the full {@link BrowserFailure} taxonomy (login_required,
 * captcha, rate_limit, quota_exhausted, composer_disabled,
 * generation_interrupted, layout_changed, timeout, cancelled,
 * empty_response).
 *
 * `forceClick` is set because ChatGPT's send button throttles under
 * Playwright actionability checks in headful/occluded contexts (e.g. systemd
 * services). The base driver's DOM-level enabled checks still guard the click.
 */
export class ChatGptPlaywrightDriver extends BaseBrowserDriver {
  protected config(): SiteConfig {
    return {
      name: 'chatgpt',
      url: 'https://chatgpt.com/',
      profileEnvVar: 'RELAY_BROWSER_PROFILE',
      composerSelectors: [
        'div#prompt-textarea',
        'div[contenteditable="true"]',
        '[data-testid="composer-text-input"]',
      ],
      sendButtonSelectors: [
        '[data-testid="send-button"]',
        'button[aria-label*="Send" i]',
        'button[type="submit"]',
      ],
      stopButtonSelectors: [
        '[data-testid="stop-button"]',
        'button[aria-label*="Stop" i]',
      ],
      assistantMessageSelectors: [
        '[data-message-author-role="assistant"]',
      ],
      loginUrlPattern: /\/login|\/auth\/|\/sign_?in/i,
      signInButtonLabels: ['Sign in', 'Log in', 'Get started'],
      rateLimitPattern: /rate limit|too many requests|you.?ve reached your (usage )?limit/i,
      quotaPattern: /out of quota|usage (limit|cap) reached|you.?ve reached your (daily|weekly|monthly) (message )?limit/i,
      forceClick: true,
    };
  }
}
