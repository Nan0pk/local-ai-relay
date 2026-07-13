import { BaseBrowserDriver, type SiteConfig } from './base-driver.js';

/**
 * Gemini (gemini.google.com) webchat driver.
 *
 * All site-specific selectors and detection logic live here; the adapter
 * treats this as an opaque BrowserChatDriver. The shared lifecycle,
 * queue, native input, and stability detection come from
 * {@link BaseBrowserDriver}.
 */
export class GeminiPlaywrightDriver extends BaseBrowserDriver {
  protected config(): SiteConfig {
    return {
      name: 'gemini',
      url: 'https://gemini.google.com/app',
      profileEnvVar: 'RELAY_BROWSER_PROFILE_GEMINI',
      composerSelectors: [
        'rich-textarea div[contenteditable="true"]',
        'div[contenteditable="true"][aria-label*="Prompt" i]',
        'div[contenteditable="true"]',
      ],
      sendButtonSelectors: [
        'button[aria-label*="Send" i]',
        'button[aria-label*="Submit" i]',
        'button.send-button',
      ],
      stopButtonSelectors: [
        'button[aria-label*="Stop" i]',
        'button.stop-button',
      ],
      assistantMessageSelectors: [
        'message-content[model-response]',
        'model-response message-content',
        'div[class*="model-response"] div[class*="message-content"]',
      ],
      loginUrlPattern: /accounts\.google\.com|\/signin|\/login|\/v3\/signin/i,
      signInButtonLabels: ['Sign in', 'Log in', 'Use Gemini'],
      rateLimitPattern: /rate limit|too many requests/i,
      quotaPattern: /out of quota|usage (limit|cap) reached|you.?ve used all your/i,
    };
  }
}
